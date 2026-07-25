import test from 'node:test';
import assert from 'node:assert/strict';
import { createBoard, placeUnit } from '../src/board/board.js';
import { createCombatState, stepCombat } from '../src/combat/combat-engine.js';
import { findTargets } from '../src/combat/targeting.js';
import { GENERALS } from '../data/generals.js';
import { ENEMIES } from '../data/enemies.js';

const context = {
  unitsById: Object.fromEntries(GENERALS.map((item) => [item.id, item])),
  enemiesById: Object.fromEntries(ENEMIES.map((item) => [item.id, item])),
  spawnHeavyCavalryPair(lane) {
    return [
      { id: 'boss-cavalry-1', definitionId: 'heavy-cavalry', lane, distance: 3, hp: 16, maxHp: 16, cooldown: 0, chargeIn: 3, statuses: [] },
      { id: 'boss-cavalry-2', definitionId: 'heavy-cavalry', lane: Math.max(0, lane - 1), distance: 3, hp: 16, maxHp: 16, cooldown: 0, chargeIn: 3, statuses: [] },
    ];
  },
};

function unit(definitionId = 'huang-zhong', overrides = {}) {
  const definition = context.unitsById[definitionId];
  return {
    id: 'u1',
    definitionId,
    kind: definition.kind,
    hp: definition.maxHp,
    maxHp: definition.maxHp,
    cooldown: 0,
    evolution: null,
    statuses: [],
    ...overrides,
  };
}

function enemyAtWall(overrides = {}) {
  return {
    id: 'e1',
    definitionId: 'soldier',
    lane: 1,
    distance: 0,
    hp: 8,
    maxHp: 8,
    cooldown: 0,
    statuses: [],
    ...overrides,
  };
}

function eventOf(result, type) {
  return result.events.find((event) => event.type === type);
}

test('same-lane ranged unit selects the nearest reachable enemy', () => {
  const source = { id: 'u1', definitionId: 'huang-zhong', cell: { column: 1, row: 2 } };
  const enemies = [
    { id: 'far', lane: 1, distance: 3, hp: 8 },
    { id: 'near', lane: 1, distance: 2, hp: 8 },
    { id: 'other', lane: 0, distance: 1, hp: 8 },
  ];
  assert.deepEqual(
    findTargets(source, enemies, { range: 5, pattern: 'same-lane' }).map(({ id }) => id),
    ['near'],
  );
});

test('focus changes priority only within the original same-lane pattern', () => {
  const source = { id: 'u1', definitionId: 'huang-zhong', cell: { column: 1, row: 0 } };
  const enemies = [
    { id: 'same-near', lane: 1, distance: 1, hp: 8 },
    { id: 'same-far', lane: 1, distance: 3, hp: 8 },
    { id: 'cross-near', lane: 0, distance: 0, hp: 8 },
  ];
  assert.deepEqual(
    findTargets(source, enemies, { range: 5, pattern: 'same-lane' }, { focusId: 'same-far' }).map(({ id }) => id),
    ['same-far'],
  );
  assert.deepEqual(
    findTargets(source, enemies, { range: 5, pattern: 'same-lane' }, { focusId: 'cross-near' }).map(({ id }) => id),
    ['same-near'],
  );
});

test('friendly hit event identifies attacker, target, and damage', () => {
  let board = createBoard('base');
  board = placeUnit(board, unit('huang-zhong', { id: 'archer-1' }), { column: 1, row: 0 });
  const combat = createCombatState({
    board,
    enemies: [enemyAtWall({ id: 'target-1', distance: 2 })],
    wallHp: 100,
    phaseIndex: 0,
    ordersRemaining: 3,
  });
  const result = stepCombat(combat, context);
  assert.deepEqual(eventOf(result, 'UNIT_HIT')?.payload, {
    attackerId: 'archer-1',
    targetId: 'target-1',
    damage: 7,
  });
});

test('enemy damage event identifies attacker, friendly target, and damage', () => {
  let board = createBoard('base');
  board = placeUnit(board, unit('shield-troop', { id: 'front' }), { column: 1, row: 0 });
  const combat = createCombatState({
    board,
    enemies: [enemyAtWall({ id: 'attacker-1' })],
    wallHp: 100,
    phaseIndex: 0,
    ordersRemaining: 3,
  });
  const result = stepCombat(combat, context);
  assert.deepEqual(eventOf(result, 'FRIENDLY_DAMAGED')?.payload, {
    attackerId: 'attacker-1',
    targetId: 'front',
    damage: 2,
    impact: 'attack',
  });
});

test('wall damage event identifies attacker, lane, and damage', () => {
  const combat = createCombatState({
    board: createBoard('base'),
    enemies: [enemyAtWall({ id: 'wall-attacker' })],
    wallHp: 100,
    phaseIndex: 0,
    ordersRemaining: 3,
  });
  const result = stepCombat(combat, context);
  assert.deepEqual(eventOf(result, 'WALL_DAMAGED')?.payload, {
    attackerId: 'wall-attacker',
    damage: 2,
    lane: 1,
    impact: 'attack',
  });
});

test('enemy defeat event identifies defeated enemy and final attacker', () => {
  let board = createBoard('base');
  board = placeUnit(board, unit('huang-zhong', { id: 'finisher' }), { column: 1, row: 0 });
  const combat = createCombatState({
    board,
    enemies: [enemyAtWall({ id: 'fragile-enemy', distance: 2, hp: 7, maxHp: 7 })],
    wallHp: 100,
    phaseIndex: 0,
    ordersRemaining: 3,
  });
  const result = stepCombat(combat, context);
  assert.deepEqual(eventOf(result, 'ENEMY_DEFEATED')?.payload, {
    enemyId: 'fragile-enemy',
    defeatedById: 'finisher',
  });
});

test('friendly defeat event identifies defeated unit and final attacker', () => {
  let board = createBoard('base');
  board = placeUnit(board, unit('shield-troop', {
    id: 'fragile-unit',
    hp: 2,
    maxHp: 22,
    cooldown: 2,
  }), { column: 1, row: 0 });
  const combat = createCombatState({
    board,
    enemies: [enemyAtWall({ id: 'unit-finisher' })],
    wallHp: 100,
    phaseIndex: 0,
    ordersRemaining: 3,
  });
  const result = stepCombat(combat, context);
  assert.deepEqual(eventOf(result, 'UNIT_DEFEATED')?.payload, {
    unitId: 'fragile-unit',
    defeatedById: 'unit-finisher',
  });
});

test('enemy at distance zero damages wall when the lane is empty', () => {
  const combat = createCombatState({
    board: createBoard('base'),
    enemies: [enemyAtWall()],
    wallHp: 100,
    phaseIndex: 0,
    ordersRemaining: 3,
  });
  const result = stepCombat(combat, context);
  assert.equal(result.combat.wallHp, 98);
  assert.equal(result.events.some(({ type }) => type === 'WALL_DAMAGED'), true);
});

test('frontline unit blocks melee enemy before the wall is damaged', () => {
  let board = createBoard('base');
  board = placeUnit(board, unit('shield-troop', { id: 'front' }), { column: 1, row: 0 });
  const combat = createCombatState({
    board,
    enemies: [enemyAtWall()],
    wallHp: 100,
    phaseIndex: 0,
    ordersRemaining: 3,
  });
  const result = stepCombat(combat, context);
  assert.equal(result.combat.wallHp, 100);
  assert.equal(result.combat.board.units.front.hp, 20);
  assert.equal(result.events.some(({ type }) => type === 'FRIENDLY_DAMAGED'), true);
});

test('heavy cavalry charge reaches the lane and causes impact damage', () => {
  let board = createBoard('base');
  board = placeUnit(board, unit('shield-troop', { id: 'front' }), { column: 1, row: 0 });
  const combat = createCombatState({
    board,
    enemies: [{
      id: 'cavalry', definitionId: 'heavy-cavalry', lane: 1, distance: 1,
      hp: 16, maxHp: 16, cooldown: 0, chargeIn: 1, statuses: [],
    }],
    wallHp: 100,
    phaseIndex: 0,
    ordersRemaining: 3,
  });
  const result = stepCombat(combat, context);
  assert.equal(result.combat.board.units.front.hp, 15);
  assert.equal(result.events.some(({ type }) => type === 'CAVALRY_CHARGED'), true);
  assert.equal(result.events.some(({ payload }) => payload.impact === 'charge'), true);
});

test('same combat input produces the same state and event payloads', () => {
  let board = createBoard('base');
  board = placeUnit(board, unit(), { column: 1, row: 0 });
  const input = createCombatState({
    board,
    enemies: [{ ...enemyAtWall(), id: 'e2', distance: 2 }],
    wallHp: 100,
    phaseIndex: 0,
    ordersRemaining: 3,
  });
  const first = stepCombat(input, context);
  const second = stepCombat(input, context);
  assert.deepEqual(first, second);
});

test('crossbow attacks the rear unit and shield troop reduces direct damage', () => {
  let board = createBoard('base');
  board = placeUnit(board, unit('shield-troop', { id: 'shield' }), { column: 1, row: 1 });
  board = placeUnit(board, unit('huang-zhong', { id: 'rear' }), { column: 1, row: 2 });
  const combat = createCombatState({
    board,
    enemies: [{ id: 'xbow', definitionId: 'crossbow', lane: 1, distance: 3, hp: 9, maxHp: 9, cooldown: 0, statuses: [] }],
    wallHp: 100,
    phaseIndex: 0,
    ordersRemaining: 3,
  });
  const result = stepCombat(combat, context);
  assert.equal(result.combat.board.units.rear.hp, 16);
});

test('fortify duration decreases once per enemy action round', () => {
  const combat = createCombatState({
    board: createBoard('base'),
    enemies: [enemyAtWall({ id: 'a' }), enemyAtWall({ id: 'b', lane: 2 })],
    wallHp: 100,
    phaseIndex: 0,
    ordersRemaining: 2,
  });
  combat.fortify = { lane: 1, remainingEnemyTurns: 2, reduction: 0.4 };
  const result = stepCombat(combat, context);
  assert.equal(result.combat.fortify.remainingEnemyTurns, 1);
});
