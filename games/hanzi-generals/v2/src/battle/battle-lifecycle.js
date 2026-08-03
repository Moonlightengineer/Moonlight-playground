import { ENEMY_BY_ID } from '../../data/enemies.js';
import { resolveUnitDefinition } from '../../data/specializations.js';
import { GENERAL_BY_ID } from '../../data/generals.js';
import { STAGE_BY_ID } from '../../data/stages.js';
import { TUTORIAL_SYMBOL_ORDER } from '../../data/recipes.js';
import { TUNING } from '../../data/tuning.js';
import { createBoard, listCells } from '../board/board.js';
import { createCombatState, stepCombat } from '../combat/combat-engine.js';
import { releaseUnitCards } from '../deck/assembly.js';
import { prepareBattleDeck } from '../deck/deck.js';
import { advanceExpedition } from '../expedition/expedition.js';
import {
  createBattleMetrics,
  finalizeBattleReport,
  recordBattleEvents,
} from '../report/battle-report.js';
import { generateRewardOffer } from '../reward/reward-flow.js';
import { gameEvent } from '../core/events.js';

function success(state, events = []) {
  return { ok: true, state, events };
}

function failure(game, code, message) {
  return { ok: false, state: game, events: [], error: { code, message } };
}

function combatContext(game) {
  return {
    unitsById: GENERAL_BY_ID,
    enemiesById: ENEMY_BY_ID,
    resolveUnitDefinition(unit) {
      return resolveUnitDefinition(GENERAL_BY_ID[unit.definitionId], unit.evolution, game.troopSpecializations ?? []);
    },
    canAttack(unit, enemy) {
      const definition = resolveUnitDefinition(GENERAL_BY_ID[unit.definitionId], unit.evolution, game.troopSpecializations ?? []);
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

function orderTutorialDeck(deck) {
  const remaining = [...deck.drawPile];
  const ordered = [];
  for (const symbol of TUTORIAL_SYMBOL_ORDER) {
    const index = remaining.findIndex((card) => card.symbol === symbol);
    if (index >= 0) ordered.push(...remaining.splice(index, 1));
  }
  return { ...deck, drawPile: [...ordered, ...remaining] };
}

export function startBattle(game) {
  if (!game.nextStageId) return failure(game, 'NO_STAGE_SELECTED', '未揀選下一場戰鬥。');
  const settled = settleAfterBattle(game);
  const prepared = prepareBattleDeck(settled.deck, settled.rng);
  const board = createBoard(settled.boardSizeId);
  let deck = {
    ...prepared.deck,
    freeRerollsRemaining: TUNING.freeRerollsPerBattle + (settled.temporary?.extraRerolls ?? 0),
  };
  if (settled.nextStageId === 'tutorial') deck = orderTutorialDeck(deck);
  const state = {
    ...settled,
    rng: prepared.rng,
    recruitedGeneralIds: [...(settled.recruitedGeneralIds ?? [])],
    status: 'configuration',
    board,
    boardCards: {},
    deck,
    camp: {
      capacity: settled.camp.capacity,
      cardIds: [...settled.camp.cardIds],
    },
    selection: { cardIds: [] },
    currentBattle: {
      stageId: settled.nextStageId,
      phaseIndex: 0,
      phaseCount: 3,
      ordersRemaining: TUNING.ordersPerBattle,
    },
    currentBattleResult: null,
    nextStageId: null,
    temporary: { ...settled.temporary, extraRerolls: 0, extraCamp: 0 },
    legalCells: listCells(board),
    legalActions: ['DRAW_CARDS'],
    battleReport: null,
  };
  return success({ ...state, battleMetrics: createBattleMetrics(state) }, [
    gameEvent('BATTLE_STARTED', { stageId: state.currentBattle.stageId }),
  ]);
}

export function startPhase(game) {
  if (!game.currentBattle) return failure(game, 'NO_CURRENT_BATTLE', '未有進行中戰鬥。');
  try {
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
  } catch (error) {
    return failure(game, 'MISSING_BATTLE_PHASE', error.message);
  }
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
  const retained = new Set(game.deck.retained);
  const retainedCards = game.deck.hand.filter(({ id }) => retained.has(id));
  const discardIds = game.deck.hand
    .filter(({ id }) => !retained.has(id))
    .map(({ id }) => id);
  return {
    ...game,
    deck: {
      ...game.deck,
      hand: retainedCards.map((card) => ({ ...card, locked: false })),
      retained: retainedCards.map(({ id }) => id),
      discardPile: [...game.deck.discardPile, ...uniqueCards(game, discardIds)],
    },
    camp: { ...game.camp, cardIds: [...game.camp.cardIds] },
    selection: { cardIds: [] },
  };
}

function settleAfterBattle(game) {
  const looseIds = [
    ...game.deck.hand.map(({ id }) => id),
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
    camp: { ...game.camp, cardIds: [...game.camp.cardIds] },
    selection: { cardIds: [] },
  };
}

function recordLifecycleEvents(game, events, combat) {
  return recordBattleEvents(
    game.battleMetrics ?? createBattleMetrics(game),
    events,
    {
      turn: combat?.turn ?? game.combat?.turn ?? 0,
      ordersRemaining: combat?.ordersRemaining ?? game.currentBattle?.ordersRemaining,
      phaseCount: game.currentBattle?.phaseCount,
    },
  );
}

export function finishPhase(game, combat, events = []) {
  const phaseIndex = game.currentBattle.phaseIndex + 1;
  const phaseEvent = gameEvent('BATTLE_PHASE_COMPLETED', { phaseIndex: phaseIndex - 1 });
  const combinedEvents = [...events, phaseEvent];
  const metrics = recordLifecycleEvents(game, combinedEvents, combat);
  const prepared = settleBetweenPhases({ ...game, combat, battleMetrics: metrics });
  return success({
    ...prepared,
    status: 'configuration',
    combat: null,
    currentBattle: { ...prepared.currentBattle, phaseIndex, ordersRemaining: combat.ordersRemaining },
    legalCells: listCells(prepared.board).filter((cell) => {
      const key = `${cell.column},${cell.row}`;
      return !prepared.boardCards[key]
        && !Object.values(prepared.board.units).some((unit) => (
          unit.cell.column === cell.column && unit.cell.row === cell.row
        ));
    }),
    legalActions: ['DRAW_CARDS'],
  }, combinedEvents);
}

export function finishBattle(game, combat, events = []) {
  const battleEvent = gameEvent('BATTLE_COMPLETED', { stageId: game.currentBattle.stageId });
  const combinedEvents = [...events, battleEvent];
  const metrics = recordLifecycleEvents(game, combinedEvents, combat);
  const settled = settleAfterBattle({
    ...game,
    combat: null,
    currentBattleResult: 'victory',
    battleMetrics: metrics,
  });

  const isFinalBattle = (settled.completedBattleIds?.length ?? 0) >= 5;
  if (isFinalBattle) {
    const battleReport = finalizeBattleReport(settled, 'victory', 'victory');
    const completed = advanceExpedition(settled);
    return success({
      ...completed,
      status: 'battle-report',
      battleMetrics: null,
      battleReport,
      legalActions: ['CONTINUE_AFTER_REPORT', 'RESET_RUN'],
    }, combinedEvents);
  }

  const generated = generateRewardOffer(settled);
  const withRewards = {
    ...settled,
    rng: generated.rng,
    rewardChoices: generated.choices,
    rewardOfferHistory: [...(settled.rewardOfferHistory ?? []), generated.record],
  };
  const battleReport = finalizeBattleReport(withRewards, 'victory', 'reward');
  return success({
    ...withRewards,
    status: 'battle-report',
    battleMetrics: null,
    battleReport,
    legalActions: ['CONTINUE_AFTER_REPORT', 'RESET_RUN'],
  }, combinedEvents);
}

export function stepBattleCombat(game) {
  if (!game.combat) return failure(game, 'NO_COMBAT_SESSION', '未有進行中戰鬥。');
  if (game.combat.paused) return failure(game, 'COMBAT_PAUSED', '戰鬥暫停期間不會推進模擬時間。');
  const result = stepCombat(game.combat, combatContext(game));
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
    const metrics = recordLifecycleEvents(next, result.events, result.combat);
    const battleReport = finalizeBattleReport(
      { ...next, battleMetrics: metrics },
      'defeat',
      'defeat',
    );
    return success({
      ...next,
      status: 'battle-report',
      combat: null,
      currentBattleResult: 'defeat',
      battleMetrics: null,
      battleReport,
      legalActions: ['CONTINUE_AFTER_REPORT', 'RESET_RUN'],
    }, result.events);
  }
  if (result.combat.status !== 'victory') {
    return success({
      ...next,
      battleMetrics: recordLifecycleEvents(next, result.events, result.combat),
    }, result.events);
  }

  const nextPhaseIndex = game.currentBattle.phaseIndex + 1;
  if (nextPhaseIndex < game.currentBattle.phaseCount) {
    return finishPhase(next, result.combat, result.events);
  }
  return finishBattle(next, result.combat, result.events);
}
