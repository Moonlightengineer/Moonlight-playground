import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const ARTIFACT_DIR = 'artifacts/hanzi-v2-playtest';
const BASE_URL = 'http://127.0.0.1:8000/games/hanzi-generals/v2/?seed=playtest-0';
const RECIPES = [
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
  rewardExplanationVisible: false,
  combatFeedbackObserved: false,
  helpRoundTripPassed: false,
  battleReportVisible: false,
  noHorizontalOverflow: true,
};

function addUnique(collection, id, summary, evidence = {}) {
  if (!collection.some((item) => item.id === id)) collection.push({ id, summary, evidence });
}

function bug(id, summary, evidence = {}) {
  addUnique(bugs, id, summary, evidence);
}

function warning(id, summary, evidence = {}) {
  addUnique(warnings, id, summary, evidence);
}

function findRecipe(hand) {
  return RECIPES.find(({ symbols }) => {
    const remaining = [...hand];
    return symbols.every((symbol) => {
      const index = remaining.indexOf(symbol);
      if (index < 0) return false;
      remaining.splice(index, 1);
      return true;
    });
  }) ?? null;
}

async function waitForServer(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(BASE_URL)).ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Static server did not start');
}

async function visible(locator) {
  return (await locator.count()) > 0 && locator.first().isVisible();
}

async function screenshot(page, name) {
  await page.screenshot({ path: `${ARTIFACT_DIR}/${name}.png`, fullPage: true });
}

async function handSymbols(page) {
  return (await page.locator('#hand .hand-card').allTextContents()).map((text) => text.trim());
}

async function handWrapBySymbol(page, symbol) {
  const wraps = page.locator('#hand .hand-card-wrap');
  for (let index = 0; index < await wraps.count(); index += 1) {
    const wrap = wraps.nth(index);
    if ((await wrap.locator('.hand-card').textContent())?.trim() === symbol) return wrap;
  }
  return null;
}

async function deployViaCamp(page, recipe, column, row) {
  for (const symbol of recipe.symbols) {
    const wrap = await handWrapBySymbol(page, symbol);
    if (!wrap) throw new Error(`Hand does not contain ${symbol}`);
    await wrap.locator('.card-secondary-action').click();
  }

  const selects = page.locator('#camp [data-action="select-camp-card"]');
  const returns = page.locator('#camp [data-action="return-camp-card"]');
  if (await selects.count() < recipe.symbols.length || await returns.count() < recipe.symbols.length) {
    bug('camp-not-actionable', 'Camp cards must expose separate select and return controls');
    return;
  }
  for (let index = 0; index < recipe.symbols.length; index += 1) await selects.nth(index).click();
  if (await page.locator('#camp [aria-pressed="true"]').count() < recipe.symbols.length) {
    bug('camp-selection-not-visible', 'Selected camp cards are not visibly confirmed');
  }
  await page.locator(`#battle-board [data-action="choose-cell"][data-column="${column}"][data-row="${row}"]`).click();
  await page.waitForTimeout(100);
}

async function positions(page) {
  return page.locator('#battle-board .board-cell.has-unit').evaluateAll((buttons) => Object.fromEntries(
    buttons.map((button) => [button.dataset.unitId, {
      column: Number(button.dataset.column),
      row: Number(button.dataset.row),
      text: button.textContent?.trim(),
    }]),
  ));
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
    gates.noHorizontalOverflow = false;
    bug('horizontal-overflow', `${phase} has horizontal overflow`, metrics);
  }
  if (phase === 'combat' && metrics.scrollHeight > metrics.innerHeight * 1.45) {
    bug('combat-page-too-tall', 'Combat screen requires excessive vertical scrolling', metrics);
  }
}

async function rewardExplanationFixture(page) {
  return page.evaluate(async () => {
    const [{ renderApp }, { createExpedition }, { REWARDS }] = await Promise.all([
      import('./src/ui/render-interactive.js'),
      import('./src/expedition/expedition.js'),
      import('./data/rewards.js'),
    ]);
    const root = document.createElement('main');
    root.id = 'reward-fixture-root';
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
    `;
    root.style.width = 'min(100%, 390px)';
    document.body.append(root);
    const game = {
      ...createExpedition('reward-copy-fixture'),
      status: 'reward',
      rewardChoices: REWARDS.slice(0, 3),
      tutorial: { index: 4, complete: true, skipped: false },
      ui: {},
    };
    renderApp(root, game);
    const cards = [...root.querySelectorAll('.reward-button')].map((card) => ({
      name: card.querySelector('.reward-name')?.textContent?.trim(),
      summary: card.querySelector('.reward-summary')?.textContent?.trim(),
      effect: card.querySelector('.reward-effect')?.textContent?.trim(),
      useCase: card.querySelector('.reward-use-case')?.textContent?.trim(),
    }));
    const result = {
      cards,
      complete: cards.length === 3 && cards.every((card) => (
        card.name && card.summary && card.effect && card.useCase
      )),
      overflow: root.scrollWidth > root.clientWidth + 1,
    };
    root.remove();
    return result;
  });
}

async function verifyHelpAtRest(page) {
  const before = await page.locator('#v2-game-app').getAttribute('data-status');
  await page.locator('.game-header [data-action="open-help"]').click();
  const panel = page.locator('#help-panel');
  const sectionCount = await panel.locator('[data-help-section]').count();
  const visiblePanel = await visible(panel);
  await measurePage(page, 'help');
  await screenshot(page, '01b-help');
  await panel.locator('[data-action="close-help"]').click();
  const after = await page.locator('#v2-game-app').getAttribute('data-status');
  return {
    passed: visiblePanel && sectionCount === 9 && before === after && await panel.isHidden(),
    before,
    after,
    sectionCount,
  };
}

async function verifyCombatHelpRoundTrip(page) {
  const runningBefore = await visible(page.locator('#orders [data-action="pause"]'));
  await page.locator('#orders [data-action="open-help"]').click();
  const panel = page.locator('#help-panel');
  const panelVisible = await visible(panel);
  const pausedBehindPanel = await visible(page.locator('#orders [data-action="resume"]'));
  await panel.locator('[data-action="close-help"]').click();
  const resumedAfter = await visible(page.locator('#orders [data-action="pause"]'));
  return { passed: runningBefore && panelVisible && pausedBehindPanel && resumedAfter, runningBefore, panelVisible, pausedBehindPanel, resumedAfter };
}

async function observeCombatFeedback(page) {
  const handle = await page.waitForFunction(() => {
    const damage = document.querySelector('#combat-feedback-layer .combat-damage');
    const attacker = document.querySelector('.is-attacking');
    const target = document.querySelector('.is-hit');
    if (!damage || !attacker || !target) return false;
    return {
      damage: damage.textContent?.trim(),
      attacker: attacker.getAttribute('aria-label') ?? attacker.textContent?.trim(),
      target: target.getAttribute('aria-label') ?? target.textContent?.trim(),
      projectile: Boolean(document.querySelector('#combat-feedback-layer .combat-projectile')),
    };
  }, null, { timeout: 2500 }).catch(() => null);
  return handle ? handle.jsonValue() : null;
}

async function play() {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const server = spawn('python', ['-m', 'http.server', '8000', '--directory', '_site'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let browser;
  try {
    await waitForServer();
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

    const rewardFixture = await rewardExplanationFixture(page);
    gates.rewardExplanationVisible = rewardFixture.complete && !rewardFixture.overflow;
    observations.push({ phase: 'reward-explanation-fixture', ...rewardFixture });
    if (!gates.rewardExplanationVisible) {
      bug('reward-explanation-gate-failed', 'Reward choices do not expose complete mobile-readable explanations', rewardFixture);
    }

    const helpAtRest = await verifyHelpAtRest(page);
    observations.push({ phase: 'help-at-rest', ...helpAtRest });
    if (!helpAtRest.passed) bug('help-at-rest-failed', 'Help does not open, render all sections, and return to the same run state', helpAtRest);

    await page.getByRole('button', { name: '開始下一戰', exact: true }).click();
    await page.getByRole('button', { name: '抽牌', exact: true }).click();

    const firstHand = await handSymbols(page);
    const firstRecipe = findRecipe(firstHand);
    observations.push({ phase: 'first-draw', firstHand, firstRecipe });
    if (!firstRecipe) {
      bug('opening-hand-has-no-recipe', 'Opening hand has no usable recipe', { firstHand });
      return;
    }
    await deployViaCamp(page, firstRecipe, 1, 2);

    const reroll = page.getByRole('button', { name: '重抽', exact: true });
    if (!(await visible(reroll)) || await reroll.isDisabled()) {
      bug('second-unit-reroll-unavailable', 'Free reroll is unavailable for the two-unit fixture');
      return;
    }
    await reroll.click();
    const secondHand = await handSymbols(page);
    const secondRecipe = findRecipe(secondHand);
    observations.push({ phase: 'second-draw', secondHand, secondRecipe });
    if (!secondRecipe) {
      bug('second-hand-has-no-recipe', 'Deterministic fixture cannot deploy a second unit', { secondHand });
      return;
    }
    await deployViaCamp(page, secondRecipe, 1, 1);

    const deployed = await positions(page);
    observations.push({ phase: 'assembly', firstRecipe, secondRecipe, deployed });
    if (Object.keys(deployed).length !== 2) {
      bug('two-unit-fixture-blocked', 'Two adjacent units were not deployed', { deployed });
      return;
    }
    await screenshot(page, '02-two-units');

    await page.getByRole('button', { name: '開始呢一段', exact: true }).click();
    await page.waitForTimeout(60);

    const combatHelp = await verifyCombatHelpRoundTrip(page);
    gates.helpRoundTripPassed = helpAtRest.passed && combatHelp.passed;
    observations.push({ phase: 'help-combat-round-trip', ...combatHelp });
    if (!gates.helpRoundTripPassed) bug('help-round-trip-gate-failed', 'Help does not preserve and resume active combat correctly', combatHelp);

    const pause = page.locator('#orders [data-action="pause"]');
    if (await visible(pause)) await pause.click();
    else bug('pause-not-immediately-available', 'Pause is unavailable immediately after combat starts');
    await measurePage(page, 'combat');

    const enemy = page.locator('#enemy-field .enemy-token').first();
    if (!await visible(enemy)) {
      bug('enemy-not-visible', 'Combat starts without a visible enemy');
      return;
    }

    const beforeSwap = await positions(page);
    const swapButton = page.getByRole('button', { name: '變陣', exact: true });
    if (!(await visible(swapButton)) || await swapButton.isDisabled()) {
      bug('swap-order-unavailable', 'Swap is unavailable with two adjacent units');
    } else {
      await swapButton.click();
      const source = page.locator('#battle-board .board-cell.is-order-target.has-unit').first();
      if (!await visible(source)) {
        bug('swap-has-no-source-selection', 'Swap does not expose a valid source unit');
      } else {
        await source.click();
        const emptyTargets = await page.locator('#battle-board .board-cell.is-order-target:not(.has-unit)').count();
        if (emptyTargets) bug('swap-allows-empty-target', 'Swap exposes empty cells', { emptyTargets });
        const target = page.locator('#battle-board .board-cell.is-order-target.has-unit').first();
        if (!await visible(target)) bug('swap-has-no-unit-target', 'Swap does not expose the adjacent unit');
        else await target.click();
      }
    }

    const focusButton = page.getByRole('button', { name: '集火', exact: true });
    if (!(await visible(focusButton)) || await focusButton.isDisabled()) {
      bug('focus-order-unavailable', 'Focus is unavailable despite a canonical legal enemy');
    } else {
      await focusButton.click();
      const illegalTargets = await page.locator('#enemy-field .enemy-token[data-focus-eligible="false"].is-order-target').count();
      if (illegalTargets) bug('focus-exposes-illegal-targets', 'Focus exposes illegal targets', { illegalTargets });
      const legal = page.locator('#enemy-field .enemy-token[data-focus-eligible="true"].is-order-target').first();
      if (!await visible(legal)) {
        bug('focus-has-no-legal-target', 'Focus does not expose the canonical legal enemy');
      } else {
        await legal.click();
        const status = await page.locator('#orders .order-status').textContent().catch(() => null);
        if (!/剩餘\s*3\s*輪/.test(status ?? '')) bug('focus-feedback-missing', 'Focus duration is not visible', { status });
      }
    }

    const fortify = page.getByRole('button', { name: '守2路', exact: true });
    if (!(await visible(fortify)) || await fortify.isDisabled()) {
      bug('fortify-order-unavailable', 'Fortify is unavailable before all three command points are spent');
    } else {
      await fortify.click();
      const status = await page.locator('#orders .order-status').textContent().catch(() => null);
      const highlighted = await page.locator('#enemy-field .enemy-lane.is-fortified').count();
      if (!/剩餘\s*2\s*輪/.test(status ?? '') || !highlighted) {
        bug('fortify-feedback-missing', 'Fortify lane or duration is not visible', { status, highlighted });
      }
    }
    await screenshot(page, '03-orders-applied');

    const beforeEnemy = { distance: await enemy.getAttribute('data-distance'), box: await enemy.boundingBox() };
    const resume = page.locator('#orders [data-action="resume"]');
    if (await visible(resume)) await resume.click();
    const feedbackEvidence = await observeCombatFeedback(page);
    gates.combatFeedbackObserved = Boolean(feedbackEvidence?.damage && feedbackEvidence?.attacker && feedbackEvidence?.target);
    observations.push({ phase: 'combat-feedback', evidence: feedbackEvidence });
    if (!gates.combatFeedbackObserved) {
      bug('combat-feedback-gate-failed', 'A real combat step did not expose attacker, target, and damage feedback', { feedbackEvidence });
    }

    const activePause = page.locator('#orders [data-action="pause"]');
    if (await visible(activePause)) await activePause.click();

    const afterSwap = await positions(page);
    const ids = Object.keys(beforeSwap);
    if (ids.length === 2) {
      const [firstId, secondId] = ids;
      const swapped = afterSwap[firstId]?.column === beforeSwap[secondId]?.column
        && afterSwap[firstId]?.row === beforeSwap[secondId]?.row
        && afterSwap[secondId]?.column === beforeSwap[firstId]?.column
        && afterSwap[secondId]?.row === beforeSwap[firstId]?.row;
      observations.push({ phase: 'swap-applied', beforeSwap, afterSwap, swapped });
      if (!swapped) bug('swap-not-applied', 'Adjacent unit positions were not exchanged', { beforeSwap, afterSwap });
    }

    const movingEnemy = page.locator('#enemy-field .enemy-token').first();
    if (await visible(movingEnemy)) {
      const afterEnemy = { distance: await movingEnemy.getAttribute('data-distance'), box: await movingEnemy.boundingBox() };
      observations.push({ phase: 'enemy-movement', beforeEnemy, afterEnemy });
      if (beforeEnemy.distance === afterEnemy.distance) bug('enemy-distance-static', 'Enemy distance did not update');
      if (beforeEnemy.box && afterEnemy.box) {
        const beforeCenterX = beforeEnemy.box.x + beforeEnemy.box.width / 2;
        const afterCenterX = afterEnemy.box.x + afterEnemy.box.width / 2;
        const dx = Math.abs(afterCenterX - beforeCenterX);
        const dy = Math.abs(afterEnemy.box.y - beforeEnemy.box.y);
        if (dx > dy + 2) bug('enemy-moves-sideways', 'Enemy moves sideways instead of top-to-bottom', { dx, dy });
        if (dy < 2) bug('enemy-motion-not-visible', 'Enemy distance changes without visible vertical motion', { dx, dy });
      }
    }

    const resumeAgain = page.locator('#orders [data-action="resume"]');
    if (await visible(resumeAgain)) await resumeAgain.click();
    const speed = page.locator('#orders [data-action="set-speed"]');
    if (await visible(speed)) await speed.click();

    const deadline = Date.now() + 45000;
    let terminal = null;
    while (Date.now() < deadline) {
      const status = await page.locator('#v2-game-app').getAttribute('data-status');
      if (['reward', 'defeat', 'victory'].includes(status)) {
        terminal = status;
        break;
      }
      if (status === 'battle-report') {
        const panel = page.locator('#primary-actions [data-battle-report-visible="true"]');
        const reportTitle = (await panel.locator('.result-title').textContent().catch(() => null))?.trim() ?? '';
        const statCount = await panel.locator('.battle-report-stats .result-stat').count();
        const continueButton = page.locator('#primary-actions [data-action="start-new-run"]');
        const buttonVisible = await visible(continueButton);
        gates.battleReportVisible = await visible(panel) && statCount >= 5 && buttonVisible;
        observations.push({
          phase: 'battle-report',
          reportTitle,
          statCount,
          continueLabel: buttonVisible ? (await continueButton.textContent())?.trim() : null,
          visible: gates.battleReportVisible,
        });
        await measurePage(page, 'battle-report');
        await screenshot(page, '04-battle-report');
        if (!gates.battleReportVisible) {
          bug('battle-report-gate-failed', 'Battle report is missing summary stats or an explicit continue action', {
            reportTitle,
            statCount,
            buttonVisible,
          });
          break;
        }
        await continueButton.click();
        await page.waitForTimeout(100);
        continue;
      }
      if (status === 'configuration') {
        const startPhase = page.getByRole('button', { name: '開始呢一段', exact: true });
        if (await startPhase.count() && !await startPhase.isDisabled()) await startPhase.click();
      }
      await page.waitForTimeout(500);
    }

    gates.smokeReachedTerminal = Boolean(terminal);
    gates.onboardingReachedReward = terminal === 'reward';
    observations.push({ phase: 'first-battle-result', terminal, gates: { ...gates } });
    if (!gates.battleReportVisible) bug('battle-report-not-observed', 'First battle did not expose the canonical battle report');
    if (!terminal) bug('battle-flow-stalls', 'First battle did not reach a terminal state after the report');
    if (terminal === 'defeat') {
      warning('onboarding-product-gate-not-passed', 'Smoke flow reached defeat, but onboarding did not reach reward', { terminal });
    }
    await screenshot(page, '05-result');

    if (!gates.noHorizontalOverflow) bug('no-horizontal-overflow-gate-failed', 'One or more mobile phases overflow horizontally');
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
