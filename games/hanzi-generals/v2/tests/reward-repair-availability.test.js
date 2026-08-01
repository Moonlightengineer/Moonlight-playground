import test from 'node:test';
import assert from 'node:assert/strict';

import { REWARD_BY_ID, REWARDS } from '../data/rewards.js';
import { createExpedition } from '../src/expedition/expedition.js';
import {
  applyRewardChoice,
  generateRewardOffer,
  validateRewardChoice,
} from '../src/reward/reward-flow.js';

function rewardState(overrides = {}) {
  const game = createExpedition('repair-availability');
  return {
    ...game,
    status: 'reward',
    currentBattle: {
      stageId: 'tutorial', phaseIndex: 2, phaseCount: 3, ordersRemaining: 0,
    },
    currentBattleResult: 'victory',
    rewardChoices: [REWARD_BY_ID['repair-wall']],
    legalActions: ['CHOOSE_REWARD'],
    ...overrides,
  };
}

test('full-wall reward offers exclude repair and still provide three choices', () => {
  const game = rewardState({ rewardChoices: [] });
  const offer = generateRewardOffer(game, REWARDS, game.rng);
  assert.equal(offer.choices.length, 3);
  assert.equal(offer.choices.some(({ id }) => id === 'repair-wall'), false);
});

test('full-wall scripted third-battle offer replaces repair instead of showing a no-op', () => {
  const game = rewardState({
    route: 'safe',
    completedBattleIds: ['tutorial', 'shield-line'],
    currentBattle: {
      stageId: 'route-safe', phaseIndex: 2, phaseCount: 3, ordersRemaining: 0,
    },
    rewardChoices: [],
  });
  const offer = generateRewardOffer(game, REWARDS, game.rng);
  assert.equal(offer.choices.length, 3);
  assert.equal(offer.choices.some(({ id }) => id === 'unlock-huang-zhong'), true);
  assert.equal(offer.choices.some(({ id }) => id === 'repair-wall'), false);
});

test('stale full-wall repair selection is rejected without advancing the expedition', () => {
  const game = rewardState();
  const validation = validateRewardChoice(game, 'repair-wall');
  assert.equal(validation.valid, false);
  assert.equal(validation.error.code, 'REWARD_UNAVAILABLE');

  const applied = applyRewardChoice(game, 'repair-wall');
  assert.equal(applied.ok, false);
  assert.equal(applied.state, game);
  assert.equal(applied.error.code, 'REWARD_UNAVAILABLE');
});

test('damaged wall can still validate and apply repair normally', () => {
  const game = rewardState({ wallHp: 40 });
  const validation = validateRewardChoice(game, 'repair-wall');
  assert.equal(validation.valid, true);

  const applied = applyRewardChoice(game, 'repair-wall');
  assert.equal(applied.ok, true);
  assert.equal(applied.state.wallHp, 85);
});
