import { getRenderedViewModel } from './rendered-view-model.js';

function number(value) {
  return Number(value);
}

function didSucceed(result) {
  return result === true || result?.ok === true;
}

function escapeSelector(value) {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return String(value).replaceAll('"', '\\"');
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

function rememberInteractiveState(element) {
  if (!element.dataset.orderOriginalAction) {
    element.dataset.orderOriginalAction = element.dataset.action ?? '';
    element.dataset.orderOriginalDisabled = String(Boolean(element.disabled));
  }
}

function markTarget(element, action, data = {}) {
  if (!element) return;
  rememberInteractiveState(element);
  element.dataset.action = action;
  element.disabled = false;
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== null) element.dataset[key] = String(value);
  }
  element.classList.add('is-order-target');
}

function clearOrderDecorations(root) {
  root.dataset.orderMode = '';
  root.querySelectorAll('[data-order-original-action]').forEach((element) => {
    const original = element.dataset.orderOriginalAction;
    if (original) element.dataset.action = original;
    else delete element.dataset.action;
    element.disabled = element.dataset.orderOriginalDisabled === 'true';
    delete element.dataset.orderOriginalAction;
    delete element.dataset.orderOriginalDisabled;
    delete element.dataset.sourceUnitId;
  });
  root.querySelectorAll('.is-order-target, .is-order-source').forEach((element) => {
    element.classList.remove('is-order-target', 'is-order-source');
  });
  root.querySelectorAll('#enemy-field [data-action="order-focus-target"]').forEach((token) => {
    delete token.dataset.action;
    token.removeAttribute('role');
    token.removeAttribute('tabindex');
  });
  root.querySelectorAll('.order-prompt, [data-action="cancel-order"]').forEach((element) => element.remove());
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

function unitButton(root, unitId) {
  return root.querySelector(`#battle-board [data-unit-id="${escapeSelector(unitId)}"]`);
}

function boardCell(root, cell) {
  return root.querySelector(
    `#battle-board [data-column="${cell.column}"][data-row="${cell.row}"]`,
  );
}

function enemyToken(root, enemyId) {
  return root.querySelector(`#enemy-field [data-enemy-id="${escapeSelector(enemyId)}"]`);
}

function decorateOrderTargets(root, mode, getViewModel) {
  clearOrderDecorations(root);
  root.dataset.orderMode = mode.type;
  const orders = getViewModel()?.orders ?? {};
  const swapPairs = orders.swapPairs ?? [];
  const reinforce = orders.reinforce ?? [];
  const focusEnemyIds = orders.focusEnemyIds ?? [];

  if (mode.type === 'swap' && !mode.unitId) {
    const sourceIds = new Set(swapPairs.flat());
    for (const unitId of sourceIds) markTarget(unitButton(root, unitId), 'order-select-unit');
    addPrompt(root, '變陣：先揀一名有相鄰友軍嘅武將。');
    return;
  }

  if (mode.type === 'swap' && mode.unitId) {
    const source = unitButton(root, mode.unitId);
    if (!source) return;
    source.classList.add('is-order-source');
    source.classList.remove('is-order-target');
    const targets = swapPairs
      .filter((pair) => pair.includes(mode.unitId))
      .map((pair) => pair.find((unitId) => unitId !== mode.unitId))
      .filter(Boolean);
    for (const unitId of targets) {
      markTarget(unitButton(root, unitId), 'order-swap-target', { sourceUnitId: mode.unitId });
    }
    addPrompt(root, '變陣：再揀一名相鄰武將交換位置。');
    return;
  }

  if (mode.type === 'reinforce' && !mode.unitId) {
    for (const option of reinforce) {
      markTarget(unitButton(root, option.unitId), 'order-select-reinforce-unit');
    }
    addPrompt(root, '援防：先揀一名可調往相鄰空路嘅友軍。');
    return;
  }

  if (mode.type === 'reinforce' && mode.unitId) {
    const source = unitButton(root, mode.unitId);
    if (!source) return;
    source.classList.add('is-order-source');
    source.classList.remove('is-order-target');
    const option = reinforce.find(({ unitId }) => unitId === mode.unitId);
    for (const cell of option?.targetCells ?? []) {
      markTarget(boardCell(root, cell), 'order-reinforce-target', { sourceUnitId: mode.unitId });
    }
    addPrompt(root, '援防：再揀相鄰空路位置。移動後原路會失去呢名友軍。');
    return;
  }

  if (mode.type === 'focus') {
    for (const enemyId of focusEnemyIds) {
      const token = enemyToken(root, enemyId);
      markTarget(token, 'order-focus-target', { enemyId });
      token?.setAttribute('role', 'button');
      if (token) token.tabIndex = 0;
    }
    addPrompt(root, '集火：點選友軍原本可以攻擊嘅敵人。');
  }
}

function selectedInCamp(viewModel) {
  return (viewModel?.camp?.slots ?? []).some((slot) => slot.selected);
}

function selectedInHand(viewModel) {
  return (viewModel?.hand?.cards ?? []).some((card) => card.selected);
}

export function bindInteractions(
  root,
  dispatch,
  getViewModel = () => getRenderedViewModel(root),
) {
  let orderMode = null;

  function beginOrder(type) {
    const resumeAfter = Boolean(root.querySelector('#orders [data-action="pause"]'));
    orderMode = { type, unitId: null, resumeAfter };
    const result = dispatch({ type: 'PAUSE' });
    if (didSucceed(result)) decorateOrderTargets(root, orderMode, getViewModel);
    else orderMode = null;
  }

  function finishOrder(action) {
    const resumeAfter = Boolean(orderMode?.resumeAfter);
    orderMode = null;
    clearOrderDecorations(root);
    const result = dispatch(action);
    if (didSucceed(result) && resumeAfter) dispatch({ type: 'RESUME' });
  }

  function cancelOrder() {
    const resumeAfter = Boolean(orderMode?.resumeAfter);
    orderMode = null;
    clearOrderDecorations(root);
    if (resumeAfter) dispatch({ type: 'RESUME' });
  }

  root.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target || target.disabled) return;
    const action = target.dataset.action;

    switch (action) {
      case 'select-card':
        if (selectedInCamp(getViewModel())) dispatch({ type: 'UI_CLEAR_SELECTION' });
        dispatch({ type: 'SELECT_CARD', cardId: target.dataset.cardId });
        break;
      case 'select-camp-card':
        if (selectedInHand(getViewModel())) dispatch({ type: 'UI_CLEAR_SELECTION' });
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
        decorateOrderTargets(root, orderMode, getViewModel);
        break;
      case 'order-select-reinforce-unit':
        if (orderMode?.type !== 'reinforce') break;
        orderMode = { ...orderMode, unitId: target.dataset.unitId };
        decorateOrderTargets(root, orderMode, getViewModel);
        break;
      case 'order-swap-target':
        if (orderMode?.type !== 'swap' || !orderMode.unitId) break;
        finishOrder({
          type: 'ISSUE_ORDER',
          order: {
            type: 'swap',
            unitIds: [orderMode.unitId, target.dataset.unitId],
          },
        });
        break;
      case 'order-reinforce-target':
        if (orderMode?.type !== 'reinforce' || !orderMode.unitId) break;
        finishOrder({
          type: 'ISSUE_ORDER',
          order: {
            type: 'reinforce',
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
      case 'open-help':
        dispatch({ type: 'UI_OPEN_HELP', trigger: target });
        break;
      case 'close-help':
        dispatch({ type: 'UI_CLOSE_HELP' });
        break;
      case 'restart-expedition':
        dispatch({ type: 'UI_RESTART_EXPEDITION' });
        break;
      case 'clear-all-v2-data':
        dispatch({ type: 'UI_CLEAR_ALL_V2_DATA' });
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
