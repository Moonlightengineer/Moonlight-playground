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
const warnings = [];
const observations = [];
const runtimeErrors = [];
const gates = {
  smokeReachedTerminal: false,
  onboardingReachedReward: false,
};

function bug(id, summary, evidence = {}) {
  if (!bugs.some((item) => item.id === id)) bugs.push({ id, summary, evidence });
}

function warning(id, summary, evidence = {}) {
  if (!warnings.some((item) => item.id === id)) warnings.push({ id, summary, evidence });
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

async function handSymbols(page) {
  return (await page.locator('#hand .hand-card').allTextContents()).map((text) => text.trim());
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

async function deployRecipeViaCamp(page, recipe, column, row) {
  for (const symbol of recipe.symbols) {
    const wrap = await handWrapBySymbol(page, symbol);
    if (!wrap) throw new Error(`Could not find ${symbol} before moving to camp`);
    await wrap.locator('.card-secondary-action').click();
  }

  const campActions = await page.locator('#camp [data-action]').evaluateAll((elements) => (
    elements.map((element) => ({ action: element.dataset.action, text: element.textContent?.trim() }))
  ));
  const campCanSelect = campActions.filter(({ action }) => action === 'select-camp-card').length >= recipe.symbols.length;
  const campCanReturn = campActions.some(({ action }) => action === 'return-camp-card');
  if (!campCanSelect || !campCanReturn) {
    bug('camp-not-actionable', 'Camp cards do not expose both select and return actions', { campActions });
    return false;
  }

  const campSelect = page.locator('#camp [data-action="select-camp-card"]');
  for (let index = 0; index < recipe.symbols.length; index += 1) await campSelect.nth(index).click();
  const selected = await page.locator('#camp [aria-pressed="true"]').count();
  if (selected < recipe.symbols.length) {
    bug('camp-selection-not-visible', 'Selecting camp recipe cards gives no visible selected state', { selected });
  }
  await page.locator(`#battle-board [data-action="choose-cell"][data-column="${column}"][data-row="${row}"]`).click();
  await page.waitForTimeout(100);
  return true;
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

async function visible(locator) {
  return (await locator.count()) > 0 && await locator.first().isVisible();
}

async function unitPositions(page) {
  return page.locator('#battle-board .board-cell.has-unit').evaluateAll((buttons) => Object.fromEntries(
    buttons.map((button) => [button.dataset.unitId, {
      column: Number(button.dataset.column),
      row: Number(button.dataset.row),
      text: button.textContent?.trim(),
    }]),
  ));
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

    const initialHand = await handSymbols(page);
    const firstRecipe = findOpeningRecipe(initialHand);
    observations.push({ phase: 'first-draw', initialHand, firstRecipe });
    if (!firstRecipe) {
      bug('opening-hand-has-no-recipe', 'Opening hand has no immediately usable recipe', { initialHand });
      return;
    }

    await deployRecipeViaCamp(page, firstRecipe, 0, 2);
    const firstUnits = await unitPositions(page);
    if (!Object.values(firstUnits).some(({ text }) => text.includes(firstRecipe.unit))) {
      bug('first-assembly-flow-blocked', `Could not assemble and deploy ${firstRecipe.unit}`, { firstUnits });
      return;
    }

    const reroll = page.getByRole('button', { name: '重抽', exact: true });
    if (!(await visible(reroll)) || await reroll.isDisabled()) {
      bug('second-unit-reroll-unavailable', 'Could not redraw for the adjacent swap fixture');
      return;
    }
    await reroll.click();
    const secondHand = await handSymbols(page);
    const secondRecipe = findOpeningRecipe(secondHand);
    observations.push({ phase: 'second-draw', secondHand, secondRecipe });
    if (!secondRecipe) {
      bug('second-hand-has-no-recipe', 'Deterministic onboarding fixture cannot deploy two adjacent units', { secondHand });
      return;
    }

    await deployRecipeViaCamp(page, secondRecipe, 0, 1);
    const deployed = await unitPositions(page);
    observations.push({ phase: 'assembly', firstRecipe, secondRecipe, deployed });
    if (Object.keys(deployed).length < 2) {
      bug('two-unit-fixture-blocked', 'Could not deploy two adjacent units for the approved swap order', { deployed });
      return;
    }
    await screenshot(page, '03-two-units');

    await (await exactButton(page, '開始呢一段')).click();
    await page.waitForTimeout(60);
    const pauseButton = page.locator('#orders [data-action="pause"]');
    if (await visible(pauseButton)) await pauseButton.click();
    else bug('pause-not-immediately-available', 'Pause control is not available immediately after combat starts');

    await screenshot(page, '04-combat-paused');
    await measurePage(page, 'combat');

    const enemy = page.locator('#enemy-field .enemy-token').first();
    if (!(await enemy.count())) {
      bug('enemy-not-visible', 'Combat started without a visible enemy token');
      return;
    }

    const positionsBeforeSwap = await unitPositions(page);
    const swapButton = page.getByRole('button', { name: '變陣', exact: true });
    if (!(await visible(swapButton)) || await swapButton.isDisabled()) {
      bug('swap-order-unavailable', '變陣 is unavailable with two adjacent deployed units');
    } else {
      await swapButton.click();
      const source = page.locator('#battle-board .board-cell.is-order-target.has-unit').first();
      if (!(await visible(source))) {
        bug('swap-has-no-source-selection', '變陣 does not expose a selectable source unit');
      } else {
        await source.click();
        const emptyTargets = await page.locator('#battle-board .board-cell.is-order-target:not(.has-unit)').count();
        if (emptyTargets) {
          bug('swap-allows-empty-target', '變陣 exposes an empty cell despite the approved two-unit exchange rule', { emptyTargets });
        }
        const target = page.locator('#battle-board .board-cell.is-order-target.has-unit').first();
        if (!(await visible(target))) {
          bug('swap-has-no-unit-target', '變陣 does not expose the adjacent friendly unit');
        } else {
          await target.click();
          observations.push({ phase: 'swap-queued', message: await page.locator('#action-message').textContent() });
        }
      }
    }

    const focusButton = page.getByRole('button', { name: '集火', exact: true });
    if (!(await visible(focusButton)) || await focusButton.isDisabled()) {
      bug('focus-order-unavailable', '集火 is unavailable while a legal enemy is visible');
    } else {
      await focusButton.click();
      const illegalTargets = await page.locator('#enemy-field .enemy-token[data-focus-eligible="false"].is-order-target').count();
      if (illegalTargets) {
        bug('focus-exposes-illegal-targets', '集火 exposes enemies outside canonical unit patterns', { illegalTargets });
      }
      const target = page.locator('#enemy-field .enemy-token[data-focus-eligible="true"].is-order-target').first();
      if (!(await visible(target))) {
        bug('focus-has-no-legal-target', '集火 does not expose a canonical legal enemy target');
      } else {
        await target.click();
        const focused = await page.locator('#enemy-field .enemy-token.is-focused').count();
        const orderStatus = await page.locator('#orders .order-status').textContent().catch(() => null);
        observations.push({ phase: 'focus-order', focused, orderStatus });
        if (!focused || !/剩餘\s*3\s*輪/.test(orderStatus ?? '')) {
          bug('focus-feedback-missing', '集火 target or remaining duration is not visibly confirmed', { focused, orderStatus });
        }
      }
    }

    const fortifyButton = page.getByRole('button', { name: '守1路', exact: true });
    if (await visible(fortifyButton) && !(await fortifyButton.isDisabled())) {
      await fortifyButton.click();
      const statusText = await page.locator('#orders .order-status').textContent().catch(() => null);
      const highlightedLane = await page.locator('#enemy-field .enemy-lane.is-fortified').count();
      observations.push({ phase: 'fortify-order', statusText, highlightedLane });
      if (!/剩餘\s*2\s*輪/.test(statusText ?? '') || !highlightedLane) {
        bug('fortify-feedback-missing', '堅守 does not visibly confirm its lane and remaining duration', { statusText, highlightedLane });
      }
    } else {
      bug('fortify-order-unavailable', '堅守 is unavailable before all three command points are spent');
    }

    await screenshot(page, '05-orders-applied');

    const beforeEnemy = {
      distance: await enemy.getAttribute('data-distance'),
      box: await enemy.boundingBox(),
    };
    const resumeButton = page.locator('#orders [data-action="resume"]');
    if (await visible(resumeButton)) await resumeButton.click();
    await page.waitForTimeout(760);
    const activePause = page.locator('#orders [data-action="pause"]');
    if (await visible(activePause)) await activePause.click();

    const positionsAfterSwap = await unitPositions(page);
    const beforeIds = Object.keys(positionsBeforeSwap);
    if (beforeIds.length >= 2) {
      const [firstId, secondId] = beforeIds;
      const swapped = positionsAfterSwap[firstId]?.column === positionsBeforeSwap[secondId]?.column
        && positionsAfterSwap[firstId]?.row === positionsBeforeSwap[secondId]?.row
        && positionsAfterSwap[secondId]?.column === positionsBeforeSwap[firstId]?.column
        && positionsAfterSwap[secondId]?.row === positionsBeforeSwap[firstId]?.row;
      observations.push({ phase: 'swap-applied', positionsBeforeSwap, positionsAfterSwap, swapped });
      if (!swapped) bug('swap-not-applied', 'Queued two-unit swap did not exchange the adjacent positions', { positionsBeforeSwap, positionsAfterSwap });
    }

    const movingEnemy = page.locator('#enemy-field .enemy-token').first();
    if (await movingEnemy.count()) {
      const afterEnemy = {
        distance: await movingEnemy.getAttribute('data-distance'),
        box: await movingEnemy.boundingBox(),
      };
      observations.push({ phase: 'enemy-movement', before: beforeEnemy, after: afterEnemy });
      if (beforeEnemy.distance === afterEnemy.distance) {
        bug('enemy-distance-static', 'Enemy distance did not update during active combat', { beforeEnemy, afterEnemy });
      }
      if (beforeEnemy.box && afterEnemy.box) {
        const dx = Math.abs(afterEnemy.box.x - beforeEnemy.box.x);
        const dy = Math.abs(afterEnemy.box.y - beforeEnemy.box.y);
        if (dx > dy + 2) bug('enemy-moves-sideways', 'Enemy token moves horizontally instead of top-to-bottom', { dx, dy });
        if (dy < 2) bug('enemy-motion-not-visible', 'Enemy distance changes but token has no visible vertical movement', { dx, dy });
      }
    }

    const pausedResume = page.locator('#orders [data-action="resume"]');
    if (await visible(pausedResume)) await pausedResume.click();
    const speedButton = page.locator('#orders [data-action="set-speed"]');
    if (await visible(speedButton)) await speedButton.click();

    const deadline = Date.now() + 30000;
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

    gates.smokeReachedTerminal = Boolean(terminal);
    gates.onboardingReachedReward = terminal === 'reward';
    observations.push({ phase: 'first-battle-result', terminal, gates: { ...gates } });
    if (!terminal) bug('battle-flow-stalls', 'First battle did not reach a terminal state within 30 seconds');
    if (terminal === 'defeat') {
      warning('onboarding-product-gate-not-passed', 'The scripted onboarding reached a valid defeat terminal but did not reach the reward screen', { terminal });
    }
    await screenshot(page, '06-result');

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
  warnings,
  gates,
  observations,
  runtimeErrors,
};
await writeFile(`${ARTIFACT_DIR}/report.json`, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log('HANZI_V2_PLAYTEST_REPORT');
console.log(JSON.stringify(report, null, 2));
if (bugs.length) process.exitCode = 1;
