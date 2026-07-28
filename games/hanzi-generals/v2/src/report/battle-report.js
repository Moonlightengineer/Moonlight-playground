import { TUNING } from '../../data/tuning.js';

function addUnique(items, value) {
  if (typeof value !== 'string' || !value || items.includes(value)) return items;
  return [...items, value];
}

export function createBattleMetrics(game) {
  const stageId = game.currentBattle?.stageId ?? game.nextStageId ?? null;
  const battleNumber = Number.isInteger(game.battleIndex) ? game.battleIndex + 1 : 1;
  const ordersAvailable = Number.isInteger(game.currentBattle?.ordersRemaining)
    ? game.currentBattle.ordersRemaining
    : TUNING.ordersPerBattle;
  return {
    battleId: `${game.seed ?? 'run'}:${battleNumber}:${stageId ?? 'unknown'}`,
    stageId,
    battleNumber,
    wallHpStart: game.wallHp,
    phasesCompleted: 0,
    totalTurns: 0,
    enemyIds: [],
    unitsFieldedIds: [],
    unitsLostIds: [],
    ordersAvailable,
    ordersUsed: 0,
    eventCounts: {},
  };
}

export function recordBattleEvents(metrics, events = [], context = {}) {
  const next = {
    ...metrics,
    enemyIds: [...(metrics.enemyIds ?? [])],
    unitsFieldedIds: [...(metrics.unitsFieldedIds ?? [])],
    unitsLostIds: [...(metrics.unitsLostIds ?? [])],
    eventCounts: { ...(metrics.eventCounts ?? {}) },
  };
  const contextTurn = Number.isInteger(context.turn) ? context.turn : 0;
  next.totalTurns = Math.max(next.totalTurns ?? 0, contextTurn);
  if (Number.isInteger(context.ordersRemaining)) {
    next.ordersUsed = Math.max(
      next.ordersUsed ?? 0,
      Math.max(0, (next.ordersAvailable ?? 0) - context.ordersRemaining),
    );
  }

  for (const event of events ?? []) {
    if (!event || typeof event.type !== 'string') continue;
    next.eventCounts[event.type] = (next.eventCounts[event.type] ?? 0) + 1;
    if (Number.isInteger(event.turn)) next.totalTurns = Math.max(next.totalTurns, event.turn);
    if (event.type === 'UNIT_ASSEMBLED') {
      next.unitsFieldedIds = addUnique(next.unitsFieldedIds, event.payload?.unitId);
    }
    if (event.type === 'ENEMY_DEFEATED') {
      next.enemyIds = addUnique(next.enemyIds, event.payload?.enemyId);
    }
    if (event.type === 'UNIT_DEFEATED') {
      next.unitsLostIds = addUnique(next.unitsLostIds, event.payload?.unitId);
    }
    if (event.type === 'BATTLE_PHASE_COMPLETED') {
      const completed = Number.isInteger(event.payload?.phaseIndex)
        ? event.payload.phaseIndex + 1
        : next.phasesCompleted + 1;
      next.phasesCompleted = Math.max(next.phasesCompleted, completed);
    }
    if (event.type === 'BATTLE_COMPLETED') {
      next.phasesCompleted = Math.max(
        next.phasesCompleted,
        Number.isInteger(context.phaseCount) ? context.phaseCount : next.phasesCompleted,
      );
    }
  }
  return next;
}

export function finalizeBattleReport(game, result, nextStatus) {
  const metrics = game.battleMetrics ?? createBattleMetrics(game);
  const phaseCount = game.currentBattle?.phaseCount ?? metrics.phasesCompleted;
  const phasesCompleted = result === 'victory'
    ? Math.max(metrics.phasesCompleted, phaseCount)
    : metrics.phasesCompleted;
  const wallHpEnd = game.wallHp;
  return {
    battleId: metrics.battleId,
    stageId: metrics.stageId,
    battleNumber: metrics.battleNumber,
    result,
    nextStatus,
    wallHpStart: metrics.wallHpStart,
    wallHpEnd,
    wallDamageTaken: Math.max(0, metrics.wallHpStart - wallHpEnd),
    phasesCompleted,
    totalTurns: metrics.totalTurns,
    enemiesDefeated: metrics.enemyIds.length,
    unitsFielded: metrics.unitsFieldedIds.length,
    unitsLost: metrics.unitsLostIds.length,
    ordersUsed: metrics.ordersUsed,
    eventCounts: { ...metrics.eventCounts },
  };
}
