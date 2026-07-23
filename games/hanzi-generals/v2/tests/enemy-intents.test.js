import test from 'node:test';
import assert from 'node:assert/strict';
import { createBoard } from '../src/board/board.js';
import { createCombatState, stepCombat } from '../src/combat/combat-engine.js';
import { deriveEnemyIntent, deriveLaneWarnings } from '../src/combat/intents.js';
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

function combatWith(enemies) {
  return createCombatState({
    board: createBoard('base'),
    enemies,
    wallHp: 100,
    phaseIndex: 0,
    ordersRemaining: 3,
  });
}

test('heavy cavalry exposes charge countdown and target lane', () => {
  const intent = deriveEnemyIntent({
    id: 'e1',
    definitionId: 'heavy-cavalry',
    lane: 1,
    distance: 3,
    chargeIn: 2,
  });
  assert.deepEqual(intent, { type: 'charge', lane: 1, countdown: 2, target: 'wall' });
});

test('lane warnings surface safe charge and banner states', () => {
  const combat = combatWith([
    { id: 'charge', definitionId: 'heavy-cavalry', lane: 1, distance: 3, hp: 16, maxHp: 16, chargeIn: 2 },
    { id: 'banner', definitionId: 'banner', lane: 2, distance: 3, hp: 10, maxHp: 10 },
  ]);
  const warnings = deriveLaneWarnings(combat);
  assert.equal(warnings[0].level, 'safe');
  assert.equal(warnings[1].level, 'danger');
  assert.match(warnings[2].text, /旗手/);
});

test('Hua Xiong phase two triggers once at half hp', () => {
  const combat = combatWith([{
    id: 'boss',
    definitionId: 'hua-xiong',
    lane: 1,
    distance: 2,
    hp: 40,
    maxHp: 80,
    cooldown: 0,
    phase: 1,
    phaseTwoTriggered: false,
    statuses: [],
  }]);
  const result = stepCombat(combat, context);
  const boss = result.combat.enemies.find(({ definitionId }) => definitionId === 'hua-xiong');
  assert.equal(boss.phase, 2);
  assert.equal(boss.phaseTwoTriggered, true);
  assert.equal(result.combat.enemies.filter(({ definitionId }) => definitionId === 'heavy-cavalry').length, 2);
  assert.equal(result.events.filter(({ type }) => type === 'BOSS_PHASE_CHANGED').length, 1);

  const second = stepCombat(result.combat, context);
  assert.equal(second.events.filter(({ type }) => type === 'BOSS_PHASE_CHANGED').length, 0);
});
