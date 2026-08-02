import test from 'node:test';
import assert from 'node:assert/strict';

import { GENERAL_BY_ID } from '../data/generals.js';
import { REWARD_BY_ID } from '../data/rewards.js';
import {
  SPECIALIZATION_BY_ID,
  resolveUnitDefinition,
} from '../data/specializations.js';
import { assertCardOwnership } from '../src/core/card-invariants.js';
import { confirmAssembly } from '../src/deck/assembly.js';
import { createExpedition } from '../src/expedition/expedition.js';
import { applyReward } from '../src/expedition/rewards.js';
import {
  applyRewardChoice,
  assessRewardAvailability,
  generateRewardOffer,
} from '../src/reward/reward-flow.js';
import { buildUnitPlayerDetail } from '../src/ui/unit-copy.js';

function offeredGame(seed = 'reward-specialization') {
  return {
    ...createExpedition(seed),
    status: 'reward',
    currentBattle: { stageId: 'tutorial', phaseIndex: 2, phaseCount: 3, ordersRemaining: 0 },
    currentBattleResult: 'victory',
    legalActions: ['CHOOSE_REWARD'],
  };
}

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
    deck: { ...game.deck, drawPile: remaining, hand },
  };
}

test('troop specialization catalogue resolves one permanent, non-stacking modifier', () => {
  const specialization = SPECIALIZATION_BY_ID['rapid-volley'];
  assert.equal(specialization.troopId, 'archer');

  const base = GENERAL_BY_ID.archer;
  const effective = resolveUnitDefinition(base, null, ['rapid-volley']);
  assert.equal(effective.attackEvery, 1);
  assert.equal(effective.damage, base.damage);
  assert.equal(effective.specializations.length, 1);

  const duplicate = resolveUnitDefinition(base, null, ['rapid-volley', 'rapid-volley']);
  assert.equal(duplicate.attackEvery, 1);
  assert.equal(duplicate.specializations.length, 1);
});

test('specialization reward applies to current run and future assembled troops', () => {
  let game = offeredGame('reward-specialization-apply');
  const reward = {
    ...REWARD_BY_ID['specialize-troop'],
    id: 'specialize-troop:rapid-volley',
    baseId: 'specialize-troop',
    concrete: true,
    permanent: true,
    payload: { specializationId: 'rapid-volley' },
  };
  game = applyReward(game, reward, reward.payload);

  assert.deepEqual(game.troopSpecializations, ['rapid-volley']);
  assert.equal(assessRewardAvailability(game, reward).available, false);

  game = handWithSymbols({ ...game, status: 'configuration' }, ['兵', '弓']);
  const result = confirmAssembly(game, {
    type: 'hand', cardIds: game.deck.hand.map(({ id }) => id),
  }, { column: 0, row: 0 });
  assert.equal(result.ok, true);
  const unit = result.state.board.units['unit-1'];
  assert.equal(unit.definitionId, 'archer');
  assert.equal(unit.maxHp, GENERAL_BY_ID.archer.maxHp);

  const detail = buildUnitPlayerDetail(GENERAL_BY_ID.archer, null, result.state.troopSpecializations);
  assert.match(detail.specializationText, /連射訓練/);
  assert.match(detail.statsLabel, /每 1 回合攻擊/);
  assertCardOwnership(result.state);
});

test('specialization immediately updates an existing matching troop without healing unrelated damage', () => {
  const base = offeredGame('reward-specialization-current');
  const shield = GENERAL_BY_ID['shield-troop'];
  const unit = {
    id: 'unit-current', definitionId: shield.id, kind: shield.kind,
    hp: shield.maxHp - 5, maxHp: shield.maxHp, cooldown: 0,
    evolution: null, statuses: [], cell: { column: 0, row: 0 },
  };
  const game = {
    ...base,
    board: { ...base.board, units: { [unit.id]: unit } },
  };
  const reward = {
    ...REWARD_BY_ID['specialize-troop'],
    id: 'specialize-troop:shield-wall',
    baseId: 'specialize-troop', concrete: true, permanent: true,
    payload: { specializationId: 'shield-wall' },
  };
  const next = applyReward(game, reward, reward.payload);
  const updated = next.board.units[unit.id];

  assert.equal(updated.maxHp, shield.maxHp + 6);
  assert.equal(updated.hp, unit.hp + 6);
});

test('camp reinforcement offer adds a complete pair directly to camp and expands capacity', () => {
  const game = offeredGame('reward-camp-reinforcement');
  const generated = generateRewardOffer(game, [REWARD_BY_ID['camp-reinforcements']], game.rng);
  assert.equal(generated.choices.length, 1);
  const reward = generated.choices[0];
  assert.equal(reward.concrete, true);
  assert.equal(reward.payload.symbols.length, 2);
  assert.equal(reward.payload.capacityAdd, 2);

  const beforeCount = Object.keys(game.cardsById).length;
  const beforeCapacity = game.camp.capacity;
  const next = applyReward(game, reward, reward.payload);

  assert.equal(Object.keys(next.cardsById).length, beforeCount + 2);
  assert.equal(next.camp.capacity, beforeCapacity + 2);
  assert.equal(next.camp.cardIds.length, game.camp.cardIds.length + 2);
  const addedSymbols = next.camp.cardIds.slice(-2).map((id) => next.cardsById[id].symbol);
  assert.deepEqual(addedSymbols, reward.payload.symbols);
  assertCardOwnership(next);

  const rewardState = {
    ...game,
    rewardChoices: [reward],
    rewardOfferHistory: [generated.record],
  };
  const applied = applyRewardChoice(rewardState, reward.id);
  assert.equal(applied.ok, true);
  assert.notEqual(applied.state.status, 'reward');
  assertCardOwnership(applied.state);
});

test('dynamic reward pool filters acquired specialization but keeps other specializations eligible', () => {
  const base = offeredGame('reward-specialization-filter');
  const first = generateRewardOffer(base, [REWARD_BY_ID['specialize-troop']], base.rng).choices[0];
  assert.ok(first?.payload?.specializationId);
  const acquired = applyReward(base, first, first.payload);
  const next = generateRewardOffer(acquired, [REWARD_BY_ID['specialize-troop']], acquired.rng).choices[0];

  assert.ok(next?.payload?.specializationId);
  assert.notEqual(next.payload.specializationId, first.payload.specializationId);
});
