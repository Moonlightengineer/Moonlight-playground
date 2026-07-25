import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLatestVersionUrl,
  clearAllV2Data,
  clearSnapshot,
  isApprovedSaveBoundary,
  loadSettings,
  loadSnapshot,
  loadTutorial,
  maybeSave,
  resetExpedition,
  saveSettings,
  saveSnapshot,
  saveTutorial,
  STORAGE_KEYS,
  V2_STORAGE_KEYS,
} from '../src/storage/storage.js';

function memoryStorage() {
  const data = new Map();
  return {
    get length() {
      return data.size;
    },
    key: (index) => [...data.keys()][index] ?? null,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
    dump: () => new Map(data),
  };
}

test('save/load uses schema version and rejects corrupt JSON', () => {
  const storage = memoryStorage();
  saveSnapshot({ version: 1, status: 'expedition-map' }, storage);
  assert.equal(loadSnapshot(storage).ok, true);

  storage.setItem(STORAGE_KEYS.save, '{broken');
  const corrupt = loadSnapshot(storage);
  assert.equal(corrupt.ok, false);
  assert.equal(corrupt.error.code, 'CORRUPT_SAVE');

  clearSnapshot(storage);
  assert.equal(loadSnapshot(storage).error.code, 'NO_SAVE');
});

test('unsupported save versions fail without removing user settings', () => {
  const storage = memoryStorage();
  storage.setItem(STORAGE_KEYS.save, JSON.stringify({ schemaVersion: 99, game: {} }));
  saveSettings({ reducedMotion: true, vibration: false, speed: 2 }, storage);

  assert.equal(loadSnapshot(storage).error.code, 'UNSUPPORTED_SAVE');
  assert.deepEqual(loadSettings(storage), { reducedMotion: true, vibration: false, speed: 2 });
});

test('tutorial completion is stored independently from expedition progress', () => {
  const storage = memoryStorage();
  const tutorial = { step: 'complete', complete: true, skipped: false };
  saveTutorial(tutorial, storage);
  assert.deepEqual(loadTutorial(storage), tutorial);
});

test('expedition reset removes only the run and preserves tutorial, settings, and unrelated data', () => {
  const storage = memoryStorage();
  saveSnapshot({ status: 'reward' }, storage);
  saveTutorial({ step: 'complete', complete: true }, storage);
  saveSettings({ reducedMotion: true, vibration: false, speed: 2 }, storage);
  storage.setItem('hanzi-generals-v2:legacy:v0', 'legacy');
  storage.setItem('moonlight-playground:theme', 'dark');
  storage.setItem('hanzi-generals:classic:save', 'classic');

  assert.deepEqual(resetExpedition(storage), { ok: true });
  assert.equal(storage.getItem(STORAGE_KEYS.save), null);
  assert.notEqual(storage.getItem(STORAGE_KEYS.tutorial), null);
  assert.notEqual(storage.getItem(STORAGE_KEYS.settings), null);
  assert.equal(storage.getItem('hanzi-generals-v2:legacy:v0'), 'legacy');
  assert.equal(storage.getItem('moonlight-playground:theme'), 'dark');
  assert.equal(storage.getItem('hanzi-generals:classic:save'), 'classic');
});

test('complete reset removes every v2-owned key including legacy data and preserves other games', () => {
  const storage = memoryStorage();
  for (const key of V2_STORAGE_KEYS) storage.setItem(key, 'owned');
  storage.setItem('hanzi-generals-v2:legacy:v0', 'legacy');
  storage.setItem('hanzi-generals-v2:temporary-test', 'temporary');
  storage.setItem('moonlight-playground:theme', 'dark');
  storage.setItem('hanzi-generals:classic:save', 'classic');

  assert.deepEqual(clearAllV2Data(storage), { ok: true });
  assert.deepEqual(
    [...storage.dump().keys()].filter((key) => key.startsWith('hanzi-generals-v2:')),
    [],
  );
  assert.equal(storage.getItem('moonlight-playground:theme'), 'dark');
  assert.equal(storage.getItem('hanzi-generals:classic:save'), 'classic');
});

test('reset operations report storage failures instead of claiming success', () => {
  const storage = {
    length: 1,
    key: () => STORAGE_KEYS.save,
    removeItem() {
      throw new Error('blocked');
    },
  };
  assert.equal(resetExpedition(storage).ok, false);
  assert.equal(clearAllV2Data(storage).ok, false);
});

test('latest-version URL preserves the page and adds a cache-busting value', () => {
  const url = buildLatestVersionUrl({ href: 'https://example.test/games/hanzi-generals/v2/?seed=abc#battle' }, 12345);
  assert.equal(url, 'https://example.test/games/hanzi-generals/v2/?seed=abc&v2reload=12345#battle');
});

test('snapshot is written only at approved boundaries', () => {
  const storage = memoryStorage();
  const writes = [];
  const spyStorage = {
    getItem: storage.getItem,
    removeItem: storage.removeItem,
    setItem(key, value) {
      storage.setItem(key, value);
      writes.push(JSON.parse(value).game.status);
    },
  };

  assert.equal(maybeSave({ status: 'combat', combat: { turn: 3 } }, spyStorage), false);
  assert.equal(maybeSave({ status: 'configuration', currentBattle: { phaseIndex: 1 } }, spyStorage), false);
  assert.equal(maybeSave({ status: 'reward' }, spyStorage), true);
  assert.equal(maybeSave({ status: 'configuration', currentBattle: { phaseIndex: 0 } }, spyStorage), true);
  assert.equal(maybeSave({ status: 'expedition-map' }, spyStorage), true);
  assert.deepEqual(writes, ['reward', 'configuration', 'expedition-map']);
});

test('approved save boundary helper is explicit and stable', () => {
  assert.equal(isApprovedSaveBoundary({ status: 'reward' }), true);
  assert.equal(isApprovedSaveBoundary({ status: 'victory' }), true);
  assert.equal(isApprovedSaveBoundary({ status: 'combat' }), false);
  assert.equal(isApprovedSaveBoundary({ status: 'configuration', currentBattle: { phaseIndex: 0 } }), true);
  assert.equal(isApprovedSaveBoundary({ status: 'configuration', currentBattle: { phaseIndex: 2 } }), false);
});
