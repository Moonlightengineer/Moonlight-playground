import assert from 'node:assert/strict';
import test from 'node:test';

import { REWARD_BY_ID } from '../data/rewards.js';
import { createExpedition } from '../src/expedition/expedition.js';
import { CURRENT_SAVE_VERSION } from '../src/storage/migrations.js';
import { loadSnapshot, saveSnapshot, STORAGE_KEYS } from '../src/storage/storage.js';

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

test('legacy reward snapshot is sequentially normalized to three actionable choices on load', () => {
  const storage = memoryStorage();
  const base = createExpedition('legacy-reward-migration');
  const legacyGame = {
    ...base,
    status: 'reward',
    completedBattleIds: ['tutorial'],
    rewardChoices: [
      REWARD_BY_ID['evolve-general'],
      REWARD_BY_ID['copy-card'],
      REWARD_BY_ID['remove-card'],
    ],
    recruitedGeneralIds: [],
    evolutions: {},
  };
  storage.setItem(STORAGE_KEYS.save, JSON.stringify({ schemaVersion: 1, game: legacyGame }));

  const loaded = loadSnapshot(storage);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.migrated, true);
  assert.equal(loaded.migratedFrom, 1);
  assert.deepEqual(loaded.appliedMigrations, ['v1-to-v2', 'v2-to-v3']);
  assert.equal(loaded.game.rewardChoices.length, 3);
  assert.equal(loaded.game.rewardChoices.some(({ id }) => id === 'evolve-general'), false);
  assert.equal(new Set(loaded.game.rewardChoices.map(({ id }) => id)).size, 3);

  saveSnapshot(loaded.game, storage);
  const persisted = JSON.parse(storage.getItem(STORAGE_KEYS.save));
  assert.equal(persisted.schemaVersion, CURRENT_SAVE_VERSION);
  assert.equal(persisted.game.rewardChoices.length, 3);
});
