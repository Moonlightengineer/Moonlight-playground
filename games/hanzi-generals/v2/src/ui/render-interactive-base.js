import { buildAppViewModel } from './view-model.js';
import { renderApp as renderViewModel } from './render-app.js';

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
  return renderViewModel(root, buildAppViewModel(game, legacyProfile(game), legacyUi(game)));
}
