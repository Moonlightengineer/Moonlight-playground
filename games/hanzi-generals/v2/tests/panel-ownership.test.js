import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), 'utf8').catch(() => '');
}

const PANEL_CONTRACTS = [
  ['run-status-panel.js', 'renderRunStatusPanel'],
  ['battle-stage-panel.js', 'renderBattleStagePanel'],
  ['camp-panel.js', 'renderCampPanel'],
  ['primary-panel.js', 'renderPrimaryPanel'],
  ['combat-orders-panel.js', 'renderCombatOrdersPanel'],
  ['hand-panel.js', 'renderHandPanel'],
  ['details-panel.js', 'renderDetailsPanel'],
];

test('render-app is the only orchestration layer and invokes every panel owner once', async () => {
  const renderApp = await source('src/ui/render-app.js');
  for (const [file, functionName] of PANEL_CONTRACTS) {
    assert.match(renderApp, new RegExp(`import \\{ ${functionName} \\} from './panels/${file.replace('.', '\\.')}'`));
    const calls = renderApp.match(new RegExp(`^\\s*${functionName}\\(`, 'gm')) ?? [];
    assert.equal(calls.length, 1, `${functionName} should be invoked once in orchestration`);
  }
});

test('every fixed panel has one focused renderer module', async () => {
  for (const [file, functionName] of PANEL_CONTRACTS) {
    const panel = await source(`src/ui/panels/${file}`);
    assert.match(panel, new RegExp(`export function ${functionName}\\(`));
  }
});

test('legacy layered renderers are compatibility adapters and no longer write panel DOM', async () => {
  for (const path of ['src/ui/render.js', 'src/ui/render-interactive-base.js']) {
    const legacy = await source(path);
    assert.doesNotMatch(legacy, /replaceChildren\(/);
    assert.doesNotMatch(legacy, /querySelector\(['"]#(?:camp|hand|primary-actions|orders|details-panel)/);
    assert.match(legacy, /buildAppViewModel/);
    assert.match(legacy, /renderViewModel/);
  }
});

test('render-interactive builds one ViewModel then performs one render pass', async () => {
  const entry = await source('src/ui/render-interactive.js');
  assert.match(entry, /buildAppViewModel/);
  assert.match(entry, /renderViewModel/);
  assert.doesNotMatch(entry, /renderBaseApp/);
  assert.doesNotMatch(entry, /renderCampSelection/);
  assert.doesNotMatch(entry, /renderInteractiveOrders/);
});
