import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

test('order status is rendered outside the horizontal action scroller', async () => {
  const [entry, panel, css] = await Promise.all([
    readFile(new URL('src/ui/render-interactive.js', root), 'utf8'),
    readFile(new URL('src/ui/panels/combat-orders-panel.js', root), 'utf8'),
    readFile(new URL('styles/interaction-fix.css', root), 'utf8'),
  ]);

  assert.match(entry, /normalizeGameState/);
  assert.match(panel, /node\('div', 'order-actions'\)/);
  assert.match(panel, /children\.push\(status\)[\s\S]*?children\.push\(actions\)[\s\S]*?replaceChildren\(\.\.\.children\)/);
  assert.match(css, /\.order-actions\s*\{/);
  assert.match(css, /#orders\s*\{[\s\S]*?display:\s*block/);
});
