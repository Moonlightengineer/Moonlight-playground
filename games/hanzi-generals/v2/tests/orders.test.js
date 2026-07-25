import test from 'node:test';
import assert from 'node:assert/strict';
import { createBoard, placeUnit } from '../src/board/board.js';
import { createCombatState, stepCombat } from '../src/combat/combat-engine.js';
import { applyOrder } from '../src/combat/orders.js';
import { GENERALS } from '../data/generals.js';
import { ENEMIES } from '../data/enemies.js';

const unitsById = Object.fromEntries(GENERALS.map((item) => [item.id, item]));
const enemiesById = Object.fromEntries(ENEMIES.map((item) => [item.id, item]));
const context = {
  unitsById,
  enemiesById,
  spawnHeavyCavalryPair: () => [],
};

function makeUnit({ id, definitionId = 'huang-zhong', column, row, hp } = {}) {
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
  board = placeUnit(board, makeUnit({ id: 'u1', column: 0, row: 1 }), { column: 0, row: 1 });
  board = placeUnit(board, makeUnit({ id: 'u2', definitionId: 'guan-yu', column: 1, row: 1 }), { column: 1, row: 1 });
  return createCombatState({
    board,
    enemies: [{ id: 'e1', definitionId: 'soldier', lane: 0, distance: 2, hp: 8, maxHp: 8, cooldown: 0, statuses: [] }],
    wallHp: 100,
    phaseIndex: 0,
    ordersRemaining: 3,
    tactics,
  });
}

function oneUnitTwoLaneCombat() {
  let board = createBoard('base');
  board = placeUnit(board, makeUnit({ id: 'u1', column: 0, row: 0 }), { column: 0, row: 0 });
  return createCombatState({
    board,
    enemies: [
      { id: 'same-lane', definitionId: 'soldier', lane: 0, distance: 2, hp: 20, maxHp: 20, cooldown: 0, statuses: [] },
      { id: 'cross-lane', definitionId: 'soldier', lane: 2, distance: 1, hp: 20, maxHp: 20, cooldown: 0, statuses: [] },
    ],
    wallHp: 100,
    phaseIndex: 0,
    ordersRemaining: 3,
  });
}

function multiAttackerCombat() {
  let board = createBoard('base');
  board = placeUnit(board, makeUnit({ id: 'u1', column: 0, row: 0 }), { column: 0, row: 0 });
  board = placeUnit(board, makeUnit({ id: 'u2', column: 0, row: 1 }), { column: 0, row: 1 });
  return createCombatState({
    board,
    enemies: [{ id: 'e1', definitionId: 'soldier', lane: 0, distance: 1, hp: 100, maxHp: 100, cooldown: 0, statuses: [] }],
    wallHp: 100,
    phaseIndex: 0,
    ordersRemaining: 3,
  });
}

test('swap requires adjacent living idle units and spends one order', () => {
  const combat = fixtureCombat();
  const result = applyOrder(combat, { type: 'swap', unitIds: ['u1', 'u2'] }, context);
  assert.equal(result.ok, true);
  assert.equal(result.state.ordersRemaining, 2);
  assert.equal(result.state.pendingOrders[0].type, 'swap');
  const stepped = stepCombat(result.state, context);
  assert.deepEqual(stepped.combat.board.units.u1.cell, { column: 1, row: 1 });
  assert.deepEqual(stepped.combat.board.units.u2.cell, { column: 0, row: 1 });
});

test('swap rejects an adjacent empty cell without spending an order', () => {
  const combat = fixtureCombat();
  const result = applyOrder(combat, {
    type: 'swap',
    unitId: 'u1',
    targetCell: { column: 0, row: 0 },
  }, context);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'SWAP_REQUIRES_TWO_UNITS');
  assert.equal(result.state.ordersRemaining, 3);
  assert.deepEqual(result.state.pendingOrders, []);
});

test('focus rejects a cross-lane target for a same-lane unit', () => {
  const combat = oneUnitTwoLaneCombat();
  const result = applyOrder(combat, { type: 'focus', enemyId: 'cross-lane' }, context);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'ILLEGAL_FOCUS_TARGET');
  assert.equal(result.state.ordersRemaining, 3);
});

test('focus accepts a target within the unit original lane and range', () => {
  const combat = oneUnitTwoLaneCombat();
  const result = applyOrder(combat, { type: 'focus', enemyId: 'same-lane' }, context);
  assert.equal(result.ok, true);
  assert.equal(result.state.ordersRemaining, 2);
});

test('focus lasts three friendly action rounds, not three individual attackers', () => {
  const focus = applyOrder(multiAttackerCombat(), { type: 'focus', enemyId: 'e1' }, context);
  assert.equal(focus.ok, true);
  const firstRound = stepCombat(focus.state, context);
  assert.equal(firstRound.combat.focus.remainingFriendlyTurns, 2);
});

test('focus lasts three friendly turns and fortify lasts two enemy turns', () => {
  const focus = applyOrder(fixtureCombat(), { type: 'focus', enemyId: 'e1' }, context);
  assert.equal(focus.ok, true);
  assert.deepEqual(focus.state.focus, { enemyId: 'e1', remainingFriendlyTurns: 3 });

  const fortified = applyOrder(focus.state, { type: 'fortify', lane: 0 }, context);
  assert.equal(fortified.ok, true);
  assert.equal(fortified.state.fortify.remainingEnemyTurns, 2);
  assert.equal(fortified.state.ordersRemaining, 1);
});

test('illegal orders do not spend command points', () => {
  const combat = fixtureCombat();
  const result = applyOrder(combat, { type: 'fortify', lane: 9 }, context);
  assert.equal(result.ok, false);
  assert.equal(result.state.ordersRemaining, 3);
  assert.equal(result.error.code, 'ILLEGAL_FORTIFY_LANE');
});

test('fire arrows burns a lane and first aid heals one living unit', () => {
  const fire = applyOrder(
    fixtureCombat({ tactics: ['fire-arrows', 'first-aid'] }),
    { type: 'tactic', tacticId: 'fire-arrows', lane: 0 },
    context,
  );
  assert.equal(fire.ok, true);
  assert.equal(fire.state.tactics.includes('fire-arrows'), false);
  assert.equal(fire.state.enemies[0].hp, 4);
  assert.equal(fire.state.enemies[0].statuses[0].type, 'burn');

  fire.state.board.units.u1.hp = 5;
  const aid = applyOrder(
    fire.state,
    { type: 'tactic', tacticId: 'first-aid', unitId: 'u1' },
    context,
  );
  assert.equal(aid.ok, true);
  assert.equal(aid.state.tactics.includes('first-aid'), false);
  assert.ok(aid.state.board.units.u1.hp > 5);
});
