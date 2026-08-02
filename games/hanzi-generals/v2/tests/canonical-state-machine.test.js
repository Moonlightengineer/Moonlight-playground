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

test('canonical reducer carries board assembly through battle report and fifth-battle pity choice', () => {
  let game = reduceGame(createExpedition('canonical-evolution'), { type: 'START_BATTLE' }).state;
  game = reduceGame(game, { type: 'DRAW_CARDS' }).state;

  const zhang = game.deck.hand.find(({ symbol }) => symbol === '張');
  const fei = game.deck.hand.find(({ symbol }) => symbol === '飛');
  assert.ok(zhang);
  assert.ok(fei);

  game = reduceGame(game, { type: 'SELECT_CARD', cardId: zhang.id }).state;
  game = reduceGame(game, { type: 'ASSEMBLE', target: { column: 0, row: 0 } }).state;
  game = reduceGame(game, { type: 'SELECT_CARD', cardId: fei.id }).state;
  const assembled = reduceGame(game, { type: 'ASSEMBLE', target: { column: 1, row: 0 } });
  assert.equal(assembled.ok, true);
  assert.deepEqual(assembled.state.recruitedGeneralIds, ['zhang-fei']);

  const fifthBattle = {
    ...assembled.state,
    status: 'combat',
    route: 'safe',
    completedBattleIds: ['tutorial', 'shield-line', 'route-safe', 'cavalry-warning'],
    rewardOfferHistory: [
      { battleNumber: 1, rareOffered: false },
      { battleNumber: 2, rareOffered: false },
      { battleNumber: 3, rareOffered: false },
      { battleNumber: 4, rareOffered: false },
    ],
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

  const report = reduceGame(fifthBattle, { type: 'STEP_COMBAT' });
  assert.equal(report.ok, true);
  assert.equal(report.state.status, 'battle-report');
  assert.equal(report.state.battleReport.nextStatus, 'reward');
  assert.equal(report.state.rewardChoices.length, 3);
  assert.equal(report.state.rewardChoices.every(({ concrete, permanent }) => concrete && permanent), true);
  assert.equal(report.state.rewardOfferHistory.at(-1).pityTriggered, true);
  assert.equal(report.state.rewardOfferHistory.at(-1).rareOffered, true);

  const reward = reduceGame(report.state, { type: 'CONTINUE_AFTER_REPORT' });
  assert.equal(reward.ok, true);
  assert.equal(reward.state.status, 'reward');

  const selected = reward.state.rewardChoices[0];
  const applied = reduceGame(reward.state, {
    type: 'CHOOSE_REWARD',
    rewardId: selected.id,
  });
  assert.equal(applied.ok, true);
  assert.equal(applied.state.rewardHistory.at(-1).rewardId, selected.id);
});
