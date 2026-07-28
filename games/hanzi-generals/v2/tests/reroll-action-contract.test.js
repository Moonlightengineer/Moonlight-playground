import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('canonical interaction emits a payload-free REROLL command', async () => {
  const interactions = await source('src/ui/interactions.js');
  assert.match(interactions, /dispatch\(\{ type: 'REROLL' \}\)/);
  assert.doesNotMatch(interactions, /lockedCardIds/);
});

test('canonical state-machine wrapper never reads legacy reroll payload ids', async () => {
  const stateMachine = await source('src/core/state-machine.js');
  assert.match(stateMachine, /rerollRetainedHand\(game\.deck, game\.rng/);
  assert.doesNotMatch(stateMachine, /action\.lockedCardIds/);
});
