import { normalizeGameState } from '../core/state-machine.js';

const STORAGE_NAMESPACE = 'hanzi-generals-v2:';
const SAVE_KEY = `${STORAGE_NAMESPACE}save:v1`;
const SETTINGS_KEY = `${STORAGE_NAMESPACE}settings:v1`;
const TUTORIAL_KEY = `${STORAGE_NAMESPACE}tutorial:v1`;
const SAVE_VERSION = 2;
const SUPPORTED_SAVE_VERSIONS = new Set([1, 2]);
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

export function saveSnapshot(game, storage) {
  const target = resolveStorage(storage);
  target.setItem(SAVE_KEY, JSON.stringify({ schemaVersion: SAVE_VERSION, game: normalizeGameState(game) }));
}

export function loadSnapshot(storage) {
  let target;
  try {
    target = resolveStorage(storage);
  } catch {
    return { ok: false, error: { code: 'STORAGE_UNAVAILABLE', message: '瀏覽器暫時無法使用本機存檔。' } };
  }

  const raw = target.getItem(SAVE_KEY);
  if (!raw) {
    return { ok: false, error: { code: 'NO_SAVE', message: '未有 v2 測試存檔。' } };
  }
  try {
    const parsed = JSON.parse(raw);
    if (!SUPPORTED_SAVE_VERSIONS.has(parsed.schemaVersion)) {
      return { ok: false, error: { code: 'UNSUPPORTED_SAVE', message: '存檔版本不支援。' } };
    }
    if (!parsed.game || typeof parsed.game !== 'object') {
      return { ok: false, error: { code: 'CORRUPT_SAVE', message: '存檔內容不完整，可重設 v2 測試存檔。' } };
    }
    return {
      ok: true,
      game: normalizeGameState(parsed.game),
      migrated: parsed.schemaVersion !== SAVE_VERSION,
      schemaVersion: SAVE_VERSION,
    };
  } catch {
    return { ok: false, error: { code: 'CORRUPT_SAVE', message: '存檔已損壞，可重設 v2 測試存檔。' } };
  }
}

export function clearSnapshot(storage) {
  resolveStorage(storage).removeItem(SAVE_KEY);
}

export function saveSettings(settings, storage) {
  resolveStorage(storage).setItem(SETTINGS_KEY, JSON.stringify({ schemaVersion: 1, settings }));
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
  if (['expedition-map', 'reward', 'victory', 'defeat'].includes(game.status)) return true;
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
