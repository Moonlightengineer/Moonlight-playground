import { drawToHand } from './deck.js';

function cloneCard(card) {
  return { ...card, locked: false };
}

function cloneDeck(deck) {
  return {
    ...deck,
    drawPile: (deck.drawPile ?? []).map(cloneCard),
    discardPile: (deck.discardPile ?? []).map(cloneCard),
    hand: (deck.hand ?? []).map(cloneCard),
    retained: [...(deck.retained ?? [])],
    deployed: (deck.deployed ?? []).map((item) => ({
      ...item,
      cardIds: [...(item.cardIds ?? [])],
    })),
  };
}

function validateRetainedIds(deck, cardIds) {
  if (!Array.isArray(cardIds)) throw new Error('retained card ids must be an array');
  if (cardIds.length > 2) throw new Error('retain at most 2 cards');
  if (new Set(cardIds).size !== cardIds.length) throw new Error('duplicate retained card');
  const handIds = new Set((deck.hand ?? []).map(({ id }) => id));
  if (cardIds.some((id) => !handIds.has(id))) throw new Error('cannot retain missing card');
}

export function setRetainedCards(deck, cardIds) {
  validateRetainedIds(deck, cardIds);
  return {
    ...cloneDeck(deck),
    retained: [...cardIds],
  };
}

export function canReroll(deck) {
  return Number.isInteger(deck?.freeRerollsRemaining)
    && deck.freeRerollsRemaining > 0
    && Array.isArray(deck.hand)
    && deck.hand.length > 0;
}

export function rerollRetainedHand(deck, rng, handSize = 5) {
  if (!canReroll(deck)) throw new Error('no free reroll remaining');
  if (!Number.isInteger(handSize) || handSize < 1) throw new Error('hand size must be a positive integer');

  const normalized = setRetainedCards(deck, deck.retained ?? []);
  const retainedIds = new Set(normalized.retained);
  const keep = normalized.hand.filter(({ id }) => retainedIds.has(id)).map(cloneCard);
  const discard = normalized.hand.filter(({ id }) => !retainedIds.has(id)).map(cloneCard);
  const prepared = {
    ...normalized,
    hand: keep,
    retained: [...normalized.retained],
    discardPile: [...normalized.discardPile.map(cloneCard), ...discard],
    freeRerollsRemaining: normalized.freeRerollsRemaining - 1,
  };
  const result = drawToHand(prepared, handSize, rng);
  return {
    deck: {
      ...result.deck,
      drawPile: result.deck.drawPile.map(cloneCard),
      discardPile: result.deck.discardPile.map(cloneCard),
      hand: result.deck.hand.map(cloneCard),
      retained: [...normalized.retained],
    },
    rng: result.rng,
  };
}
