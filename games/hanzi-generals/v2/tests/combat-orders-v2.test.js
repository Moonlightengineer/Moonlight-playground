import test from 'node:test';
import assert from 'node:assert/strict';

import { createBoard, placeUnit } from '../src/board/board.js';
import { finishPhase, startBattle, startPhase } from '../src/battle/battle-lifecycle.js';
import { createCombatState, stepCombat } from '../src/combat/combat-engine.js';
import { applyOrder } from '../src/combat/orders.js';
import { reduceGame } from '../src/core/state-machine.js';
import { createExpedition } from '../src/expedition/expedition.js';
import { buildAppViewModel } from '../src/ui/view-model.js';

const unitsById = Object.freeze({
  'test-unit': Object.freeze({
    id: 'test-unit',
    name: '測試兵',
    kind: 'troop',
    maxHp: 500,
    damage: 10,
    attackEvery: 3,
    range: 5,
    pattern: 'same-lane',
  }),
});

const enemiesById = Object.freeze({
  'test-enemy': Object.freeze({
    id: 'test-enemy',
    name: '測試敵兵',
    maxHp: 1000,
    damage: 10,
    attackEvery: 1,
  }),
});

const context = Object.freeze({
  unitsById,
  enemiesById,
  resolveUnitDefinition(unit) {
    return unitsById[unit.definitionId];
  },
  spawnHeavyCavalryPair: () => [],
});

function fixtureCombat({ ordersRemaining = 3 } = {}) {
  let board = createBoard('base');
  const unit = {
    id: 'u1',
    definitionId: 'test-unit',
    kind: 'troop',
    hp: 500,
    maxHp: 500,
    cooldown: 0,
    evolution: null,
    statuses: [],
    cell: { column: 0, row: 0 },
  };
  board = placeUnit(board, unit, unit.cell);
  return createCombatState({
    board,
    enemies: [{
      id: 'e1',
      definitionId: 'test-enemy',
      lane: 0,
      distance: 0,
      hp: 1000,
      maxHp: 1000,
      cooldown: 0,
      statuses: [],
    }],
    wallHp: 1000,
    phaseIndex: 0,
    ordersRemaining,
  });
}

function stepMany(combat, count) {
  let current = combat;
  const events = [];
  for (let index = 0; index < count; index += 1) {
    const stepped = stepCombat(current, context);
    current = stepped.combat;
    events.push(...stepped.events);
  }
  return { combat: current, events };
}

test('fortify, assault and focus share three points, coexist, and cannot refresh their own type', () => {
  const fortify = applyOrder(fixtureCombat(), { type: 'fortify', lane: 0 }, context);
  assert.equal(fortify.ok, true);
  assert.equal(fortify.state.ordersRemaining, 2);
  assert.deepEqual(fortify.state.fortify, {
    lane: 0,
    remainingSeconds: 6,
    damageReduction: 0.35,
  });

  const refresh = applyOrder(fortify.state, { type: 'fortify', lane: 1 }, context);
  assert.equal(refresh.ok, false);
  assert.equal(refresh.error.code, 'ORDER_ALREADY_ACTIVE');
  assert.equal(refresh.state.ordersRemaining, 2);

  const assault = applyOrder(fortify.state, { type: 'assault', lane: 0 }, context);
  assert.equal(assault.ok, true);
  assert.equal(assault.state.ordersRemaining, 1);
  assert.deepEqual(assault.state.assault, {
    lane: 0,
    remainingSeconds: 6,
    attackSpeedBonus: 0.3,
  });

  const focus = applyOrder(assault.state, { type: 'focus', enemyId: 'e1' }, context);
  assert.equal(focus.ok, true);
  assert.equal(focus.state.ordersRemaining, 0);
  assert.deepEqual(focus.state.focus, {
    enemyId: 'e1',
    remainingSeconds: 6,
    damageBonus: 0.2,
  });
});

test('fortify reduces friendly damage by 35 percent and focus adds 20 percent damage', () => {
  const baseline = stepCombat(fixtureCombat(), context);
  const baselineFriendlyDamage = baseline.events.find(({ type }) => type === 'FRIENDLY_DAMAGED');
  const baselineHit = baseline.events.find(({ type }) => type === 'UNIT_HIT');
  assert.equal(baselineFriendlyDamage.payload.damage, 10);
  assert.equal(baselineHit.payload.damage, 10);

  const fortified = applyOrder(fixtureCombat(), { type: 'fortify', lane: 0 }, context);
  const focused = applyOrder(fortified.state, { type: 'focus', enemyId: 'e1' }, context);
  const stepped = stepCombat(focused.state, context);
  const reducedDamage = stepped.events.find(({ type }) => type === 'FRIENDLY_DAMAGED');
  const focusedHit = stepped.events.find(({ type }) => type === 'UNIT_HIT');
  assert.equal(reducedDamage.payload.damage, 6);
  assert.equal(focusedHit.payload.damage, 12);
});

test('assault provides a measurable 30 percent attack-speed increase for six simulated seconds', () => {
  const baseline = stepMany(fixtureCombat(), 6);
  const assault = applyOrder(fixtureCombat(), { type: 'assault', lane: 0 }, context);
  const accelerated = stepMany(assault.state, 6);
  const baselineHits = baseline.events.filter(({ type }) => type === 'UNIT_HIT').length;
  const acceleratedHits = accelerated.events.filter(({ type }) => type === 'UNIT_HIT').length;

  assert.equal(baselineHits, 2);
  assert.equal(acceleratedHits, 3);
  assert.equal(accelerated.combat.assault, null);
});

test('pause freezes order time and changing 1x or 2x speed does not alter six-step duration', () => {
  const ordered = applyOrder(fixtureCombat(), { type: 'fortify', lane: 0 }, context);
  const base = createExpedition('order-duration');
  const game = {
    ...base,
    status: 'combat',
    board: ordered.state.board,
    combat: { ...ordered.state, paused: true },
    currentBattle: {
      stageId: 'tutorial',
      phaseIndex: 0,
      phaseCount: 3,
      ordersRemaining: ordered.state.ordersRemaining,
    },
    legalActions: ['PAUSE', 'RESUME', 'SET_SPEED', 'STEP_COMBAT', 'ISSUE_ORDER'],
  };

  const pausedStep = reduceGame(game, { type: 'STEP_COMBAT' });
  assert.equal(pausedStep.ok, false);
  assert.equal(pausedStep.error.code, 'COMBAT_PAUSED');
  assert.equal(pausedStep.state.combat.fortify.remainingSeconds, 6);

  const speed = reduceGame(game, { type: 'SET_SPEED', speed: 2 });
  assert.equal(speed.ok, true);
  assert.equal(speed.state.combat.fortify.remainingSeconds, 6);

  let result = reduceGame(speed.state, { type: 'RESUME' });
  for (let index = 0; index < 5; index += 1) {
    result = reduceGame(result.state, { type: 'STEP_COMBAT' });
    assert.equal(result.ok, true);
    assert.equal(result.state.combat.fortify.remainingSeconds, 5 - index);
  }
  result = reduceGame(result.state, { type: 'STEP_COMBAT' });
  assert.equal(result.ok, true);
  assert.equal(result.state.combat.fortify, null);
});

test('battle command points remain spent across all three phases', () => {
  const battle = startBattle(createExpedition('shared-orders')).state;
  const phase = startPhase(battle).state;
  const finished = finishPhase(phase, {
    ...phase.combat,
    ordersRemaining: 1,
    status: 'victory',
  });

  assert.equal(finished.ok, true);
  assert.equal(finished.state.currentBattle.phaseIndex, 1);
  assert.equal(finished.state.currentBattle.ordersRemaining, 1);
});

test('combat reconfiguration orders are rejected without spending points', () => {
  const combat = fixtureCombat();
  for (const order of [
    { type: 'swap', unitIds: ['u1', 'u2'] },
    { type: 'reinforce', unitId: 'u1', targetCell: { column: 1, row: 0 } },
  ]) {
    const result = applyOrder(combat, order, context);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'COMBAT_RECONFIGURATION_LOCKED');
    assert.equal(result.state.ordersRemaining, 3);
  }
});

test('mobile command view exposes only the approved triad and remaining seconds', () => {
  const fortify = applyOrder(fixtureCombat(), { type: 'fortify', lane: 0 }, context);
  const base = createExpedition('order-view');
  const game = {
    ...base,
    status: 'combat',
    board: fortify.state.board,
    combat: fortify.state,
    currentBattle: {
      stageId: 'tutorial',
      phaseIndex: 0,
      phaseCount: 3,
      ordersRemaining: fortify.state.ordersRemaining,
    },
  };
  const view = buildAppViewModel(game, {
    settings: { speed: 1, reducedMotion: false, vibration: false },
    tutorial: base.tutorial,
    discoveredRecipeIds: [],
  });
  const labels = view.orders.actions.map(({ label }) => label);

  assert.equal(labels.includes('變陣'), false);
  assert.equal(labels.includes('援防'), false);
  assert.ok(labels.includes('固守1路'));
  assert.ok(labels.includes('急攻1路'));
  assert.ok(labels.includes('集火'));
  assert.ok(view.orders.statuses.some((text) => /固守.*6 秒/.test(text)));
});
