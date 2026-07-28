import test from 'node:test';
import assert from 'node:assert/strict';

import { assertCardOwnership } from '../src/core/card-invariants.js';
import { reduceGame } from '../src/core/state-machine.js';
import { createExpedition } from '../src/expedition/expedition.js';
import {
  CURRENT_SAVE_VERSION,
  migrateSaveEnvelope,
  prepareGameForSave,
} from '../src/storage/migrations.js';
import { loadSnapshot, saveSnapshot, STORAGE_KEYS } from '../src/storage/storage.js';

function memoryStorage() {
  const values = new Map();
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

function configuredGame(seed = 'migration-v3') {
  let game = reduceGame(createExpedition(seed), { type: 'START_BATTLE' }).state;
  game = reduceGame(game, { type: 'DRAW_CARDS' }).state;
  return game;
}

test('v1 envelope migrates sequentially to v3 without mutating input', () => {
  const game = configuredGame('migration-v1');
  const legacy = {
    schemaVersion: 1,
    game: {
      ...game,
      recruitedGeneralIds: undefined,
      rewardHistory: undefined,
      evolutions: undefined,
      battleReport: undefined,
      lastBattleReport: undefined,
      battleMetrics: undefined,
    },
  };
  const before = JSON.stringify(legacy);
  const result = migrateSaveEnvelope(legacy);

  assert.equal(result.ok, true);
  assert.equal(result.envelope.schemaVersion, CURRENT_SAVE_VERSION);
  assert.equal(result.migratedFrom, 1);
  assert.deepEqual(result.applied, ['v1-to-v2', 'v2-to-v3']);
  assert.deepEqual(result.envelope.game.recruitedGeneralIds, []);
  assert.deepEqual(result.envelope.game.rewardHistory, []);
  assert.deepEqual(result.envelope.game.evolutions, {});
  assert.equal(result.envelope.game.battleReport, null);
  assert.equal(result.envelope.game.lastBattleReport, null);
  assert.equal(result.envelope.game.battleMetrics, null);
  assert.equal(JSON.stringify(legacy), before);
  assertCardOwnership(result.envelope.game);
});

test('v2 to v3 normalizes retained cards, legacy locks and permanent camp bonus', () => {
  const game = configuredGame('migration-v2');
  const retainedId = game.deck.hand[0].id;
  const legacy = {
    schemaVersion: 2,
    game: {
      ...game,
      deck: {
        ...game.deck,
        hand: game.deck.hand.map((card) => ({ ...card, locked: true })),
        drawPile: game.deck.drawPile.map((card) => ({ ...card, locked: true })),
        retained: [retainedId, retainedId, 'ghost-card'],
      },
      temporary: { ...game.temporary, extraCamp: 2 },
      ui: { rangeUnitId: 'unit-ghost', lastMessage: 'legacy' },
    },
  };
  const result = migrateSaveEnvelope(legacy);

  assert.equal(result.ok, true);
  assert.deepEqual(result.applied, ['v2-to-v3']);
  assert.deepEqual(result.envelope.game.deck.retained, [retainedId]);
  assert.equal(result.envelope.game.deck.hand.every(({ locked }) => locked === false), true);
  assert.equal(result.envelope.game.deck.drawPile.every(({ locked }) => locked === false), true);
  assert.equal(result.envelope.game.camp.capacity, game.camp.capacity + 2);
  assert.equal(result.envelope.game.temporary.extraCamp, 0);
  assertCardOwnership(result.envelope.game);
});

test('migration rejects malformed envelopes and future versions', () => {
  assert.equal(migrateSaveEnvelope(null).error.code, 'CORRUPT_SAVE');
  assert.equal(migrateSaveEnvelope({ schemaVersion: 1 }).error.code, 'CORRUPT_SAVE');
  assert.equal(
    migrateSaveEnvelope({ schemaVersion: CURRENT_SAVE_VERSION + 1, game: {} }).error.code,
    'UNSUPPORTED_SAVE',
  );
  assert.equal(migrateSaveEnvelope({ schemaVersion: 0, game: {} }).error.code, 'UNSUPPORTED_SAVE');
});

test('prepareGameForSave removes profile and transient fields but keeps domain state', () => {
  const game = configuredGame('migration-save-shape');
  const input = {
    ...game,
    settings: { reducedMotion: true, vibration: false, speed: 2 },
    tutorial: { complete: true },
    ui: { lastMessage: 'transient', rangeUnitId: 'unit-1' },
  };
  const before = JSON.stringify(input);
  const prepared = prepareGameForSave(input);

  assert.equal('settings' in prepared, false);
  assert.equal('tutorial' in prepared, false);
  assert.equal('ui' in prepared, false);
  assert.equal(prepared.status, input.status);
  assert.equal(JSON.stringify(input), before);
  assertCardOwnership(prepared);
});

test('storage writes v3, strips runtime fields and reloads a battle report', () => {
  const storage = memoryStorage();
  const game = configuredGame('migration-report');
  const reportGame = {
    ...game,
    status: 'battle-report',
    battleReport: {
      schemaVersion: 1,
      stageId: 'tutorial',
      battleNumber: 1,
      result: 'victory',
      nextStatus: 'reward',
      wallStart: 100,
      wallEnd: 90,
      wallDamage: 10,
      phasesCompleted: 3,
      turns: 12,
      enemiesDefeated: 8,
      unitsFielded: 2,
      unitsLost: 0,
      ordersUsed: 2,
      eventCounts: { ENEMY_DEFEATED: 8 },
    },
    battleMetrics: null,
    settings: { reducedMotion: true, vibration: false, speed: 2 },
    tutorial: { complete: true },
    ui: { lastMessage: 'transient' },
  };

  saveSnapshot(reportGame, storage);
  const raw = JSON.parse(storage.getItem(STORAGE_KEYS.save));
  assert.equal(raw.schemaVersion, CURRENT_SAVE_VERSION);
  assert.equal('settings' in raw.game, false);
  assert.equal('tutorial' in raw.game, false);
  assert.equal('ui' in raw.game, false);

  const loaded = loadSnapshot(storage);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.game.status, 'battle-report');
  assert.equal(loaded.game.battleReport.nextStatus, 'reward');
  assert.equal(loaded.schemaVersion, CURRENT_SAVE_VERSION);
  assertCardOwnership(loaded.game);
});

test('loadSnapshot rejects v3 states that violate card ownership', () => {
  const storage = memoryStorage();
  const game = configuredGame('migration-corrupt-owner');
  const duplicate = game.deck.hand[0];
  storage.setItem(STORAGE_KEYS.save, JSON.stringify({
    schemaVersion: CURRENT_SAVE_VERSION,
    game: {
      ...game,
      deck: {
        ...game.deck,
        discardPile: [...game.deck.discardPile, { ...duplicate }],
      },
    },
  }));

  const loaded = loadSnapshot(storage);
  assert.equal(loaded.ok, false);
  assert.equal(loaded.error.code, 'INVALID_SAVE_STATE');
  assert.equal(loaded.error.details.some(({ code }) => code === 'DUPLICATE_CARD_OWNERSHIP'), true);
});
