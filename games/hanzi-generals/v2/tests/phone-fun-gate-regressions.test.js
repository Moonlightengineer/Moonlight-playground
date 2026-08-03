import test from 'node:test';
import assert from 'node:assert/strict';
import { createExpedition } from '../src/expedition/expedition.js';
import { reduceGame } from '../src/core/state-machine.js';

function startConfiguration(seed = 'phone-fun-gate') {
  return reduceGame(createExpedition(seed), { type: 'START_BATTLE' }).state;
}

test('each configuration phase has one visible draw budget and cannot refill repeatedly', () => {
  let game = startConfiguration('draw-budget');
  assert.equal(game.currentBattle.drawsRemaining, 1);

  const first = reduceGame(game, { type: 'DRAW_CARDS' });
  assert.equal(first.ok, true);
  assert.equal(first.state.currentBattle.drawsRemaining, 0);
  assert.equal(first.state.deck.hand.length, 5);

  const cardId = first.state.deck.hand[0].id;
  const moved = reduceGame(first.state, { type: 'MOVE_CARD_TO_CAMP', cardId });
  assert.equal(moved.ok, true);
  assert.equal(moved.state.deck.hand.length, 4);

  const second = reduceGame(moved.state, { type: 'DRAW_CARDS' });
  assert.equal(second.ok, false);
  assert.equal(second.error.code, 'DRAW_LIMIT_REACHED');
  assert.equal(second.state.deck.hand.length, 4);
});

test('draw budget is restored at the next configuration phase', () => {
  const game = startConfiguration('draw-reset');
  assert.equal(game.currentBattle.drawsRemaining, 1);
});

test('combat exposes a redeploy military order', () => {
  let game = startConfiguration('combat-move');
  game = reduceGame(game, { type: 'DRAW_CARDS' }).state;
  const combat = reduceGame(game, { type: 'START_PHASE' });
  assert.equal(combat.ok, true);
  assert.equal(combat.state.status, 'combat');
  assert.equal(combat.state.combat.availableOrderTypes.includes('redeploy'), true);
});

test('help and codex are persistent navigation actions rather than military orders', () => {
  const game = startConfiguration('navigation-contract');
  assert.equal(game.ui.navigation.includes('help'), true);
  assert.equal(game.ui.navigation.includes('codex'), true);
});
