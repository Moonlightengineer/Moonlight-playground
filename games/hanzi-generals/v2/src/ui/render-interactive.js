import { normalizeGameState } from '../core/state-machine.js';
import { renderApp as renderViewModel } from './render-app.js';
import { buildAppViewModel } from './view-model.js';

function legacyProfile(game) {
  return {
    settings: game.settings ?? {},
    tutorial: game.tutorial,
  };
}

function legacyUi(game) {
  return {
    selectedCardIds: game.selection?.cardIds ?? [],
    rangeUnitId: game.ui?.rangeUnitId ?? null,
    lastMessage: game.ui?.lastMessage ?? '',
  };
}

export function renderApp(root, game) {
  const normalized = normalizeGameState(game);
  const viewModel = buildAppViewModel(normalized, legacyProfile(normalized), legacyUi(normalized));
  return renderViewModel(root, viewModel);
}
