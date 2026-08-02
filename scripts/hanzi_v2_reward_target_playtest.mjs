import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const ARTIFACT_DIR = 'artifacts/hanzi-v2-playtest';
const BASE_URL = 'http://127.0.0.1:8002/games/hanzi-generals/v2/?seed=reward-direct-playtest';
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
  throw new Error('Direct reward server did not start');
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
      const [
        { renderApp },
        { bindInteractions },
        { createExpedition },
        { REWARD_BY_ID },
        { generateRewardOffer, applyRewardChoice },
      ] = await Promise.all([
        import('./src/ui/render-interactive.js'),
        import('./src/ui/interactions.js'),
        import('./src/expedition/expedition.js'),
        import('./data/rewards.js'),
        import('./src/reward/reward-flow.js'),
      ]);
      const root = document.createElement('main');
      root.id = 'reward-direct-fixture';
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

      const base = createExpedition('reward-direct-fixture');
      const catalogue = [
        REWARD_BY_ID['copy-card'],
        REWARD_BY_ID['remove-card'],
        REWARD_BY_ID['convert-cards'],
      ];
      const generated = generateRewardOffer(base, catalogue, base.rng);
      const game = {
        ...base,
        status: 'reward',
        currentBattle: { stageId: 'tutorial', phaseIndex: 2, phaseCount: 3, ordersRemaining: 0 },
        currentBattleResult: 'victory',
        rewardChoices: generated.choices,
        rewardOfferHistory: [generated.record],
        legalActions: ['CHOOSE_REWARD'],
      };
      const viewModel = renderApp(root, game);
      const dispatched = [];
      bindInteractions(root, (intent) => {
        dispatched.push(structuredClone(intent));
        return { ok: true };
      }, () => viewModel);

      const buttons = [...root.querySelectorAll('#primary-actions > button.reward-button')];
      for (const button of buttons) button.click();

      const applications = game.rewardChoices.map((choice) => {
        const applied = applyRewardChoice(game, choice.id);
        return {
          id: choice.id,
          baseId: choice.baseId,
          concrete: choice.concrete,
          permanent: choice.permanent,
          ok: applied.ok,
          nextStatus: applied.state?.status,
          beforeCount: Object.keys(game.cardsById).length,
          afterCount: Object.keys(applied.state?.cardsById ?? {}).length,
        };
      });

      return {
        offerCount: buttons.length,
        offerIds: buttons.map((button) => button.dataset.rewardId),
        names: buttons.map((button) => button.querySelector('.reward-name')?.textContent?.trim()),
        effects: buttons.map((button) => button.querySelector('.reward-effect')?.textContent?.trim()),
        targetPanelCount: root.querySelectorAll('.reward-target-panel').length,
        targetChoiceCount: root.querySelectorAll('.reward-target-choice').length,
        dispatched,
        applications,
        overflow: root.scrollWidth > root.clientWidth + 1,
      };
    });

    observations.push(result);
    if (result.offerCount !== 3 || new Set(result.offerIds).size !== 3) {
      bug('reward-offer-count', 'Reward screen does not expose exactly three unique concrete offers', result);
    }
    if (result.targetPanelCount !== 0 || result.targetChoiceCount !== 0) {
      bug('reward-second-layer-visible', 'Concrete reward screen still exposes a second target-selection layer', result);
    }
    if (result.dispatched.length !== 3) {
      bug('reward-direct-dispatch-count', 'Each concrete reward card must dispatch exactly one direct action', result);
    }
    for (let index = 0; index < result.dispatched.length; index += 1) {
      const intent = result.dispatched[index];
      if (intent?.type !== 'CHOOSE_REWARD' || intent.rewardId !== result.offerIds[index]) {
        bug('reward-direct-dispatch-invalid', 'Concrete reward click dispatched the wrong intent', { index, intent, result });
      }
      if (intent?.payload?.cardId || intent?.payload?.generalId || intent?.payload?.evolutionId) {
        bug('reward-direct-fabricated-target', 'Concrete reward dispatch fabricated a second-layer target', { index, intent });
      }
    }
    if (result.applications.some(({ concrete, permanent, ok, nextStatus }) => (
      concrete !== true || permanent !== true || ok !== true || nextStatus === 'reward'
    ))) {
      bug('reward-direct-application-failed', 'A concrete permanent reward did not apply and advance in one action', result);
    }
    if (result.overflow) bug('reward-direct-overflow', 'Concrete reward fixture overflows the mobile viewport', result);
    if (runtimeErrors.length) bug('runtime-errors', 'Concrete reward fixture emitted runtime errors', { runtimeErrors });
    await page.screenshot({ path: `${ARTIFACT_DIR}/09-reward-direct.png`, fullPage: true });
    await context.close();
  } finally {
    await browser?.close();
    server.kill('SIGTERM');
  }
}

try {
  await run();
} catch (error) {
  bug('reward-direct-playtest-crashed', error.message, { stack: error.stack });
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
console.log('HANZI_V2_REWARD_DIRECT_REPORT');
console.log(JSON.stringify(report, null, 2));
if (bugs.length) process.exitCode = 1;
