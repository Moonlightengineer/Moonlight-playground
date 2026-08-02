import test from 'node:test';
import assert from 'node:assert/strict';

import { createAppController } from '../src/app-controller.js';
import { createRuntimeState } from '../src/runtime/runtime-state.js';

function legacyGame(overrides = {}) {
  return {
    status: 'configuration',
    settings: { reducedMotion: false, vibration: true, speed: 1 },
    tutorial: { index: 2, complete: false, skipped: false },
    selection: { cardIds: ['card-1'] },
    ui: { rangeUnitId: 'unit-1', lastMessage: 'legacy' },
    ...overrides,
  };
}

test('createRuntimeState separates legacy game, profile and transient UI without mutating input', () => {
  const game = legacyGame();
  const before = JSON.stringify(game);
  const runtime = createRuntimeState({ game });

  assert.equal(runtime.game, game);
  assert.deepEqual(runtime.profile, {
    settings: { reducedMotion: false, vibration: true, speed: 1 },
    tutorial: { index: 2, complete: false, skipped: false },
    discoveredRecipeIds: [],
  });
  assert.deepEqual(runtime.ui, {
    selectedCardIds: ['card-1'],
    rangeUnitId: 'unit-1',
    lastMessage: 'legacy',
    overlay: null,
    orderDraft: null,
  });
  assert.equal(JSON.stringify(game), before);
});

test('explicit profile and UI values override legacy adapters', () => {
  const game = legacyGame();
  const runtime = createRuntimeState({
    game,
    profile: {
      settings: { reducedMotion: true, vibration: false, speed: 2 },
      tutorial: { index: 5, complete: true, skipped: false },
    },
    ui: { selectedCardIds: [], rangeUnitId: null, lastMessage: 'explicit', overlay: 'help' },
  });

  assert.equal(runtime.profile.settings.reducedMotion, true);
  assert.equal(runtime.profile.settings.speed, 2);
  assert.deepEqual(runtime.ui.selectedCardIds, []);
  assert.equal(runtime.ui.lastMessage, 'explicit');
  assert.equal(runtime.ui.overlay, 'help');
});

function controllerHarness(options = {}) {
  const calls = {
    reducer: [], render: [], persistGame: [], persistProfile: [], events: [], effects: [],
    timers: [], cleared: [],
  };
  let nextTimerId = 1;
  const controller = createAppController({
    initialRuntime: createRuntimeState({ game: legacyGame(options.game) }),
    reduceGame(game, command) {
      calls.reducer.push({ game, command });
      return options.reduceResult ?? { ok: true, state: { ...game, status: 'reward' }, events: [{ type: 'DONE' }] };
    },
    buildViewModel(game, profile, ui) {
      return { status: game.status, reducedMotion: profile.settings.reducedMotion, message: ui.lastMessage };
    },
    renderViewModel(viewModel) {
      calls.render.push(viewModel);
    },
    persistGame(game) {
      calls.persistGame.push(game);
    },
    shouldPersistGame: options.shouldPersistGame ?? (() => true),
    persistProfile(profile) {
      calls.persistProfile.push(profile);
    },
    presentEvents(events) {
      calls.events.push(events);
      return Promise.resolve();
    },
    emitEffects(effects) {
      calls.effects.push(effects);
    },
    setTimer(callback, delay) {
      const id = nextTimerId++;
      calls.timers.push({ id, callback, delay });
      return id;
    },
    clearTimer(id) {
      calls.cleared.push(id);
    },
    combatDelay: () => 700,
    handleExternalUiIntent: options.handleExternalUiIntent,
  });
  return { controller, calls };
}

test('UI-only selection intent updates transient state without calling reducer', () => {
  const { controller, calls } = controllerHarness();
  const originalGame = controller.getRuntime().game;

  const result = controller.dispatchIntent({ type: 'UI_CLEAR_SELECTION' });

  assert.equal(result.ok, true);
  assert.equal(controller.getRuntime().game, originalGame);
  assert.deepEqual(controller.getRuntime().ui.selectedCardIds, []);
  assert.equal(calls.reducer.length, 0);
  assert.equal(calls.persistGame.length, 0);
  assert.equal(calls.render.length, 1);
});

test('next domain command receives transient selection instead of stale legacy selection', () => {
  const { controller, calls } = controllerHarness();
  const originalGame = controller.getRuntime().game;

  controller.dispatchIntent({ type: 'UI_CLEAR_SELECTION' });
  controller.dispatchIntent({ type: 'SELECT_CARD', cardId: 'card-2' });

  assert.equal(calls.reducer.length, 1);
  assert.notEqual(calls.reducer[0].game, originalGame);
  assert.deepEqual(calls.reducer[0].game.selection, { cardIds: [] });
  assert.deepEqual(calls.reducer[0].game.settings, controller.getRuntime().profile.settings);
});

test('profile intent persists profile only and keeps game identity', () => {
  const { controller, calls } = controllerHarness();
  const originalGame = controller.getRuntime().game;

  controller.dispatchIntent({ type: 'UI_TOGGLE_REDUCED_MOTION' });

  assert.equal(controller.getRuntime().game, originalGame);
  assert.equal(controller.getRuntime().profile.settings.reducedMotion, true);
  assert.equal(calls.persistProfile.length, 1);
  assert.equal(calls.persistGame.length, 0);
  assert.equal(calls.reducer.length, 0);
});

test('successful domain command updates game, syncs legacy selection, persists and presents events', async () => {
  const nextGame = legacyGame({ status: 'reward', selection: { cardIds: [] } });
  const { controller, calls } = controllerHarness({
    reduceResult: { ok: true, state: nextGame, events: [{ type: 'REWARD_READY' }] },
  });

  const result = controller.dispatchIntent({ type: 'START_PHASE' });
  await Promise.resolve();

  assert.equal(result.ok, true);
  assert.equal(controller.getRuntime().game, nextGame);
  assert.deepEqual(controller.getRuntime().ui.selectedCardIds, []);
  assert.equal(calls.reducer.length, 1);
  assert.deepEqual(calls.reducer[0].command, { type: 'START_PHASE' });
  assert.deepEqual(calls.persistGame, [nextGame]);
  assert.deepEqual(calls.events, [[{ type: 'REWARD_READY' }]]);
  assert.equal(calls.render.length, 1);
});

test('failed domain command preserves exact game identity and does not persist or present events', () => {
  const original = legacyGame();
  const { controller, calls } = controllerHarness({
    game: original,
    reduceResult: {
      ok: false,
      state: { ...original },
      events: [],
      error: { code: 'BLOCKED', message: '而家唔可以。' },
    },
  });
  const before = controller.getRuntime().game;

  const result = controller.dispatchIntent({ type: 'START_PHASE' });

  assert.equal(result.ok, false);
  assert.equal(controller.getRuntime().game, before);
  assert.equal(controller.getRuntime().ui.lastMessage, '而家唔可以。');
  assert.equal(calls.persistGame.length, 0);
  assert.equal(calls.events.length, 0);
  assert.equal(calls.render.length, 1);
});

test('controller owns one combat timer and clears it on reschedule and destroy', () => {
  const { controller, calls } = controllerHarness({
    game: { status: 'combat', combat: { paused: false } },
    reduceResult: {
      ok: true,
      state: legacyGame({ status: 'combat', combat: { paused: false } }),
      events: [],
    },
  });

  controller.render();
  controller.render();
  assert.equal(calls.timers.length, 2);
  assert.deepEqual(calls.cleared, [1]);

  controller.destroy();
  assert.deepEqual(calls.cleared, [1, 2]);
});

test('external UI handler may return effects without routing through reducer', () => {
  const { controller, calls } = controllerHarness({
    handleExternalUiIntent(runtime, intent) {
      if (intent.type !== 'UI_OPEN_HELP') return null;
      return {
        runtime: { ...runtime, ui: { ...runtime.ui, overlay: 'help' } },
        effects: [{ type: 'OPEN_HELP' }],
      };
    },
  });

  const result = controller.dispatchIntent({ type: 'UI_OPEN_HELP' });

  assert.equal(result.ok, true);
  assert.equal(controller.getRuntime().ui.overlay, 'help');
  assert.deepEqual(calls.effects, [[{ type: 'OPEN_HELP' }]]);
  assert.equal(calls.reducer.length, 0);
});
