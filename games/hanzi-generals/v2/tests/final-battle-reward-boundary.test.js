import test from 'node:test';
import assert from 'node:assert/strict';

import { finishBattle, startBattle } from '../src/battle/battle-lifecycle.js';
import { assertCardOwnership } from '../src/core/card-invariants.js';
import { reduceGame } from '../src/core/state-machine.js';
import { createExpedition } from '../src/expedition/expedition.js';

const FIRST_FIVE_STAGES = Object.freeze([
  'tutorial',
  'shield-line',
  'route-safe',
  'cavalry-warning',
  'elite-mixed',
]);

test('sixth battle victory skips a sixth reward and continues directly to expedition victory', () => {
  const started = startBattle(createExpedition('final-reward-boundary')).state;
  const fiveRewards = Array.from({ length: 5 }, (_, index) => ({
    rewardId: `copy-card:test-${index + 1}`,
    baseId: 'copy-card',
    battleIndex: index + 1,
    payload: {},
  }));
  const fiveOffers = Array.from({ length: 5 }, (_, index) => ({
    battleNumber: index + 1,
    choiceIds: [],
    baseIds: [],
    categories: [],
    rareOffered: index === 4,
    pityTriggered: false,
  }));
  const game = {
    ...started,
    route: 'safe',
    battleIndex: 5,
    completedBattleIds: [...FIRST_FIVE_STAGES],
    rewardHistory: fiveRewards,
    rewardOfferHistory: fiveOffers,
    currentBattle: {
      ...started.currentBattle,
      stageId: 'hua-xiong',
      phaseIndex: 2,
      phaseCount: 3,
    },
    battleMetrics: {
      ...started.battleMetrics,
      stageId: 'hua-xiong',
      battleNumber: 6,
    },
  };

  const result = finishBattle(game, { turn: 12, ordersRemaining: 0 }, []);

  assert.equal(result.ok, true);
  assert.equal(result.state.status, 'battle-report');
  assert.equal(result.state.battleReport.nextStatus, 'victory');
  assert.deepEqual(result.state.rewardChoices, []);
  assert.equal(result.state.rewardHistory.length, 5);
  assert.equal(result.state.rewardOfferHistory.length, 5);
  assert.equal(result.state.completedBattleIds.length, 6);
  assert.equal(result.state.completedBattleIds.at(-1), 'hua-xiong');
  assertCardOwnership(result.state);

  const continued = reduceGame(result.state, { type: 'CONTINUE_AFTER_REPORT' });
  assert.equal(continued.ok, true);
  assert.equal(continued.state.status, 'victory');
  assert.equal(continued.state.battleReport, null);
  assert.equal(continued.state.lastBattleReport.result, 'victory');
  assert.equal(continued.state.rewardHistory.length, 5);
  assertCardOwnership(continued.state);
});
