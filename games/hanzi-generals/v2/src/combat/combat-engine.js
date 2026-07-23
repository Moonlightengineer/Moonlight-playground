import { gameEvent } from '../core/events.js';
import { moveUnit } from '../board/board.js';
import { findTargets, nearestFriendlyTarget } from './targeting.js';

function clone(value) {
  return structuredClone(value);
}

function eventAt(turn, type, payload = {}) {
  return gameEvent(type, payload, turn);
}

function definition(context, collection, id) {
  const value = context[collection]?.[id];
  if (!value) throw new Error(`Missing ${collection} definition: ${id}`);
  return value;
}

function hasStatus(entity, type) {
  return entity.statuses?.some((status) => status.type === type);
}

function applyBurn(enemy, turn, events) {
  const statuses = enemy.statuses ?? [];
  const burn = statuses.find(({ type }) => type === 'burn');
  if (!burn) return;
  enemy.hp -= burn.damage;
  burn.remaining -= 1;
  events.push(eventAt(turn, 'BURN_DAMAGED', {
    enemyId: enemy.id,
    damage: burn.damage,
  }));
  enemy.statuses = statuses.filter((status) => status.type !== 'burn' || status.remaining > 0);
}

function applyPendingOrders(next, events) {
  for (const order of next.pendingOrders ?? []) {
    if (order.type !== 'swap') continue;
    const [firstId, secondId] = order.unitIds;
    const first = next.board.units[firstId];
    const second = next.board.units[secondId];
    if (!first || !second || first.hp <= 0 || second.hp <= 0) continue;
    const firstCell = { ...first.cell };
    const secondCell = { ...second.cell };
    let board = { ...next.board, units: { ...next.board.units } };
    delete board.units[firstId];
    delete board.units[secondId];
    board = moveUnit({ ...board, units: { ...board.units, [firstId]: first } }, firstId, secondCell);
    board = moveUnit({ ...board, units: { ...board.units, [secondId]: second } }, secondId, firstCell);
    next.board = board;
    events.push(eventAt(next.turn, 'UNITS_SWAPPED', { unitIds: [firstId, secondId] }));
  }
  next.pendingOrders = [];
}

function friendlyDamageAgainst(target, baseDamage, enemies) {
  const shielded = target.definitionId !== 'shield-enemy'
    && enemies.some((enemy) => (
      enemy.hp > 0
      && enemy.definitionId === 'shield-enemy'
      && enemy.lane === target.lane
      && enemy.distance < target.distance
    ));
  const bossShielded = target.definitionId === 'hua-xiong' && (target.shieldTurns ?? 0) > 0;
  if (shielded || bossShielded) return Math.max(1, Math.ceil(baseDamage * 0.65));
  return baseDamage;
}

function enemyDamageBoost(enemy, enemies) {
  const boosted = enemies.some((candidate) => (
    candidate.hp > 0
    && candidate.definitionId === 'banner'
    && candidate.id !== enemy.id
    && Math.abs(candidate.lane - enemy.lane) <= 1
  ));
  return boosted ? 1.25 : 1;
}

function friendlyDirectReduction(board, unit, lane, fortify) {
  let multiplier = 1;
  const shield = Object.values(board.units).find((candidate) => (
    candidate.hp > 0
    && candidate.definitionId === 'shield-troop'
    && candidate.cell.column === unit.cell.column
    && candidate.cell.row + 1 === unit.cell.row
  ));
  if (shield) multiplier *= 0.75;
  if (fortify?.lane === lane && fortify.remainingEnemyTurns > 0) multiplier *= 0.6;
  return multiplier;
}

function wallDirectReduction(lane, fortify) {
  return fortify?.lane === lane && fortify.remainingEnemyTurns > 0 ? 0.6 : 1;
}

function maybeTriggerBossPhase(next, enemy, context, events) {
  if (
    enemy.definitionId !== 'hua-xiong'
    || enemy.phaseTwoTriggered
    || enemy.hp > enemy.maxHp * 0.5
  ) return;

  enemy.phase = 2;
  enemy.phaseTwoTriggered = true;
  enemy.lane = Math.min(next.board.size.columns - 1, enemy.lane + 1);
  enemy.shieldTurns = 2;
  const reinforcements = context.spawnHeavyCavalryPair
    ? context.spawnHeavyCavalryPair(enemy.lane)
    : [];
  next.enemies.push(...reinforcements);
  events.push(eventAt(next.turn, 'BOSS_PHASE_CHANGED', {
    enemyId: enemy.id,
    phase: 2,
    lane: enemy.lane,
  }));
}

export function createCombatState({
  board,
  enemies,
  wallHp,
  phaseIndex,
  ordersRemaining,
  tactics = [],
}) {
  return {
    turn: 0,
    status: 'running',
    board: clone(board),
    enemies: clone(enemies).map((enemy) => ({
      cooldown: 0,
      phase: 1,
      phaseTwoTriggered: false,
      statuses: [],
      ...enemy,
    })),
    wallHp,
    phaseIndex,
    ordersRemaining,
    focus: null,
    fortify: null,
    pendingOrders: [],
    tactics: [...tactics],
  };
}

export function stepCombat(combat, context) {
  if (combat.status !== 'running') return { combat, events: [] };

  const next = clone(combat);
  const events = [];
  next.turn += 1;

  applyPendingOrders(next, events);

  for (const enemy of next.enemies) {
    applyBurn(enemy, next.turn, events);
    maybeTriggerBossPhase(next, enemy, context, events);
  }
  next.enemies = next.enemies.filter((enemy) => enemy.hp > 0);

  const units = Object.values(next.board.units)
    .filter((unit) => unit.hp > 0)
    .sort((a, b) => (
      a.cell.column - b.cell.column
      || a.cell.row - b.cell.row
      || a.id.localeCompare(b.id)
    ));

  let friendlyActions = 0;
  for (const unit of units) {
    unit.cooldown = Math.max(0, unit.cooldown - 1);
    if (unit.cooldown > 0) continue;

    const unitDefinition = definition(context, 'unitsById', unit.definitionId);
    const focusId = next.focus?.remainingFriendlyTurns > 0 ? next.focus.enemyId : null;
    const targets = findTargets(unit, next.enemies, unitDefinition, { focusId });
    if (!targets.length) continue;

    for (const target of targets) {
      const damage = friendlyDamageAgainst(target, unitDefinition.damage, next.enemies);
      target.hp -= damage;
      events.push(eventAt(next.turn, 'UNIT_HIT', {
        sourceId: unit.id,
        targetId: target.id,
        damage,
      }));
    }
    friendlyActions += 1;
    unit.cooldown = unitDefinition.attackEvery;
  }

  if (next.focus && friendlyActions > 0) {
    next.focus.remainingFriendlyTurns -= friendlyActions;
    if (next.focus.remainingFriendlyTurns <= 0 || !next.enemies.some(({ id, hp }) => id === next.focus.enemyId && hp > 0)) {
      next.focus = null;
    }
  }

  next.enemies = next.enemies.filter((enemy) => enemy.hp > 0);

  const enemyActors = [...next.enemies].sort((a, b) => (
    a.lane - b.lane
    || a.distance - b.distance
    || a.id.localeCompare(b.id)
  ));

  let enemyActions = 0;
  for (const enemy of enemyActors) {
    maybeTriggerBossPhase(next, enemy, context, events);
    const enemyDefinition = definition(context, 'enemiesById', enemy.definitionId);
    enemy.cooldown = Math.max(0, enemy.cooldown - 1);

    if (enemy.definitionId === 'heavy-cavalry') {
      enemy.chargeIn = (enemy.chargeIn ?? 3) - 1;
      if (enemy.chargeIn <= 0) {
        enemy.distance = Math.max(0, enemy.distance - 2);
        enemy.chargeIn = 3;
        events.push(eventAt(next.turn, 'CAVALRY_CHARGED', {
          enemyId: enemy.id,
          lane: enemy.lane,
          distance: enemy.distance,
        }));
      } else if (enemy.distance > 0) {
        enemy.distance -= 1;
        events.push(eventAt(next.turn, 'ENEMY_MOVED', { enemyId: enemy.id, distance: enemy.distance }));
      }
      enemyActions += 1;
      continue;
    }

    if (enemy.definitionId === 'crossbow' && enemy.cooldown === 0) {
      const target = nearestFriendlyTarget(next.board, enemy.lane, { preferRear: true });
      const boostedDamage = Math.ceil(enemyDefinition.damage * enemyDamageBoost(enemy, next.enemies));
      if (target) {
        const damage = Math.max(1, Math.ceil(
          boostedDamage * friendlyDirectReduction(next.board, target, enemy.lane, next.fortify),
        ));
        target.hp -= damage;
        events.push(eventAt(next.turn, 'FRIENDLY_DAMAGED', {
          enemyId: enemy.id,
          unitId: target.id,
          damage,
        }));
      } else {
        const damage = Math.max(1, Math.ceil(boostedDamage * wallDirectReduction(enemy.lane, next.fortify)));
        next.wallHp = Math.max(0, next.wallHp - damage);
        events.push(eventAt(next.turn, 'WALL_DAMAGED', { enemyId: enemy.id, damage }));
      }
      enemy.cooldown = enemyDefinition.attackEvery;
      enemyActions += 1;
      continue;
    }

    if (enemy.distance > 0) {
      enemy.distance -= 1;
      events.push(eventAt(next.turn, 'ENEMY_MOVED', { enemyId: enemy.id, distance: enemy.distance }));
      enemyActions += 1;
      continue;
    }

    if (enemy.cooldown === 0) {
      const boostedDamage = Math.ceil(enemyDefinition.damage * enemyDamageBoost(enemy, next.enemies));
      const damage = Math.max(1, Math.ceil(boostedDamage * wallDirectReduction(enemy.lane, next.fortify)));
      next.wallHp = Math.max(0, next.wallHp - damage);
      enemy.cooldown = enemyDefinition.attackEvery;
      events.push(eventAt(next.turn, 'WALL_DAMAGED', { enemyId: enemy.id, damage }));
      enemyActions += 1;
    }

    if ((enemy.shieldTurns ?? 0) > 0) enemy.shieldTurns -= 1;
  }

  if (next.fortify && enemyActions > 0) {
    next.fortify.remainingEnemyTurns -= enemyActions;
    if (next.fortify.remainingEnemyTurns <= 0) next.fortify = null;
  }

  for (const [unitId, unit] of Object.entries(next.board.units)) {
    if (unit.hp <= 0) {
      delete next.board.units[unitId];
      events.push(eventAt(next.turn, 'UNIT_DEFEATED', { unitId }));
    }
  }

  next.enemies = next.enemies.filter((enemy) => enemy.hp > 0);
  if (next.wallHp <= 0) next.status = 'defeat';
  else if (next.enemies.length === 0) next.status = 'victory';

  return { combat: next, events };
}
