import test from 'node:test';
import assert from 'node:assert/strict';
import { GENERALS, GENERAL_BY_ID } from '../data/generals.js';
import { RECIPES, STARTING_SYMBOLS } from '../data/recipes.js';

const EXPECTED_STARTING_COUNTS = Object.freeze({
  兵: 7,
  盾: 3,
  槍: 3,
  弓: 3,
  騎: 3,
  軍: 1,
  醫: 1,
  斥: 1,
  候: 1,
  謀: 1,
  士: 1,
  張: 2,
  任: 2,
  平: 2,
  飛: 1,
  峻: 1,
  關: 1,
  羽: 1,
  王: 1,
  趙: 1,
  雲: 1,
  凌: 1,
  統: 1,
});

const EXPECTED_STARTING_RECIPES = Object.freeze({
  'shield-troop': ['兵', '盾'],
  'spear-troop': ['兵', '槍'],
  archer: ['兵', '弓'],
  cavalry: ['兵', '騎'],
  'field-medic': ['軍', '醫'],
  scout: ['斥', '候'],
  strategist: ['謀', '士'],
  'zhang-fei': ['張', '飛'],
  'zhang-ren': ['張', '任'],
  'ren-jun': ['任', '峻'],
  'guan-yu': ['關', '羽'],
  'guan-ping': ['關', '平'],
  'wang-ping': ['王', '平'],
  'zhao-yun': ['趙', '雲'],
  'zhao-tong': ['趙', '統'],
  'ling-tong': ['凌', '統'],
});

const EXPECTED_TIERS = Object.freeze({
  'shield-troop': 'troop',
  'spear-troop': 'troop',
  archer: 'troop',
  cavalry: 'troop',
  'field-medic': 'troop',
  scout: 'troop',
  strategist: 'troop',
  'ren-jun': 'ordinary',
  'guan-ping': 'ordinary',
  'zhao-tong': 'ordinary',
  'zhang-ren': 'notable',
  'wang-ping': 'notable',
  'ling-tong': 'notable',
  'zhang-fei': 'famous',
  'guan-yu': 'famous',
  'zhao-yun': 'famous',
});

function countSymbols(symbols) {
  const counts = {};
  for (const symbol of symbols) counts[symbol] = (counts[symbol] ?? 0) + 1;
  return counts;
}

function canonicalSymbols(symbols) {
  return [...symbols].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
}

test('starting deck is the approved fixed 40-card shared-character network', () => {
  assert.equal(STARTING_SYMBOLS.length, 40);
  assert.deepEqual(countSymbols(STARTING_SYMBOLS), EXPECTED_STARTING_COUNTS);
});

test('all sixteen approved starting recipes exist with the correct visibility', () => {
  const byId = Object.fromEntries(RECIPES.map((recipe) => [recipe.id, recipe]));

  for (const [id, symbols] of Object.entries(EXPECTED_STARTING_RECIPES)) {
    const recipe = byId[id];
    assert.ok(recipe, `missing starting recipe ${id}`);
    assert.deepEqual(canonicalSymbols(recipe.symbols), canonicalSymbols(symbols), `${id} symbols`);
    assert.equal(recipe.availability, 'starting', `${id} availability`);
    assert.equal(
      recipe.visibility,
      recipe.outputType === 'troop' ? 'public' : 'clue',
      `${id} visibility`,
    );
  }
});

test('the starting network has no unusable symbol and every output has playable metadata', () => {
  const startingRecipes = RECIPES.filter((recipe) => recipe.availability === 'starting');
  const usableSymbols = new Set(startingRecipes.flatMap((recipe) => recipe.symbols));

  for (const symbol of new Set(STARTING_SYMBOLS)) {
    assert.ok(usableSymbols.has(symbol), `starting symbol ${symbol} has no starting recipe`);
  }

  for (const [id, tier] of Object.entries(EXPECTED_TIERS)) {
    const unit = GENERAL_BY_ID[id];
    assert.ok(unit, `missing unit ${id}`);
    assert.equal(unit.tier, tier, `${id} tier`);
    assert.ok(Number.isFinite(unit.maxHp) && unit.maxHp > 0, `${id} maxHp`);
    assert.ok(Number.isFinite(unit.damage) && unit.damage > 0, `${id} damage`);
    assert.ok(Number.isFinite(unit.attackEvery) && unit.attackEvery > 0, `${id} attackEvery`);
    assert.ok(Number.isFinite(unit.range) && unit.range > 0, `${id} range`);
    assert.equal(typeof unit.rangeLabel, 'string', `${id} rangeLabel`);
    assert.ok(unit.rangeLabel.trim(), `${id} rangeLabel must not be blank`);
    assert.equal(typeof unit.ability, 'string', `${id} ability`);
    assert.ok(unit.ability.trim(), `${id} ability must not be blank`);
  }
});

test('legacy famous generals are reward-pack content, not starting-deck leakage', () => {
  const startingSet = new Set(STARTING_SYMBOLS);
  const rareIds = ['huang-zhong', 'lu-bu', 'lu-meng', 'zhuge-liang'];
  const recipesById = Object.fromEntries(RECIPES.map((recipe) => [recipe.id, recipe]));

  for (const id of rareIds) {
    const unit = GENERAL_BY_ID[id];
    const recipe = recipesById[id];
    assert.ok(unit, `missing rare unit ${id}`);
    assert.ok(recipe, `missing rare recipe ${id}`);
    assert.equal(recipe.availability, 'reward-pack', `${id} availability`);
    assert.equal(recipe.visibility, 'silhouette', `${id} visibility`);
  }

  for (const symbol of ['黃', '忠', '呂', '布', '蒙', '諸', '葛', '亮']) {
    assert.equal(startingSet.has(symbol), false, `${symbol} must not leak into the starting 40`);
  }

  assert.equal(new Set(GENERALS.map((unit) => unit.id)).size, GENERALS.length, 'unit ids must remain unique');
});
