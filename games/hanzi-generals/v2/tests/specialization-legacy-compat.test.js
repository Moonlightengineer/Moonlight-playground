import test from 'node:test';
import assert from 'node:assert/strict';

import { GENERAL_BY_ID } from '../data/generals.js';
import { REWARD_BY_ID } from '../data/rewards.js';
import { confirmAssembly } from '../src/deck/assembly.js';
import { createExpedition } from '../src/expedition/expedition.js';
import { assessRewardAvailability } from '../src/reward/reward-flow.js';

function handWithSymbols(game, symbols) {
  const remaining = [...game.deck.drawPile];
  const hand = [];
  for (const symbol of symbols) {
    const index = remaining.findIndex((card) => card.symbol === symbol);
    assert.notEqual(index, -1, `missing ${symbol}`);
    hand.push(...remaining.splice(index, 1));
  }
  return {
    ...game,
    status: 'configuration',
    deck: { ...game.deck, drawPile: remaining, hand },
  };
}

test('legacy run without specialization field assembles normal troop safely', () => {
  const legacy = handWithSymbols(createExpedition('legacy-specialization-field'), ['兵', '盾']);
  delete legacy.troopSpecializations;

  const result = confirmAssembly(legacy, {
    type: 'hand',
    cardIds: legacy.deck.hand.map(({ id }) => id),
  }, { column: 0, row: 0 });

  assert.equal(result.ok, true);
  assert.equal(result.state.board.units['unit-1'].maxHp, GENERAL_BY_ID['shield-troop'].maxHp);
});

test('legacy run remains eligible for its first troop specialization', () => {
  const legacy = createExpedition('legacy-specialization-reward');
  delete legacy.troopSpecializations;
  assert.equal(assessRewardAvailability(legacy, REWARD_BY_ID['specialize-troop']).available, true);
});
