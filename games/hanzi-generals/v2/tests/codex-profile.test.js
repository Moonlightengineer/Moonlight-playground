import test from 'node:test';
import assert from 'node:assert/strict';

import { createExpedition } from '../src/expedition/expedition.js';
import { createRuntimeState } from '../src/runtime/runtime-state.js';
import {
  clearAllV2Data,
  loadRecipeDiscoveries,
  resetExpedition,
  saveRecipeDiscoveries,
  saveSnapshot,
  STORAGE_KEYS,
} from '../src/storage/storage.js';

function memoryStorage() {
  const data = new Map();
  return {
    get length() { return data.size; },
    key: (index) => [...data.keys()][index] ?? null,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

test('recipe discoveries round-trip independently and survive expedition reset', () => {
  const storage = memoryStorage();
  saveSnapshot(createExpedition('codex-storage'), storage);
  saveRecipeDiscoveries(['zhang-fei', 'guan-yu', 'zhang-fei'], storage);

  assert.deepEqual(loadRecipeDiscoveries(storage), ['zhang-fei', 'guan-yu']);
  assert.deepEqual(resetExpedition(storage), { ok: true });
  assert.equal(storage.getItem(STORAGE_KEYS.save), null);
  assert.deepEqual(loadRecipeDiscoveries(storage), ['zhang-fei', 'guan-yu']);
});

test('complete reset removes recipe discoveries with other v2-owned data', () => {
  const storage = memoryStorage();
  saveRecipeDiscoveries(['zhang-fei'], storage);
  assert.notEqual(storage.getItem(STORAGE_KEYS.codex), null);
  assert.deepEqual(clearAllV2Data(storage), { ok: true });
  assert.deepEqual(loadRecipeDiscoveries(storage), []);
});

test('runtime profile unions stored discoveries with generals already assembled in an older save', () => {
  const game = {
    ...createExpedition('codex-runtime'),
    recruitedGeneralIds: ['guan-yu', 'zhang-fei'],
  };
  const runtime = createRuntimeState({
    game,
    profile: { discoveredRecipeIds: ['zhang-fei', 'huang-zhong'] },
  });
  assert.deepEqual(runtime.profile.discoveredRecipeIds, ['zhang-fei', 'huang-zhong', 'guan-yu']);
});
