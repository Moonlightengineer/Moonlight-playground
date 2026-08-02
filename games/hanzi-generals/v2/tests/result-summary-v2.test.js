import test from 'node:test';
import assert from 'node:assert/strict';

import { REWARD_BY_ID } from '../data/rewards.js';
import { STARTING_RECIPE_IDS } from '../data/recipes.js';
import { createExpedition } from '../src/expedition/expedition.js';
import { applyReward } from '../src/expedition/rewards.js';
import { buildAppViewModel } from '../src/ui/view-model.js';

const COMPLETED_STAGES = Object.freeze([
  'tutorial',
  'shield-line',
  'route-safe',
  'cavalry-warning',
  'elite-mixed',
  'hua-xiong',
]);

function victoryState(seed, overrides = {}) {
  return {
    ...createExpedition(seed),
    status: 'victory',
    route: 'safe',
    battleIndex: 6,
    completedBattleIds: [...COMPLETED_STAGES],
    currentBattle: null,
    currentBattleResult: null,
    nextStageId: null,
    legalActions: ['START_NEW_RUN'],
    ...overrides,
  };
}

test('result summary derives starting recipes and reward labels from canonical data', () => {
  const fresh = buildAppViewModel(victoryState('result-fresh')).primary.result;
  assert.equal(fresh.unlockedText, '本局未新增配方。');

  const result = buildAppViewModel(victoryState('result-earned', {
    unlockedRecipes: [...STARTING_RECIPE_IDS, 'huang-zhong', 'lu-bu'],
    rewardHistory: [
      {
        rewardId: 'copy-card:5f35',
        baseId: 'copy-card',
        displayName: '臨摹「張」',
        battleIndex: 1,
        payload: { symbol: '張', amount: 2 },
      },
      {
        rewardId: 'specialize-troop:shield-wall',
        baseId: 'specialize-troop',
        battleIndex: 2,
        payload: { specializationId: 'shield-wall' },
      },
    ],
  })).primary.result;

  assert.match(result.unlockedText, /黃忠/);
  assert.match(result.unlockedText, /呂布/);
  assert.equal(result.rewardsText, '臨摹「張」、兵種專精');
  assert.equal(result.rewardsText.includes(':'), false);
});

test('reward history preserves the concrete player-facing reward name', () => {
  const game = createExpedition('reward-display-name');
  const reward = {
    ...REWARD_BY_ID['copy-card'],
    id: 'copy-card:5f35',
    baseId: 'copy-card',
    concrete: true,
    name: '臨摹「張」',
    payload: { symbol: '張', amount: 2 },
  };

  const rewarded = applyReward(game, reward, reward.payload);
  assert.equal(rewarded.rewardHistory.at(-1).displayName, '臨摹「張」');
});
