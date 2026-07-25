import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const ARTIFACT_DIR = 'artifacts/hanzi-v2-playtest';
const URL = 'http://127.0.0.1:8001/games/hanzi-generals/v2/?seed=playtest-0';
const bugs = [];
const observations = [];
const runtimeErrors = [];
const gates = {
  expeditionResetPassed: false,
  completeResetPassed: false,
  storageIsolationPassed: false,
  noHorizontalOverflow: true,
};

function addUnique(collection, id, summary, evidence = {}) {
  if (!collection.some((item) => item.id === id)) collection.push({ id, summary, evidence });
}

function bug(id, summary, evidence = {}) {
  addUnique(bugs, id, summary, evidence);
}

async function waitForServer() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(URL)).ok) return;
    } catch {
      // Keep polling.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Regression server did not start');
}

async function handWrapBySymbol(page, symbol) {
  const cards = page.locator('#hand .hand-card-wrap');
  const count = await cards.count();
  for (let index = 0; index < count; index += 1) {
    const wrap = cards.nth(index);
    const text = (await wrap.locator('.hand-card').textContent())?.trim();
    if (text === symbol) return wrap;
  }
  throw new Error(`Hand does not contain ${symbol}`);
}

async function measureOverflow(page, phase) {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  observations.push({ phase, metrics });
  if (metrics.scrollWidth > metrics.innerWidth + 1) {
    gates.noHorizontalOverflow = false;
    bug('horizontal-overflow', `${phase} overflows the mobile viewport`, metrics);
  }
}

async function controlledFocusFixture(page) {
  return page.evaluate(async () => {
    const [{ renderApp }, { bindInteractions }, boardModule] = await Promise.all([
      import('./src/ui/render-interactive.js'),
      import('./src/ui/interactions.js'),
      import('./src/board/board.js'),
    ]);

    const root = document.createElement('main');
    root.id = 'controlled-v2-game-app';
    root.innerHTML = `
      <section id="run-status"></section>
      <section class="battle-stage">
        <section id="enemy-intents"></section>
        <section id="enemy-field"></section>
        <section id="battle-board"></section>
      </section>
      <section class="command-panel">
        <section id="camp"></section>
        <section id="primary-actions"></section>
        <section id="orders"></section>
      </section>
      <section id="hand"></section>
      <details id="details-panel"><summary>詳情</summary></details>
      <p id="action-message"></p>
    `;
    document.body.append(root);

    const unit = {
      id: 'controlled-huang-zhong',
      definitionId: 'huang-zhong',
      kind: 'general',
      hp: 18,
      maxHp: 18,
      cooldown: 0,
      evolution: null,
      statuses: [],
    };
    let board = boardModule.createBoard('base');
    board = boardModule.placeUnit(board, unit, { column: 0, row: 0 });
    const combat = {
      turn: 0,
      status: 'running',
      board,
      enemies: [
        { id: 'legal-same-lane', definitionId: 'soldier', lane: 0, distance: 2, hp: 8, maxHp: 8, cooldown: 0, statuses: [] },
        { id: 'illegal-cross-lane', definitionId: 'soldier', lane: 2, distance: 1, hp: 8, maxHp: 8, cooldown: 0, statuses: [] },
      ],
      wallHp: 100,
      phaseIndex: 0,
      ordersRemaining: 3,
      focus: null,
      fortify: null,
      pendingOrders: [],
      tactics: [],
      paused: true,
    };
    const game = {
      status: 'combat',
      route: 'safe',
      battleIndex: 0,
      completedBattleIds: [],
      currentBattle: { phaseIndex: 0, phaseCount: 3, ordersRemaining: 3 },
      wallHp: 100,
      wallMaxHp: 100,
      board,
      boardCards: {},
      cardsById: {},
      legalCells: [],
      camp: { capacity: 2, cardIds: [] },
      deck: { drawPile: [], discardPile: [], hand: [], retained: [], deployed: [] },
      settings: { speed: 1, reducedMotion: false, vibration: false },
      tutorial: { index: 4, complete: false, skipped: false },
      combat,
      ui: {},
    };

    renderApp(root, game);
    bindInteractions(root, () => true);
    root.querySelector('[data-action="begin-order"][data-order-type="focus"]')?.click();

    const legal = root.querySelector('[data-enemy-id="legal-same-lane"]');
    const illegal = root.querySelector('[data-enemy-id="illegal-cross-lane"]');
    const result = {
      legalEligible: legal?.dataset.focusEligible,
      illegalEligible: illegal?.dataset.focusEligible,
      legalTarget: legal?.classList.contains('is-order-target'),
      illegalTarget: illegal?.classList.contains('is-order-target'),
    };
    root.remove();
    return result;
  });
}

async function storageSnapshot(page) {
  return page.evaluate(() => ({
    save: localStorage.getItem('hanzi-generals-v2:save:v1'),
    settings: localStorage.getItem('hanzi-generals-v2:settings:v1'),
    tutorial: localStorage.getItem('hanzi-generals-v2:tutorial:v1'),
    legacy: localStorage.getItem('hanzi-generals-v2:legacy:v0'),
    temporary: localStorage.getItem('hanzi-generals-v2:temporary-test'),
    playground: localStorage.getItem('moonlight-playground:theme'),
    classic: localStorage.getItem('hanzi-generals:classic:save'),
  }));
}

async function acceptNextDialog(page) {
  page.once('dialog', async (dialog) => dialog.accept());
}

async function verifyResetFlows(page) {
  await page.evaluate(() => {
    localStorage.setItem('hanzi-generals-v2:legacy:v0', 'legacy');
    localStorage.setItem('hanzi-generals-v2:temporary-test', 'temporary');
    localStorage.setItem('moonlight-playground:theme', 'dark');
    localStorage.setItem('hanzi-generals:classic:save', 'classic');
  });

  const before = await storageSnapshot(page);
  await page.locator('#orders [data-action="open-help"]').click();
  await acceptNextDialog(page);
  await page.locator('#help-panel [data-action="restart-expedition"]').click();
  await page.waitForFunction(() => document.querySelector('#v2-game-app')?.dataset.status === 'expedition-map');

  const afterExpeditionReset = await storageSnapshot(page);
  const tutorialPreserved = before.tutorial === afterExpeditionReset.tutorial;
  const settingsPreserved = before.settings === afterExpeditionReset.settings;
  const expeditionRestarted = Boolean(afterExpeditionReset.save);
  const unrelatedPreserved = afterExpeditionReset.playground === 'dark'
    && afterExpeditionReset.classic === 'classic';
  const legacyPreserved = afterExpeditionReset.legacy === 'legacy'
    && afterExpeditionReset.temporary === 'temporary';

  gates.expeditionResetPassed = tutorialPreserved
    && settingsPreserved
    && expeditionRestarted
    && unrelatedPreserved
    && legacyPreserved;
  observations.push({
    phase: 'expedition-reset',
    tutorialPreserved,
    settingsPreserved,
    expeditionRestarted,
    unrelatedPreserved,
    legacyPreserved,
  });
  if (!gates.expeditionResetPassed) {
    bug('expedition-reset-gate-failed', 'Expedition reset did not preserve tutorial/settings or isolate unrelated storage', {
      before,
      afterExpeditionReset,
    });
  }

  await page.locator('.game-header [data-action="open-help"]').click();
  await acceptNextDialog(page);
  await Promise.all([
    page.waitForURL((url) => url.searchParams.has('v2reload'), { waitUntil: 'networkidle' }),
    page.locator('#help-panel [data-action="clear-all-v2-data"]').click(),
  ]);

  const afterCompleteReset = await storageSnapshot(page);
  const tutorialState = afterCompleteReset.tutorial ? JSON.parse(afterCompleteReset.tutorial) : null;
  const v2Cleared = afterCompleteReset.save === null
    && afterCompleteReset.settings === null
    && afterCompleteReset.legacy === null
    && afterCompleteReset.temporary === null;
  const freshTutorial = Boolean(tutorialState?.tutorial)
    && tutorialState.tutorial.complete !== true
    && tutorialState.tutorial.skipped !== true;
  const onboardingVisible = /第一步/.test((await page.locator('#tutorial-message').textContent()) ?? '');
  const unrelatedStillPreserved = afterCompleteReset.playground === 'dark'
    && afterCompleteReset.classic === 'classic';
  const cacheBusted = new URL(page.url()).searchParams.has('v2reload');

  gates.completeResetPassed = v2Cleared && freshTutorial && onboardingVisible && cacheBusted;
  gates.storageIsolationPassed = unrelatedPreserved && unrelatedStillPreserved;
  observations.push({
    phase: 'complete-reset',
    v2Cleared,
    freshTutorial,
    onboardingVisible,
    unrelatedStillPreserved,
    cacheBusted,
    url: page.url(),
  });

  if (!gates.completeResetPassed) {
    bug('complete-reset-gate-failed', 'Complete reset did not clear all v2 data and reload fresh onboarding', {
      afterCompleteReset,
      tutorialState,
      onboardingVisible,
      cacheBusted,
      url: page.url(),
    });
  }
  if (!gates.storageIsolationPassed) {
    bug('storage-isolation-gate-failed', 'Reset flow modified Playground or Classic storage', {
      afterExpeditionReset,
      afterCompleteReset,
    });
  }
}

async function run() {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const server = spawn('python', ['-m', 'http.server', '8001', '--directory', '_site'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let browser;
  try {
    await waitForServer();
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    await context.addInitScript(() => localStorage.clear());
    const page = await context.newPage();
    page.on('pageerror', (error) => runtimeErrors.push({ type: 'pageerror', message: error.message }));
    page.on('console', (message) => {
      if (message.type() === 'error') runtimeErrors.push({ type: 'console', message: message.text() });
    });
    await page.goto(URL, { waitUntil: 'networkidle' });
    await measureOverflow(page, 'start');

    await page.getByRole('button', { name: '開始下一戰', exact: true }).click();
    await page.getByRole('button', { name: '抽牌', exact: true }).click();

    for (const symbol of ['黃', '忠']) {
      const wrap = await handWrapBySymbol(page, symbol);
      await wrap.locator('.card-secondary-action').click();
    }

    const campCards = page.locator('#camp [data-action="select-camp-card"]');
    await campCards.nth(0).click();
    await campCards.nth(1).click();
    await page.locator('#battle-board [data-action="choose-cell"][data-column="1"][data-row="0"]').click();

    const tutorial = (await page.locator('#tutorial-message').textContent())?.trim() ?? '';
    if (!/第三步/.test(tutorial)) {
      bug('tutorial-stuck-after-camp-assembly', 'Direct camp assembly does not complete the first two tutorial steps', { tutorial });
    }

    await page.getByRole('button', { name: '開始呢一段', exact: true }).click();
    await page.waitForTimeout(60);
    await page.locator('#orders [data-action="pause"]').click();

    await page.getByRole('button', { name: '集火', exact: true }).click();
    await page.locator('#enemy-field .enemy-token.is-order-target').first().click();
    await page.getByRole('button', { name: '守2路', exact: true }).click();

    const status = page.locator('#orders .order-status');
    const statusText = (await status.textContent())?.trim() ?? '';
    const box = await status.boundingBox();
    const viewport = page.viewportSize();
    const withinViewport = Boolean(box && viewport
      && box.x >= 0
      && box.x + box.width <= viewport.width
      && box.y >= 0
      && box.y + box.height <= viewport.height);
    if (!withinViewport) {
      bug('order-status-offscreen', 'Remaining order durations are rendered outside the visible mobile viewport', {
        statusText,
        box,
        viewport,
      });
    }
    await measureOverflow(page, 'combat-orders');

    const focusFixture = await controlledFocusFixture(page);
    if (focusFixture.legalEligible !== 'true' || !focusFixture.legalTarget) {
      bug('legal-focus-target-hidden', 'A same-lane reachable enemy is not exposed as a focus target', focusFixture);
    }
    if (focusFixture.illegalEligible !== 'false' || focusFixture.illegalTarget) {
      bug('cross-lane-focus-target-exposed', 'A cross-lane enemy is exposed to a same-lane unit', focusFixture);
    }

    await verifyResetFlows(page);
    await measureOverflow(page, 'post-reset');
    await page.screenshot({ path: `${ARTIFACT_DIR}/08-ui-regressions.png`, fullPage: true });

    if (runtimeErrors.length) bug('runtime-errors', 'Browser emitted runtime errors', { runtimeErrors });
    for (const [gate, passed] of Object.entries(gates)) {
      if (!passed) bug(`${gate}-failed`, `Required UI regression gate ${gate} did not pass`);
    }
  } finally {
    await browser?.close();
    server.kill('SIGTERM');
  }
}

try {
  await run();
} catch (error) {
  bug('ui-regression-playtest-crashed', error.message, { stack: error.stack });
}

const report = {
  generatedAt: new Date().toISOString(),
  viewport: { width: 390, height: 844 },
  url: URL,
  bugs,
  gates,
  observations,
  runtimeErrors,
};
await writeFile(`${ARTIFACT_DIR}/ui-regression-report.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log('HANZI_V2_UI_REGRESSION_REPORT');
console.log(JSON.stringify(report, null, 2));
if (bugs.length) process.exitCode = 1;
