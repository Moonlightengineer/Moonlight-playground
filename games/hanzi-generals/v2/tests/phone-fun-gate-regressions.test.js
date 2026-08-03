import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createExpedition } from '../src/expedition/expedition.js';
import { finishPhase } from '../src/battle/battle-lifecycle.js';
import { reduceGame } from '../src/core/state-machine.js';

function startConfiguration(seed = 'phone-fun-gate') {
  return reduceGame(createExpedition(seed), { type: 'START_BATTLE' }).state;
}

function assembleTutorialZhangFei(game) {
  let next = reduceGame(game, { type: 'DRAW_CARDS' }).state;
  const zhang = next.deck.hand.find(({ symbol }) => symbol === '張');
  const fei = next.deck.hand.find(({ symbol }) => symbol === '飛');
  next = reduceGame(next, { type: 'SELECT_CARD', cardId: zhang.id }).state;
  next = reduceGame(next, { type: 'ASSEMBLE', target: { column: 0, row: 0 } }).state;
  next = reduceGame(next, { type: 'SELECT_CARD', cardId: fei.id }).state;
  return reduceGame(next, { type: 'ASSEMBLE', target: { column: 1, row: 0 } }).state;
}

test('each configuration phase has one visible draw budget and cannot refill repeatedly', () => {
  const game = startConfiguration('draw-budget');
  assert.equal(game.currentBattle.drawsRemaining, 1);

  const first = reduceGame(game, { type: 'DRAW_CARDS' });
  assert.equal(first.ok, true);
  assert.equal(first.state.currentBattle.drawsRemaining, 0);
  assert.equal(first.state.deck.hand.length, 5);

  const cardId = first.state.deck.hand[0].id;
  const moved = reduceGame(first.state, { type: 'MOVE_CARD_TO_CAMP', cardId });
  assert.equal(moved.ok, true);
  assert.equal(moved.state.deck.hand.length, 4);

  const second = reduceGame(moved.state, { type: 'DRAW_CARDS' });
  assert.equal(second.ok, false);
  assert.equal(second.error.code, 'DRAW_LIMIT_REACHED');
  assert.equal(second.state.deck.hand.length, 4);
});

test('draw budget resets through the real same-battle phase boundary', () => {
  let game = assembleTutorialZhangFei(startConfiguration('draw-reset'));
  const combat = reduceGame(game, { type: 'START_PHASE' });
  assert.equal(combat.ok, true);
  assert.equal(combat.state.currentBattle.phaseIndex, 0);
  assert.equal(combat.state.currentBattle.drawsRemaining, 0);

  const completed = finishPhase(
    combat.state,
    { ...combat.state.combat, status: 'victory' },
    [],
  );
  assert.equal(completed.ok, true);
  assert.equal(completed.state.status, 'configuration');
  assert.equal(completed.state.currentBattle.phaseIndex, 1);
  assert.equal(completed.state.currentBattle.drawsRemaining, 1);

  const nextDraw = reduceGame(completed.state, { type: 'DRAW_CARDS' });
  assert.equal(nextDraw.ok, true);
  assert.equal(nextDraw.state.currentBattle.drawsRemaining, 0);
  const repeated = reduceGame(nextDraw.state, { type: 'DRAW_CARDS' });
  assert.equal(repeated.ok, false);
  assert.equal(repeated.error.code, 'DRAW_LIMIT_REACHED');
});

test('redeploy is a functional one-shot public military order', () => {
  let game = assembleTutorialZhangFei(startConfiguration('combat-move'));
  const combat = reduceGame(game, { type: 'START_PHASE' });
  assert.equal(combat.ok, true);
  const before = combat.state.combat.board.units['unit-1'].cell;
  const ordersBefore = combat.state.combat.ordersRemaining;

  const moved = reduceGame(combat.state, {
    type: 'ISSUE_ORDER',
    order: {
      type: 'redeploy',
      unitId: 'unit-1',
      target: { column: 1, row: 1 },
    },
  });
  assert.equal(moved.ok, true);
  assert.notDeepEqual(moved.state.combat.board.units['unit-1'].cell, before);
  assert.deepEqual(moved.state.combat.board.units['unit-1'].cell, { column: 1, row: 1 });
  assert.equal(moved.state.combat.ordersRemaining, ordersBefore - 1);

  const noOp = reduceGame(moved.state, {
    type: 'ISSUE_ORDER',
    order: {
      type: 'redeploy',
      unitId: 'unit-1',
      target: { column: 1, row: 1 },
    },
  });
  assert.equal(noOp.ok, false);
  assert.equal(noOp.error.code, 'ILLEGAL_REDEPLOY_TARGET');
  assert.deepEqual(noOp.state.combat.board.units['unit-1'].cell, { column: 1, row: 1 });
});

test('help and codex stay in the UI/browser boundary and outside military orders', async () => {
  const root = new URL('../../../../', import.meta.url);
  const [html, interactions, ordersPanel] = await Promise.all([
    readFile(new URL('games/hanzi-generals/v2/index.html', root), 'utf8'),
    readFile(new URL('games/hanzi-generals/v2/src/ui/interactions.js', root), 'utf8'),
    readFile(new URL('games/hanzi-generals/v2/src/ui/panels/combat-orders-panel.js', root), 'utf8'),
  ]);

  assert.match(html, /data-action="open-help"/);
  assert.match(html, /data-action="open-codex"/);
  assert.match(interactions, /open-help/);
  assert.match(interactions, /open-codex/);
  assert.doesNotMatch(ordersPanel, /open-help|open-codex|玩法|字典/);
});

test('phone browser gate covers the remaining player-visible regressions', async () => {
  const root = new URL('../../../../', import.meta.url);
  const script = await readFile(new URL('scripts/hanzi_v2_browser_ui_regressions.mjs', root), 'utf8');
  assert.match(script, /reward.*reload|reload.*reward/is);
  assert.match(script, /open-codex/);
  assert.match(script, /wall.*enemy|enemy.*wall/is);
  assert.match(script, /fortify.*assault.*focus|order.*observable/is);
});
