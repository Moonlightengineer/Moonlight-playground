from __future__ import annotations

from pathlib import Path
import re
import textwrap

ROOT = Path(__file__).resolve().parents[1]


def path_for(relative: str) -> Path:
    return ROOT / relative


def read(relative: str) -> str:
    return path_for(relative).read_text(encoding="utf-8")


def write(relative: str, content: str) -> None:
    path = path_for(relative)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content.rstrip() + "\n", encoding="utf-8")


def replace_once(relative: str, old: str, new: str) -> None:
    text = read(relative)
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{relative}: expected one exact match, found {count}")
    write(relative, text.replace(old, new, 1))


def replace_regex(relative: str, pattern: str, replacement: str, *, flags: int = re.S) -> None:
    text = read(relative)
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"{relative}: expected one regex match, found {count}: {pattern}")
    write(relative, updated)


ORDERS_JS = r"""
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
"""

COMMANDS_JS = r"""
import { GENERAL_BY_ID } from '../../../data/generals.js';
import { TUNING } from '../../../data/tuning.js';
import { canFocusEnemy } from '../../combat/targeting.js';
import { selectCampState, selectRerollState } from './cards.js';

export function selectOrderTargets(game) {
  const empty = { focusEnemyIds: [], fortifyLanes: [], assaultLanes: [] };
  if (game?.status !== 'combat' || !game.combat?.board) return empty;

  const { combat } = game;
  const focusEnemyIds = [...(combat.enemies ?? [])]
    .filter(({ id, hp }) => hp > 0 && canFocusEnemy(combat, id, GENERAL_BY_ID))
    .sort((a, b) => a.lane - b.lane || a.distance - b.distance || a.id.localeCompare(b.id))
    .map(({ id }) => id);
  const lanes = Array.from({ length: combat.board.size.columns }, (_, lane) => lane);

  return {
    focusEnemyIds,
    fortifyLanes: lanes,
    assaultLanes: [...lanes],
  };
}

function addConfigurationCommands(game, commands) {
  const hand = Array.isArray(game.deck?.hand) ? game.deck.hand : [];
  const drawCount = (game.deck?.drawPile?.length ?? 0) + (game.deck?.discardPile?.length ?? 0);
  const camp = selectCampState(game);
  const selected = game.selection?.cardIds ?? [];
  const boardCards = Object.keys(game.boardCards ?? {});
  const units = Object.keys(game.board?.units ?? {});

  if (drawCount > 0 && hand.length < TUNING.handSize) commands.add('DRAW_CARDS');
  if (hand.length || camp.count) commands.add('SELECT_CARD');
  if (hand.length && !camp.isFull) commands.add('MOVE_CARD_TO_CAMP');
  if (camp.count) commands.add('RETURN_CAMP_CARD');
  if (boardCards.length) commands.add('RETURN_BOARD_CARD');
  if (selected.length) commands.add('ASSEMBLE');
  if (hand.length) commands.add('RETAIN_CARDS');
  if (selectRerollState(game).available) commands.add('REROLL');
  if (units.length) commands.add('START_PHASE');
}

export function selectLegalCommands(game) {
  const commands = new Set();
  if (!game || typeof game !== 'object') return commands;

  switch (game.status) {
    case 'expedition-map':
      if (game.awaitingRoute) commands.add('CHOOSE_ROUTE');
      else if (game.nextStageId) commands.add('START_BATTLE');
      commands.add('RESET_RUN');
      break;
    case 'configuration':
      addConfigurationCommands(game, commands);
      commands.add('RESET_RUN');
      break;
    case 'combat':
      if (game.combat?.paused) commands.add('RESUME');
      else commands.add('PAUSE');
      commands.add('SET_SPEED');
      if (!game.combat?.paused) commands.add('STEP_COMBAT');
      if ((game.combat?.ordersRemaining ?? 0) > 0) commands.add('ISSUE_ORDER');
      commands.add('RESET_RUN');
      break;
    case 'battle-report':
      if (game.battleReport) commands.add('CONTINUE_AFTER_REPORT');
      commands.add('RESET_RUN');
      break;
    case 'reward':
      if ((game.rewardChoices ?? []).length) commands.add('CHOOSE_REWARD');
      commands.add('RESET_RUN');
      break;
    case 'victory':
    case 'defeat':
      commands.add('START_NEW_RUN');
      break;
    case 'error':
      commands.add('RESET_SAVE');
      commands.add('START_NEW_RUN');
      break;
    default:
      break;
  }
  return commands;
}
"""

HELP_CONTENT_JS = r"""
export const HELP_SECTIONS = Object.freeze([
  Object.freeze({
    id: 'objective',
    title: '遠征目標',
    body: '完成六場戰鬥並守住城牆。每場戰鬥有三段；敵軍突破防線後會攻擊單位或城牆，城牆生命歸零即遠征失敗。',
  }),
  Object.freeze({
    id: 'cards',
    title: '抽牌與保留',
    body: '整軍時抽牌至五張。每戰最少有一次免費重抽；亦可保留最多兩張字牌，令下一段更容易完成關鍵配方。',
  }),
  Object.freeze({
    id: 'assembly',
    title: '字牌合成',
    body: '點選兩至三張配方字牌，再點戰陣空格部署。單張字牌亦可先放到棋盤；相鄰而符合配方的字牌會自動合成武將或兵種。',
  }),
  Object.freeze({
    id: 'board',
    title: '戰陣、路線與射程',
    body: '每一欄代表一條敵軍路線，前排較接近敵人，後排適合受保護的遠程單位。點武將可查看射程與攻擊方式；集火只會影響原本合法攻擊目標。',
  }),
  Object.freeze({
    id: 'camp',
    title: '軍營',
    body: '軍營用來暫存未完成配方的字牌。軍營字牌可重新選取合成，亦可按「取回」放回手牌；容量不足時先合成或取回字牌。戰鬥進行時不可操作軍營。',
  }),
  Object.freeze({
    id: 'combat',
    title: '戰鬥流程',
    body: '開始一段後，雙方按模擬秒自動行動。可隨時暫停或切換 1×／2×速度；暫停時軍令效果不會倒數，速度只影響觀看快慢。',
  }),
  Object.freeze({
    id: 'orders',
    title: '軍令',
    body: '每戰共有三點軍令，由三段共用，每次消耗一點並生效六個模擬秒。「固守」令指定一路友軍受傷降低 35%；「急攻」令指定一路友軍攻速提高 30%；「集火」令合法目標優先並多受 20% 傷害。同類效果生效時不可刷新，不同軍令可以共存。',
  }),
  Object.freeze({
    id: 'rewards',
    title: '獎勵與進化',
    body: '第 1 至第 5 戰後各從三個具體選項揀一個，第 6 戰直接總結。所有選項都係本輪永久成長，包括牌庫調整、武將字包、兵種專精、軍營增援、擴陣及已招募武將進化。',
  }),
  Object.freeze({
    id: 'saves',
    title: '存檔與重新開始',
    body: '遊戲會在本機自動保存遠征。「重新開始遠征」會保留教學與設定；「完全清除資料並測試最新版」會刪除本遊戲的遠征、教學與設定，再重新載入目前部署版本。',
  }),
]);
"""

ORDERS_TEST_JS = r"""
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBoard, placeUnit } from '../src/board/board.js';
import { createCombatState } from '../src/combat/combat-engine.js';
import { applyOrder } from '../src/combat/orders.js';
import { GENERALS } from '../data/generals.js';
import { ENEMIES } from '../data/enemies.js';

const unitsById = Object.fromEntries(GENERALS.map((item) => [item.id, item]));
const enemiesById = Object.fromEntries(ENEMIES.map((item) => [item.id, item]));
const context = { unitsById, enemiesById, spawnHeavyCavalryPair: () => [] };

function makeUnit({ id = 'u1', definitionId = 'huang-zhong', column = 0, row = 0, hp } = {}) {
  const definition = unitsById[definitionId];
  return {
    id,
    definitionId,
    kind: definition.kind,
    hp: hp ?? definition.maxHp,
    maxHp: definition.maxHp,
    cooldown: 0,
    evolution: null,
    statuses: [],
    cell: { column, row },
  };
}

function fixtureCombat({ tactics = [] } = {}) {
  let board = createBoard('base');
  const unit = makeUnit();
  board = placeUnit(board, unit, unit.cell);
  return createCombatState({
    board,
    enemies: [
      { id: 'same-lane', definitionId: 'soldier', lane: 0, distance: 2, hp: 20, maxHp: 20, cooldown: 0, statuses: [] },
      { id: 'cross-lane', definitionId: 'soldier', lane: 2, distance: 1, hp: 20, maxHp: 20, cooldown: 0, statuses: [] },
    ],
    wallHp: 100,
    phaseIndex: 0,
    ordersRemaining: 3,
    tactics,
  });
}

test('focus rejects targets outside every friendly legal attack route without spending a point', () => {
  const combat = fixtureCombat();
  const result = applyOrder(combat, { type: 'focus', enemyId: 'cross-lane' }, context);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'ILLEGAL_FOCUS_TARGET');
  assert.equal(result.state.ordersRemaining, 3);
});

test('focus accepts a reachable same-lane target and spends one shared point', () => {
  const combat = fixtureCombat();
  const result = applyOrder(combat, { type: 'focus', enemyId: 'same-lane' }, context);
  assert.equal(result.ok, true);
  assert.equal(result.state.ordersRemaining, 2);
  assert.equal(result.state.focus.remainingSeconds, 6);
});

test('invalid fortify and assault lanes never spend command points', () => {
  for (const type of ['fortify', 'assault']) {
    const combat = fixtureCombat();
    const result = applyOrder(combat, { type, lane: 9 }, context);
    assert.equal(result.ok, false);
    assert.equal(result.state.ordersRemaining, 3);
  }
});

test('legacy swap and reinforce inputs are blocked during combat', () => {
  for (const order of [
    { type: 'swap', unitIds: ['u1', 'u2'] },
    { type: 'reinforce', unitId: 'u1', targetCell: { column: 1, row: 0 } },
  ]) {
    const result = applyOrder(fixtureCombat(), order, context);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'COMBAT_RECONFIGURATION_LOCKED');
    assert.equal(result.state.ordersRemaining, 3);
  }
});

test('legacy tactics remain load-compatible but are not part of the new command-point triad', () => {
  const fire = applyOrder(
    fixtureCombat({ tactics: ['fire-arrows', 'first-aid'] }),
    { type: 'tactic', tacticId: 'fire-arrows', lane: 0 },
    context,
  );
  assert.equal(fire.ok, true);
  assert.equal(fire.state.tactics.includes('fire-arrows'), false);
  assert.equal(fire.state.ordersRemaining, 3);

  fire.state.board.units.u1.hp = 5;
  const aid = applyOrder(
    fire.state,
    { type: 'tactic', tacticId: 'first-aid', unitId: 'u1' },
    context,
  );
  assert.equal(aid.ok, true);
  assert.ok(aid.state.board.units.u1.hp > 5);
  assert.equal(aid.state.ordersRemaining, 3);
});
"""

write('games/hanzi-generals/v2/src/combat/orders.js', textwrap.dedent(ORDERS_JS))
write('games/hanzi-generals/v2/src/core/selectors/commands.js', textwrap.dedent(COMMANDS_JS))
write('games/hanzi-generals/v2/src/ui/help-content.js', textwrap.dedent(HELP_CONTENT_JS))
write('games/hanzi-generals/v2/tests/orders.test.js', textwrap.dedent(ORDERS_TEST_JS))

# Combat engine: replace obsolete movement orders with timed effects.
combat_path = 'games/hanzi-generals/v2/src/combat/combat-engine.js'
replace_once(combat_path, "import { moveUnit } from '../board/board.js';\n", '')
replace_regex(
    combat_path,
    r"function applySwap\(.*?\n}\n\nfunction friendlyDamageAgainst",
    "function friendlyDamageAgainst",
)
replace_regex(
    combat_path,
    r"function friendlyDamageAgainst\(.*?\n}\n\nfunction enemyDamageBoost",
    r"""function friendlyDamageAgainst(target, baseDamage, enemies, focus) {
  const shielded = target.definitionId !== 'shield-enemy'
    && enemies.some((enemy) => (
      enemy.hp > 0
      && enemy.definitionId === 'shield-enemy'
      && enemy.lane === target.lane
      && enemy.distance < target.distance
    ));
  const bossShielded = target.definitionId === 'hua-xiong' && (target.shieldTurns ?? 0) > 0;
  const focusMultiplier = focus?.remainingSeconds > 0 && focus.enemyId === target.id
    ? 1 + (focus.damageBonus ?? 0.2)
    : 1;
  const shieldMultiplier = shielded || bossShielded ? 0.65 : 1;
  return Math.max(1, Math.floor(baseDamage * focusMultiplier * shieldMultiplier));
}

function enemyDamageBoost""",
)
replace_regex(
    combat_path,
    r"function friendlyDirectReduction\(.*?\n}\n\nfunction wallDirectReduction\(.*?\n}\n\nfunction maybeTriggerBossPhase",
    r"""function friendlyDirectReduction(board, unit, lane, fortify) {
  let multiplier = 1;
  const shield = Object.values(board.units).find((candidate) => (
    candidate.hp > 0
    && candidate.definitionId === 'shield-troop'
    && candidate.cell.column === unit.cell.column
    && candidate.cell.row + 1 === unit.cell.row
  ));
  if (shield) multiplier *= 0.75;
  if (fortify?.lane === lane && fortify.remainingSeconds > 0) {
    multiplier *= 1 - (fortify.damageReduction ?? 0.35);
  }
  return multiplier;
}

function maybeTriggerBossPhase""",
)
replace_once(
    combat_path,
    """    const damage = Math.max(1, Math.floor(
      boostedDamage * wallDirectReduction(enemy.lane, next.fortify),
    ));
""",
    """    const damage = Math.max(1, Math.floor(boostedDamage));
""",
)
replace_once(
    combat_path,
    """    focus: null,
    fortify: null,
    pendingOrders: [],
    tactics: [...tactics],
""",
    """    focus: null,
    fortify: null,
    assault: null,
    pendingOrders: [],
    tactics: [...tactics],
    paused: false,
""",
)

NEW_STEP_COMBAT = r"""
function tickTimedOrder(order) {
  if (!order) return null;
  const remainingSeconds = Math.max(0, (order.remainingSeconds ?? 0) - 1);
  return remainingSeconds > 0 ? { ...order, remainingSeconds } : null;
}

export function stepCombat(combat, context) {
  if (combat.status !== 'running') return { combat, events: [] };

  const next = clone(combat);
  const events = [];
  next.turn += 1;
  next.pendingOrders = [];

  for (const enemy of next.enemies) {
    applyBurn(enemy, next.turn, events);
    if (enemy.hp > 0) maybeTriggerBossPhase(next, enemy, context, events);
  }
  next.enemies = next.enemies.filter((enemy) => enemy.hp > 0);

  const units = Object.values(next.board.units)
    .filter((unit) => unit.hp > 0)
    .sort((a, b) => (
      a.cell.column - b.cell.column
      || a.cell.row - b.cell.row
      || a.id.localeCompare(b.id)
    ));

  for (const unit of units) {
    const assaultActive = next.assault?.remainingSeconds > 0
      && next.assault.lane === unit.cell.column;
    const attackSpeedMultiplier = assaultActive
      ? 1 + (next.assault.attackSpeedBonus ?? 0.3)
      : 1;
    unit.cooldown = (unit.cooldown ?? 0) - attackSpeedMultiplier;
    if (unit.cooldown > 0) continue;

    const unitDefinition = context.resolveUnitDefinition
      ? context.resolveUnitDefinition(unit)
      : definition(context, 'unitsById', unit.definitionId);
    const focusId = next.focus?.remainingSeconds > 0 ? next.focus.enemyId : null;
    const targets = findTargets(unit, next.enemies, unitDefinition, { focusId });
    if (!targets.length) {
      unit.cooldown = 0;
      continue;
    }

    for (const target of targets) {
      const damage = friendlyDamageAgainst(
        target,
        unitDefinition.damage,
        next.enemies,
        next.focus,
      );
      const hpBefore = target.hp;
      target.hp -= damage;
      events.push(eventAt(next.turn, 'UNIT_HIT', {
        attackerId: unit.id,
        targetId: target.id,
        damage,
        ...(unit.evolution ? { evolutionId: unit.evolution } : {}),
      }));
      if (hpBefore > 0 && target.hp <= 0) {
        events.push(eventAt(next.turn, 'ENEMY_DEFEATED', {
          enemyId: target.id,
          defeatedById: unit.id,
        }));
      }
    }
    const overflow = assaultActive ? Math.min(0, unit.cooldown) : 0;
    unit.cooldown = Math.max(0.1, unitDefinition.attackEvery + overflow);
  }

  next.enemies = next.enemies.filter((enemy) => enemy.hp > 0);
  if (next.focus && !next.enemies.some(({ id, hp }) => id === next.focus.enemyId && hp > 0)) {
    next.focus = null;
  }

  const enemyActors = [...next.enemies].sort((a, b) => (
    a.lane - b.lane
    || a.distance - b.distance
    || a.id.localeCompare(b.id)
  ));

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
        if (enemy.distance === 0) {
          damageLaneTarget(next, enemy, enemyDefinition, events, {
            multiplier: 1.5,
            impact: 'charge',
          });
        }
      } else if (enemy.distance > 0) {
        enemy.distance -= 1;
        events.push(eventAt(next.turn, 'ENEMY_MOVED', {
          enemyId: enemy.id,
          distance: enemy.distance,
        }));
      } else if (enemy.cooldown === 0) {
        damageLaneTarget(next, enemy, enemyDefinition, events);
      }
      continue;
    }

    if (enemy.definitionId === 'crossbow' && enemy.cooldown === 0) {
      damageLaneTarget(next, enemy, enemyDefinition, events, { preferRear: true });
      continue;
    }

    if (enemy.distance > 0) {
      enemy.distance -= 1;
      events.push(eventAt(next.turn, 'ENEMY_MOVED', {
        enemyId: enemy.id,
        distance: enemy.distance,
      }));
      continue;
    }

    if (enemy.cooldown === 0) damageLaneTarget(next, enemy, enemyDefinition, events);
    if ((enemy.shieldTurns ?? 0) > 0) enemy.shieldTurns -= 1;
  }

  for (const [unitId, unit] of Object.entries(next.board.units)) {
    if (unit.hp <= 0) delete next.board.units[unitId];
  }

  next.enemies = next.enemies.filter((enemy) => enemy.hp > 0);
  if (next.wallHp <= 0) next.status = 'defeat';
  else if (next.enemies.length === 0) next.status = 'victory';

  next.fortify = tickTimedOrder(next.fortify);
  next.assault = tickTimedOrder(next.assault);
  next.focus = tickTimedOrder(next.focus);

  return { combat: next, events };
}
"""
replace_regex(
    combat_path,
    r"export function stepCombat\(combat, context\) \{.*\Z",
    textwrap.dedent(NEW_STEP_COMBAT).strip(),
)

# Battle lifecycle: preserve shared points, freeze paused combat, and skip a sixth reward.
battle_path = 'games/hanzi-generals/v2/src/battle/battle-lifecycle.js'
replace_once(
    battle_path,
    "import { prepareBattleDeck } from '../deck/deck.js';\n",
    "import { prepareBattleDeck } from '../deck/deck.js';\nimport { advanceExpedition } from '../expedition/expedition.js';\n",
)
replace_once(
    battle_path,
    "currentBattle: { ...prepared.currentBattle, phaseIndex },",
    "currentBattle: { ...prepared.currentBattle, phaseIndex, ordersRemaining: combat.ordersRemaining },",
)
NEW_FINISH_BATTLE = r"""
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
"""
replace_regex(
    battle_path,
    r"export function finishBattle\(game, combat, events = \[\]\) \{.*?\n}\n\nexport function stepBattleCombat",
    textwrap.dedent(NEW_FINISH_BATTLE).strip() + "\n\nexport function stepBattleCombat",
)
replace_once(
    battle_path,
    """export function stepBattleCombat(game) {
  if (!game.combat) return failure(game, 'NO_COMBAT_SESSION', '未有進行中戰鬥。');
""",
    """export function stepBattleCombat(game) {
  if (!game.combat) return failure(game, 'NO_COMBAT_SESSION', '未有進行中戰鬥。');
  if (game.combat.paused) return failure(game, 'COMBAT_PAUSED', '戰鬥暫停期間不會推進模擬時間。');
""",
)

# State normalization: canonical permanent rewards and legacy timed-order migration.
state_path = 'games/hanzi-generals/v2/src/core/state-machine.js'
replace_once(state_path, "import { REWARDS } from '../../data/rewards.js';\n", '')
replace_regex(
    state_path,
    r"import \{\n  eligibleEvolutionGenerals,\n\} from '../expedition/evolution-eligibility.js';\n",
    '',
)
replace_once(
    state_path,
    "import { applyRewardChoice } from '../reward/reward-flow.js';",
    "import { assessRewardAvailability, applyRewardChoice, generateRewardOffer } from '../reward/reward-flow.js';",
)
replace_regex(
    state_path,
    r"const SAFE_REWARD_FALLBACKS = Object\.freeze\(\[.*?\]\);\n\n",
    '',
)
NEW_NORMALIZERS = r"""
function normalizeOrderDuration(order, legacyField, multiplier, canonical) {
  if (!order || typeof order !== 'object') return null;
  const direct = Number(order.remainingSeconds);
  const legacy = Number(order[legacyField]);
  const remainingSeconds = Number.isFinite(direct) && direct > 0
    ? Math.min(6, Math.ceil(direct))
    : Number.isFinite(legacy) && legacy > 0
      ? Math.min(6, Math.ceil(legacy * multiplier))
      : 6;
  return { ...order, ...canonical, remainingSeconds };
}

function normalizeCombatOrders(combat) {
  if (!combat || typeof combat !== 'object') return combat;
  return {
    ...combat,
    pendingOrders: [],
    fortify: normalizeOrderDuration(
      combat.fortify,
      'remainingEnemyTurns',
      3,
      { damageReduction: 0.35 },
    ),
    assault: normalizeOrderDuration(
      combat.assault,
      'remainingFriendlyTurns',
      2,
      { attackSpeedBonus: 0.3 },
    ),
    focus: normalizeOrderDuration(
      combat.focus,
      'remainingFriendlyTurns',
      2,
      { damageBonus: 0.2 },
    ),
  };
}

function rewardChoicesAreCanonical(state) {
  const choices = state.rewardChoices ?? [];
  return choices.length === 3
    && new Set(choices.map(({ id }) => id)).size === 3
    && choices.every((choice) => (
      choice?.concrete === true
      && choice?.permanent === true
      && assessRewardAvailability(state, choice).available
    ));
}

function normalizeRewardChoices(state) {
  if (state.status !== 'reward' || rewardChoicesAreCanonical(state)) return state;
  const generated = generateRewardOffer(state);
  const history = [...(state.rewardOfferHistory ?? [])];
  const lastIndex = history.length - 1;
  if (lastIndex >= 0 && history[lastIndex]?.battleNumber === generated.record.battleNumber) {
    history[lastIndex] = generated.record;
  } else {
    history.push(generated.record);
  }
  return {
    ...state,
    rng: generated.rng,
    rewardChoices: generated.choices,
    rewardOfferHistory: history,
  };
}
"""
replace_regex(
    state_path,
    r"function normalizeEvolutionRewards\(state\) \{.*?\n}\n\nexport function normalizeGameState",
    textwrap.dedent(NEW_NORMALIZERS).strip() + "\n\nexport function normalizeGameState",
)
replace_once(
    state_path,
    """  const migrated = normalizeLegacyCampBonus({
    ...state,
""",
    """  const migrated = normalizeLegacyCampBonus({
    ...state,
    combat: normalizeCombatOrders(state.combat),
""",
)
replace_once(state_path, '  return normalizeEvolutionRewards(migrated);', '  return normalizeRewardChoices(migrated);')
replace_once(
    state_path,
    """  if (report.nextStatus === 'defeat') {
""",
    """  if (report.nextStatus === 'victory') {
    return success({
      ...game,
      status: 'victory',
      combat: null,
      currentBattle: null,
      currentBattleResult: null,
      nextStageId: null,
      rewardChoices: [],
      battleReport: null,
      lastBattleReport: report,
      legalActions: ['START_NEW_RUN'],
    });
  }
  if (report.nextStatus === 'defeat') {
""",
)

# Reward history stores the concrete Chinese name selected by the player.
rewards_path = 'games/hanzi-generals/v2/src/expedition/rewards.js'
replace_once(
    rewards_path,
    """        baseId,
        battleIndex: before.completedBattleIds.length + 1,
""",
    """        baseId,
        displayName: reward.name ?? null,
        battleIndex: before.completedBattleIds.length + 1,
""",
)

# View model: canonical result data and approved order triad.
view_path = 'games/hanzi-generals/v2/src/ui/view-model.js'
replace_once(
    view_path,
    "import { REWARDS } from '../../data/rewards.js';\n",
    "import { REWARDS } from '../../data/rewards.js';\nimport { STARTING_RECIPE_IDS } from '../../data/recipes.js';\n",
)
replace_regex(
    view_path,
    r"const STARTING_RECIPES = new Set\([^\n]+\);",
    'const STARTING_RECIPES = new Set(STARTING_RECIPE_IDS);',
    flags=0,
)
RESULT_HELPER = r"""
function rewardHistoryName(entry) {
  const savedName = entry?.displayName ?? entry?.name;
  if (typeof savedName === 'string' && savedName.trim()) return savedName;
  const baseId = entry?.baseId ?? entry?.rewardId;
  return REWARDS.find(({ id }) => id === baseId)?.name ?? '已取得獎勵';
}
"""
replace_once(
    view_path,
    'function buildResult(game) {',
    textwrap.dedent(RESULT_HELPER).strip() + '\n\nfunction buildResult(game) {',
)
replace_once(
    view_path,
    "    rewardsText: rewards.length ? rewards.map(({ rewardId }) => REWARDS.find(({ id }) => id === rewardId)?.name ?? rewardId).join('、') : '未有可記錄獎勵。',",
    "    rewardsText: rewards.length ? rewards.map(rewardHistoryName).join('、') : '未有可記錄獎勵。',",
)
NEW_BUILD_ORDERS = r"""
function buildOrders(game, profile, orderTargets) {
  if (game.status !== 'combat') return { visible: false, statuses: [], actions: [], focusEnemyIds: [] };
  const statuses = [];
  const focusSeconds = game.combat.focus?.remainingSeconds
    ?? Math.min(6, (game.combat.focus?.remainingFriendlyTurns ?? 0) * 2);
  const fortifySeconds = game.combat.fortify?.remainingSeconds
    ?? Math.min(6, (game.combat.fortify?.remainingEnemyTurns ?? 0) * 3);
  const assaultSeconds = game.combat.assault?.remainingSeconds
    ?? Math.min(6, (game.combat.assault?.remainingFriendlyTurns ?? 0) * 2);
  if (game.combat.focus) {
    const target = game.combat.enemies.find(({ id }) => id === game.combat.focus.enemyId);
    const targetName = ENEMY_BY_ID[target?.definitionId]?.name ?? '指定敵軍';
    statuses.push(`集火生效：${targetName}，剩餘 ${focusSeconds} 秒`);
  }
  if (game.combat.fortify) {
    statuses.push(`固守：第 ${game.combat.fortify.lane + 1} 路，剩餘 ${fortifySeconds} 秒`);
  }
  if (game.combat.assault) {
    statuses.push(`急攻：第 ${game.combat.assault.lane + 1} 路，剩餘 ${assaultSeconds} 秒`);
  }

  const noOrders = game.combat.ordersRemaining < 1;
  const paused = Boolean(game.combat.paused);
  const fortifyActive = Boolean(game.combat.fortify);
  const assaultActive = Boolean(game.combat.assault);
  const focusActive = Boolean(game.combat.focus);
  const actions = [
    { label: paused ? '繼續' : '暫停', action: paused ? 'resume' : 'pause', data: {}, className: 'primary-button', disabled: false },
    { label: profile.settings.speed === 2 ? '速度 1×' : '速度 2×', action: 'set-speed', data: { speed: profile.settings.speed === 2 ? 1 : 2 }, className: '', disabled: false },
    { label: '玩法', action: 'open-help', data: {}, className: '', disabled: false },
    ...orderTargets.fortifyLanes.map((lane) => ({
      label: `固守${lane + 1}路`,
      action: 'issue-lane-order',
      data: { orderType: 'fortify', lane },
      className: game.combat.fortify?.lane === lane ? 'is-active-order' : '',
      disabled: noOrders || fortifyActive,
      ariaLabel: `固守第 ${lane + 1} 路：消耗一點軍令，友軍受傷降低 35%，持續六秒`,
    })),
    ...orderTargets.assaultLanes.map((lane) => ({
      label: `急攻${lane + 1}路`,
      action: 'issue-lane-order',
      data: { orderType: 'assault', lane },
      className: game.combat.assault?.lane === lane ? 'is-active-order' : '',
      disabled: noOrders || assaultActive,
      ariaLabel: `急攻第 ${lane + 1} 路：消耗一點軍令，友軍攻速提高 30%，持續六秒`,
    })),
    {
      label: '集火',
      action: 'begin-order',
      data: { orderType: 'focus' },
      className: focusActive ? 'is-active-order' : '',
      disabled: noOrders || focusActive || !orderTargets.focusEnemyIds.length,
      ariaLabel: '集火：消耗一點軍令，合法目標優先並多受 20% 傷害，持續六秒',
    },
  ];
  return {
    visible: true,
    statuses,
    actions,
    focusEnemyIds: [...orderTargets.focusEnemyIds],
  };
}
"""
replace_regex(
    view_path,
    r"function buildOrders\(game, profile, orderTargets\) \{.*?\n}\n\nfunction buildDetails",
    textwrap.dedent(NEW_BUILD_ORDERS).strip() + '\n\nfunction buildDetails',
)

# Interaction layer: focus target selection plus one-tap, auto-paused lane confirmation.
interactions_path = 'games/hanzi-generals/v2/src/ui/interactions.js'
NEW_ORDER_FROM_DATASET = r"""
function orderFromDataset(dataset) {
  if (dataset.orderType === 'focus') {
    return { type: 'focus', enemyId: dataset.enemyId };
  }
  if (dataset.orderType === 'fortify' || dataset.orderType === 'assault') {
    return { type: dataset.orderType, lane: number(dataset.lane) };
  }
  if (dataset.orderType === 'tactic') {
    return {
      type: 'tactic',
      tacticId: dataset.tacticId,
      lane: dataset.lane === undefined ? undefined : number(dataset.lane),
      unitId: dataset.unitId || undefined,
    };
  }
  return null;
}
"""
replace_regex(
    interactions_path,
    r"function orderFromDataset\(dataset\) \{.*?\n}\n\nfunction rememberInteractiveState",
    textwrap.dedent(NEW_ORDER_FROM_DATASET).strip() + '\n\nfunction rememberInteractiveState',
)
replace_regex(
    interactions_path,
    r"function cellFromElement\(element\) \{.*?\n}\n\nfunction enemyToken",
    'function enemyToken',
)
NEW_DECORATE = r"""
function decorateOrderTargets(root, mode, getViewModel) {
  clearOrderDecorations(root);
  root.dataset.orderMode = mode.type;
  const focusEnemyIds = getViewModel()?.orders?.focusEnemyIds ?? [];
  if (mode.type !== 'focus') return;

  for (const enemyId of focusEnemyIds) {
    const token = enemyToken(root, enemyId);
    markTarget(token, 'order-focus-target', { enemyId });
    token?.setAttribute('role', 'button');
    if (token) token.tabIndex = 0;
  }
  addPrompt(root, '集火：點選友軍原本可以攻擊嘅敵人。');
}
"""
replace_regex(
    interactions_path,
    r"function decorateOrderTargets\(root, mode, getViewModel\) \{.*?\n}\n\nfunction selectedInCamp",
    textwrap.dedent(NEW_DECORATE).strip() + '\n\nfunction selectedInCamp',
)
replace_once(
    interactions_path,
    """    const result = dispatch(action);
    if (didSucceed(result) && resumeAfter) dispatch({ type: 'RESUME' });
""",
    """    const result = dispatch(action);
    if (resumeAfter) dispatch({ type: 'RESUME' });
""",
)
ISSUE_LANE_HELPER = r"""
  function issueLaneOrder(dataset) {
    const order = orderFromDataset(dataset);
    if (!order) return;
    const resumeAfter = Boolean(root.querySelector('#orders [data-action="pause"]'));
    if (resumeAfter && !didSucceed(dispatch({ type: 'PAUSE' }))) return;
    dispatch({ type: 'ISSUE_ORDER', order });
    if (resumeAfter) dispatch({ type: 'RESUME' });
  }
"""
replace_once(
    interactions_path,
    """  function cancelOrder() {
    const resumeAfter = Boolean(orderMode?.resumeAfter);
    orderMode = null;
    clearOrderDecorations(root);
    if (resumeAfter) dispatch({ type: 'RESUME' });
  }
""",
    """  function cancelOrder() {
    const resumeAfter = Boolean(orderMode?.resumeAfter);
    orderMode = null;
    clearOrderDecorations(root);
    if (resumeAfter) dispatch({ type: 'RESUME' });
  }

""" + textwrap.dedent(ISSUE_LANE_HELPER).strip('\n') + '\n',
)
replace_regex(
    interactions_path,
    r"      case 'order-select-unit':.*?      case 'order-focus-target':",
    "      case 'order-focus-target':",
)
replace_once(
    interactions_path,
    """      case 'issue-order': {
""",
    """      case 'issue-lane-order':
        issueLaneOrder(target.dataset);
        break;
      case 'issue-order': {
""",
)

# Contract tests that intentionally described the superseded movement-order design.
selectors_path = 'games/hanzi-generals/v2/tests/selectors.test.js'
NEW_SELECTOR_TEST = r"""
test('selectOrderTargets returns deterministic focus, fortify and assault targets only', () => {
  const game = configurationFixture();
  const board = createBoard('base');
  board.units = {
    'unit-1': unit('unit-1', 'huang-zhong', 0, 0),
    'unit-2': unit('unit-2', 'zhao-yun', 0, 1),
  };
  const combat = {
    board,
    enemies: [
      { id: 'enemy-1', definitionId: 'raider', lane: 0, distance: 1, hp: 10, maxHp: 10 },
      { id: 'enemy-2', definitionId: 'raider', lane: 2, distance: 3, hp: 10, maxHp: 10 },
    ],
    ordersRemaining: 2,
  };
  const targets = selectOrderTargets({ ...game, status: 'combat', combat });
  assert.deepEqual(targets.focusEnemyIds, ['enemy-1']);
  assert.deepEqual(targets.fortifyLanes, [0, 1, 2]);
  assert.deepEqual(targets.assaultLanes, [0, 1, 2]);
  assert.equal(targets.swapPairs, undefined);
  assert.equal(targets.reinforce, undefined);
});
"""
replace_regex(
    selectors_path,
    r"test\('selectOrderTargets returns deterministic swap, reinforce, focus and fortify targets'.*?\n}\);\n\ntest\('selectLegalCommands",
    textwrap.dedent(NEW_SELECTOR_TEST).strip() + "\n\ntest('selectLegalCommands",
)

app_boundary_path = 'games/hanzi-generals/v2/tests/app-boundary.test.js'
NEW_APP_BOUNDARY_TEST = r"""
test('interaction targeting consumes ViewModel targets without reintroducing combat movement', async () => {
  const interactions = await source('src/ui/interactions.js');
  assert.match(interactions, /getViewModel/);
  assert.match(interactions, /focusEnemyIds/);
  assert.match(interactions, /issue-lane-order/);
  assert.doesNotMatch(interactions, /swapPairs/);
  assert.doesNotMatch(interactions, /reinforce/);
  assert.doesNotMatch(interactions, /order-swap-target/);
  assert.doesNotMatch(interactions, /function distance\(/);
  assert.doesNotMatch(interactions, /canFocusEnemy/);
});
"""
replace_regex(
    app_boundary_path,
    r"test\('interaction targeting consumes ViewModel targets instead of recalculating gameplay legality'.*?\n}\);",
    textwrap.dedent(NEW_APP_BOUNDARY_TEST).strip(),
)

ui_contract_path = 'games/hanzi-generals/v2/tests/ui-contract.test.js'
NEW_UI_INTERACTION_TEST = r"""
test('interaction layer translates intents and consumes canonical ViewModel targets', async () => {
  const interactions = await source('src/ui/interactions.js');
  for (const action of [
    'select-card', 'select-camp-card', 'return-camp-card', 'choose-cell',
    'move-card-to-camp', 'draw-cards', 'reroll', 'start-phase', 'choose-route',
    'choose-reward', 'begin-order', 'order-focus-target', 'cancel-order',
    'issue-lane-order', 'issue-order',
  ]) assert.match(interactions, new RegExp(`'${action}'`));
  assert.match(interactions, /getViewModel/);
  assert.match(interactions, /focusEnemyIds/);
  assert.doesNotMatch(interactions, /swapPairs/);
  assert.doesNotMatch(interactions, /reinforce/);
  assert.doesNotMatch(interactions, /order-swap-target/);
  assert.doesNotMatch(interactions, /order-reposition-target/);
  assert.doesNotMatch(interactions, /function distance\(/);
});
"""
replace_regex(
    ui_contract_path,
    r"test\('interaction layer translates intents and consumes canonical ViewModel targets'.*?\n}\);",
    textwrap.dedent(NEW_UI_INTERACTION_TEST).strip(),
)
NEW_UI_OWNER_TEST = r"""
test('ViewModel and panel owners render spatial battle, timed-order and reward contracts', async () => {
  const renderSource = await renderArchitectureSource();
  assert.match(renderSource, /buildBattleStage/);
  assert.match(renderSource, /--enemy-progress/);
  assert.match(renderSource, /enemy\.distance/);
  assert.match(renderSource, /--enemy-columns/);
  assert.match(renderSource, /selectOrderTargets/);
  assert.match(renderSource, /focusEnemyIds/);
  assert.match(renderSource, /fortifyLanes/);
  assert.match(renderSource, /assaultLanes/);
  assert.match(renderSource, /remainingSeconds/);
  assert.doesNotMatch(renderSource, /remainingFriendlyTurns/);
  assert.doesNotMatch(renderSource, /remainingEnemyTurns/);
  assert.match(renderSource, /reward-name/);
  assert.match(renderSource, /reward-summary/);
  assert.match(renderSource, /reward-effect/);
  assert.match(renderSource, /reward-use-case/);
  assert.match(renderSource, /reward\.description\.summary/);
  assert.match(renderSource, /reward\.description\.effect/);
  assert.match(renderSource, /reward\.description\.useCase/);
});
"""
replace_regex(
    ui_contract_path,
    r"test\('ViewModel and panel owners render spatial battle, order and reward contracts'.*?\n}\);",
    textwrap.dedent(NEW_UI_OWNER_TEST).strip(),
)

combat_test_path = 'games/hanzi-generals/v2/tests/combat-engine.test.js'
NEW_DURATION_TEST = r"""
test('timed orders decrease once per simulated second', () => {
  const combat = createCombatState({
    board: createBoard('base'),
    enemies: [enemyAtWall({ id: 'a' }), enemyAtWall({ id: 'b', lane: 2 })],
    wallHp: 100,
    phaseIndex: 0,
    ordersRemaining: 2,
  });
  combat.fortify = { lane: 1, remainingSeconds: 6, damageReduction: 0.35 };
  const result = stepCombat(combat, context);
  assert.equal(result.combat.fortify.remainingSeconds, 5);
});
"""
replace_regex(
    combat_test_path,
    r"test\('fortify duration decreases once per enemy action round'.*?\n}\);",
    textwrap.dedent(NEW_DURATION_TEST).strip(),
)

browser_regression_path = 'scripts/hanzi_v2_browser_ui_regressions.mjs'
replace_once(browser_regression_path, "name: '守2路'", "name: '固守2路'")

print('HANZI_V2_APPROVED_GAPS_APPLIED')
