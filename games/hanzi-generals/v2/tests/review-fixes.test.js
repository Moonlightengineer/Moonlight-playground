import test from 'node:test';
import assert from 'node:assert/strict';
import { createBoard } from '../src/board/board.js';
import { createCombatState } from '../src/combat/combat-engine.js';
import { REWARD_BY_ID } from '../data/rewards.js';
import { createExpedition } from '../src/expedition/expedition.js';
import { validateEvolutionSelection } from '../src/expedition/evolution-eligibility.js';
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

function continueToReward(reportState) {
  assert.equal(reportState.status, 'battle-report');
  assert.equal(reportState.battleReport.nextStatus, 'reward');
  const continued = reduceGame(reportState, { type: 'CONTINUE_AFTER_REPORT' });
  assert.equal(continued.ok, true);
  assert.equal(continued.state.status, 'reward');
  return continued.state;
}

test('third battle reward is dynamic rather than route-hardcoded', () => {
  const safeReport = reduceGame(thirdBattleCompletion('safe'), { type: 'STEP_COMBAT' });
  assert.equal(safeReport.ok, true);
  const safe = continueToReward(safeReport.state);

  const dangerReport = reduceGame(thirdBattleCompletion('danger'), { type: 'STEP_COMBAT' });
  assert.equal(dangerReport.ok, true);
  const danger = continueToReward(dangerReport.state);

  for (const game of [safe, danger]) {
    assert.equal(game.rewardChoices.length, 3);
    assert.equal(game.rewardChoices.every(({ concrete, permanent }) => concrete && permanent), true);
    assert.equal(game.rewardOfferHistory.at(-1).battleNumber, 3);
    assert.equal(game.rewardOfferHistory.at(-1).pityTriggered, false);
  }
  assert.equal(
    safe.rewardChoices.some(({ baseId }) => baseId === 'unlock-huang-zhong')
      && danger.rewardChoices.some(({ baseId }) => baseId === 'unlock-zhuge-liang'),
    false,
  );
});

function concreteReward(baseId, suffix = 'permanent', payload = {}) {
  return {
    ...REWARD_BY_ID[baseId],
    id: `${baseId}:${suffix}`,
    baseId,
    concrete: true,
    permanent: true,
    payload,
  };
}

function evolutionRewardGame(evolutionId = 'divine-shot', overrides = {}) {
  const game = createExpedition('evolution-review');
  const evolution = concreteReward(
    'evolve-general',
    `huang-zhong-${evolutionId}`,
    { generalId: 'huang-zhong', evolutionId },
  );
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
    rewardChoices: [
      evolution,
      concreteReward('extra-camp'),
      concreteReward('expand-depth'),
    ],
    legalActions: ['CHOOSE_REWARD'],
    recruitedGeneralIds: ['huang-zhong'],
    ...overrides,
  };
}

test('both Huang Zhong evolution branches are accepted as concrete one-click rewards', () => {
  for (const evolutionId of ['divine-shot', 'repeating-crossbow']) {
    const game = evolutionRewardGame(evolutionId);
    const reward = game.rewardChoices[0];
    const result = reduceGame(game, {
      type: 'CHOOSE_REWARD',
      rewardId: reward.id,
    });
    assert.equal(result.ok, true);
    assert.equal(result.state.evolutions['huang-zhong'], evolutionId);
  }
});

test('evolution validation rejects missing choice, un-recruited generals, mismatch, and repeat', () => {
  const game = evolutionRewardGame();
  assert.equal(validateEvolutionSelection(game, {}).code, 'EVOLUTION_SELECTION_REQUIRED');
  assert.equal(validateEvolutionSelection(game, {
    generalId: 'zhao-yun', evolutionId: 'seven-charges',
  }).code, 'GENERAL_NOT_RECRUITED');
  assert.equal(validateEvolutionSelection(game, {
    generalId: 'huang-zhong', evolutionId: 'seven-charges',
  }).code, 'EVOLUTION_MISMATCH');
  assert.equal(validateEvolutionSelection({
    ...game,
    recruitedGeneralIds: ['huang-zhong', 'zhao-yun'],
    evolutions: { 'huang-zhong': 'divine-shot' },
  }, {
    generalId: 'huang-zhong', evolutionId: 'repeating-crossbow',
  }).code, 'GENERAL_ALREADY_EVOLVED');

  const stale = {
    ...game,
    rewardChoices: [{ id: 'evolve-general' }],
  };
  const rejected = reduceGame(stale, {
    type: 'CHOOSE_REWARD',
    rewardId: 'evolve-general',
    payload: { generalId: 'huang-zhong', evolutionId: 'divine-shot' },
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error.code, 'REWARD_NOT_OFFERED');
});
