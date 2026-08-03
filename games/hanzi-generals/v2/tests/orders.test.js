
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
