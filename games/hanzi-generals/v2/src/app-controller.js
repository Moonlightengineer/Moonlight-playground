import { createRuntimeState } from './runtime/runtime-state.js';

const BUILTIN_UI_INTENTS = new Set([
  'UI_CLEAR_SELECTION',
  'UI_CLOSE_RANGE',
  'UI_SET_MESSAGE',
  'UI_TOGGLE_REDUCED_MOTION',
  'UI_TOGGLE_VIBRATION',
]);

function cloneRuntime(runtime, changes = {}) {
  return {
    game: changes.game ?? runtime.game,
    profile: changes.profile ?? runtime.profile,
    ui: changes.ui ?? runtime.ui,
  };
}

function syncLegacyRuntime(runtime, nextGame) {
  return createRuntimeState({
    game: nextGame,
    profile: {
      settings: { ...runtime.profile.settings, ...(nextGame.settings ?? {}) },
      tutorial: nextGame.tutorial ?? runtime.profile.tutorial,
    },
    ui: {
      ...runtime.ui,
      selectedCardIds: nextGame.selection?.cardIds ?? runtime.ui.selectedCardIds,
      rangeUnitId: nextGame.ui?.rangeUnitId ?? runtime.ui.rangeUnitId,
      lastMessage: nextGame.ui?.lastMessage ?? runtime.ui.lastMessage,
    },
  });
}

function handleBuiltinUiIntent(runtime, intent) {
  switch (intent.type) {
    case 'UI_CLEAR_SELECTION':
      return cloneRuntime(runtime, {
        ui: { ...runtime.ui, selectedCardIds: [], lastMessage: '已清除字牌選取。' },
      });
    case 'UI_CLOSE_RANGE':
      return cloneRuntime(runtime, {
        ui: { ...runtime.ui, rangeUnitId: null, lastMessage: '已關閉範圍資訊。' },
      });
    case 'UI_SET_MESSAGE':
      return cloneRuntime(runtime, {
        ui: { ...runtime.ui, lastMessage: intent.message ?? '' },
      });
    case 'UI_TOGGLE_REDUCED_MOTION': {
      const enabled = !runtime.profile.settings.reducedMotion;
      return cloneRuntime(runtime, {
        profile: {
          ...runtime.profile,
          settings: { ...runtime.profile.settings, reducedMotion: enabled },
        },
        ui: { ...runtime.ui, lastMessage: enabled ? '已開啟低動態模式。' : '已關閉低動態模式。' },
      });
    }
    case 'UI_TOGGLE_VIBRATION': {
      const enabled = !runtime.profile.settings.vibration;
      return cloneRuntime(runtime, {
        profile: {
          ...runtime.profile,
          settings: { ...runtime.profile.settings, vibration: enabled },
        },
        ui: { ...runtime.ui, lastMessage: enabled ? '已開啟震動。' : '已關閉震動。' },
      });
    }
    default:
      return runtime;
  }
}

export function createAppController({
  initialRuntime,
  reduceGame,
  buildViewModel,
  renderViewModel,
  persistGame = () => {},
  shouldPersistGame = () => false,
  persistProfile = () => {},
  presentEvents = () => Promise.resolve(),
  emitEffects = () => {},
  handleExternalUiIntent = () => null,
  finalizeDomainRuntime = ({ runtime, result }) => syncLegacyRuntime(runtime, result.state),
  setTimer = (callback, delay) => setTimeout(callback, delay),
  clearTimer = (timerId) => clearTimeout(timerId),
  combatDelay = (runtime) => (runtime.profile.settings.speed === 2 ? 350 : 700),
  waitUntilIdle = null,
}) {
  if (!initialRuntime?.game) throw new Error('AppController requires an initial runtime.');
  if (typeof reduceGame !== 'function') throw new Error('AppController requires reduceGame.');
  if (typeof buildViewModel !== 'function') throw new Error('AppController requires buildViewModel.');
  if (typeof renderViewModel !== 'function') throw new Error('AppController requires renderViewModel.');

  let runtime = initialRuntime;
  let timerId = null;
  let scheduleRequest = 0;
  let destroyed = false;

  function clearScheduledTick() {
    scheduleRequest += 1;
    if (timerId !== null) {
      clearTimer(timerId);
      timerId = null;
    }
  }

  function mayAutoStep() {
    return runtime.game.status === 'combat'
      && !runtime.game.combat?.paused
      && runtime.ui.overlay !== 'help';
  }

  function scheduleCombatTick() {
    clearScheduledTick();
    if (destroyed || !mayAutoStep()) return;
    const request = scheduleRequest;
    const arm = () => {
      if (destroyed || request !== scheduleRequest || !mayAutoStep()) return;
      timerId = setTimer(() => {
        timerId = null;
        dispatchIntent({ type: 'STEP_COMBAT' });
      }, combatDelay(runtime));
    };
    const idle = typeof waitUntilIdle === 'function' ? waitUntilIdle() : null;
    if (idle && typeof idle.then === 'function') Promise.resolve(idle).finally(arm);
    else arm();
  }

  function renderNow() {
    if (destroyed) return null;
    const viewModel = buildViewModel(runtime.game, runtime.profile, runtime.ui);
    renderViewModel(viewModel);
    return viewModel;
  }

  function render() {
    const viewModel = renderNow();
    scheduleCombatTick();
    return viewModel;
  }

  function finishUiIntent(nextRuntime, effects = []) {
    const profileChanged = nextRuntime.profile !== runtime.profile;
    runtime = nextRuntime;
    if (profileChanged) persistProfile(runtime.profile);
    renderNow();
    if (effects.length) emitEffects(effects);
    scheduleCombatTick();
    return { ok: true, runtime, events: [], effects, error: null };
  }

  function dispatchUiIntent(intent) {
    if (BUILTIN_UI_INTENTS.has(intent.type)) {
      const nextRuntime = handleBuiltinUiIntent(runtime, intent);
      const profileChanged = nextRuntime.profile !== runtime.profile;
      runtime = nextRuntime;
      if (profileChanged) persistProfile(runtime.profile);
      renderNow();
      scheduleCombatTick();
      return { ok: true, runtime, events: [], effects: [], error: null };
    }

    const external = handleExternalUiIntent(runtime, intent);
    if (!external) {
      const error = { code: 'UNKNOWN_UI_INTENT', message: '未知介面操作。' };
      runtime = cloneRuntime(runtime, { ui: { ...runtime.ui, lastMessage: error.message } });
      renderNow();
      scheduleCombatTick();
      return { ok: false, runtime, events: [], effects: [], error };
    }
    if (external.error) {
      runtime = cloneRuntime(runtime, {
        ui: { ...runtime.ui, lastMessage: external.error.message ?? '介面操作失敗。' },
      });
      renderNow();
      scheduleCombatTick();
      return { ok: false, runtime, events: [], effects: external.effects ?? [], error: external.error };
    }
    return finishUiIntent(external.runtime ?? runtime, external.effects ?? []);
  }

  function dispatchDomainIntent(intent) {
    const originalGame = runtime.game;
    const originalProfile = runtime.profile;
    const result = reduceGame(originalGame, intent);
    if (!result.ok) {
      runtime = cloneRuntime(runtime, {
        game: originalGame,
        ui: { ...runtime.ui, lastMessage: result.error?.message ?? '操作失敗。' },
      });
      renderNow();
      scheduleCombatTick();
      return { ...result, state: originalGame, runtime };
    }

    runtime = finalizeDomainRuntime({ runtime, intent, result });
    if (runtime.profile !== originalProfile) persistProfile(runtime.profile);
    if (shouldPersistGame(runtime.game)) persistGame(runtime.game);
    renderNow();
    const events = result.events ?? [];
    if (events.length) presentEvents(events);
    scheduleCombatTick();
    return { ...result, state: runtime.game, runtime };
  }

  function dispatchIntent(intent) {
    if (destroyed) {
      return {
        ok: false,
        runtime,
        events: [],
        error: { code: 'CONTROLLER_DESTROYED', message: '應用程式已停止。' },
      };
    }
    if (!intent || typeof intent.type !== 'string') {
      return {
        ok: false,
        runtime,
        events: [],
        error: { code: 'INVALID_INTENT', message: '操作格式錯誤。' },
      };
    }
    return intent.type.startsWith('UI_') ? dispatchUiIntent(intent) : dispatchDomainIntent(intent);
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    clearScheduledTick();
  }

  return {
    getRuntime: () => runtime,
    dispatchIntent,
    render,
    destroy,
  };
}
