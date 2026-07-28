import { renderBattleStagePanel } from './panels/battle-stage-panel.js';
import { renderCampPanel } from './panels/camp-panel.js';
import { renderCombatOrdersPanel } from './panels/combat-orders-panel.js';
import { renderDetailsPanel } from './panels/details-panel.js';
import { renderHandPanel } from './panels/hand-panel.js';
import { renderPrimaryPanel } from './panels/primary-panel.js';
import { renderRunStatusPanel } from './panels/run-status-panel.js';
import { rememberRenderedViewModel } from './rendered-view-model.js';

export function renderApp(root, viewModel) {
  rememberRenderedViewModel(root, viewModel);
  root.dataset.status = viewModel.root.status;
  root.dataset.reducedMotion = String(viewModel.root.reducedMotion);

  renderRunStatusPanel(root.querySelector('#run-status'), viewModel.runStatus);
  renderBattleStagePanel(root.querySelector('.battle-stage'), viewModel.battleStage);
  renderCampPanel(root.querySelector('#camp'), viewModel.camp);
  renderPrimaryPanel(root.querySelector('#primary-actions'), viewModel.primary);
  renderCombatOrdersPanel(root.querySelector('#orders'), viewModel.orders);
  renderHandPanel(root.querySelector('#hand'), viewModel.hand);
  renderDetailsPanel(root.querySelector('#details-panel'), viewModel.details);
}
