import { node } from './dom.js';

export function renderRunStatusPanel(container, model) {
  if (!container) return;
  const title = node('div', 'run-title');
  title.append(node('strong', '', model.title));
  title.append(node('span', '', model.wallLabel));
  if (model.orderLabel) title.append(node('span', '', model.orderLabel));

  const cardCounts = node('dl', 'card-zone-counts');
  cardCounts.setAttribute('aria-label', model.cardCountsReconciled
    ? '字牌分區數量'
    : '字牌分區數量未能對數');
  for (const item of model.cardCounts ?? []) {
    const group = node('div', 'card-zone-count');
    group.dataset.zone = item.key;
    group.append(node('dt', '', item.label));
    group.append(node('dd', '', item.count));
    group.setAttribute('aria-label', `${item.label} ${item.count} 張`);
    cardCounts.append(group);
  }
  if (!model.cardCountsReconciled) cardCounts.classList.add('is-unreconciled');

  const progress = node('ol', 'run-progress');
  for (const stage of model.progress) {
    const item = node('li', stage.complete ? 'is-complete' : '', stage.label);
    item.title = stage.stageId;
    item.setAttribute('aria-label', stage.ariaLabel);
    progress.append(item);
  }

  const tutorial = node('p', 'tutorial-message', model.tutorialText);
  tutorial.id = 'tutorial-message';
  container.replaceChildren(title, cardCounts, progress, tutorial);
}
