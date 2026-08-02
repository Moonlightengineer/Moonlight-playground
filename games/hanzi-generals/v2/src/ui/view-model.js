import { ENEMY_BY_ID } from '../../data/enemies.js';
import { EVOLUTION_BY_ID } from '../../data/evolutions.js';
import { GENERAL_BY_ID } from '../../data/generals.js';
import { REWARDS } from '../../data/rewards.js';
import { deriveLaneWarnings } from '../combat/intents.js';
import { eligibleEvolutionGenerals } from '../expedition/evolution-eligibility.js';
import {
  selectActiveBoard,
  selectAssemblyTargets,
  selectCampState,
  selectDeckZoneCounts,
  selectLegalCommands,
  selectLifecycle,
  selectOrderTargets,
  selectRerollState,
} from '../core/selectors/index.js';
import { enemyDistanceToProgress, MAX_VISIBLE_ENEMY_DISTANCE } from './enemy-field.js';
import { tutorialText } from './tutorial.js';
import { buildRecipeCodex } from './recipe-codex.js';
import { buildUnitPlayerDetail } from './unit-copy.js';

const ROUTE_STAGES = Object.freeze({
  safe: Object.freeze(['tutorial', 'shield-line', 'route-safe', 'cavalry-warning', 'elite-mixed', 'hua-xiong']),
  danger: Object.freeze(['tutorial', 'shield-line', 'route-danger', 'cavalry-warning', 'elite-mixed', 'hua-xiong']),
});

const STARTING_RECIPES = new Set(['huang-zhong', 'zhao-yun', 'guan-yu', 'lu-bu', 'archer', 'shield-troop']);

function intent(type, payload = {}) {
  return { type, ...payload };
}

function stageTitle(game, lifecycle) {
  if (game.status === 'victory') return '遠征勝利';
  if (game.status === 'defeat') return '遠征失敗';
  if (game.status === 'reward') return '選擇戰後獎勵';
  if (game.status === 'combat') return `第 ${lifecycle.battleNumber} 戰・第 ${lifecycle.phaseNumber} 段`;
  if (game.status === 'configuration') return `第 ${lifecycle.battleNumber} 戰・整軍`;
  return game.awaitingRoute ? '選擇遠征路線' : `準備第 ${lifecycle.battleNumber} 戰`;
}

function buildRunStatus(game, profile, lifecycle) {
  const stages = ROUTE_STAGES[game.route] ?? ROUTE_STAGES.safe;
  const counts = selectDeckZoneCounts(game);
  return {
    title: stageTitle(game, lifecycle),
    wallLabel: `城牆 ${game.wallHp}/${game.wallMaxHp}`,
    orderLabel: game.status === 'combat' ? `軍令 ${game.combat.ordersRemaining}` : null,
    cardCounts: [
      { key: 'drawPile', label: '抽牌', count: counts.drawPile },
      { key: 'discardPile', label: '棄牌', count: counts.discardPile },
      { key: 'hand', label: '手牌', count: counts.hand },
      { key: 'camp', label: '軍營', count: counts.camp },
      { key: 'deployed', label: '戰場', count: counts.deployed },
      { key: 'total', label: '總數', count: counts.total },
    ],
    cardCountsReconciled: counts.reconciled,
    progress: stages.map((stageId, index) => ({
      stageId,
      label: String(index + 1),
      complete: (game.completedBattleIds ?? []).includes(stageId),
      ariaLabel: `第 ${index + 1} 戰${(game.completedBattleIds ?? []).includes(stageId) ? '，已完成' : ''}`,
    })),
    tutorialText: tutorialText(profile?.tutorial ?? game.tutorial),
  };
}

function unitCellModel(unit, fortifiedLane) {
  const base = GENERAL_BY_ID[unit.definitionId];
  const evolution = EVOLUTION_BY_ID[unit.evolution];
  const detail = buildUnitPlayerDetail(base, unit.evolution);
  const evolutionLabel = evolution ? `進化・${evolution.name}` : null;
  const ariaLabel = detail
    ? `${detail.text}。目前生命 ${unit.hp}/${unit.maxHp}`
    : `${base?.name ?? unit.definitionId}，目前生命 ${unit.hp}/${unit.maxHp}`;
  return {
    kind: 'unit',
    entityId: unit.id,
    unitId: unit.id,
    label: base?.name ?? unit.definitionId,
    hpLabel: `${unit.hp}/${unit.maxHp}`,
    column: unit.cell.column,
    row: unit.cell.row,
    action: 'open-range',
    disabled: false,
    fortified: fortifiedLane === unit.cell.column,
    evolutionId: evolution?.id ?? null,
    evolutionLabel,
    title: detail?.text ?? null,
    ariaLabel,
  };
}

function buildBoardCells(game, board, assemblyTargets) {
  const legal = new Set(assemblyTargets.map(({ column, row }) => `${column},${row}`));
  const unitsByCell = new Map(Object.values(board.units ?? {}).map((unit) => [`${unit.cell.column},${unit.cell.row}`, unit]));
  const fortifiedLane = game.status === 'combat' ? game.combat?.fortify?.lane : null;
  const cells = [];
  for (let row = 0; row < board.size.rows; row += 1) {
    for (let column = 0; column < board.size.columns; column += 1) {
      const key = `${column},${row}`;
      const unit = unitsByCell.get(key);
      if (unit) {
        cells.push(unitCellModel(unit, fortifiedLane));
        continue;
      }
      const cardId = game.status === 'configuration' ? game.boardCards?.[key] : null;
      const card = cardId ? game.cardsById?.[cardId] : null;
      if (card) {
        cells.push({
          kind: 'card', entityId: cardId, cardId, label: card.symbol,
          column, row, action: 'return-board-card', disabled: false,
          fortified: false,
          ariaLabel: `${card.symbol}字牌，點按可取回手牌`,
        });
        continue;
      }
      const allowed = game.status === 'configuration' && legal.has(key);
      cells.push({
        kind: 'empty', entityId: `cell-${column}-${row}`, label: '空',
        column, row, action: 'choose-cell', disabled: !allowed,
        fortified: fortifiedLane === column,
        disabledReason: allowed ? null : '未高亮位置暫時不可部署。',
        ariaLabel: `第 ${column + 1} 路，第 ${row + 1} 列空格`,
      });
    }
  }
  return cells;
}

function buildBattleStage(game, orderTargets) {
  const visible = ['configuration', 'combat'].includes(game.status);
  const board = selectActiveBoard(game);
  if (!visible || !board) return { visible: false, combat: false, warnings: [], enemies: [], columns: 0, cells: [] };
  const combat = game.status === 'combat';
  const focusable = new Set(orderTargets.focusEnemyIds);
  const laneStacks = new Map();
  const enemies = combat
    ? [...(game.combat.enemies ?? [])]
      .filter(({ hp }) => hp > 0)
      .sort((a, b) => a.lane - b.lane || a.distance - b.distance || a.id.localeCompare(b.id))
      .map((enemy) => {
        const stack = laneStacks.get(enemy.lane) ?? 0;
        laneStacks.set(enemy.lane, stack + 1);
        const definition = ENEMY_BY_ID[enemy.definitionId];
        return {
          id: enemy.id,
          definitionId: enemy.definitionId,
          name: definition?.name ?? enemy.definitionId,
          lane: enemy.lane,
          distance: enemy.distance,
          hp: enemy.hp,
          maxHp: enemy.maxHp,
          progress: enemyDistanceToProgress(enemy.distance, MAX_VISIBLE_ENEMY_DISTANCE),
          stack: stack % 2,
          focused: enemy.id === game.combat.focus?.enemyId,
          focusEligible: focusable.has(enemy.id),
          ariaLabel: `${definition?.name ?? enemy.definitionId}，第 ${enemy.lane + 1} 路，距離城牆 ${enemy.distance}，生命 ${enemy.hp}/${enemy.maxHp}`,
        };
      })
    : [];
  const warnings = combat ? deriveLaneWarnings(game.combat).map((warning) => {
    const charge = game.combat.enemies.find((enemy) => enemy.lane === warning.lane && enemy.definitionId === 'heavy-cavalry');
    return { ...warning, chargeIn: charge?.chargeIn ?? null };
  }) : [];
  return {
    visible,
    combat,
    columns: board.size.columns,
    warnings,
    enemies,
    fortifiedLane: combat ? game.combat.fortify?.lane ?? null : null,
    cells: buildBoardCells(game, board, selectAssemblyTargets(game)),
  };
}

function buildCamp(game, ui) {
  const camp = selectCampState(game);
  const selected = new Set(ui?.selectedCardIds ?? game.selection?.cardIds ?? []);
  return {
    visible: game.status === 'configuration',
    title: `軍營 ${camp.count}/${camp.capacity}`,
    slots: Array.from({ length: camp.capacity }, (_, index) => {
      const cardId = camp.cardIds[index];
      if (!cardId) return { empty: true, label: '空' };
      const symbol = game.cardsById?.[cardId]?.symbol ?? '?';
      return {
        empty: false,
        cardId,
        symbol,
        selected: selected.has(cardId),
        ariaLabel: `${symbol}字牌，軍營內${selected.has(cardId) ? '，已選取' : ''}`,
        selectAction: { action: 'select-camp-card', data: { cardId } },
        returnAction: { action: 'return-camp-card', data: { cardId } },
      };
    }),
  };
}

function buildHand(game, ui) {
  const selected = new Set(ui?.selectedCardIds ?? game.selection?.cardIds ?? []);
  const reroll = selectRerollState(game);
  const retained = new Set(reroll.retainedIds);
  const camp = selectCampState(game);
  return {
    visible: game.status === 'configuration',
    empty: !(game.deck?.hand?.length),
    cards: (game.deck?.hand ?? []).map((card) => ({
      id: card.id,
      symbol: card.symbol,
      selected: selected.has(card.id),
      retained: retained.has(card.id),
      ariaLabel: `${card.symbol}字牌${selected.has(card.id) ? '，已選取' : ''}${retained.has(card.id) ? '，已保留' : ''}`,
      selectAction: { action: 'select-card', data: { cardId: card.id } },
      moveToCamp: {
        action: 'move-card-to-camp',
        data: { cardId: card.id },
        disabled: camp.isFull,
        disabledReason: camp.isFull ? '軍營已滿，先合成或取回字牌。' : null,
      },
    })),
  };
}

function primaryAction(label, type, enabled, options = {}) {
  return {
    label,
    intent: intent(type, options.payload),
    action: options.action,
    data: options.data ?? {},
    className: options.className ?? '',
    disabled: !enabled,
    disabledReason: enabled ? null : options.disabledReason ?? null,
  };
}

function rewardTargetPayload(game, rewardId) {
  const loose = [...(game.deck?.drawPile ?? []), ...(game.deck?.discardPile ?? []), ...(game.deck?.hand ?? [])];
  if (rewardId === 'copy-card') return { cardId: loose[0]?.id };
  if (rewardId === 'remove-card') return { cardId: loose.at(-1)?.id };
  return {};
}

function rewardModel(game, reward) {
  const payload = rewardTargetPayload(game, reward.id);
  let name = reward.name;
  if (payload.cardId) name = `${reward.name}「${game.cardsById?.[payload.cardId]?.symbol ?? '?'}」`;
  return {
    id: reward.id,
    name,
    summary: reward.description.summary,
    effect: reward.description.effect,
    useCase: reward.description.useCase,
    disabled: false,
    ariaLabel: `${name}。${reward.description.summary} ${reward.description.effect} ${reward.description.useCase}`,
    intent: { type: 'CHOOSE_REWARD', rewardId: reward.id, payload },
    action: 'choose-reward',
    data: { rewardId: reward.id, ...payload },
  };
}

function buildEvolutionChoices(game) {
  if (!(game.rewardChoices ?? []).some(({ id }) => id === 'evolve-general')) return null;
  const groups = eligibleEvolutionGenerals(game).map((generalId) => {
    const general = GENERAL_BY_ID[generalId];
    return {
      generalId,
      name: general.name,
      choices: (general.evolutions ?? []).map((evolutionId) => {
        const evolution = EVOLUTION_BY_ID[evolutionId];
        return {
          generalId,
          evolutionId,
          name: `${general.name}・${evolution.name}`,
          summary: evolution.summary,
          effect: evolution.effect,
          ariaLabel: `進化${general.name}為${evolution.name}。${evolution.summary}${evolution.effect}`,
          action: 'choose-reward',
          data: { rewardId: 'evolve-general', generalId, evolutionId },
        };
      }),
    };
  });
  return {
    title: '選擇已招募武將進化',
    description: '只會顯示今次遠征曾經成功合成嘅武將。收起此區即可取消查看，未確認前不會消耗獎勵。',
    emptyText: groups.length ? null : '目前冇符合資格嘅已招募武將，請選擇其他獎勵。',
    groups,
  };
}

function buildResult(game) {
  if (!['victory', 'defeat'].includes(game.status)) return null;
  const route = game.route === 'danger' ? '危險路線' : game.route === 'safe' ? '安全路線' : '共同前線';
  const unlocked = (game.unlockedRecipes ?? []).filter((id) => !STARTING_RECIPES.has(id));
  const rewards = game.rewardHistory ?? [];
  const evolved = Object.entries(game.evolutions ?? {});
  return {
    status: game.status,
    kicker: game.status === 'victory' ? '遠征完成' : '遠征中止',
    title: game.status === 'victory' ? '群雄遠征成功' : '城牆失守',
    summary: game.status === 'victory'
      ? `你完成 ${game.completedBattleIds.length} 戰，走過${route}，並以 ${game.wallHp} 點城牆守住虎牢關。`
      : `你完成 ${game.completedBattleIds.length} 戰後於${route}失守。已取得嘅解鎖與進化會列於下方，方便檢視本局策略。`,
    stats: [
      ['路線', route],
      ['完成戰數', `${game.completedBattleIds.length}/6`],
      ['剩餘城牆', `${game.wallHp}/${game.wallMaxHp}`],
      ['獎勵數量', rewards.length],
    ],
    unlockedText: unlocked.length ? unlocked.map((id) => GENERAL_BY_ID[id]?.name ?? id).join('、') : '本局未新增配方。',
    rewardsText: rewards.length ? rewards.map(({ rewardId }) => REWARDS.find(({ id }) => id === rewardId)?.name ?? rewardId).join('、') : '未有可記錄獎勵。',
    evolvedText: evolved.length ? evolved.map(([generalId, evolutionId]) => `${GENERAL_BY_ID[generalId]?.name ?? generalId}・${EVOLUTION_BY_ID[evolutionId]?.name ?? evolutionId}`).join('、') : '本局未有武將進化。',
  };
}

function buildPrimary(game, ui, legalCommands) {
  const actions = [];
  if (game.status === 'expedition-map') {
    if (game.awaitingRoute) {
      actions.push(primaryAction('安全路線', 'CHOOSE_ROUTE', legalCommands.has('CHOOSE_ROUTE'), { action: 'choose-route', data: { route: 'safe' }, payload: { route: 'safe' }, className: 'primary-button' }));
      actions.push(primaryAction('危險路線', 'CHOOSE_ROUTE', legalCommands.has('CHOOSE_ROUTE'), { action: 'choose-route', data: { route: 'danger' }, payload: { route: 'danger' }, className: 'danger-button' }));
    } else {
      actions.push(primaryAction('開始下一戰', 'START_BATTLE', legalCommands.has('START_BATTLE'), { action: 'start-battle', className: 'primary-button' }));
    }
  }
  if (game.status === 'configuration') {
    const selected = ui?.selectedCardIds ?? game.selection?.cardIds ?? [];
    if (legalCommands.has('DRAW_CARDS')) actions.push(primaryAction('抽牌', 'DRAW_CARDS', true, { action: 'draw-cards', className: 'primary-button' }));
    if (selected.length) {
      actions.push({ label: selected.length === 1 ? '揀空格放字' : '揀空格合成', action: 'selection-hint', data: {}, className: '', disabled: true, disabledReason: null, intent: intent('UI_SELECTION_HINT') });
      actions.push(primaryAction('取消選取', 'UI_CLEAR_SELECTION', true, { action: 'clear-selection' }));
      actions.push(primaryAction(`保留 ${Math.min(2, selected.length)} 張`, 'RETAIN_CARDS', legalCommands.has('RETAIN_CARDS'), { action: 'retain-cards', data: { cardIds: selected.slice(0, 2).join(',') }, payload: { cardIds: selected.slice(0, 2) } }));
    }
    actions.push(primaryAction('重抽', 'REROLL', legalCommands.has('REROLL'), { action: 'reroll' }));
    actions.push(primaryAction('開始呢一段', 'START_PHASE', legalCommands.has('START_PHASE'), {
      action: 'start-phase', className: 'primary-button', disabledReason: '至少部署一個單位先可以開始戰鬥。',
    }));
  }
  if (['victory', 'defeat'].includes(game.status)) {
    actions.push(primaryAction('再玩一次', 'START_NEW_RUN', true, { action: 'start-new-run', className: 'primary-button' }));
  }
  const evolution = buildEvolutionChoices(game);
  const rewards = game.status === 'reward'
    ? (game.rewardChoices ?? []).filter(({ id }) => id !== 'evolve-general').map((reward) => rewardModel(game, reward))
    : [];
  return {
    visible: game.status !== 'combat',
    actions,
    rewards,
    evolution,
    result: buildResult(game),
  };
}

function buildOrders(game, profile, orderTargets) {
  if (game.status !== 'combat') return { visible: false, statuses: [], actions: [], focusEnemyIds: [] };
  const statuses = [];
  if (game.combat.focus) statuses.push(`集火生效：剩餘 ${game.combat.focus.remainingFriendlyTurns} 輪`);
  if (game.combat.fortify) statuses.push(`第 ${game.combat.fortify.lane + 1} 路堅守：剩餘 ${game.combat.fortify.remainingEnemyTurns} 輪`);
  const noOrders = game.combat.ordersRemaining < 1;
  const paused = Boolean(game.combat.paused);
  const actions = [
    { label: paused ? '繼續' : '暫停', action: paused ? 'resume' : 'pause', data: {}, className: 'primary-button', disabled: false },
    { label: profile.settings.speed === 2 ? '速度 1×' : '速度 2×', action: 'set-speed', data: { speed: profile.settings.speed === 2 ? 1 : 2 }, className: '', disabled: false },
    { label: '玩法', action: 'open-help', data: {}, className: '', disabled: false },
    { label: '變陣', action: 'begin-order', data: { orderType: 'swap' }, className: '', disabled: noOrders || !orderTargets.swapPairs.length },
    { label: '援防', action: 'begin-order', data: { orderType: 'reinforce' }, className: '', disabled: noOrders || !orderTargets.reinforce.length, ariaLabel: '援防：消耗一個軍令，將一名友軍調往相鄰空路' },
    { label: '集火', action: 'begin-order', data: { orderType: 'focus' }, className: '', disabled: noOrders || !orderTargets.focusEnemyIds.length },
    ...orderTargets.fortifyLanes.map((lane) => ({ label: `守${lane + 1}路`, action: 'issue-order', data: { orderType: 'fortify', lane }, className: game.combat.fortify?.lane === lane ? 'is-active-order' : '', disabled: noOrders })),
  ];
  for (const tacticId of game.combat.tactics ?? []) {
    if (tacticId === 'fire-arrows') actions.push({ label: '火矢1路', action: 'issue-order', data: { orderType: 'tactic', tacticId, lane: 0 }, className: '', disabled: false });
    if (tacticId === 'first-aid') {
      const target = Object.values(game.combat.board.units).find(({ hp, maxHp }) => hp > 0 && hp < maxHp);
      actions.push({ label: '急救', action: 'issue-order', data: { orderType: 'tactic', tacticId, unitId: target?.id }, className: '', disabled: !target });
    }
  }
  return { visible: true, statuses, actions, focusEnemyIds: [...orderTargets.focusEnemyIds] };
}

function buildDetails(game, profile, ui) {
  const boardActive = ['configuration', 'combat'].includes(game.status);
  const board = selectActiveBoard(game) ?? game.board;
  const unit = ui?.rangeUnitId ? board?.units?.[ui.rangeUnitId] : null;
  const definition = unit ? GENERAL_BY_ID[unit.definitionId] : null;
  const unitDetail = definition ? buildUnitPlayerDetail(definition, unit?.evolution) : null;
  return {
    visible: !boardActive,
    summary: '牌庫、設定與戰鬥詳情',
    items: [
      ['抽牌堆', game.deck?.drawPile?.length ?? 0],
      ['棄牌堆', game.deck?.discardPile?.length ?? 0],
      ['部署中配方', game.deck?.deployed?.length ?? 0],
      ['棋盤', `${game.board?.size?.columns ?? 0}×${game.board?.size?.rows ?? 0}`],
      ['遠征種子', game.seed],
    ],
    rangeDetail: unitDetail?.text ?? null,
    codex: buildRecipeCodex(game, profile),
    settings: [
      { label: profile.settings.reducedMotion ? '低動態：開' : '低動態：關', action: 'toggle-reduced-motion' },
      { label: profile.settings.vibration ? '震動：開' : '震動：關', action: 'toggle-vibration' },
    ],
  };
}

function normalizeProfile(game, profile = {}) {
  return {
    settings: {
      reducedMotion: Boolean(profile.settings?.reducedMotion ?? game.settings?.reducedMotion),
      vibration: profile.settings?.vibration ?? game.settings?.vibration ?? true,
      speed: [1, 2].includes(profile.settings?.speed) ? profile.settings.speed : game.settings?.speed ?? 1,
    },
    tutorial: profile.tutorial ?? game.tutorial,
    discoveredRecipeIds: [...(profile.discoveredRecipeIds ?? [])],
  };
}

function normalizeUi(game, ui = {}) {
  return {
    selectedCardIds: [...(ui.selectedCardIds ?? game.selection?.cardIds ?? [])],
    rangeUnitId: ui.rangeUnitId ?? game.ui?.rangeUnitId ?? null,
    lastMessage: ui.lastMessage ?? game.ui?.lastMessage ?? '',
  };
}

export function buildAppViewModel(game, profile = {}, ui = {}) {
  const safeProfile = normalizeProfile(game, profile);
  const safeUi = normalizeUi(game, ui);
  const lifecycle = selectLifecycle(game);
  const legalCommands = selectLegalCommands(game);
  const orderTargets = selectOrderTargets(game);
  return {
    screen: lifecycle.screen,
    root: { status: lifecycle.status, reducedMotion: safeProfile.settings.reducedMotion },
    runStatus: buildRunStatus(game, safeProfile, lifecycle),
    battleStage: buildBattleStage(game, orderTargets),
    camp: buildCamp(game, safeUi),
    primary: buildPrimary(game, safeUi, legalCommands),
    orders: buildOrders(game, safeProfile, orderTargets),
    hand: buildHand(game, safeUi),
    details: buildDetails(game, safeProfile, safeUi),
    overlays: { helpOpen: false },
    feedback: { lastMessage: safeUi.lastMessage },
  };
}
