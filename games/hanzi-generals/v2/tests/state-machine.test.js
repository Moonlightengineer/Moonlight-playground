import test from 'node:test';
import assert from 'node:assert/strict';
import { createExpedition } from '../src/expedition/expedition.js';
import { reduceGame } from '../src/core/state-machine.js';

test('illegal action returns a stable error result', () => {
  const game = { status: 'combat' };
  const illegal = reduceGame(game, { type: 'DRAW_CARDS' });
  assert.equal(illegal.ok, false);
  assert.equal(illegal.error.code, 'ILLEGAL_ACTION_FOR_STATE');
  assert.equal(illegal.state, game);
});

test('new run enters hidden expedition map then starts configuration', () => {
  const game = createExpedition('flow');
  assert.equal(game.status, 'expedition-map');
  assert.equal(game.nextStageId, 'tutorial');

  const started = reduceGame(game, { type: 'START_BATTLE' });
  assert.equal(started.ok, true);
  assert.equal(started.state.status, 'configuration');
  assert.equal(started.state.currentBattle.stageId, 'tutorial');
  assert.equal(started.state.currentBattle.ordersRemaining, 3);
  assert.deepEqual(started.state.board.size, { columns: 3, rows: 3 });
});

test('tutorial opening guarantees direct 黃忠 board assembly through public actions', () => {
  let game = reduceGame(createExpedition('tutorial-flow'), { type: 'START_BATTLE' }).state;
  game = reduceGame(game, { type: 'DRAW_CARDS' }).state;
  const huang = game.deck.hand.find(({ symbol }) => symbol === '黃');
  const zhong = game.deck.hand.find(({ symbol }) => symbol === '忠');
  assert.ok(huang);
  assert.ok(zhong);

  game = reduceGame(game, { type: 'SELECT_CARD', cardId: huang.id }).state;
  game = reduceGame(game, { type: 'ASSEMBLE', target: { column: 0, row: 0 } }).state;
  assert.equal(game.boardCards['0,0'], huang.id);

  game = reduceGame(game, { type: 'SELECT_CARD', cardId: zhong.id }).state;
  const assembled = reduceGame(game, { type: 'ASSEMBLE', target: { column: 1, row: 0 } });
  assert.equal(assembled.ok, true);
  assert.equal(assembled.events.some(({ type }) => type === 'UNIT_ASSEMBLED'), true);
  assert.equal(assembled.state.board.units['unit-1'].definitionId, 'huang-zhong');
  assert.deepEqual(assembled.state.boardCards, {});
});

test('configuration can draw cards and start the first combat phase', () => {
  let game = reduceGame(createExpedition('draw'), { type: 'START_BATTLE' }).state;
  const drawn = reduceGame(game, { type: 'DRAW_CARDS' });
  assert.equal(drawn.ok, true);
  assert.equal(drawn.state.deck.hand.length, 5);

  const combat = reduceGame(drawn.state, { type: 'START_PHASE' });
  assert.equal(combat.ok, true);
  assert.equal(combat.state.status, 'combat');
  assert.equal(combat.state.combat.enemies.length > 0, true);
  assert.equal(combat.state.combat.ordersRemaining, 3);
});

test('route choice selects the correct third stage', () => {
  const game = {
    ...createExpedition('route'),
    status: 'expedition-map',
    completedBattleIds: ['tutorial', 'shield-line'],
    awaitingRoute: true,
    nextStageId: null,
    legalActions: ['CHOOSE_ROUTE'],
  };
  const result = reduceGame(game, { type: 'CHOOSE_ROUTE', route: 'danger' });
  assert.equal(result.ok, true);
  assert.equal(result.state.route, 'danger');
  assert.equal(result.state.nextStageId, 'route-danger');
});
