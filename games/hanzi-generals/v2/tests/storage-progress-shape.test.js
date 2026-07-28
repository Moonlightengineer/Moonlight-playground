import test from 'node:test';
import assert from 'node:assert/strict';

import { createExpedition } from '../src/expedition/expedition.js';
import { migrateSaveEnvelope } from '../src/storage/migrations.js';
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

const corruptFields = [
  ['recruitedGeneralIds', 42],
  ['rewardHistory', { rewardId: 'repair-wall' }],
  ['evolutions', []],
];

for (const schemaVersion of [1, 2]) {
  for (const [field, value] of corruptFields) {
    test(`v${schemaVersion} rejects present wrong-type ${field} without rewriting storage`, () => {
      const envelope = {
        schemaVersion,
        game: {
          ...createExpedition(`wrong-shape-v${schemaVersion}-${field}`),
          [field]: value,
        },
      };
      const raw = JSON.stringify(envelope);
      const storage = memoryStorage();
      storage.setItem(STORAGE_KEYS.save, raw);

      const migrated = migrateSaveEnvelope(envelope);
      assert.equal(migrated.ok, false);
      assert.equal(migrated.error.code, 'CORRUPT_SAVE');

      const loaded = loadSnapshot(storage);
      assert.equal(loaded.ok, false);
      assert.equal(loaded.error.code, 'CORRUPT_SAVE');
      assert.equal(storage.getItem(STORAGE_KEYS.save), raw);
    });
  }
}

test('missing legacy progress fields still receive safe defaults', () => {
  const game = createExpedition('missing-progress-fields');
  delete game.recruitedGeneralIds;
  delete game.rewardHistory;
  delete game.evolutions;

  const migrated = migrateSaveEnvelope({ schemaVersion: 1, game });
  assert.equal(migrated.ok, true);
  assert.deepEqual(migrated.envelope.game.recruitedGeneralIds, []);
  assert.deepEqual(migrated.envelope.game.rewardHistory, []);
  assert.deepEqual(migrated.envelope.game.evolutions, {});
});
