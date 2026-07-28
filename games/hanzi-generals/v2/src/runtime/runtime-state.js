function normalizeSettings(game, profile = {}) {
  const legacy = game?.settings ?? {};
  const explicit = profile.settings ?? {};
  return {
    reducedMotion: Boolean(explicit.reducedMotion ?? legacy.reducedMotion),
    vibration: explicit.vibration ?? legacy.vibration ?? true,
    speed: [1, 2].includes(explicit.speed)
      ? explicit.speed
      : [1, 2].includes(legacy.speed) ? legacy.speed : 1,
  };
}

function cloneTutorial(tutorial) {
  return tutorial && typeof tutorial === 'object' ? { ...tutorial } : null;
}

export function createRuntimeState({ game, profile = {}, ui = {} }) {
  if (!game || typeof game !== 'object') throw new Error('Runtime game state must be an object.');
  const explicitSelected = Array.isArray(ui.selectedCardIds) ? ui.selectedCardIds : null;
  const legacySelected = Array.isArray(game.selection?.cardIds) ? game.selection.cardIds : [];
  return {
    game,
    profile: {
      settings: normalizeSettings(game, profile),
      tutorial: cloneTutorial(profile.tutorial ?? game.tutorial),
    },
    ui: {
      selectedCardIds: [...(explicitSelected ?? legacySelected)],
      rangeUnitId: ui.rangeUnitId ?? game.ui?.rangeUnitId ?? null,
      lastMessage: ui.lastMessage ?? game.ui?.lastMessage ?? '',
      overlay: ui.overlay ?? null,
      orderDraft: ui.orderDraft ?? null,
    },
  };
}
