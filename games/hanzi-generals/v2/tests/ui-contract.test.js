import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), 'utf8').catch(() => '');
}

async function interactiveRenderSource() {
  const [entry, implementation] = await Promise.all([
    source('src/ui/render-interactive.js'),
    source('src/ui/render-interactive-base.js'),
  ]);
  return `${entry}\n${implementation}`;
}

test('v2 shell exposes the hidden game root and module entry', async () => {
  const html = await source('index.html');
  assert.match(html, /id="v2-game-app"/);
  assert.match(html, /src="\.\/src\/app\.js"/);
  assert.match(html, /styles\/interaction-fix\.css/);
  assert.doesNotMatch(html, /projects\.json/);
});

test('v2 shell exposes every fixed semantic game region', async () => {
  const html = await source('index.html');
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
  const baseCss = await source('styles/game.css');
  const fixCss = await source('styles/interaction-fix.css');
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

test('interaction layer exposes only two-unit swaps and eligible focus targets', async () => {
  const interactionSource = await source('src/ui/interactions.js');
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
    'order-swap-target',
    'order-focus-target',
    'cancel-order',
    'issue-order',
  ]) {
    assert.match(interactionSource, new RegExp(`'${action}'`));
  }
  assert.doesNotMatch(interactionSource, /order-reposition-target/);
  assert.match(interactionSource, /data-focus-eligible="true"/);
  assert.match(interactionSource, /unitIds:\s*\[orderMode\.unitId,\s*target\.dataset\.unitId\]/);
});

test('render layer spatially renders enemies from top to bottom', async () => {
  const base = await source('src/ui/render.js');
  const interactive = await interactiveRenderSource();
  const renderSource = `${base}\n${interactive}`;
  assert.match(renderSource, /renderEnemyField/);
  assert.match(renderSource, /dataEnemyId/);
  assert.match(renderSource, /--enemy-progress/);
  assert.match(renderSource, /enemy\.distance/);
  assert.match(interactive, /--enemy-columns/);
});

test('render layer exposes legal order eligibility and visible order state', async () => {
  const renderSource = await interactiveRenderSource();
  assert.match(renderSource, /select-camp-card/);
  assert.match(renderSource, /remainingFriendlyTurns/);
  assert.match(renderSource, /remainingEnemyTurns/);
  assert.match(renderSource, /begin-order/);
  assert.match(renderSource, /adjacentSwapPairExists/);
  assert.match(renderSource, /canFocusEnemy/);
  assert.match(renderSource, /focusEligible/);
});

test('reward choices expose summary, exact effect, and tactical use case', async () => {
  const renderSource = await source('src/ui/render.js');
  const css = await source('styles/game.css');
  assert.match(renderSource, /reward-name/);
  assert.match(renderSource, /reward-summary/);
  assert.match(renderSource, /reward-effect/);
  assert.match(renderSource, /reward-use-case/);
  assert.match(renderSource, /reward\.description\.summary/);
  assert.match(renderSource, /reward\.description\.effect/);
  assert.match(renderSource, /reward\.description\.useCase/);
  assert.match(css, /\.reward-summary/);
  assert.match(css, /\.reward-effect/);
  assert.match(css, /\.reward-use-case/);
});

test('combat feedback is non-blocking, identifiable, and reduced-motion safe', async () => {
  const html = await source('index.html');
  const baseRender = await source('src/ui/render.js');
  const feedback = await source('src/ui/combat-feedback.js');
  const app = await source('src/app.js');
  const css = await source('styles/game.css');

  assert.match(html, /id="combat-feedback-layer"/);
  assert.match(html, /id="combat-feedback-layer"[^>]*aria-live="polite"/);
  assert.match(baseRender, /button\.dataset\.unitId/);
  assert.match(baseRender, /token\.dataset\.enemyId/);
  assert.match(feedback, /export function createCombatFeedback/);
  assert.match(feedback, /function present\(events\)/);
  assert.match(feedback, /function clear\(\)/);
  assert.match(app, /createCombatFeedback/);
  assert.match(app, /feedback\.present/);
  assert.match(app, /feedback\.clear/);
  assert.match(css, /#combat-feedback-layer[\s\S]*?pointer-events:\s*none/);
  assert.match(css, /\.is-attacking/);
  assert.match(css, /\.is-hit/);
  assert.match(css, /\.combat-damage/);
  assert.match(css, /\.is-defeated/);
  assert.match(css, /\[data-reduced-motion="true"\][\s\S]*?\.combat-projectile/);
});

test('full-screen Help exposes all player rule sections and restores play state', async () => {
  const html = await source('index.html');
  const helpContent = await source('src/ui/help-content.js');
  const helpPanel = await source('src/ui/help-panel.js');
  const interactions = await source('src/ui/interactions.js');
  const app = await source('src/app.js');
  const css = await source('styles/game.css');

  assert.match(html, /data-action="open-help"/);
  assert.match(html, /id="help-panel"[^>]*role="dialog"[^>]*aria-modal="true"/);
  assert.match(html, /id="help-content"/);
  assert.match(html, /data-action="close-help"/);
  assert.match(helpContent, /export const HELP_SECTIONS/);
  for (const id of ['objective', 'cards', 'assembly', 'board', 'camp', 'combat', 'orders', 'rewards', 'saves']) {
    assert.match(helpContent, new RegExp(`id: '${id}'`));
  }
  assert.doesNotMatch(helpContent, /roadmap|test suite|architecture|SOT/i);
  assert.match(helpPanel, /export function createHelpPanel/);
  assert.match(helpPanel, /function open\(/);
  assert.match(helpPanel, /function close\(/);
  assert.match(helpPanel, /onOpen/);
  assert.match(helpPanel, /onClose/);
  assert.match(interactions, /'open-help'/);
  assert.match(interactions, /'close-help'/);
  assert.match(app, /helpPanel\.open/);
  assert.match(app, /helpPanel\.close/);
  assert.match(app, /resumeAfterHelp/);
  assert.match(css, /#help-panel[\s\S]*?position:\s*fixed/);
  assert.match(css, /#help-panel[\s\S]*?inset:\s*0/);
  assert.match(css, /body\.help-open[\s\S]*?overflow:\s*hidden/);
});

test('restart controls separate expedition reset from complete v2 data clearing', async () => {
  const html = await source('index.html');
  const interactions = await source('src/ui/interactions.js');
  const app = await source('src/app.js');
  const storage = await source('src/storage/storage.js');

  assert.match(html, /data-action="restart-expedition"/);
  assert.match(html, />重新開始遠征</);
  assert.match(html, /data-action="clear-all-v2-data"/);
  assert.match(html, />完全清除資料並測試最新版</);
  assert.match(interactions, /'restart-expedition'/);
  assert.match(interactions, /'clear-all-v2-data'/);
  assert.match(storage, /export const V2_STORAGE_KEYS/);
  assert.match(storage, /export function resetExpedition/);
  assert.match(storage, /export function clearAllV2Data/);
  assert.match(storage, /export function buildLatestVersionUrl/);
  assert.match(app, /清除目前遠征進度/);
  assert.match(app, /遠征、教學、設定及所有舊 v2 資料/);
  assert.match(app, /resetExpedition/);
  assert.match(app, /clearAllV2Data/);
  assert.match(app, /window\.location\.href\s*=\s*buildLatestVersionUrl/);
  assert.doesNotMatch(app, /hanzi-generals-v2:/);
});
