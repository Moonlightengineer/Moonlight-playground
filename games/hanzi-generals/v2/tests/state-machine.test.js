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
  assert.deepEqual(started.state.board.size, { columns: 3, rows: 3 });
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
