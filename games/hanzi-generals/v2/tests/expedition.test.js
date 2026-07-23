import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceExpedition, createExpedition, routeStageIds } from '../src/expedition/expedition.js';
import { applyReward } from '../src/expedition/rewards.js';

function simulateRoute(initialGame, route) {
  let game = { ...initialGame, route };
  for (const stageId of routeStageIds(route)) {
    game = advanceExpedition({
      ...game,
      status: 'reward',
      currentBattleResult: 'victory',
      currentBattle: { stageId },
    }, route);
  }
  return game;
}

test('safe and danger branches both produce exactly six battles', () => {
  const base = createExpedition('route-test');
  const safe = simulateRoute(base, 'safe');
  const danger = simulateRoute(base, 'danger');
  assert.deepEqual(safe.completedBattleIds, ['tutorial', 'shield-line', 'route-safe', 'cavalry-warning', 'elite-mixed', 'hua-xiong']);
  assert.deepEqual(danger.completedBattleIds, ['tutorial', 'shield-line', 'route-danger', 'cavalry-warning', 'elite-mixed', 'hua-xiong']);
  assert.equal(safe.status, 'victory');
  assert.equal(danger.status, 'victory');
});

test('post battle heals 15 percent without exceeding max wall hp', () => {
  const game = { ...createExpedition(1), wallHp: 90, wallMaxHp: 100 };
  const next = advanceExpedition({
    ...game,
    status: 'reward',
    currentBattleResult: 'victory',
  }, 'continue');
  assert.equal(next.wallHp, 100);
});

test('run waits for a route choice after the second battle', () => {
  let game = createExpedition(2);
  for (const stageId of ['tutorial', 'shield-line']) {
    game = advanceExpedition({
      ...game,
      status: 'reward',
      currentBattleResult: 'victory',
      currentBattle: { stageId },
    });
  }
  assert.equal(game.awaitingRoute, true);
  assert.equal(game.nextStageId, null);
  assert.deepEqual(game.legalActions, ['CHOOSE_ROUTE']);
});

test('expansion and recipe packs modify future choices without permanent stat boosts', () => {
  let game = createExpedition(3);
  game = applyReward(game, 'expand-wing');
  assert.equal(game.boardSizeId, 'wing');
  assert.deepEqual(game.board.size, { columns: 4, rows: 3 });

  const before = Object.keys(game.cardsById).length;
  game = applyReward(game, 'unlock-zhang-fei');
  assert.equal(game.unlockedRecipes.includes('zhang-fei'), true);
  assert.equal(Object.keys(game.cardsById).length, before + 2);
});
