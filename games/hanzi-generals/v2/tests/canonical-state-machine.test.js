import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);

test('state-machine.js is the single canonical reducer and migration entry', async () => {
  const stateMachine = await import('../src/core/state-machine.js');
  assert.equal(typeof stateMachine.reduceGame, 'function');
  assert.equal(typeof stateMachine.normalizeGameState, 'function');
  assert.equal(typeof stateMachine.finalizeGameResult, 'function');

  const legacyReward = {
    status: 'reward',
    rewardChoices: [
      { id: 'evolve-general' },
      { id: 'copy-card' },
      { id: 'remove-card' },
    ],
    evolutions: {},
  };
  const normalized = stateMachine.normalizeGameState(legacyReward);
  assert.equal(normalized.rewardChoices.length, 3);
  assert.equal(normalized.rewardChoices.some(({ id }) => id === 'evolve-general'), false);
});

test('browser and storage use the canonical entry without import-map or reviewed wrapper', async () => {
  const [index, app, storage] = await Promise.all([
    readFile(new URL('index.html', ROOT), 'utf8'),
    readFile(new URL('src/app.js', ROOT), 'utf8'),
    readFile(new URL('src/storage/storage.js', ROOT), 'utf8'),
  ]);

  assert.equal(index.includes('type="importmap"'), false);
  assert.match(app, /from '\.\/core\/state-machine\.js'/);
  assert.match(storage, /from '\.\.\/core\/state-machine\.js'/);
  await assert.rejects(access(new URL('src/core/state-machine-reviewed.js', ROOT)));
});
