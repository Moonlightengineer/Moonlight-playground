import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

test('order status is rendered outside the horizontal action scroller', async () => {
  const render = await readFile(new URL('src/ui/render-interactive.js', root), 'utf8');
  const css = await readFile(new URL('styles/interaction-fix.css', root), 'utf8');

  assert.match(render, /className = 'order-actions'|node\('div', 'order-actions'\)/);
  assert.match(css, /\.order-actions\s*\{/);
  assert.match(css, /#orders\s*\{[\s\S]*?display:\s*block/);
});
