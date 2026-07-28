import test from 'node:test';
import assert from 'node:assert/strict';

import { assertCardOwnership } from '../src/core/card-invariants.js';
import {
  finishBattle,
  finishPhase,
  startBattle,
  startPhase,
  stepBattleCombat,
} from '../src/battle/battle-lifecycle.js';
import { reduceGame } from '../src/core/state-machine.js';
import { createExpedition } from '../src/expedition/expedition.js';

function prepareConfiguredBattle(seed = 'battle-lifecycle') {
  let game = startBattle(createExpedition(seed)).state;
  game = reduceGame(game, { type: 'DRAW_CARDS' }).state;
  const huang = game.deck.hand.find(({ symbol }) => symbol === '黃');
  const zhong = game.deck.hand.find(({ symbol }) => symbol === '忠');
  assert.ok(huang && zhong);
  game = reduceGame(game, {
    type: 'ASSEMBLE',
    source: { type: 'hand', cardIds: [huang.id, zhong.id] },
    target: { column: 0, row: 0 },
  }).state;
  return game;
}

function forceSingleEnemy(game, options = {}) {
  const board = options.noUnits
    ? { ...game.combat.board, units: {} }
    : {
      ...game.combat.board,
      units: Object.fromEntries(Object.entries(game.combat.board.units).map(([id, unit]) => [
        id, { ...unit, cooldown: 0 },
      ])),
    };
  const lane = Object.values(game.combat.board.units)[0]?.cell.column ?? 0;
  return {
    ...game,
    wallHp: options.wallHp ?? game.wallHp,
    currentBattle: {
      ...game.currentBattle,
      phaseIndex: options.phaseIndex ?? game.currentBattle.phaseIndex,
    },
    combat: {
      ...game.combat,
      phaseIndex: options.phaseIndex ?? game.combat.phaseIndex,
      wallHp: options.wallHp ?? game.combat.wallHp,
      board,
      enemies: [{
        id: 'lifecycle-enemy',
        definitionId: 'soldier',
        lane,
        distance: 0,
        hp: options.enemyHp ?? 1,
        maxHp: options.enemyHp ?? 1,
        cooldown: 0,
        phase: 1,
        phaseTwoTriggered: false,
        statuses: [],
      }],
    },
  };
}

test('battle lifecycle module exposes explicit finish boundaries', () => {
  assert.equal(typeof finishPhase, 'function');
  assert.equal(typeof finishBattle, 'function');
});

test('startBattle preserves expedition camp while resetting battle-local state', () => {
  const game = createExpedition('battle-start');
  const campCard = game.deck.drawPile[0];
  const prepared = {
    ...game,
    deck: { ...game.deck, drawPile: game.deck.drawPile.slice(1) },
    camp: { capacity: game.camp.capacity + 1, cardIds: [campCard.id] },
    temporary: { extraRerolls: 1, extraCamp: 0 },
  };
  const result = startBattle(prepared);
  assert.equal(result.ok, true);
  assert.equal(result.state.status, 'configuration');
  assert.deepEqual(result.state.camp, prepared.camp);
  assert.equal(result.state.deck.freeRerollsRemaining, 2);
  assert.equal(result.state.temporary.extraRerolls, 0);
  assert.equal(result.state.currentBattle.phaseIndex, 0);
  assertCardOwnership(result.state);
});

test('startBattle and startPhase return structured failures for invalid lifecycle input', () => {
  const noStage = { ...createExpedition('battle-no-stage'), nextStageId: null };
  const missing = startBattle(noStage);
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, 'NO_STAGE_SELECTED');
  assert.equal(missing.state, noStage);

  const noBattle = { ...createExpedition('battle-no-current'), status: 'configuration', currentBattle: null };
  const noCurrent = startPhase(noBattle);
  assert.equal(noCurrent.ok, false);
  assert.equal(noCurrent.error.code, 'NO_CURRENT_BATTLE');
  assert.equal(noCurrent.state, noBattle);
});

test('startPhase creates combat without mutating configured gameplay state', () => {
  const game = prepareConfiguredBattle('battle-phase-start');
  const before = JSON.stringify(game);
  const result = startPhase(game);
  assert.equal(result.ok, true);
  assert.equal(result.state.status, 'combat');
  assert.equal(result.state.combat.phaseIndex, 0);
  assert.equal(result.state.combat.enemies.length > 0, true);
  assert.equal(JSON.stringify(game), before);
  assertCardOwnership(result.state);
});

test('stepBattleCombat keeps a running combat in combat status', () => {
  const configured = prepareConfiguredBattle('battle-running');
  const started = startPhase(configured).state;
  const result = stepBattleCombat(started);
  assert.equal(result.ok, true);
  assert.equal(result.state.status, 'combat');
  assert.equal(result.state.combat.turn, 1);
  assertCardOwnership(result.state);
});

test('phase victory returns to configuration and preserves expedition camp', () => {
  let configured = prepareConfiguredBattle('battle-phase-finish');
  const campCard = configured.deck.hand[0];
  configured = reduceGame(configured, { type: 'MOVE_CARD_TO_CAMP', cardId: campCard.id }).state;
  const started = startPhase(configured).state;
  const result = stepBattleCombat(forceSingleEnemy(started));
  assert.equal(result.ok, true);
  assert.equal(result.state.status, 'configuration');
  assert.equal(result.state.currentBattle.phaseIndex, 1);
  assert.deepEqual(result.state.camp.cardIds, [campCard.id]);
  assert.equal(result.state.deck.discardPile.some(({ id }) => id === campCard.id), false);
  assert.equal(result.events.some(({ type }) => type === 'BATTLE_PHASE_COMPLETED'), true);
  assertCardOwnership(result.state);
});

test('final phase victory enters reward with a completed battle event', () => {
  const configured = prepareConfiguredBattle('battle-finish');
  const started = startPhase(configured).state;
  const finalPhase = configured.currentBattle.phaseCount - 1;
  const result = stepBattleCombat(forceSingleEnemy(started, { phaseIndex: finalPhase }));
  assert.equal(result.ok, true);
  assert.equal(result.state.status, 'reward');
  assert.equal(result.state.currentBattleResult, 'victory');
  assert.equal(result.state.rewardChoices.length > 0, true);
  assert.equal(result.events.some(({ type }) => type === 'BATTLE_COMPLETED'), true);
  assertCardOwnership(result.state);
});

test('wall defeat enters defeat and releases cards from defeated board units', () => {
  const configured = prepareConfiguredBattle('battle-defeat');
  const started = startPhase(configured).state;
  const result = stepBattleCombat(forceSingleEnemy(started, {
    noUnits: true,
    wallHp: 1,
    enemyHp: 8,
  }));
  assert.equal(result.ok, true);
  assert.equal(result.state.status, 'defeat');
  assert.equal(result.state.wallHp, 0);
  assert.equal(result.state.deck.deployed.length, 0);
  assertCardOwnership(result.state);
});
