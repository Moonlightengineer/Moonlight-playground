import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearSnapshot,
  loadSettings,
  loadSnapshot,
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
