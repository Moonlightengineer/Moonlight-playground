import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('combat feedback exposes an awaitable presentation sequence', async () => {
  const feedback = await source('src/ui/combat-feedback.js');
  assert.match(feedback, /return\s+drain\(\)/);
  assert.match(feedback, /return\s*\{\s*present,\s*clear,\s*whenIdle\s*\}/);
});

test('battle ticks wait for combat feedback before scheduling the next step', async () => {
  const app = await source('src/app.js');
  assert.match(app, /feedbackSequence\s*=\s*feedback\.present\(events\)/);
  assert.match(app, /feedback\.whenIdle\(\)\.finally/);
  assert.match(app, /pacingRequest/);
});
