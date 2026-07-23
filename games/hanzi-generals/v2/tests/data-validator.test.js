import test from 'node:test';
import assert from 'node:assert/strict';
import { validateGameData } from '../src/core/data-validator.js';
import { GENERALS } from '../data/generals.js';
import { ENEMIES } from '../data/enemies.js';
import { RECIPES } from '../data/recipes.js';
import { STAGES } from '../data/stages.js';
import { REWARDS } from '../data/rewards.js';
import { TUNING } from '../data/tuning.js';

const approvedData = { GENERALS, ENEMIES, RECIPES, STAGES, REWARDS, TUNING };

test('approved vertical slice data is internally consistent', () => {
  const result = validateGameData(approvedData);
  assert.deepEqual(result, { ok: true, errors: [] });
});

test('validator rejects a recipe pointing to a missing unit', () => {
  const bad = RECIPES.map((item) => (
    item.id === 'huang-zhong' ? { ...item, outputId: 'missing' } : item
  ));
  const result = validateGameData({ ...approvedData, RECIPES: bad });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /missing outputId/);
});

test('validator rejects missing scripted stage and reward ids', () => {
  const result = validateGameData({
    ...approvedData,
    STAGES: STAGES.filter(({ id }) => id !== 'hua-xiong'),
    REWARDS: REWARDS.filter(({ id }) => id !== 'expand-depth'),
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /missing stage hua-xiong/);
  assert.match(result.errors.join('\n'), /missing reward expand-depth/);
});
