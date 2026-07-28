import { node } from './dom.js';

export function renderRunStatusPanel(container, model) {
  if (!container) return;
  const title = node('div', 'run-title');
  title.append(node('strong', '', model.title));
  title.append(node('span', '', model.wallLabel));
  if (model.orderLabel) title.append(node('span', '', model.orderLabel));

  const progress = node('ol', 'run-progress');
  for (const stage of model.progress) {
    const item = node('li', stage.complete ? 'is-complete' : '', stage.label);
    item.title = stage.stageId;
    item.setAttribute('aria-label', stage.ariaLabel);
    progress.append(item);
  }

  const tutorial = node('p', 'tutorial-message', model.tutorialText);
  tutorial.id = 'tutorial-message';
  container.replaceChildren(title, progress, tutorial);
}
