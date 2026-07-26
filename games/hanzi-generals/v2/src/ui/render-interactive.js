import { normalizeGameState } from '../core/state-machine.js';
import { renderApp as renderBaseApp } from './render-interactive-base.js';

export function renderApp(root, game) {
  return renderBaseApp(root, normalizeGameState(game));
}
