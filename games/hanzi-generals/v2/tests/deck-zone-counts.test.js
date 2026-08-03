import test from 'node:test';
import assert from 'node:assert/strict';

import { selectDeckZoneCounts } from '../src/core/selectors/cards.js';
import { reduceGame } from '../src/core/state-machine.js';
import { createExpedition } from '../src/expedition/expedition.js';
import { buildAppViewModel } from '../src/ui/view-model.js';

function shapedOwnershipState() {
  const game = createExpedition('deck-zone-counts');
  const [campCard, handCard, discardCard, boardCard, deployedA, deployedB, ...drawPile] = game.deck.drawPile;
  const unit = {
    id: 'unit-1',
    definitionId: 'shield-troop',
    kind: 'troop',
    hp: 22,
    maxHp: 22,
    cooldown: 0,
    evolution: null,
    statuses: [],
    cell: { column: 1, row: 1 },
  };
  return {
    ...game,
    board: { ...game.board, units: { [unit.id]: unit } },
    boardCards: { '0,0': boardCard.id },
    deck: {
      ...game.deck,
      drawPile,
      discardPile: [discardCard],
      hand: [handCard],
      deployed: [{ unitId: unit.id, cardIds: [deployedA.id, deployedB.id] }],
    },
    camp: { ...game.camp, cardIds: [campCard.id] },
  };
}

test('selectDeckZoneCounts reconciles every owner zone with the canonical registry', () => {
  const counts = selectDeckZoneCounts(shapedOwnershipState());
  assert.deepEqual(counts, {
    drawPile: 34,
    discardPile: 1,
    hand: 1,
    camp: 1,
    deployed: 3,
    total: 40,
    ownedTotal: 40,
    reconciled: true,
  });
});

test('selectDeckZoneCounts exposes registry and ownership mismatch without hiding it', () => {
  const game = createExpedition('deck-zone-mismatch');
  const missingOwner = game.deck.drawPile[0];
  const counts = selectDeckZoneCounts({
    ...game,
    deck: {
      ...game.deck,
      drawPile: game.deck.drawPile.filter(({ id }) => id !== missingOwner.id),
    },
  });

  assert.equal(counts.total, 40);
  assert.equal(counts.ownedTotal, 39);
  assert.equal(counts.reconciled, false);
});

test('run status exposes six mobile-readable card counts from the canonical selector', () => {
  let game = reduceGame(createExpedition('deck-zone-view-model'), { type: 'START_BATTLE' }).state;
  game = reduceGame(game, { type: 'DRAW_CARDS' }).state;
  const viewModel = buildAppViewModel(game, {
    settings: { reducedMotion: false, vibration: true, speed: 1 },
    tutorial: game.tutorial,
  }, {});

  assert.deepEqual(viewModel.runStatus.cardCounts, [
    { key: 'drawPile', label: '抽牌', count: 35 },
    { key: 'discardPile', label: '棄牌', count: 0 },
    { key: 'hand', label: '手牌', count: 5 },
    { key: 'camp', label: '軍營', count: 0 },
    { key: 'deployed', label: '戰場', count: 0 },
    { key: 'total', label: '總數', count: 40 },
  ]);
  assert.equal(viewModel.runStatus.cardCountsReconciled, true);
});
