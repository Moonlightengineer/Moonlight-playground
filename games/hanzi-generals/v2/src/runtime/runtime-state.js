function normalizeDiscoveredRecipeIds(game, profile = {}) {
  const explicit = Array.isArray(profile.discoveredRecipeIds) ? profile.discoveredRecipeIds : [];
  const legacy = Array.isArray(game?.recruitedGeneralIds) ? game.recruitedGeneralIds : [];
  const result = [];
  const seen = new Set();
  for (const recipeId of [...explicit, ...legacy]) {
    if (typeof recipeId !== 'string' || !recipeId || seen.has(recipeId)) continue;
    seen.add(recipeId);
    result.push(recipeId);
  }
  return result;
}

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

function explicitOrLegacy(object, key, legacy, fallback = null) {
  return Object.prototype.hasOwnProperty.call(object, key) ? object[key] : legacy ?? fallback;
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
      discoveredRecipeIds: normalizeDiscoveredRecipeIds(game, profile),
    },
    ui: {
      selectedCardIds: [...(explicitSelected ?? legacySelected)],
      rangeUnitId: explicitOrLegacy(ui, 'rangeUnitId', game.ui?.rangeUnitId),
      lastMessage: explicitOrLegacy(ui, 'lastMessage', game.ui?.lastMessage, ''),
      overlay: explicitOrLegacy(ui, 'overlay', null),
      orderDraft: explicitOrLegacy(ui, 'orderDraft', null),
    },
  };
}
