import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

test('v2 shell exposes the hidden game root and module entry', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8');
  assert.match(html, /id="v2-game-app"/);
  assert.match(html, /src="\.\/src\/app\.js"/);
  assert.match(html, /styles\/interaction-fix\.css/);
  assert.doesNotMatch(html, /projects\.json/);
});

test('v2 shell exposes every fixed semantic game region', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8');
  const requiredIds = [
    'run-status',
    'enemy-intents',
    'enemy-field',
    'battle-board',
    'camp',
    'hand',
    'primary-actions',
    'orders',
    'details-panel',
    'action-message',
  ];
  for (const id of requiredIds) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /class="battle-stage"/);
  assert.match(html, /class="command-panel"/);
  assert.match(html, /data-action="pause"/);
  assert.match(html, /data-action="set-speed"/);
  assert.match(html, /data-action="issue-order"/);
  assert.match(html, /aria-live="assertive"/);
});

test('v2 shell keeps mobile accessibility and top-to-bottom battle baselines', async () => {
  const baseCss = await readFile(new URL('styles/game.css', root), 'utf8');
  const fixCss = await readFile(new URL('styles/interaction-fix.css', root), 'utf8');
  const css = `${baseCss}\n${fixCss}`;
  assert.match(css, /min-width:\s*320px/);
  assert.match(css, /min-width:\s*44px/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /\.intent-countdown/);
  assert.match(css, /\[data-reduced-motion="true"\]/);
  assert.match(css, /@media\s*\(max-width:\s*359px\)/);
  assert.match(css, /#enemy-field/);
  assert.match(css, /\.enemy-lane-track/);
  assert.match(css, /\.enemy-token/);
  assert.match(fixCss, /transition:\s*top/);
  assert.match(fixCss, /grid-template-columns:\s*repeat\(var\(--enemy-columns\)/);
  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none/);
  assert.match(fixCss, /\.is-focused/);
  assert.match(fixCss, /\.is-fortified/);
  assert.match(fixCss, /\.is-order-target/);
  assert.match(
    fixCss,
    /\.enemy-token\.is-order-target[\s\S]*?pointer-events:\s*auto/,
    'focus targets must override the base pointer-events:none rule',
  );
});

test('interaction layer contains tap alternatives for every core action', async () => {
  const source = await readFile(new URL('src/ui/interactions.js', root), 'utf8');
  for (const action of [
    'select-card',
    'select-camp-card',
    'return-camp-card',
    'choose-cell',
    'move-card-to-camp',
    'draw-cards',
    'reroll',
    'start-phase',
    'choose-route',
    'choose-reward',
    'begin-order',
    'order-select-unit',
    'order-reposition-target',
    'order-focus-target',
    'cancel-order',
    'issue-order',
  ]) {
    assert.match(source, new RegExp(`'${action}'`));
  }
});

test('render layer spatially renders enemies from top to bottom', async () => {
  const base = await readFile(new URL('src/ui/render.js', root), 'utf8');
  const interactive = await readFile(new URL('src/ui/render-interactive.js', root), 'utf8');
  const source = `${base}\n${interactive}`;
  assert.match(source, /renderEnemyField/);
  assert.match(source, /dataEnemyId/);
  assert.match(source, /--enemy-progress/);
  assert.match(source, /enemy\.distance/);
  assert.match(interactive, /--enemy-columns/);
});

test('render layer exposes camp selection and visible order state', async () => {
  const source = await readFile(new URL('src/ui/render-interactive.js', root), 'utf8');
  assert.match(source, /select-camp-card/);
  assert.match(source, /remainingFriendlyTurns/);
  assert.match(source, /remainingEnemyTurns/);
  assert.match(source, /begin-order/);
});
