export function gameEvent(type, payload = {}, at = Date.now()) {
  if (!type || typeof type !== 'string') {
    throw new Error('gameEvent type must be a non-empty string');
  }
  return Object.freeze({ type, payload: Object.freeze({ ...payload }), at });
}

export function errorEvent(code, message, payload = {}) {
  return gameEvent('error', { code, message, ...payload });
}
