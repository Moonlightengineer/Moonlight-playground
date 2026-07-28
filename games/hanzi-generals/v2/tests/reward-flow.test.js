import test from 'node:test';
import assert from 'node:assert/strict';

import { REWARD_BY_ID, REWARDS } from '../data/rewards.js';
import { assertCardOwnership } from '../src/core/card-invariants.js';
import { reduceGame } from '../src/core/state-machine.js';
import { createExpedition } from '../src/expedition/expedition.js';
import {
  applyRewardChoice,
  generateRewardOffer,
  selectRewardTargets,
  validateRewardChoice,
} from '../src/reward/reward-flow.js';
import { buildAppViewModel } from '../src/ui/runtime-view-model.js';

function rewardState(rewardIds = ['copy-card', 'remove-card', 'extra-reroll']) {
  const game = createExpedition('reward-flow');
  return {
    ...game,
    status: 'reward',
    currentBattle: {
      stageId: 'tutorial',
      phaseIndex: 2,
      phaseCount: 3,
      ordersRemaining: 0,
    },
    currentBattleResult: 'victory',
    rewardChoices: rewardIds.map((id) => REWARD_BY_ID[id]),
    legalActions: ['CHOOSE_REWARD'],
  };
}

function moveFirstCardToCamp(game) {
  const card = game.deck.drawPile[0];
  return {
    ...game,
    deck: { ...game.deck, drawPile: game.deck.drawPile.slice(1) },
    camp: { ...game.camp, cardIds: [card.id] },
  };
}

test('generateRewardOffer is deterministic and returns three unique choices', () => {
  const game = rewardState([]);
  const first = generateRewardOffer(game, REWARDS, game.rng);
  const second = generateRewardOffer(game, REWARDS, game.rng);
  assert.deepEqual(first.choices.map(({ id }) => id), second.choices.map(({ id }) => id));
  assert.deepEqual(first.rng, second.rng);
  assert.equal(first.choices.length, 3);
  assert.equal(new Set(first.choices.map(({ id }) => id)).size, 3);
});

test('generateRewardOffer preserves route reward while replacing unavailable repair', () => {
  const game = {
    ...rewardState([]),
    route: 'safe',
    completedBattleIds: ['tutorial', 'shield-line'],
    currentBattle: {
      stageId: 'route-safe', phaseIndex: 2, phaseCount: 3, ordersRemaining: 0,
    },
  };
  const offer = generateRewardOffer(game, REWARDS, game.rng);
  assert.equal(offer.choices.length, 3);
  assert.equal(offer.choices.some(({ id }) => id === 'unlock-zhang-fei'), true);
  assert.equal(offer.choices.some(({ id }) => id === 'remove-card'), true);
  assert.equal(offer.choices.some(({ id }) => id === 'repair-wall'), false);
});

test('copy targets are explicit and deduplicated by symbol across loose and camp zones', () => {
  const game = moveFirstCardToCamp(rewardState(['copy-card']));
  const targets = selectRewardTargets(game, 'copy-card');
  assert.equal(targets.length > 0, true);
  assert.equal(new Set(targets.map(({ symbol }) => symbol)).size, targets.length);
  assert.equal(targets.some(({ zone }) => zone === 'camp'), true);
  assert.equal(targets.every(({ type }) => type === 'card'), true);
});

test('copying an explicit camp target succeeds and keeps the camp card owned by camp', () => {
  const game = moveFirstCardToCamp(rewardState(['copy-card']));
  const target = selectRewardTargets(game, 'copy-card').find(({ zone }) => zone === 'camp');
  assert.ok(target);
  const beforeCount = Object.keys(game.cardsById).length;

  const applied = applyRewardChoice(game, 'copy-card', { cardId: target.cardId });
  assert.equal(applied.ok, true);
  assert.equal(applied.state.status, 'expedition-map');
  assert.equal(Object.keys(applied.state.cardsById).length, beforeCount + 1);
  assert.equal(applied.state.camp.cardIds.includes(target.cardId), true);
  assertCardOwnership(applied.state);
});

test('remove targets identify exact undeployed card ids and keep a minimum six-card pool', () => {
  const game = moveFirstCardToCamp(rewardState(['remove-card']));
  const targets = selectRewardTargets(game, 'remove-card');
  assert.equal(targets.length, Object.keys(game.cardsById).length);
  assert.equal(new Set(targets.map(({ cardId }) => cardId)).size, targets.length);
  assert.equal(targets.some(({ zone }) => zone === 'camp'), true);

  const sixIds = Object.keys(game.cardsById).slice(0, 6);
  const sixCards = Object.fromEntries(sixIds.map((id) => [id, game.cardsById[id]]));
  const sixCardGame = {
    ...game,
    cardsById: sixCards,
    camp: { ...game.camp, cardIds: [] },
    deck: {
      ...game.deck,
      drawPile: sixIds.map((id) => sixCards[id]),
      discardPile: [], hand: [], deployed: [], retained: [],
    },
  };
  assert.deepEqual(selectRewardTargets(sixCardGame, 'remove-card'), []);
});

test('removing an explicit camp target clears camp ownership and registry together', () => {
  const game = moveFirstCardToCamp(rewardState(['remove-card']));
  const target = selectRewardTargets(game, 'remove-card').find(({ zone }) => zone === 'camp');
  assert.ok(target);
  const beforeCount = Object.keys(game.cardsById).length;

  const applied = applyRewardChoice(game, 'remove-card', { cardId: target.cardId });
  assert.equal(applied.ok, true);
  assert.equal(applied.state.status, 'expedition-map');
  assert.equal(Object.keys(applied.state.cardsById).length, beforeCount - 1);
  assert.equal(applied.state.camp.cardIds.includes(target.cardId), false);
  assertCardOwnership(applied.state);
});

test('evolution targets include every legal recruited general branch', () => {
  const game = {
    ...rewardState(['evolve-general']),
    recruitedGeneralIds: ['huang-zhong', 'zhao-yun'],
    evolutions: { 'zhao-yun': 'seven-charges' },
  };
  const targets = selectRewardTargets(game, 'evolve-general');
  assert.deepEqual(targets.map(({ generalId }) => generalId), ['huang-zhong', 'huang-zhong']);
  assert.deepEqual(targets.map(({ evolutionId }) => evolutionId), ['divine-shot', 'repeating-crossbow']);
});

test('validateRewardChoice rejects hidden, missing and invalid targets', () => {
  const game = rewardState(['copy-card', 'remove-card']);
  assert.equal(validateRewardChoice(game, 'repair-wall').error.code, 'REWARD_NOT_OFFERED');
  assert.equal(validateRewardChoice(game, 'copy-card').error.code, 'REWARD_TARGET_REQUIRED');
  assert.equal(
    validateRewardChoice(game, 'remove-card', { cardId: 'ghost-card' }).error.code,
    'REWARD_TARGET_INVALID',
  );
  const target = selectRewardTargets(game, 'copy-card')[0];
  assert.equal(validateRewardChoice(game, 'copy-card', { cardId: target.cardId }).valid, true);
});

test('applyRewardChoice requires an explicit target and advances only after valid application', () => {
  const game = rewardState(['copy-card']);
  const beforeCount = Object.keys(game.cardsById).length;
  const missing = applyRewardChoice(game, 'copy-card');
  assert.equal(missing.ok, false);
  assert.equal(missing.state, game);
  assert.equal(missing.error.code, 'REWARD_TARGET_REQUIRED');

  const target = selectRewardTargets(game, 'copy-card')[0];
  const applied = applyRewardChoice(game, 'copy-card', { cardId: target.cardId });
  assert.equal(applied.ok, true);
  assert.equal(applied.state.status, 'expedition-map');
  assert.equal(Object.keys(applied.state.cardsById).length, beforeCount + 1);
  assert.equal(applied.events[0].type, 'REWARD_CHOSEN');
  assert.equal(applied.events[0].payload.cardId, target.cardId);
});

test('targetless rewards validate and apply without fabricated payloads', () => {
  const game = { ...rewardState(['repair-wall']), wallHp: 40 };
  assert.equal(validateRewardChoice(game, 'repair-wall').valid, true);
  const applied = applyRewardChoice(game, 'repair-wall');
  assert.equal(applied.ok, true);
  assert.equal(applied.state.wallHp > 40, true);
});

test('canonical reducer refuses target-required rewards without an explicit target', () => {
  const game = rewardState(['copy-card']);
  const missing = reduceGame(game, { type: 'CHOOSE_REWARD', rewardId: 'copy-card' });
  assert.equal(missing.ok, false);
  assert.equal(missing.state, game);
  assert.equal(missing.error.code, 'REWARD_TARGET_REQUIRED');

  const target = selectRewardTargets(game, 'copy-card')[0];
  const applied = reduceGame(game, {
    type: 'CHOOSE_REWARD', rewardId: 'copy-card', payload: { cardId: target.cardId },
  });
  assert.equal(applied.ok, true);
});

test('reward ViewModel exposes explicit target choices without a guessed top-level card payload', () => {
  const game = rewardState(['copy-card', 'remove-card', 'extra-reroll']);
  const viewModel = buildAppViewModel(game, { settings: game.settings, tutorial: game.tutorial }, {});
  const copy = viewModel.primary.rewards.find(({ id }) => id === 'copy-card');
  const remove = viewModel.primary.rewards.find(({ id }) => id === 'remove-card');
  const reroll = viewModel.primary.rewards.find(({ id }) => id === 'extra-reroll');

  assert.equal(copy.data.cardId, undefined);
  assert.equal(copy.action, null);
  assert.equal(copy.targetChoices.length > 0, true);
  assert.equal(copy.targetChoices.every(({ data }) => data.rewardId === 'copy-card' && data.cardId), true);

  assert.equal(remove.data.cardId, undefined);
  assert.equal(remove.action, null);
  assert.equal(remove.targetChoices.length, Object.keys(game.cardsById).length);

  assert.equal(reroll.action, 'choose-reward');
  assert.deepEqual(reroll.targetChoices, []);
  assert.equal(viewModel.primary.evolution, null);
});
