import test from 'node:test';
import assert from 'node:assert/strict';

import { createExpedition } from '../src/expedition/expedition.js';
import { reduceGame } from '../src/core/state-machine.js';
import { buildAppViewModel } from '../src/ui/view-model.js';

function runtimeParts(game, overrides = {}) {
  return {
    profile: {
      settings: { reducedMotion: true, vibration: false, speed: 2 },
      tutorial: game.tutorial,
      ...overrides.profile,
    },
    ui: {
      selectedCardIds: game.selection?.cardIds ?? [],
      rangeUnitId: null,
      lastMessage: '測試訊息',
      ...overrides.ui,
    },
  };
}

test('buildAppViewModel returns panel-specific data without exposing the full game object', () => {
  let game = reduceGame(createExpedition('view-model-config'), { type: 'START_BATTLE' }).state;
  game = reduceGame(game, { type: 'DRAW_CARDS' }).state;
  const { profile, ui } = runtimeParts(game);
  const viewModel = buildAppViewModel(game, profile, ui);

  assert.equal(viewModel.screen, 'configuration');
  assert.equal(viewModel.root.status, 'configuration');
  assert.equal(viewModel.root.reducedMotion, true);
  assert.match(viewModel.runStatus.title, /第 1 戰/);
  assert.equal(viewModel.runStatus.wallLabel, `城牆 ${game.wallHp}/${game.wallMaxHp}`);
  assert.equal(viewModel.battleStage.visible, true);
  assert.equal(viewModel.camp.visible, true);
  assert.equal(viewModel.hand.cards.length, game.deck.hand.length);
  assert.equal(viewModel.hand.cards[0].moveToCamp.disabled, false);
  assert.equal(viewModel.primary.actions.some(({ intent }) => intent.type === 'REROLL'), true);
  assert.equal(viewModel.orders.visible, false);
  assert.equal(viewModel.details.visible, false);
  assert.equal(viewModel.game, undefined);
});

test('ViewModel derives enabled state from canonical selectors rather than stale legal actions', () => {
  let game = reduceGame(createExpedition('view-model-legality'), { type: 'START_BATTLE' }).state;
  game = reduceGame(game, { type: 'DRAW_CARDS' }).state;
  game = { ...game, legalActions: ['CHOOSE_REWARD'] };
  const { profile, ui } = runtimeParts(game);
  const viewModel = buildAppViewModel(game, profile, ui);

  const reroll = viewModel.primary.actions.find(({ intent }) => intent.type === 'REROLL');
  const startPhase = viewModel.primary.actions.find(({ intent }) => intent.type === 'START_PHASE');
  assert.equal(reroll.disabled, false);
  assert.equal(startPhase.disabled, true);
  assert.match(startPhase.disabledReason, /至少部署一個單位/);
});

test('combat ViewModel exposes order targets and status without renderer-side legality calculation', () => {
  let game = reduceGame(createExpedition('view-model-combat'), { type: 'START_BATTLE' }).state;
  game = reduceGame(game, { type: 'DRAW_CARDS' }).state;
  const board = {
    ...game.board,
    units: {
      'unit-1': {
        id: 'unit-1', definitionId: 'huang-zhong', kind: 'general',
        hp: 18, maxHp: 18, cooldown: 0, evolution: null, statuses: [],
        cell: { column: 0, row: 0 },
      },
    },
  };
  game = {
    ...game,
    status: 'combat',
    board,
    combat: {
      turn: 1,
      status: 'running',
      board,
      enemies: [{
        id: 'enemy-1', definitionId: 'raider', lane: 0, distance: 1,
        hp: 8, maxHp: 8, cooldown: 0, statuses: [],
      }],
      wallHp: game.wallHp,
      phaseIndex: 0,
      ordersRemaining: 2,
      focus: { enemyId: 'enemy-1', remainingFriendlyTurns: 2 },
      fortify: { lane: 0, remainingEnemyTurns: 1 },
      pendingOrders: [],
      tactics: [],
      paused: false,
    },
  };
  const { profile, ui } = runtimeParts(game);
  const viewModel = buildAppViewModel(game, profile, ui);

  assert.equal(viewModel.orders.visible, true);
  assert.deepEqual(viewModel.orders.focusEnemyIds, ['enemy-1']);
  assert.equal(viewModel.orders.statuses.some((text) => text.includes('集火生效')), true);
  assert.equal(viewModel.battleStage.enemies[0].focusEligible, true);
  assert.equal(viewModel.battleStage.enemies[0].focused, true);
});

test('reward ViewModel carries player-facing summary, effect and tactical use case', () => {
  const game = {
    ...createExpedition('view-model-reward'),
    status: 'reward',
    rewardChoices: [{
      id: 'repair-wall',
      name: '修補城牆',
      description: {
        summary: '回復城牆。',
        effect: '立即回復 30 點。',
        useCase: '城牆偏低時使用。',
      },
    }],
  };
  const { profile, ui } = runtimeParts(game);
  const viewModel = buildAppViewModel(game, profile, ui);
  const reward = viewModel.primary.rewards[0];

  assert.equal(reward.name, '修補城牆');
  assert.equal(reward.summary, '回復城牆。');
  assert.equal(reward.effect, '立即回復 30 點。');
  assert.equal(reward.useCase, '城牆偏低時使用。');
  assert.deepEqual(reward.intent, { type: 'CHOOSE_REWARD', rewardId: 'repair-wall', payload: {} });
});

test('buildAppViewModel is pure', () => {
  const game = createExpedition('view-model-pure');
  const { profile, ui } = runtimeParts(game);
  const before = JSON.stringify({ game, profile, ui });
  buildAppViewModel(game, profile, ui);
  assert.equal(JSON.stringify({ game, profile, ui }), before);
});
