import { listCells } from '../../board/board.js';

function addZone(index, cardId, zone) {
  if (typeof cardId !== 'string' || !cardId) return;
  if (!index.has(cardId)) index.set(cardId, []);
  const zones = index.get(cardId);
  if (!zones.includes(zone)) zones.push(zone);
}

export function selectCardZoneIndex(game) {
  const index = new Map();
  const deck = game?.deck ?? {};
  const objectZones = [
    ['drawPile', deck.drawPile],
    ['discardPile', deck.discardPile],
    ['hand', deck.hand],
  ];
  for (const [zone, cards] of objectZones) {
    for (const card of Array.isArray(cards) ? cards : []) addZone(index, card?.id, zone);
  }
  for (const cardId of Array.isArray(game?.camp?.cardIds) ? game.camp.cardIds : []) {
    addZone(index, cardId, 'camp');
  }
  for (const cardId of Object.values(game?.boardCards ?? {})) addZone(index, cardId, 'board');
  for (const record of Array.isArray(deck.deployed) ? deck.deployed : []) {
    for (const cardId of Array.isArray(record?.cardIds) ? record.cardIds : []) {
      addZone(index, cardId, 'deployed');
    }
  }
  return index;
}

export function selectCampState(game) {
  const cardIds = Array.isArray(game?.camp?.cardIds) ? [...game.camp.cardIds] : [];
  const capacity = Number.isInteger(game?.camp?.capacity) && game.camp.capacity >= 0
    ? game.camp.capacity
    : 0;
  const count = cardIds.length;
  return {
    cardIds,
    capacity,
    count,
    availableSlots: Math.max(0, capacity - count),
    isFull: count >= capacity,
  };
}

export function selectRerollState(game) {
  const remaining = Number.isInteger(game?.deck?.freeRerollsRemaining)
    ? Math.max(0, game.deck.freeRerollsRemaining)
    : 0;
  const retainedIds = Array.isArray(game?.deck?.retained) ? [...game.deck.retained] : [];
  const handCount = Array.isArray(game?.deck?.hand) ? game.deck.hand.length : 0;
  return {
    available: game?.status === 'configuration' && remaining > 0 && handCount > 0,
    remaining,
    retainedIds,
    retainLimit: 2,
  };
}

export function selectAssemblyTargets(game) {
  if (game?.status !== 'configuration' || !game.board) return [];
  const occupied = new Set();
  for (const unit of Object.values(game.board.units ?? {})) {
    if (Number.isInteger(unit?.cell?.column) && Number.isInteger(unit?.cell?.row)) {
      occupied.add(`${unit.cell.column},${unit.cell.row}`);
    }
  }
  for (const cell of Object.keys(game.boardCards ?? {})) occupied.add(cell);
  return listCells(game.board).filter(({ column, row }) => !occupied.has(`${column},${row}`));
}
