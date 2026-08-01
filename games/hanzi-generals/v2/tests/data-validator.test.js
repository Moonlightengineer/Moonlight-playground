import test from 'node:test';
import assert from 'node:assert/strict';
import { validateGameData } from '../src/core/data-validator.js';
import { GENERALS } from '../data/generals.js';
import { ENEMIES } from '../data/enemies.js';
import { RECIPES, STARTING_SYMBOLS } from '../data/recipes.js';
import { STAGES } from '../data/stages.js';
import { REWARDS } from '../data/rewards.js';
import { TUNING } from '../data/tuning.js';

const approvedData = { GENERALS, ENEMIES, RECIPES, STAGES, REWARDS, TUNING, STARTING_SYMBOLS };

test('approved vertical slice data is internally consistent', () => {
  const result = validateGameData(approvedData);
  assert.deepEqual(result, { ok: true, errors: [] });
});

test('every selectable reward has a complete player-facing explanation', () => {
  for (const reward of REWARDS) {
    assert.equal(typeof reward.description?.summary, 'string', `${reward.id} summary must be a string`);
    assert.ok(reward.description.summary.trim(), `${reward.id} summary must not be blank`);
    assert.equal(typeof reward.description?.effect, 'string', `${reward.id} effect must be a string`);
    assert.ok(reward.description.effect.trim(), `${reward.id} effect must not be blank`);
    assert.equal(typeof reward.description?.useCase, 'string', `${reward.id} useCase must be a string`);
    assert.ok(reward.description.useCase.trim(), `${reward.id} useCase must not be blank`);
  }
});

test('validator rejects a reward with an incomplete explanation', () => {
  const badRewards = REWARDS.map((reward) => (
    reward.id === 'repair-wall'
      ? { ...reward, description: { summary: '修補城牆。', effect: '', useCase: '城牆受損時使用。' } }
      : reward
  ));
  const result = validateGameData({ ...approvedData, REWARDS: badRewards });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /reward repair-wall missing description\.effect/);
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
