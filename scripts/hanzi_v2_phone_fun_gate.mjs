import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const BASE_URL = 'http://127.0.0.1:8001/games/hanzi-generals/v2/';
const ARTIFACT = 'artifacts/hanzi-v2-playtest/10-phone-fun-gate.png';

function gameUrl(seed) {
  const url = new URL(BASE_URL);
  url.searchParams.set('seed', seed);
  return url.toString();
}

async function waitForServer() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(gameUrl('server-check'))).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('phone fun gate server did not start');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function createCleanPhonePage(browser, seed) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto(gameUrl(seed), { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload({ waitUntil: 'networkidle' });
  return { context, page };
}

async function getRenderedViewModel(page) {
  return page.evaluate(async () => {
    const { getRenderedViewModel } = await import('./src/ui/rendered-view-model.js');
    const root = document.querySelector('#v2-game-app');
    const model = root ? getRenderedViewModel(root) : null;
    return model ? JSON.parse(JSON.stringify(model)) : null;
  });
}

function orderCount(viewModel) {
  const label = viewModel?.runStatus?.orderLabel ?? '';
  const match = label.match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

function combatSignature(viewModel) {
  return JSON.stringify({
    statuses: viewModel?.orders?.statuses ?? [],
    enemies: (viewModel?.battleStage?.enemies ?? []).map(({ id, hp, distance, focused }) => ({
      id, hp, distance, focused,
    })),
    cells: (viewModel?.battleStage?.cells ?? [])
      .filter(({ kind }) => kind === 'unit')
      .map(({ unitId, column, row, hpLabel, fortified }) => ({ unitId, column, row, hpLabel, fortified })),
  });
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

async function assertPersistentPanels(page) {
  await openPersistentPanel(page, 'open-help', '#help-panel', '玩法說明');
  await closePanel(page, '#help-panel', 'close-help');
  await openPersistentPanel(page, 'open-codex', '#codex-panel', '圖鑑');
  const codexText = (await page.locator('#codex-panel').innerText()) ?? '';
  assert(codexText.includes('已發現') && codexText.includes('未發現'), 'Codex must expose complete discovered and undiscovered content');
  await closePanel(page, '#codex-panel', 'close-codex');
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

async function startCombat(page, { checkDrawBudget = false } = {}) {
  await page.getByRole('button', { name: '開始下一戰', exact: true }).click();
  const drawButton = page.getByRole('button', { name: /抽牌/ });
  if (checkDrawBudget) {
    assert(/1\/1/.test((await drawButton.innerText()) ?? ''), 'draw action must show visible 1/1 budget');
  }
  await drawButton.click();
  if (checkDrawBudget) {
    assert(/0\/1/.test((await drawButton.innerText()) ?? ''), 'draw action must show visible 0/1 budget after use');
    assert(await drawButton.isDisabled(), 'draw action must disable after budget is consumed');
  }
  await assembleTutorialUnit(page);
  await page.getByRole('button', { name: '開始呢一段', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#v2-game-app')?.dataset.status === 'combat');
  const pause = page.locator('#orders [data-action="pause"]');
  if (await pause.count()) await pause.click();
  const speedTwo = page.locator('#orders [data-action="set-speed"][data-speed="2"]');
  if (await speedTwo.count()) await speedTwo.click();
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

async function waitForOneCombatStep(page, issuedModel, orderLabel) {
  const resume = page.locator('#orders [data-action="resume"]');
  assert(await resume.count() === 1, `${orderLabel} scenario must be paused before deterministic step`);
  await resume.click();
  await page.waitForTimeout(900);
  const pause = page.locator('#orders [data-action="pause"]');
  if (await pause.count()) await pause.click();
  const stepped = await getRenderedViewModel(page);
  assert(stepped?.root?.status === 'combat', `${orderLabel} scenario must remain in active combat after one step`);
  assert(combatSignature(stepped) !== combatSignature(issuedModel), `${orderLabel} must survive a real combat step with measurable state change`);
  assert(stepped?.runStatus?.cardCountsReconciled === true, `${orderLabel} step must preserve canonical card ownership`);
  return stepped;
}

async function exerciseRedeploy(page) {
  const before = await getRenderedViewModel(page);
  const beforeOrders = orderCount(before);
  const redeploy = page.locator('#orders [data-action="begin-order"][data-order-type="redeploy"]');
  assert(await redeploy.count() === 1, 'redeploy must be visible during combat');
  await redeploy.click();

  const unit = page.locator('#battle-board [data-unit-id]').first();
  const unitId = await unit.getAttribute('data-unit-id');
  const beforeCell = `${await unit.getAttribute('data-column')},${await unit.getAttribute('data-row')}`;
  await unit.click();
  const legalCells = page.locator('#battle-board [data-action="choose-cell"].is-order-target');
  assert(await legalCells.count() > 1, 'redeploy must expose more than one legal target so one-shot rejection is testable');
  await legalCells.first().click();

  const movedUnit = page.locator(`#battle-board [data-unit-id="${unitId}"]`);
  const afterCell = `${await movedUnit.getAttribute('data-column')},${await movedUnit.getAttribute('data-row')}`;
  assert(beforeCell !== afterCell, 'redeploy must visibly move the unit');

  const issued = await getRenderedViewModel(page);
  assert(orderCount(issued) === beforeOrders - 1, 'redeploy must consume exactly one shared order point');
  assert(issued?.runStatus?.cardCountsReconciled === true, 'redeploy must preserve canonical card ownership');
  assert(((await page.locator('#action-message').textContent()) ?? '').trim().length > 0, 'redeploy must produce visible feedback');
  assert(await redeploy.isDisabled(), 'redeploy must become unavailable after its first successful use');

  const spent = orderCount(issued);
  await redeploy.click({ force: true }).catch(() => {});
  const afterRepeat = await getRenderedViewModel(page);
  assert(orderCount(afterRepeat) === spent, 'repeated redeploy must not spend another point');

  const stepped = await waitForOneCombatStep(page, issued, 'redeploy');
  const steppedUnit = stepped.battleStage.cells.find((cell) => cell.unitId === unitId);
  assert(`${steppedUnit?.column},${steppedUnit?.row}` === afterCell, 'redeployed unit must remain at its canonical destination after combat advances');
}

const ORDER_EXPECTATIONS = Object.freeze({
  fortify: { label: '固守', message: '固守', classSelector: '#enemy-field .enemy-lane.is-fortified' },
  assault: { label: '急攻', message: '急攻', classSelector: null },
  focus: { label: '集火', message: '集火', classSelector: '#enemy-field .enemy-token.is-focused' },
});

async function exerciseRetainedOrder(browser, type) {
  const expectation = ORDER_EXPECTATIONS[type];
  const { context, page } = await createCleanPhonePage(browser, `phone-gate-${type}`);
  try {
    await startCombat(page);
    const before = await getRenderedViewModel(page);
    const beforeOrders = orderCount(before);
    let controls;

    if (type === 'focus') {
      controls = page.locator('#orders [data-action="begin-order"][data-order-type="focus"]');
      assert(await controls.count() === 1, 'focus order must be visible');
      await controls.click();
      const target = page.locator('#enemy-field .enemy-token.is-order-target, #enemy-field .enemy-token[data-focus-eligible="true"]').first();
      assert(await target.count() === 1, 'focus must expose a legal enemy target');
      await target.click();
    } else {
      controls = page.locator(`#orders [data-action="issue-lane-order"][data-order-type="${type}"]`);
      assert(await controls.count() > 0, `${type} order must expose a legal lane`);
      await controls.first().click();
    }

    const issued = await getRenderedViewModel(page);
    assert(orderCount(issued) === beforeOrders - 1, `${type} must consume exactly one shared order point`);
    const statusText = (issued.orders.statuses ?? []).join('｜');
    assert(statusText.includes(expectation.label) && /剩餘\s*6\s*秒/.test(statusText), `${type} must expose canonical target and six-second duration`);
    assert(((await page.locator('#action-message').textContent()) ?? '').includes(expectation.message), `${type} must produce visible tactical feedback`);
    if (expectation.classSelector) {
      assert(await page.locator(expectation.classSelector).count() > 0, `${type} must have a visible target effect`);
    }

    for (const control of await controls.all()) {
      assert(await control.isDisabled(), `${type} must be disabled while active so it cannot refresh or spend twice`);
    }

    const stepped = await waitForOneCombatStep(page, issued, type);
    const steppedStatus = (stepped.orders.statuses ?? []).join('｜');
    assert(steppedStatus.includes(expectation.label), `${type} effect must remain active after a real combat step`);
    assert(steppedStatus !== statusText, `${type} duration or tactical state must advance after the step`);
  } finally {
    await context.close();
  }
}

function rewardEffectFingerprint(game) {
  return JSON.stringify({
    cardIds: Object.keys(game.cardsById ?? {}).sort(),
    campCapacity: game.camp?.capacity,
    boardSizeId: game.boardSizeId,
    evolutions: game.evolutions,
    specializations: game.troopSpecializations,
    unlockedRecipes: game.unlockedRecipes,
    wallHp: game.wallHp,
    temporary: game.temporary,
    tactics: game.tactics,
  });
}

async function exerciseRewardApplication(browser) {
  const { context, page } = await createCleanPhonePage(browser, 'phone-gate-reward');
  try {
    const prepared = await page.evaluate(async () => {
      const [
        { createExpedition },
        { generateRewardOffer },
        { loadSnapshot, saveSnapshot, STORAGE_KEYS },
      ] = await Promise.all([
        import('./src/expedition/expedition.js'),
        import('./src/reward/reward-flow.js'),
        import('./src/storage/storage.js'),
      ]);
      let game = createExpedition('phone-gate-reward');
      game = { ...game, completedBattleIds: ['tutorial'] };
      const generated = generateRewardOffer(game);
      game = {
        ...game,
        status: 'reward',
        rng: generated.rng,
        rewardChoices: generated.choices,
        rewardOfferHistory: [generated.record],
        legalActions: ['CHOOSE_REWARD'],
      };
      saveSnapshot(game);
      const loaded = loadSnapshot();
      return {
        ok: loaded.ok,
        saveKey: STORAGE_KEYS.save,
        rewardIds: loaded.ok ? loaded.game.rewardChoices.map(({ id }) => id) : [],
      };
    });
    assert(prepared.ok, 'production saveSnapshot/loadSnapshot must accept the reward precondition');
    assert(prepared.saveKey === 'hanzi-generals-v2:save:v1', 'reward gate must use the production versioned save key');

    await page.reload({ waitUntil: 'networkidle' });
    assert(await page.locator('#v2-game-app').getAttribute('data-status') === 'reward', 'real app must restore the reward screen from production storage');
    const reward = page.locator('#v2-game-app #primary-actions .reward-button').first();
    assert(await reward.count() === 1, 'real app must expose a concrete reward control');
    const rewardId = await reward.getAttribute('data-reward-id');

    const before = await page.evaluate(async () => {
      const { loadSnapshot } = await import('./src/storage/storage.js');
      const loaded = loadSnapshot();
      return loaded.ok ? loaded.game : null;
    });
    assert(before, 'reward precondition must load through the production loader');
    const beforeFingerprint = rewardEffectFingerprint(before);
    const beforeHistory = before.rewardHistory?.length ?? 0;

    await reward.click();
    await page.waitForFunction(() => document.querySelector('#v2-game-app')?.dataset.status !== 'reward');
    const applied = await page.evaluate(async () => {
      const { loadSnapshot, STORAGE_KEYS } = await import('./src/storage/storage.js');
      const raw = localStorage.getItem(STORAGE_KEYS.save);
      const loaded = loadSnapshot();
      return { raw, loaded };
    });
    assert(applied.raw, 'real controller must persist reward through the production save envelope');
    assert(applied.loaded.ok, 'persisted reward must reload through loadSnapshot');
    assert((applied.loaded.game.rewardHistory?.length ?? 0) === beforeHistory + 1, `reward ${rewardId} must be recorded exactly once`);
    assert(rewardEffectFingerprint(applied.loaded.game) !== beforeFingerprint, `reward ${rewardId} must alter canonical run state beyond history text`);
    const appliedFingerprint = rewardEffectFingerprint(applied.loaded.game);

    await page.reload({ waitUntil: 'networkidle' });
    const reloaded = await page.evaluate(async () => {
      const { loadSnapshot } = await import('./src/storage/storage.js');
      const loaded = loadSnapshot();
      return loaded.ok ? loaded.game : null;
    });
    assert(reloaded, 'rewarded run must survive a real navigation reload');
    assert((reloaded.rewardHistory?.length ?? 0) === beforeHistory + 1, 'reward history must survive reload');
    assert(rewardEffectFingerprint(reloaded) === appliedFingerprint, 'the exact applied reward effect must survive reload');
  } finally {
    await context.close();
  }
}

async function recordCheck(failures, name, action) {
  try {
    await action();
  } catch (error) {
    failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function run() {
  await mkdir('artifacts/hanzi-v2-playtest', { recursive: true });
  const server = spawn('python', ['-m', 'http.server', '8001', '--directory', '_site'], { stdio: 'ignore' });
  let browser;
  try {
    await waitForServer();
    browser = await chromium.launch({ headless: true });
    const failures = [];

    const { context, page } = await createCleanPhonePage(browser, 'phone-fun-gate');
    try {
      await recordCheck(failures, 'persistent panels in configuration', () => assertPersistentPanels(page));
      await recordCheck(failures, 'draw budget and combat entry', () => startCombat(page, { checkDrawBudget: true }));
      if ((await page.locator('#v2-game-app').getAttribute('data-status')) === 'combat') {
        await recordCheck(failures, 'persistent panels in combat', () => assertPersistentPanels(page));
        await recordCheck(failures, 'redeploy', () => exerciseRedeploy(page));
        await recordCheck(failures, 'combat geometry', () => assertCombatGeometry(page));
        await page.screenshot({ path: ARTIFACT, fullPage: true });
      }
    } finally {
      await context.close();
    }

    for (const type of ['fortify', 'assault', 'focus']) {
      await recordCheck(failures, `${type} retained order`, () => exerciseRetainedOrder(browser, type));
    }
    await recordCheck(failures, 'real reward application and reload', () => exerciseRewardApplication(browser));

    if (failures.length) {
      throw new Error(`Phone fun gate failures:\n- ${failures.join('\n- ')}`);
    }
  } finally {
    await browser?.close();
    server.kill('SIGTERM');
  }
}

await run();
console.log('HANZI_V2_PHONE_FUN_GATE_OK');
