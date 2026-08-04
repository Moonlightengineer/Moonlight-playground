import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const URL = 'http://127.0.0.1:8001/games/hanzi-generals/v2/?seed=phone-fun-gate';
const ARTIFACT = 'artifacts/hanzi-v2-playtest/10-phone-fun-gate.png';

async function waitForServer() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(URL)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('phone fun gate server did not start');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function openPersistentPanel(page, action, panel, expectedText) {
  const control = page.locator(`.game-header [data-action="${action}"]`);
  assert(await control.count() === 1, `${action} must exist in persistent header navigation`);
  assert(await page.locator(`#orders [data-action="${action}"]`).count() === 0, `${action} must not be inside military orders`);
  await control.click();
  const target = page.locator(panel);
  await target.waitFor({ state: 'visible' });
  assert(((await target.innerText()) ?? '').includes(expectedText), `${action} panel content is incomplete`);
}

async function closePanel(page, panel, action) {
  await page.locator(`${panel} [data-action="${action}"]`).click();
  await page.locator(panel).waitFor({ state: 'hidden' });
}

async function handWrapBySymbol(page, symbol) {
  const cards = page.locator('#hand .hand-card-wrap');
  for (let index = 0; index < await cards.count(); index += 1) {
    const wrap = cards.nth(index);
    if ((await wrap.locator('.hand-card').textContent())?.trim() === symbol) return wrap;
  }
  throw new Error(`Hand does not contain ${symbol}`);
}

async function assembleTutorialUnit(page) {
  for (const symbol of ['張', '飛']) {
    const wrap = await handWrapBySymbol(page, symbol);
    await wrap.locator('.card-secondary-action').click();
  }
  const campCards = page.locator('#camp [data-action="select-camp-card"]');
  await campCards.nth(0).click();
  await campCards.nth(1).click();
  await page.locator('#battle-board [data-action="choose-cell"][data-column="1"][data-row="0"]').click();
}

async function assertCombatGeometry(page) {
  const enemy = await page.locator('#enemy-field').boundingBox();
  const wall = await page.locator('[data-wall], .wall-status, .wall-line').first().boundingBox();
  const board = await page.locator('#battle-board').boundingBox();
  const viewport = page.viewportSize();
  assert(enemy && wall && board && viewport, 'active-combat enemy/wall/board geometry must be measurable');
  assert(enemy.y + enemy.height <= wall.y, 'enemy field must finish above the wall');
  assert(wall.y + wall.height <= board.y, 'wall must sit between enemy field and player board');
  assert(wall.x >= 0 && wall.x + wall.width <= viewport.width, 'wall must remain visible inside iPhone width');
}

async function exerciseCombatControls(page) {
  await openPersistentPanel(page, 'open-help', '#help-panel', '玩法說明');
  await closePanel(page, '#help-panel', 'close-help');
  await openPersistentPanel(page, 'open-codex', '#codex-panel', '圖鑑');
  await closePanel(page, '#codex-panel', 'close-codex');

  await page.locator('#orders [data-action="pause"]').click();
  const ordersBefore = Number((await page.locator('[data-orders-remaining]').first().getAttribute('data-orders-remaining')) ?? '3');

  const redeploy = page.locator('#orders [data-action="begin-order"][data-order-type="redeploy"]');
  assert(await redeploy.count() === 1, 'redeploy must be visible during combat');
  await redeploy.click();
  const unit = page.locator('#battle-board [data-unit-id]').first();
  const unitId = await unit.getAttribute('data-unit-id');
  await unit.click();
  const legalCell = page.locator('#battle-board [data-action="choose-cell"].is-order-target').first();
  assert(await legalCell.count() === 1, 'redeploy must expose a legal target cell');
  const beforeCell = await unit.getAttribute('data-cell');
  await legalCell.click();
  const movedUnit = page.locator(`#battle-board [data-unit-id="${unitId}"]`);
  const afterCell = await movedUnit.getAttribute('data-cell');
  assert(beforeCell !== afterCell, 'redeploy must visibly move the unit');

  const status = page.locator('#orders .order-status');
  for (const type of ['fortify', 'assault', 'focus']) {
    const before = (await status.textContent()) ?? '';
    const begin = page.locator(`#orders [data-order-type="${type}"]`).first();
    assert(await begin.count() === 1, `${type} order must be visible`);
    await begin.click();
    if (type === 'focus') {
      const target = page.locator('#enemy-field .enemy-token.is-order-target').first();
      assert(await target.count() === 1, 'focus must expose a legal enemy target');
      await target.click();
    }
    const after = (await status.textContent()) ?? '';
    assert(after !== before && after.length > 0, `${type} must produce visible status feedback`);
  }

  const ordersAfterText = await page.locator('[data-orders-remaining]').first().getAttribute('data-orders-remaining');
  if (ordersAfterText !== null) assert(Number(ordersAfterText) < ordersBefore, 'orders must consume shared points');
  await assertCombatGeometry(page);
}

async function exerciseRewardApplication(page) {
  await page.evaluate(async () => {
    const [
      { renderApp },
      { bindInteractions },
      { createExpedition },
      { reduceGame },
      { generateRewardOffer },
    ] = await Promise.all([
      import('./src/ui/render-interactive.js'),
      import('./src/ui/interactions.js'),
      import('./src/expedition/expedition.js'),
      import('./src/core/state-machine.js'),
      import('./src/reward/reward-flow.js'),
    ]);

    const root = document.createElement('main');
    root.id = 'phone-gate-reward-fixture';
    root.innerHTML = `
      <section id="run-status"></section>
      <section class="battle-stage"><section id="enemy-intents"></section><section id="enemy-field"></section><section id="battle-board"></section></section>
      <section class="command-panel"><section id="camp"></section><section id="primary-actions"></section><section id="orders"></section></section>
      <section id="hand"></section><details id="details-panel"><summary>詳情</summary></details><p id="action-message"></p>
    `;
    document.body.append(root);

    let state = createExpedition('phone-gate-reward');
    const generated = generateRewardOffer(state);
    state = {
      ...state,
      status: 'reward',
      completedBattleIds: ['tutorial'],
      rewardChoices: generated.choices,
      rewardOfferHistory: [generated.record],
      legalActions: ['CHOOSE_REWARD'],
    };
    const before = JSON.stringify({
      cards: Object.keys(state.cardsById).length,
      camp: state.camp.capacity,
      boardSizeId: state.boardSizeId,
      evolutions: state.evolutions,
      specializations: state.troopSpecializations,
      history: state.rewardHistory ?? [],
    });

    function rerender() {
      const viewModel = renderApp(root, state);
      bindInteractions(root, (intent) => {
        const result = reduceGame(state, intent);
        if (!result.ok) return result;
        state = result.state;
        localStorage.setItem('hanzi-v2:phone-gate-reward', JSON.stringify(state));
        rerender();
        return result;
      }, () => viewModel);
    }
    rerender();
    root.dataset.beforeReward = before;
  });

  const fixture = page.locator('#phone-gate-reward-fixture');
  const reward = fixture.locator('#primary-actions .reward-button').first();
  assert(await reward.count() === 1, 'reward fixture must expose a concrete reward');
  const rewardId = await reward.getAttribute('data-reward-id');
  await reward.click();
  const applied = await page.evaluate(() => {
    const raw = localStorage.getItem('hanzi-v2:phone-gate-reward');
    if (!raw) return null;
    const state = JSON.parse(raw);
    return {
      status: state.status,
      rewardHistory: state.rewardHistory,
      cards: Object.keys(state.cardsById ?? {}).length,
      camp: state.camp?.capacity,
      boardSizeId: state.boardSizeId,
      evolutions: state.evolutions,
      specializations: state.troopSpecializations,
    };
  });
  assert(applied && applied.status !== 'reward', 'reward click must change canonical run state');
  assert((applied.rewardHistory?.length ?? 0) > 0, `reward ${rewardId} must be recorded`);

  await page.reload({ waitUntil: 'networkidle' });
  const reloaded = await page.evaluate(() => JSON.parse(localStorage.getItem('hanzi-v2:phone-gate-reward') ?? 'null'));
  assert(reloaded && reloaded.status !== 'reward', 'rewarded canonical state must survive reload');
  assert((reloaded.rewardHistory?.length ?? 0) > 0, 'reward history must survive reload');
}

async function run() {
  await mkdir('artifacts/hanzi-v2-playtest', { recursive: true });
  const server = spawn('python', ['-m', 'http.server', '8001', '--directory', '_site'], { stdio: 'ignore' });
  let browser;
  try {
    await waitForServer();
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await context.addInitScript(() => localStorage.clear());
    const page = await context.newPage();
    await page.goto(URL, { waitUntil: 'networkidle' });

    await openPersistentPanel(page, 'open-help', '#help-panel', '玩法說明');
    await closePanel(page, '#help-panel', 'close-help');
    await openPersistentPanel(page, 'open-codex', '#codex-panel', '圖鑑');
    await closePanel(page, '#codex-panel', 'close-codex');

    await page.getByRole('button', { name: '開始下一戰', exact: true }).click();
    const drawButton = page.getByRole('button', { name: /抽牌/ });
    assert(/1\/1/.test((await drawButton.innerText()) ?? ''), 'draw action must show visible 1/1 budget');
    await drawButton.click();
    assert(/0\/1/.test((await drawButton.innerText()) ?? ''), 'draw action must show visible 0/1 budget after use');
    assert(await drawButton.isDisabled(), 'draw action must disable after budget is consumed');

    await assembleTutorialUnit(page);
    await page.getByRole('button', { name: '開始呢一段', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#v2-game-app')?.dataset.status === 'combat');
    await exerciseCombatControls(page);
    await page.screenshot({ path: ARTIFACT, fullPage: true });

    await exerciseRewardApplication(page);
    await context.close();
  } finally {
    await browser?.close();
    server.kill('SIGTERM');
  }
}

await run();
console.log('HANZI_V2_PHONE_FUN_GATE_OK');
