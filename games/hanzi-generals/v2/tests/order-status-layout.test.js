import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

test('order status is rendered outside the horizontal action scroller', async () => {
  const [entry, implementation, css] = await Promise.all([
    readFile(new URL('src/ui/render-interactive.js', root), 'utf8'),
    readFile(new URL('src/ui/render-interactive-base.js', root), 'utf8'),
    readFile(new URL('styles/interaction-fix.css', root), 'utf8'),
  ]);
  const render = `${entry}\n${implementation}`;

  assert.match(entry, /normalizeGameState/);
  assert.match(render, /className = 'order-actions'|node\('div', 'order-actions'\)/);
  assert.match(render, /container\.append\(status\)[\s\S]*?container\.append\(actions\)/);
  assert.match(css, /\.order-actions\s*\{/);
  assert.match(css, /#orders\s*\{[\s\S]*?display:\s*block/);
});
