import { areAdjacent } from '../board/board.js';
import { gameEvent } from '../core/events.js';
import { findTargets } from './targeting.js';

function fail(combat, code, message) {
  return { ok: false, state: combat, events: [], error: { code, message } };
}

function spendOrder(combat) {
  if (combat.ordersRemaining < 1) return null;
  return { ...structuredClone(combat), ordersRemaining: combat.ordersRemaining - 1 };
}

function unitIsIdle(unit) {
  return unit.hp > 0 && !(unit.statuses ?? []).some(({ type }) => type === 'busy');
}

function canFocusEnemy(combat, enemyId, context) {
  const enemy = combat.enemies.find((item) => item.id === enemyId && item.hp > 0);
  if (!enemy) return false;
  return Object.values(combat.board.units).some((unit) => {
    if (unit.hp <= 0) return false;
    if (typeof context.canAttack === 'function') return context.canAttack(unit, enemy, combat);
    const definition = context.unitsById?.[unit.definitionId];
    return definition && findTargets(unit, combat.enemies, definition).some(({ id }) => id === enemyId);
  });
}

function consumeTactic(combat, tacticId) {
  const index = combat.tactics.indexOf(tacticId);
  if (index < 0) return null;
  const tactics = [...combat.tactics];
  tactics.splice(index, 1);
  return { ...structuredClone(combat), tactics };
}

export function applyOrder(combat, order, context = {}) {
  if (combat.status !== 'running') {
    return fail(combat, 'COMBAT_NOT_RUNNING', '戰鬥未進行，暫時不可使用軍令。');
  }

  if (order.type === 'swap') {
    const next = spendOrder(combat);
    if (!next) return fail(combat, 'NO_ORDERS', '軍令不足。');
    const [firstId, secondId] = order.unitIds ?? [];
    const first = combat.board.units[firstId];
    const second = combat.board.units[secondId];
    if (!first || !second || !unitIsIdle(first) || !unitIsIdle(second)) {
      return fail(combat, 'INVALID_SWAP_UNITS', '只可以交換兩名存活而且空閒嘅單位。');
    }
    if (!areAdjacent(first.cell, second.cell)) {
      return fail(combat, 'UNITS_NOT_ADJACENT', '變陣只可以交換相鄰單位。');
    }
    next.pendingOrders.push({ type: 'swap', unitIds: [firstId, secondId] });
    return {
      ok: true,
      state: next,
      events: [gameEvent('ORDER_QUEUED', { type: 'swap', unitIds: [firstId, secondId] }, combat.turn)],
    };
  }

  if (order.type === 'focus') {
    if (!canFocusEnemy(combat, order.enemyId, context)) {
      return fail(combat, 'ILLEGAL_FOCUS_TARGET', '目標唔喺任何友軍合法攻擊範圍。');
    }
    const next = spendOrder(combat);
    if (!next) return fail(combat, 'NO_ORDERS', '軍令不足。');
    next.focus = { enemyId: order.enemyId, remainingFriendlyTurns: 3 };
    return {
      ok: true,
      state: next,
      events: [gameEvent('FOCUS_ORDERED', { enemyId: order.enemyId, turns: 3 }, combat.turn)],
    };
  }

  if (order.type === 'fortify') {
    if (!Number.isInteger(order.lane) || order.lane < 0 || order.lane >= combat.board.size.columns) {
      return fail(combat, 'ILLEGAL_FORTIFY_LANE', '堅守路線不存在。');
    }
    const next = spendOrder(combat);
    if (!next) return fail(combat, 'NO_ORDERS', '軍令不足。');
    next.fortify = { lane: order.lane, remainingEnemyTurns: 2, reduction: 0.4 };
    return {
      ok: true,
      state: next,
      events: [gameEvent('FORTIFY_ORDERED', { lane: order.lane, turns: 2 }, combat.turn)],
    };
  }

  if (order.type === 'tactic' && order.tacticId === 'fire-arrows') {
    if (!Number.isInteger(order.lane) || order.lane < 0 || order.lane >= combat.board.size.columns) {
      return fail(combat, 'ILLEGAL_TACTIC_LANE', '火矢目標路線不存在。');
    }
    const next = consumeTactic(combat, 'fire-arrows');
    if (!next) return fail(combat, 'TACTIC_NOT_AVAILABLE', '未持有火矢軍策。');
    const events = [];
    for (const enemy of next.enemies.filter(({ lane, hp }) => lane === order.lane && hp > 0)) {
      enemy.hp -= 4;
      const statuses = (enemy.statuses ?? []).filter(({ type }) => type !== 'burn');
      statuses.push({ type: 'burn', remaining: 2, damage: 2 });
      enemy.statuses = statuses;
      events.push(gameEvent('FIRE_ARROWS_HIT', { enemyId: enemy.id, damage: 4 }, combat.turn));
    }
    next.enemies = next.enemies.filter(({ hp }) => hp > 0);
    if (next.enemies.length === 0) next.status = 'victory';
    return { ok: true, state: next, events };
  }

  if (order.type === 'tactic' && order.tacticId === 'first-aid') {
    const unit = combat.board.units[order.unitId];
    if (!unit || unit.hp <= 0) return fail(combat, 'ILLEGAL_HEAL_TARGET', '急救只可以用喺存活友軍。');
    const next = consumeTactic(combat, 'first-aid');
    if (!next) return fail(combat, 'TACTIC_NOT_AVAILABLE', '未持有急救軍策。');
    const target = next.board.units[order.unitId];
    const heal = Math.max(1, Math.ceil(target.maxHp * 0.3));
    const before = target.hp;
    target.hp = Math.min(target.maxHp, target.hp + heal);
    return {
      ok: true,
      state: next,
      events: [gameEvent('UNIT_HEALED', {
        unitId: target.id,
        amount: target.hp - before,
      }, combat.turn)],
    };
  }

  return fail(combat, 'UNKNOWN_ORDER', '未知軍令。');
}
