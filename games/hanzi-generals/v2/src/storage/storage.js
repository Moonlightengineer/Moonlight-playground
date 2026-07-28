import { validateCardOwnership } from '../core/card-invariants.js';
import { normalizeGameState } from '../core/state-machine.js';
import {
  CURRENT_SAVE_VERSION,
  migrateSaveEnvelope,
  prepareGameForSave,
} from './migrations.js';

const STORAGE_NAMESPACE = 'hanzi-generals-v2:';
const SAVE_KEY = `${STORAGE_NAMESPACE}save:v1`;
const SETTINGS_KEY = `${STORAGE_NAMESPACE}settings:v1`;
const TUTORIAL_KEY = `${STORAGE_NAMESPACE}tutorial:v1`;
const FRESH_RESET_SESSION_KEY = `${STORAGE_NAMESPACE}fresh-reset`;
const TUTORIAL_VERSION = 1;

export const V2_STORAGE_KEYS = Object.freeze([
  SAVE_KEY,
  SETTINGS_KEY,
  TUTORIAL_KEY,
]);

function resolveStorage(storage) {
  if (storage) return storage;
  if (typeof localStorage !== 'undefined') return localStorage;
  throw new Error('Storage is unavailable');
}

function markFreshReset() {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(FRESH_RESET_SESSION_KEY, 'true');
  } catch {
    // The reset itself is complete even when session storage is unavailable.
  }
}

function consumeFreshReset() {
  if (typeof sessionStorage === 'undefined') return false;
  try {
    const fresh = sessionStorage.getItem(FRESH_RESET_SESSION_KEY) === 'true';
    if (fresh) sessionStorage.removeItem(FRESH_RESET_SESSION_KEY);
    return fresh;
  } catch {
    return false;
  }
}

function corruptSaveError() {
  return {
    code: 'CORRUPT_SAVE',
    message: '存檔已損壞，可重設 v2 測試存檔。',
  };
}

function validateSnapshotState(game) {
  const validation = validateCardOwnership(game);
  if (validation.valid) return null;
  return {
    code: 'INVALID_SAVE_STATE',
    message: '存檔內字牌狀態不一致，可重設 v2 存檔。',
    details: validation.errors,
  };
}

export function saveSnapshot(game, storage) {
  const target = resolveStorage(storage);
  const prepared = prepareGameForSave(normalizeGameState(game));
  const invalid = validateSnapshotState(prepared);
  if (invalid) {
    const error = new Error(invalid.message);
    error.code = invalid.code;
    error.details = invalid.details;
    throw error;
  }
  target.setItem(SAVE_KEY, JSON.stringify({
    schemaVersion: CURRENT_SAVE_VERSION,
    game: prepared,
  }));
}

export function loadSnapshot(storage) {
  let target;
  try {
    target = resolveStorage(storage);
  } catch {
    return { ok: false, error: { code: 'STORAGE_UNAVAILABLE', message: '瀏覽器暫時無法使用本機存檔。' } };
  }

  let raw;
  try {
    raw = target.getItem(SAVE_KEY);
  } catch {
    return { ok: false, error: { code: 'STORAGE_UNAVAILABLE', message: '瀏覽器暫時無法讀取本機存檔。' } };
  }
  if (!raw) {
    return { ok: false, error: { code: 'NO_SAVE', message: '未有 v2 測試存檔。' } };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: corruptSaveError() };
  }

  try {
    const migration = migrateSaveEnvelope(parsed);
    if (!migration.ok) return migration;
    const game = normalizeGameState(migration.envelope.game);
    const invalid = validateSnapshotState(game);
    if (invalid) return { ok: false, error: invalid };

    return {
      ok: true,
      game,
      migrated: migration.migrated,
      migratedFrom: migration.migratedFrom,
      appliedMigrations: migration.applied,
      schemaVersion: CURRENT_SAVE_VERSION,
    };
  } catch {
    return { ok: false, error: corruptSaveError() };
  }
}

export function clearSnapshot(storage) {
  resolveStorage(storage).removeItem(SAVE_KEY);
}

export function saveSettings(settings, storage) {
  if (!storage && consumeFreshReset()) return false;
  resolveStorage(storage).setItem(SETTINGS_KEY, JSON.stringify({ schemaVersion: 1, settings }));
  return true;
}

export function loadSettings(storage) {
  let target;
  try {
    target = resolveStorage(storage);
  } catch {
    return { reducedMotion: false, vibration: true, speed: 1 };
  }
  const raw = target.getItem(SETTINGS_KEY);
  if (!raw) return { reducedMotion: false, vibration: true, speed: 1 };
  try {
    const parsed = JSON.parse(raw);
    return {
      reducedMotion: Boolean(parsed.settings?.reducedMotion),
      vibration: parsed.settings?.vibration !== false,
      speed: [1, 2].includes(parsed.settings?.speed) ? parsed.settings.speed : 1,
    };
  } catch {
    return { reducedMotion: false, vibration: true, speed: 1 };
  }
}

export function saveTutorial(tutorial, storage) {
  resolveStorage(storage).setItem(
    TUTORIAL_KEY,
    JSON.stringify({ schemaVersion: TUTORIAL_VERSION, tutorial }),
  );
}

export function loadTutorial(storage) {
  let target;
  try {
    target = resolveStorage(storage);
  } catch {
    return null;
  }
  const raw = target.getItem(TUTORIAL_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed.schemaVersion !== TUTORIAL_VERSION) return null;
    return parsed.tutorial && typeof parsed.tutorial === 'object' ? parsed.tutorial : null;
  } catch {
    return null;
  }
}

export function resetExpedition(storage) {
  try {
    resolveStorage(storage).removeItem(SAVE_KEY);
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

function discoverOwnedKeys(target) {
  const keys = new Set(V2_STORAGE_KEYS);
  if (!Number.isInteger(target.length) || typeof target.key !== 'function') return [...keys];
  for (let index = 0; index < target.length; index += 1) {
    const key = target.key(index);
    if (typeof key === 'string' && key.startsWith(STORAGE_NAMESPACE)) keys.add(key);
  }
  return [...keys];
}

export function clearAllV2Data(storage) {
  try {
    const target = resolveStorage(storage);
    for (const key of discoverOwnedKeys(target)) target.removeItem(key);
    if (!storage) markFreshReset();
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

export function buildLatestVersionUrl(location, timestamp = Date.now()) {
  const href = typeof location === 'string' ? location : location?.href;
  if (!href) throw new Error('Location URL is unavailable');
  const url = new URL(href);
  url.searchParams.set('v2reload', String(timestamp));
  return url.toString();
}

export function isApprovedSaveBoundary(game) {
  if (!game || typeof game !== 'object') return false;
  if (['expedition-map', 'battle-report', 'reward', 'victory', 'defeat'].includes(game.status)) return true;
  return game.status === 'configuration' && game.currentBattle?.phaseIndex === 0;
}

export function maybeSave(game, storage) {
  if (!isApprovedSaveBoundary(game)) return false;
  try {
    saveSnapshot(game, storage);
    return true;
  } catch {
    return false;
  }
}

export const STORAGE_KEYS = Object.freeze({
  save: SAVE_KEY,
  settings: SETTINGS_KEY,
  tutorial: TUTORIAL_KEY,
});
