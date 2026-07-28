import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const ARTIFACT_DIR = 'artifacts/hanzi-v2-playtest';
const BASE_URL = 'http://127.0.0.1:8003/games/hanzi-generals/v2/?seed=corrupt-save-playtest';
const bugs = [];
const observations = [];
const runtimeErrors = [];

function bug(id, summary, evidence = {}) {
  if (!bugs.some((item) => item.id === id)) bugs.push({ id, summary, evidence });
}

function attachRuntimeErrors(page, phase) {
  page.on('pageerror', (error) => runtimeErrors.push({ phase, type: 'pageerror', message: error.message }));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push({ phase, type: 'console', message: message.text() });
  });
}

async function waitForServer() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(BASE_URL)).ok) return;
    } catch {
      // Keep polling while the static server starts.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Corrupt-save recovery server did not start');
}

async function verifyCorruptSaveRecovery(browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await context.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('hanzi-generals-v2:save:v1', JSON.stringify({
      schemaVersion: 1,
      game: {
        status: 'reward',
        rewardChoices: [null],
      },
    }));
  });
  const page = await context.newPage();
  attachRuntimeErrors(page, 'corrupt-save');

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  const status = await page.locator('#v2-game-app').getAttribute('data-status');
  const startVisible = await page.getByRole('button', { name: '開始下一戰', exact: true }).isVisible().catch(() => false);
  await page.locator('.game-header [data-action="open-help"]').click();
  const resetVisible = await page.locator('#help-panel [data-action="clear-all-v2-data"]').isVisible().catch(() => false);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  const corruptSavePreserved = await page.evaluate(() => Boolean(localStorage.getItem('hanzi-generals-v2:save:v1')));

  const evidence = { phase: 'corrupt-save', status, startVisible, resetVisible, overflow, corruptSavePreserved };
  observations.push(evidence);
  if (status !== 'expedition-map' || !startVisible) {
    bug('corrupt-save-bootstrap-blocked', 'Malformed JSON save prevented a fresh expedition from starting', evidence);
  }
  if (!resetVisible) {
    bug('corrupt-save-reset-unavailable', 'Malformed JSON save recovery does not expose the complete reset control', evidence);
  }
  if (!corruptSavePreserved) {
    bug('corrupt-save-deleted-without-consent', 'Bootstrap silently deleted the malformed save instead of exposing reset', evidence);
  }
  if (overflow) bug('corrupt-save-overflow', 'Corrupt-save recovery screen overflows the mobile viewport', evidence);
  await page.screenshot({ path: `${ARTIFACT_DIR}/10-corrupt-save-recovery.png`, fullPage: true });
  await context.close();
}

async function verifyStaleRewardNormalization(browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  attachRuntimeErrors(page, 'stale-reward');
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });

  await page.evaluate(async () => {
    const [{ createExpedition }, { REWARD_BY_ID }, { CURRENT_SAVE_VERSION }] = await Promise.all([
      import('./src/expedition/expedition.js'),
      import('./data/rewards.js'),
      import('./src/storage/migrations.js'),
    ]);
    const base = createExpedition('stale-reward-browser');
    const game = {
      ...base,
      status: 'reward',
      currentBattle: {
        stageId: 'tutorial', phaseIndex: 2, phaseCount: 3, ordersRemaining: 0,
      },
      currentBattleResult: 'victory',
      rewardChoices: [
        REWARD_BY_ID['repair-wall'],
        REWARD_BY_ID['evolve-general'],
        REWARD_BY_ID['copy-card'],
      ],
      recruitedGeneralIds: [],
      evolutions: {},
      legalActions: ['CHOOSE_REWARD'],
    };
    localStorage.setItem('hanzi-generals-v2:save:v1', JSON.stringify({
      schemaVersion: CURRENT_SAVE_VERSION,
      game,
    }));
  });

  await page.reload({ waitUntil: 'networkidle' });
  const status = await page.locator('#v2-game-app').getAttribute('data-status');
  const rewardPanels = page.locator('#primary-actions > .reward-button');
  const rewardIds = await rewardPanels.evaluateAll((elements) => elements.map((element) => element.dataset.rewardId));
  const disabledCount = await page.locator(
    '#primary-actions > .reward-button.is-disabled, #primary-actions > button.reward-button:disabled',
  ).count();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  const evidence = {
    phase: 'stale-reward',
    status,
    rewardIds,
    rewardCount: rewardIds.length,
    disabledCount,
    overflow,
  };
  observations.push(evidence);

  if (status !== 'reward') {
    bug('stale-reward-status-lost', 'Stale reward snapshot did not reload into reward state', evidence);
  }
  if (rewardIds.length !== 3 || new Set(rewardIds).size !== 3) {
    bug('stale-reward-count', 'Stale reward snapshot was not normalized to three unique choices', evidence);
  }
  if (rewardIds.includes('repair-wall') || rewardIds.includes('evolve-general')) {
    bug('stale-reward-unavailable-visible', 'Unavailable stale rewards remained visible after reload', evidence);
  }
  if (disabledCount !== 0) {
    bug('stale-reward-disabled-options', 'Normalized reward screen still contains unavailable choices', evidence);
  }
  if (overflow) bug('stale-reward-overflow', 'Stale reward recovery screen overflows the mobile viewport', evidence);
  await page.screenshot({ path: `${ARTIFACT_DIR}/11-stale-reward-normalized.png`, fullPage: true });
  await context.close();
}

async function run() {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const server = spawn('python', ['-m', 'http.server', '8003', '--directory', '_site'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let browser;
  try {
    await waitForServer();
    browser = await chromium.launch({ headless: true });
    await verifyCorruptSaveRecovery(browser);
    await verifyStaleRewardNormalization(browser);
    if (runtimeErrors.length) bug('runtime-errors', 'Save recovery emitted runtime errors', { runtimeErrors });
  } finally {
    await browser?.close();
    server.kill('SIGTERM');
  }
}

try {
  await run();
} catch (error) {
  bug('save-recovery-playtest-crashed', error.message, { stack: error.stack });
}

const report = {
  generatedAt: new Date().toISOString(),
  viewport: { width: 390, height: 844 },
  url: BASE_URL,
  bugs,
  observations,
  runtimeErrors,
};
await writeFile(
  `${ARTIFACT_DIR}/corrupt-save-report.json`,
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
);
console.log('HANZI_V2_SAVE_RECOVERY_REPORT');
console.log(JSON.stringify(report, null, 2));
if (bugs.length) process.exitCode = 1;
