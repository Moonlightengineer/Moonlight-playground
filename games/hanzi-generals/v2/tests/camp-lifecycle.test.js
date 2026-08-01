import test from 'node:test';
import assert from 'node:assert/strict';

import { assertCardOwnership } from '../src/core/card-invariants.js';
import { reduceGame } from '../src/core/state-machine.js';
import {
  campCapacity,
  increaseCampCapacity,
  moveHandCardToCamp,
  preserveCampAcrossTransition,
  returnCampCardToHand,
} from '../src/expedition/camp-lifecycle.js';
import { createExpedition } from '../src/expedition/expedition.js';
import { REWARDS } from '../data/rewards.js';

function moveRegistryCardToCamp(game, cardId) {
  const remove = (cards) => cards.filter(({ id }) => id !== cardId);
  return {
    ...game,
    deck: {
      ...game.deck,
      drawPile: remove(game.deck.drawPile),
      discardPile: remove(game.deck.discardPile),
      hand: remove(game.deck.hand),
    },
    camp: { ...game.camp, cardIds: [...game.camp.cardIds, cardId] },
  };
}

function prepareBattleWithCamp(seed = 'camp-battle') {
  let game = reduceGame(createExpedition(seed), { type: 'START_BATTLE' }).state;
  game = reduceGame(game, { type: 'DRAW_CARDS' }).state;
  const zhang = game.deck.hand.find(({ symbol }) => symbol === '張');
  const fei = game.deck.hand.find(({ symbol }) => symbol === '飛');
  assert.ok(zhang && fei);
  game = reduceGame(game, {
    type: 'ASSEMBLE',
    source: { type: 'hand', cardIds: [zhang.id, fei.id] },
    target: { column: 0, row: 0 },
  }).state;
  const campCard = game.deck.hand[0];
  assert.ok(campCard);
  game = reduceGame(game, { type: 'MOVE_CARD_TO_CAMP', cardId: campCard.id }).state;
  assert.equal(game.camp.cardIds.includes(campCard.id), true);
  game = reduceGame(game, { type: 'START_PHASE' }).state;
  return { game, campCardId: campCard.id };
}

function forceOneEnemyVictory(game, finalPhase = false) {
  const unit = Object.values(game.combat.board.units)[0];
  const phaseIndex = finalPhase ? game.currentBattle.phaseCount - 1 : game.currentBattle.phaseIndex;
  return {
    ...game,
    currentBattle: { ...game.currentBattle, phaseIndex },
    combat: {
      ...game.combat,
      phaseIndex,
      enemies: [{
        id: 'camp-test-enemy',
        definitionId: 'raider',
        lane: unit.cell.column,
        distance: 0,
        hp: 1,
        maxHp: 1,
        cooldown: 0,
        phase: 1,
        phaseTwoTriggered: false,
        statuses: [],
      }],
      board: {
        ...game.combat.board,
        units: {
          ...game.combat.board.units,
          [unit.id]: { ...unit, cooldown: 0 },
        },
      },
    },
  };
}

test('hand and camp transfers keep exactly one owner zone', () => {
  let game = reduceGame(createExpedition('camp-transfer'), { type: 'START_BATTLE' }).state;
  game = reduceGame(game, { type: 'DRAW_CARDS' }).state;
  const cardId = game.deck.hand[0].id;

  const moved = moveHandCardToCamp(game, cardId);
  assert.equal(moved.ok, true);
  assert.equal(moved.state.deck.hand.some(({ id }) => id === cardId), false);
  assert.deepEqual(moved.state.camp.cardIds, [cardId]);
  assertCardOwnership(moved.state);

  const returned = returnCampCardToHand(moved.state, cardId);
  assert.equal(returned.ok, true);
  assert.deepEqual(returned.state.camp.cardIds, []);
  assert.equal(returned.state.deck.hand.some(({ id }) => id === cardId), true);
  assertCardOwnership(returned.state);
});

test('camp rejects overflow and missing card transfers without mutating the input', () => {
  let game = reduceGame(createExpedition('camp-errors'), { type: 'START_BATTLE' }).state;
  game = reduceGame(game, { type: 'DRAW_CARDS' }).state;
  const before = JSON.stringify(game);
  const full = { ...game, camp: { capacity: 0, cardIds: [] } };
  const overflow = moveHandCardToCamp(full, game.deck.hand[0].id);
  assert.equal(overflow.ok, false);
  assert.equal(overflow.state, full);
  const missing = moveHandCardToCamp(game, 'ghost-card');
  assert.equal(missing.ok, false);
  assert.equal(missing.state, game);
  assert.equal(JSON.stringify(game), before);
});

test('camp capacity helpers are pure and permanent', () => {
  const game = createExpedition('camp-capacity');
  assert.equal(campCapacity(game), game.camp.capacity);
  const increased = increaseCampCapacity(game, 1);
  assert.equal(increased.camp.capacity, game.camp.capacity + 1);
  assert.equal(game.camp.capacity + 1, increased.camp.capacity);
  assert.equal(game.camp.capacity, createExpedition('camp-capacity').camp.capacity);
});

test('preserveCampAcrossTransition removes duplicate discard ownership and restores camp', () => {
  const original = createExpedition('camp-preserve-helper');
  const cardId = original.deck.drawPile[0].id;
  const before = moveRegistryCardToCamp(original, cardId);
  const card = before.cardsById[cardId];
  const legacyAfter = {
    ...before,
    camp: { capacity: 2, cardIds: [] },
    deck: {
      ...before.deck,
      discardPile: [...before.deck.discardPile, card],
    },
  };
  const preserved = preserveCampAcrossTransition(before, legacyAfter);
  assert.deepEqual(preserved.camp, before.camp);
  assert.equal(preserved.deck.discardPile.some(({ id }) => id === cardId), false);
  assertCardOwnership(preserved);
});

test('START_BATTLE preserves expedition camp cards and capacity', () => {
  const original = createExpedition('camp-start-battle');
  const cardId = original.deck.drawPile[0].id;
  const prepared = moveRegistryCardToCamp({
    ...original,
    camp: { capacity: original.camp.capacity + 1, cardIds: [] },
  }, cardId);
  assertCardOwnership(prepared);

  const result = reduceGame(prepared, { type: 'START_BATTLE' });
  assert.equal(result.ok, true);
  assert.equal(result.state.status, 'configuration');
  assert.deepEqual(result.state.camp.cardIds, [cardId]);
  assert.equal(result.state.camp.capacity, prepared.camp.capacity);
  assertCardOwnership(result.state);
});

test('camp survives a between-phase settlement without entering discard', () => {
  const { game, campCardId } = prepareBattleWithCamp('camp-between-phase');
  const result = reduceGame(forceOneEnemyVictory(game), { type: 'STEP_COMBAT' });
  assert.equal(result.ok, true);
  assert.equal(result.state.status, 'configuration');
  assert.equal(result.state.camp.cardIds.includes(campCardId), true);
  assert.equal(result.state.deck.discardPile.some(({ id }) => id === campCardId), false);
  assertCardOwnership(result.state);
});

test('camp survives final battle settlement through report into reward', () => {
  const { game, campCardId } = prepareBattleWithCamp('camp-after-battle');
  const result = reduceGame(forceOneEnemyVictory(game, true), { type: 'STEP_COMBAT' });
  assert.equal(result.ok, true);
  assert.equal(result.state.status, 'battle-report');
  assert.equal(result.state.camp.cardIds.includes(campCardId), true);
  assert.equal(result.state.deck.discardPile.some(({ id }) => id === campCardId), false);
  assertCardOwnership(result.state);

  const continued = reduceGame(result.state, { type: 'CONTINUE_AFTER_REPORT' });
  assert.equal(continued.ok, true);
  assert.equal(continued.state.status, 'reward');
  assert.equal(continued.state.camp.cardIds.includes(campCardId), true);
  assertCardOwnership(continued.state);
});

test('extra-camp reward permanently increases expedition capacity and clears legacy pending bonus', () => {
  const reward = REWARDS.find(({ id }) => id === 'extra-camp');
  let game = createExpedition('camp-reward');
  const cardId = game.deck.drawPile[0].id;
  game = moveRegistryCardToCamp(game, cardId);
  game = {
    ...game,
    status: 'reward',
    currentBattle: { stageId: 'tutorial', phaseIndex: 2, phaseCount: 3, ordersRemaining: 0 },
    currentBattleResult: 'victory',
    rewardChoices: [reward],
    legalActions: ['CHOOSE_REWARD'],
  };
  const beforeCapacity = game.camp.capacity;

  const chosen = reduceGame(game, { type: 'CHOOSE_REWARD', rewardId: 'extra-camp' });
  assert.equal(chosen.ok, true);
  assert.equal(chosen.state.camp.capacity, beforeCapacity + 1);
  assert.deepEqual(chosen.state.camp.cardIds, [cardId]);
  assert.equal(chosen.state.temporary.extraCamp, 0);
  assertCardOwnership(chosen.state);

  const started = reduceGame(chosen.state, { type: 'START_BATTLE' });
  assert.equal(started.ok, true);
  assert.equal(started.state.camp.capacity, beforeCapacity + 1);
  assert.deepEqual(started.state.camp.cardIds, [cardId]);
  assertCardOwnership(started.state);
});

test('starting a new run disposes the previous expedition camp through fresh state', () => {
  const original = createExpedition('camp-reset');
  const cardId = original.deck.drawPile[0].id;
  const prepared = moveRegistryCardToCamp(original, cardId);
  const result = reduceGame({ ...prepared, status: 'defeat', legalActions: ['START_NEW_RUN'] }, {
    type: 'START_NEW_RUN', seed: 'camp-reset-next',
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.state.camp.cardIds, []);
  assert.equal(result.state.camp.capacity, createExpedition('camp-reset-next').camp.capacity);
  assertCardOwnership(result.state);
});
