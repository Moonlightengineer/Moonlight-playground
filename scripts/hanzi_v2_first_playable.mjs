import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const ARTIFACT_DIR = 'artifacts/hanzi-v2-playtest';
const BASE_URL = 'http://127.0.0.1:8000/games/hanzi-generals/v2/?seed=first-playable-v2';
const RECIPES = [
  { symbols: ['張', '飛'], unit: '張飛', row: 0 },
  { symbols: ['關', '羽'], unit: '關羽', row: 0 },
  { symbols: ['趙', '雲'], unit: '趙雲', row: 0 },
  { symbols: ['張', '任'], unit: '張任', row: 2 },
  { symbols: ['王', '平'], unit: '王平', row: 1 },
  { symbols: ['凌', '統'], unit: '凌統', row: 0 },
  { symbols: ['兵', '盾'], unit: '盾兵', row: 0 },
  { symbols: ['兵', '槍'], unit: '槍兵', row: 0 },
  { symbols: ['兵', '弓'], unit: '弓兵', row: 2 },
  { symbols: ['兵', '騎'], unit: '騎兵', row: 0 },
  { symbols: ['軍', '醫'], unit: '軍醫', row: 2 },
  { symbols: ['斥', '候'], unit: '斥候', row: 2 },
  { symbols: ['謀', '士'], unit: '謀士', row: 2 },
  { symbols: ['任', '峻'], unit: '任峻', row: 1 },
  { symbols: ['關', '平'], unit: '關平', row: 0 },
  { symbols: ['趙', '統'], unit: '趙統', row: 0 },
];

const report = {
  generatedAt: new Date().toISOString(),
  viewport: { width: 390, height: 844 },
  observations: [],
  errors: [],
  gates: {
    reachedReward: false,
    battleReportVisible: false,
    noRuntimeErrors: true,
    noHorizontalOverflow: true,
    deployedAtLeastThreeUnits: false,
  },
};

function recipeFor(symbols) {
  return RECIPES.find((recipe) => {
    const remaining = [...symbols];
    return recipe.symbols.every((symbol) => {
      const index = remaining.indexOf(symbol);
      if (index < 0) return false;
      remaining.splice(index, 1);
      return true;
    });
  }) ?? null;
}

async function visible(locator) {
  return await locator.count() > 0 && await locator.first().isVisible();
}

async function waitForServer() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(BASE_URL)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Static server did not start');
}

async function handSymbols(page) {
  return (await page.locator('#hand .hand-card').allTextContents()).map((text) => text.trim());
}

async function handWrap(page, symbol) {
  const wraps = page.locator('#hand .hand-card-wrap');
  for (let index = 0; index < await wraps.count(); index += 1) {
    const wrap = wraps.nth(index);
    if ((await wrap.locator('.hand-card').textContent())?.trim() === symbol) return wrap;
  }
  return null;
}

async function chooseCell(page, recipe) {
  const columnCounts = await page.locator('#battle-board .board-cell.has-unit').evaluateAll((cells) => {
    const counts = [0, 0, 0];
    for (const cell of cells) counts[Number(cell.dataset.column)] += 1;
    return counts;
  });
  const columns = [0, 1, 2].sort((left, right) => columnCounts[left] - columnCounts[right] || left - right);
  const rows = [recipe.row, 1, 0, 2].filter((value, index, values) => values.indexOf(value) === index);
  for (const column of columns) {
    for (const row of rows) {
      const cell = page.locator(`#battle-board [data-action="choose-cell"][data-column="${column}"][data-row="${row}"]:not(.has-unit)`);
      if (await visible(cell)) return { cell, column, row };
    }
  }
  return null;
}

async function deploy(page, recipe) {
  for (const symbol of recipe.symbols) {
    const wrap = await handWrap(page, symbol);
    if (!wrap) return false;
    await wrap.locator('.card-secondary-action').click();
  }
  const selectors = page.locator('#camp [data-action="select-camp-card"]');
  for (let index = 0; index < recipe.symbols.length; index += 1) await selectors.nth(index).click();
  const target = await chooseCell(page, recipe);
  if (!target) return false;
  await target.cell.click();
  await page.waitForTimeout(80);
  report.observations.push({ type: 'deployed', unit: recipe.unit, column: target.column, row: target.row });
  return true;
}

async function preparePhase(page) {
  const draw = page.getByRole('button', { name: '抽牌', exact: true });
  if (await visible(draw) && !await draw.isDisabled()) await draw.click();

  let attempts = 0;
  while (attempts < 6) {
    attempts += 1;
    const symbols = await handSymbols(page);
    const recipe = recipeFor(symbols);
    if (recipe && await deploy(page, recipe)) continue;
    const reroll = page.getByRole('button', { name: '重抽', exact: true });
    if (await visible(reroll) && !await reroll.isDisabled()) {
      await reroll.click();
      await page.waitForTimeout(80);
      continue;
    }
    break;
  }

  const deployedCount = await page.locator('#battle-board .board-cell.has-unit').count();
  report.observations.push({ type: 'phase-ready', deployedCount, hand: await handSymbols(page) });
  if (deployedCount >= 3) report.gates.deployedAtLeastThreeUnits = true;
  const start = page.getByRole('button', { name: '開始呢一段', exact: true });
  if (!await visible(start) || await start.isDisabled()) throw new Error('Phase cannot start after preparation');
  await start.click();
}

async function measure(page, status) {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  if (metrics.scrollWidth > metrics.innerWidth + 1) {
    report.gates.noHorizontalOverflow = false;
    report.errors.push({ type: 'horizontal-overflow', status, ...metrics });
  }
}

async function run() {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const server = spawn('python', ['-m', 'http.server', '8000', '--directory', '_site'], { stdio: 'ignore' });
  let browser;
  try {
    await waitForServer();
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: report.viewport, isMobile: true, hasTouch: true });
    await context.addInitScript(() => localStorage.clear());
    const page = await context.newPage();
    page.on('pageerror', (error) => report.errors.push({ type: 'pageerror', message: error.message }));
    page.on('console', (message) => {
      if (message.type() === 'error') report.errors.push({ type: 'console', message: message.text() });
    });

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '開始下一戰', exact: true }).click();

    const deadline = Date.now() + 120000;
    let lastStatus = null;
    let lastStatusAt = 0;
    while (Date.now() < deadline) {
      const status = await page.locator('#v2-game-app').getAttribute('data-status');
      await measure(page, status);
      if (status !== lastStatus || Date.now() - lastStatusAt > 5000) {
        const snapshot = await page.evaluate(() => ({
          status: document.querySelector('#v2-game-app')?.dataset.status ?? null,
          phase: document.querySelector('#run-status')?.textContent?.trim() ?? '',
          orders: document.querySelector('#orders')?.textContent?.trim() ?? '',
          units: document.querySelectorAll('#battle-board .board-cell.has-unit').length,
          enemies: document.querySelectorAll('#enemy-field .enemy-token').length,
        }));
        report.observations.push({ type: 'status', elapsedMs: 120000 - (deadline - Date.now()), ...snapshot });
        lastStatus = status;
        lastStatusAt = Date.now();
      }
      if (status === 'configuration') {
        await preparePhase(page);
      } else if (status === 'combat') {
        const speed = page.locator('#orders [data-action="set-speed"]');
        if (await visible(speed) && /速度 2×/.test((await speed.textContent()) ?? '')) await speed.click();
        const resume = page.locator('#orders [data-action="resume"]');
        if (await visible(resume)) await resume.click();
      } else if (status === 'battle-report') {
        const panel = page.locator('#primary-actions [data-battle-report-visible="true"]');
        report.gates.battleReportVisible = await visible(panel);
        await page.screenshot({ path: `${ARTIFACT_DIR}/battle-report.png`, fullPage: true });
        const next = page.locator('#primary-actions [data-action="continue-after-report"]');
        if (!await visible(next)) throw new Error('Battle report has no continue action');
        await next.click();
      } else if (status === 'reward') {
        report.gates.reachedReward = true;
        await page.screenshot({ path: `${ARTIFACT_DIR}/reward.png`, fullPage: true });
        break;
      } else if (status === 'defeat') {
        throw new Error('Tutorial ended in defeat');
      }
      await page.waitForTimeout(250);
    }
    if (!report.gates.reachedReward) throw new Error('Tutorial did not reach reward before timeout');
  } finally {
    await browser?.close();
    server.kill('SIGTERM');
  }
}

try {
  await run();
} catch (error) {
  report.errors.push({ type: 'first-playable', message: error.message, stack: error.stack });
}

report.gates.noRuntimeErrors = !report.errors.some(({ type }) => ['pageerror', 'console'].includes(type));
await writeFile(`${ARTIFACT_DIR}/report.json`, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log('HANZI_V2_FIRST_PLAYABLE_REPORT');
console.log(JSON.stringify(report, null, 2));
if (!Object.values(report.gates).every(Boolean) || report.errors.length) process.exitCode = 1;
