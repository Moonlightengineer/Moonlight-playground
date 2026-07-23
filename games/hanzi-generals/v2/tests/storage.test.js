import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearSnapshot,
  isApprovedSaveBoundary,
  loadSettings,
  loadSnapshot,
  maybeSave,
  saveSettings,
  saveSnapshot,
  STORAGE_KEYS,
} from '../src/storage/storage.js';

function memoryStorage() {
  const data = new Map();
  return {
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
