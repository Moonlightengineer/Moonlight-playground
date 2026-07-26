import { GENERAL_BY_ID } from '../../data/generals.js';
import { EVOLUTION_BY_ID, resolveEvolvedDefinition } from '../../data/evolutions.js';
import { REWARDS } from '../../data/rewards.js';
import { areAdjacent } from '../board/board.js';
import { canFocusEnemy } from '../combat/targeting.js';
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
    wrap.append(select, actionButton('取回', 'return-camp-card', { cardId }, 'camp-return'));
    slots.append(wrap);
  }
  container.append(slots);
}

function boardCellForUnit(game, unitId) {
  return game.combat?.board.units[unitId]?.cell ?? null;
}

function adjacentSwapPairExists(combat) {
  const units = Object.values(combat?.board.units ?? {}).filter(({ hp }) => hp > 0);
  return units.some((unit, index) => units.slice(index + 1).some((candidate) => areAdjacent(unit.cell, candidate.cell)));
}

function reinforceMoveExists(combat) {
  const units = Object.values(combat?.board.units ?? {}).filter(({ hp }) => hp > 0);
  const occupied = new Set(units.map(({ cell }) => `${cell.column},${cell.row}`));
  return units.some(({ cell }) => [-1, 1].some((offset) => {
    const column = cell.column + offset;
    return column >= 0 && column < combat.board.size.columns && !occupied.has(`${column},${cell.row}`);
  }));
}

function decorateEvolution(button, unit) {
  const base = GENERAL_BY_ID[unit.definitionId];
  const evolution = EVOLUTION_BY_ID[unit.evolution];
  if (!base || !evolution) return;
  const effective = resolveEvolvedDefinition(base, unit.evolution);
  button.classList.add('is-evolved');
  button.dataset.evolutionId = evolution.id;
  button.append(node('small', 'evolution-badge', `進化・${evolution.name}`));
  button.setAttribute('aria-label', `${base.name}，已進化為${evolution.name}。生命 ${unit.hp}/${unit.maxHp}，傷害 ${base.damage}→${effective.damage}，射程 ${base.range}→${effective.range}，攻擊間隔 ${base.attackEvery}→${effective.attackEvery}。${evolution.effect}`);
  button.title = `${evolution.name}｜${evolution.effect}`;
}

function decorateCombatBoard(root, game) {
  if (game.status !== 'combat') return;
  for (const button of root.querySelectorAll('#battle-board .board-cell')) {
    const unitId = button.dataset.unitId;
    if (unitId) {
      const unit = game.combat.board.units[unitId];
      const cell = boardCellForUnit(game, unitId);
      if (cell) {
        button.dataset.column = String(cell.column);
        button.dataset.row = String(cell.row);
      }
      if (unit) decorateEvolution(button, unit);
    } else button.disabled = true;
    button.classList.toggle('is-fortified', game.combat.fortify?.lane === Number(button.dataset.column));
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
    const enemyId = token.dataset.enemyId;
    token.classList.toggle('is-focused', enemyId === game.combat.focus?.enemyId);
    token.dataset.focusEligible = String(canFocusEnemy(game.combat, enemyId, GENERAL_BY_ID));
  }
}

function orderStatus(game) {
  const parts = [];
  if (game.combat.focus) parts.push(`集火生效：剩餘 ${game.combat.focus.remainingFriendlyTurns} 輪`);
  if (game.combat.fortify) parts.push(`第 ${game.combat.fortify.lane + 1} 路堅守：剩餘 ${game.combat.fortify.remainingEnemyTurns} 輪`);
  return parts;
}

function renderInteractiveOrders(root, game) {
  const container = root.querySelector('#orders');
  if (!container || game.status !== 'combat') return;
  container.replaceChildren();
  const statuses = orderStatus(game);
  if (statuses.length) {
    const status = node('p', 'order-status', statuses.join('｜'));
    status.setAttribute('aria-live', 'polite');
    container.append(status);
  }
  const actions = node('div', 'order-actions');
  const paused = Boolean(game.combat.paused);
  actions.append(actionButton(paused ? '繼續' : '暫停', paused ? 'resume' : 'pause', {}, 'primary-button'));
  actions.append(actionButton(game.settings.speed === 2 ? '速度 1×' : '速度 2×', 'set-speed', { speed: game.settings.speed === 2 ? 1 : 2 }));
  actions.append(actionButton('玩法', 'open-help'));
  const noOrders = game.combat.ordersRemaining < 1;
  const swap = actionButton('變陣', 'begin-order', { orderType: 'swap' });
  swap.disabled = noOrders || !adjacentSwapPairExists(game.combat);
  const reinforce = actionButton('援防', 'begin-order', { orderType: 'reinforce' });
  reinforce.disabled = noOrders || !reinforceMoveExists(game.combat);
  reinforce.setAttribute('aria-label', '援防：消耗一個軍令，將一名友軍調往相鄰空路');
  const focus = actionButton('集火', 'begin-order', { orderType: 'focus' });
  focus.disabled = noOrders || !game.combat.enemies.some(({ id }) => canFocusEnemy(game.combat, id, GENERAL_BY_ID));
  actions.append(swap, reinforce, focus);
  for (let lane = 0; lane < game.combat.board.size.columns; lane += 1) {
    const button = actionButton(`守${lane + 1}路`, 'issue-order', { orderType: 'fortify', lane });
    button.disabled = noOrders;
    button.classList.toggle('is-active-order', game.combat.fortify?.lane === lane);
    actions.append(button);
  }
  for (const tacticId of game.combat.tactics) {
    if (tacticId === 'fire-arrows') actions.append(actionButton('火矢1路', 'issue-order', { orderType: 'tactic', tacticId, lane: 0 }));
    if (tacticId === 'first-aid') {
      const unit = Object.values(game.combat.board.units).find(({ hp, maxHp }) => hp > 0 && hp < maxHp);
      const button = actionButton('急救', 'issue-order', { orderType: 'tactic', tacticId, unitId: unit?.id });
      button.disabled = !unit;
      actions.append(button);
    }
  }
  container.append(actions);
}

function renderEvolutionChoices(root, game) {
  if (game.status !== 'reward' || !game.rewardChoices.some(({ id }) => id === 'evolve-general')) return;
  const container = root.querySelector('#primary-actions');
  if (!container) return;
  container.querySelectorAll('[data-reward-id="evolve-general"]').forEach((button) => button.remove());
  const eligible = (game.recruitedGeneralIds ?? [])
    .filter((generalId) => GENERAL_BY_ID[generalId]?.kind === 'general' && !game.evolutions?.[generalId]);
  const panel = node('details', 'evolution-choice-panel');
  panel.open = true;
  panel.dataset.evolutionChoiceVisible = 'true';
  panel.append(node('summary', '', '選擇已招募武將進化'));
  panel.append(node('p', 'reward-summary', '只會顯示今次遠征曾經成功合成嘅武將。收起此區即可取消查看，未確認前不會消耗獎勵。'));
  if (!eligible.length) {
    panel.append(node('p', 'empty-copy', '目前冇符合資格嘅已招募武將，請選擇其他獎勵。'));
    container.prepend(panel);
    return;
  }
  for (const generalId of eligible) {
    const general = GENERAL_BY_ID[generalId];
    const group = node('section', 'evolution-general-group');
    group.append(node('h3', '', general.name));
    for (const evolutionId of general.evolutions ?? []) {
      const evolution = EVOLUTION_BY_ID[evolutionId];
      if (!evolution) continue;
      const button = actionButton('', 'choose-reward', {
        rewardId: 'evolve-general', generalId, evolutionId,
      }, 'primary-button reward-button evolution-choice');
      button.append(
        node('strong', 'reward-name', `${general.name}・${evolution.name}`),
        node('span', 'reward-summary', evolution.summary),
        node('span', 'reward-effect', evolution.effect),
      );
      button.setAttribute('aria-label', `進化${general.name}為${evolution.name}。${evolution.summary}${evolution.effect}`);
      group.append(button);
    }
    panel.append(group);
  }
  container.prepend(panel);
}

function appendStat(list, label, value) {
  const item = node('li', 'result-stat');
  item.append(node('strong', '', label), node('span', '', String(value)));
  list.append(item);
}

function renderExpeditionResult(root, game) {
  if (!['victory', 'defeat'].includes(game.status)) return;
  const container = root.querySelector('#primary-actions');
  if (!container) return;
  container.replaceChildren();
  const panel = node('section', `expedition-result result-${game.status}`);
  panel.dataset.expeditionResultVisible = 'true';
  panel.append(node('p', 'result-kicker', game.status === 'victory' ? '遠征完成' : '遠征中止'));
  panel.append(node('h2', 'result-title', game.status === 'victory' ? '群雄遠征成功' : '城牆失守'));
  const route = game.route === 'danger' ? '危險路線' : game.route === 'safe' ? '安全路線' : '共同前線';
  panel.append(node('p', 'result-summary', game.status === 'victory'
    ? `你完成 ${game.completedBattleIds.length} 戰，走過${route}，並以 ${game.wallHp} 點城牆守住虎牢關。`
    : `你完成 ${game.completedBattleIds.length} 戰後於${route}失守。已取得嘅解鎖與進化會列於下方，方便檢視本局策略。`));
  const stats = node('ul', 'result-stats');
  appendStat(stats, '路線', route);
  appendStat(stats, '完成戰數', `${game.completedBattleIds.length}/6`);
  appendStat(stats, '剩餘城牆', `${game.wallHp}/${game.wallMaxHp}`);
  appendStat(stats, '獎勵數量', (game.rewardHistory ?? []).length);
  panel.append(stats);
  const details = node('details', 'result-details');
  details.append(node('summary', '', '查看詳情'));
  const starting = new Set(['huang-zhong', 'zhao-yun', 'guan-yu', 'lu-bu', 'archer', 'shield-troop']);
  const unlocked = game.unlockedRecipes.filter((id) => !starting.has(id));
  details.append(node('h3', '', '已解鎖武將／配方'));
  details.append(node('p', '', unlocked.length ? unlocked.map((id) => GENERAL_BY_ID[id]?.name ?? id).join('、') : '本局未新增配方。'));
  details.append(node('h3', '', '已取得獎勵'));
  const rewards = game.rewardHistory ?? [];
  details.append(node('p', '', rewards.length ? rewards.map(({ rewardId }) => REWARDS.find(({ id }) => id === rewardId)?.name ?? rewardId).join('、') : '未有可記錄獎勵。'));
  details.append(node('h3', '', '已進化武將'));
  const evolved = Object.entries(game.evolutions ?? {});
  details.append(node('p', '', evolved.length ? evolved.map(([generalId, evolutionId]) => `${GENERAL_BY_ID[generalId]?.name ?? generalId}・${EVOLUTION_BY_ID[evolutionId]?.name ?? evolutionId}`).join('、') : '本局未有武將進化。'));
  panel.append(details, actionButton('再玩一次', 'start-new-run', {}, 'primary-button'));
  container.append(panel);
}

export function renderApp(root, game) {
  renderBaseApp(root, game);
  renderCampSelection(root, game);
  decorateCombatBoard(root, game);
  decorateEnemyField(root, game);
  renderInteractiveOrders(root, game);
  renderEvolutionChoices(root, game);
  renderExpeditionResult(root, game);
}
