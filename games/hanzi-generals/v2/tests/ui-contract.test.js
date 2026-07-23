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

test('v2 shell exposes every fixed semantic game region', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8');
  const requiredIds = [
    'run-status',
    'enemy-intents',
    'battle-board',
    'camp',
    'hand',
    'primary-actions',
    'orders',
    'details-panel',
    'action-message',
  ];
  for (const id of requiredIds) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /data-action="pause"/);
  assert.match(html, /data-action="set-speed"/);
  assert.match(html, /data-action="issue-order"/);
  assert.match(html, /aria-live="assertive"/);
});

test('v2 shell keeps mobile accessibility and reduced-motion baselines', async () => {
  const css = await readFile(new URL('styles/game.css', root), 'utf8');
  assert.match(css, /min-width:\s*320px/);
  assert.match(css, /min-width:\s*44px/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /\.intent-countdown/);
  assert.match(css, /\[data-reduced-motion="true"\]/);
  assert.match(css, /@media\s*\(max-width:\s*359px\)/);
});

test('interaction layer contains tap alternatives for every core action', async () => {
  const source = await readFile(new URL('src/ui/interactions.js', root), 'utf8');
  for (const action of [
    'select-card',
    'choose-cell',
    'move-card-to-camp',
    'draw-cards',
    'reroll',
    'start-phase',
    'choose-route',
    'choose-reward',
    'issue-order',
  ]) {
    assert.match(source, new RegExp(`'${action}'`));
  }
});
