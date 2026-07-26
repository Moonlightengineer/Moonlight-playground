import test from 'node:test';
import assert from 'node:assert/strict';
import { createBoard } from '../src/board/board.js';
import { createCombatState } from '../src/combat/combat-engine.js';
import { createExpedition } from '../src/expedition/expedition.js';
import { reduceGame } from '../src/core/state-machine.js';

function thirdBattleCompletion(route) {
  const game = createExpedition(`route-${route}`);
  return {
    ...game,
    route,
    status: 'combat',
    completedBattleIds: ['tutorial', 'shield-line'],
    battleIndex: 2,
    currentBattle: {
      stageId: route === 'safe' ? 'route-safe' : 'route-danger',
      phaseIndex: 2,
      phaseCount: 3,
      ordersRemaining: 3,
    },
    combat: createCombatState({
      board: createBoard('base'),
      enemies: [],
      wallHp: game.wallHp,
      phaseIndex: 2,
      ordersRemaining: 3,
      tactics: [],
    }),
    legalActions: ['STEP_COMBAT'],
  };
}

test('safe third battle offers Zhang Fei while danger offers Zhuge Liang', () => {
  const safe = reduceGame(thirdBattleCompletion('safe'), { type: 'STEP_COMBAT' });
  assert.equal(safe.ok, true);
  assert.equal(safe.state.status, 'reward');
  assert.equal(safe.state.rewardChoices.some(({ id }) => id === 'unlock-zhang-fei'), true);
  assert.equal(safe.state.rewardChoices.some(({ id }) => id === 'unlock-zhuge-liang'), false);

  const danger = reduceGame(thirdBattleCompletion('danger'), { type: 'STEP_COMBAT' });
  assert.equal(danger.ok, true);
  assert.equal(danger.state.rewardChoices.some(({ id }) => id === 'unlock-zhuge-liang'), true);
  assert.equal(danger.state.rewardChoices.some(({ id }) => id === 'unlock-zhang-fei'), false);
});

function evolutionRewardGame(overrides = {}) {
  const game = createExpedition('evolution-review');
  return {
    ...game,
    route: 'safe',
    status: 'reward',
    completedBattleIds: ['tutorial', 'shield-line', 'route-safe', 'cavalry-warning'],
    battleIndex: 4,
    currentBattle: {
      stageId: 'elite-mixed',
      phaseIndex: 2,
      phaseCount: 3,
      ordersRemaining: 2,
    },
    currentBattleResult: 'victory',
    rewardChoices: [{ id: 'evolve-general' }],
    legalActions: ['CHOOSE_REWARD'],
    recruitedGeneralIds: ['huang-zhong'],
    ...overrides,
  };
}

test('both Huang Zhong evolution branches are accepted when he was recruited', () => {
  for (const evolutionId of ['divine-shot', 'repeating-crossbow']) {
    const result = reduceGame(evolutionRewardGame(), {
      type: 'CHOOSE_REWARD',
      rewardId: 'evolve-general',
      payload: { generalId: 'huang-zhong', evolutionId },
    });
    assert.equal(result.ok, true);
    assert.equal(result.state.evolutions['huang-zhong'], evolutionId);
  }
});

test('evolution rejects missing choice, un-recruited generals, mismatch, and repeat', () => {
  const missing = reduceGame(evolutionRewardGame(), {
    type: 'CHOOSE_REWARD', rewardId: 'evolve-general', payload: {},
  });
  assert.equal(missing.error.code, 'EVOLUTION_SELECTION_REQUIRED');

  const notRecruited = reduceGame(evolutionRewardGame(), {
    type: 'CHOOSE_REWARD', rewardId: 'evolve-general',
    payload: { generalId: 'zhao-yun', evolutionId: 'seven-charges' },
  });
  assert.equal(notRecruited.error.code, 'GENERAL_NOT_RECRUITED');

  const mismatch = reduceGame(evolutionRewardGame(), {
    type: 'CHOOSE_REWARD', rewardId: 'evolve-general',
    payload: { generalId: 'huang-zhong', evolutionId: 'seven-charges' },
  });
  assert.equal(mismatch.error.code, 'EVOLUTION_MISMATCH');

  const repeated = reduceGame(evolutionRewardGame({ evolutions: { 'huang-zhong': 'divine-shot' } }), {
    type: 'CHOOSE_REWARD', rewardId: 'evolve-general',
    payload: { generalId: 'huang-zhong', evolutionId: 'repeating-crossbow' },
  });
  assert.equal(repeated.error.code, 'GENERAL_ALREADY_EVOLVED');
});
