import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createBattleMetrics,
  finalizeBattleReport,
  recordBattleEvents,
} from '../src/report/battle-report.js';
import { reduceGame } from '../src/core/state-machine.js';
import { createExpedition } from '../src/expedition/expedition.js';
import { loadSnapshot, saveSnapshot } from '../src/storage/storage.js';
import { buildAppViewModel } from '../src/ui/runtime-view-model.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
}

function prepareCombat(seed = 'battle-report') {
  let game = reduceGame(createExpedition(seed), { type: 'START_BATTLE' }).state;
  game = reduceGame(game, { type: 'DRAW_CARDS' }).state;
  const zhang = game.deck.hand.find(({ symbol }) => symbol === '張');
  const fei = game.deck.hand.find(({ symbol }) => symbol === '飛');
  game = reduceGame(game, {
    type: 'ASSEMBLE',
    source: { type: 'hand', cardIds: [zhang.id, fei.id] },
    target: { column: 0, row: 0 },
  }).state;
  game = reduceGame(game, { type: 'START_PHASE' }).state;
  return game;
}

function forceOutcome(game, { defeat = false } = {}) {
  const unit = Object.values(game.combat.board.units)[0];
  const finalPhase = game.currentBattle.phaseCount - 1;
  return {
    ...game,
    wallHp: defeat ? 1 : game.wallHp,
    currentBattle: { ...game.currentBattle, phaseIndex: finalPhase },
    combat: {
      ...game.combat,
      phaseIndex: finalPhase,
      wallHp: defeat ? 1 : game.combat.wallHp,
      board: defeat
        ? { ...game.combat.board, units: {} }
        : {
          ...game.combat.board,
          units: { ...game.combat.board.units, [unit.id]: { ...unit, cooldown: 0 } },
        },
      enemies: [{
        id: defeat ? 'report-defeat-enemy' : 'report-victory-enemy',
        definitionId: 'soldier',
        lane: unit?.cell.column ?? 0,
        distance: 0,
        hp: defeat ? 8 : 1,
        maxHp: defeat ? 8 : 1,
        cooldown: 0,
        phase: 1,
        phaseTwoTriggered: false,
        statuses: [],
      }],
    },
  };
}

test('battle metrics aggregate stable event counts and unique actors', () => {
  const game = {
    ...createExpedition('report-metrics'),
    battleIndex: 2,
    currentBattle: { stageId: 'route-safe', phaseIndex: 0, phaseCount: 3, ordersRemaining: 3 },
  };
  const metrics = createBattleMetrics(game);
  const recorded = recordBattleEvents(metrics, [
    { type: 'UNIT_ASSEMBLED', payload: { unitId: 'unit-1' }, turn: 0 },
    { type: 'UNIT_ASSEMBLED', payload: { unitId: 'unit-1' }, turn: 0 },
    { type: 'ENEMY_DEFEATED', payload: { enemyId: 'enemy-1' }, turn: 4 },
    { type: 'ENEMY_DEFEATED', payload: { enemyId: 'enemy-1' }, turn: 4 },
    { type: 'UNIT_DEFEATED', payload: { unitId: 'unit-1' }, turn: 5 },
    { type: 'FOCUS_ORDERED', payload: {}, turn: 2 },
  ], { turn: 5, ordersRemaining: 2 });

  assert.equal(recorded.totalTurns, 5);
  assert.deepEqual(recorded.unitsFieldedIds, ['unit-1']);
  assert.deepEqual(recorded.enemyIds, ['enemy-1']);
  assert.deepEqual(recorded.unitsLostIds, ['unit-1']);
  assert.equal(recorded.ordersUsed, 1);
  assert.equal(recorded.eventCounts.UNIT_ASSEMBLED, 2);
  assert.equal(recorded.eventCounts.ENEMY_DEFEATED, 2);
});

test('finalized report contains stable summary and no raw event history', () => {
  const game = {
    ...createExpedition('report-finalize'),
    battleIndex: 1,
    wallHp: 73,
    currentBattle: { stageId: 'shield-line', phaseIndex: 2, phaseCount: 3, ordersRemaining: 1 },
  };
  const metrics = {
    ...createBattleMetrics({ ...game, wallHp: 100 }),
    totalTurns: 12,
    phasesCompleted: 3,
    enemyIds: ['e1', 'e2'],
    unitsFieldedIds: ['u1', 'u2'],
    unitsLostIds: ['u2'],
    ordersUsed: 2,
    eventCounts: { UNIT_HIT: 6, ENEMY_DEFEATED: 2 },
  };
  const report = finalizeBattleReport({ ...game, battleMetrics: metrics }, 'victory', 'reward');

  assert.equal(report.stageId, 'shield-line');
  assert.equal(report.battleNumber, 2);
  assert.equal(report.result, 'victory');
  assert.equal(report.wallHpStart, 100);
  assert.equal(report.wallHpEnd, 73);
  assert.equal(report.wallDamageTaken, 27);
  assert.equal(report.enemiesDefeated, 2);
  assert.equal(report.unitsFielded, 2);
  assert.equal(report.unitsLost, 1);
  assert.equal(report.nextStatus, 'reward');
  assert.equal(report.events, undefined);
});

test('final battle victory enters battle-report before reward', () => {
  const game = forceOutcome(prepareCombat('report-victory'));
  const result = reduceGame(game, { type: 'STEP_COMBAT' });
  assert.equal(result.ok, true);
  assert.equal(result.state.status, 'battle-report');
  assert.equal(result.state.battleReport.result, 'victory');
  assert.equal(result.state.battleReport.nextStatus, 'reward');
  assert.equal(result.state.rewardChoices.length > 0, true);
  assert.deepEqual(result.state.legalActions, ['CONTINUE_AFTER_REPORT', 'RESET_RUN']);

  const continued = reduceGame(result.state, { type: 'CONTINUE_AFTER_REPORT' });
  assert.equal(continued.ok, true);
  assert.equal(continued.state.status, 'reward');
  assert.equal(continued.state.battleReport, null);
  assert.equal(continued.state.lastBattleReport.result, 'victory');
});

test('defeat enters battle-report before defeat screen', () => {
  const game = forceOutcome(prepareCombat('report-defeat'), { defeat: true });
  const result = reduceGame(game, { type: 'STEP_COMBAT' });
  assert.equal(result.ok, true);
  assert.equal(result.state.status, 'battle-report');
  assert.equal(result.state.battleReport.result, 'defeat');
  assert.equal(result.state.battleReport.nextStatus, 'defeat');

  const continued = reduceGame(result.state, { type: 'CONTINUE_AFTER_REPORT' });
  assert.equal(continued.ok, true);
  assert.equal(continued.state.status, 'defeat');
  assert.equal(continued.state.lastBattleReport.result, 'defeat');
});

test('battle-report is a save boundary and reloads without losing continuation state', () => {
  const game = forceOutcome(prepareCombat('report-save'));
  const reportState = reduceGame(game, { type: 'STEP_COMBAT' }).state;
  const storage = memoryStorage();
  saveSnapshot(reportState, storage);
  const loaded = loadSnapshot(storage);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.game.status, 'battle-report');
  assert.deepEqual(loaded.game.battleReport, reportState.battleReport);
  assert.equal(reduceGame(loaded.game, { type: 'CONTINUE_AFTER_REPORT' }).state.status, 'reward');
});

test('battle report ViewModel exposes summary stats and one semantic continue action', () => {
  const game = forceOutcome(prepareCombat('report-view-model'));
  const reportState = reduceGame(game, { type: 'STEP_COMBAT' }).state;
  const viewModel = buildAppViewModel(
    reportState,
    { settings: reportState.settings, tutorial: reportState.tutorial },
    { selectedCardIds: [], lastMessage: '' },
  );
  assert.equal(viewModel.screen, 'battle-report');
  assert.equal(viewModel.primary.battleReport.visible, true);
  assert.equal(viewModel.primary.battleReport.stats.some(([label]) => label === '總回合'), true);
  assert.deepEqual(viewModel.primary.battleReport.continueIntent, { type: 'CONTINUE_AFTER_REPORT' });
  assert.equal(viewModel.primary.actions.filter(({ intent }) => intent.type === 'CONTINUE_AFTER_REPORT').length, 1);
});
