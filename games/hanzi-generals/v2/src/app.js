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
    FOCUS_ORDERED: `集火已生效，持續 ${important.payload?.durationSeconds ?? 6} 秒。`,
    FORTIFY_ORDERED: `第 ${(important.payload?.lane ?? 0) + 1} 路已固守，持續 ${important.payload?.durationSeconds ?? 6} 秒。`,
    ASSAULT_ORDERED: `第 ${(important.payload?.lane ?? 0) + 1} 路已急攻，持續 ${important.payload?.durationSeconds ?? 6} 秒。`,
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
    const detail = definition ? buildUnitPlayerDetail(definition, unit?.evolution, runtime.game.troopSpecializations ?? []) : null;
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

  if (intent.type === 'UI_RESTART_RUN') {
    const reset = resetExpedition();
    if (!reset.ok) {
      return {
        runtime: cloneRuntime(runtime, { ui: { ...runtime.ui, lastMessage: '重新開始失敗，請重試。' } }),
      };
    }
    return {
      runtime: createRuntimeState({
        game: createExpedition(seedFromUrl()),
        profile: runtime.profile,
        ui: { rangeUnitId: null, lastMessage: '已重新開始遠征。', overlay: null, orderDraft: null },
      }),
    };
  }

  if (intent.type === 'UI_RESET_LATEST') {
    const reset = clearAllV2Data();
    if (!reset.ok) {
      return {
        runtime: cloneRuntime(runtime, { ui: { ...runtime.ui, lastMessage: '清除資料失敗，請重試。' } }),
      };
    }
    return {
      runtime,
      effects: [{ type: 'NAVIGATE', href: buildLatestVersionUrl(window.location) }],
    };
  }

  if (intent.type === 'UI_NEW_RUN') {
    return {
      runtime: createRuntimeState({
        game: createExpedition(`${seedFromUrl()}-${Date.now()}`),
        profile: runtime.profile,
        ui: { rangeUnitId: null, lastMessage: '新遠征已建立。', overlay: null, orderDraft: null },
      }),
    };
  }

  return null;
}

function tutorialForResult(runtime, intent, result) {
  let tutorial = runtime.profile.tutorial;
  if (intent.type === 'RETAIN_CARDS') tutorial = advanceTutorial(tutorial, 'RETAIN_CARDS');
  if (intent.type === 'START_PHASE') tutorial = advanceTutorial(tutorial, 'START_PHASE');
  return advanceTutorialForResult(tutorial, result);
}

function persistGameAtBoundary(game, intent, previousGame) {
  if (!isApprovedSaveBoundary(intent, game, previousGame)) return;
  maybeSave(game, intent, previousGame);
}

function appDependencies() {
  return {
    initialRuntime,
    reduceGame,
    buildViewModel: buildAppViewModel,
    render: (viewModel, runtime) => {
      lastViewModel = viewModel;
      renderApp(root, viewModel, runtime.ui);
      message.textContent = runtime.ui.lastMessage || '';
      root.hidden = false;
      if (runtime.ui.overlay === 'help') helpPanel.open();
      else if (helpPanel.isOpen()) helpPanel.close();
      persistProfile(runtime.profile);
    },
    persistGame: persistGameAtBoundary,
    presentEvents,
    eventMessage,
    tutorialForResult,
    recordDiscoveries: (profile, events) => {
      const discoveredRecipeIds = recordRecipeDiscoveries(profile.discoveredRecipeIds, events);
      return { ...profile, discoveredRecipeIds };
    },
    handleExternalUiIntent,
    schedule: (callback, delay) => window.setTimeout(callback, delay),
    cancelSchedule: (timerId) => window.clearTimeout(timerId),
    combatDelay: (runtime) => 900 / (runtime.profile.settings.speed ?? 1),
    notifyEffects: (effects) => {
      for (const effect of effects) {
        if (effect.type === 'OPEN_HELP') helpPanel.open(effect.trigger);
        if (effect.type === 'CLOSE_HELP') helpPanel.close();
        if (effect.type === 'NAVIGATE') window.location.assign(effect.href);
      }
    },
  };
}

controller = createAppController(appDependencies());
controller.render();
bindInteractions(root, {
  dispatch: (intent) => controller.dispatchIntent(intent),
  getViewModel: () => lastViewModel,
  helpPanel,
});
