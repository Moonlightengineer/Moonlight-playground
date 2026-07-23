function number(value) {
  return Number(value);
}

function orderFromDataset(dataset) {
  if (dataset.orderType === 'swap') {
    return { type: 'swap', unitIds: dataset.unitIds.split(',').filter(Boolean) };
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

export function bindInteractions(root, dispatch) {
  root.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target || target.disabled) return;
    const action = target.dataset.action;

    switch (action) {
      case 'select-card':
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
