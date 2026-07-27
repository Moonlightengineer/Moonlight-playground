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
  const settings = node('div', 'settings-actions');
  for (const setting of model.settings) {
    settings.append(actionButton(setting.label, setting.action));
  }
  children.push(settings);
  container.replaceChildren(...children);
}
