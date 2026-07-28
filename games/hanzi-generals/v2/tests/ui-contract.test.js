import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), 'utf8').catch(() => '');
}

async function renderArchitectureSource() {
  const paths = [
    'src/ui/view-model.js',
    'src/ui/runtime-view-model.js',
    'src/ui/render-app.js',
    'src/ui/panels/run-status-panel.js',
    'src/ui/panels/battle-stage-panel.js',
    'src/ui/panels/camp-panel.js',
    'src/ui/panels/primary-panel.js',
    'src/ui/panels/combat-orders-panel.js',
    'src/ui/panels/hand-panel.js',
    'src/ui/panels/details-panel.js',
  ];
  return (await Promise.all(paths.map(source))).join('\n');
}

test('v2 shell exposes the hidden game root, module entry and semantic regions', async () => {
  const html = await source('index.html');
  assert.match(html, /id="v2-game-app"/);
  assert.match(html, /src="\.\/src\/app\.js"/);
  assert.match(html, /styles\/interaction-fix\.css/);
  assert.doesNotMatch(html, /projects\.json/);
  for (const id of [
    'run-status', 'enemy-intents', 'enemy-field', 'battle-board', 'camp', 'hand',
    'primary-actions', 'orders', 'details-panel', 'action-message',
  ]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /class="battle-stage"/);
  assert.match(html, /class="command-panel"/);
  assert.match(html, /aria-live="assertive"/);
});

test('mobile CSS preserves accessibility, vertical enemy movement and order feedback', async () => {
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

test('interaction layer translates intents and consumes canonical ViewModel targets', async () => {
  const interactions = await source('src/ui/interactions.js');
  for (const action of [
    'select-card', 'select-camp-card', 'return-camp-card', 'choose-cell',
    'move-card-to-camp', 'draw-cards', 'reroll', 'start-phase', 'choose-route',
    'choose-reward', 'begin-order', 'order-select-unit', 'order-swap-target',
    'order-focus-target', 'cancel-order', 'issue-order',
  ]) assert.match(interactions, new RegExp(`'${action}'`));
  assert.match(interactions, /getViewModel/);
  assert.match(interactions, /swapPairs/);
  assert.match(interactions, /reinforce/);
  assert.match(interactions, /focusEnemyIds/);
  assert.match(interactions, /unitIds:\s*\[orderMode\.unitId,\s*target\.dataset\.unitId\]/);
  assert.doesNotMatch(interactions, /order-reposition-target/);
  assert.doesNotMatch(interactions, /function distance\(/);
  assert.doesNotMatch(interactions, /adjacentUnitTargets/);
  assert.doesNotMatch(interactions, /adjacentEmptyLaneTargets/);
});

test('ViewModel and panel owners render spatial battle, order and reward contracts', async () => {
  const renderSource = await renderArchitectureSource();
  assert.match(renderSource, /buildBattleStage/);
  assert.match(renderSource, /--enemy-progress/);
  assert.match(renderSource, /enemy\.distance/);
  assert.match(renderSource, /--enemy-columns/);
  assert.match(renderSource, /selectOrderTargets/);
  assert.match(renderSource, /swapPairs/);
  assert.match(renderSource, /focusEnemyIds/);
  assert.match(renderSource, /remainingFriendlyTurns/);
  assert.match(renderSource, /remainingEnemyTurns/);
  assert.match(renderSource, /reward-name/);
  assert.match(renderSource, /reward-summary/);
  assert.match(renderSource, /reward-effect/);
  assert.match(renderSource, /reward-use-case/);
  assert.match(renderSource, /reward\.description\.summary/);
  assert.match(renderSource, /reward\.description\.effect/);
  assert.match(renderSource, /reward\.description\.useCase/);
});

test('combat feedback remains non-blocking, identifiable and reduced-motion safe', async () => {
  const html = await source('index.html');
  const battlePanel = await source('src/ui/panels/battle-stage-panel.js');
  const feedback = await source('src/ui/combat-feedback.js');
  const app = await source('src/app.js');
  const css = await source('styles/game.css');
  assert.match(html, /id="combat-feedback-layer"[^>]*aria-live="polite"/);
  assert.match(battlePanel, /button\.dataset\.unitId/);
  assert.match(battlePanel, /token\.dataset\.enemyId/);
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

test('full-screen Help exposes all rule sections and preserves combat resume wiring', async () => {
  const html = await source('index.html');
  const helpContent = await source('src/ui/help-content.js');
  const helpPanel = await source('src/ui/help-panel.js');
  const interactions = await source('src/ui/interactions.js');
  const app = await source('src/app.js');
  const css = await source('styles/game.css');
  assert.match(html, /data-action="open-help"/);
  assert.match(html, /id="help-panel"[^>]*role="dialog"[^>]*aria-modal="true"/);
  assert.match(html, /data-action="close-help"/);
  for (const id of ['objective', 'cards', 'assembly', 'board', 'camp', 'combat', 'orders', 'rewards', 'saves']) {
    assert.match(helpContent, new RegExp(`id: '${id}'`));
  }
  assert.doesNotMatch(helpContent, /roadmap|test suite|architecture|SOT/i);
  assert.match(helpPanel, /export function createHelpPanel/);
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

test('restart controls isolate expedition reset and complete v2 data clearing', async () => {
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
