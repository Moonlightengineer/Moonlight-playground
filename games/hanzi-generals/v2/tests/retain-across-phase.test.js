import test from 'node:test';
import assert from 'node:assert/strict';

import { finishBattle, finishPhase, startBattle } from '../src/battle/battle-lifecycle.js';
import { reduceGame } from '../src/core/state-machine.js';
import { createExpedition } from '../src/expedition/expedition.js';

test('retained cards survive reroll and phase boundaries, then clear after battle', () => {
  let game = startBattle(createExpedition('retain-across-phases')).state;
  game = reduceGame(game, { type: 'DRAW_CARDS' }).state;
  const retainedId = game.deck.hand[0].id;
  game = reduceGame(game, { type: 'RETAIN_CARDS', cardIds: [retainedId] }).state;

  const rerolled = reduceGame(game, { type: 'REROLL' });
  assert.equal(rerolled.ok, true);
  assert.deepEqual(rerolled.state.deck.retained, [retainedId]);
  assert.equal(rerolled.state.deck.hand.some(({ id }) => id === retainedId), true);

  const combat = {
    board: rerolled.state.board,
    wallHp: rerolled.state.wallHp,
    ordersRemaining: rerolled.state.currentBattle.ordersRemaining,
    turn: 1,
    tactics: [],
  };
  const phase = finishPhase(rerolled.state, combat).state;
  assert.deepEqual(phase.deck.retained, [retainedId]);
  assert.equal(phase.deck.hand.some(({ id }) => id === retainedId), true);

  const battle = finishBattle({
    ...rerolled.state,
    currentBattle: { ...rerolled.state.currentBattle, phaseIndex: 2 },
  }, combat).state;
  assert.deepEqual(battle.deck.retained, []);
});
