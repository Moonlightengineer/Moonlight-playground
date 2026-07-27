/**
 * Canonical card ownership invariants for the v2 engine.
 *
 * Ownership model discovered from `deck/deck.js`, `deck/assembly.js` and
 * `expedition/expedition.js`:
 *
 * - `game.cardsById` is the canonical card registry (id -> card object).
 * - Owner zones hold exclusive, physical ownership of a card and are
 *   mutually exclusive: `deck.drawPile`, `deck.discardPile`, `deck.hand`,
 *   `camp.cardIds`, `boardCards` (single cards placed pre-assembly) and
 *   `deck.deployed[].cardIds` (cards sealed into an assembled unit).
 *   `boardCards` and `deck.deployed` are distinct owner zones, not two
 *   references to the same ownership: `confirmAssembly` removes a card's
 *   id from `boardCards` in the same transition that adds it to
 *   `deck.deployed`, so a card is never in both at once.
 * - `deck.retained` and `selection.cardIds` are reference-only zones: they
 *   point at ids that must already live in an owner zone (hand, or hand/camp
 *   for selection) rather than owning cards themselves.
 */

const OWNER_ZONES = Object.freeze(['drawPile', 'discardPile', 'hand', 'camp', 'board', 'deployed']);

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function collectArrayOfCardsZone(container, zone, errors) {
  const entries = [];
  if (container === undefined) return entries;
  if (!Array.isArray(container)) {
    errors.push({ code: 'MALFORMED_ZONE', zone, message: `Zone "${zone}" must be an array.` });
    return entries;
  }
  container.forEach((card, index) => {
    if (!isPlainObject(card) || !isNonEmptyString(card.id)) {
      errors.push({
        code: 'MALFORMED_CARD_ENTRY',
        zone,
        message: `Zone "${zone}" has a malformed card entry at index ${index}.`,
      });
      return;
    }
    entries.push({ zone, cardId: card.id });
  });
  return entries;
}

function collectArrayOfIdsZone(container, zone, errors) {
  const entries = [];
  if (container === undefined) return entries;
  if (!Array.isArray(container)) {
    errors.push({ code: 'MALFORMED_ZONE', zone, message: `Zone "${zone}" must be an array.` });
    return entries;
  }
  container.forEach((cardId, index) => {
    if (!isNonEmptyString(cardId)) {
      errors.push({
        code: 'MALFORMED_CARD_ENTRY',
        zone,
        message: `Zone "${zone}" has a malformed card id at index ${index}.`,
      });
      return;
    }
    entries.push({ zone, cardId });
  });
  return entries;
}

function collectBoardZone(boardCards, errors) {
  const zone = 'board';
  const entries = [];
  if (boardCards === undefined) return entries;
  if (!isPlainObject(boardCards)) {
    errors.push({ code: 'MALFORMED_ZONE', zone, message: 'Zone "board" must be an object keyed by cell.' });
    return entries;
  }
  for (const [cell, cardId] of Object.entries(boardCards)) {
    if (!isNonEmptyString(cardId)) {
      errors.push({
        code: 'MALFORMED_CARD_ENTRY',
        zone,
        message: `Zone "board" has a malformed card id at cell ${cell}.`,
      });
      continue;
    }
    entries.push({ zone, cardId });
  }
  return entries;
}

function collectDeployedZone(deployed, errors) {
  const zone = 'deployed';
  const entries = [];
  if (deployed === undefined) return entries;
  if (!Array.isArray(deployed)) {
    errors.push({ code: 'MALFORMED_ZONE', zone, message: 'Zone "deployed" must be an array.' });
    return entries;
  }
  deployed.forEach((record, index) => {
    if (!isPlainObject(record) || !Array.isArray(record.cardIds)) {
      errors.push({
        code: 'MALFORMED_CARD_ENTRY',
        zone,
        message: `Zone "deployed" has a malformed record at index ${index}.`,
      });
      return;
    }
    record.cardIds.forEach((cardId) => {
      if (!isNonEmptyString(cardId)) {
        errors.push({
          code: 'MALFORMED_CARD_ENTRY',
          zone,
          message: `Zone "deployed" record ${index} has a malformed card id.`,
        });
        return;
      }
      entries.push({ zone, cardId });
    });
  });
  return entries;
}

function collectZoneEntries(game) {
  const errors = [];
  let entries = [];

  if (game.deck === undefined) {
    errors.push({ code: 'MALFORMED_ZONE', zone: 'deck', message: 'game.deck is required.' });
  } else if (!isPlainObject(game.deck)) {
    errors.push({ code: 'MALFORMED_ZONE', zone: 'deck', message: 'game.deck must be an object.' });
  } else {
    entries = entries.concat(
      collectArrayOfCardsZone(game.deck.drawPile, 'drawPile', errors),
      collectArrayOfCardsZone(game.deck.discardPile, 'discardPile', errors),
      collectArrayOfCardsZone(game.deck.hand, 'hand', errors),
    );
  }

  if (game.camp === undefined) {
    errors.push({ code: 'MALFORMED_ZONE', zone: 'camp', message: 'game.camp is required.' });
  } else if (!isPlainObject(game.camp)) {
    errors.push({ code: 'MALFORMED_ZONE', zone: 'camp', message: 'game.camp must be an object.' });
  } else {
    entries = entries.concat(collectArrayOfIdsZone(game.camp.cardIds, 'camp', errors));
  }

  entries = entries.concat(collectBoardZone(game.boardCards, errors));

  if (isPlainObject(game.deck)) {
    entries = entries.concat(collectDeployedZone(game.deck.deployed, errors));
  }

  return { entries, errors };
}

function collectReferenceIssues(game, handIds, campIds, errors) {
  const retained = game.deck?.retained;
  if (retained !== undefined) {
    if (!Array.isArray(retained)) {
      errors.push({ code: 'MALFORMED_ZONE', zone: 'retained', message: 'game.deck.retained must be an array.' });
    } else {
      retained.forEach((cardId) => {
        if (!isNonEmptyString(cardId)) {
          errors.push({
            code: 'MALFORMED_CARD_ENTRY',
            zone: 'retained',
            message: 'game.deck.retained has a malformed card id.',
          });
          return;
        }
        if (!handIds.has(cardId)) {
          errors.push({
            code: 'ORPHANED_REFERENCE',
            cardId,
            zone: 'retained',
            ownerZones: ['hand'],
            message: `Retained card ${cardId} is not present in hand.`,
          });
        }
      });
    }
  }

  const { selection } = game;
  if (selection !== undefined && selection !== null) {
    if (!isPlainObject(selection) || !Array.isArray(selection.cardIds)) {
      errors.push({ code: 'MALFORMED_ZONE', zone: 'selection', message: 'game.selection.cardIds must be an array.' });
    } else {
      selection.cardIds.forEach((cardId) => {
        if (!isNonEmptyString(cardId)) {
          errors.push({
            code: 'MALFORMED_CARD_ENTRY',
            zone: 'selection',
            message: 'game.selection.cardIds has a malformed card id.',
          });
          return;
        }
        if (!handIds.has(cardId) && !campIds.has(cardId)) {
          errors.push({
            code: 'ORPHANED_REFERENCE',
            cardId,
            zone: 'selection',
            ownerZones: ['hand', 'camp'],
            message: `Selected card ${cardId} is not present in hand or camp.`,
          });
        }
      });
    }
  }
}

/**
 * Normalize the current game state into a flat, ordered list of owner-zone
 * card records: `{ zone, cardId }`. Reference-only zones (`retained`,
 * `selection`) are intentionally excluded — they point at owner-zone ids
 * rather than owning cards. Best-effort and defensive: malformed input
 * yields fewer records rather than throwing. Does not mutate `game`.
 *
 * @param {object} game
 * @returns {{ zone: string, cardId: string }[]}
 */
export function collectCardZones(game) {
  if (!isPlainObject(game)) return [];
  return collectZoneEntries(game).entries;
}

/**
 * Validate that every card referenced by the game state has exactly one
 * owner zone, that every referenced id is known to `game.cardsById`, and
 * that reference-only zones (`retained`, `selection`) only point at ids
 * currently held by their expected owner zone(s). Pure: never mutates
 * `game`. Never throws — malformed input produces structured errors.
 *
 * @param {object} game
 * @returns {{ valid: boolean, errors: Array<object> }}
 */
export function validateCardOwnership(game) {
  if (!isPlainObject(game)) {
    return { valid: false, errors: [{ code: 'MALFORMED_STATE', message: 'Game state must be an object.' }] };
  }

  const errors = [];
  const registryOk = isPlainObject(game.cardsById);
  if (!registryOk) {
    errors.push({ code: 'MALFORMED_CARD_REGISTRY', message: 'game.cardsById must be an object.' });
  }

  const { entries, errors: zoneErrors } = collectZoneEntries(game);
  errors.push(...zoneErrors);

  const perZoneCounts = new Map();
  const zonesByCardId = new Map();

  for (const { zone, cardId } of entries) {
    if (!perZoneCounts.has(zone)) perZoneCounts.set(zone, new Map());
    const zoneMap = perZoneCounts.get(zone);
    zoneMap.set(cardId, (zoneMap.get(cardId) ?? 0) + 1);

    if (!zonesByCardId.has(cardId)) zonesByCardId.set(cardId, new Set());
    zonesByCardId.get(cardId).add(zone);
  }

  for (const [zone, zoneMap] of perZoneCounts) {
    for (const [cardId, count] of zoneMap) {
      if (count > 1) errors.push({ code: 'DUPLICATE_CARD_IN_ZONE', cardId, zone, count });
    }
  }

  for (const [cardId, zones] of zonesByCardId) {
    if (zones.size > 1) errors.push({ code: 'DUPLICATE_CARD_OWNERSHIP', cardId, zones: [...zones] });
  }

  if (registryOk) {
    for (const [cardId, zones] of zonesByCardId) {
      if (!Object.prototype.hasOwnProperty.call(game.cardsById, cardId)) {
        errors.push({ code: 'UNKNOWN_CARD_ID', cardId, zones: [...zones] });
      }
    }
  }

  const handIds = new Set(entries.filter((entry) => entry.zone === 'hand').map((entry) => entry.cardId));
  const campIds = new Set(entries.filter((entry) => entry.zone === 'camp').map((entry) => entry.cardId));
  collectReferenceIssues(game, handIds, campIds, errors);

  return { valid: errors.length === 0, errors };
}

function formatOwnershipError(error) {
  const parts = [error.code];
  if (error.cardId) parts.push(`card=${error.cardId}`);
  if (error.zone) parts.push(`zone=${error.zone}`);
  if (error.zones) parts.push(`zones=[${error.zones.join(', ')}]`);
  if (error.count) parts.push(`count=${error.count}`);
  if (error.message) parts.push(error.message);
  return parts.join(' ');
}

/**
 * Throw a readable, developer-facing error when `game` violates any card
 * ownership invariant. No-op when valid. The thrown error carries the
 * structured `errors` array from {@link validateCardOwnership} as
 * `error.errors` for programmatic inspection.
 *
 * @param {object} game
 * @returns {void}
 */
export function assertCardOwnership(game) {
  const result = validateCardOwnership(game);
  if (result.valid) return;
  const lines = result.errors.map(formatOwnershipError);
  const error = new Error(`Card ownership invariant violated:\n${lines.join('\n')}`);
  error.name = 'CardOwnershipError';
  error.errors = result.errors;
  throw error;
}

export { OWNER_ZONES };
