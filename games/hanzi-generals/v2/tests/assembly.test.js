import test from 'node:test';
import assert from 'node:assert/strict';
import {
  confirmAssembly,
  findRecipe,
  moveCardToCamp,
  releaseUnitCards,
} from '../src/deck/assembly.js';
import { RECIPES } from '../data/recipes.js';
import { createBoard, placeUnit } from '../src/board/board.js';

function fixtureGame({ board = createBoard('base'), campCards = [], symbols = {}, livingUnits = [] } = {}) {
  let nextBoard = board;
  for (const unit of livingUnits) nextBoard = placeUnit(nextBoard, unit, unit.cell);
  const cardsById = Object.fromEntries(
    Object.entries(symbols).map(([id, symbol]) => [id, { id, symbol, locked: false }]),
  );
  return {
    version: 1,
    status: 'configuration',
    board: nextBoard,
    camp: { capacity: 2, cardIds: [...campCards] },
    cardsById,
    deck: {
      drawPile: [],
      discardPile: [],
      hand: Object.values(cardsById).filter((card) => !campCards.includes(card.id)),
      retained: [],
      deployed: [],
      freeRerollsRemaining: 1,
    },
    nextUnitId: 1,
    selection: null,
  };
}

function makeLivingGeneral(definitionId) {
  return {
    id: 'existing',
    definitionId,
    kind: 'general',
    hp: 18,
    maxHp: 18,
    cooldown: 0,
    evolution: null,
    statuses: [],
    cell: { column: 0, row: 0 },
  };
}

test('recipe matching is order independent and respects duplicate symbols', () => {
  assert.equal(findRecipe(['忠', '黃'], RECIPES).id, 'huang-zhong');
  assert.equal(findRecipe(['兵', '盾'], RECIPES).id, 'shield-troop');
  assert.equal(findRecipe(['兵', '兵'], RECIPES), null);
});

test('camp assembly requires an immediate legal deployment cell', () => {
  const game = fixtureGame({
    campCards: ['c1', 'c2'],
    symbols: { c1: '黃', c2: '忠' },
  });
  const result = confirmAssembly(
    game,
    { type: 'camp', cardIds: ['c1', 'c2'] },
    { column: 1, row: 1 },
  );
  assert.equal(result.ok, true);
  assert.equal(result.state.board.units['unit-1'].definitionId, 'huang-zhong');
  assert.deepEqual(result.state.camp.cardIds, []);
  assert.deepEqual(result.state.deck.deployed[0].cardIds, ['c1', 'c2']);
});

test('named general cannot be assembled while the same general survives', () => {
  const game = fixtureGame({
    symbols: { c1: '黃', c2: '忠' },
    livingUnits: [makeLivingGeneral('huang-zhong')],
  });
  const result = confirmAssembly(
    game,
    { type: 'hand', cardIds: ['c1', 'c2'] },
    { column: 2, row: 2 },
  );
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'DUPLICATE_NAMED_GENERAL');
});

test('illegal deployment leaves hand and camp unchanged', () => {
  const game = fixtureGame({ symbols: { c1: '黃', c2: '忠' } });
  const result = confirmAssembly(
    game,
    { type: 'hand', cardIds: ['c1', 'c2'] },
    { column: 9, row: 9 },
  );
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'ILLEGAL_DEPLOYMENT');
  assert.deepEqual(result.state.deck.hand, game.deck.hand);
});

test('camp capacity and unit death return cards to discard', () => {
  let game = fixtureGame({ symbols: { c1: '黃', c2: '忠', c3: '趙' } });
  game = moveCardToCamp(game, 'c1').state;
  game = moveCardToCamp(game, 'c2').state;
  assert.equal(moveCardToCamp(game, 'c3').error.code, 'CAMP_FULL');

  const assembled = confirmAssembly(
    game,
    { type: 'camp', cardIds: ['c1', 'c2'] },
    { column: 1, row: 1 },
  );
  const released = releaseUnitCards(assembled.state, 'unit-1');
  assert.equal(released.deck.deployed.length, 0);
  assert.deepEqual(released.deck.discardPile.map(({ id }) => id), ['c1', 'c2']);
});
