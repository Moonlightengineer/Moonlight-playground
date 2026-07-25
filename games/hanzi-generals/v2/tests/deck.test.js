import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/core/rng.js';
import {
  allDeckCards,
  createDeckState,
  discardCard,
  drawToHand,
  lockCard,
  rerollHand,
  retainCards,
  unlockAllCards,
} from '../src/deck/deck.js';

const symbols = ['黃', '忠', '趙', '雲', '關', '羽', '呂', '布', '弓', '兵', '盾', '兵'];

function assertUniqueCardIds(deck) {
  const ids = allDeckCards(deck).map(({ id }) => id);
  assert.equal(new Set(ids).size, ids.length);
}

test('draws to five and retains at most two', () => {
  let rng = createRng(7);
  let result = createDeckState(symbols, rng);
  rng = result.rng;
  result = drawToHand(result.deck, 5, rng);
  assert.equal(result.deck.hand.length, 5);
  assert.throws(
    () => retainCards(result.deck, result.deck.hand.slice(0, 3).map((card) => card.id)),
    /at most 2/,
  );
  const retained = retainCards(result.deck, result.deck.hand.slice(0, 2).map((card) => card.id));
  assert.equal(retained.retained.length, 2);
});

test('one free reroll moves unlocked cards to discard', () => {
  let rng = createRng(9);
  let result = createDeckState(symbols, rng);
  rng = result.rng;
  result = drawToHand(result.deck, 5, rng);
  rng = result.rng;
  const locked = [result.deck.hand[0].id];
  const rerolled = rerollHand(result.deck, locked, rng);
  assert.equal(rerolled.deck.freeRerollsRemaining, 0);
  assert.equal(rerolled.deck.hand.some((card) => card.id === locked[0]), true);
  assert.equal(rerolled.deck.discardPile.length, 4);
  assert.throws(() => rerollHand(rerolled.deck, [], rerolled.rng), /no free reroll/);
});

test('repeated rerolls decrement one use at a time and refill a complete hand', () => {
  let result = createDeckState(symbols, createRng(19));
  result = drawToHand({ ...result.deck, freeRerollsRemaining: 2 }, 5, result.rng);

  const retainedFirst = result.deck.hand.slice(0, 2).map(({ id }) => id);
  const first = rerollHand(result.deck, retainedFirst, result.rng);
  assert.equal(first.deck.freeRerollsRemaining, 1);
  assert.equal(first.deck.hand.length, 5);
  assert.deepEqual(
    retainedFirst.every((id) => first.deck.hand.some((card) => card.id === id)),
    true,
  );
  assertUniqueCardIds(first.deck);

  const retainedSecond = [first.deck.hand[0].id];
  const second = rerollHand(first.deck, retainedSecond, first.rng);
  assert.equal(second.deck.freeRerollsRemaining, 0);
  assert.equal(second.deck.hand.length, 5);
  assert.equal(second.deck.hand.some((card) => card.id === retainedSecond[0]), true);
  assertUniqueCardIds(second.deck);
  assert.throws(() => rerollHand(second.deck, [], second.rng), /no free reroll/);
});

test('reroll reshuffles discard when draw pile cannot refill the hand', () => {
  const cards = symbols.slice(0, 7).map((symbol, index) => ({
    id: `fixture-${index + 1}`,
    symbol,
    locked: false,
  }));
  const deck = {
    drawPile: cards.slice(5, 6),
    discardPile: cards.slice(6),
    hand: cards.slice(0, 5),
    retained: [],
    deployed: [],
    freeRerollsRemaining: 1,
    nextCardId: 8,
  };

  const rerolled = rerollHand(deck, [cards[0].id, cards[1].id], createRng(23));
  assert.equal(rerolled.deck.hand.length, 5);
  assert.equal(rerolled.deck.freeRerollsRemaining, 0);
  assertUniqueCardIds(rerolled.deck);
});

test('lock, unlock and discard preserve card identity', () => {
  let result = createDeckState(symbols, createRng(3));
  result = drawToHand(result.deck, 5, result.rng);
  const card = result.deck.hand[0];
  const locked = lockCard(result.deck, card.id);
  assert.equal(locked.hand.find(({ id }) => id === card.id).locked, true);
  const unlocked = unlockAllCards(locked);
  assert.equal(unlocked.hand.every(({ locked: value }) => value === false), true);
  const discarded = discardCard(unlocked, card.id);
  assert.equal(discarded.hand.some(({ id }) => id === card.id), false);
  assert.equal(discarded.discardPile.at(-1).id, card.id);
});
