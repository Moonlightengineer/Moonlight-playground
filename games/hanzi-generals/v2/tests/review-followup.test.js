import test from 'node:test';
import assert from 'node:assert/strict';
import { GENERAL_BY_ID } from '../data/generals.js';
import { REWARDS } from '../data/rewards.js';
import { canFocusEnemy } from '../src/combat/targeting.js';
import { eligibleEvolutionGenerals } from '../src/expedition/evolution-eligibility.js';
import { finalizeGameResult } from '../src/core/state-machine-reviewed.js';

function reward(id) {
  return REWARDS.find((item) => item.id === id);
}

test('all UNIT_ASSEMBLED events record recruited generals regardless of assembly path', () => {
  const result = finalizeGameResult({
    ok: true,
    state: {
      status: 'configuration',
      recruitedGeneralIds: [],
      evolutions: {},
    },
    events: [
      { type: 'CARD_PLACED', payload: {} },
      { type: 'UNIT_ASSEMBLED', payload: { definitionId: 'huang-zhong' } },
    ],
  });
  assert.deepEqual(result.state.recruitedGeneralIds, ['huang-zhong']);
  assert.deepEqual(eligibleEvolutionGenerals(result.state), ['huang-zhong']);
});

test('reward state without an eligible recruit replaces unusable evolution and keeps three choices', () => {
  const result = finalizeGameResult({
    ok: true,
    state: {
      status: 'reward',
      recruitedGeneralIds: [],
      evolutions: {},
      rewardChoices: [reward('evolve-general'), reward('fire-arrows'), reward('first-aid')],
    },
    events: [],
  });
  assert.equal(result.state.rewardChoices.length, 3);
  assert.equal(result.state.rewardChoices.some(({ id }) => id === 'evolve-general'), false);
});

test('focus targeting accepts an enemy reached only by evolved range', () => {
  const combat = {
    enemies: [{ id: 'e1', hp: 8, distance: 2, lane: 0 }],
    board: {
      units: {
        u1: {
          id: 'u1', definitionId: 'guan-yu', evolution: 'awe', hp: 28,
          cell: { column: 0, row: 0 },
        },
      },
    },
  };
  assert.equal(GENERAL_BY_ID['guan-yu'].range, 1);
  assert.equal(canFocusEnemy(combat, 'e1', GENERAL_BY_ID), true);
});
