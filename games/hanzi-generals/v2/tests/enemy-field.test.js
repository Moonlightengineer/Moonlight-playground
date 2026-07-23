import test from 'node:test';
import assert from 'node:assert/strict';
import { enemyDistanceToProgress } from '../src/ui/enemy-field.js';

test('enemy distance maps from far edge to the city wall', () => {
  assert.equal(enemyDistanceToProgress(6, 6), 0);
  assert.equal(enemyDistanceToProgress(3, 6), 50);
  assert.equal(enemyDistanceToProgress(0, 6), 100);
});

test('enemy distance progress is clamped to the visible battlefield', () => {
  assert.equal(enemyDistanceToProgress(99, 6), 0);
  assert.equal(enemyDistanceToProgress(-2, 6), 100);
});
