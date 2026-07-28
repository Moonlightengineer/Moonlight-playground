import test from 'node:test';
import assert from 'node:assert/strict';

import { REWARD_BY_ID } from '../data/rewards.js';
import { createExpedition } from '../src/expedition/expedition.js';
import { assessRewardAvailability } from '../src/reward/reward-flow.js';
import { CURRENT_SAVE_VERSION } from '../src/storage/migrations.js';
import { loadSnapshot, STORAGE_KEYS } from '../src/storage/storage.js';
import { buildAppViewModel } from '../src/ui/runtime-view-model.js';

function memoryStorage() {
  const values = new Map();
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

test('load normalizes mixed stale reward choices into three usable options', () => {
  const storage = memoryStorage();
  const game = {
    ...createExpedition('stale-reward-snapshot'),
    status: 'reward',
    currentBattle: {
      stageId: 'tutorial', phaseIndex: 2, phaseCount: 3, ordersRemaining: 0,
    },
    currentBattleResult: 'victory',
    rewardChoices: [
      REWARD_BY_ID['repair-wall'],
      REWARD_BY_ID['evolve-general'],
      REWARD_BY_ID['copy-card'],
    ],
    recruitedGeneralIds: [],
    evolutions: {},
    legalActions: ['CHOOSE_REWARD'],
  };
  storage.setItem(STORAGE_KEYS.save, JSON.stringify({
    schemaVersion: CURRENT_SAVE_VERSION,
    game,
  }));

  const loaded = loadSnapshot(storage);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.game.rewardChoices.length, 3);
  assert.equal(new Set(loaded.game.rewardChoices.map(({ id }) => id)).size, 3);
  assert.equal(loaded.game.rewardChoices.some(({ id }) => id === 'repair-wall'), false);
  assert.equal(loaded.game.rewardChoices.some(({ id }) => id === 'evolve-general'), false);
  assert.equal(
    loaded.game.rewardChoices.every((reward) => assessRewardAvailability(loaded.game, reward).available),
    true,
  );

  const viewModel = buildAppViewModel(
    loaded.game,
    { settings: game.settings, tutorial: game.tutorial },
    {},
  );
  assert.equal(viewModel.primary.rewards.length, 3);
  assert.equal(viewModel.primary.rewards.every(({ disabled }) => disabled === false), true);
});

test('ViewModel disables stale unavailable repair with the shared engine reason', () => {
  const game = {
    ...createExpedition('stale-repair-view-model'),
    status: 'reward',
    currentBattle: {
      stageId: 'tutorial', phaseIndex: 2, phaseCount: 3, ordersRemaining: 0,
    },
    currentBattleResult: 'victory',
    rewardChoices: [REWARD_BY_ID['repair-wall']],
    legalActions: ['CHOOSE_REWARD'],
  };
  const availability = assessRewardAvailability(game, REWARD_BY_ID['repair-wall']);
  assert.equal(availability.available, false);

  const viewModel = buildAppViewModel(
    game,
    { settings: game.settings, tutorial: game.tutorial },
    {},
  );
  assert.equal(viewModel.primary.rewards[0].disabled, true);
  assert.equal(viewModel.primary.rewards[0].disabledReason, availability.reason);
});
