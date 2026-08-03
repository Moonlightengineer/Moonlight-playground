import test from 'node:test';
import assert from 'node:assert/strict';

import { assertCardOwnership } from '../src/core/card-invariants.js';
import { startBattle } from '../src/battle/battle-lifecycle.js';
import { reduceGame } from '../src/core/state-machine.js';
import { applyReward } from '../src/expedition/rewards.js';
import { createExpedition } from '../src/expedition/expedition.js';

const ids = (cards) => cards.map(({ id }) => id);
const sorted = (values) => [...values].sort((a, b) => a.localeCompare(b));

test('new expedition owns the approved 40 unique cards and content version', () => {
  const game = createExpedition('battle-cycle-new-run');
  assert.equal(game.contentVersion, 2);
  assert.equal(Object.keys(game.cardsById).length, 40);
  assert.equal(new Set(Object.keys(game.cardsById)).size, 40);
  assert.equal(game.deck.drawPile.length, 40);
  assertCardOwnership(game);
});

test('startBattle reshuffles every loose card while preserving camp ownership', () => {
  const game = createExpedition('battle-cycle-reshuffle');
  const [campCard, handCard, discardCard, ...drawPile] = game.deck.drawPile;
  const prepared = {
    ...game,
    nextStageId: 'shield-line',
    deck: { ...game.deck, drawPile, discardPile: [discardCard], hand: [handCard], retained: [handCard.id], deployed: [] },
    camp: { ...game.camp, cardIds: [campCard.id] },
  };
  assertCardOwnership(prepared);
  const expectedLooseIds = sorted([...ids(drawPile), handCard.id, discardCard.id]);
  const result = startBattle(prepared);
  assert.equal(result.ok, true);
  assert.deepEqual(sorted(ids(result.state.deck.drawPile)), expectedLooseIds);
  assert.deepEqual(result.state.deck.discardPile, []);
  assert.deepEqual(result.state.deck.hand, []);
  assert.deepEqual(result.state.deck.retained, []);
  assert.deepEqual(result.state.camp.cardIds, [campCard.id]);
  assertCardOwnership(result.state);
});

test('tutorial opening guarantees Zhang Fei and a legal second hand after reroll', () => {
  let game = startBattle(createExpedition('battle-cycle-tutorial-order')).state;
  game = reduceGame(game, { type: 'DRAW_CARDS' }).state;
  assert.deepEqual(game.deck.hand.map(({ symbol }) => symbol), ['張', '飛', '兵', '弓', '平']);
  const zhang = game.deck.hand.find(({ symbol }) => symbol === '張');
  const fei = game.deck.hand.find(({ symbol }) => symbol === '飛');
  game = reduceGame(game, {
    type: 'ASSEMBLE',
    source: { type: 'hand', cardIds: [zhang.id, fei.id] },
    target: { column: 0, row: 0 },
  }).state;
  game = reduceGame(game, { type: 'REROLL' }).state;
  assert.deepEqual(game.deck.hand.map(({ symbol }) => symbol), ['兵', '盾', '兵', '槍', '任']);
});

test('reward-pack cards enter the next battle draw pool', () => {
  const rewarded = applyReward(createExpedition('battle-cycle-reward-pack'), 'unlock-huang-zhong');
  const rewardIds = rewarded.deck.discardPile.filter(({ symbol }) => ['黃', '忠'].includes(symbol)).map(({ id }) => id);
  assert.equal(rewardIds.length, 2);
  const result = startBattle({ ...rewarded, nextStageId: 'shield-line' });
  const drawIds = new Set(ids(result.state.deck.drawPile));
  assert.equal(rewardIds.every((id) => drawIds.has(id)), true);
  assertCardOwnership(result.state);
});
