import { createBoard, listCells } from '../board/board.js';
import {
  confirmAssembly,
  moveCardToCamp,
  placeBoardCard,
  releaseUnitCards,
  returnBoardCard,
  returnCampCard,
} from '../deck/assembly.js';
import { drawToHand, rerollHand, retainCards } from '../deck/deck.js';
import { applyOrder } from '../combat/orders.js';
import { createCombatState, stepCombat } from '../combat/combat-engine.js';
import { advanceExpedition, createExpedition, ROUTES } from '../expedition/expedition.js';
import { applyReward, generateRewardChoices } from '../expedition/rewards.js';
import { ENEMY_BY_ID } from '../../data/enemies.js';
import { GENERAL_BY_ID } from '../../data/generals.js';
import { REWARDS } from '../../data/rewards.js';
import { STAGE_BY_ID } from '../../data/stages.js';
import { TUNING } from '../../data/tuning.js';
import { gameEvent } from './events.js';

const ALLOWED = Object.freeze({
  'expedition-map': new Set(['CHOOSE_ROUTE', 'START_BATTLE', 'RESET_RUN']),
  configuration: new Set([
    'DRAW_CARDS', 'SELECT_CARD', 'MOVE_CARD_TO_CAMP', 'RETURN_CAMP_CARD',
    'RETURN_BOARD_CARD', 'ASSEMBLE', 'RETAIN_CARDS', 'REROLL',
    'START_PHASE', 'RESET_RUN',
  ]),
  combat: new Set(['PAUSE', 'RESUME', 'SET_SPEED', 'ISSUE_ORDER', 'STEP_COMBAT', 'RESET_RUN']),
  reward: new Set(['CHOOSE_REWARD', 'RESET_RUN']),
  victory: new Set(['START_NEW_RUN']),
  defeat: new Set(['START_NEW_RUN']),
  error: new Set(['RESET_SAVE', 'START_NEW_RUN']),
});

function success(state, events = []) {
  return { ok: true, state, events };
}

function failure(game, code, message) {
  return { ok: false, state: game, events: [], error: { code, message } };
}

function combatContext() {
  return {
    unitsById: GENERAL_BY_ID,
    enemiesById: ENEMY_BY_ID,
    canAttack(unit, enemy) {
      const definition = GENERAL_BY_ID[unit.definitionId];
      return Boolean(definition) && enemy.hp > 0 && enemy.distance + unit.cell.row <= definition.range;
    },
    spawnHeavyCavalryPair(lane) {
      const definition = ENEMY_BY_ID['heavy-cavalry'];
      return [
        {
          id: `boss-cavalry-${lane}-a`, definitionId: definition.id, lane,
          distance: 3, hp: definition.maxHp, maxHp: definition.maxHp,
          cooldown: 0, chargeIn: 3, statuses: [],
        },
        {
          id: `boss-cavalry-${lane}-b`, definitionId: definition.id,
          lane: Math.max(0, lane - 1), distance: 3,
          hp: definition.maxHp, maxHp: definition.maxHp,
          cooldown: 0, chargeIn: 3, statuses: [],
        },
      ];
    },
  };
}

function spawnPhase(stageId, phaseIndex, boardColumns) {
  const phase = STAGE_BY_ID[stageId]?.phases?.[phaseIndex];
  if (!phase) throw new Error(`Missing stage phase: ${stageId}/${phaseIndex}`);
  return phase.spawns.map((spawn, index) => {
    const definition = ENEMY_BY_ID[spawn.enemyId];
    return {
      id: `${stageId}-${phaseIndex}-${index + 1}`,
      definitionId: definition.id,
      lane: Math.min(boardColumns - 1, spawn.lane),
      distance: 3 + (spawn.delay ?? 0),
      hp: definition.maxHp,
      maxHp: definition.maxHp,
      cooldown: 0,
      chargeIn: definition.id === 'heavy-cavalry' ? 3 : undefined,
      phase: 1,
      phaseTwoTriggered: false,
      statuses: [],
    };
  });
}

function prioritizeTutorialPair(deck) {
  const drawPile = [...deck.drawPile];
  const wanted = [];
  for (const symbol of ['黃', '忠']) {
    const index = drawPile.findIndex((card) => card.symbol === symbol);
    if (index >= 0) wanted.push(...drawPile.splice(index, 1));
  }
  return { ...deck, drawPile: [...wanted, ...drawPile] };
}

function startBattle(game) {
  if (!game.nextStageId) return failure(game, 'NO_STAGE_SELECTED', '未揀選下一場戰鬥。');
  const board = createBoard(game.boardSizeId);
  let deck = {
    ...game.deck,
    hand: [],
    retained: [],
    deployed: [],
    freeRerollsRemaining: TUNING.freeRerollsPerBattle + game.temporary.extraRerolls,
  };
  if (game.nextStageId === 'tutorial') deck = prioritizeTutorialPair(deck);

  const state = {
    ...game,
    status: 'configuration',
    board,
    boardCards: {},
    deck,
    camp: { capacity: TUNING.campCapacity + game.temporary.extraCamp, cardIds: [] },
    selection: { cardIds: [] },
    currentBattle: {
      stageId: game.nextStageId,
      phaseIndex: 0,
      phaseCount: 3,
      ordersRemaining: TUNING.ordersPerBattle,
    },
    currentBattleResult: null,
    nextStageId: null,
    temporary: { extraRerolls: 0, extraCamp: 0 },
    legalCells: listCells(board),
    legalActions: ['DRAW_CARDS'],
  };
  return success(state, [gameEvent('BATTLE_STARTED', { stageId: state.currentBattle.stageId })]);
}

function drawCards(game) {
  const result = drawToHand(game.deck, TUNING.handSize, game.rng);
  return success({
    ...game,
    deck: result.deck,
    rng: result.rng,
    legalActions: [
      'SELECT_CARD', 'MOVE_CARD_TO_CAMP', 'RETURN_CAMP_CARD',
      'RETURN_BOARD_CARD', 'ASSEMBLE', 'RETAIN_CARDS', 'REROLL', 'START_PHASE',
    ],
  }, [gameEvent('CARDS_DRAWN', { count: result.deck.hand.length })]);
}

function toggleCardSelection(game, cardId) {
  const exists = game.deck.hand.some((card) => card.id === cardId)
    || game.camp.cardIds.includes(cardId);
  if (!exists) return failure(game, 'MISSING_CARD', '字牌已經唔喺可選位置。');
  const selected = new Set(game.selection?.cardIds ?? []);
  if (selected.has(cardId)) selected.delete(cardId);
  else {
    if (selected.size >= 3) return failure(game, 'SELECTION_LIMIT', '一次最多選三張字牌。');
    selected.add(cardId);
  }
  return success({ ...game, selection: { cardIds: [...selected] } });
}

function assemble(game, action) {
  const selected = action.source?.cardIds ?? game.selection?.cardIds ?? [];
  if (selected.length === 1 && game.deck.hand.some(({ id }) => id === selected[0])) {
    const result = placeBoardCard(game, selected[0], action.target);
    return result.ok
      ? success({ ...result.state, selection: { cardIds: [] } }, result.events)
      : result;
  }
  const source = action.source ?? {
    type: selected.every((id) => game.camp.cardIds.includes(id)) ? 'camp' : 'hand',
    cardIds: selected,
  };
  const result = confirmAssembly(game, source, action.target);
  return result.ok
    ? success({ ...result.state, selection: { cardIds: [] } }, result.events)
    : result;
}

function startPhase(game) {
  if (!game.currentBattle) return failure(game, 'NO_CURRENT_BATTLE', '未有進行中戰鬥。');
  const enemies = spawnPhase(
    game.currentBattle.stageId,
    game.currentBattle.phaseIndex,
    game.board.size.columns,
  );
  const combat = createCombatState({
    board: game.board,
    enemies,
    wallHp: game.wallHp,
    phaseIndex: game.currentBattle.phaseIndex,
    ordersRemaining: game.currentBattle.ordersRemaining,
    tactics: game.tactics,
  });
  return success({
    ...game,
    status: 'combat',
    combat,
    legalActions: ['STEP_COMBAT', 'ISSUE_ORDER', 'PAUSE', 'RESUME', 'SET_SPEED'],
  });
}

function syncDefeatedUnitCards(game, combat) {
  let next = { ...game, board: combat.board, deck: { ...game.deck } };
  for (const deployed of game.deck.deployed) {
    if (!combat.board.units[deployed.unitId]) next = releaseUnitCards(next, deployed.unitId);
  }
  return next;
}

function uniqueCards(game, cardIds) {
  const seen = new Set();
  return cardIds
    .filter((id) => !seen.has(id) && seen.add(id))
    .map((id) => game.cardsById[id])
    .filter(Boolean)
    .map((card) => ({ ...card, locked: false }));
}

function settleBetweenPhases(game) {
  const retain = new Set(game.deck.retained);
  const retainedCards = game.deck.hand.filter(({ id }) => retain.has(id));
  const discardIds = [
    ...game.deck.hand.filter(({ id }) => !retain.has(id)).map(({ id }) => id),
    ...game.camp.cardIds,
  ];
  return {
    ...game,
    deck: {
      ...game.deck,
      hand: retainedCards.map((card) => ({ ...card, locked: false })),
      retained: [],
      discardPile: [...game.deck.discardPile, ...uniqueCards(game, discardIds)],
    },
    camp: { ...game.camp, cardIds: [] },
    selection: { cardIds: [] },
  };
}

function settleAfterBattle(game) {
  const looseIds = [
    ...game.deck.hand.map(({ id }) => id),
    ...game.camp.cardIds,
    ...Object.values(game.boardCards ?? {}),
    ...game.deck.deployed.flatMap(({ cardIds }) => cardIds),
  ];
  return {
    ...game,
    board: createBoard(game.boardSizeId),
    boardCards: {},
    deck: {
      ...game.deck,
      hand: [],
      retained: [],
      deployed: [],
      discardPile: [...game.deck.discardPile, ...uniqueCards(game, looseIds)],
    },
    camp: { capacity: TUNING.campCapacity, cardIds: [] },
    selection: { cardIds: [] },
  };
}

function rewardChoicesFor(game) {
  const completedAfterCurrent = game.completedBattleIds.length + 1;
  if (completedAfterCurrent === 3) {
    const id = game.route === 'danger' ? 'unlock-zhang-fei' : 'unlock-zhuge-liang';
    return { choices: REWARDS.filter((reward) => [id, 'repair-wall', 'remove-card'].includes(reward.id)), rng: game.rng };
  }
  if (completedAfterCurrent === 4 && game.boardSizeId === 'base') {
    return { choices: REWARDS.filter((reward) => ['expand-wing', 'expand-depth', 'repair-wall'].includes(reward.id)), rng: game.rng };
  }
  if (completedAfterCurrent === 5) {
    return { choices: REWARDS.filter((reward) => ['evolve-general', 'fire-arrows', 'first-aid'].includes(reward.id)), rng: game.rng };
  }
  return generateRewardChoices(
    game,
    REWARDS.filter(({ rarity }) => rarity !== 'scripted'),
    game.rng,
  );
}

function stepCombatAction(game) {
  const result = stepCombat(game.combat, combatContext());
  let next = syncDefeatedUnitCards(game, result.combat);
  next = {
    ...next,
    combat: result.combat,
    wallHp: result.combat.wallHp,
    tactics: [...result.combat.tactics],
    currentBattle: {
      ...game.currentBattle,
      ordersRemaining: result.combat.ordersRemaining,
    },
  };

  if (result.combat.status === 'defeat') {
    return success({ ...next, status: 'defeat', legalActions: ['START_NEW_RUN'] }, result.events);
  }
  if (result.combat.status !== 'victory') return success(next, result.events);

  const phaseIndex = game.currentBattle.phaseIndex + 1;
  if (phaseIndex < game.currentBattle.phaseCount) {
    const prepared = settleBetweenPhases(next);
    return success({
      ...prepared,
      status: 'configuration',
      combat: null,
      currentBattle: { ...prepared.currentBattle, phaseIndex },
      legalCells: listCells(prepared.board).filter((cell) => {
        const key = `${cell.column},${cell.row}`;
        return !prepared.boardCards[key] && !Object.values(prepared.board.units).some((unit) => unit.cell.column === cell.column && unit.cell.row === cell.row);
      }),
      legalActions: ['DRAW_CARDS'],
    }, [...result.events, gameEvent('BATTLE_PHASE_COMPLETED', { phaseIndex: phaseIndex - 1 })]);
  }

  const rewardGame = settleAfterBattle({
    ...next,
    status: 'reward',
    combat: null,
    currentBattleResult: 'victory',
    legalActions: ['CHOOSE_REWARD'],
  });
  const generated = rewardChoicesFor(rewardGame);
  return success({
    ...rewardGame,
    rng: generated.rng,
    rewardChoices: generated.choices,
  }, [...result.events, gameEvent('BATTLE_COMPLETED', { stageId: game.currentBattle.stageId })]);
}

function defaultRewardPayload(game, rewardId) {
  if (rewardId === 'evolve-general') {
    const generalId = game.unlockedRecipes.find((id) => GENERAL_BY_ID[id]?.kind === 'general' && !game.evolutions[id]);
    const evolutionId = GENERAL_BY_ID[generalId]?.evolutions?.[0];
    return generalId && evolutionId ? { generalId, evolutionId } : {};
  }
  const available = [
    ...game.deck.drawPile,
    ...game.deck.discardPile,
    ...game.deck.hand,
  ];
  if (rewardId === 'copy-card') return { cardId: available[0]?.id };
  if (rewardId === 'remove-card') return { cardId: available.at(-1)?.id };
  return {};
}

function chooseReward(game, action) {
  if (!game.rewardChoices.some(({ id }) => id === action.rewardId)) {
    return failure(game, 'REWARD_NOT_OFFERED', '呢個獎勵唔喺目前選項。');
  }
  const payload = action.payload ?? defaultRewardPayload(game, action.rewardId);
  const rewarded = applyReward(game, action.rewardId, payload);
  return success(
    advanceExpedition(rewarded, action.route),
    [gameEvent('REWARD_CHOSEN', { rewardId: action.rewardId })],
  );
}

export function reduceGame(game, action) {
  if (!action || typeof action.type !== 'string') {
    return failure(game, 'INVALID_ACTION', '操作格式錯誤。');
  }
  if (!ALLOWED[game.status]?.has(action.type)) {
    return failure(game, 'ILLEGAL_ACTION_FOR_STATE', '而家唔可以執行呢個操作。');
  }

  switch (action.type) {
    case 'RESET_RUN':
    case 'START_NEW_RUN':
    case 'RESET_SAVE':
      return success(createExpedition(action.seed ?? game.seed ?? Date.now()));
    case 'CHOOSE_ROUTE':
      if (!['safe', 'danger'].includes(action.route)) return failure(game, 'INVALID_ROUTE', '請揀安全或危險路線。');
      return success({
        ...game,
        route: action.route,
        awaitingRoute: false,
        nextStageId: ROUTES[action.route][game.completedBattleIds.length],
        legalActions: ['START_BATTLE'],
      }, [gameEvent('ROUTE_CHOSEN', { route: action.route })]);
    case 'START_BATTLE':
      return startBattle(game);
    case 'DRAW_CARDS':
      return drawCards(game);
    case 'SELECT_CARD':
      return toggleCardSelection(game, action.cardId);
    case 'MOVE_CARD_TO_CAMP':
      return moveCardToCamp(game, action.cardId);
    case 'RETURN_CAMP_CARD':
      return returnCampCard(game, action.cardId);
    case 'RETURN_BOARD_CARD':
      return returnBoardCard(game, action.target);
    case 'ASSEMBLE':
      return assemble(game, action);
    case 'RETAIN_CARDS':
      try {
        return success({ ...game, deck: retainCards(game.deck, action.cardIds ?? []) });
      } catch (error) {
        return failure(game, 'INVALID_RETAIN', error.message);
      }
    case 'REROLL':
      try {
        const result = rerollHand(game.deck, action.lockedCardIds ?? [], game.rng);
        return success({ ...game, deck: result.deck, rng: result.rng, selection: { cardIds: [] } });
      } catch (error) {
        return failure(game, 'REROLL_UNAVAILABLE', error.message);
      }
    case 'START_PHASE':
      return startPhase(game);
    case 'ISSUE_ORDER': {
      const result = applyOrder(game.combat, action.order, combatContext());
      return result.ok ? success({ ...game, combat: result.state }, result.events) : { ...result, state: game };
    }
    case 'STEP_COMBAT':
      return stepCombatAction(game);
    case 'PAUSE':
      return success({ ...game, combat: { ...game.combat, paused: true } });
    case 'RESUME':
      return success({ ...game, combat: { ...game.combat, paused: false } });
    case 'SET_SPEED':
      if (![1, 2].includes(action.speed)) return failure(game, 'INVALID_SPEED', '速度只支援 1× 或 2×。');
      return success({ ...game, settings: { ...game.settings, speed: action.speed } });
    case 'CHOOSE_REWARD':
      return chooseReward(game, action);
    default:
      return failure(game, 'UNKNOWN_ACTION', '未知操作。');
  }
}

export { ALLOWED };
