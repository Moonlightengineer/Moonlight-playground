import { GENERAL_BY_ID } from '../../data/generals.js';
import { ENEMY_BY_ID } from '../../data/enemies.js';
import { deriveLaneWarnings } from '../combat/intents.js';
import { getUnitAt, listCells } from '../board/board.js';
import { tutorialText } from './tutorial.js';

function node(tag, className, text) {
  const value = document.createElement(tag);
  if (className) value.className = className;
  if (text !== undefined) value.textContent = text;
  return value;
}

function actionButton(label, action, options = {}) {
  const button = node('button', options.className ?? '', label);
  button.type = 'button';
  button.dataset.action = action;
  button.disabled = Boolean(options.disabled);
  if (options.descriptionId) button.setAttribute('aria-describedby', options.descriptionId);
  for (const [key, value] of Object.entries(options.data ?? {})) {
    button.dataset[key] = String(value);
  }
  return button;
}

function stageLabel(game) {
  if (game.status === 'victory') return '遠征勝利';
  if (game.status === 'defeat') return '遠征失敗';
  if (game.status === 'reward') return '選擇戰後獎勵';
  if (game.status === 'combat') return `第 ${game.battleIndex + 1} 戰・第 ${game.currentBattle.phaseIndex + 1} 段`;
  if (game.status === 'configuration') return `第 ${game.battleIndex + 1} 戰・整軍`;
  return game.awaitingRoute ? '選擇遠征路線' : `準備第 ${game.battleIndex + 1} 戰`;
}

function renderStatus(container, game) {
  container.replaceChildren();
  const title = node('div', 'run-title');
  title.append(node('strong', '', stageLabel(game)));
  title.append(node('span', '', `城牆 ${game.wallHp}/${game.wallMaxHp}`));
  if (game.status === 'combat') title.append(node('span', '', `軍令 ${game.combat.ordersRemaining}`));
  container.append(title);

  const progress = node('ol', 'run-progress');
  const route = game.route ?? 'safe';
  const routeStages = route === 'danger'
    ? ['tutorial', 'shield-line', 'route-danger', 'cavalry-warning', 'elite-mixed', 'hua-xiong']
    : ['tutorial', 'shield-line', 'route-safe', 'cavalry-warning', 'elite-mixed', 'hua-xiong'];
  for (const stageId of routeStages) {
    const item = node('li', game.completedBattleIds.includes(stageId) ? 'is-complete' : '', stageId);
    progress.append(item);
  }
  container.append(progress);

  const tutorial = node('p', 'tutorial-message', tutorialText(game.tutorial));
  tutorial.id = 'tutorial-message';
  container.append(tutorial);
}

function renderIntents(container, game) {
  container.replaceChildren();
  if (game.status !== 'combat') {
    container.append(node('p', 'empty-copy', '開始戰鬥後會顯示每一路敵軍意圖。'));
    return;
  }
  const warnings = deriveLaneWarnings(game.combat);
  for (const warning of warnings) {
    const item = node('article', `intent intent-${warning.level}`);
    item.dataset.lane = String(warning.lane);
    item.append(node('strong', '', `第 ${warning.lane + 1} 路`));
    item.append(node('span', 'intent-icon', warning.level === 'danger' ? '⚠' : '•'));
    item.append(node('span', '', warning.text));
    const charge = game.combat.enemies.find((enemy) => enemy.lane === warning.lane && enemy.definitionId === 'heavy-cavalry');
    if (charge) item.append(node('span', 'intent-countdown', `倒數 ${charge.chargeIn ?? 3}`));
    container.append(item);
  }
}

function renderBoard(container, game) {
  container.replaceChildren();
  container.style.setProperty('--columns', game.board.size.columns);
  const legal = game.legalCells ?? listCells(game.board);

  for (const cell of listCells(game.board)) {
    const unit = getUnitAt(game.board, cell);
    const allowed = legal.some((item) => item.column === cell.column && item.row === cell.row);
    const button = actionButton(unit ? GENERAL_BY_ID[unit.definitionId]?.name ?? unit.definitionId : '空', unit ? 'open-range' : 'choose-cell', {
      className: `board-cell${unit ? ' has-unit' : ''}`,
      disabled: !unit && !allowed,
      data: unit
        ? { unitId: unit.id }
        : { column: cell.column, row: cell.row },
      descriptionId: !unit && !allowed ? 'cell-disabled-help' : undefined,
    });
    button.dataset.entityId = unit?.id ?? `cell-${cell.column}-${cell.row}`;
    button.dataset.column = String(cell.column);
    button.dataset.row = String(cell.row);
    button.setAttribute('aria-label', unit
      ? `${GENERAL_BY_ID[unit.definitionId]?.name ?? unit.definitionId}，生命 ${unit.hp}/${unit.maxHp}`
      : `第 ${cell.column + 1} 路，第 ${cell.row + 1} 列空格`);
    if (unit) {
      const hp = node('small', 'unit-hp', `${unit.hp}/${unit.maxHp}`);
      button.append(hp);
    }
    container.append(button);
  }
  const help = node('p', 'visually-hidden', '未高亮位置暫時不可部署。');
  help.id = 'cell-disabled-help';
  container.append(help);
}

function renderCamp(container, game) {
  container.replaceChildren(node('h2', '', `軍營 ${game.camp.cardIds.length}/${game.camp.capacity}`));
  const slots = node('div', 'camp-slots');
  for (let index = 0; index < game.camp.capacity; index += 1) {
    const cardId = game.camp.cardIds[index];
    if (!cardId) {
      const empty = node('span', 'camp-slot is-empty', '空');
      slots.append(empty);
      continue;
    }
    const card = game.cardsById[cardId];
    slots.append(actionButton(card?.symbol ?? '?', 'return-camp-card', {
      className: 'camp-slot',
      data: { cardId },
    }));
  }
  container.append(slots);
}

function renderHand(container, game) {
  container.replaceChildren();
  const selected = new Set(game.selection?.cardIds ?? []);
  for (const card of game.deck.hand) {
    const wrap = node('div', 'hand-card-wrap');
    const button = actionButton(card.symbol, 'select-card', {
      className: `hand-card${selected.has(card.id) ? ' is-selected' : ''}`,
      data: { cardId: card.id },
    });
    button.setAttribute('aria-pressed', String(selected.has(card.id)));
    button.setAttribute('aria-label', `${card.symbol}字牌${selected.has(card.id) ? '，已選取' : ''}`);
    wrap.append(button);
    wrap.append(actionButton('軍營', 'move-card-to-camp', {
      className: 'card-secondary-action',
      disabled: game.camp.cardIds.length >= game.camp.capacity,
      data: { cardId: card.id },
      descriptionId: game.camp.cardIds.length >= game.camp.capacity ? 'camp-full-help' : undefined,
    }));
    container.append(wrap);
  }
  if (!game.deck.hand.length) container.append(node('p', 'empty-copy', '未有手牌。'));
  const help = node('p', 'visually-hidden', '軍營已滿，先合成或取回字牌。');
  help.id = 'camp-full-help';
  container.append(help);
}

function rewardButtons(game) {
  return game.rewardChoices.map((reward) => actionButton(reward.name, 'choose-reward', {
    className: 'primary-button reward-button',
    data: { rewardId: reward.id },
  }));
}

function renderActions(container, game) {
  container.replaceChildren();

  if (game.status === 'expedition-map') {
    if (game.awaitingRoute) {
      container.append(actionButton('安全路線', 'choose-route', { className: 'primary-button', data: { route: 'safe' } }));
      container.append(actionButton('危險路線', 'choose-route', { className: 'danger-button', data: { route: 'danger' } }));
    } else {
      container.append(actionButton('開始下一戰', 'start-battle', { className: 'primary-button' }));
    }
    return;
  }

  if (game.status === 'configuration') {
    if (!game.deck.hand.length) container.append(actionButton('抽牌', 'draw-cards', { className: 'primary-button' }));
    if (game.selection?.cardIds?.length >= 2) container.append(actionButton('取消選取', 'clear-selection'));
    container.append(actionButton('重抽', 'reroll', {
      disabled: game.deck.freeRerollsRemaining < 1 || !game.deck.hand.length,
      data: { reason: game.deck.freeRerollsRemaining < 1 ? '已用完免費重抽' : '' },
    }));
    container.append(actionButton('開始呢一段', 'start-phase', {
      className: 'primary-button',
      disabled: Object.keys(game.board.units).length === 0,
      descriptionId: Object.keys(game.board.units).length === 0 ? 'phase-disabled-help' : undefined,
    }));
    const help = node('p', 'visually-hidden', '至少部署一個單位先可以開始戰鬥。');
    help.id = 'phase-disabled-help';
    container.append(help);
    return;
  }

  if (game.status === 'reward') {
    container.append(...rewardButtons(game));
    return;
  }

  if (game.status === 'victory' || game.status === 'defeat') {
    container.append(actionButton('開始新遠征', 'start-new-run', { className: 'primary-button' }));
  }
}

function firstAdjacentPair(game) {
  const units = Object.values(game.combat?.board.units ?? {});
  for (let i = 0; i < units.length; i += 1) {
    for (let j = i + 1; j < units.length; j += 1) {
      const distance = Math.abs(units[i].cell.column - units[j].cell.column)
        + Math.abs(units[i].cell.row - units[j].cell.row);
      if (distance === 1) return [units[i].id, units[j].id];
    }
  }
  return null;
}

function renderOrders(container, game) {
  container.replaceChildren();
  if (game.status !== 'combat') {
    container.append(node('p', 'empty-copy', '戰鬥開始後可使用軍令。'));
    return;
  }

  const paused = Boolean(game.combat.paused);
  container.append(actionButton(paused ? '繼續' : '暫停', paused ? 'resume' : 'pause', {
    className: 'primary-button',
  }));
  container.append(actionButton(game.settings.speed === 2 ? '速度 1×' : '速度 2×', 'set-speed', {
    data: { speed: game.settings.speed === 2 ? 1 : 2 },
  }));

  const noOrders = game.combat.ordersRemaining < 1;
  const pair = firstAdjacentPair(game);
  container.append(actionButton('變陣', 'issue-order', {
    disabled: noOrders || !pair,
    data: { orderType: 'swap', unitIds: pair?.join(',') ?? '' },
  }));

  const target = [...game.combat.enemies].filter(({ hp }) => hp > 0).sort((a, b) => a.distance - b.distance)[0];
  container.append(actionButton('集火', 'issue-order', {
    disabled: noOrders || !target,
    data: { orderType: 'focus', enemyId: target?.id ?? '' },
  }));

  for (let lane = 0; lane < game.board.size.columns; lane += 1) {
    container.append(actionButton(`堅守第 ${lane + 1} 路`, 'issue-order', {
      disabled: noOrders,
      data: { orderType: 'fortify', lane },
    }));
  }

  for (const tacticId of game.combat.tactics) {
    if (tacticId === 'fire-arrows') {
      container.append(actionButton('火矢・第 1 路', 'issue-order', {
        data: { orderType: 'tactic', tacticId, lane: 0 },
      }));
    }
    if (tacticId === 'first-aid') {
      const unit = Object.values(game.combat.board.units).find(({ hp, maxHp }) => hp > 0 && hp < maxHp);
      container.append(actionButton('急救', 'issue-order', {
        disabled: !unit,
        data: { orderType: 'tactic', tacticId, unitId: unit?.id ?? '' },
      }));
    }
  }
}

function renderDetails(container, game) {
  const existingSummary = container.querySelector('summary') ?? node('summary', '', '牌庫與戰鬥詳情');
  container.replaceChildren(existingSummary);
  const list = node('dl', 'details-list');
  const items = [
    ['抽牌堆', game.deck.drawPile.length],
    ['棄牌堆', game.deck.discardPile.length],
    ['部署中配方', game.deck.deployed.length],
    ['棋盤', `${game.board.size.columns}×${game.board.size.rows}`],
    ['遠征種子', game.seed],
  ];
  for (const [label, value] of items) {
    list.append(node('dt', '', label));
    list.append(node('dd', '', String(value)));
  }
  container.append(list);
}

export function renderApp(root, game) {
  root.dataset.status = game.status;
  root.dataset.reducedMotion = String(Boolean(game.settings?.reducedMotion));
  renderStatus(root.querySelector('#run-status'), game);
  renderIntents(root.querySelector('#enemy-intents'), game);
  renderBoard(root.querySelector('#battle-board'), game.status === 'combat' ? { ...game, board: game.combat.board } : game);
  renderCamp(root.querySelector('#camp'), game);
  renderHand(root.querySelector('#hand'), game);
  renderActions(root.querySelector('#primary-actions'), game);
  renderOrders(root.querySelector('#orders'), game);
  renderDetails(root.querySelector('#details-panel'), game);
}
