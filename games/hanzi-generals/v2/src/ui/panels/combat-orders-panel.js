import { actionButton, node, setVisible } from './dom.js';

export function renderCombatOrdersPanel(container, model) {
  if (!container) return;
  setVisible(container, model.visible);
  if (!model.visible) return;
  const children = [];
  if (model.statuses.length) {
    const status = node('p', 'order-status', model.statuses.join('｜'));
    status.setAttribute('aria-live', 'polite');
    children.push(status);
  }
  const actions = node('div', 'order-actions');
  for (const action of model.actions) {
    actions.append(actionButton(action.label, action.action, {
      className: action.className,
      data: action.data,
      disabled: action.disabled,
      ariaLabel: action.ariaLabel,
    }));
  }
  children.push(actions);
  container.replaceChildren(...children);
}
