import test from 'node:test';
import assert from 'node:assert/strict';

import { REWARD_BY_ID } from '../data/rewards.js';
import { createExpedition } from '../src/expedition/expedition.js';
import { generateRewardOffer } from '../src/reward/reward-flow.js';

test('random reward offer uses canonical camp-aware eligibility exactly once', () => {
  const base = createExpedition('reward-seven-card-edge');
  const ids = Object.keys(base.cardsById).slice(0, 7);
  const cardsById = Object.fromEntries(ids.map((id) => [id, base.cardsById[id]]));
  const campId = ids.at(-1);
  const game = {
    ...base,
    cardsById,
    deck: {
      ...base.deck,
      drawPile: ids.slice(0, 6).map((id) => cardsById[id]),
      discardPile: [],
      hand: [],
      retained: [],
      deployed: [],
    },
    camp: { ...base.camp, cardIds: [campId] },
    completedBattleIds: [],
  };
  const catalogue = [
    REWARD_BY_ID['remove-card'],
    REWARD_BY_ID['repair-wall'],
    REWARD_BY_ID['extra-reroll'],
  ];

  const offer = generateRewardOffer(game, catalogue, game.rng);
  assert.equal(offer.choices.length, 3);
  assert.equal(offer.choices.some(({ id }) => id === 'remove-card'), true);
});
