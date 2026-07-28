import test from 'node:test';
import assert from 'node:assert/strict';

import { createExpedition } from '../src/expedition/expedition.js';
import { CURRENT_SAVE_VERSION, migrateSaveEnvelope } from '../src/storage/migrations.js';
import { loadSnapshot, STORAGE_KEYS } from '../src/storage/storage.js';

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

function loadEnvelope(envelope) {
  const storage = memoryStorage();
  storage.setItem(STORAGE_KEYS.save, JSON.stringify(envelope));
  return loadSnapshot(storage);
}

const malformedEnvelopes = [
  {
    name: 'v1 null reward entry',
    envelope() {
      return {
        schemaVersion: 1,
        game: {
          ...createExpedition('corrupt-v1-reward'),
          status: 'reward',
          rewardChoices: [null],
        },
      };
    },
  },
  {
    name: 'v2 null hand entry',
    envelope() {
      const game = createExpedition('corrupt-v2-hand');
      return {
        schemaVersion: 2,
        game: {
          ...game,
          deck: { ...game.deck, hand: [null] },
        },
      };
    },
  },
  {
    name: 'v3 non-array recruited ids',
    envelope() {
      return {
        schemaVersion: CURRENT_SAVE_VERSION,
        game: {
          ...createExpedition('corrupt-v3-recruited'),
          recruitedGeneralIds: 42,
        },
      };
    },
  },
];

for (const fixture of malformedEnvelopes) {
  test(`migration is total for ${fixture.name}`, () => {
    assert.doesNotThrow(() => migrateSaveEnvelope(fixture.envelope()));
  });

  test(`loadSnapshot converts ${fixture.name} into recoverable CORRUPT_SAVE`, () => {
    let loaded;
    assert.doesNotThrow(() => {
      loaded = loadEnvelope(fixture.envelope());
    });
    assert.equal(loaded.ok, false);
    assert.equal(loaded.error.code, 'CORRUPT_SAVE');
  });
}
