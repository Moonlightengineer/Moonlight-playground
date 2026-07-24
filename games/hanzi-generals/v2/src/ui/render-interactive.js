import { renderApp as renderBaseApp } from './render.js';

function node(tag, className, text) {
  const value = document.createElement(tag);
  if (className) value.className = className;
  if (text !== undefined) value.textContent = text;
  return value;
}

function actionButton(label, action, data = {}, className = '') {
  const button = node('button', className, label);
  button.type = 'button';
  button.dataset.action = action;
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== null) button.dataset[key] = String(value);
  }
  return button;
}

function renderCampSelection(root, game) {
  const container = root.querySelector('#camp');
  if (!container || game.status !== 'configuration') return;

  const selected = new Set(game.selection?.cardIds ?? []);
  container.replaceChildren(node('h2', '', `軍營 ${game.camp.cardIds.length}/${game.camp.capacity}`));
  const slots = node('div', 'camp-slots');

  for (let index = 0; index < game.camp.capacity; index += 1) {
    const cardId = game.camp.cardIds[index];
    if (!cardId) {
      slots.append(node('span', 'camp-slot is-empty', '空'));
      continue;
    }

    const wrap = node('div', 'camp-card-wrap');
    const card = game.cardsById[cardId];
    const select = actionButton(card?.symbol ?? '?', 'select-camp-card', { cardId }, 'camp-slot camp-select');
    select.classList.toggle('is-selected', selected.has(cardId));
    select.setAttribute('aria-pressed', String(selected.has(cardId)));
    select.setAttribute('aria-label', `${card?.symbol ?? '?'}字牌，軍營內${selected.has(cardId) ? '，已選取' : ''}`);
    const release = actionButton('取回', 'return-camp-card', { cardId }, 'camp-return');
    wrap.append(select, release);
    slots.append(wrap);
  }
  container.append(slots);
}

function boardCellForUnit(game, unitId) {
  return game.combat?.board.units[unitId]?.cell ?? null;
}

function decorateCombatBoard(root, game) {
  if (game.status !== 'combat') return;
  for (const button of root.querySelectorAll('#battle-board .board-cell')) {
    const unitId = button.dataset.unitId;
    if (unitId) {
      const cell = boardCellForUnit(game, unitId);
      if (cell) {
        button.dataset.column = String(cell.column);
        button.dataset.row = String(cell.row);
      }
    } else {
      button.disabled = true;
    }
    const column = Number(button.dataset.column);
    button.classList.toggle('is-fortified', game.combat.fortify?.lane === column);
  }
}

function decorateEnemyField(root, game) {
  if (game.status !== 'combat') return;
  const field = root.querySelector('#enemy-field');
  if (!field) return;
  field.style.setProperty('--enemy-columns', String(game.combat.board.size.columns));

  for (const lane of field.querySelectorAll('.enemy-lane')) {
    lane.classList.toggle('is-fortified', Number(lane.dataset.lane) === game.combat.fortify?.lane);
  }
  for (const token of field.querySelectorAll('.enemy-token')) {
    token.classList.toggle('is-focused', token.dataset.enemyId === game.combat.focus?.enemyId);
  }
}

function orderStatus(game) {
  const parts = [];
  if (game.combat.focus) {
    parts.push(`集火生效：剩餘 ${game.combat.focus.remainingFriendlyTurns} 輪`);
  }
  if (game.combat.fortify) {
    parts.push(`第 ${game.combat.fortify.lane + 1} 路堅守：剩餘 ${game.combat.fortify.remainingEnemyTurns} 輪`);
  }
  return parts;
}

function renderInteractiveOrders(root, game) {
  const container = root.querySelector('#orders');
  if (!container || game.status !== 'combat') return;
  container.replaceChildren();

  const paused = Boolean(game.combat.paused);
  container.append(actionButton(paused ? '繼續' : '暫停', paused ? 'resume' : 'pause', {}, 'primary-button'));
  container.append(actionButton(game.settings.speed === 2 ? '速度 1×' : '速度 2×', 'set-speed', {
    speed: game.settings.speed === 2 ? 1 : 2,
  }));

  const noOrders = game.combat.ordersRemaining < 1;
  const reposition = actionButton('變陣', 'begin-order', { orderType: 'swap' });
  reposition.disabled = noOrders;
  const focus = actionButton('集火', 'begin-order', { orderType: 'focus' });
  focus.disabled = noOrders || game.combat.enemies.length === 0;
  container.append(reposition, focus);

  for (let lane = 0; lane < game.combat.board.size.columns; lane += 1) {
    const button = actionButton(`守${lane + 1}路`, 'issue-order', {
      orderType: 'fortify',
      lane,
    });
    button.disabled = noOrders;
    button.classList.toggle('is-active-order', game.combat.fortify?.lane === lane);
    container.append(button);
  }

  for (const tacticId of game.combat.tactics) {
    if (tacticId === 'fire-arrows') {
      container.append(actionButton('火矢1路', 'issue-order', {
        orderType: 'tactic',
        tacticId,
        lane: 0,
      }));
    }
    if (tacticId === 'first-aid') {
      const unit = Object.values(game.combat.board.units).find(({ hp, maxHp }) => hp > 0 && hp < maxHp);
      const button = actionButton('急救', 'issue-order', {
        orderType: 'tactic',
        tacticId,
        unitId: unit?.id,
      });
      button.disabled = !unit;
      container.append(button);
    }
  }

  const statuses = orderStatus(game);
  if (statuses.length) {
    const status = node('p', 'order-status', statuses.join('｜'));
    status.setAttribute('aria-live', 'polite');
    container.append(status);
  }
}

export function renderApp(root, game) {
  renderBaseApp(root, game);
  renderCampSelection(root, game);
  decorateCombatBoard(root, game);
  decorateEnemyField(root, game);
  renderInteractiveOrders(root, game);
}
