import test from 'node:test';
import assert from 'node:assert/strict';

import { createBoard } from '../src/board/board.js';
import { createExpedition } from '../src/expedition/expedition.js';
import { reduceGame } from '../src/core/state-machine.js';
import {
  selectActiveBoard,
  selectAssemblyTargets,
  selectCampState,
  selectCardZoneIndex,
  selectLegalCommands,
  selectLifecycle,
  selectOrderTargets,
  selectRerollState,
} from '../src/core/selectors/index.js';

function card(id, symbol) {
  return { id, symbol, locked: false };
}

function unit(id, definitionId, column, row) {
  return {
    id,
    definitionId,
    kind: 'general',
    hp: 20,
    maxHp: 20,
    cooldown: 0,
    evolution: null,
    statuses: [],
    cell: { column, row },
  };
}

function configurationFixture() {
  const cardsById = {
    'card-1': card('card-1', '黃'),
    'card-2': card('card-2', '忠'),
    'card-3': card('card-3', '趙'),
    'card-4': card('card-4', '雲'),
    'card-5': card('card-5', '兵'),
    'card-6': card('card-6', '弓'),
  };
  const board = createBoard('base');
  board.units = {
    'unit-1': unit('unit-1', 'huang-zhong', 0, 0),
  };
  return {
    ...createExpedition('selectors-fixture'),
    status: 'configuration',
    battleIndex: 1,
    board,
    boardCards: { '1,0': 'card-3' },
    cardsById,
    camp: { capacity: 3, cardIds: ['card-4'] },
    deck: {
      drawPile: [cardsById['card-5']],
      discardPile: [cardsById['card-6']],
      hand: [cardsById['card-1'], cardsById['card-2']],
      retained: ['card-1'],
      deployed: [{ unitId: 'unit-1', cardIds: [] }],
      freeRerollsRemaining: 2,
      nextCardId: 7,
    },
    selection: { cardIds: ['card-2'] },
    currentBattle: { stageId: 'shield-line', phaseIndex: 1, phaseCount: 3, ordersRemaining: 2 },
    legalActions: ['START_PHASE'],
    legalCells: [],
  };
}

test('selectLifecycle exposes stable screen and human battle/phase numbers', () => {
  const map = createExpedition('selector-map');
  assert.deepEqual(selectLifecycle(map), {
    status: 'expedition-map',
    screen: 'expedition-map',
    battleNumber: 1,
    phaseNumber: null,
    phaseCount: null,
  });

  const configuration = configurationFixture();
  assert.deepEqual(selectLifecycle(configuration), {
    status: 'configuration',
    screen: 'configuration',
    battleNumber: 2,
    phaseNumber: 2,
    phaseCount: 3,
  });
});

test('selectActiveBoard uses the combat board only during combat', () => {
  const game = configurationFixture();
  const combatBoard = createBoard('wing');
  assert.equal(selectActiveBoard(game), game.board);
  assert.equal(selectActiveBoard({ ...game, status: 'combat', combat: { board: combatBoard } }), combatBoard);
});

test('selectCardZoneIndex records canonical owner zones in deterministic order', () => {
  const game = configurationFixture();
  game.deck.deployed = [{ unitId: 'unit-1', cardIds: ['card-5'] }];
  game.deck.drawPile = [];
  const index = selectCardZoneIndex(game);
  assert.deepEqual(index.get('card-1'), ['hand']);
  assert.deepEqual(index.get('card-3'), ['board']);
  assert.deepEqual(index.get('card-4'), ['camp']);
  assert.deepEqual(index.get('card-5'), ['deployed']);
  assert.deepEqual(index.get('card-6'), ['discardPile']);
});

test('selectCampState and selectRerollState derive UI-ready values', () => {
  const game = configurationFixture();
  assert.deepEqual(selectCampState(game), {
    cardIds: ['card-4'],
    capacity: 3,
    count: 1,
    availableSlots: 2,
    isFull: false,
  });
  assert.deepEqual(selectRerollState(game), {
    available: true,
    remaining: 2,
    retainedIds: ['card-1'],
    retainLimit: 2,
  });
});

test('selectAssemblyTargets ignores stale legalCells and returns only empty board cells', () => {
  const targets = selectAssemblyTargets(configurationFixture());
  assert.equal(targets.some(({ column, row }) => column === 0 && row === 0), false);
  assert.equal(targets.some(({ column, row }) => column === 1 && row === 0), false);
  assert.equal(targets.some(({ column, row }) => column === 2 && row === 2), true);
  assert.equal(targets.length, 7);
});

test('selectOrderTargets returns deterministic focus, fortify and assault targets only', () => {
  const game = configurationFixture();
  const board = createBoard('base');
  board.units = {
    'unit-1': unit('unit-1', 'huang-zhong', 0, 0),
    'unit-2': unit('unit-2', 'zhao-yun', 0, 1),
  };
  const combat = {
    board,
    enemies: [
      { id: 'enemy-1', definitionId: 'raider', lane: 0, distance: 1, hp: 10, maxHp: 10 },
      { id: 'enemy-2', definitionId: 'raider', lane: 2, distance: 3, hp: 10, maxHp: 10 },
    ],
    ordersRemaining: 2,
  };
  const targets = selectOrderTargets({ ...game, status: 'combat', combat });
  assert.deepEqual(targets.focusEnemyIds, ['enemy-1']);
  assert.deepEqual(targets.fortifyLanes, [0, 1, 2]);
  assert.deepEqual(targets.assaultLanes, [0, 1, 2]);
  assert.equal(targets.swapPairs, undefined);
  assert.equal(targets.reinforce, undefined);
});

test('selectLegalCommands derives legality instead of copying stale legalActions', () => {
  const map = { ...createExpedition('selector-actions'), legalActions: [] };
  assert.equal(selectLegalCommands(map).has('START_BATTLE'), true);

  const game = configurationFixture();
  game.legalActions = ['CHOOSE_REWARD'];
  const commands = selectLegalCommands(game);
  assert.equal(commands.has('CHOOSE_REWARD'), false);
  assert.equal(commands.has('SELECT_CARD'), true);
  assert.equal(commands.has('REROLL'), true);
  assert.equal(commands.has('START_PHASE'), true);
});

test('selectors remain pure and do not mutate game state', () => {
  const game = configurationFixture();
  const before = JSON.stringify(game);
  selectLifecycle(game);
  selectActiveBoard(game);
  selectCardZoneIndex(game);
  selectCampState(game);
  selectRerollState(game);
  selectAssemblyTargets(game);
  selectLegalCommands(game);
  assert.equal(JSON.stringify(game), before);
});

test('real reducer states are supported without fixture-only fields', () => {
  let game = reduceGame(createExpedition('selector-real-flow'), { type: 'START_BATTLE' }).state;
  assert.equal(selectLegalCommands(game).has('DRAW_CARDS'), true);
  game = reduceGame(game, { type: 'DRAW_CARDS' }).state;
  assert.equal(selectLegalCommands(game).has('REROLL'), true);
  assert.equal(selectAssemblyTargets(game).length, 9);
});
