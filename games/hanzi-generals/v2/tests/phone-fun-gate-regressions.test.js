import test from 'node:test';
import assert from 'node:assert/strict';
import { createExpedition } from '../src/expedition/expedition.js';
import { normalizeGameState, reduceGame } from '../src/core/state-machine.js';

function startConfiguration(seed = 'phone-fun-gate') {
  return reduceGame(createExpedition(seed), { type: 'START_BATTLE' }).state;
}

function assembleTutorialZhangFei(game) {
  let next = reduceGame(game, { type: 'DRAW_CARDS' }).state;
  const zhang = next.deck.hand.find(({ symbol }) => symbol === '張');
  const fei = next.deck.hand.find(({ symbol }) => symbol === '飛');
  next = reduceGame(next, { type: 'SELECT_CARD', cardId: zhang.id }).state;
  next = reduceGame(next, { type: 'ASSEMBLE', target: { column: 0, row: 0 } }).state;
  next = reduceGame(next, { type: 'SELECT_CARD', cardId: fei.id }).state;
  return reduceGame(next, { type: 'ASSEMBLE', target: { column: 1, row: 0 } }).state;
}

function ownershipSnapshot(game) {
  const ids = [
    ...game.deck.drawPile.map(({ id }) => id),
    ...game.deck.discardPile.map(({ id }) => id),
    ...game.deck.hand.map(({ id }) => id),
    ...game.camp.cardIds,
    ...Object.values(game.boardCards ?? {}),
    ...game.deck.deployed.flatMap(({ cardIds }) => cardIds),
  ];
  return { total: ids.length, unique: new Set(ids).size, sorted: [...ids].sort() };
}

test('each configuration phase exposes one draw budget and rejects refill', () => {
  const game = startConfiguration('draw-budget');
  assert.equal(game.currentBattle.drawsRemaining, 1);

  const first = reduceGame(game, { type: 'DRAW_CARDS' });
  assert.equal(first.ok, true);
  assert.equal(first.state.currentBattle.drawsRemaining, 0);
  assert.equal(first.state.deck.hand.length, 5);

  const moved = reduceGame(first.state, {
    type: 'MOVE_CARD_TO_CAMP',
    cardId: first.state.deck.hand[0].id,
  });
  assert.equal(moved.ok, true);
  const beforeRepeat = ownershipSnapshot(moved.state);
  const repeated = reduceGame(moved.state, { type: 'DRAW_CARDS' });
  assert.equal(repeated.ok, false);
  assert.equal(repeated.error.code, 'DRAW_LIMIT_REACHED');
  assert.deepEqual(ownershipSnapshot(repeated.state), beforeRepeat);
});

test('normalization supplies deterministic draw budget for active saves without losing progress', () => {
  const untouched = startConfiguration('legacy-undrawn');
  delete untouched.currentBattle.drawsRemaining;
  const untouchedBefore = ownershipSnapshot(untouched);
  const normalizedUntouched = normalizeGameState(untouched);
  assert.equal(normalizedUntouched.currentBattle.drawsRemaining, 1);
  assert.deepEqual(ownershipSnapshot(normalizedUntouched), untouchedBefore);

  let consumed = startConfiguration('legacy-drawn');
  consumed = reduceGame(consumed, { type: 'DRAW_CARDS' }).state;
  delete consumed.currentBattle.drawsRemaining;
  const consumedBefore = ownershipSnapshot(consumed);
  const normalizedConsumed = normalizeGameState(consumed);
  assert.equal(normalizedConsumed.currentBattle.drawsRemaining, 0);
  assert.equal(normalizedConsumed.currentBattle.phaseIndex, consumed.currentBattle.phaseIndex);
  assert.deepEqual(normalizedConsumed.camp, consumed.camp);
  assert.deepEqual(ownershipSnapshot(normalizedConsumed), consumedBefore);
});

test('draw budget resets through the public same-battle lifecycle', () => {
  let game = assembleTutorialZhangFei(startConfiguration('draw-reset-public'));
  game = reduceGame(game, { type: 'START_PHASE' }).state;
  assert.equal(game.currentBattle.drawsRemaining, 0);

  for (let step = 0; step < 3000 && game.status === 'combat'; step += 1) {
    const result = reduceGame(game, { type: 'STEP_COMBAT' });
    assert.equal(result.ok, true);
    game = result.state;
  }

  assert.equal(game.status, 'configuration');
  assert.equal(game.currentBattle.phaseIndex, 1);
  assert.equal(game.currentBattle.drawsRemaining, 1);
  assert.equal(game.legalActions.includes('DRAW_CARDS'), true);
  assert.equal(ownershipSnapshot(game).total, ownershipSnapshot(game).unique);
});

test('redeploy is one-shot, validates targets, preserves ownership and combat continues', () => {
  let game = assembleTutorialZhangFei(startConfiguration('combat-move'));
  game = reduceGame(game, { type: 'START_PHASE' }).state;
  const beforeOwnership = ownershipSnapshot(game);
  const beforeOrders = game.combat.ordersRemaining;

  const moved = reduceGame(game, {
    type: 'ISSUE_ORDER',
    order: { type: 'redeploy', unitId: 'unit-1', target: { column: 1, row: 1 } },
  });
  assert.equal(moved.ok, true);
  assert.deepEqual(moved.state.combat.board.units['unit-1'].cell, { column: 1, row: 1 });
  assert.equal(moved.state.combat.ordersRemaining, beforeOrders - 1);
  assert.deepEqual(ownershipSnapshot(moved.state), beforeOwnership);

  const secondLegal = reduceGame(moved.state, {
    type: 'ISSUE_ORDER',
    order: { type: 'redeploy', unitId: 'unit-1', target: { column: 2, row: 1 } },
  });
  assert.equal(secondLegal.ok, false);
  assert.equal(secondLegal.error.code, 'REDEPLOY_ALREADY_USED');
  assert.equal(secondLegal.state.combat.ordersRemaining, beforeOrders - 1);

  for (const order of [
    { type: 'redeploy', unitId: 'missing', target: { column: 0, row: 0 } },
    { type: 'redeploy', unitId: 'unit-1', target: { column: -1, row: 0 } },
    { type: 'redeploy', unitId: 'unit-1', target: { column: 1, row: 1 } },
  ]) {
    const snapshot = structuredClone(moved.state.combat);
    const invalid = reduceGame(moved.state, { type: 'ISSUE_ORDER', order });
    assert.equal(invalid.ok, false);
    assert.deepEqual(invalid.state.combat, snapshot);
  }

  const stepped = reduceGame(moved.state, { type: 'STEP_COMBAT' });
  assert.equal(stepped.ok, true);
  assert.equal(ownershipSnapshot(stepped.state).total, ownershipSnapshot(stepped.state).unique);
});
