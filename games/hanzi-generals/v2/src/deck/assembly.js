import { placeUnit, removeUnit } from '../board/board.js';
import { RECIPES } from '../../data/recipes.js';
import { GENERALS } from '../../data/generals.js';
import { gameEvent } from '../core/events.js';

function recipeKey(symbols) {
  return [...symbols]
    .sort((a, b) => a.localeCompare(b, 'zh-Hant'))
    .join('|');
}

export function findRecipe(symbols, recipes = RECIPES) {
  const wanted = recipeKey(symbols);
  return recipes.find((recipe) => recipeKey(recipe.symbols) === wanted) ?? null;
}

function fail(game, code, message) {
  return { ok: false, state: game, events: [], error: { code, message } };
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
  } else if (source.type === 'board' || source.type === 'hand') {
    if (source.cardIds.some((id) => !game.deck.hand.some((card) => card.id === id))) {
      return { ok: false, code: 'INVALID_HAND_SOURCE', message: '手牌已改變。' };
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

export function confirmAssembly(game, source, target) {
  const sourceResult = cardsForSource(game, source);
  if (!sourceResult.ok) return fail(game, sourceResult.code, sourceResult.message);

  const recipe = findRecipe(sourceResult.cards.map(({ symbol }) => symbol));
  if (!recipe) return fail(game, 'NO_RECIPE', '呢組字未能合成單位。');

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
      evolution: null,
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
