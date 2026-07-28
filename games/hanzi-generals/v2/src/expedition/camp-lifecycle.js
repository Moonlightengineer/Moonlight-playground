import { gameEvent } from '../core/events.js';

function success(state, events = []) {
  return { ok: true, state, events };
}

function failure(game, code, message) {
  return { ok: false, state: game, events: [], error: { code, message } };
}

function cloneCard(card) {
  return { ...card, locked: false };
}

export function campCapacity(game) {
  return Number.isInteger(game?.camp?.capacity) && game.camp.capacity >= 0
    ? game.camp.capacity
    : 0;
}

export function moveHandCardToCamp(game, cardId) {
  if ((game.camp?.cardIds?.length ?? 0) >= campCapacity(game)) {
    return failure(game, 'CAMP_FULL', '軍營已滿。');
  }
  if (!game.deck?.hand?.some((card) => card.id === cardId)) {
    return failure(game, 'MISSING_CARD', '手牌已改變。');
  }
  return success({
    ...game,
    camp: { ...game.camp, cardIds: [...game.camp.cardIds, cardId] },
    deck: {
      ...game.deck,
      hand: game.deck.hand.filter((card) => card.id !== cardId),
      retained: (game.deck.retained ?? []).filter((id) => id !== cardId),
    },
  }, [gameEvent('CARD_MOVED_TO_CAMP', { cardId })]);
}

export function returnCampCardToHand(game, cardId) {
  if (!game.camp?.cardIds?.includes(cardId)) {
    return failure(game, 'MISSING_CAMP_CARD', '軍營內冇呢張字牌。');
  }
  const card = game.cardsById?.[cardId];
  if (!card) return failure(game, 'MISSING_CARD', '字牌資料遺失。');
  return success({
    ...game,
    camp: { ...game.camp, cardIds: game.camp.cardIds.filter((id) => id !== cardId) },
    deck: {
      ...game.deck,
      hand: [...game.deck.hand, cloneCard(card)],
    },
  }, [gameEvent('CARD_RETURNED_FROM_CAMP', { cardId })]);
}

function filterCards(cards, preservedIds) {
  return (cards ?? []).filter(({ id }) => !preservedIds.has(id));
}

export function preserveCampAcrossTransition(before, after) {
  const cardIds = [...(before.camp?.cardIds ?? [])];
  const preservedIds = new Set(cardIds);
  const boardCards = Object.fromEntries(
    Object.entries(after.boardCards ?? {}).filter(([, cardId]) => !preservedIds.has(cardId)),
  );
  return {
    ...after,
    camp: {
      capacity: campCapacity(before),
      cardIds,
    },
    boardCards,
    deck: {
      ...after.deck,
      drawPile: filterCards(after.deck?.drawPile, preservedIds),
      discardPile: filterCards(after.deck?.discardPile, preservedIds),
      hand: filterCards(after.deck?.hand, preservedIds),
      retained: (after.deck?.retained ?? []).filter((id) => !preservedIds.has(id)),
    },
    selection: {
      cardIds: (after.selection?.cardIds ?? []).filter((id) => !preservedIds.has(id)),
    },
  };
}

export function increaseCampCapacity(game, amount = 1) {
  if (!Number.isInteger(amount) || amount < 0) throw new Error('camp capacity increase must be a non-negative integer');
  return {
    ...game,
    camp: {
      ...game.camp,
      capacity: campCapacity(game) + amount,
      cardIds: [...(game.camp?.cardIds ?? [])],
    },
  };
}

export function normalizeLegacyCampBonus(game) {
  const pending = Number.isInteger(game?.temporary?.extraCamp) && game.temporary.extraCamp > 0
    ? game.temporary.extraCamp
    : 0;
  if (!pending) return game;
  const increased = increaseCampCapacity(game, pending);
  return {
    ...increased,
    temporary: { ...increased.temporary, extraCamp: 0 },
  };
}
