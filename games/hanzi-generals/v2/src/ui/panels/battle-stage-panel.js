import { actionButton, node, setVisible } from './dom.js';

function renderWarnings(container, model) {
  container.replaceChildren();
  if (!model.combat) return;
  for (const warning of model.warnings) {
    const item = node('article', `intent intent-${warning.level}`);
    item.dataset.lane = String(warning.lane);
    item.append(node('strong', '', `${warning.lane + 1}路`));
    item.append(node('span', 'intent-icon', warning.level === 'danger' ? '⚠' : '•'));
    item.append(node('span', 'intent-text', warning.text));
    if (warning.chargeIn !== null) item.append(node('span', 'intent-countdown', `倒數 ${warning.chargeIn}`));
    container.append(item);
  }
}

function ensureEnemyLanes(container, columns) {
  if (container.dataset.columns === String(columns)
    && container.querySelectorAll('.enemy-lane').length === columns) return;
  container.replaceChildren();
  container.dataset.columns = String(columns);
  container.style.setProperty('--enemy-columns', String(columns));
  const scale = node('div', 'enemy-scale');
  scale.append(node('span', '', '遠方'), node('span', '', '城牆'));
  container.append(scale);
  for (let lane = 0; lane < columns; lane += 1) {
    const row = node('div', 'enemy-lane');
    row.dataset.lane = String(lane);
    row.append(node('span', 'enemy-lane-label', `${lane + 1}`));
    const track = node('div', 'enemy-lane-track');
    track.dataset.laneTrack = String(lane);
    row.append(track);
    container.append(row);
  }
}

function renderEnemies(container, model) {
  if (!model.combat) {
    container.replaceChildren();
    return;
  }
  ensureEnemyLanes(container, model.columns);
  const existing = new Map(
    [...container.querySelectorAll('.enemy-token')].map((token) => [token.dataset.enemyId, token]),
  );
  const activeIds = new Set();
  for (const enemy of model.enemies) {
    activeIds.add(enemy.id);
    const track = container.querySelector(`[data-lane-track="${enemy.lane}"]`);
    if (!track) continue;
    const token = existing.get(enemy.id) ?? node('article', 'enemy-token');
    token.className = `enemy-token enemy-${enemy.definitionId}`;
    token.dataset.enemyId = enemy.id;
    token.dataset.entityId = enemy.id;
    token.dataset.distance = String(enemy.distance);
    token.dataset.focusEligible = String(enemy.focusEligible);
    token.style.setProperty('--enemy-progress', `${enemy.progress}%`);
    token.style.setProperty('--enemy-stack', String(enemy.stack));
    token.classList.toggle('is-focused', enemy.focused);
    token.setAttribute('aria-label', enemy.ariaLabel);
    token.replaceChildren(
      node('strong', 'enemy-name', enemy.name),
      node('small', 'enemy-hp', `${enemy.hp}/${enemy.maxHp}`),
      node('small', 'enemy-distance', `距 ${enemy.distance}`),
    );
    track.append(token);
  }
  for (const [enemyId, token] of existing) {
    if (!activeIds.has(enemyId)) token.remove();
  }
  for (const lane of container.querySelectorAll('.enemy-lane')) {
    lane.classList.toggle('is-fortified', Number(lane.dataset.lane) === model.fortifiedLane);
  }
}

function renderBoard(container, model) {
  container.style.setProperty('--columns', String(model.columns));
  const children = [];
  for (const cell of model.cells) {
    const className = `board-cell${cell.kind === 'unit' ? ' has-unit' : ''}${cell.kind === 'card' ? ' has-character' : ''}`;
    const button = actionButton(cell.label, cell.action, {
      className,
      disabled: cell.disabled,
      ariaLabel: cell.ariaLabel,
      descriptionId: cell.disabledReason ? 'cell-disabled-help' : undefined,
      data: cell.kind === 'unit'
        ? { unitId: cell.unitId, column: cell.column, row: cell.row }
        : { column: cell.column, row: cell.row },
    });
    button.dataset.entityId = cell.entityId;
    if (cell.unitId) button.dataset.unitId = cell.unitId;
    button.classList.toggle('is-fortified', Boolean(cell.fortified));
    if (cell.title) button.title = cell.title;
    if (cell.evolutionId) {
      button.classList.add('is-evolved');
      button.dataset.evolutionId = cell.evolutionId;
      button.append(node('small', 'evolution-badge', cell.evolutionLabel));
    }
    if (cell.hpLabel) button.append(node('small', 'unit-hp', cell.hpLabel));
    children.push(button);
  }
  const help = node('p', 'visually-hidden', '未高亮位置暫時不可部署。');
  help.id = 'cell-disabled-help';
  children.push(help);
  container.replaceChildren(...children);
}

export function renderBattleStagePanel(stage, model) {
  if (!stage) return;
  setVisible(stage, model.visible);
  const intents = stage.querySelector('#enemy-intents');
  const enemies = stage.querySelector('#enemy-field');
  const board = stage.querySelector('#battle-board');
  setVisible(intents, model.combat);
  setVisible(enemies, model.combat);
  setVisible(board, model.visible);
  if (!model.visible) return;
  renderWarnings(intents, model);
  renderEnemies(enemies, model);
  renderBoard(board, model);
}
