import { REWARD_BY_ID } from '../../data/rewards.js';
import { addSymbols } from '../deck/deck.js';
import { expandBoard } from '../board/board.js';
import { shuffle } from '../core/rng.js';

function resolveReward(rewardOrId) {
  if (typeof rewardOrId === 'string') return REWARD_BY_ID[rewardOrId] ?? { id: rewardOrId };
  return rewardOrId && typeof rewardOrId.id === 'string' ? rewardOrId : null;
}

function baseIdOf(reward) {
  return reward?.baseId ?? reward?.id ?? null;
}

function compatible(game, reward) {
  if (reward.type === 'board-expand') return game.boardSizeId === 'base';
  if (reward.type === 'deck-remove' || reward.type === 'deck-convert') {
    return Object.keys(game.cardsById ?? {}).length > 7;
  }
  if (reward.type === 'recipe-pack') {
    const recipeIds = reward.recipeIds ?? [reward.recipeId ?? reward.id.replace('unlock-', '')];
    return recipeIds.some((id) => !(game.unlockedRecipes ?? []).includes(id));
  }
  return !reward.legacy;
}

export function generateRewardChoices(game, catalogue, rng) {
  const available = catalogue.filter((reward) => compatible(game, reward));
  const shuffled = shuffle(rng, available);
  return { choices: shuffled.items.slice(0, 3), rng: shuffled.rng };
}

function rebuildCardsById(game, deck) {
  const cards = [...deck.drawPile, ...deck.discardPile, ...deck.hand];
  const ownerIds = new Set([
    ...(game.camp?.cardIds ?? []),
    ...Object.values(game.boardCards ?? {}),
    ...deck.deployed.flatMap(({ cardIds }) => cardIds),
  ]);
  for (const id of ownerIds) {
    if (game.cardsById[id]) cards.push(game.cardsById[id]);
  }
  return Object.fromEntries(cards.map((card) => [card.id, card]));
}

function recordReward(before, after, reward, payload) {
  if (after === before) return before;
  const baseId = baseIdOf(reward);
  return {
    ...after,
    rewardHistory: [
      ...(before.rewardHistory ?? []),
      {
        rewardId: reward.id,
        baseId,
        battleIndex: before.completedBattleIds.length + 1,
        generalId: payload.generalId ?? null,
        evolutionId: payload.evolutionId ?? null,
        payload: { ...payload },
      },
    ],
  };
}

function removeOwnedCards(game, cardIds) {
  const remove = new Set(cardIds ?? []);
  if (!remove.size) return game;
  if ([...remove].some((id) => (
    game.deck.deployed.some(({ cardIds: deployedIds }) => deployedIds.includes(id))
    || Object.values(game.boardCards ?? {}).includes(id)
    || !game.cardsById?.[id]
  ))) return game;

  const deck = {
    ...game.deck,
    drawPile: game.deck.drawPile.filter(({ id }) => !remove.has(id)),
    discardPile: game.deck.discardPile.filter(({ id }) => !remove.has(id)),
    hand: game.deck.hand.filter(({ id }) => !remove.has(id)),
    retained: game.deck.retained.filter((id) => !remove.has(id)),
  };
  const cardsById = { ...game.cardsById };
  for (const id of remove) delete cardsById[id];
  return {
    ...game,
    deck,
    cardsById,
    camp: { ...game.camp, cardIds: game.camp.cardIds.filter((id) => !remove.has(id)) },
    selection: { cardIds: (game.selection?.cardIds ?? []).filter((id) => !remove.has(id)) },
  };
}

function addPack(game, reward, payload) {
  const symbols = payload.symbols ?? reward.symbols ?? [];
  const recipeIds = payload.recipeIds ?? reward.recipeIds ?? [reward.recipeId].filter(Boolean);
  if (!symbols.length || !recipeIds.length) return game;
  const deck = addSymbols(game.deck, symbols);
  return {
    ...game,
    deck,
    cardsById: rebuildCardsById(game, deck),
    unlockedRecipes: [...new Set([...(game.unlockedRecipes ?? []), ...recipeIds])],
  };
}

export function applyReward(game, rewardOrId, payload = {}) {
  const reward = resolveReward(rewardOrId);
  if (!reward) return game;
  const baseId = baseIdOf(reward);
  let next = game;

  switch (baseId) {
    case 'repair-wall':
      next = { ...game, wallHp: Math.min(game.wallMaxHp, game.wallHp + 30) };
      break;
    case 'expand-wing': {
      const board = expandBoard(game.board, 'wing');
      next = { ...game, boardSizeId: 'wing', board };
      break;
    }
    case 'expand-depth': {
      const board = expandBoard(game.board, 'depth');
      next = { ...game, boardSizeId: 'depth', board };
      break;
    }
    case 'fire-arrows':
    case 'first-aid':
      next = { ...game, tactics: [...game.tactics, baseId] };
      break;
    case 'evolve-general':
      if (!payload.generalId || !payload.evolutionId) return game;
      next = { ...game, evolutions: { ...game.evolutions, [payload.generalId]: payload.evolutionId } };
      break;
    case 'extra-reroll':
      next = { ...game, temporary: { ...game.temporary, extraRerolls: game.temporary.extraRerolls + 1 } };
      break;
    case 'extra-camp':
      next = { ...game, camp: { ...game.camp, capacity: game.camp.capacity + 1 } };
      break;
    case 'unlock-huang-zhong':
    case 'unlock-zhang-fei':
    case 'unlock-lu-heroes':
    case 'unlock-zhuge-liang':
      next = addPack(game, reward, payload);
      break;
    case 'copy-card': {
      if (typeof payload.symbol === 'string' && payload.amount === 2) {
        const deck = addSymbols(game.deck, [payload.symbol, payload.symbol]);
        next = { ...game, deck, cardsById: rebuildCardsById(game, deck) };
        break;
      }
      const card = game.cardsById[payload.cardId];
      if (!card) return game;
      const deck = addSymbols(game.deck, [card.symbol]);
      next = { ...game, deck, cardsById: rebuildCardsById(game, deck) };
      break;
    }
    case 'remove-card': {
      const cardIds = Array.isArray(payload.cardIds) ? payload.cardIds : [payload.cardId].filter(Boolean);
      next = removeOwnedCards(game, cardIds);
      break;
    }
    case 'convert-cards': {
      const removed = removeOwnedCards(game, payload.removeCardIds);
      if (removed === game || !Array.isArray(payload.addSymbols) || payload.addSymbols.length !== 2) return game;
      const deck = addSymbols(removed.deck, payload.addSymbols);
      next = { ...removed, deck, cardsById: rebuildCardsById(removed, deck) };
      break;
    }
    default:
      if (reward.type === 'recipe-pack') next = addPack(game, reward, payload);
      else return game;
  }
  return recordReward(game, next, reward, payload);
}
