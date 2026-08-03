import test from 'node:test';
import assert from 'node:assert/strict';

import { GENERAL_BY_ID } from '../data/generals.js';
import { buildUnitPlayerDetail } from '../src/ui/unit-copy.js';
import { buildAppViewModel } from '../src/ui/view-model.js';
import { createExpedition } from '../src/expedition/expedition.js';

function combatGameWithUnit(definitionId, evolution = null) {
  const game = createExpedition('unit-detail-view-model');
  const base = GENERAL_BY_ID[definitionId];
  const unit = {
    id: 'unit-1', definitionId, kind: base.kind,
    hp: base.maxHp, maxHp: base.maxHp, cooldown: 0,
    evolution, statuses: [], cell: { column: 0, row: 0 },
  };
  const board = { ...game.board, units: { [unit.id]: unit } };
  return {
    ...game,
    status: 'combat',
    board,
    deck: {
      ...game.deck,
      drawPile: game.deck.drawPile.slice(2),
      deployed: [{ unitId: unit.id, cardIds: game.deck.drawPile.slice(0, 2).map(({ id }) => id) }],
    },
    combat: {
      turn: 1, status: 'running', board, enemies: [],
      wallHp: game.wallHp, phaseIndex: 0, ordersRemaining: 3,
      focus: null, fortify: null, pendingOrders: [], tactics: [], paused: true,
    },
  };
}

test('base unit detail uses player-facing Chinese copy and real combat numbers', () => {
  const detail = buildUnitPlayerDetail(GENERAL_BY_ID['zhang-fei']);

  assert.equal(detail.tierLabel, '名將');
  assert.equal(detail.rangeLabel, '同路前排');
  assert.equal(detail.attackMethodLabel, '攻擊同路最近敵人');
  assert.match(detail.ability, /震喝/);
  assert.match(detail.statsLabel, /生命 34/);
  assert.match(detail.statsLabel, /傷害 5/);
  assert.match(detail.statsLabel, /每 2 回合攻擊/);
  assert.equal(detail.text.includes('same-lane'), false);
  assert.equal(detail.text.includes('tank'), false);
});

test('evolved unit detail reports effective values and evolution effect', () => {
  const detail = buildUnitPlayerDetail(GENERAL_BY_ID['zhao-yun'], 'seven-charges');

  assert.equal(detail.evolutionLabel, '七進七出');
  assert.match(detail.statsLabel, /傷害 7/);
  assert.match(detail.statsLabel, /射程 2/);
  assert.match(detail.evolutionEffect, /傷害 \+2、射程 \+1/);
  assert.equal(detail.text.includes('pierce'), false);
});

test('unknown internal pattern falls back to player-facing copy', () => {
  const detail = buildUnitPlayerDetail({
    ...GENERAL_BY_ID.archer,
    pattern: 'future-internal-pattern',
  });

  assert.equal(detail.attackMethodLabel, '按單位規則攻擊');
  assert.equal(detail.text.includes('future-internal-pattern'), false);
});

test('unit cell ViewModel exposes localized actual detail without internal role or pattern values', () => {
  const game = combatGameWithUnit('zhao-yun', 'seven-charges');
  const viewModel = buildAppViewModel(game, {
    settings: { reducedMotion: false, vibration: true, speed: 1 },
    tutorial: null,
  }, {});
  const cell = viewModel.battleStage.cells.find(({ unitId }) => unitId === 'unit-1');

  assert.match(cell.title, /趙雲/);
  assert.match(cell.title, /名將/);
  assert.match(cell.title, /同路突擊/);
  assert.match(cell.title, /傷害 7/);
  assert.match(cell.ariaLabel, /目前生命 24\/24/);
  assert.equal(cell.title.includes('charge'), false);
  assert.equal(cell.title.includes('pierce'), false);
});
