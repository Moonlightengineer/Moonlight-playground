import { createBoard, listCells } from '../board/board.js';
import { confirmAssembly, moveCardToCamp, releaseUnitCards, returnCampCard } from '../deck/assembly.js';
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
    'ASSEMBLE', 'RETAIN_CARDS', 'REROLL', 'START_PHASE', 'RESET_RUN',
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
      return enemy.hp > 0 && enemy.distance + unit.cell.row <= definition.range;
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
  const stage = STAGE_BY_ID[stageId];
  if (!stage) throw new Error(`Missing stage: ${stageId}`);
  const phase = stage.phases[phaseIndex];
  if (!phase) throw new Error(`Missing phase ${phaseIndex} for ${stageId}`);
  return phase.spawns.map((spawn, index) => {
    const definition = ENEMY_BY_ID[spawn.enemyId];
    const lane = Math.min(boardColumns - 1, spawn.lane);
    return {
      id: `${stageId}-${phaseIndex}-${index + 1}`,
      definitionId: definition.id,
      lane,
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

function cardsByIdFromGame(game) {
  return game.cardsById;
}

function startBattle(game) {
  if (!game.nextStageId) return failure(game, 'NO_STAGE_SELECTED', '未揀選下一場戰鬥。');
  const board = createBoard(game.boardSizeId);
  const deck = {
    ...game.deck,
    hand: [],
    retained: [],
    deployed: [],
    freeRerollsRemaining: TUNING.freeRerollsPerBattle + game.temporary.extraRerolls,
  };
  const state = {
    ...game,
    status: 'configuration',
    board,
    deck,
    camp: { capacity: TUNING.campCapacity + game.temporary.extraCamp, cardIds: [] },
    selection: { cardIds: [] },
    currentBattle: { stageId: game.nextStageId, phaseIndex: 0, phaseCount: 3 },
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
    cardsById: cardsByIdFromGame(game),
    legalActions: ['SELECT_CARD', 'MOVE_CARD_TO_CAMP', 'ASSEMBLE', 'RETAIN_CARDS', 'REROLL', 'START_PHASE'],
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
  const source = action.source ?? {
    type: (game.selection.cardIds.every((id) => game.camp.cardIds.includes(id)) ? 'camp' : 'hand'),
    cardIds: game.selection.cardIds,
  };
  const result = confirmAssembly(game, source, action.target);
  if (!result.ok) return result;
  return success({ ...result.state, selection: { cardIds: [] } }, result.events);
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
    ordersRemaining: TUNING.ordersPerBattle,
    tactics: game.tactics,
  });
  return success({ ...game, status: 'combat', combat, legalActions: ['STEP_COMBAT', 'ISSUE_ORDER', 'PAUSE', 'SET_SPEED'] });
}

function syncDefeatedUnitCards(game, combat) {
  let next = { ...game, board: combat.board, deck: { ...game.deck } };
  for (const deployed of game.deck.deployed) {
    if (!combat.board.units[deployed.unitId]) next = releaseUnitCards(next, deployed.unitId);
  }
  return next;
}

function rewardChoicesFor(game) {
  const completedAfterCurrent = game.completedBattleIds.length + 1;
  if (completedAfterCurrent === 3) {
    const id = game.route === 'danger' ? 'unlock-zhang-fei' : 'unlock-zhuge-liang';
    return REWARDS.filter((reward) => [id, 'repair-wall', 'remove-card'].includes(reward.id));
  }
  if (completedAfterCurrent === 4 && game.boardSizeId === 'base') {
    return REWARDS.filter((reward) => ['expand-wing', 'expand-depth', 'repair-wall'].includes(reward.id));
  }
  if (completedAfterCurrent === 5) {
    return REWARDS.filter((reward) => ['evolve-general', 'fire-arrows', 'first-aid'].includes(reward.id));
  }
  const generated = generateRewardChoices(game, REWARDS.filter(({ rarity }) => rarity !== 'scripted'), game.rng);
  game.rng = generated.rng;
  return generated.choices;
}

function stepCombatAction(game) {
  const result = stepCombat(game.combat, combatContext());
  let next = syncDefeatedUnitCards(game, result.combat);
  next = {
    ...next,
    combat: result.combat,
    wallHp: result.combat.wallHp,
    tactics: [...result.combat.tactics],
  };

  if (result.combat.status === 'defeat') {
    return success({ ...next, status: 'defeat', legalActions: ['START_NEW_RUN'] }, result.events);
  }
  if (result.combat.status !== 'victory') return success(next, result.events);

  const phaseIndex = game.currentBattle.phaseIndex + 1;
  if (phaseIndex < game.currentBattle.phaseCount) {
    return success({
      ...next,
      status: 'configuration',
      combat: null,
      currentBattle: { ...game.currentBattle, phaseIndex },
      deck: { ...next.deck, hand: [], retained: [] },
      camp: { ...next.camp, cardIds: [] },
      selection: { cardIds: [] },
      legalCells: listCells(next.board),
      legalActions: ['DRAW_CARDS'],
    }, [...result.events, gameEvent('BATTLE_PHASE_COMPLETED', { phaseIndex: phaseIndex - 1 })]);
  }

  const rewardGame = {
    ...next,
    status: 'reward',
    combat: null,
    currentBattleResult: 'victory',
    board: createBoard(next.boardSizeId),
    camp: { capacity: TUNING.campCapacity, cardIds: [] },
    selection: { cardIds: [] },
    legalActions: ['CHOOSE_REWARD'],
  };
  rewardGame.rewardChoices = rewardChoicesFor(rewardGame);
  return success(rewardGame, [...result.events, gameEvent('BATTLE_COMPLETED', { stageId: game.currentBattle.stageId })]);
}

function chooseReward(game, action) {
  if (!game.rewardChoices.some(({ id }) => id === action.rewardId)) {
    return failure(game, 'REWARD_NOT_OFFERED', '呢個獎勵唔喺目前選項。');
  }
  const rewarded = applyReward(game, action.rewardId, action.payload);
  return success(advanceExpedition(rewarded, action.route), [gameEvent('REWARD_CHOSEN', { rewardId: action.rewardId })]);
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
    case 'CHOOSE_ROUTE': {
      if (!['safe', 'danger'].includes(action.route)) return failure(game, 'INVALID_ROUTE', '請揀安全或危險路線。');
      return success({
        ...game,
        route: action.route,
        awaitingRoute: false,
        nextStageId: ROUTES[action.route][game.completedBattleIds.length],
        legalActions: ['START_BATTLE'],
      }, [gameEvent('ROUTE_CHOSEN', { route: action.route })]);
    }
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
