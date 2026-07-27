import { actionButton, node, setVisible } from './dom.js';

export function renderCampPanel(container, model) {
  if (!container) return;
  setVisible(container, model.visible);
  if (!model.visible) return;
  const title = node('h2', '', model.title);
  const slots = node('div', 'camp-slots');
  for (const slot of model.slots) {
    if (slot.empty) {
      slots.append(node('span', 'camp-slot is-empty', slot.label));
      continue;
    }
    const wrap = node('div', 'camp-card-wrap');
    const select = actionButton(slot.symbol, slot.selectAction.action, {
      className: 'camp-slot camp-select',
      data: slot.selectAction.data,
      ariaLabel: slot.ariaLabel,
    });
    select.classList.toggle('is-selected', slot.selected);
    select.setAttribute('aria-pressed', String(slot.selected));
    const takeBack = actionButton('取回', slot.returnAction.action, {
      className: 'camp-return',
      data: slot.returnAction.data,
    });
    wrap.append(select, takeBack);
    slots.append(wrap);
  }
  container.replaceChildren(title, slots);
}
