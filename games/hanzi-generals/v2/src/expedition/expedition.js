import { createBoard } from '../board/board.js';
import { allDeckCards, createDeckState } from '../deck/deck.js';
import { createRng } from '../core/rng.js';
import { STARTING_SYMBOLS } from '../../data/recipes.js';
import { TUNING } from '../../data/tuning.js';

export const ROUTES = Object.freeze({
  safe: Object.freeze(['tutorial', 'shield-line', 'route-safe', 'cavalry-warning', 'elite-mixed', 'hua-xiong']),
  danger: Object.freeze(['tutorial', 'shield-line', 'route-danger', 'cavalry-warning', 'elite-mixed', 'hua-xiong']),
});

function cardsById(deck) {
  return Object.fromEntries(allDeckCards(deck).map((card) => [card.id, card]));
}

export function createExpedition(seed) {
  let rng = createRng(seed);
  const deckResult = createDeckState(STARTING_SYMBOLS, rng);
  rng = deckResult.rng;

  return {
    version: 1,
    seed: String(seed),
    rng,
    status: 'expedition-map',
    route: null,
    battleIndex: 0,
    completedBattleIds: [],
    wallHp: TUNING.wallMaxHp,
    wallMaxHp: TUNING.wallMaxHp,
    boardSizeId: 'base',
    board: createBoard('base'),
    deck: deckResult.deck,
    cardsById: cardsById(deckResult.deck),
    camp: { capacity: TUNING.campCapacity, cardIds: [] },
    nextUnitId: 1,
    selection: { cardIds: [] },
    evolutions: {},
    unlockedRecipes: ['huang-zhong', 'zhao-yun', 'guan-yu', 'lu-bu', 'archer', 'shield-troop'],
    temporary: { extraRerolls: 0, extraCamp: 0 },
    tactics: [],
    currentBattle: null,
    currentBattleResult: null,
    nextStageId: 'tutorial',
    rewardChoices: [],
    legalActions: ['START_BATTLE'],
    error: null,
    settings: { reducedMotion: false, vibration: true, speed: 1 },
  };
}

function resolvedRoute(game, choice) {
  if (game.route) return game.route;
  if (choice === 'danger') return 'danger';
  return 'safe';
}

export function advanceExpedition(game, choice) {
  const route = resolvedRoute(game, choice);
  const stageId = game.currentBattle?.stageId;
  const completed = stageId && !game.completedBattleIds.includes(stageId)
    ? [...game.completedBattleIds, stageId]
    : [...game.completedBattleIds];
  const healed = game.currentBattleResult === 'victory'
    ? Math.min(game.wallMaxHp, game.wallHp + Math.ceil(game.wallMaxHp * TUNING.postBattleHealRatio))
    : game.wallHp;
  const battleIndex = completed.length;

  if (battleIndex >= 6) {
    return {
      ...game,
      route,
      completedBattleIds: completed,
      battleIndex,
      wallHp: healed,
      status: 'victory',
      currentBattle: null,
      currentBattleResult: null,
      nextStageId: null,
      rewardChoices: [],
      legalActions: ['START_NEW_RUN'],
    };
  }

  if (battleIndex === 2 && !game.route && !['safe', 'danger'].includes(choice)) {
    return {
      ...game,
      completedBattleIds: completed,
      battleIndex,
      wallHp: healed,
      status: 'expedition-map',
      currentBattle: null,
      currentBattleResult: null,
      nextStageId: null,
      awaitingRoute: true,
      legalActions: ['CHOOSE_ROUTE'],
    };
  }

  return {
    ...game,
    route,
    completedBattleIds: completed,
    battleIndex,
    wallHp: healed,
    status: 'expedition-map',
    currentBattle: null,
    currentBattleResult: null,
    nextStageId: ROUTES[route][battleIndex],
    awaitingRoute: false,
    rewardChoices: [],
    legalActions: ['START_BATTLE'],
  };
}

export function routeStageIds(route) {
  const stages = ROUTES[route];
  if (!stages) throw new Error(`Unknown expedition route: ${route}`);
  return [...stages];
}
