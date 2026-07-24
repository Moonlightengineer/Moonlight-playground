import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const ARTIFACT_DIR = 'artifacts/hanzi-v2-playtest';
const BASE_URL = 'http://127.0.0.1:8000/games/hanzi-generals/v2/?seed=playtest-0';
const OPENING_RECIPES = [
  { symbols: ['黃', '忠'], unit: '黃忠' },
  { symbols: ['趙', '雲'], unit: '趙雲' },
  { symbols: ['關', '羽'], unit: '關羽' },
  { symbols: ['呂', '布'], unit: '呂布' },
  { symbols: ['弓', '兵'], unit: '弓兵' },
  { symbols: ['盾', '兵'], unit: '盾兵' },
];
const bugs = [];
const observations = [];
const runtimeErrors = [];

function bug(id, summary, evidence = {}) {
  if (!bugs.some((item) => item.id === id)) bugs.push({ id, summary, evidence });
}

function findOpeningRecipe(hand) {
  return OPENING_RECIPES.find(({ symbols }) => {
    const remaining = [...hand];
    return symbols.every((symbol) => {
      const index = remaining.indexOf(symbol);
      if (index < 0) return false;
      remaining.splice(index, 1);
      return true;
    });
  }) ?? null;
}

async function waitForServer(url, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Static server did not start within ${timeoutMs}ms`);
}

async function screenshot(page, name) {
  await page.screenshot({ path: `${ARTIFACT_DIR}/${name}.png`, fullPage: true });
}

async function exactButton(page, label) {
  return page.getByRole('button', { name: label, exact: true });
}

async function handWrapBySymbol(page, symbol) {
  const cards = page.locator('#hand .hand-card-wrap');
  const count = await cards.count();
  for (let index = 0; index < count; index += 1) {
    const wrap = cards.nth(index);
    const text = (await wrap.locator('.hand-card').textContent())?.trim();
    if (text === symbol) return wrap;
  }
  return null;
}

async function returnCampCardsToHand(page) {
  const returnButtons = page.locator('#camp [data-action="return-camp-card"]');
  while (await returnButtons.count()) await returnButtons.first().click();
}

async function selectHandAndPlace(page, symbol, column, row) {
  const wrap = await handWrapBySymbol(page, symbol);
  if (!wrap) throw new Error(`Hand does not contain ${symbol}`);
  await wrap.locator('.hand-card').click();
  await page.locator(`#battle-board [data-action="choose-cell"][data-column="${column}"][data-row="${row}"]`).click();
}

async function measurePage(page, phase) {
  const metrics = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    scrollWidth: document.documentElement.scrollWidth,
    innerHeight: window.innerHeight,
    innerWidth: window.innerWidth,
  }));
  observations.push({ phase, metrics });
  if (metrics.scrollWidth > metrics.innerWidth + 1) {
    bug('horizontal-overflow', `${phase} has horizontal overflow`, metrics);
  }
  if (phase === 'combat' && metrics.scrollHeight > metrics.innerHeight * 1.45) {
    bug('combat-page-too-tall', 'Combat screen still requires excessive vertical scrolling', metrics);
  }
}

async function play() {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const server = spawn('python', ['-m', 'http.server', '8000', '--directory', '_site'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let browser;
  try {
    await waitForServer(BASE_URL);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
    });
    await context.addInitScript(() => localStorage.clear());
    const page = await context.newPage();
    page.on('pageerror', (error) => runtimeErrors.push({ type: 'pageerror', message: error.message }));
    page.on('console', (message) => {
      if (message.type() === 'error') runtimeErrors.push({ type: 'console', message: message.text() });
    });

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await screenshot(page, '01-start');
    await measurePage(page, 'start');

    await (await exactButton(page, '開始下一戰')).click();
    await (await exactButton(page, '抽牌')).click();
    await screenshot(page, '02-draw');

    const initialHand = (await page.locator('#hand .hand-card').allTextContents()).map((text) => text.trim());
    const openingRecipe = findOpeningRecipe(initialHand);
    observations.push({ phase: 'draw', initialHand, openingRecipe });
    if (!openingRecipe) {
      bug('opening-hand-has-no-recipe', 'Opening hand has no immediately usable recipe', { initialHand });
      return;
    }

    for (const symbol of openingRecipe.symbols) {
      const wrap = await handWrapBySymbol(page, symbol);
      if (!wrap) throw new Error(`Could not find ${symbol} before moving to camp`);
      await wrap.locator('.card-secondary-action').click();
    }
    await screenshot(page, '03-camp');

    const campActions = await page.locator('#camp [data-action]').evaluateAll((elements) => (
      elements.map((element) => ({ action: element.dataset.action, text: element.textContent?.trim() }))
    ));
    observations.push({ phase: 'camp', campActions });
    const campCanSelect = campActions.filter(({ action }) => action === 'select-card').length >= 2;
    const campCanReturn = campActions.some(({ action }) => action === 'return-camp-card');
    if (!campCanSelect || !campCanReturn) {
      bug('camp-not-actionable', 'Camp cards do not expose both select and return actions', { campActions });
    }

    if (campCanSelect) {
      const campSelect = page.locator('#camp [data-action="select-card"]');
      await campSelect.nth(0).click();
      await campSelect.nth(1).click();
      const selected = await page.locator('#camp [aria-pressed="true"]').count();
      if (selected < 2) bug('camp-selection-not-visible', 'Selecting camp recipe cards gives no visible selected state', { selected });
      const target = page.locator('#battle-board [data-action="choose-cell"][data-column="0"][data-row="0"]');
      await target.click();
    } else {
      await returnCampCardsToHand(page);
      await selectHandAndPlace(page, openingRecipe.symbols[0], 0, 0);
      await selectHandAndPlace(page, openingRecipe.symbols[1], 1, 0);
    }

    await page.waitForTimeout(150);
    const unitNames = await page.locator('#battle-board .has-unit').allTextContents();
    observations.push({ phase: 'assembly', unitNames, expectedUnit: openingRecipe.unit });
    if (!unitNames.some((text) => text.includes(openingRecipe.unit))) {
      bug('assembly-flow-blocked', `Could not assemble and deploy ${openingRecipe.unit} through visible controls`, { unitNames });
      return;
    }
    await screenshot(page, '04-assembled');

    await (await exactButton(page, '開始呢一段')).click();
    const speedButton = page.locator('#orders [data-action="set-speed"]');
    if (await speedButton.count()) await speedButton.click();
    await page.waitForTimeout(100);
    await screenshot(page, '05-combat-start');
    await measurePage(page, 'combat');

    const enemy = page.locator('#enemy-field .enemy-token').first();
    if (!(await enemy.count())) {
      bug('enemy-not-visible', 'Combat started without a visible enemy token');
      return;
    }
    const before = {
      distance: await enemy.getAttribute('data-distance'),
      box: await enemy.boundingBox(),
    };
    await page.waitForTimeout(900);
    const after = {
      distance: await enemy.getAttribute('data-distance'),
      box: await enemy.boundingBox(),
    };
    observations.push({ phase: 'enemy-movement', before, after });
    if (before.distance === after.distance) {
      bug('enemy-distance-static', 'Enemy distance did not update during active combat', { before, after });
    }
    if (before.box && after.box) {
      const dx = Math.abs(after.box.x - before.box.x);
      const dy = Math.abs(after.box.y - before.box.y);
      if (dx > dy + 2) bug('enemy-moves-sideways', 'Enemy token moves horizontally instead of top-to-bottom', { dx, dy, before, after });
      if (dy < 2) bug('enemy-motion-not-visible', 'Enemy distance changes but token has no visible vertical movement', { dx, dy, before, after });
    }

    const pauseButton = page.locator('#orders [data-action="pause"]');
    if (await pauseButton.count()) await pauseButton.click();

    const swapButton = page.getByRole('button', { name: /變陣/ }).first();
    if (!(await swapButton.count()) || await swapButton.isDisabled()) {
      bug('swap-order-unavailable', '變陣 is unavailable with one deployed unit and adjacent empty cells');
    } else {
      await swapButton.click();
      const selectableUnits = await page.locator('#battle-board .order-source').count();
      if (!selectableUnits) bug('swap-has-no-source-selection', '變陣 does not enter a visible source-selection mode');
    }

    const focusButton = page.getByRole('button', { name: /集火/ }).first();
    if (!(await focusButton.count()) || await focusButton.isDisabled()) {
      bug('focus-order-unavailable', '集火 is unavailable while a legal enemy is visible');
    } else {
      await focusButton.click();
      const selectableEnemies = await page.locator('#enemy-field .order-target').count();
      if (!selectableEnemies) bug('focus-has-no-target-selection', '集火 does not expose selectable enemy targets');
    }

    const fortifyButton = page.getByRole('button', { name: /守1路|堅守/ }).first();
    if (await fortifyButton.count() && !(await fortifyButton.isDisabled())) {
      await fortifyButton.click();
      const statusText = await page.locator('#orders').textContent();
      const highlightedLane = await page.locator('#enemy-field .is-fortified, #battle-board .is-fortified').count();
      if (!/剩餘|堅守/.test(statusText ?? '') && !highlightedLane) {
        bug('fortify-feedback-missing', '堅守 spends an order but gives no persistent visual feedback', { statusText, highlightedLane });
      }
    }

    await screenshot(page, '06-orders');

    const resumeButton = page.locator('#orders [data-action="resume"]');
    if (await resumeButton.count()) await resumeButton.click();
    const deadline = Date.now() + 25000;
    let terminal = null;
    while (Date.now() < deadline) {
      const status = await page.locator('#v2-game-app').getAttribute('data-status');
      if (['reward', 'defeat', 'victory'].includes(status)) {
        terminal = status;
        break;
      }
      if (status === 'configuration') {
        const startPhase = page.getByRole('button', { name: '開始呢一段', exact: true });
        if (await startPhase.count() && !(await startPhase.isDisabled())) await startPhase.click();
      }
      await page.waitForTimeout(500);
    }
    observations.push({ phase: 'first-battle-result', terminal });
    if (!terminal) bug('battle-flow-stalls', 'First battle did not reach reward or defeat within 25 seconds at 2× speed');
    await screenshot(page, '07-result');

    if (runtimeErrors.length) bug('runtime-errors', 'Browser emitted runtime errors', { runtimeErrors });
  } finally {
    await browser?.close();
    server.kill('SIGTERM');
  }
}

try {
  await play();
} catch (error) {
  bug('playtest-crashed', error.message, { stack: error.stack });
}

const report = {
  generatedAt: new Date().toISOString(),
  viewport: { width: 390, height: 844 },
  url: BASE_URL,
  bugs,
  observations,
  runtimeErrors,
};
await writeFile(`${ARTIFACT_DIR}/report.json`, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log('HANZI_V2_PLAYTEST_REPORT');
console.log(JSON.stringify(report, null, 2));
if (bugs.length) process.exitCode = 1;
