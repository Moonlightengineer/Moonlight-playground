import test from 'node:test';
import assert from 'node:assert/strict';

import { REWARD_BY_ID } from '../data/rewards.js';
import { assertCardOwnership } from '../src/core/card-invariants.js';
import { createExpedition } from '../src/expedition/expedition.js';
import {
  applyRewardChoice,
  generateRewardOffer,
} from '../src/reward/reward-flow.js';
import { buildAppViewModel } from '../src/ui/runtime-view-model.js';

function rewardState(overrides = {}) {
  const game = createExpedition('reward-economy-v2');
  return {
    ...game,
    status: 'reward',
    currentBattle: {
      stageId: 'tutorial', phaseIndex: 2, phaseCount: 3, ordersRemaining: 0,
    },
    currentBattleResult: 'victory',
    completedBattleIds: [],
    rewardChoices: [],
    rewardOfferHistory: [],
    legalActions: ['CHOOSE_REWARD'],
    ...overrides,
  };
}

function baseIds(choices) {
  return choices.map(({ baseId, id }) => baseId ?? id);
}

test('deck economy offer precomputes copy, trim and conversion with no second target step', () => {
  const game = rewardState();
  const catalogue = [
    REWARD_BY_ID['copy-card'],
    REWARD_BY_ID['remove-card'],
    REWARD_BY_ID['convert-cards'],
  ];
  const offer = generateRewardOffer(game, catalogue, game.rng);

  assert.equal(offer.choices.length, 3);
  assert.deepEqual(new Set(baseIds(offer.choices)), new Set(['copy-card', 'remove-card', 'convert-cards']));
  assert.equal(new Set(offer.choices.map(({ id }) => id)).size, 3);

  const copy = offer.choices.find(({ baseId }) => baseId === 'copy-card');
  assert.equal(copy.payload.amount, 2);
  assert.equal(typeof copy.payload.symbol, 'string');
  assert.match(copy.name, /臨摹「.+」/);
  assert.match(copy.description.effect, /×2/);

  const trim = offer.choices.find(({ baseId }) => baseId === 'remove-card');
  assert.equal(trim.payload.cardIds.length, 2);
  assert.equal(new Set(trim.payload.cardIds).size, 2);
  assert.match(trim.description.effect, /移除/);

  const conversion = offer.choices.find(({ baseId }) => baseId === 'convert-cards');
  assert.equal(conversion.payload.removeCardIds.length, 2);
  assert.equal(conversion.payload.addSymbols.length, 2);
  assert.match(conversion.description.effect, /加入/);
});

test('generated choices exclude temporary, consumable and immediate-heal rewards', () => {
  const offer = generateRewardOffer(rewardState(), undefined, rewardState().rng);
  const excluded = new Set(['extra-reroll', 'fire-arrows', 'first-aid', 'repair-wall']);
  assert.equal(baseIds(offer.choices).some((id) => excluded.has(id)), false);
  assert.equal(offer.choices.every(({ permanent }) => permanent === true), true);
});

test('direct copy choice applies its offered payload with one click and adds two cards', () => {
  const game = rewardState();
  const offer = generateRewardOffer(game, [REWARD_BY_ID['copy-card']], game.rng);
  const choice = offer.choices[0];
  const offered = { ...game, rewardChoices: [choice] };
  const before = Object.keys(offered.cardsById).length;

  const applied = applyRewardChoice(offered, choice.id);
  assert.equal(applied.ok, true);
  assert.equal(Object.keys(applied.state.cardsById).length, before + 2);
  assert.equal(applied.events[0].payload.rewardId, choice.id);
  assertCardOwnership(applied.state);
});

test('direct trim choice removes two exact owned cards and preserves ownership invariant', () => {
  const game = rewardState();
  const offer = generateRewardOffer(game, [REWARD_BY_ID['remove-card']], game.rng);
  const choice = offer.choices[0];
  const offered = { ...game, rewardChoices: [choice] };
  const before = Object.keys(offered.cardsById).length;

  const applied = applyRewardChoice(offered, choice.id);
  assert.equal(applied.ok, true);
  assert.equal(Object.keys(applied.state.cardsById).length, before - 2);
  assert.equal(choice.payload.cardIds.every((id) => !(id in applied.state.cardsById)), true);
  assertCardOwnership(applied.state);
});

test('direct conversion choice removes two cards and adds two cards in one transaction', () => {
  const game = rewardState();
  const offer = generateRewardOffer(game, [REWARD_BY_ID['convert-cards']], game.rng);
  const choice = offer.choices[0];
  const offered = { ...game, rewardChoices: [choice] };
  const before = Object.keys(offered.cardsById).length;

  const applied = applyRewardChoice(offered, choice.id);
  assert.equal(applied.ok, true);
  assert.equal(Object.keys(applied.state.cardsById).length, before);
  assert.equal(choice.payload.removeCardIds.every((id) => !(id in applied.state.cardsById)), true);
  for (const symbol of choice.payload.addSymbols) {
    assert.equal(Object.values(applied.state.cardsById).some((card) => card.symbol === symbol), true);
  }
  assertCardOwnership(applied.state);
});

test('reward ViewModel renders every generated choice as one direct action', () => {
  const game = rewardState();
  const offer = generateRewardOffer(game, [
    REWARD_BY_ID['copy-card'],
    REWARD_BY_ID['remove-card'],
    REWARD_BY_ID['convert-cards'],
  ], game.rng);
  const viewModel = buildAppViewModel(
    { ...game, rewardChoices: offer.choices },
    { settings: game.settings, tutorial: game.tutorial, discoveredRecipeIds: [] },
    {},
  );

  assert.equal(viewModel.primary.rewards.length, 3);
  assert.equal(viewModel.primary.rewards.every(({ action }) => action === 'choose-reward'), true);
  assert.equal(viewModel.primary.rewards.every(({ requiresTarget }) => requiresTarget === false), true);
  assert.equal(viewModel.primary.rewards.every(({ targetChoices }) => targetChoices.length === 0), true);
});

test('rare offer starts at battle three and battle five pity guarantees one if none was seen', () => {
  const catalogue = [
    REWARD_BY_ID['copy-card'],
    REWARD_BY_ID['remove-card'],
    REWARD_BY_ID['extra-camp'],
    REWARD_BY_ID['unlock-huang-zhong'],
    REWARD_BY_ID['unlock-lu-heroes'],
    REWARD_BY_ID['unlock-zhuge-liang'],
  ];

  const early = generateRewardOffer(rewardState({ completedBattleIds: ['tutorial'] }), catalogue);
  assert.equal(early.choices.some(({ rarity }) => rarity === 'rare'), false);

  const fifth = generateRewardOffer(rewardState({
    completedBattleIds: ['tutorial', 'shield-line', 'route-safe', 'cavalry-warning'],
    rewardOfferHistory: [
      { battleNumber: 1, rareOffered: false },
      { battleNumber: 2, rareOffered: false },
      { battleNumber: 3, rareOffered: false },
      { battleNumber: 4, rareOffered: false },
    ],
  }), catalogue);
  assert.equal(fifth.choices.some(({ rarity }) => rarity === 'rare'), true);
  assert.equal(fifth.record.pityTriggered, true);
  assert.equal(fifth.record.rareOffered, true);
});

test('a rare option previously offered counts as pity even when it was not chosen', () => {
  const catalogue = [
    REWARD_BY_ID['copy-card'],
    REWARD_BY_ID['remove-card'],
    REWARD_BY_ID['extra-camp'],
    REWARD_BY_ID['unlock-huang-zhong'],
  ];
  const fifth = generateRewardOffer(rewardState({
    completedBattleIds: ['tutorial', 'shield-line', 'route-safe', 'cavalry-warning'],
    rewardOfferHistory: [{ battleNumber: 3, rareOffered: true }],
  }), catalogue);

  assert.equal(fifth.record.pityTriggered, false);
});
