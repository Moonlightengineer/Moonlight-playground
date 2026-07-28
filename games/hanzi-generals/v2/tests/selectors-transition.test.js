import test from 'node:test';
import assert from 'node:assert/strict';

import { createBoard } from '../src/board/board.js';
import { createExpedition } from '../src/expedition/expedition.js';
import { selectLegalCommands } from '../src/core/selectors/index.js';

test('between-phase configuration may draw or start with existing units', () => {
  const game = createExpedition('selector-between-phase');
  const board = createBoard('base');
  board.units = {
    'unit-1': {
      id: 'unit-1',
      definitionId: 'huang-zhong',
      kind: 'general',
      hp: 18,
      maxHp: 18,
      cooldown: 0,
      evolution: null,
      statuses: [],
      cell: { column: 0, row: 0 },
    },
  };
  const retainedCard = game.deck.drawPile[0];
  const state = {
    ...game,
    status: 'configuration',
    board,
    deck: {
      ...game.deck,
      drawPile: game.deck.drawPile.slice(1),
      hand: [retainedCard],
      retained: [],
    },
    currentBattle: {
      stageId: 'shield-line',
      phaseIndex: 1,
      phaseCount: 3,
      ordersRemaining: 2,
    },
    legalActions: ['DRAW_CARDS'],
  };

  const commands = selectLegalCommands(state);
  assert.equal(commands.has('DRAW_CARDS'), true);
  assert.equal(commands.has('START_PHASE'), true);
  assert.equal(commands.has('SELECT_CARD'), true);
  assert.equal(commands.has('REROLL'), true);
});
