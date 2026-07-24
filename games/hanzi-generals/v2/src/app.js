'use strict';

import { GENERALS } from '../data/generals.js';
import { ENEMIES } from '../data/enemies.js';
import { RECIPES } from '../data/recipes.js';
import { STAGES } from '../data/stages.js';
import { REWARDS } from '../data/rewards.js';
import { TUNING } from '../data/tuning.js';
import { validateGameData } from './core/data-validator.js';
import { reduceGame } from './core/state-machine.js';
import { createExpedition } from './expedition/expedition.js';
import {
  loadSettings,
  loadSnapshot,
  maybeSave,
  saveSettings,
} from './storage/storage.js';
import { bindInteractions } from './ui/interactions.js';
import { renderApp } from './ui/render-interactive.js';
import {
  advanceTutorial,
  createTutorial,
  skipTutorial,
} from './ui/tutorial.js';

const root = document.querySelector('#v2-game-app');
const message = document.querySelector('#action-message');

if (!root || !message) {
  throw new Error('Hanzi Generals v2 shell is missing required elements');
}

const validation = validateGameData({ GENERALS, ENEMIES, RECIPES, STAGES, REWARDS, TUNING });

function seedFromUrl() {
  const value = new URLSearchParams(window.location.search).get('seed');
  return value?.trim() || `moonlight-${new Date().toISOString().slice(0, 10)}`;
}

function initialGame() {
  const settings = loadSettings();
  const loaded = loadSnapshot();
  const base = loaded.ok ? loaded.game : createExpedition(seedFromUrl());
  return {
    ...base,
    settings: { ...settings, ...(base.settings ?? {}) },
    tutorial: base.tutorial ?? createTutorial(),
    ui: {
      rangeUnitId: null,
      lastMessage: loaded.ok ? '已由最近遠征節點恢復。' : '新遠征已建立。',
      ...(base.ui ?? {}),
    },
  };
}

let game = initialGame();
let timer = null;

function showMessage(text = '') {
  message.textContent = text;
  game = { ...game, ui: { ...game.ui, lastMessage: text } };
}

function render() {
  renderApp(root, game);
  message.textContent = game.ui?.lastMessage ?? '';
}

function relevantEntityId(event) {
  return event.payload.targetId
    ?? event.payload.enemyId
    ?? event.payload.unitId
    ?? event.payload.sourceId
    ?? '';
}

function playEvents(events) {
  for (const event of events) {
    const id = relevantEntityId(event);
    if (!id) continue;
    const escaped = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape(id)
      : id.replaceAll('"', '\\"');
    const target = root.querySelector(`[data-entity-id="${escaped}"]`);
    if (!target) continue;
    target.dataset.lastEvent = event.type;
    if (!game.settings.reducedMotion && typeof target.animate === 'function') {
      target.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' }],
        { duration: 180 },
      );
    }
  }

  const important = events.at(-1);
  if (important) {
    const labels = {
      CARD_PLACED: '字牌已放入戰陣，相鄰配對會自動合成。',
      UNIT_ASSEMBLED: '武將合成完成。',
      ORDER_QUEUED: important.payload.type === 'reposition' ? '變陣已下令，武將會立即移位。' : '變陣已下令，兩名武將會交換位置。',
      UNIT_REPOSITIONED: '武將已完成移位。',
      UNITS_SWAPPED: '兩名武將已完成換位。',
      FOCUS_ORDERED: `集火已生效，持續 ${important.payload.turns ?? 3} 輪。`,
      FORTIFY_ORDERED: `第 ${(important.payload.lane ?? 0) + 1} 路已堅守，持續 ${important.payload.turns ?? 2} 輪。`,
      ORDER_CANCELLED: '戰場已改變，變陣指令未能執行。',
      WALL_DAMAGED: '城牆受到攻擊。',
      BOSS_PHASE_CHANGED: '華雄進入第二階段，重騎增援到達。',
      BATTLE_COMPLETED: '戰鬥勝利，請選擇獎勵。',
      BATTLE_PHASE_COMPLETED: '本段敵軍已清除，可以重新整軍。',
      REWARD_CHOSEN: '獎勵已加入遠征。',
      ROUTE_CHOSEN: '遠征路線已確定。',
    };
    if (labels[important.type]) showMessage(labels[important.type]);
  }
}

function vibrationFor(events) {
  if (typeof navigator === 'undefined' || !game.settings.vibration || !navigator.vibrate) return;
  if (!events.some(({ type }) => ['UNIT_HIT', 'WALL_DAMAGED', 'BOSS_PHASE_CHANGED'].includes(type))) return;
  try {
    navigator.vibrate(events.some(({ type }) => type === 'BOSS_PHASE_CHANGED') ? [40, 40, 80] : 25);
  } catch {
    // Vibration is optional presentation only.
  }
}

function scheduleBattleTick() {
  window.clearTimeout(timer);
  timer = null;
  if (game.status !== 'combat' || game.combat?.paused) return;
  const delay = game.settings.speed === 2 ? 350 : 700;
  timer = window.setTimeout(() => dispatch({ type: 'STEP_COMBAT' }), delay);
}

function completedTutorialAction(action, events) {
  if (action.type === 'ASSEMBLE' && events.some(({ type }) => type === 'CARD_PLACED')) return 'PLACE_CARD';
  if (action.type === 'ASSEMBLE' && events.some(({ type }) => type === 'UNIT_ASSEMBLED')) return 'ASSEMBLE_UNIT';
  if (action.type === 'START_PHASE') return 'START_PHASE';
  if (action.type === 'ISSUE_ORDER') return 'USE_ORDER';
  return null;
}

function handleUiAction(action) {
  if (action.type === 'UI_CLEAR_SELECTION') {
    game = { ...game, selection: { cardIds: [] } };
    showMessage('已清除字牌選取。');
    return true;
  }
  if (action.type === 'UI_OPEN_RANGE') {
    game = {
      ...game,
      ui: { ...game.ui, rangeUnitId: action.unitId },
      tutorial: advanceTutorial(game.tutorial, 'OPEN_RANGE'),
    };
    const unit = (game.status === 'combat' ? game.combat.board : game.board).units[action.unitId];
    const definition = unit ? GENERALS.find(({ id }) => id === unit.definitionId) : null;
    showMessage(definition ? `${definition.name}：射程 ${definition.range}，攻擊方式 ${definition.pattern}。` : '未能讀取單位資料。');
    return true;
  }
  if (action.type === 'UI_SKIP_TUTORIAL') {
    if (game.tutorial.complete || window.confirm('確認略過首次教學？')) {
      game = { ...game, tutorial: skipTutorial(game.tutorial) };
      showMessage('教學已略過。');
    }
    return true;
  }
  if (action.type === 'UI_TOGGLE_REDUCED_MOTION') {
    game = {
      ...game,
      settings: { ...game.settings, reducedMotion: !game.settings.reducedMotion },
    };
    saveSettings(game.settings);
    showMessage(game.settings.reducedMotion ? '已開啟低動態模式。' : '已關閉低動態模式。');
    return true;
  }
  if (action.type === 'UI_TOGGLE_VIBRATION') {
    game = {
      ...game,
      settings: { ...game.settings, vibration: !game.settings.vibration },
    };
    saveSettings(game.settings);
    showMessage(game.settings.vibration ? '已開啟震動。' : '已關閉震動。');
    return true;
  }
  return false;
}

function dispatch(action) {
  if (handleUiAction(action)) {
    render();
    scheduleBattleTick();
    return true;
  }

  const result = reduceGame(game, action);
  if (!result.ok) {
    showMessage(result.error.message);
    render();
    return false;
  }

  game = result.state;
  const tutorialAction = completedTutorialAction(action, result.events);
  if (tutorialAction) game = { ...game, tutorial: advanceTutorial(game.tutorial, tutorialAction) };

  if (action.type === 'SET_SPEED') saveSettings(game.settings);
  maybeSave(game);
  render();
  playEvents(result.events);
  vibrationFor(result.events);
  scheduleBattleTick();
  return true;
}

function renderFatalDataError(errors) {
  window.clearTimeout(timer);
  root.dataset.status = 'error';
  root.replaceChildren();
  const title = document.createElement('h1');
  title.textContent = '字陣無雙 v2 無法啟動';
  const detail = document.createElement('p');
  detail.textContent = `資料版本 ${TUNING.schemaVersion} 驗證失敗：${errors[0]}`;
  root.append(title, detail);
}

if (!validation.ok) {
  renderFatalDataError(validation.errors);
} else {
  bindInteractions(root, dispatch);
  render();
  scheduleBattleTick();

  document.addEventListener('keydown', (event) => {
    const interactive = ['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'SUMMARY'].includes(document.activeElement?.tagName);
    if (event.key === 'Escape') {
      const details = root.querySelector('#details-panel');
      if (details?.open) details.open = false;
      if (game.ui?.rangeUnitId) {
        game = { ...game, ui: { ...game.ui, rangeUnitId: null } };
        showMessage('已關閉範圍資訊。');
        render();
      }
    }
    if (event.code === 'Space' && game.status === 'combat' && !interactive) {
      event.preventDefault();
      dispatch({ type: game.combat.paused ? 'RESUME' : 'PAUSE' });
    }
  });
}
