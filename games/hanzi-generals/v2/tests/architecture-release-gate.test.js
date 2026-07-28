import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createCombatState } from '../src/combat/combat-engine.js';
import { createBoard } from '../src/board/board.js';
import { reduceGame } from '../src/core/state-machine.js';
import { createExpedition } from '../src/expedition/expedition.js';

const root = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('battle report uses its canonical continue intent without START_NEW_RUN alias', async () => {
  const [runtimeViewModel, interactions, stateMachine] = await Promise.all([
    source('src/ui/runtime-view-model.js'),
    source('src/ui/interactions.js'),
    source('src/core/state-machine.js'),
  ]);
  assert.match(runtimeViewModel, /action:\s*'continue-after-report'/);
  assert.match(interactions, /case 'continue-after-report'/);
  assert.match(interactions, /type:\s*'CONTINUE_AFTER_REPORT'/);
  assert.doesNotMatch(stateMachine, /\['CONTINUE_AFTER_REPORT',\s*'START_NEW_RUN'\]/);
});

test('battle report rejects START_NEW_RUN and accepts CONTINUE_AFTER_REPORT', () => {
  const game = {
    ...createExpedition('release-report'),
    status: 'battle-report',
    battleReport: {
      schemaVersion: 1,
      stageId: 'tutorial',
      battleNumber: 1,
      result: 'victory',
      nextStatus: 'reward',
      wallStart: 100,
      wallEnd: 100,
      wallDamage: 0,
      phasesCompleted: 3,
      turns: 1,
      enemiesDefeated: 1,
      unitsFielded: 0,
      unitsLost: 0,
      ordersUsed: 0,
      eventCounts: {},
    },
    rewardChoices: [],
  };
  const alias = reduceGame(game, { type: 'START_NEW_RUN' });
  assert.equal(alias.ok, false);
  assert.equal(alias.error.code, 'ILLEGAL_ACTION_FOR_STATE');
  const continued = reduceGame(game, { type: 'CONTINUE_AFTER_REPORT' });
  assert.equal(continued.ok, true);
  assert.equal(continued.state.status, 'reward');
});

test('base reducer contains no duplicate reroll, battle, or reward implementations', async () => {
  const base = await source('src/core/state-machine-base.js');
  for (const forbidden of [
    'rerollHand',
    'retainCards',
    'defaultRewardPayload',
    'rewardChoicesFor',
    'stepCombatAction',
    'function startBattle',
    'function startPhase',
    'function chooseReward',
    "case 'START_BATTLE'",
    "case 'START_PHASE'",
    "case 'STEP_COMBAT'",
    "case 'RETAIN_CARDS'",
    "case 'REROLL'",
    "case 'CHOOSE_REWARD'",
  ]) {
    assert.equal(base.includes(forbidden), false, `legacy base still contains ${forbidden}`);
  }
});

test('deck module no longer exports legacy reroll policy functions', async () => {
  const deck = await source('src/deck/deck.js');
  assert.doesNotMatch(deck, /export function retainCards/);
  assert.doesNotMatch(deck, /export function rerollHand/);
});

test('battle completion feedback points to the report instead of skipping to rewards', async () => {
  const app = await source('src/app.js');
  assert.match(app, /BATTLE_COMPLETED:\s*'戰鬥勝利，請查看戰報。'/);
  assert.doesNotMatch(app, /BATTLE_COMPLETED:\s*'戰鬥勝利，請選擇獎勵。'/);
});

test('canonical battle lifecycle remains functional after base cleanup', () => {
  const base = createExpedition('release-battle');
  const started = reduceGame(base, { type: 'START_BATTLE' });
  assert.equal(started.ok, true);
  const configuration = {
    ...started.state,
    board: createBoard('base'),
    currentBattle: {
      ...started.state.currentBattle,
      phaseIndex: 2,
      phaseCount: 3,
    },
    combat: createCombatState({
      board: createBoard('base'),
      enemies: [],
      wallHp: started.state.wallHp,
      phaseIndex: 2,
      ordersRemaining: 3,
      tactics: [],
    }),
    status: 'combat',
  };
  const finished = reduceGame(configuration, { type: 'STEP_COMBAT' });
  assert.equal(finished.ok, true);
  assert.equal(finished.state.status, 'battle-report');
});
