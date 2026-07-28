import test from 'node:test';
import assert from 'node:assert/strict';

import { reduceGame } from '../src/core/state-machine.js';
import { createExpedition } from '../src/expedition/expedition.js';
import { createRuntimeState } from '../src/runtime/runtime-state.js';
import {
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

function selectedConfiguration(seed = 'selection-transient') {
  let game = reduceGame(createExpedition(seed), { type: 'START_BATTLE' }).state;
  game = reduceGame(game, { type: 'DRAW_CARDS' }).state;
  const cardId = game.deck.hand[0].id;
  game = reduceGame(game, { type: 'SELECT_CARD', cardId }).state;
  assert.deepEqual(game.selection.cardIds, [cardId]);
  return { game, cardId };
}

test('prepareGameForSave removes transient selection', () => {
  const { game } = selectedConfiguration('selection-prepare');
  const prepared = prepareGameForSave(game);
  assert.equal('selection' in prepared, false);
});

test('v2 migration discards legacy selection instead of restoring it', () => {
  const { game } = selectedConfiguration('selection-migration');
  const migrated = migrateSaveEnvelope({ schemaVersion: 2, game });
  assert.equal(migrated.ok, true);
  assert.equal('selection' in migrated.envelope.game, false);
});

test('phase-zero save and reload never restores a half-complete card selection', () => {
  const storage = memoryStorage();
  const { game, cardId } = selectedConfiguration('selection-roundtrip');

  saveSnapshot(game, storage);
  const raw = JSON.parse(storage.getItem(STORAGE_KEYS.save));
  assert.equal('selection' in raw.game, false);

  const loaded = loadSnapshot(storage);
  assert.equal(loaded.ok, true);
  assert.equal('selection' in loaded.game, false);
  const runtime = createRuntimeState({ game: loaded.game });
  assert.deepEqual(runtime.ui.selectedCardIds, []);
  assert.equal(runtime.ui.selectedCardIds.includes(cardId), false);
});
