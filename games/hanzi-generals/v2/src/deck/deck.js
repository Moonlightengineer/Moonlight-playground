import { shuffle } from '../core/rng.js';

function cloneCard(card) {
  return { ...card };
}

function cloneDeck(deck) {
  return {
    ...deck,
    drawPile: deck.drawPile.map(cloneCard),
    discardPile: deck.discardPile.map(cloneCard),
    hand: deck.hand.map(cloneCard),
    retained: [...deck.retained],
    deployed: deck.deployed.map((item) => ({ ...item, cardIds: [...item.cardIds] })),
  };
}

export function createDeckState(symbols, rng) {
  const cards = symbols.map((symbol, index) => ({
    id: `card-${index + 1}`,
    symbol,
    locked: false,
  }));
  const shuffled = shuffle(rng, cards);
  return {
    deck: {
      drawPile: shuffled.items,
      discardPile: [],
      hand: [],
      retained: [],
      deployed: [],
      freeRerollsRemaining: 1,
      nextCardId: cards.length + 1,
    },
    rng: shuffled.rng,
  };
}

function recycle(deck, rng) {
  if (deck.drawPile.length || !deck.discardPile.length) return { deck, rng };
  const shuffled = shuffle(rng, deck.discardPile.map((card) => ({ ...card, locked: false })));
  return {
    deck: { ...deck, drawPile: shuffled.items, discardPile: [] },
    rng: shuffled.rng,
  };
}

export function drawToHand(deck, handSize, rng) {
  let next = cloneDeck(deck);
  let current = rng;
  while (next.hand.length < handSize) {
    const recycled = recycle(next, current);
    next = cloneDeck(recycled.deck);
    current = recycled.rng;
    if (!next.drawPile.length) break;
    next.hand.push(next.drawPile.shift());
  }
  return { deck: next, rng: current };
}

export function discardCard(deck, cardId) {
  const card = deck.hand.find((item) => item.id === cardId);
  if (!card) throw new Error('missing card');
  return {
    ...cloneDeck(deck),
    hand: deck.hand.filter((item) => item.id !== cardId).map(cloneCard),
    retained: deck.retained.filter((id) => id !== cardId),
    discardPile: [...deck.discardPile.map(cloneCard), { ...card, locked: false }],
  };
}

export function lockCard(deck, cardId) {
  if (!deck.hand.some((card) => card.id === cardId)) throw new Error('missing card');
  return {
    ...cloneDeck(deck),
    hand: deck.hand.map((card) => ({ ...card, locked: card.id === cardId ? true : card.locked })),
  };
}

export function unlockAllCards(deck) {
  return {
    ...cloneDeck(deck),
    hand: deck.hand.map((card) => ({ ...card, locked: false })),
  };
}

export function addSymbols(deck, symbols) {
  const start = deck.nextCardId ?? 1;
  const added = symbols.map((symbol, index) => ({
    id: `card-${start + index}`,
    symbol,
    locked: false,
  }));
  return {
    ...cloneDeck(deck),
    discardPile: [...deck.discardPile.map(cloneCard), ...added],
    nextCardId: start + added.length,
  };
}

export function allDeckCards(deck) {
  return [
    ...deck.drawPile,
    ...deck.discardPile,
    ...deck.hand,
  ];
}
