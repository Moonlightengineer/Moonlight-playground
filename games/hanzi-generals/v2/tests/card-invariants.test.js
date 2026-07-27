import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertCardOwnership,
  collectCardZones,
  validateCardOwnership,
} from '../src/core/card-invariants.js';
import { createBoard } from '../src/board/board.js';
import { createExpedition } from '../src/expedition/expedition.js';
import { reduceGame } from '../src/core/state-machine.js';
import { moveCardToCamp, confirmAssembly, placeBoardCard } from '../src/deck/assembly.js';

function makeCard(id, symbol) {
  return { id, symbol, locked: false };
}

function makeDeployedUnit(unitId, cell = { column: 2, row: 2 }) {
  return {
    id: unitId,
    definitionId: 'huang-zhong',
    kind: 'general',
    hp: 18,
    maxHp: 18,
    cooldown: 0,
    evolution: null,
    statuses: [],
    cell,
  };
}

function boardWithUnits(units) {
  const board = createBoard('base');
  return { ...board, units: Object.fromEntries(units.map((unit) => [unit.id, unit])) };
}

function baseFixture(overrides = {}) {
  const cardsById = {
    'card-1': makeCard('card-1', '黃'),
    'card-2': makeCard('card-2', '忠'),
    'card-3': makeCard('card-3', '趙'),
    'card-4': makeCard('card-4', '雲'),
    'card-5': makeCard('card-5', '弓'),
    'card-6': makeCard('card-6', '兵'),
  };
  return {
    version: 1,
    status: 'configuration',
    board: createBoard('base'),
    boardCards: {},
    camp: { capacity: 2, cardIds: [] },
    cardsById,
    deck: {
      drawPile: [cardsById['card-5']],
      discardPile: [cardsById['card-6']],
      hand: [cardsById['card-1'], cardsById['card-2']],
      retained: [],
      deployed: [],
      freeRerollsRemaining: 1,
      nextCardId: 7,
    },
    selection: { cardIds: [] },
    ...overrides,
  };
}

test('collectCardZones normalizes every owner zone into stable, ordered records', () => {
  const game = baseFixture({
    boardCards: { '0,0': 'card-3' },
    camp: { capacity: 2, cardIds: ['card-4'] },
  });
  const zones = collectCardZones(game);
  assert.deepEqual(zones, [
    { zone: 'drawPile', cardId: 'card-5' },
    { zone: 'discardPile', cardId: 'card-6' },
    { zone: 'hand', cardId: 'card-1' },
    { zone: 'hand', cardId: 'card-2' },
    { zone: 'camp', cardId: 'card-4' },
    { zone: 'board', cardId: 'card-3' },
  ]);
});

test('collectCardZones includes deployed cards sealed into board units', () => {
  const game = baseFixture({
    deck: {
      ...baseFixture().deck,
      hand: [],
      deployed: [{ unitId: 'unit-1', cardIds: ['card-1', 'card-2'] }],
    },
  });
  const zones = collectCardZones(game);
  assert.deepEqual(
    zones.filter(({ zone }) => zone === 'deployed'),
    [
      { zone: 'deployed', cardId: 'card-1' },
      { zone: 'deployed', cardId: 'card-2' },
    ],
  );
});

test('valid complete state with every zone populated reports no errors', () => {
  const game = baseFixture({
    board: boardWithUnits([makeDeployedUnit('unit-9')]),
    boardCards: { '0,0': 'card-3' },
    camp: { capacity: 2, cardIds: ['card-4'] },
    deck: {
      ...baseFixture().deck,
      hand: [makeCard('card-1', '黃')],
      deployed: [{ unitId: 'unit-9', cardIds: ['card-2'] }],
    },
  });
  const result = validateCardOwnership(game);
  assert.deepEqual(result, { valid: true, errors: [] });
});

test('valid empty and default zones do not produce false positives', () => {
  const game = createExpedition('invariant-empty');
  const result = validateCardOwnership(game);
  assert.deepEqual(result, { valid: true, errors: [] });
  assert.doesNotThrow(() => assertCardOwnership(game));
});

test('detects a duplicate card id within a single zone', () => {
  const game = baseFixture({
    deck: {
      ...baseFixture().deck,
      hand: [makeCard('card-1', '黃'), makeCard('card-1', '黃')],
    },
  });
  const result = validateCardOwnership(game);
  assert.equal(result.valid, false);
  assert.equal(
    result.errors.some((error) => error.code === 'DUPLICATE_CARD_IN_ZONE'
      && error.cardId === 'card-1' && error.zone === 'hand'),
    true,
  );
});

test('detects duplicate ownership of the same card across two zones', () => {
  const game = baseFixture({
    camp: { capacity: 2, cardIds: ['card-1'] },
  });
  const result = validateCardOwnership(game);
  assert.equal(result.valid, false);
  const error = result.errors.find((item) => item.code === 'DUPLICATE_CARD_OWNERSHIP' && item.cardId === 'card-1');
  assert.ok(error);
  assert.deepEqual(new Set(error.zones), new Set(['hand', 'camp']));
});

test('detects camp versus hand ownership conflict', () => {
  const game = baseFixture({ camp: { capacity: 2, cardIds: ['card-2'] } });
  const result = validateCardOwnership(game);
  const error = result.errors.find((item) => item.code === 'DUPLICATE_CARD_OWNERSHIP' && item.cardId === 'card-2');
  assert.ok(error);
  assert.deepEqual(new Set(error.zones), new Set(['hand', 'camp']));
});

test('detects deployed versus draw/discard ownership conflict', () => {
  const game = baseFixture({
    deck: {
      ...baseFixture().deck,
      deployed: [{ unitId: 'unit-1', cardIds: ['card-5'] }],
    },
  });
  const result = validateCardOwnership(game);
  const error = result.errors.find((item) => item.code === 'DUPLICATE_CARD_OWNERSHIP' && item.cardId === 'card-5');
  assert.ok(error);
  assert.deepEqual(new Set(error.zones), new Set(['drawPile', 'deployed']));
});

test('detects board ownership conflict against hand', () => {
  const game = baseFixture({ boardCards: { '0,0': 'card-1' } });
  const result = validateCardOwnership(game);
  const error = result.errors.find((item) => item.code === 'DUPLICATE_CARD_OWNERSHIP' && item.cardId === 'card-1');
  assert.ok(error);
  assert.deepEqual(new Set(error.zones), new Set(['hand', 'board']));
});

test('board and deployed are distinct owner zones, not references to the same ownership', () => {
  const game = baseFixture({
    board: boardWithUnits([makeDeployedUnit('unit-1')]),
    boardCards: { '0,0': 'card-3' },
    deck: {
      ...baseFixture().deck,
      deployed: [{ unitId: 'unit-1', cardIds: ['card-4'] }],
    },
  });
  const result = validateCardOwnership(game);
  assert.deepEqual(result, { valid: true, errors: [] });
});

test('detects unknown card id referenced by a zone', () => {
  const game = baseFixture({
    deck: {
      ...baseFixture().deck,
      hand: [makeCard('card-1', '黃'), makeCard('ghost-card', '兵')],
    },
  });
  const result = validateCardOwnership(game);
  assert.equal(result.valid, false);
  const error = result.errors.find((item) => item.code === 'UNKNOWN_CARD_ID');
  assert.ok(error);
  assert.equal(error.cardId, 'ghost-card');
  assert.deepEqual(error.zones, ['hand']);
});

test('detects a malformed zone container without throwing a TypeError', () => {
  const game = baseFixture({
    deck: { ...baseFixture().deck, hand: 'not-an-array' },
  });
  let result;
  assert.doesNotThrow(() => { result = validateCardOwnership(game); });
  assert.equal(result.valid, false);
  assert.equal(result.errors.some((error) => error.code === 'MALFORMED_ZONE' && error.zone === 'hand'), true);
});

test('detects a malformed card entry inside an otherwise valid zone', () => {
  const game = baseFixture({
    deck: {
      ...baseFixture().deck,
      hand: [makeCard('card-1', '黃'), { symbol: '忠' }],
    },
  });
  const result = validateCardOwnership(game);
  assert.equal(result.valid, false);
  assert.equal(
    result.errors.some((error) => error.code === 'MALFORMED_CARD_ENTRY' && error.zone === 'hand'),
    true,
  );
});

test('detects a malformed top-level state without throwing', () => {
  let result;
  assert.doesNotThrow(() => { result = validateCardOwnership(null); });
  assert.equal(result.valid, false);
  assert.equal(result.errors[0].code, 'MALFORMED_STATE');

  assert.doesNotThrow(() => { result = validateCardOwnership('not-a-game'); });
  assert.equal(result.valid, false);
  assert.equal(result.errors[0].code, 'MALFORMED_STATE');
});

test('detects a malformed card registry defensively', () => {
  const game = baseFixture({ cardsById: null });
  const result = validateCardOwnership(game);
  assert.equal(result.valid, false);
  assert.equal(result.errors.some((error) => error.code === 'MALFORMED_CARD_REGISTRY'), true);
});

test('flags a retained reference that no longer points into the hand', () => {
  const game = baseFixture({
    deck: { ...baseFixture().deck, retained: ['card-9'] },
  });
  const result = validateCardOwnership(game);
  assert.equal(result.valid, false);
  const error = result.errors.find((item) => item.code === 'ORPHANED_REFERENCE' && item.zone === 'retained');
  assert.ok(error);
  assert.equal(error.cardId, 'card-9');
});

test('flags a selection reference that is not available in hand or camp', () => {
  const game = baseFixture({ selection: { cardIds: ['card-5'] } });
  const result = validateCardOwnership(game);
  assert.equal(result.valid, false);
  const error = result.errors.find((item) => item.code === 'ORPHANED_REFERENCE' && item.zone === 'selection');
  assert.ok(error);
  assert.equal(error.cardId, 'card-5');
});

test('a legitimate retained reference into the hand produces no error', () => {
  const game = baseFixture({
    cardsById: {
      'card-1': makeCard('card-1', '黃'),
      'card-2': makeCard('card-2', '忠'),
    },
    deck: {
      drawPile: [],
      discardPile: [],
      hand: [makeCard('card-1', '黃'), makeCard('card-2', '忠')],
      retained: ['card-1'],
      deployed: [],
      freeRerollsRemaining: 1,
    },
  });
  const result = validateCardOwnership(game);
  assert.deepEqual(result, { valid: true, errors: [] });
});

test('detects a registry card that has been dropped from every owner zone', () => {
  const game = baseFixture({
    deck: {
      ...baseFixture().deck,
      drawPile: [],
      discardPile: [],
      hand: [makeCard('card-1', '黃')],
    },
  });
  const result = validateCardOwnership(game);
  assert.equal(result.valid, false);
  const codes = new Set(['card-2', 'card-3', 'card-4', 'card-5', 'card-6']);
  const missing = result.errors.filter((error) => error.code === 'MISSING_CARD_OWNERSHIP');
  assert.equal(missing.length, codes.size);
  assert.deepEqual(new Set(missing.map((error) => error.cardId)), codes);
});

test('a real reducer flow never produces an unowned registry card', () => {
  const game = createExpedition('missing-ownership-sanity');
  const result = validateCardOwnership(game);
  assert.equal(result.errors.some((error) => error.code === 'MISSING_CARD_OWNERSHIP'), false);
});

test('detects a registry entry with a null value', () => {
  const game = baseFixture({
    cardsById: { ...baseFixture().cardsById, 'card-1': null },
  });
  const result = validateCardOwnership(game);
  assert.equal(result.valid, false);
  const error = result.errors.find((item) => item.code === 'MALFORMED_REGISTRY_ENTRY' && item.cardId === 'card-1');
  assert.ok(error);
});

test('detects a registry entry whose id does not match its own key', () => {
  const game = baseFixture({
    cardsById: {
      ...baseFixture().cardsById,
      'card-1': makeCard('card-2', '黃'),
    },
  });
  const result = validateCardOwnership(game);
  assert.equal(result.valid, false);
  const error = result.errors.find((item) => item.code === 'MALFORMED_REGISTRY_ENTRY' && item.cardId === 'card-1');
  assert.ok(error);
});

test('detects a registry entry missing a valid symbol', () => {
  const game = baseFixture({
    cardsById: { ...baseFixture().cardsById, 'card-1': { id: 'card-1', locked: false } },
  });
  const result = validateCardOwnership(game);
  assert.equal(result.valid, false);
  const error = result.errors.find((item) => item.code === 'MALFORMED_REGISTRY_ENTRY' && item.cardId === 'card-1');
  assert.ok(error);
});

test('detects an unparseable board cell key', () => {
  const game = baseFixture({ boardCards: { 'not-a-cell': 'card-3' } });
  const result = validateCardOwnership(game);
  assert.equal(result.valid, false);
  const error = result.errors.find((item) => item.code === 'INVALID_BOARD_CELL' && item.cell === 'not-a-cell');
  assert.ok(error);
});

test('detects a board cell outside the current board bounds', () => {
  const game = baseFixture({ boardCards: { '99,99': 'card-3' } });
  const result = validateCardOwnership(game);
  assert.equal(result.valid, false);
  const error = result.errors.find((item) => item.code === 'INVALID_BOARD_CELL' && item.cell === '99,99');
  assert.ok(error);
});

test('detects a deployed record with a missing unitId', () => {
  const game = baseFixture({
    deck: { ...baseFixture().deck, deployed: [{ cardIds: ['card-1', 'card-2'] }] },
  });
  const result = validateCardOwnership(game);
  assert.equal(result.valid, false);
  assert.equal(
    result.errors.some((error) => error.code === 'MALFORMED_CARD_ENTRY' && error.zone === 'deployed'),
    true,
  );
});

test('detects duplicate unitId across deployed records', () => {
  const game = baseFixture({
    board: boardWithUnits([makeDeployedUnit('unit-1')]),
    deck: {
      ...baseFixture().deck,
      hand: [],
      deployed: [
        { unitId: 'unit-1', cardIds: ['card-1'] },
        { unitId: 'unit-1', cardIds: ['card-2'] },
      ],
    },
  });
  const result = validateCardOwnership(game);
  assert.equal(result.valid, false);
  const error = result.errors.find((item) => item.code === 'DUPLICATE_DEPLOYED_UNIT' && item.unitId === 'unit-1');
  assert.ok(error);
});

test('detects a deployed unit that does not exist on the board', () => {
  const game = baseFixture({
    deck: {
      ...baseFixture().deck,
      hand: [],
      deployed: [{ unitId: 'ghost-unit', cardIds: ['card-1', 'card-2'] }],
    },
  });
  const result = validateCardOwnership(game);
  assert.equal(result.valid, false);
  const error = result.errors.find((item) => item.code === 'DEPLOYED_UNIT_NOT_ON_BOARD' && item.unitId === 'ghost-unit');
  assert.ok(error);
});

test('detects duplicate ids within the retained reference zone', () => {
  const game = baseFixture({
    deck: { ...baseFixture().deck, retained: ['card-1', 'card-1'] },
  });
  const result = validateCardOwnership(game);
  assert.equal(result.valid, false);
  const error = result.errors.find((item) => item.code === 'DUPLICATE_CARD_IN_ZONE' && item.zone === 'retained');
  assert.ok(error);
  assert.equal(error.cardId, 'card-1');
});

test('detects duplicate ids within the selection reference zone', () => {
  const game = baseFixture({ selection: { cardIds: ['card-1', 'card-1'] } });
  const result = validateCardOwnership(game);
  assert.equal(result.valid, false);
  const error = result.errors.find((item) => item.code === 'DUPLICATE_CARD_IN_ZONE' && item.zone === 'selection');
  assert.ok(error);
  assert.equal(error.cardId, 'card-1');
});

test('detects a missing deck.retained field, since cloneDeck spreads it unconditionally', () => {
  const game = baseFixture();
  delete game.deck.retained;
  const result = validateCardOwnership(game);
  assert.equal(result.valid, false);
  assert.equal(result.errors.some((error) => error.code === 'MALFORMED_ZONE' && error.zone === 'retained'), true);
});

test('a real reducer flow never has a state that passes validation but throws on drawToHand', () => {
  const validGame = reduceGame(createExpedition('retained-typeerror-sanity'), { type: 'START_BATTLE' }).state;
  const brokenGame = { ...validGame, deck: { ...validGame.deck } };
  delete brokenGame.deck.retained;

  assert.equal(validateCardOwnership(validGame).valid, true);
  assert.equal(validateCardOwnership(brokenGame).valid, false);
  assert.throws(() => reduceGame(brokenGame, { type: 'DRAW_CARDS' }), TypeError);
});

test('selection may be legitimately absent or null, matching the engine defensive access pattern', () => {
  const minimalGame = {
    cardsById: { 'card-1': makeCard('card-1', '黃') },
    deck: {
      drawPile: [], discardPile: [], hand: [makeCard('card-1', '黃')], retained: [], deployed: [],
    },
    camp: { capacity: 2, cardIds: [] },
    boardCards: {},
    board: createBoard('base'),
  };

  const gameWithoutSelection = { ...minimalGame };
  assert.deepEqual(validateCardOwnership(gameWithoutSelection), { valid: true, errors: [] });

  const gameWithNullSelection = { ...minimalGame, selection: null };
  assert.deepEqual(validateCardOwnership(gameWithNullSelection), { valid: true, errors: [] });
});

test('a non-object, non-null selection is still rejected as malformed', () => {
  const game = baseFixture({ selection: 'not-an-object' });
  const result = validateCardOwnership(game);
  assert.equal(result.valid, false);
  assert.equal(result.errors.some((error) => error.code === 'MALFORMED_ZONE' && error.zone === 'selection'), true);
});

test('detects a deployed unit whose board entry is null', () => {
  const game = baseFixture({
    board: { ...createBoard('base'), units: { 'unit-1': null } },
    deck: {
      ...baseFixture().deck,
      hand: [],
      deployed: [{ unitId: 'unit-1', cardIds: ['card-1', 'card-2'] }],
    },
  });
  const result = validateCardOwnership(game);
  assert.equal(result.valid, false);
  const error = result.errors.find((item) => item.code === 'MALFORMED_BOARD_UNIT' && item.unitId === 'unit-1');
  assert.ok(error);
});

test('detects a board unit whose id does not match its own key', () => {
  const board = { ...createBoard('base'), units: { 'unit-2': makeDeployedUnit('unit-1') } };
  const game = baseFixture({ board });
  const result = validateCardOwnership(game);
  assert.equal(result.valid, false);
  const error = result.errors.find((item) => item.code === 'MALFORMED_BOARD_UNIT' && item.unitId === 'unit-2');
  assert.ok(error);
});

test('detects a board unit with a missing or out-of-range cell', () => {
  const unit = makeDeployedUnit('unit-1');
  delete unit.cell;
  const game = baseFixture({ board: boardWithUnits([unit]) });
  const result = validateCardOwnership(game);
  assert.equal(result.valid, false);
  const error = result.errors.find((item) => item.code === 'MALFORMED_BOARD_UNIT' && item.unitId === 'unit-1');
  assert.ok(error);
});

test('detects a board unit placed outside the board bounds', () => {
  const unit = makeDeployedUnit('unit-1', { column: 99, row: 99 });
  const game = baseFixture({ board: boardWithUnits([unit]) });
  const result = validateCardOwnership(game);
  assert.equal(result.valid, false);
  const error = result.errors.find((item) => item.code === 'MALFORMED_BOARD_UNIT' && item.unitId === 'unit-1');
  assert.ok(error);
});

test('detects two board units occupying the same cell', () => {
  const cell = { column: 1, row: 1 };
  const unitA = makeDeployedUnit('unit-1', cell);
  const unitB = makeDeployedUnit('unit-2', cell);
  const game = baseFixture({ board: boardWithUnits([unitA, unitB]) });
  const result = validateCardOwnership(game);
  assert.equal(result.valid, false);
  const error = result.errors.find((item) => item.code === 'DUPLICATE_BOARD_UNIT_CELL');
  assert.ok(error);
  assert.deepEqual(new Set(error.unitIds), new Set(['unit-1', 'unit-2']));
});

test('a well-formed board unit referenced by a deployed record produces no board-unit error', () => {
  const game = baseFixture({
    board: boardWithUnits([makeDeployedUnit('unit-9')]),
    deck: {
      ...baseFixture().deck,
      hand: [makeCard('card-1', '黃')],
      deployed: [{ unitId: 'unit-9', cardIds: ['card-2'] }],
    },
  });
  const result = validateCardOwnership(game);
  assert.equal(result.errors.some((error) => error.code === 'MALFORMED_BOARD_UNIT'), false);
  assert.equal(result.errors.some((error) => error.code === 'DUPLICATE_BOARD_UNIT_CELL'), false);
});

test('a minimal but structurally empty game state is rejected, not silently valid', () => {
  const result = validateCardOwnership({ cardsById: {}, deck: {}, camp: {} });
  assert.equal(result.valid, false);
  const codes = new Set(result.errors.map((error) => error.code));
  assert.ok(codes.has('MALFORMED_ZONE'));
  assert.ok(codes.has('MALFORMED_BOARD'));
});

test('detects a missing deck field as a malformed zone rather than an empty default', () => {
  const game = baseFixture({
    deck: {
      discardPile: [],
      hand: [],
      retained: [],
      deployed: [],
      freeRerollsRemaining: 1,
    },
  });
  const result = validateCardOwnership(game);
  assert.equal(result.valid, false);
  assert.equal(result.errors.some((error) => error.code === 'MALFORMED_ZONE' && error.zone === 'drawPile'), true);
});

test('detects a missing camp.cardIds field', () => {
  const game = baseFixture({ camp: { capacity: 2 } });
  const result = validateCardOwnership(game);
  assert.equal(result.valid, false);
  assert.equal(result.errors.some((error) => error.code === 'MALFORMED_ZONE' && error.zone === 'camp'), true);
});

test('detects a missing boardCards field', () => {
  const game = baseFixture();
  delete game.boardCards;
  const result = validateCardOwnership(game);
  assert.equal(result.valid, false);
  assert.equal(result.errors.some((error) => error.code === 'MALFORMED_ZONE' && error.zone === 'board'), true);
});

test('detects a missing deployed field', () => {
  const game = baseFixture({
    deck: {
      drawPile: [],
      discardPile: [],
      hand: [],
      retained: [],
      freeRerollsRemaining: 1,
    },
  });
  const result = validateCardOwnership(game);
  assert.equal(result.valid, false);
  assert.equal(result.errors.some((error) => error.code === 'MALFORMED_ZONE' && error.zone === 'deployed'), true);
});

test('detects a null board without treating cells or deployed units as valid by default', () => {
  const game = baseFixture({
    board: null,
    boardCards: { '0,0': 'card-3' },
    deck: {
      ...baseFixture().deck,
      hand: [],
      deployed: [{ unitId: 'unit-1', cardIds: ['card-4'] }],
    },
  });
  const result = validateCardOwnership(game);
  assert.equal(result.valid, false);
  assert.equal(result.errors.some((error) => error.code === 'MALFORMED_BOARD'), true);
});

test('detects an invalid board.size', () => {
  const game = baseFixture({ board: { ...createBoard('base'), size: { columns: 0, rows: 3 } } });
  const result = validateCardOwnership(game);
  assert.equal(result.valid, false);
  assert.equal(result.errors.some((error) => error.code === 'MALFORMED_BOARD'), true);
});

test('detects an invalid board.units', () => {
  const game = baseFixture({ board: { ...createBoard('base'), units: [] } });
  const result = validateCardOwnership(game);
  assert.equal(result.valid, false);
  assert.equal(result.errors.some((error) => error.code === 'MALFORMED_BOARD'), true);
});

test('detects a hand card whose symbol does not match the canonical registry entry', () => {
  const game = baseFixture({
    deck: {
      ...baseFixture().deck,
      hand: [makeCard('card-1', '忠'), makeCard('card-2', '忠')],
    },
  });
  const result = validateCardOwnership(game);
  assert.equal(result.valid, false);
  const error = result.errors.find((item) => item.code === 'CARD_IDENTITY_MISMATCH' && item.cardId === 'card-1');
  assert.ok(error);
  assert.equal(error.expectedSymbol, '黃');
  assert.equal(error.actualSymbol, '忠');
});

test('detects a draw pile card whose symbol does not match the canonical registry entry', () => {
  const game = baseFixture({
    deck: {
      ...baseFixture().deck,
      drawPile: [makeCard('card-5', '兵')],
    },
  });
  const result = validateCardOwnership(game);
  assert.equal(result.valid, false);
  const error = result.errors.find((item) => item.code === 'CARD_IDENTITY_MISMATCH' && item.cardId === 'card-5');
  assert.ok(error);
  assert.equal(error.expectedSymbol, '弓');
  assert.equal(error.actualSymbol, '兵');
});

test('detects a zone-held card object missing a valid symbol', () => {
  const game = baseFixture({
    deck: {
      ...baseFixture().deck,
      hand: [makeCard('card-1', '黃'), { id: 'card-2', locked: false }],
    },
  });
  const result = validateCardOwnership(game);
  assert.equal(result.valid, false);
  assert.equal(
    result.errors.some((error) => error.code === 'MALFORMED_CARD_ENTRY' && error.zone === 'hand'),
    true,
  );
});

test('a matching symbol between a zone card and the registry produces no identity error', () => {
  const game = baseFixture();
  const result = validateCardOwnership(game);
  assert.equal(result.errors.some((error) => error.code === 'CARD_IDENTITY_MISMATCH'), false);
});

test('validateCardOwnership does not mutate the input state', () => {
  const game = Object.freeze({
    ...baseFixture({ boardCards: { '0,0': 'card-3' }, camp: { capacity: 2, cardIds: ['card-4'] } }),
  });
  const before = JSON.stringify(game);
  validateCardOwnership(game);
  collectCardZones(game);
  assert.equal(JSON.stringify(game), before);
});

test('assertCardOwnership is a no-op for a valid state', () => {
  const game = createExpedition('assert-noop');
  assert.doesNotThrow(() => assertCardOwnership(game));
});

test('assertCardOwnership throws a readable, structured error for an invalid state', () => {
  const game = baseFixture({ camp: { capacity: 2, cardIds: ['card-1'] } });
  assert.throws(
    () => assertCardOwnership(game),
    (error) => {
      assert.match(error.message, /DUPLICATE_CARD_OWNERSHIP/);
      assert.match(error.message, /card-1/);
      assert.ok(Array.isArray(error.errors) && error.errors.length > 0);
      return true;
    },
  );
});

test('card ownership stays valid across a full board-assembly life cycle through the real engine', () => {
  let game = reduceGame(createExpedition('invariant-integration'), { type: 'START_BATTLE' }).state;
  assertCardOwnership(game);

  game = reduceGame(game, { type: 'DRAW_CARDS' }).state;
  assertCardOwnership(game);

  const huang = game.deck.hand.find(({ symbol }) => symbol === '黃');
  const zhong = game.deck.hand.find(({ symbol }) => symbol === '忠');
  assert.ok(huang);
  assert.ok(zhong);

  game = reduceGame(game, { type: 'SELECT_CARD', cardId: huang.id }).state;
  game = reduceGame(game, { type: 'ASSEMBLE', target: { column: 0, row: 0 } }).state;
  assertCardOwnership(game);

  game = reduceGame(game, { type: 'SELECT_CARD', cardId: zhong.id }).state;
  game = reduceGame(game, { type: 'ASSEMBLE', target: { column: 1, row: 0 } }).state;
  assertCardOwnership(game);
  assert.equal(game.deck.deployed.length, 1);

  const campCandidate = game.deck.hand[0];
  if (campCandidate) {
    game = moveCardToCamp(game, campCandidate.id).state;
    assertCardOwnership(game);
  }
});

test('confirmAssembly through camp keeps ownership invariants intact', () => {
  const cardsById = {
    'card-1': makeCard('card-1', '黃'),
    'card-2': makeCard('card-2', '忠'),
  };
  const game = {
    version: 1,
    status: 'configuration',
    board: createBoard('base'),
    boardCards: {},
    camp: { capacity: 2, cardIds: ['card-1', 'card-2'] },
    cardsById,
    deck: {
      drawPile: [],
      discardPile: [],
      hand: [],
      retained: [],
      deployed: [],
      freeRerollsRemaining: 1,
    },
    selection: { cardIds: [] },
    unlockedRecipes: ['huang-zhong'],
  };
  const before = validateCardOwnership(game);
  assert.deepEqual(before, { valid: true, errors: [] });

  const result = confirmAssembly(game, { type: 'camp', cardIds: ['card-1', 'card-2'] }, { column: 1, row: 1 });
  assert.equal(result.ok, true);
  assertCardOwnership(result.state);
});

test('placeBoardCard keeps ownership invariants intact for an unmatched board card', () => {
  const cardsById = { 'card-5': makeCard('card-5', '弓') };
  const game = {
    version: 1,
    status: 'configuration',
    board: createBoard('base'),
    boardCards: {},
    camp: { capacity: 2, cardIds: [] },
    cardsById,
    deck: {
      drawPile: [],
      discardPile: [],
      hand: [makeCard('card-5', '弓')],
      retained: [],
      deployed: [],
      freeRerollsRemaining: 1,
    },
    selection: { cardIds: [] },
    unlockedRecipes: [],
  };
  const placed = placeBoardCard(game, 'card-5', { column: 1, row: 1 });
  assert.equal(placed.ok, true);
  assertCardOwnership(placed.state);
});
