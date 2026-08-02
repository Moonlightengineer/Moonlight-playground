
import { gameEvent } from '../core/events.js';
import { canFocusEnemy } from './targeting.js';

export const ORDER_DURATION_SECONDS = 6;

function fail(combat, code, message) {
  return { ok: false, state: combat, events: [], error: { code, message } };
}

function spendOrder(combat) {
  if ((combat.ordersRemaining ?? 0) < 1) return null;
  return { ...structuredClone(combat), ordersRemaining: combat.ordersRemaining - 1 };
}

function consumeTactic(combat, tacticId) {
  const index = (combat.tactics ?? []).indexOf(tacticId);
  if (index < 0) return null;
  const tactics = [...combat.tactics];
  tactics.splice(index, 1);
  return { ...structuredClone(combat), tactics };
}

function validLane(combat, lane) {
  return Number.isInteger(lane) && lane >= 0 && lane < combat.board.size.columns;
}

function orderIsActive(combat, type) {
  return Boolean(combat[type]?.remainingSeconds > 0);
}

function rejectRefresh(combat, type) {
  if (!orderIsActive(combat, type)) return null;
  return fail(combat, 'ORDER_ALREADY_ACTIVE', '同類軍令生效期間不可重疊或刷新。');
}

export function applyOrder(combat, order, context = {}) {
  if (combat.status !== 'running') {
    return fail(combat, 'COMBAT_NOT_RUNNING', '戰鬥未進行，暫時不可使用軍令。');
  }

  if (['swap', 'reinforce'].includes(order?.type)) {
    return fail(
      combat,
      'COMBAT_RECONFIGURATION_LOCKED',
      '戰鬥開始後不可部署、拆解、換位或操作軍營。',
    );
  }

  if (order?.type === 'fortify') {
    const refresh = rejectRefresh(combat, 'fortify');
    if (refresh) return refresh;
    if (!validLane(combat, order.lane)) {
      return fail(combat, 'ILLEGAL_FORTIFY_LANE', '固守路線不存在。');
    }
    const next = spendOrder(combat);
    if (!next) return fail(combat, 'NO_ORDERS', '軍令不足。');
    next.fortify = {
      lane: order.lane,
      remainingSeconds: ORDER_DURATION_SECONDS,
      damageReduction: 0.35,
    };
    return {
      ok: true,
      state: next,
      events: [gameEvent('FORTIFY_ORDERED', {
        lane: order.lane,
        durationSeconds: ORDER_DURATION_SECONDS,
        damageReduction: 0.35,
      }, combat.turn)],
    };
  }

  if (order?.type === 'assault') {
    const refresh = rejectRefresh(combat, 'assault');
    if (refresh) return refresh;
    if (!validLane(combat, order.lane)) {
      return fail(combat, 'ILLEGAL_ASSAULT_LANE', '急攻路線不存在。');
    }
    const next = spendOrder(combat);
    if (!next) return fail(combat, 'NO_ORDERS', '軍令不足。');
    next.assault = {
      lane: order.lane,
      remainingSeconds: ORDER_DURATION_SECONDS,
      attackSpeedBonus: 0.3,
    };
    return {
      ok: true,
      state: next,
      events: [gameEvent('ASSAULT_ORDERED', {
        lane: order.lane,
        durationSeconds: ORDER_DURATION_SECONDS,
        attackSpeedBonus: 0.3,
      }, combat.turn)],
    };
  }

  if (order?.type === 'focus') {
    const refresh = rejectRefresh(combat, 'focus');
    if (refresh) return refresh;
    if (!canFocusEnemy(combat, order.enemyId, context.unitsById)) {
      return fail(combat, 'ILLEGAL_FOCUS_TARGET', '目標唔喺任何友軍原本合法攻擊範圍。');
    }
    const next = spendOrder(combat);
    if (!next) return fail(combat, 'NO_ORDERS', '軍令不足。');
    next.focus = {
      enemyId: order.enemyId,
      remainingSeconds: ORDER_DURATION_SECONDS,
      damageBonus: 0.2,
    };
    return {
      ok: true,
      state: next,
      events: [gameEvent('FOCUS_ORDERED', {
        enemyId: order.enemyId,
        durationSeconds: ORDER_DURATION_SECONDS,
        damageBonus: 0.2,
      }, combat.turn)],
    };
  }

  // Legacy tactics remain readable for old saves, but are no longer offered or rendered.
  if (order?.type === 'tactic' && order.tacticId === 'fire-arrows') {
    if (!validLane(combat, order.lane)) {
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

  if (order?.type === 'tactic' && order.tacticId === 'first-aid') {
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
