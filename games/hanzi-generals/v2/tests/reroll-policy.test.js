import test from 'node:test';
import assert from 'node:assert/strict';

import { createRng } from '../src/core/rng.js';
import { createDeckState, drawToHand } from '../src/deck/deck.js';
import {
  canReroll,
  rerollRetainedHand,
  setRetainedCards,
} from '../src/deck/reroll-policy.js';
import { createExpedition } from '../src/expedition/expedition.js';
import { reduceGame } from '../src/core/state-machine.js';

const SYMBOLS = ['黃', '忠', '趙', '雲', '關', '羽', '呂', '布', '弓', '兵', '盾', '兵'];

function card(id, symbol, locked = false) {
  return { id, symbol, locked };
}

function completeDeck(overrides = {}) {
  const cards = SYMBOLS.slice(0, 8).map((symbol, index) => card(`card-${index + 1}`, symbol));
  return {
    drawPile: cards.slice(5),
    discardPile: [],
    hand: cards.slice(0, 5),
    retained: [],
    deployed: [],
    freeRerollsRemaining: 1,
    nextCardId: 9,
    ...overrides,
  };
}

function allLooseCards(deck) {
  return [...deck.drawPile, ...deck.discardPile, ...deck.hand];
}

function assertUniqueLooseCardIds(deck) {
  const ids = allLooseCards(deck).map(({ id }) => id);
  assert.equal(new Set(ids).size, ids.length);
}

test('setRetainedCards accepts zero, one or two current hand cards', () => {
  const deck = completeDeck();
  assert.deepEqual(setRetainedCards(deck, []).retained, []);
  assert.deepEqual(setRetainedCards(deck, ['card-1']).retained, ['card-1']);
  assert.deepEqual(setRetainedCards(deck, ['card-1', 'card-2']).retained, ['card-1', 'card-2']);
});

test('setRetainedCards rejects over-limit, duplicate and missing ids', () => {
  const deck = completeDeck();
  assert.throws(() => setRetainedCards(deck, ['card-1', 'card-2', 'card-3']), /at most 2/i);
  assert.throws(() => setRetainedCards(deck, ['card-1', 'card-1']), /duplicate/i);
  assert.throws(() => setRetainedCards(deck, ['ghost-card']), /missing/i);
});

test('setRetainedCards is pure and normalizes legacy hand locks to false', () => {
  const deck = completeDeck({
    hand: [card('card-1', '黃', true), card('card-2', '忠', false)],
    drawPile: [card('card-3', '趙', true)],
  });
  const before = JSON.stringify(deck);
  const next = setRetainedCards(deck, ['card-1']);
  assert.equal(JSON.stringify(deck), before);
  assert.equal(next.hand.every(({ locked }) => locked === false), true);
  assert.equal(next.drawPile.every(({ locked }) => locked === false), true);
});

test('canReroll requires a hand and at least one remaining use', () => {
  assert.equal(canReroll(completeDeck()), true);
  assert.equal(canReroll(completeDeck({ freeRerollsRemaining: 0 })), false);
  assert.equal(canReroll(completeDeck({ hand: [] })), false);
});

test('rerollRetainedHand keeps only deck.retained cards and clears retained afterwards', () => {
  const deck = setRetainedCards(completeDeck(), ['card-1', 'card-2']);
  const result = rerollRetainedHand(deck, createRng(11), 5);
  assert.equal(result.deck.hand.length, 5);
  assert.equal(result.deck.hand.some(({ id }) => id === 'card-1'), true);
  assert.equal(result.deck.hand.some(({ id }) => id === 'card-2'), true);
  assert.equal(result.deck.freeRerollsRemaining, 0);
  assert.deepEqual(result.deck.retained, []);
  assert.equal(result.deck.hand.every(({ locked }) => locked === false), true);
  assertUniqueLooseCardIds(result.deck);
});

test('rerollRetainedHand discards non-retained cards before drawing', () => {
  const deck = setRetainedCards(completeDeck(), ['card-1']);
  const discardedIds = deck.hand.filter(({ id }) => id !== 'card-1').map(({ id }) => id);
  const result = rerollRetainedHand(deck, createRng(13), 5);
  assert.equal(discardedIds.every((id) => (
    result.deck.discardPile.some((card) => card.id === id)
    || result.deck.hand.some((card) => card.id === id)
  )), true);
});

test('rerollRetainedHand recycles discard when the draw pile is insufficient', () => {
  const cards = SYMBOLS.slice(0, 7).map((symbol, index) => card(`fixture-${index + 1}`, symbol));
  const deck = setRetainedCards({
    drawPile: cards.slice(5, 6),
    discardPile: cards.slice(6),
    hand: cards.slice(0, 5),
    retained: [],
    deployed: [],
    freeRerollsRemaining: 1,
    nextCardId: 8,
  }, ['fixture-1', 'fixture-2']);
  const result = rerollRetainedHand(deck, createRng(23), 5);
  assert.equal(result.deck.hand.length, 5);
  assertUniqueLooseCardIds(result.deck);
});

test('repeated rerolls consume exactly one use each', () => {
  let created = createDeckState(SYMBOLS, createRng(19));
  let drawn = drawToHand({ ...created.deck, freeRerollsRemaining: 2 }, 5, created.rng);
  let deck = setRetainedCards(drawn.deck, drawn.deck.hand.slice(0, 2).map(({ id }) => id));
  const first = rerollRetainedHand(deck, drawn.rng, 5);
  assert.equal(first.deck.freeRerollsRemaining, 1);

  deck = setRetainedCards(first.deck, [first.deck.hand[0].id]);
  const second = rerollRetainedHand(deck, first.rng, 5);
  assert.equal(second.deck.freeRerollsRemaining, 0);
  assert.throws(() => rerollRetainedHand(second.deck, second.rng, 5), /no free reroll/i);
});

test('reducer REROLL uses deck.retained and ignores legacy lockedCardIds payload', () => {
  let game = reduceGame(createExpedition('canonical-reroll-reducer'), { type: 'START_BATTLE' }).state;
  game = reduceGame(game, { type: 'DRAW_CARDS' }).state;
  const retainedId = game.deck.hand[0].id;
  const legacyPayloadId = game.deck.hand[1].id;
  game = reduceGame(game, { type: 'RETAIN_CARDS', cardIds: [retainedId] }).state;

  const result = reduceGame(game, { type: 'REROLL', lockedCardIds: [legacyPayloadId] });
  assert.equal(result.ok, true);
  assert.equal(result.state.deck.hand.some(({ id }) => id === retainedId), true);
  assert.deepEqual(result.state.deck.retained, []);
});

test('reroll policy never mutates the original deck', () => {
  const deck = setRetainedCards(completeDeck(), ['card-1']);
  const before = JSON.stringify(deck);
  rerollRetainedHand(deck, createRng(29), 5);
  assert.equal(JSON.stringify(deck), before);
});
