function element(tag, className = '', text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
}

function entryStateLabel(state) {
  if (state === 'public') return '已發現・公開配方';
  if (state === 'discovered') return '已發現';
  if (state === 'clue') return '未發現・已有線索';
  return '未發現';
}

function renderCodex(contentRoot, model) {
  const safe = model ?? { entries: [], discovered: 0, total: 0 };
  const summary = element(
    'p',
    'codex-summary',
    `已發現 ${safe.discovered}｜未發現 ${Math.max(0, safe.total - safe.discovered)}`,
  );
  const grid = element('div', 'recipe-codex-grid codex-grid');
  for (const entry of safe.entries) {
    const card = element('article', `recipe-codex-card is-${entry.state}`);
    card.dataset.recipeId = entry.id;
    card.append(
      element('strong', 'recipe-codex-name', entry.name),
      element('span', 'recipe-codex-symbols', entry.symbolsLabel),
      element('small', 'recipe-codex-state', entryStateLabel(entry.state)),
    );
    if (entry.detailText) card.append(element('p', 'recipe-codex-detail', entry.detailText));
    grid.append(card);
  }
  contentRoot.replaceChildren(summary, grid);
}

export function createCodexPanel({
  panel,
  contentRoot,
  getModel = () => null,
  onOpen = () => {},
  onClose = () => {},
}) {
  if (!panel || !contentRoot) throw new Error('Codex panel shell is incomplete');
  let returnFocus = null;

  function open(trigger = document.activeElement) {
    if (!panel.hidden) return;
    renderCodex(contentRoot, getModel());
    returnFocus = trigger instanceof HTMLElement ? trigger : null;
    onOpen();
    panel.hidden = false;
    document.body.classList.add('codex-open');
    panel.scrollTop = 0;
    panel.querySelector('[data-action="close-codex"]')?.focus();
  }

  function close() {
    if (panel.hidden) return;
    panel.hidden = true;
    document.body.classList.remove('codex-open');
    onClose();
    returnFocus?.focus();
    returnFocus = null;
  }

  function isOpen() {
    return !panel.hidden;
  }

  return { open, close, isOpen };
}
