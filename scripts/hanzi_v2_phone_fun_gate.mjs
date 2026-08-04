import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const URL = 'http://127.0.0.1:8001/games/hanzi-generals/v2/?seed=phone-fun-gate';

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

async function run() {
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
    await page.locator('#help-panel [data-action="close-help"]').click();
    await openPersistentPanel(page, 'open-codex', '#codex-panel', '圖鑑');
    await page.locator('#codex-panel [data-action="close-codex"]').click();

    await page.getByRole('button', { name: '開始下一戰', exact: true }).click();
    const drawButton = page.getByRole('button', { name: /抽牌/ });
    assert(/1\/1/.test((await drawButton.innerText()) ?? ''), 'draw action must show visible 1/1 budget');
    await drawButton.click();
    assert(/0\/1/.test((await drawButton.innerText()) ?? ''), 'draw action must show visible 0/1 budget after use');
    assert(await drawButton.isDisabled(), 'draw action must disable after budget is consumed');

    const stageBox = await page.locator('.battle-stage').boundingBox();
    const enemyBox = await page.locator('#enemy-field').boundingBox();
    const boardBox = await page.locator('#battle-board').boundingBox();
    assert(stageBox && enemyBox && boardBox, 'battle geometry must be measurable');
    assert(enemyBox.y < boardBox.y, 'enemy direction must be above player board');
    const wall = page.locator('[data-wall], .wall-status, .wall-line').first();
    assert(await wall.count() === 1, 'wall must have a dedicated visible element');

    await page.evaluate(() => {
      const save = localStorage.getItem('hanzi-generals-v2:save:v1');
      if (!save) throw new Error('canonical save missing before reload check');
    });
    await page.reload({ waitUntil: 'networkidle' });
    assert(/0\/1/.test((await page.getByRole('button', { name: /抽牌/ }).innerText()) ?? ''), 'consumed draw budget must survive reload');

    await openPersistentPanel(page, 'open-help', '#help-panel', '玩法說明');
    await page.locator('#help-panel [data-action="close-help"]').click();
    await openPersistentPanel(page, 'open-codex', '#codex-panel', '圖鑑');
  } finally {
    await browser?.close();
    server.kill('SIGTERM');
  }
}

await run();
console.log('HANZI_V2_PHONE_FUN_GATE_OK');
