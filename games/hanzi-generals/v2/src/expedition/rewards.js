import { addSymbols } from '../deck/deck.js';
import { expandBoard } from '../board/board.js';
import { shuffle } from '../core/rng.js';

function compatible(game, reward) {
  if (reward.type === 'board-expand') return game.boardSizeId === 'base';
  if (reward.type === 'evolution') {
    return Object.values(game.board?.units ?? {}).some(({ kind }) => kind === 'general')
      || game.unlockedRecipes.some((id) => ['huang-zhong', 'zhao-yun', 'guan-yu', 'lu-bu', 'zhang-fei', 'zhuge-liang'].includes(id));
  }
  if (reward.type === 'deck-remove') {
    return game.deck.drawPile.length + game.deck.discardPile.length + game.deck.hand.length > 6;
  }
  if (reward.type === 'recipe-pack') return !game.unlockedRecipes.includes(reward.id.replace('unlock-', ''));
  return true;
}

function matchesBuild(game, reward) {
  if (reward.id === 'repair-wall') return game.wallHp < game.wallMaxHp * 0.65;
  if (reward.id === 'extra-camp') return game.deck.hand.length >= 4;
  if (reward.id === 'fire-arrows') return game.route === 'danger';
  if (reward.id === 'unlock-zhang-fei') return game.boardSizeId === 'wing';
  if (reward.id === 'unlock-zhuge-liang') return game.boardSizeId === 'depth';
  return false;
}

export function generateRewardChoices(game, catalogue, rng) {
  const available = catalogue.filter((reward) => compatible(game, reward));
  const preferred = available.filter((reward) => matchesBuild(game, reward));
  const ordered = [...preferred, ...available.filter((item) => !preferred.some(({ id }) => id === item.id))];
  const first = ordered.slice(0, preferred.length);
  const shuffled = shuffle(rng, ordered.slice(preferred.length));
  const combined = [...first, ...shuffled.items];
  const unique = [];
  for (const reward of combined) {
    if (!unique.some(({ id }) => id === reward.id)) unique.push(reward);
    if (unique.length === 3) break;
  }
  return { choices: unique, rng: shuffled.rng };
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

function recordReward(before, after, rewardId, payload) {
  if (after === before) return before;
  return {
    ...after,
    rewardHistory: [
      ...(before.rewardHistory ?? []),
      {
        rewardId,
        battleIndex: before.completedBattleIds.length + 1,
        generalId: payload.generalId ?? null,
        evolutionId: payload.evolutionId ?? null,
      },
    ],
  };
}

export function applyReward(game, rewardId, payload = {}) {
  let next = game;
  switch (rewardId) {
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
      next = { ...game, tactics: [...game.tactics, rewardId] };
      break;
    case 'evolve-general':
      if (!payload.generalId || !payload.evolutionId) return game;
      next = {
        ...game,
        evolutions: { ...game.evolutions, [payload.generalId]: payload.evolutionId },
      };
      break;
    case 'extra-reroll':
      next = { ...game, temporary: { ...game.temporary, extraRerolls: game.temporary.extraRerolls + 1 } };
      break;
    case 'extra-camp':
      next = { ...game, temporary: { ...game.temporary, extraCamp: game.temporary.extraCamp + 1 } };
      break;
    case 'unlock-zhang-fei':
    case 'unlock-zhuge-liang': {
      const recipeId = rewardId === 'unlock-zhang-fei' ? 'zhang-fei' : 'zhuge-liang';
      const symbols = recipeId === 'zhang-fei' ? ['張', '飛'] : ['諸', '葛', '亮'];
      const deck = addSymbols(game.deck, symbols);
      next = {
        ...game,
        deck,
        cardsById: rebuildCardsById(game, deck),
        unlockedRecipes: [...new Set([...game.unlockedRecipes, recipeId])],
      };
      break;
    }
    case 'copy-card': {
      const card = game.cardsById[payload.cardId];
      if (!card) return game;
      const deck = addSymbols(game.deck, [card.symbol]);
      next = { ...game, deck, cardsById: rebuildCardsById(game, deck) };
      break;
    }
    case 'remove-card': {
      const removeId = payload.cardId;
      if (!removeId || game.deck.deployed.some(({ cardIds }) => cardIds.includes(removeId))) return game;
      const deck = {
        ...game.deck,
        drawPile: game.deck.drawPile.filter(({ id }) => id !== removeId),
        discardPile: game.deck.discardPile.filter(({ id }) => id !== removeId),
        hand: game.deck.hand.filter(({ id }) => id !== removeId),
        retained: game.deck.retained.filter((id) => id !== removeId),
      };
      const cardsById = { ...game.cardsById };
      delete cardsById[removeId];
      next = {
        ...game,
        deck,
        cardsById,
        camp: {
          ...game.camp,
          cardIds: game.camp.cardIds.filter((id) => id !== removeId),
        },
        selection: {
          cardIds: (game.selection?.cardIds ?? []).filter((id) => id !== removeId),
        },
      };
      break;
    }
    default:
      return game;
  }
  return recordReward(game, next, rewardId, payload);
}
