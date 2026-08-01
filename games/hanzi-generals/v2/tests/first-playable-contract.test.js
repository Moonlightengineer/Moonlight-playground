import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../../../', import.meta.url);

test('browser gate uses the current 40-card first playable flow', async () => {
  const [pkg, script] = await Promise.all([
    readFile(new URL('package.json', root), 'utf8'),
    readFile(new URL('scripts/hanzi_v2_first_playable.mjs', root), 'utf8'),
  ]);
  assert.match(pkg, /hanzi_v2_first_playable\.mjs/);
  assert.match(script, /symbols: \['張', '飛'\], unit: '張飛'/);
  assert.match(script, /between|preparePhase/);
  assert.match(script, /reachedReward/);
});
