import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/core/rng.js';
import {
  createDeckState,
  discardCard,
  drawToHand,
  lockCard,
  rerollHand,
  retainCards,
  unlockAllCards,
} from '../src/deck/deck.js';

const symbols = ['黃', '忠', '趙', '雲', '關', '羽', '呂', '布', '弓', '兵', '盾', '兵'];

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
