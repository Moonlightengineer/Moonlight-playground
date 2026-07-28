import test from 'node:test';
import assert from 'node:assert/strict';

import { REWARD_BY_ID } from '../data/rewards.js';
import { createExpedition } from '../src/expedition/expedition.js';
import { generateRewardOffer } from '../src/reward/reward-flow.js';

function sevenCardGame() {
  const base = createExpedition('reward-seven-card-edge');
  const ids = Object.keys(base.cardsById).slice(0, 7);
  const cardsById = Object.fromEntries(ids.map((id) => [id, base.cardsById[id]]));
  const campId = ids.at(-1);
  return {
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
}

test('restricted reward catalogue remains a strict eligibility boundary', () => {
  const game = sevenCardGame();
  const catalogue = [
    REWARD_BY_ID['remove-card'],
    REWARD_BY_ID['repair-wall'],
    REWARD_BY_ID['extra-reroll'],
  ];
  const allowed = new Set(catalogue.map(({ id }) => id));

  const offer = generateRewardOffer(game, catalogue, game.rng);
  assert.equal(offer.choices.length, 2);
  assert.equal(offer.choices.some(({ id }) => id === 'remove-card'), true);
  assert.equal(offer.choices.some(({ id }) => id === 'repair-wall'), false);
  assert.equal(offer.choices.every(({ id }) => allowed.has(id)), true);
});

test('restricted catalogue still returns three choices when all three are eligible', () => {
  const game = { ...sevenCardGame(), wallHp: 70 };
  const catalogue = [
    REWARD_BY_ID['remove-card'],
    REWARD_BY_ID['repair-wall'],
    REWARD_BY_ID['extra-reroll'],
  ];
  const allowed = new Set(catalogue.map(({ id }) => id));

  const offer = generateRewardOffer(game, catalogue, game.rng);
  assert.equal(offer.choices.length, 3);
  assert.equal(offer.choices.every(({ id }) => allowed.has(id)), true);
});
