import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const ARTIFACT_DIR = 'artifacts/hanzi-v2-playtest';
const BASE_URL = 'http://127.0.0.1:8002/games/hanzi-generals/v2/?seed=reward-target-playtest';
const bugs = [];
const runtimeErrors = [];
const observations = [];

function bug(id, summary, evidence = {}) {
  if (!bugs.some((item) => item.id === id)) bugs.push({ id, summary, evidence });
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
  throw new Error('Reward target server did not start');
}

async function run() {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const server = spawn('python', ['-m', 'http.server', '8002', '--directory', '_site'], {
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
    const page = await context.newPage();
    page.on('pageerror', (error) => runtimeErrors.push({ type: 'pageerror', message: error.message }));
    page.on('console', (message) => {
      if (message.type() === 'error') runtimeErrors.push({ type: 'console', message: message.text() });
    });
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    const result = await page.evaluate(async () => {
      const [{ renderApp }, { bindInteractions }, { createExpedition }, { REWARD_BY_ID }] = await Promise.all([
        import('./src/ui/render-interactive.js'),
        import('./src/ui/interactions.js'),
        import('./src/expedition/expedition.js'),
        import('./data/rewards.js'),
      ]);
      const root = document.createElement('main');
      root.id = 'reward-target-fixture';
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
      document.body.append(root);
      const base = createExpedition('reward-target-fixture');
      const game = {
        ...base,
        status: 'reward',
        currentBattle: { stageId: 'tutorial', phaseIndex: 2, phaseCount: 3, ordersRemaining: 0 },
        currentBattleResult: 'victory',
        rewardChoices: [
          REWARD_BY_ID['copy-card'],
          REWARD_BY_ID['remove-card'],
          REWARD_BY_ID['extra-reroll'],
        ],
        legalActions: ['CHOOSE_REWARD'],
      };
      const viewModel = renderApp(root, game);
      const dispatched = [];
      bindInteractions(root, (intent) => {
        dispatched.push(structuredClone(intent));
        return { ok: true };
      }, () => viewModel);

      const copyPanel = root.querySelector('[data-reward-id="copy-card"]');
      copyPanel.open = true;
      const copyTarget = copyPanel.querySelector('.reward-target-choice');
      copyTarget?.click();

      const rerollButton = root.querySelector('[data-reward-id="extra-reroll"]');
      rerollButton?.click();

      return {
        offerCount: root.querySelectorAll('#primary-actions > .reward-button').length,
        copyTopLevelCardId: copyPanel?.dataset.cardId ?? null,
        copyTargetCount: copyPanel?.querySelectorAll('.reward-target-choice').length ?? 0,
        copyTargetLabel: copyTarget?.textContent?.trim() ?? null,
        dispatched,
        overflow: root.scrollWidth > root.clientWidth + 1,
      };
    });

    observations.push(result);
    const [copyIntent, rerollIntent] = result.dispatched;
    if (result.offerCount !== 3) bug('reward-offer-count', 'Reward screen does not expose exactly three top-level offers', result);
    if (result.copyTopLevelCardId !== null) bug('reward-target-guessed', 'Copy reward still guesses a top-level card target', result);
    if (result.copyTargetCount < 1) bug('reward-targets-missing', 'Copy reward does not expose explicit target choices', result);
    if (copyIntent?.type !== 'CHOOSE_REWARD'
      || copyIntent.rewardId !== 'copy-card'
      || !copyIntent.payload?.cardId) {
      bug('reward-target-dispatch-invalid', 'Copy target click did not dispatch an explicit card target', { copyIntent });
    }
    if (rerollIntent?.type !== 'CHOOSE_REWARD'
      || rerollIntent.rewardId !== 'extra-reroll'
      || rerollIntent.payload?.cardId !== undefined) {
      bug('targetless-reward-payload', 'Targetless reward dispatch contains a fabricated card target', { rerollIntent });
    }
    if (result.overflow) bug('reward-target-overflow', 'Reward target fixture overflows the mobile viewport', result);
    if (runtimeErrors.length) bug('runtime-errors', 'Reward target fixture emitted runtime errors', { runtimeErrors });
    await page.screenshot({ path: `${ARTIFACT_DIR}/09-reward-targets.png`, fullPage: true });
  } finally {
    await browser?.close();
    server.kill('SIGTERM');
  }
}

try {
  await run();
} catch (error) {
  bug('reward-target-playtest-crashed', error.message, { stack: error.stack });
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
  `${ARTIFACT_DIR}/reward-target-report.json`,
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
);
console.log('HANZI_V2_REWARD_TARGET_REPORT');
console.log(JSON.stringify(report, null, 2));
if (bugs.length) process.exitCode = 1;
