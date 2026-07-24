function number(value) {
  return Number(value);
}

function orderFromDataset(dataset) {
  if (dataset.orderType === 'swap') {
    return { type: 'swap', unitIds: (dataset.unitIds ?? '').split(',').filter(Boolean) };
  }
  if (dataset.orderType === 'focus') {
    return { type: 'focus', enemyId: dataset.enemyId };
  }
  if (dataset.orderType === 'fortify') {
    return { type: 'fortify', lane: number(dataset.lane) };
  }
  if (dataset.orderType === 'tactic') {
    return {
      type: 'tactic',
      tacticId: dataset.tacticId,
      lane: dataset.lane === undefined ? undefined : number(dataset.lane),
      unitId: dataset.unitId || undefined,
    };
  }
  return null;
}

function clearOrderDecorations(root) {
  root.dataset.orderMode = '';
  root.querySelectorAll('.is-order-target, .is-order-source').forEach((element) => {
    element.classList.remove('is-order-target', 'is-order-source');
  });
  root.querySelectorAll('.order-prompt').forEach((element) => element.remove());
}

function addPrompt(root, text) {
  root.querySelectorAll('.order-prompt').forEach((element) => element.remove());
  const prompt = document.createElement('p');
  prompt.className = 'order-prompt';
  prompt.textContent = text;
  prompt.setAttribute('aria-live', 'polite');
  const orders = root.querySelector('#orders');
  orders?.prepend(prompt);

  if (!orders?.querySelector('[data-action="cancel-order"]')) {
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.dataset.action = 'cancel-order';
    cancel.textContent = '取消';
    orders?.append(cancel);
  }
}

function cellFromElement(element) {
  return {
    column: number(element.dataset.column),
    row: number(element.dataset.row),
  };
}

function distance(a, b) {
  return Math.abs(a.column - b.column) + Math.abs(a.row - b.row);
}

function decorateOrderTargets(root, mode) {
  clearOrderDecorations(root);
  root.dataset.orderMode = mode.type;

  if (mode.type === 'swap' && !mode.unitId) {
    for (const button of root.querySelectorAll('#battle-board .board-cell.has-unit')) {
      button.disabled = false;
      button.dataset.action = 'order-select-unit';
      button.classList.add('is-order-target');
    }
    addPrompt(root, '變陣：先揀一名武將。');
    return;
  }

  if (mode.type === 'swap' && mode.unitId) {
    const source = root.querySelector(`#battle-board [data-unit-id="${CSS.escape(mode.unitId)}"]`);
    if (!source) return;
    const sourceCell = cellFromElement(source);
    source.classList.add('is-order-source');
    source.classList.remove('is-order-target');

    for (const button of root.querySelectorAll('#battle-board .board-cell')) {
      const targetCell = cellFromElement(button);
      if (distance(sourceCell, targetCell) !== 1) continue;
      button.disabled = false;
      button.dataset.action = 'order-reposition-target';
      button.dataset.sourceUnitId = mode.unitId;
      button.classList.add('is-order-target');
    }
    addPrompt(root, '變陣：再揀相鄰空格或武將。');
    return;
  }

  if (mode.type === 'focus') {
    for (const token of root.querySelectorAll('#enemy-field .enemy-token')) {
      token.dataset.action = 'order-focus-target';
      token.dataset.enemyId = token.dataset.enemyId ?? token.dataset.entityId;
      token.classList.add('is-order-target');
      token.setAttribute('role', 'button');
      token.tabIndex = 0;
    }
    addPrompt(root, '集火：點選要優先攻擊嘅敵人。');
  }
}

export function bindInteractions(root, dispatch) {
  let orderMode = null;

  function beginOrder(type) {
    const resumeAfter = Boolean(root.querySelector('#orders [data-action="pause"]'));
    orderMode = { type, unitId: null, resumeAfter };
    dispatch({ type: 'PAUSE' });
    decorateOrderTargets(root, orderMode);
  }

  function finishOrder(action) {
    const resumeAfter = Boolean(orderMode?.resumeAfter);
    orderMode = null;
    clearOrderDecorations(root);
    const ok = dispatch(action);
    if (ok && resumeAfter) dispatch({ type: 'RESUME' });
  }

  function cancelOrder() {
    const resumeAfter = Boolean(orderMode?.resumeAfter);
    orderMode = null;
    dispatch({ type: 'PAUSE' });
    clearOrderDecorations(root);
    if (resumeAfter) dispatch({ type: 'RESUME' });
  }

  root.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target || target.disabled) return;
    const action = target.dataset.action;

    switch (action) {
      case 'select-card':
        if (root.querySelector('#camp .camp-select.is-selected')) dispatch({ type: 'UI_CLEAR_SELECTION' });
        dispatch({ type: 'SELECT_CARD', cardId: target.dataset.cardId });
        break;
      case 'select-camp-card':
        if (root.querySelector('#hand .hand-card.is-selected')) dispatch({ type: 'UI_CLEAR_SELECTION' });
        dispatch({ type: 'SELECT_CARD', cardId: target.dataset.cardId });
        break;
      case 'choose-cell':
        dispatch({
          type: 'ASSEMBLE',
          target: { column: number(target.dataset.column), row: number(target.dataset.row) },
        });
        break;
      case 'return-board-card':
        dispatch({
          type: 'RETURN_BOARD_CARD',
          target: { column: number(target.dataset.column), row: number(target.dataset.row) },
        });
        break;
      case 'move-card-to-camp':
        dispatch({ type: 'MOVE_CARD_TO_CAMP', cardId: target.dataset.cardId });
        break;
      case 'return-camp-card':
        dispatch({ type: 'RETURN_CAMP_CARD', cardId: target.dataset.cardId });
        break;
      case 'draw-cards':
        dispatch({ type: 'DRAW_CARDS' });
        break;
      case 'retain-cards':
        dispatch({ type: 'RETAIN_CARDS', cardIds: target.dataset.cardIds.split(',').filter(Boolean) });
        break;
      case 'reroll':
        dispatch({ type: 'REROLL', lockedCardIds: [] });
        break;
      case 'start-phase':
        dispatch({ type: 'START_PHASE' });
        break;
      case 'start-battle':
        dispatch({ type: 'START_BATTLE' });
        break;
      case 'choose-route':
        dispatch({ type: 'CHOOSE_ROUTE', route: target.dataset.route });
        break;
      case 'choose-reward':
        dispatch({
          type: 'CHOOSE_REWARD',
          rewardId: target.dataset.rewardId,
          payload: {
            cardId: target.dataset.cardId || undefined,
            generalId: target.dataset.generalId || undefined,
            evolutionId: target.dataset.evolutionId || undefined,
          },
        });
        break;
      case 'pause':
        dispatch({ type: 'PAUSE' });
        break;
      case 'resume':
        dispatch({ type: 'RESUME' });
        break;
      case 'set-speed':
        dispatch({ type: 'SET_SPEED', speed: number(target.dataset.speed) });
        break;
      case 'begin-order':
        beginOrder(target.dataset.orderType);
        break;
      case 'order-select-unit':
        if (orderMode?.type !== 'swap') break;
        orderMode = { ...orderMode, unitId: target.dataset.unitId };
        decorateOrderTargets(root, orderMode);
        break;
      case 'order-reposition-target':
        if (orderMode?.type !== 'swap' || !orderMode.unitId) break;
        finishOrder({
          type: 'ISSUE_ORDER',
          order: {
            type: 'swap',
            unitId: orderMode.unitId,
            targetCell: cellFromElement(target),
          },
        });
        break;
      case 'order-focus-target':
        if (orderMode?.type !== 'focus') break;
        finishOrder({
          type: 'ISSUE_ORDER',
          order: { type: 'focus', enemyId: target.dataset.enemyId },
        });
        break;
      case 'cancel-order':
        cancelOrder();
        break;
      case 'issue-order': {
        const order = orderFromDataset(target.dataset);
        if (order) dispatch({ type: 'ISSUE_ORDER', order });
        break;
      }
      case 'start-new-run':
        dispatch({ type: 'START_NEW_RUN', seed: Date.now() });
        break;
      case 'open-range':
        dispatch({ type: 'UI_OPEN_RANGE', unitId: target.dataset.unitId });
        break;
      case 'clear-selection':
        dispatch({ type: 'UI_CLEAR_SELECTION' });
        break;
      case 'skip-tutorial':
        dispatch({ type: 'UI_SKIP_TUTORIAL' });
        break;
      case 'toggle-reduced-motion':
        dispatch({ type: 'UI_TOGGLE_REDUCED_MOTION' });
        break;
      case 'toggle-vibration':
        dispatch({ type: 'UI_TOGGLE_VIBRATION' });
        break;
      default:
        break;
    }
  });

  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = event.target.closest('[data-action]');
    if (target && target.tagName !== 'BUTTON') {
      event.preventDefault();
      target.click();
    }
  });
}
