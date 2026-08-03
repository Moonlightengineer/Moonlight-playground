import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRecipeCodex, recordRecipeDiscoveries } from '../src/ui/recipe-codex.js';
import { createExpedition } from '../src/expedition/expedition.js';
import { buildAppViewModel } from '../src/ui/view-model.js';

function byId(codex, id) {
  return codex.entries.find((entry) => entry.id === id);
}

test('recipe codex applies public, clue, locked and discovered visibility states', () => {
  const game = createExpedition('recipe-codex-states');
  const base = buildRecipeCodex(game, { discoveredRecipeIds: [] });

  assert.equal(byId(base, 'archer').state, 'public');
  assert.equal(byId(base, 'archer').name, '弓兵');
  assert.equal(byId(base, 'archer').symbolsLabel, '兵＋弓');
  assert.match(byId(base, 'archer').detailText, /遠程射擊/);

  assert.equal(byId(base, 'zhang-fei').state, 'clue');
  assert.equal(byId(base, 'zhang-fei').name, '未發現武將');
  assert.equal(byId(base, 'zhang-fei').symbolsLabel, '張＋飛');
  assert.equal(byId(base, 'zhang-fei').detailText, null);

  assert.equal(byId(base, 'huang-zhong').state, 'locked');
  assert.equal(byId(base, 'huang-zhong').name, '？？？');
  assert.equal(byId(base, 'huang-zhong').symbolsLabel, '？＋？');

  const unlocked = buildRecipeCodex({
    ...game,
    unlockedRecipes: [...game.unlockedRecipes, 'huang-zhong'],
  }, { discoveredRecipeIds: [] });
  assert.equal(byId(unlocked, 'huang-zhong').state, 'clue');
  assert.equal(byId(unlocked, 'huang-zhong').name, '稀有武將');
  assert.equal(byId(unlocked, 'huang-zhong').symbolsLabel, '黃＋忠');

  const discovered = buildRecipeCodex(game, {
    discoveredRecipeIds: ['zhang-fei', 'huang-zhong'],
  });
  assert.equal(byId(discovered, 'zhang-fei').state, 'discovered');
  assert.equal(byId(discovered, 'zhang-fei').name, '張飛');
  assert.match(byId(discovered, 'zhang-fei').detailText, /震喝/);
  assert.equal(byId(discovered, 'huang-zhong').name, '黃忠');
});

test('assembled unit events permanently add unique recipe discoveries', () => {
  const next = recordRecipeDiscoveries(['zhang-fei'], [
    { type: 'UNIT_ASSEMBLED', payload: { definitionId: 'zhang-fei' } },
    { type: 'UNIT_ASSEMBLED', payload: { definitionId: 'guan-yu' } },
    { type: 'ENEMY_DEFEATED', payload: { definitionId: 'huang-zhong' } },
  ]);
  assert.deepEqual(next, ['zhang-fei', 'guan-yu']);
});

test('ViewModel exposes codex summary inside the existing details panel', () => {
  const game = createExpedition('recipe-codex-view-model');
  const viewModel = buildAppViewModel(game, {
    settings: { reducedMotion: false, vibration: true, speed: 1 },
    tutorial: null,
    discoveredRecipeIds: ['zhang-fei'],
  }, {});

  assert.equal(viewModel.details.visible, true);
  assert.equal(viewModel.details.codex.total, 20);
  assert.equal(viewModel.details.codex.discovered, 8);
  assert.equal(byId(viewModel.details.codex, 'zhang-fei').name, '張飛');
});
