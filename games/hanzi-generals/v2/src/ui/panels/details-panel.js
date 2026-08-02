import { actionButton, node, setVisible } from './dom.js';

export function renderDetailsPanel(container, model) {
  if (!container) return;
  setVisible(container, model.visible);
  if (!model.visible) return;
  const summary = container.querySelector('summary') ?? node('summary', '', model.summary);
  summary.textContent = model.summary;
  const list = node('dl', 'details-list');
  for (const [label, value] of model.items) {
    list.append(node('dt', '', label), node('dd', '', value));
  }
  const children = [summary, list];
  if (model.rangeDetail) children.push(node('p', 'range-detail', model.rangeDetail));
  if (model.codex) {
    const codex = node('details', 'recipe-codex');
    const codexSummary = node('summary', '', `配方圖鑑 ${model.codex.discovered}/${model.codex.total}`);
    const grid = node('div', 'recipe-codex-grid');
    for (const entry of model.codex.entries) {
      const card = node('article', `recipe-codex-card is-${entry.state}`);
      card.dataset.recipeId = entry.id;
      card.append(node('strong', 'recipe-codex-name', entry.name));
      card.append(node('span', 'recipe-codex-symbols', entry.symbolsLabel));
      const stateLabel = entry.state === 'public'
        ? '公開兵種'
        : entry.state === 'discovered'
          ? '已發現'
          : entry.state === 'locked' ? '未解鎖剪影' : '配方線索';
      card.append(node('small', 'recipe-codex-state', stateLabel));
      if (entry.detailText) card.append(node('p', 'recipe-codex-detail', entry.detailText));
      grid.append(card);
    }
    codex.append(codexSummary, grid);
    children.push(codex);
  }
  const settings = node('div', 'settings-actions');
  for (const setting of model.settings) {
    settings.append(actionButton(setting.label, setting.action));
  }
  children.push(settings);
  container.replaceChildren(...children);
}
