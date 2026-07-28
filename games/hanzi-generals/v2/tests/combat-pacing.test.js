import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('combat feedback exposes an awaitable per-turn presentation sequence', async () => {
  const feedback = await source('src/ui/combat-feedback.js');
  assert.match(feedback, /queue\.push\(meaningful\)/);
  assert.match(feedback, /const batch = queue\.shift\(\)/);
  assert.match(feedback, /for \(const event of batch\) presentEvent\(event\)/);
  assert.match(feedback, /return\s+drain\(\)/);
  assert.match(feedback, /return\s*\{\s*present,\s*clear,\s*whenIdle\s*\}/);
});

test('AppController waits for feedback idle and invalidates stale battle ticks', async () => {
  const [app, controller] = await Promise.all([
    source('src/app.js'),
    source('src/app-controller.js'),
  ]);
  assert.match(app, /const sequence = feedback\.present\(events\)/);
  assert.match(app, /waitUntilIdle:\s*\(\)\s*=>\s*feedback\.whenIdle\(\)/);
  assert.match(controller, /let scheduleRequest = 0/);
  assert.match(controller, /Promise\.resolve\(idle\)\.finally\(arm\)/);
  assert.match(controller, /request !== scheduleRequest/);
  assert.match(controller, /dispatchIntent\(\{ type: 'STEP_COMBAT' \}\)/);
});
