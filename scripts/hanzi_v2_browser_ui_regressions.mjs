import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const ARTIFACT_DIR = 'artifacts/hanzi-v2-playtest';
const URL = 'http://127.0.0.1:8001/games/hanzi-generals/v2/?seed=playtest-0';
const bugs = [];

function bug(id, summary, evidence = {}) {
  bugs.push({ id, summary, evidence });
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
    await page.goto(URL, { waitUntil: 'networkidle' });

    await page.getByRole('button', { name: '開始下一戰', exact: true }).click();
    await page.getByRole('button', { name: '抽牌', exact: true }).click();

    for (const symbol of ['黃', '忠']) {
      const wrap = page.locator('#hand .hand-card-wrap').filter({ has: page.getByRole('button', { name: symbol, exact: true }) }).first();
      await wrap.locator('.card-secondary-action').click();
    }

    const campCards = page.locator('#camp [data-action="select-camp-card"]');
    await campCards.nth(0).click();
    await campCards.nth(1).click();
    await page.locator('#battle-board [data-action="choose-cell"][data-column="0"][data-row="0"]').click();

    const tutorial = (await page.locator('#tutorial-message').textContent())?.trim() ?? '';
    if (!/第三步/.test(tutorial)) {
      bug('tutorial-stuck-after-camp-assembly', 'Direct camp assembly does not complete the first two tutorial steps', { tutorial });
    }

    await page.getByRole('button', { name: '開始呢一段', exact: true }).click();
    await page.waitForTimeout(60);
    await page.locator('#orders [data-action="pause"]').click();

    await page.getByRole('button', { name: '集火', exact: true }).click();
    await page.locator('#enemy-field .enemy-token.is-order-target').first().click();
    await page.getByRole('button', { name: '守1路', exact: true }).click();

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

    await page.screenshot({ path: `${ARTIFACT_DIR}/08-ui-regressions.png`, fullPage: true });
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

const report = { generatedAt: new Date().toISOString(), bugs };
await writeFile(`${ARTIFACT_DIR}/ui-regression-report.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log('HANZI_V2_UI_REGRESSION_REPORT');
console.log(JSON.stringify(report, null, 2));
if (bugs.length) process.exitCode = 1;
