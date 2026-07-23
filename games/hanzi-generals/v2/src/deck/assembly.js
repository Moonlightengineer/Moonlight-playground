import {
  getUnitAt,
  isValidCell,
  placeUnit,
  removeUnit,
} from '../board/board.js';
import { RECIPES } from '../../data/recipes.js';
import { GENERALS } from '../../data/generals.js';
import { gameEvent } from '../core/events.js';

function recipeKey(symbols) {
  return [...symbols]
    .sort((a, b) => a.localeCompare(b, 'zh-Hant'))
    .join('|');
}

function cellKey({ column, row }) {
  return `${column},${row}`;
}

function parseCell(key) {
  const [column, row] = key.split(',').map(Number);
  return { column, row };
}

function areNeighborCells(a, b) {
  return Math.abs(a.column - b.column) + Math.abs(a.row - b.row) === 1;
}

export function findRecipe(symbols, recipes = RECIPES) {
  const wanted = recipeKey(symbols);
  return recipes.find((recipe) => recipeKey(recipe.symbols) === wanted) ?? null;
}

function fail(game, code, message) {
  return { ok: false, state: game, events: [], error: { code, message } };
}

function boardCardIds(game) {
  return Object.values(game.boardCards ?? {});
}

function cardsForSource(game, source) {
  if (!source || !Array.isArray(source.cardIds) || source.cardIds.length === 0) {
    return { ok: false, code: 'EMPTY_ASSEMBLY', message: '請先揀選要合成嘅字牌。' };
  }

  const unique = new Set(source.cardIds);
  if (unique.size !== source.cardIds.length) {
    return { ok: false, code: 'DUPLICATE_CARD_SOURCE', message: '同一張字牌不可重複使用。' };
  }

  if (source.type === 'camp') {
    if (source.cardIds.some((id) => !game.camp.cardIds.includes(id))) {
      return { ok: false, code: 'INVALID_CAMP_SOURCE', message: '軍營字牌已改變。' };
    }
  } else if (source.type === 'hand') {
    if (source.cardIds.some((id) => !game.deck.hand.some((card) => card.id === id))) {
      return { ok: false, code: 'INVALID_HAND_SOURCE', message: '手牌已改變。' };
    }
  } else if (source.type === 'board') {
    const onBoard = new Set(boardCardIds(game));
    if (source.cardIds.some((id) => !onBoard.has(id))) {
      return { ok: false, code: 'INVALID_BOARD_SOURCE', message: '戰陣字牌已改變。' };
    }
  } else {
    return { ok: false, code: 'INVALID_ASSEMBLY_SOURCE', message: '不支援嘅合成來源。' };
  }

  const cards = source.cardIds.map((id) => game.cardsById[id]);
  if (cards.some((card) => !card)) {
    return { ok: false, code: 'MISSING_CARD', message: '有字牌資料遺失。' };
  }
  return { ok: true, cards };
}

function boardCardsWithout(boardCards, cardIds) {
  const remove = new Set(cardIds);
  return Object.fromEntries(
    Object.entries(boardCards ?? {}).filter(([, cardId]) => !remove.has(cardId)),
  );
}

export function confirmAssembly(game, source, target) {
  const sourceResult = cardsForSource(game, source);
  if (!sourceResult.ok) return fail(game, sourceResult.code, sourceResult.message);

  const recipe = findRecipe(sourceResult.cards.map(({ symbol }) => symbol));
  if (!recipe) return fail(game, 'NO_RECIPE', '呢組字未能合成單位。');
  if (game.unlockedRecipes && !game.unlockedRecipes.includes(recipe.id)) {
    return fail(game, 'RECIPE_LOCKED', '呢個配方尚未解鎖。');
  }

  const definition = GENERALS.find(({ id }) => id === recipe.outputId);
  if (!definition) return fail(game, 'MISSING_UNIT_DEFINITION', '合成結果資料不存在。');

  const duplicateNamedGeneral = definition.kind === 'general'
    && Object.values(game.board.units).some((unit) => (
      unit.definitionId === definition.id && unit.hp > 0
    ));
  if (duplicateNamedGeneral) {
    return fail(
      game,
      'DUPLICATE_NAMED_GENERAL',
      `${definition.name}仍然在陣，唔可以重複召喚。`,
    );
  }

  try {
    const unitId = `unit-${game.nextUnitId}`;
    const unit = {
      id: unitId,
      definitionId: definition.id,
      kind: definition.kind,
      hp: definition.maxHp,
      maxHp: definition.maxHp,
      cooldown: 0,
      evolution: game.evolutions?.[definition.id] ?? null,
      statuses: [],
    };
    const board = placeUnit(game.board, unit, target);
    const deployed = [
      ...game.deck.deployed,
      { unitId, cardIds: [...source.cardIds] },
    ];

    return {
      ok: true,
      state: {
        ...game,
        board,
        boardCards: boardCardsWithout(game.boardCards, source.cardIds),
        camp: {
          ...game.camp,
          cardIds: game.camp.cardIds.filter((id) => !source.cardIds.includes(id)),
        },
        deck: {
          ...game.deck,
          hand: game.deck.hand.filter((card) => !source.cardIds.includes(card.id)),
          retained: game.deck.retained.filter((id) => !source.cardIds.includes(id)),
          deployed,
        },
        nextUnitId: game.nextUnitId + 1,
      },
      events: [gameEvent('UNIT_ASSEMBLED', { unitId, definitionId: definition.id })],
    };
  } catch {
    return fail(game, 'ILLEGAL_DEPLOYMENT', '揀選位置不可部署。');
  }
}

function connectedBoardEntries(boardCards, startCell) {
  const entries = Object.entries(boardCards ?? {}).map(([key, cardId]) => ({
    key,
    cardId,
    cell: parseCell(key),
  }));
  const startKey = cellKey(startCell);
  const start = entries.find(({ key }) => key === startKey);
  if (!start) return [];

  const connected = [];
  const queue = [start];
  const visited = new Set();
  while (queue.length) {
    const current = queue.shift();
    if (visited.has(current.key)) continue;
    visited.add(current.key);
    connected.push(current);
    for (const candidate of entries) {
      if (!visited.has(candidate.key) && areNeighborCells(current.cell, candidate.cell)) {
        queue.push(candidate);
      }
    }
  }
  return connected;
}

function combinations(items, size) {
  const output = [];
  function walk(start, chosen) {
    if (chosen.length === size) {
      output.push([...chosen]);
      return;
    }
    for (let index = start; index < items.length; index += 1) {
      chosen.push(items[index]);
      walk(index + 1, chosen);
      chosen.pop();
    }
  }
  walk(0, []);
  return output;
}

function findConnectedRecipe(game, target, requiredCardId) {
  const entries = connectedBoardEntries(game.boardCards, target);
  const allowedRecipes = RECIPES.filter((recipe) => (
    !game.unlockedRecipes || game.unlockedRecipes.includes(recipe.id)
  ));
  for (const size of [2, 3]) {
    for (const group of combinations(entries, size)) {
      if (!group.some(({ cardId }) => cardId === requiredCardId)) continue;
      const recipe = findRecipe(
        group.map(({ cardId }) => game.cardsById[cardId]?.symbol),
        allowedRecipes,
      );
      if (recipe) return { recipe, cardIds: group.map(({ cardId }) => cardId) };
    }
  }
  return null;
}

export function placeBoardCard(game, cardId, target) {
  if (!game.deck.hand.some((card) => card.id === cardId)) {
    return fail(game, 'MISSING_CARD', '手牌已改變。');
  }
  if (!isValidCell(game.board, target)) return fail(game, 'ILLEGAL_CARD_CELL', '字牌位置不存在。');
  if (getUnitAt(game.board, target) || game.boardCards?.[cellKey(target)]) {
    return fail(game, 'CARD_CELL_OCCUPIED', '呢個戰陣位置已被佔用。');
  }

  const placed = {
    ...game,
    boardCards: { ...(game.boardCards ?? {}), [cellKey(target)]: cardId },
    deck: {
      ...game.deck,
      hand: game.deck.hand.filter((card) => card.id !== cardId),
      retained: game.deck.retained.filter((id) => id !== cardId),
    },
  };
  const match = findConnectedRecipe(placed, target, cardId);
  if (!match) {
    return {
      ok: true,
      state: placed,
      events: [gameEvent('CARD_PLACED', { cardId, cell: target })],
    };
  }
  return confirmAssembly(placed, { type: 'board', cardIds: match.cardIds }, target);
}

export function returnBoardCard(game, target) {
  const key = cellKey(target);
  const cardId = game.boardCards?.[key];
  if (!cardId) return fail(game, 'MISSING_BOARD_CARD', '呢個位置冇字牌。');
  const boardCards = { ...game.boardCards };
  delete boardCards[key];
  return {
    ok: true,
    state: {
      ...game,
      boardCards,
      deck: { ...game.deck, hand: [...game.deck.hand, game.cardsById[cardId]] },
    },
    events: [gameEvent('CARD_RETURNED_FROM_BOARD', { cardId, cell: target })],
  };
}

export function releaseUnitCards(game, unitId) {
  const deployed = game.deck.deployed.find((item) => item.unitId === unitId);
  if (!deployed) return game;
  const cards = deployed.cardIds.map((id) => game.cardsById[id]).filter(Boolean);
  return {
    ...game,
    board: removeUnit(game.board, unitId),
    deck: {
      ...game.deck,
      deployed: game.deck.deployed.filter((item) => item.unitId !== unitId),
      discardPile: [
        ...game.deck.discardPile,
        ...cards.map((card) => ({ ...card, locked: false })),
      ],
    },
  };
}

export function moveCardToCamp(game, cardId) {
  if (game.camp.cardIds.length >= game.camp.capacity) {
    return fail(game, 'CAMP_FULL', '軍營已滿。');
  }
  if (!game.deck.hand.some((card) => card.id === cardId)) {
    return fail(game, 'MISSING_CARD', '手牌已改變。');
  }
  return {
    ok: true,
    state: {
      ...game,
      camp: { ...game.camp, cardIds: [...game.camp.cardIds, cardId] },
      deck: {
        ...game.deck,
        hand: game.deck.hand.filter((card) => card.id !== cardId),
        retained: game.deck.retained.filter((id) => id !== cardId),
      },
    },
    events: [gameEvent('CARD_MOVED_TO_CAMP', { cardId })],
  };
}

export function returnCampCard(game, cardId) {
  if (!game.camp.cardIds.includes(cardId)) {
    return fail(game, 'MISSING_CAMP_CARD', '軍營內冇呢張字牌。');
  }
  const card = game.cardsById[cardId];
  return {
    ok: true,
    state: {
      ...game,
      camp: { ...game.camp, cardIds: game.camp.cardIds.filter((id) => id !== cardId) },
      deck: { ...game.deck, hand: [...game.deck.hand, card] },
    },
    events: [gameEvent('CARD_RETURNED_FROM_CAMP', { cardId })],
  };
}
