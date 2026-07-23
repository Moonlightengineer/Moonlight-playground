import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

test('v2 shell exposes the hidden game root and module entry', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8');
  assert.match(html, /id="v2-game-app"/);
  assert.match(html, /src="\.\/src\/app\.js"/);
  assert.doesNotMatch(html, /projects\.json/);
});

test('v2 shell keeps mobile and accessibility baselines', async () => {
  const css = await readFile(new URL('styles/game.css', root), 'utf8');
  assert.match(css, /min-width:\s*320px/);
  assert.match(css, /min-width:\s*44px/);
  assert.match(css, /prefers-reduced-motion/);
});
