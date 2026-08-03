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
      discardPile: [], hand: [], retained: [], deployed: [],
    },
    camp: { ...base.camp, cardIds: [campId] },
    completedBattleIds: [],
  };
}

function baseIds(choices) {
  return choices.map(({ baseId, id }) => baseId ?? id);
}

test('restricted reward catalogue remains a strict eligibility boundary', () => {
  const game = sevenCardGame();
  const catalogue = [
    REWARD_BY_ID['remove-card'],
    REWARD_BY_ID['extra-camp'],
    REWARD_BY_ID['expand-wing'],
  ];
  const allowed = new Set(catalogue.map(({ id }) => id));

  const offer = generateRewardOffer(game, catalogue, game.rng);
  assert.equal(offer.choices.length, 2);
  assert.equal(baseIds(offer.choices).includes('remove-card'), false);
  assert.equal(baseIds(offer.choices).every((id) => allowed.has(id)), true);
});

test('restricted catalogue still returns three concrete choices when all three are eligible', () => {
  const game = sevenCardGame();
  const catalogue = [
    REWARD_BY_ID['copy-card'],
    REWARD_BY_ID['extra-camp'],
    REWARD_BY_ID['expand-wing'],
  ];
  const allowed = new Set(catalogue.map(({ id }) => id));

  const offer = generateRewardOffer(game, catalogue, game.rng);
  assert.equal(offer.choices.length, 3);
  assert.equal(baseIds(offer.choices).every((id) => allowed.has(id)), true);
  assert.equal(offer.choices.every(({ concrete }) => concrete), true);
});
