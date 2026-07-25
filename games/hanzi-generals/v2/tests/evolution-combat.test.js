import test from 'node:test';
import assert from 'node:assert/strict';
import { createBoard, placeUnit } from '../src/board/board.js';
import { createCombatState, stepCombat } from '../src/combat/combat-engine.js';
import { GENERALS } from '../data/generals.js';
import { ENEMIES } from '../data/enemies.js';

const unitsById = Object.fromEntries(GENERALS.map((item) => [item.id, item]));
const enemiesById = Object.fromEntries(ENEMIES.map((item) => [item.id, item]));

function makeCombat(evolution) {
  const base = unitsById['huang-zhong'];
  let board = createBoard('base');
  board = placeUnit(board, {
    id: 'evolved-huang-zhong',
    definitionId: base.id,
    kind: base.kind,
    hp: base.maxHp,
    maxHp: base.maxHp,
    cooldown: 0,
    evolution,
    statuses: [],
  }, { column: 1, row: 0 });

  return createCombatState({
    board,
    enemies: [{
      id: 'target', definitionId: 'soldier', lane: 1, distance: 2,
      hp: 20, maxHp: 20, cooldown: 0, statuses: [],
    }],
    wallHp: 100,
    phaseIndex: 0,
    ordersRemaining: 3,
  });
}

test('combat resolves an evolved unit definition and records evolution evidence', () => {
  const context = {
    unitsById,
    enemiesById,
    resolveUnitDefinition(unit) {
      const base = unitsById[unit.definitionId];
      return unit.evolution === 'divine-shot'
        ? { ...base, damage: base.damage + 3 }
        : base;
    },
  };

  const result = stepCombat(makeCombat('divine-shot'), context);
  const hit = result.events.find(({ type }) => type === 'UNIT_HIT');

  assert.equal(hit.payload.damage, 10);
  assert.equal(hit.payload.evolutionId, 'divine-shot');
});
