import test from 'node:test';
import assert from 'node:assert/strict';
import { createExpedition } from '../src/expedition/expedition.js';
import { normalizeGameState, reduceGame } from '../src/core/state-machine.js';
import { validateCardOwnership } from '../src/core/card-invariants.js';

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
  return structuredClone({
    drawPile: game.deck.drawPile,
    discardPile: game.deck.discardPile,
    hand: game.deck.hand,
    retained: game.deck.retained,
    deployed: game.deck.deployed,
    camp: game.camp,
    boardCards: game.boardCards,
    board: game.board,
    cardsById: game.cardsById,
  });
}

function assertOwnershipValid(game) {
  const result = validateCardOwnership(game);
  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
}

test('each configuration phase exposes one draw budget and rejects refill', () => {
  const game = startConfiguration('draw-budget');
  assert.equal(game.currentBattle.drawsRemaining, 1);

  const first = reduceGame(game, { type: 'DRAW_CARDS' });
  assert.equal(first.ok, true);
  assert.equal(first.state.currentBattle.drawsRemaining, 0);

  const moved = reduceGame(first.state, {
    type: 'MOVE_CARD_TO_CAMP',
    cardId: first.state.deck.hand[0].id,
  });
  const beforeRepeat = structuredClone(moved.state);
  const repeated = reduceGame(moved.state, { type: 'DRAW_CARDS' });
  assert.equal(repeated.ok, false);
  assert.equal(repeated.error.code, 'DRAW_LIMIT_REACHED');
  assert.deepEqual(repeated.state, beforeRepeat);
  assertOwnershipValid(repeated.state);
});

test('current saves preserve explicit draw budget while missing legacy markers fail closed', () => {
  const explicit = startConfiguration('explicit-current');
  explicit.currentBattle.drawsRemaining = 1;
  const normalizedExplicit = normalizeGameState(explicit);
  assert.equal(normalizedExplicit.currentBattle.drawsRemaining, 1);
  assertOwnershipValid(normalizedExplicit);

  const untouchedLegacy = startConfiguration('legacy-ambiguous-empty');
  delete untouchedLegacy.currentBattle.drawsRemaining;
  const untouchedBefore = ownershipSnapshot(untouchedLegacy);
  const normalizedUntouched = normalizeGameState(untouchedLegacy);
  assert.equal(normalizedUntouched.currentBattle.drawsRemaining, 0);
  assert.deepEqual(ownershipSnapshot(normalizedUntouched), untouchedBefore);
  assertOwnershipValid(normalizedUntouched);

  let consumedAndEmptied = startConfiguration('legacy-consumed-empty');
  consumedAndEmptied = reduceGame(consumedAndEmptied, { type: 'DRAW_CARDS' }).state;
  consumedAndEmptied = {
    ...consumedAndEmptied,
    deck: {
      ...consumedAndEmptied.deck,
      discardPile: [...consumedAndEmptied.deck.discardPile, ...consumedAndEmptied.deck.hand],
      hand: [],
      retained: [],
    },
  };
  delete consumedAndEmptied.currentBattle.drawsRemaining;
  const ambiguousBefore = ownershipSnapshot(consumedAndEmptied);
  const normalizedAmbiguous = normalizeGameState(consumedAndEmptied);
  assert.equal(normalizedAmbiguous.currentBattle.drawsRemaining, 0);
  assert.deepEqual(ownershipSnapshot(normalizedAmbiguous), ambiguousBefore);
  assertOwnershipValid(normalizedAmbiguous);
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
  assertOwnershipValid(game);
});

test('redeploy validates first-use targets, spends once and preserves canonical ownership', () => {
  let game = assembleTutorialZhangFei(startConfiguration('combat-move'));
  game = reduceGame(game, { type: 'START_PHASE' }).state;
  assertOwnershipValid(game);

  const fresh = structuredClone(game);
  const firstUseInvalidCases = [
    {
      order: { type: 'redeploy', unitId: 'missing', target: { column: 0, row: 0 } },
      code: 'MISSING_REDEPLOY_UNIT',
    },
    {
      order: { type: 'redeploy', unitId: 'unit-1', target: { column: -1, row: 0 } },
      code: 'ILLEGAL_REDEPLOY_TARGET',
    },
    {
      order: {
        type: 'redeploy',
        unitId: 'unit-1',
        target: { ...fresh.combat.board.units['unit-1'].cell },
      },
      code: 'ILLEGAL_REDEPLOY_TARGET',
    },
  ];

  for (const { order, code } of firstUseInvalidCases) {
    const before = structuredClone(fresh);
    const invalid = reduceGame(fresh, { type: 'ISSUE_ORDER', order });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.error.code, code);
    assert.deepEqual(invalid.state, before);
    assertOwnershipValid(invalid.state);
  }

  const occupied = structuredClone(fresh);
  const occupyingCard = occupied.deck.hand[0];
  occupied.deck.hand = occupied.deck.hand.slice(1);
  occupied.boardCards['2,2'] = occupyingCard.id;
  assertOwnershipValid(occupied);
  const occupiedAttempt = reduceGame(occupied, {
    type: 'ISSUE_ORDER',
    order: { type: 'redeploy', unitId: 'unit-1', target: { column: 2, row: 2 } },
  });
  assert.equal(occupiedAttempt.ok, false);
  assert.equal(occupiedAttempt.error.code, 'REDEPLOY_TARGET_OCCUPIED');
  assert.deepEqual(occupiedAttempt.state, occupied);

  const beforeOrders = fresh.combat.ordersRemaining;
  const beforeOwnership = ownershipSnapshot(fresh);
  const moved = reduceGame(fresh, {
    type: 'ISSUE_ORDER',
    order: { type: 'redeploy', unitId: 'unit-1', target: { column: 1, row: 1 } },
  });
  assert.equal(moved.ok, true);
  assert.deepEqual(moved.state.combat.board.units['unit-1'].cell, { column: 1, row: 1 });
  assert.equal(moved.state.combat.ordersRemaining, beforeOrders - 1);
  assert.deepEqual(ownershipSnapshot(moved.state), beforeOwnership);
  assertOwnershipValid(moved.state);

  const secondLegal = reduceGame(moved.state, {
    type: 'ISSUE_ORDER',
    order: { type: 'redeploy', unitId: 'unit-1', target: { column: 2, row: 1 } },
  });
  assert.equal(secondLegal.ok, false);
  assert.equal(secondLegal.error.code, 'REDEPLOY_ALREADY_USED');
  assert.equal(secondLegal.state.combat.ordersRemaining, beforeOrders - 1);
  assertOwnershipValid(secondLegal.state);

  const stepped = reduceGame(moved.state, { type: 'STEP_COMBAT' });
  assert.equal(stepped.ok, true);
  assertOwnershipValid(stepped.state);
});
