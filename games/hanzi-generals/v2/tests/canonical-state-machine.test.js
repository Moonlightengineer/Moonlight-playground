import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import test from 'node:test';

import { createBoard } from '../src/board/board.js';
import { createCombatState } from '../src/combat/combat-engine.js';
import { createExpedition } from '../src/expedition/expedition.js';
import { reduceGame } from '../src/core/state-machine.js';

const ROOT = new URL('../', import.meta.url);

test('state-machine.js is the single canonical reducer and migration entry', async () => {
  const stateMachine = await import('../src/core/state-machine.js');
  assert.equal(typeof stateMachine.reduceGame, 'function');
  assert.equal(typeof stateMachine.normalizeGameState, 'function');
  assert.equal(typeof stateMachine.finalizeGameResult, 'function');

  const legacyReward = {
    status: 'reward',
    rewardChoices: [
      { id: 'evolve-general' },
      { id: 'copy-card' },
      { id: 'remove-card' },
    ],
    evolutions: {},
  };
  const normalized = stateMachine.normalizeGameState(legacyReward);
  assert.equal(normalized.rewardChoices.length, 3);
  assert.equal(normalized.rewardChoices.some(({ id }) => id === 'evolve-general'), false);
});

test('browser and storage use the canonical entry without import-map or reviewed wrapper', async () => {
  const [index, app, storage, renderer] = await Promise.all([
    readFile(new URL('index.html', ROOT), 'utf8'),
    readFile(new URL('src/app.js', ROOT), 'utf8'),
    readFile(new URL('src/storage/storage.js', ROOT), 'utf8'),
    readFile(new URL('src/ui/render-interactive.js', ROOT), 'utf8'),
  ]);

  assert.equal(index.includes('type="importmap"'), false);
  assert.match(app, /from '\.\/core\/state-machine\.js'/);
  assert.match(storage, /from '\.\.\/core\/state-machine\.js'/);
  assert.match(renderer, /normalizeGameState/);
  await assert.rejects(access(new URL('src/core/state-machine-reviewed.js', ROOT)));
});

test('canonical reducer carries board assembly through the fifth-battle evolution choice', () => {
  let game = reduceGame(createExpedition('canonical-evolution'), { type: 'START_BATTLE' }).state;
  game = reduceGame(game, { type: 'DRAW_CARDS' }).state;

  const huang = game.deck.hand.find(({ symbol }) => symbol === '黃');
  const zhong = game.deck.hand.find(({ symbol }) => symbol === '忠');
  assert.ok(huang);
  assert.ok(zhong);

  game = reduceGame(game, { type: 'SELECT_CARD', cardId: huang.id }).state;
  game = reduceGame(game, { type: 'ASSEMBLE', target: { column: 0, row: 0 } }).state;
  game = reduceGame(game, { type: 'SELECT_CARD', cardId: zhong.id }).state;
  const assembled = reduceGame(game, { type: 'ASSEMBLE', target: { column: 1, row: 0 } });
  assert.equal(assembled.ok, true);
  assert.deepEqual(assembled.state.recruitedGeneralIds, ['huang-zhong']);

  const fifthBattle = {
    ...assembled.state,
    status: 'combat',
    route: 'safe',
    completedBattleIds: ['tutorial', 'shield-line', 'route-safe', 'cavalry-warning'],
    currentBattle: {
      stageId: 'elite-mixed',
      phaseIndex: 2,
      phaseCount: 3,
      ordersRemaining: 3,
    },
    combat: createCombatState({
      board: createBoard('base'),
      enemies: [],
      wallHp: assembled.state.wallHp,
      phaseIndex: 2,
      ordersRemaining: 3,
      tactics: assembled.state.tactics,
    }),
    legalActions: ['STEP_COMBAT'],
  };

  const reward = reduceGame(fifthBattle, { type: 'STEP_COMBAT' });
  assert.equal(reward.ok, true);
  assert.equal(reward.state.status, 'reward');
  assert.equal(reward.state.rewardChoices.some(({ id }) => id === 'evolve-general'), true);

  const evolved = reduceGame(reward.state, {
    type: 'CHOOSE_REWARD',
    rewardId: 'evolve-general',
    payload: { generalId: 'huang-zhong', evolutionId: 'divine-shot' },
  });
  assert.equal(evolved.ok, true);
  assert.equal(evolved.state.evolutions['huang-zhong'], 'divine-shot');
});
