import { collectCardZones } from '../card-invariants.js';
import { listCells } from '../../board/board.js';

export function selectCardZoneIndex(game) {
  const index = new Map();
  for (const { zone, cardId } of collectCardZones(game)) {
    if (!index.has(cardId)) index.set(cardId, []);
    const zones = index.get(cardId);
    if (!zones.includes(zone)) zones.push(zone);
  }
  return index;
}

export function selectDeckZoneCounts(game) {
  const counts = {
    drawPile: 0,
    discardPile: 0,
    hand: 0,
    camp: 0,
    deployed: 0,
  };
  for (const { zone } of collectCardZones(game)) {
    if (zone === 'board' || zone === 'deployed') counts.deployed += 1;
    else if (Object.prototype.hasOwnProperty.call(counts, zone)) counts[zone] += 1;
  }
  const total = game?.cardsById && typeof game.cardsById === 'object'
    ? Object.keys(game.cardsById).length
    : 0;
  const ownedTotal = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return {
    ...counts,
    total,
    ownedTotal,
    reconciled: ownedTotal === total,
  };
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
