import { createBoard } from '../board/board.js';
import { allDeckCards, createDeckState } from '../deck/deck.js';
import { createRng } from '../core/rng.js';
import { STARTING_SYMBOLS } from '../../data/recipes.js';
import { TUNING } from '../../data/tuning.js';

export const ROUTES = Object.freeze({
  safe: Object.freeze(['tutorial', 'shield-line', 'route-safe', 'cavalry-warning', 'elite-mixed', 'hua-xiong']),
  danger: Object.freeze(['tutorial', 'shield-line', 'route-danger', 'cavalry-warning', 'elite-mixed', 'hua-xiong']),
});

const SHARED_OPENING = Object.freeze(['tutorial', 'shield-line']);

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
    boardCards: {},
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

function chosenRoute(game, choice) {
  if (game.route) return game.route;
  return ['safe', 'danger'].includes(choice) ? choice : null;
}

export function advanceExpedition(game, choice) {
  const route = chosenRoute(game, choice);
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

  if (battleIndex === 2 && !route) {
    return {
      ...game,
      route: null,
      completedBattleIds: completed,
      battleIndex,
      wallHp: healed,
      status: 'expedition-map',
      currentBattle: null,
      currentBattleResult: null,
      nextStageId: null,
      awaitingRoute: true,
      rewardChoices: [],
      legalActions: ['CHOOSE_ROUTE'],
    };
  }

  const nextStageId = battleIndex < SHARED_OPENING.length
    ? SHARED_OPENING[battleIndex]
    : ROUTES[route]?.[battleIndex];
  if (!nextStageId) throw new Error(`Missing next expedition stage for battle ${battleIndex}`);

  return {
    ...game,
    route,
    completedBattleIds: completed,
    battleIndex,
    wallHp: healed,
    status: 'expedition-map',
    currentBattle: null,
    currentBattleResult: null,
    nextStageId,
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
