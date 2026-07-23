const SAVE_KEY = 'hanzi-generals-v2:save:v1';
const SETTINGS_KEY = 'hanzi-generals-v2:settings:v1';
const SAVE_VERSION = 1;

function resolveStorage(storage) {
  if (storage) return storage;
  if (typeof localStorage !== 'undefined') return localStorage;
  throw new Error('Storage is unavailable');
}

export function saveSnapshot(game, storage) {
  const target = resolveStorage(storage);
  target.setItem(SAVE_KEY, JSON.stringify({ schemaVersion: SAVE_VERSION, game }));
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
    if (parsed.schemaVersion !== SAVE_VERSION) {
      return { ok: false, error: { code: 'UNSUPPORTED_SAVE', message: '存檔版本不支援。' } };
    }
    if (!parsed.game || typeof parsed.game !== 'object') {
      return { ok: false, error: { code: 'CORRUPT_SAVE', message: '存檔內容不完整，可重設 v2 測試存檔。' } };
    }
    return { ok: true, game: parsed.game };
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

export const STORAGE_KEYS = Object.freeze({ save: SAVE_KEY, settings: SETTINGS_KEY });
