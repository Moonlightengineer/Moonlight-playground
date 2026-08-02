import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('app entry is dependency wiring around AppController rather than a second orchestrator', async () => {
  const app = await source('src/app.js');
  assert.match(app, /createAppController/);
  assert.match(app, /createRuntimeState/);
  assert.match(app, /controller\.dispatchIntent/);
  assert.match(app, /controller\.render\(\)/);
  assert.doesNotMatch(app, /let game\s*=/);
  assert.doesNotMatch(app, /function dispatch\(/);
  assert.doesNotMatch(app, /function scheduleBattleTick\(/);
  assert.doesNotMatch(app, /reduceGame\(game,/);
});

test('interaction targeting consumes ViewModel targets without reintroducing combat movement', async () => {
  const interactions = await source('src/ui/interactions.js');
  assert.match(interactions, /getViewModel/);
  assert.match(interactions, /focusEnemyIds/);
  assert.match(interactions, /issue-lane-order/);
  assert.doesNotMatch(interactions, /swapPairs/);
  assert.doesNotMatch(interactions, /reinforce/);
  assert.doesNotMatch(interactions, /order-swap-target/);
  assert.doesNotMatch(interactions, /function distance\(/);
  assert.doesNotMatch(interactions, /canFocusEnemy/);
});
