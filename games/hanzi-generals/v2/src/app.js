'use strict';

import { ENEMIES } from '../data/enemies.js';
import { GENERAL_BY_ID, GENERALS } from '../data/generals.js';
import { RECIPES, STARTING_SYMBOLS } from '../data/recipes.js';
import { REWARDS } from '../data/rewards.js';
import { STAGES } from '../data/stages.js';
import { TUNING } from '../data/tuning.js';
import { createAppController } from './app-controller.js';
import { validateGameData } from './core/data-validator.js';
import { reduceGame } from './core/state-machine.js';
import { createExpedition } from './expedition/expedition.js';
import { createRuntimeState } from './runtime/runtime-state.js';
import {
  buildLatestVersionUrl,
  clearAllV2Data,
  isApprovedSaveBoundary,
  loadRecipeDiscoveries,
  loadSettings,
  loadSnapshot,
  loadTutorial,
  maybeSave,
  resetExpedition,
  saveRecipeDiscoveries,
  saveSettings,
  saveTutorial,
} from './storage/storage.js';
import { createCombatFeedback } from './ui/combat-feedback.js';
import { createHelpPanel } from './ui/help-panel.js';
import { bindInteractions } from './ui/interactions.js';
import { renderApp } from './ui/render-app.js';
import { buildAppViewModel } from './ui/runtime-view-model.js';
import { recordRecipeDiscoveries } from './ui/recipe-codex.js';
import { buildUnitPlayerDetail } from './ui/unit-copy.js';
import {
  advanceTutorial,
  advanceTutorialForResult,
  createTutorial,
  skipTutorial,
} from './ui/tutorial.js';

const root = document.querySelector('#v2-game-app');
const message = document.querySelector('#action-message');

if (!root || !message) {
  throw new Error('Hanzi Generals v2 shell is missing required elements');
}

const validation = validateGameData({ GENERALS, ENEMIES, RECIPES, STAGES, REWARDS, TUNING, STARTING_SYMBOLS });

function seedFromUrl() {
  const value = new URLSearchParams(window.location.search).get('seed');
  return value?.trim() || `moonlight-${new Date().toISOString().slice(0, 10)}`;
}

function initialRuntimeState() {
  const storedSettings = loadSettings();
  const loaded = loadSnapshot();
  const storedTutorial = loadTutorial();
  const base = loaded.ok ? loaded.game : createExpedition(seedFromUrl());
  return createRuntimeState({
    game: base,
    profile: {
      settings: { ...(base.settings ?? {}), ...storedSettings },
      tutorial: storedTutorial ?? base.tutorial ?? createTutorial(),
      discoveredRecipeIds: loadRecipeDiscoveries(),
    },
    ui: {
      rangeUnitId: base.ui?.rangeUnitId ?? null,
      lastMessage: loaded.ok ? '已由最近遠征節點恢復。' : '新遠征已建立。',
      overlay: null,
      orderDraft: null,
    },
  });
}

const initialRuntime = initialRuntimeState();
let controller = null;
let lastViewModel = null;
let resumeAfterHelp = false;

const feedback = createCombatFeedback({
  root,
  reducedMotion: () => (
    controller?.getRuntime().profile.settings.reducedMotion
    ?? initialRuntime.profile.settings.reducedMotion
  ),
});

const helpPanel = createHelpPanel({
  panel: root.querySelector('#help-panel'),
  contentRoot: root.querySelector('#help-content'),
  onOpen() {
    feedback.clear();
    const runtime = controller?.getRuntime();
    resumeAfterHelp = runtime?.game.status === 'combat' && !runtime.game.combat?.paused;
    if (resumeAfterHelp) controller.dispatchIntent({ type: 'PAUSE' });
  },
  onClose() {
    const runtime = controller?.getRuntime();
    const shouldResume = resumeAfterHelp
      && runtime?.game.status === 'combat'
      && runtime.game.combat?.paused;
    resumeAfterHelp = false;
    if (shouldResume) controller.dispatchIntent({ type: 'RESUME' });
  },
});

function persistProfile(profile) {
  try {
    saveSettings(profile.settings);
  } catch {
    // Settings persistence is best-effort; gameplay remains available.
  }
  try {
    if (profile.tutorial) saveTutorial(profile.tutorial);
  } catch {
    // Tutorial persistence is best-effort; gameplay remains available.
  }
  try {
    saveRecipeDiscoveries(profile.discoveredRecipeIds ?? []);
  } catch {
    // Codex persistence is best-effort; gameplay remains available.
  }
}

function relevantEntityId(event) {
  return event.payload?.targetId
    ?? event.payload?.enemyId
    ?? event.payload?.unitId
    ?? event.payload?.attackerId
    ?? '';
}

function eventMessage(events) {
  const important = events.at(-1);
  if (!important) return null;
  const labels = {
    CARD_PLACED: '字牌已放入戰陣，相鄰配對會自動合成。',
    UNIT_ASSEMBLED: '武將合成完成。',
    ORDER_QUEUED: '變陣已下令，兩名武將會交換位置。',
    UNITS_SWAPPED: '兩名武將已完成換位。',
    FOCUS_ORDERED: `集火已生效，持續 ${important.payload?.turns ?? 3} 輪。`,
    FORTIFY_ORDERED: `第 ${(important.payload?.lane ?? 0) + 1} 路已堅守，持續 ${important.payload?.turns ?? 2} 輪。`,
    WALL_DAMAGED: '城牆受到攻擊。',
    BOSS_PHASE_CHANGED: '華雄進入第二階段，重騎增援到達。',
    BATTLE_COMPLETED: '戰鬥勝利，請查看戰報。',
    BATTLE_PHASE_COMPLETED: '本段敵軍已清除，可以重新整軍。',
    REWARD_CHOSEN: '獎勵已加入遠征。',
    ROUTE_CHOSEN: '遠征路線已確定。',
  };
  return labels[important.type] ?? null;
}

function vibrationFor(events) {
  const runtime = controller?.getRuntime();
  if (typeof navigator === 'undefined'
    || !runtime?.profile.settings.vibration
    || !navigator.vibrate) return;
  if (!events.some(({ type }) => ['UNIT_HIT', 'WALL_DAMAGED', 'BOSS_PHASE_CHANGED'].includes(type))) return;
  try {
    navigator.vibrate(events.some(({ type }) => type === 'BOSS_PHASE_CHANGED') ? [40, 40, 80] : 25);
  } catch {
    // Vibration is optional presentation only.
  }
}

function presentEvents(events) {
  const sequence = feedback.present(events);
  for (const event of events) {
    const id = relevantEntityId(event);
    if (!id) continue;
    const escaped = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape(id)
      : id.replaceAll('"', '\\"');
    const target = root.querySelector(`[data-entity-id="${escaped}"]`);
    if (target) target.dataset.lastEvent = event.type;
  }
  vibrationFor(events);
  return sequence;
}

function cloneRuntime(runtime, changes = {}) {
  return {
    game: changes.game ?? runtime.game,
    profile: changes.profile ?? runtime.profile,
    ui: changes.ui ?? runtime.ui,
  };
}

function handleExternalUiIntent(runtime, intent) {
  if (intent.type === 'UI_OPEN_RANGE') {
    const board = runtime.game.status === 'combat' ? runtime.game.combat?.board : runtime.game.board;
    const unit = board?.units?.[intent.unitId];
    const definition = unit ? GENERAL_BY_ID[unit.definitionId] : null;
    const detail = definition ? buildUnitPlayerDetail(definition, unit?.evolution) : null;
    return {
      runtime: cloneRuntime(runtime, {
        profile: {
          ...runtime.profile,
          tutorial: advanceTutorial(runtime.profile.tutorial, 'OPEN_RANGE'),
        },
        ui: {
          ...runtime.ui,
          rangeUnitId: intent.unitId ?? null,
          lastMessage: detail?.text ?? '未能讀取單位資料。',
        },
      }),
    };
  }

  if (intent.type === 'UI_OPEN_HELP') {
    return {
      runtime: cloneRuntime(runtime, { ui: { ...runtime.ui, overlay: 'help' } }),
      effects: [{ type: 'OPEN_HELP', trigger: intent.trigger }],
    };
  }

  if (intent.type === 'UI_CLOSE_HELP') {
    return {
      runtime: cloneRuntime(runtime, { ui: { ...runtime.ui, overlay: null } }),
      effects: [{ type: 'CLOSE_HELP' }],
    };
  }

  if (intent.type === 'UI_RESTART_EXPEDITION') {
    if (!window.confirm('清除目前遠征進度並重新開始？教學完成紀錄及玩家設定會保留。')) {
      return { runtime };
    }
    const cleared = resetExpedition();
    if (!cleared.ok) {
      return {
        error: {
          code: 'RESET_EXPEDITION_FAILED',
          message: `未能重新開始：${cleared.error?.message ?? '本機存檔無法清除。'}`,
        },
      };
    }
    const game = createExpedition(`moonlight-${Date.now()}`);
    const nextRuntime = createRuntimeState({
      game,
      profile: runtime.profile,
      ui: {
        selectedCardIds: [],
        rangeUnitId: null,
        lastMessage: '已重新開始遠征；教學紀錄及設定已保留。',
        overlay: null,
        orderDraft: null,
      },
    });
    resumeAfterHelp = false;
    return {
      runtime: nextRuntime,
      effects: [
        { type: 'CLEAR_FEEDBACK' },
        { type: 'CLOSE_HELP' },
        { type: 'SAVE_GAME', game },
      ],
    };
  }

  if (intent.type === 'UI_CLEAR_ALL_V2_DATA') {
    if (!window.confirm(
      '確認完全清除？將刪除遠征、教學、設定及所有舊 v2 資料；其他 Playground 項目及經典版資料不受影響。',
    )) return { runtime };
    const cleared = clearAllV2Data();
    if (!cleared.ok) {
      return {
        error: {
          code: 'CLEAR_ALL_DATA_FAILED',
          message: `未能完全清除：${cleared.error?.message ?? '本機資料無法清除。'}`,
        },
      };
    }
    return {
      runtime,
      effects: [
        { type: 'CLEAR_FEEDBACK' },
        { type: 'RELOAD_LATEST' },
      ],
    };
  }

  if (intent.type === 'UI_SKIP_TUTORIAL') {
    if (!runtime.profile.tutorial?.complete && !window.confirm('確認略過首次教學？')) {
      return { runtime };
    }
    return {
      runtime: cloneRuntime(runtime, {
        profile: { ...runtime.profile, tutorial: skipTutorial(runtime.profile.tutorial) },
        ui: { ...runtime.ui, lastMessage: '教學已略過。' },
      }),
    };
  }

  return null;
}

function emitEffects(effects) {
  for (const effect of effects) {
    if (effect.type === 'OPEN_HELP') helpPanel.open(effect.trigger);
    if (effect.type === 'CLOSE_HELP') helpPanel.close();
    if (effect.type === 'CLEAR_FEEDBACK') feedback.clear();
    if (effect.type === 'SAVE_GAME') maybeSave(effect.game);
    if (effect.type === 'RELOAD_LATEST') {
      window.location.href = buildLatestVersionUrl(window.location);
    }
  }
}

function finalizeDomainRuntime({ runtime, intent, result }) {
  const game = result.state;
  const profile = {
    settings: { ...runtime.profile.settings, ...(game.settings ?? {}) },
    tutorial: advanceTutorialForResult(runtime.profile.tutorial, intent.type, result.events ?? []),
    discoveredRecipeIds: recordRecipeDiscoveries(
      runtime.profile.discoveredRecipeIds,
      result.events ?? [],
    ),
  };
  const nextMessage = eventMessage(result.events ?? []) ?? runtime.ui.lastMessage;
  return createRuntimeState({
    game,
    profile,
    ui: {
      ...runtime.ui,
      selectedCardIds: game.selection?.cardIds ?? runtime.ui.selectedCardIds,
      lastMessage: nextMessage,
    },
  });
}

function renderViewModel(viewModel) {
  lastViewModel = viewModel;
  renderApp(root, viewModel);
  message.textContent = viewModel.feedback.lastMessage ?? '';
}

function renderFatalDataError(errors) {
  feedback.clear();
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
  controller = createAppController({
    initialRuntime,
    reduceGame,
    buildViewModel: buildAppViewModel,
    renderViewModel,
    persistGame: maybeSave,
    shouldPersistGame: isApprovedSaveBoundary,
    persistProfile,
    presentEvents,
    emitEffects,
    handleExternalUiIntent,
    finalizeDomainRuntime,
    setTimer: (callback, delay) => window.setTimeout(callback, delay),
    clearTimer: (timerId) => window.clearTimeout(timerId),
    combatDelay: (runtime) => (runtime.profile.settings.speed === 2 ? 350 : 700),
    waitUntilIdle: () => feedback.whenIdle(),
  });

  bindInteractions(
    root,
    (intent) => controller.dispatchIntent(intent),
    () => lastViewModel,
  );
  persistProfile(initialRuntime.profile);
  controller.render();

  document.addEventListener('keydown', (event) => {
    const interactive = ['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'SUMMARY']
      .includes(document.activeElement?.tagName);
    const runtime = controller.getRuntime();
    if (event.key === 'Escape') {
      if (helpPanel.isOpen()) {
        controller.dispatchIntent({ type: 'UI_CLOSE_HELP' });
        return;
      }
      const details = root.querySelector('#details-panel');
      if (details?.open) details.open = false;
      if (runtime.ui.rangeUnitId) controller.dispatchIntent({ type: 'UI_CLOSE_RANGE' });
    }
    if (event.code === 'Space'
      && runtime.game.status === 'combat'
      && !interactive
      && !helpPanel.isOpen()) {
      event.preventDefault();
      controller.dispatchIntent({ type: runtime.game.combat.paused ? 'RESUME' : 'PAUSE' });
    }
  });
}
