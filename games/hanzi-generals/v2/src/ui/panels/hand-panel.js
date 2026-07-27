import { actionButton, node, setVisible } from './dom.js';

export function renderHandPanel(container, model) {
  if (!container) return;
  setVisible(container, model.visible);
  if (!model.visible) return;
  const children = [];
  for (const card of model.cards) {
    const wrap = node('div', 'hand-card-wrap');
    const button = actionButton(card.symbol, card.selectAction.action, {
      className: `hand-card${card.selected ? ' is-selected' : ''}${card.retained ? ' is-retained' : ''}`,
      data: card.selectAction.data,
      ariaLabel: card.ariaLabel,
    });
    button.setAttribute('aria-pressed', String(card.selected));
    const move = actionButton('軍營', card.moveToCamp.action, {
      className: 'card-secondary-action',
      data: card.moveToCamp.data,
      disabled: card.moveToCamp.disabled,
      descriptionId: card.moveToCamp.disabled ? 'camp-full-help' : undefined,
    });
    wrap.append(button, move);
    children.push(wrap);
  }
  if (model.empty) children.push(node('p', 'empty-copy', '未有手牌。'));
  const help = node('p', 'visually-hidden', '軍營已滿，先合成或取回字牌。');
  help.id = 'camp-full-help';
  children.push(help);
  container.replaceChildren(...children);
}
