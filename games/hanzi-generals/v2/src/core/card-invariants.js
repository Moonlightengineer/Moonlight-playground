/**
 * Canonical card ownership invariants for the v2 engine.
 *
 * Ownership model discovered from `deck/deck.js`, `deck/assembly.js`,
 * `board/board.js` and `expedition/expedition.js`:
 *
 * - `game.cardsById` is the canonical card registry (id -> card object).
 *   Every registry entry must be an object whose `id` matches its own key
 *   and which carries a usable `symbol`, and every registry card must have
 *   exactly one owner zone (zero owners is as invalid as two).
 * - Owner zones hold exclusive, physical ownership of a card and are
 *   mutually exclusive: `deck.drawPile`, `deck.discardPile`, `deck.hand`,
 *   `camp.cardIds`, `boardCards` (single cards placed pre-assembly) and
 *   `deck.deployed[].cardIds` (cards sealed into an assembled unit).
 *   `boardCards` and `deck.deployed` are distinct owner zones, not two
 *   references to the same ownership: `confirmAssembly` removes a card's
 *   id from `boardCards` in the same transition that adds it to
 *   `deck.deployed`, so a card is never in both at once.
 * - `boardCards` keys must parse as `"column,row"` and, when `game.board`
 *   carries a usable size, fall inside its current bounds. `deck.deployed`
 *   records must carry a unique `unitId` that exists in `game.board.units`
 *   — a deployed card is only truly owned while its unit is still on the
 *   board.
 * - `deck.retained` and `selection.cardIds` are reference-only zones: they
 *   point at ids that must already live in an owner zone (hand, or hand/camp
 *   for selection) rather than owning cards themselves. Duplicate ids
 *   within either reference zone are invalid, same as for an owner zone.
 *   `deck.retained` is a required array — `deck.js`'s `cloneDeck()` spreads
 *   it unconditionally (`[...deck.retained]`) on every draw/reroll/discard,
 *   so a missing or mistyped `retained` would otherwise pass validation and
 *   then throw a `TypeError` on the very next deck operation. `selection`,
 *   by contrast, is genuinely optional: every real read of it in
 *   `state-machine-base.js`/`ui/render*.js` goes through
 *   `game.selection?.cardIds ?? []`, so `undefined`/`null` are legitimate
 *   and only a present-but-wrong-shaped `selection` is malformed.
 *
 * All owner-zone containers (`deck.drawPile`, `deck.discardPile`,
 * `deck.hand`, `deck.deployed`, `camp.cardIds`, `boardCards`) and
 * `game.board` (with a positive-integer `size` and an object `units`) are
 * required fields of a well-formed state — a missing or mistyped field is a
 * `MALFORMED_ZONE`/`MALFORMED_BOARD` error, never a silently-valid empty
 * default. Card objects held in `drawPile`/`discardPile`/`hand` are also
 * cross-checked against the registry's `symbol` for the same id, so a card
 * cannot silently change identity while it sits in a zone. Every entry in
 * `game.board.units` is validated too: it must be an object whose own `id`
 * matches its key and whose `cell` is an in-bounds integer coordinate, and
 * no two units may share a cell — a `deck.deployed` record is only a real
 * owner while the unit it names is actually usable on the board.
 */

const OWNER_ZONES = Object.freeze(['drawPile', 'discardPile', 'hand', 'camp', 'board', 'deployed']);

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function parseBoardCellKey(key) {
  const match = /^(\d+),(\d+)$/.exec(key);
  if (!match) return null;
  return { column: Number(match[1]), row: Number(match[2]) };
}

function isCellWithinBoard(board, cell) {
  if (!isPlainObject(board) || !isPlainObject(board.size)) return true;
  const { columns, rows } = board.size;
  if (!Number.isInteger(columns) || !Number.isInteger(rows)) return true;
  return cell.column >= 0 && cell.row >= 0 && cell.column < columns && cell.row < rows;
}

function validateBoardShape(board, errors) {
  if (!isPlainObject(board)) {
    errors.push({ code: 'MALFORMED_BOARD', message: 'game.board must be an object.' });
    return;
  }
  const { size } = board;
  const sizeOk = isPlainObject(size)
    && Number.isInteger(size.columns) && size.columns > 0
    && Number.isInteger(size.rows) && size.rows > 0;
  if (!sizeOk) {
    errors.push({ code: 'MALFORMED_BOARD', message: 'game.board.size must have positive integer columns and rows.' });
  }
  if (!isPlainObject(board.units)) {
    errors.push({ code: 'MALFORMED_BOARD', message: 'game.board.units must be an object.' });
  }
}

function isValidIntegerCell(board, cell) {
  if (!isPlainObject(cell) || !Number.isInteger(cell.column) || !Number.isInteger(cell.row)) return false;
  return isCellWithinBoard(board, cell);
}

function validateBoardUnits(board, errors) {
  if (!isPlainObject(board) || !isPlainObject(board.units)) return;
  const cellOwners = new Map();
  for (const [unitId, unit] of Object.entries(board.units)) {
    if (!isPlainObject(unit)) {
      errors.push({
        code: 'MALFORMED_BOARD_UNIT',
        unitId,
        message: `board.units["${unitId}"] must be an object.`,
      });
      continue;
    }
    if (unit.id !== unitId) {
      errors.push({
        code: 'MALFORMED_BOARD_UNIT',
        unitId,
        message: `board.units["${unitId}"] has a mismatched id "${unit.id}".`,
      });
    }
    if (!isValidIntegerCell(board, unit.cell)) {
      errors.push({
        code: 'MALFORMED_BOARD_UNIT',
        unitId,
        message: `board.units["${unitId}"] has a missing or out-of-bounds cell.`,
      });
      continue;
    }
    const cellKey = `${unit.cell.column},${unit.cell.row}`;
    if (cellOwners.has(cellKey)) {
      errors.push({
        code: 'DUPLICATE_BOARD_UNIT_CELL',
        cell: cellKey,
        unitIds: [cellOwners.get(cellKey), unitId],
        message: `Board cell "${cellKey}" is occupied by more than one unit.`,
      });
    } else {
      cellOwners.set(cellKey, unitId);
    }
  }
}

function collectArrayOfCardsZone(container, zone, registry, errors) {
  const entries = [];
  if (!Array.isArray(container)) {
    errors.push({ code: 'MALFORMED_ZONE', zone, message: `Zone "${zone}" must be an array.` });
    return entries;
  }
  container.forEach((card, index) => {
    if (!isPlainObject(card) || !isNonEmptyString(card.id) || !isNonEmptyString(card.symbol)) {
      errors.push({
        code: 'MALFORMED_CARD_ENTRY',
        zone,
        message: `Zone "${zone}" has a malformed card entry at index ${index}.`,
      });
      return;
    }
    entries.push({ zone, cardId: card.id });
    if (registry && Object.prototype.hasOwnProperty.call(registry, card.id)) {
      const canonical = registry[card.id];
      if (isPlainObject(canonical) && isNonEmptyString(canonical.symbol) && canonical.symbol !== card.symbol) {
        errors.push({
          code: 'CARD_IDENTITY_MISMATCH',
          cardId: card.id,
          zone,
          expectedSymbol: canonical.symbol,
          actualSymbol: card.symbol,
          message: `Zone "${zone}" card ${card.id} has symbol "${card.symbol}" but the registry has "${canonical.symbol}".`,
        });
      }
    }
  });
  return entries;
}

function collectArrayOfIdsZone(container, zone, errors) {
  const entries = [];
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

function collectBoardZone(boardCards, board, errors) {
  const zone = 'board';
  const entries = [];
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
    const parsedCell = parseBoardCellKey(cell);
    if (!parsedCell) {
      errors.push({
        code: 'INVALID_BOARD_CELL',
        zone,
        cardId,
        cell,
        message: `Zone "board" has an unparseable cell key "${cell}".`,
      });
    } else if (!isCellWithinBoard(board, parsedCell)) {
      errors.push({
        code: 'INVALID_BOARD_CELL',
        zone,
        cardId,
        cell,
        message: `Zone "board" cell "${cell}" is outside the current board bounds.`,
      });
    }
    entries.push({ zone, cardId });
  }
  return entries;
}

function collectDeployedZone(deployed, board, errors) {
  const zone = 'deployed';
  const entries = [];
  if (!Array.isArray(deployed)) {
    errors.push({ code: 'MALFORMED_ZONE', zone, message: 'Zone "deployed" must be an array.' });
    return entries;
  }
  const boardUnitsOk = isPlainObject(board) && isPlainObject(board.units);
  const seenUnitIds = new Set();
  deployed.forEach((record, index) => {
    if (!isPlainObject(record) || !Array.isArray(record.cardIds)) {
      errors.push({
        code: 'MALFORMED_CARD_ENTRY',
        zone,
        message: `Zone "deployed" has a malformed record at index ${index}.`,
      });
      return;
    }
    if (!isNonEmptyString(record.unitId)) {
      errors.push({
        code: 'MALFORMED_CARD_ENTRY',
        zone,
        message: `Zone "deployed" record ${index} is missing a valid unitId.`,
      });
    } else {
      if (seenUnitIds.has(record.unitId)) {
        errors.push({
          code: 'DUPLICATE_DEPLOYED_UNIT',
          unitId: record.unitId,
          zone,
          message: `Zone "deployed" has more than one record for unit ${record.unitId}.`,
        });
      }
      seenUnitIds.add(record.unitId);
      if (boardUnitsOk && !Object.prototype.hasOwnProperty.call(board.units, record.unitId)) {
        errors.push({
          code: 'DEPLOYED_UNIT_NOT_ON_BOARD',
          unitId: record.unitId,
          zone,
          message: `Deployed unit ${record.unitId} does not exist on the board.`,
        });
      }
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

function collectZoneEntries(game, registry) {
  const errors = [];
  let entries = [];

  validateBoardShape(game.board, errors);
  validateBoardUnits(game.board, errors);

  if (!isPlainObject(game.deck)) {
    errors.push({ code: 'MALFORMED_ZONE', zone: 'deck', message: 'game.deck must be an object.' });
    errors.push({ code: 'MALFORMED_ZONE', zone: 'drawPile', message: 'Zone "drawPile" must be an array.' });
    errors.push({ code: 'MALFORMED_ZONE', zone: 'discardPile', message: 'Zone "discardPile" must be an array.' });
    errors.push({ code: 'MALFORMED_ZONE', zone: 'hand', message: 'Zone "hand" must be an array.' });
    errors.push({ code: 'MALFORMED_ZONE', zone: 'deployed', message: 'Zone "deployed" must be an array.' });
  } else {
    entries = entries.concat(
      collectArrayOfCardsZone(game.deck.drawPile, 'drawPile', registry, errors),
      collectArrayOfCardsZone(game.deck.discardPile, 'discardPile', registry, errors),
      collectArrayOfCardsZone(game.deck.hand, 'hand', registry, errors),
      collectDeployedZone(game.deck.deployed, game.board, errors),
    );
  }

  if (!isPlainObject(game.camp)) {
    errors.push({ code: 'MALFORMED_ZONE', zone: 'camp', message: 'game.camp must be an object.' });
  } else {
    entries = entries.concat(collectArrayOfIdsZone(game.camp.cardIds, 'camp', errors));
  }

  entries = entries.concat(collectBoardZone(game.boardCards, game.board, errors));

  return { entries, errors };
}

function checkReferenceZoneDuplicates(ids, zone, errors) {
  const counts = new Map();
  for (const cardId of ids) {
    if (!isNonEmptyString(cardId)) continue;
    counts.set(cardId, (counts.get(cardId) ?? 0) + 1);
  }
  for (const [cardId, count] of counts) {
    if (count > 1) errors.push({ code: 'DUPLICATE_CARD_IN_ZONE', cardId, zone, count });
  }
}

function collectReferenceIssues(game, handIds, campIds, errors) {
  const retained = game.deck?.retained;
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
    checkReferenceZoneDuplicates(retained, 'retained', errors);
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
      checkReferenceZoneDuplicates(selection.cardIds, 'selection', errors);
    }
  }
}

function validateRegistryEntries(registry, errors) {
  for (const [key, card] of Object.entries(registry)) {
    if (!isPlainObject(card)) {
      errors.push({
        code: 'MALFORMED_REGISTRY_ENTRY',
        cardId: key,
        message: `Registry entry "${key}" must be a card object.`,
      });
      continue;
    }
    if (card.id !== key) {
      errors.push({
        code: 'MALFORMED_REGISTRY_ENTRY',
        cardId: key,
        message: `Registry entry "${key}" has a mismatched id "${card.id}".`,
      });
    }
    if (!isNonEmptyString(card.symbol)) {
      errors.push({
        code: 'MALFORMED_REGISTRY_ENTRY',
        cardId: key,
        message: `Registry entry "${key}" is missing a valid symbol.`,
      });
    }
  }
}

function collectMissingOwnership(registry, zonesByCardId, errors) {
  for (const cardId of Object.keys(registry)) {
    if (!zonesByCardId.has(cardId)) {
      errors.push({
        code: 'MISSING_CARD_OWNERSHIP',
        cardId,
        message: `Registry card ${cardId} is not present in any owner zone.`,
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
  const registry = isPlainObject(game.cardsById) ? game.cardsById : null;
  return collectZoneEntries(game, registry).entries;
}

/**
 * Validate that every card in the canonical registry (`game.cardsById`) has
 * exactly one owner zone — zero owners (a silently lost card) and more than
 * one owner (duplicate ownership) are both reported — that every id
 * referenced by a zone is known to the registry, that registry entries are
 * themselves well-formed, that `boardCards`/`deck.deployed` reference real
 * cells/units, and that reference-only zones (`retained`, `selection`) only
 * point at ids currently held by their expected owner zone(s) without
 * duplicates. Pure: never mutates `game`. Never throws — malformed input
 * produces structured errors.
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
  } else {
    validateRegistryEntries(game.cardsById, errors);
  }

  const { entries, errors: zoneErrors } = collectZoneEntries(game, registryOk ? game.cardsById : null);
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
    collectMissingOwnership(game.cardsById, zonesByCardId, errors);
  }

  const handIds = new Set(entries.filter((entry) => entry.zone === 'hand').map((entry) => entry.cardId));
  const campIds = new Set(entries.filter((entry) => entry.zone === 'camp').map((entry) => entry.cardId));
  collectReferenceIssues(game, handIds, campIds, errors);

  return { valid: errors.length === 0, errors };
}

function formatOwnershipError(error) {
  const parts = [error.code];
  if (error.cardId) parts.push(`card=${error.cardId}`);
  if (error.unitId) parts.push(`unit=${error.unitId}`);
  if (error.unitIds) parts.push(`units=[${error.unitIds.join(', ')}]`);
  if (error.zone) parts.push(`zone=${error.zone}`);
  if (error.zones) parts.push(`zones=[${error.zones.join(', ')}]`);
  if (error.cell) parts.push(`cell=${error.cell}`);
  if (error.expectedSymbol) parts.push(`expected=${error.expectedSymbol}`);
  if (error.actualSymbol) parts.push(`actual=${error.actualSymbol}`);
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
