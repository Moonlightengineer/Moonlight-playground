# 字陣無雙 v2｜群雄遠征 Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在完全保留 Classic 十波模式嘅前提下，建立一個可由隱藏 GitHub Pages 網址開啟、可完成六戰短遠征嘅《字陣無雙 v2》Vertical Slice。

**Architecture:** v2 以獨立 ES modules、資料驅動內容、純函式規則層同版本化 `localStorage` 建立；規則結果由離散行動輪決定，UI 只 render state 同播放 events。Classic 保持原封裝及網址，v2 只透過 build script 複製到 `_site/games/hanzi-generals/v2/`。

**Tech Stack:** HTML5、CSS、原生 JavaScript ES modules、Node.js 20 built-in test runner、Python 3 build script、GitHub Actions、GitHub Pages。

## Global Constraints

- Classic 公開入口保持 `/games/hanzi-generals/`，玩法、網址、封裝及 build marker 不可被 v2 改動。
- v2 隱藏入口固定為 `/games/hanzi-generals/v2/`，不可加入 `projects.json`。
- 只使用純 HTML、CSS、原生 JavaScript ES modules；不可加入框架、後端、登入、API Key、資料庫或雲端同步。
- 存檔只使用版本化 `localStorage`，只可喺節點完成、獎勵確認及新戰鬥開始前保存。
- 棋盤只支援 `3×3`、`4×3`、`3×4`；尺寸格式固定為「欄 × 列」。
- 一局固定六場戰鬥；第三戰只打安全或危險其中一條分支。
- 每場固定三段「配置 → 戰鬥」循環；同場單位、位置、生命及軍令持續，戰後棋盤清空。
- 每階段抽至 5 張、最多保留 2 張；每場 1 次免費重抽；預設 2 格軍營。
- 同一時間每名具名武將最多一個存活實體；弓兵、盾兵可重複。
- 每場 3 點軍令；只實作變陣、集火、堅守。
- Vertical Slice 內容固定為六名武將、兩種兵種、四種特殊敵人、基本步兵、華雄 Boss、兩種一次性軍策。
- 戰鬥使用固定離散行動輪；動畫、震動及速度只影響呈現，不可影響規則結果。
- 手機 320px 不可水平溢出；主要觸控目標最少 44×44 CSS pixels；所有拖放必須有點按替代。
- 重要狀態不可只靠顏色；必須支援 `prefers-reduced-motion` 及遊戲內低動態設定。
- 初始數值全部屬 tuning hypothesis；測試應優先驗證規則與不變量，不以單一數值宣稱平衡。

---

## File Structure Map

```text
package.json
scripts/build_site.py
.github/workflows/pages.yml
tests/test_build_site.py

games/hanzi-generals/v2/
├─ index.html
├─ styles/game.css
├─ data/
│  ├─ generals.js
│  ├─ enemies.js
│  ├─ recipes.js
│  ├─ stages.js
│  ├─ rewards.js
│  └─ tuning.js
├─ src/
│  ├─ app.js
│  ├─ core/
│  │  ├─ data-validator.js
│  │  ├─ rng.js
│  │  ├─ events.js
│  │  └─ state-machine.js
│  ├─ board/board.js
│  ├─ deck/deck.js
│  ├─ deck/assembly.js
│  ├─ combat/combat-engine.js
│  ├─ combat/targeting.js
│  ├─ combat/intents.js
│  ├─ combat/orders.js
│  ├─ expedition/expedition.js
│  ├─ expedition/rewards.js
│  ├─ storage/storage.js
│  └─ ui/
│     ├─ render.js
│     ├─ interactions.js
│     └─ tutorial.js
└─ tests/
   ├─ data-validator.test.js
   ├─ rng.test.js
   ├─ board.test.js
   ├─ deck.test.js
   ├─ assembly.test.js
   ├─ combat-engine.test.js
   ├─ enemy-intents.test.js
   ├─ orders.test.js
   ├─ expedition.test.js
   ├─ storage.test.js
   ├─ state-machine.test.js
   └─ ui-contract.test.js

docs/playtests/hanzi-generals-v2-playtest-template.md
```

## Shared Runtime Interfaces

所有後續 task 必須沿用以下名稱，唔可以自行改名：

```js
// RNG
createRng(seed: number|string) -> RngState
nextFloat(rng: RngState) -> { value: number, rng: RngState }
shuffle(rng: RngState, items: unknown[]) -> { items: unknown[], rng: RngState }

// Board
createBoard(sizeId: 'base'|'wing'|'depth') -> BoardState
expandBoard(board: BoardState, sizeId: 'wing'|'depth') -> BoardState
isValidCell(board: BoardState, cell: Cell) -> boolean
areAdjacent(a: Cell, b: Cell) -> boolean
placeUnit(board: BoardState, unit: UnitState, cell: Cell) -> BoardState
moveUnit(board: BoardState, unitId: string, cell: Cell) -> BoardState

// Deck
createDeckState(symbols: string[], rng: RngState) -> { deck: DeckState, rng: RngState }
drawToHand(deck: DeckState, handSize: number, rng: RngState) -> { deck: DeckState, rng: RngState }
retainCards(deck: DeckState, cardIds: string[]) -> DeckState
rerollHand(deck: DeckState, lockedCardIds: string[], rng: RngState) -> { deck: DeckState, rng: RngState }

// Assembly
findRecipe(symbols: string[], recipes: RecipeDefinition[]) -> RecipeDefinition|null
confirmAssembly(game: GameState, source: AssemblySource, target: Cell) -> ActionResult
releaseUnitCards(game: GameState, unitId: string) -> GameState

// Combat
createCombatState(input: CombatInput) -> CombatState
stepCombat(combat: CombatState, context: CombatContext) -> { combat: CombatState, events: GameEvent[] }
deriveEnemyIntent(enemy: EnemyState, combat: CombatState, context: CombatContext) -> EnemyIntent
applyOrder(combat: CombatState, order: OrderCommand, context: CombatContext) -> ActionResult

// Expedition and storage
createExpedition(seed: number|string) -> GameState
advanceExpedition(game: GameState, choice?: string) -> GameState
saveSnapshot(game: GameState, storage?: Storage) -> void
loadSnapshot(storage?: Storage) -> LoadResult
clearSnapshot(storage?: Storage) -> void

// State machine
reduceGame(game: GameState, action: GameAction) -> ActionResult
```

`ActionResult` 固定為：

```js
{ ok: true, state: object, events: GameEvent[] }
// 或
{ ok: false, state: object, events: [], error: { code: string, message: string } }
```

---

### Task 1: 建立 v2 靜態殼、build copy 同 CI 基準

**Files:**
- Create: `package.json`
- Create: `games/hanzi-generals/v2/index.html`
- Create: `games/hanzi-generals/v2/styles/game.css`
- Create: `games/hanzi-generals/v2/src/app.js`
- Create: `games/hanzi-generals/v2/tests/ui-contract.test.js`
- Create: `tests/test_build_site.py`
- Modify: `scripts/build_site.py`
- Modify: `.github/workflows/pages.yml`

**Interfaces:**
- Consumes: Classic build markers `id="game-app"`、`字陣無雙`。
- Produces: v2 marker `id="v2-game-app"`、`npm test`、`npm run build`，供所有後續 task 使用。

- [ ] **Step 1: 寫會失敗嘅 v2 shell test**

```js
// games/hanzi-generals/v2/tests/ui-contract.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

test('v2 shell exposes the hidden game root and module entry', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8');
  assert.match(html, /id="v2-game-app"/);
  assert.match(html, /src="\.\/src\/app\.js"/);
  assert.doesNotMatch(html, /projects\.json/);
});
```

- [ ] **Step 2: 執行 test，確認因 v2 檔案不存在而失敗**

Run: `node --test games/hanzi-generals/v2/tests/ui-contract.test.js`

Expected: FAIL with `ENOENT` for `games/hanzi-generals/v2/index.html`。

- [ ] **Step 3: 建立最小 v2 shell 同 npm scripts**

```json
// package.json
{
  "name": "moonlight-playground",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test",
    "build": "python scripts/build_site.py"
  }
}
```

```html
<!-- games/hanzi-generals/v2/index.html -->
<!doctype html>
<html lang="zh-Hant-HK">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#241b15">
  <title>字陣無雙 v2｜群雄遠征測試版</title>
  <link rel="stylesheet" href="./styles/game.css">
  <script type="module" src="./src/app.js"></script>
</head>
<body>
  <main id="v2-game-app" aria-live="polite">
    <h1>字陣無雙 v2</h1>
    <p>群雄遠征隱藏測試版準備中。</p>
  </main>
</body>
</html>
```

```css
/* games/hanzi-generals/v2/styles/game.css */
:root { font-family: "PingFang HK", "Noto Sans TC", system-ui, sans-serif; color-scheme: light; }
* { box-sizing: border-box; }
body { margin: 0; min-width: 320px; min-height: 100vh; background: #efe3c8; color: #2b2118; }
#v2-game-app { width: min(100% - 24px, 760px); margin: 0 auto; padding: 24px 0 48px; }
button { min-width: 44px; min-height: 44px; font: inherit; }
```

```js
// games/hanzi-generals/v2/src/app.js
const root = document.querySelector('#v2-game-app');
root.dataset.status = 'shell-ready';
```

- [ ] **Step 4: 修改 build script，只複製 v2 runtime，排除 tests**

```python
# scripts/build_site.py additions
V2_SOURCE = ROOT / "games" / "hanzi-generals" / "v2"
V2_OUTPUT = OUTPUT / "games" / "hanzi-generals" / "v2"

# inside build(), after Classic game_output validation
if V2_SOURCE.exists():
    shutil.copytree(
        V2_SOURCE,
        V2_OUTPUT,
        dirs_exist_ok=True,
        ignore=shutil.ignore_patterns("tests", "*.test.js"),
    )
    require_text(V2_OUTPUT / "index.html", 'id="v2-game-app"')
    require_text(V2_OUTPUT / "index.html", "群雄遠征")
```

- [ ] **Step 5: 加 build regression test，確認 Classic 同 v2 同時存在**

```python
# tests/test_build_site.py
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

class BuildSiteTest(unittest.TestCase):
    def test_build_keeps_classic_and_copies_hidden_v2(self):
        result = subprocess.run(
            ["python", "scripts/build_site.py"],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=True,
        )
        self.assertIn("SITE_VERIFY_OK", result.stdout)
        classic = (ROOT / "_site/games/hanzi-generals/index.html").read_text(encoding="utf-8")
        v2 = (ROOT / "_site/games/hanzi-generals/v2/index.html").read_text(encoding="utf-8")
        self.assertIn('id="game-app"', classic)
        self.assertIn('id="v2-game-app"', v2)
        self.assertFalse((ROOT / "_site/games/hanzi-generals/v2/tests").exists())

if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 6: 更新 GitHub Actions，固定 Node 20 並先 test 後 build**

```yaml
# .github/workflows/pages.yml build steps, after checkout
- name: Set up Node
  uses: actions/setup-node@v4
  with:
    node-version: 20

- name: Run v2 rules tests
  run: npm test

- name: Build and verify site
  run: python scripts/build_site.py
```

- [ ] **Step 7: 執行完整基準**

Run:

```bash
npm test
python -m unittest tests/test_build_site.py -v
python scripts/build_site.py
```

Expected: all tests PASS；最後輸出包含 `SITE_VERIFY_OK`；`projects.json` 無 v2 entry。

- [ ] **Step 8: Commit**

```bash
git add package.json scripts/build_site.py .github/workflows/pages.yml tests/test_build_site.py games/hanzi-generals/v2
git commit -m "test: establish hidden Hanzi Generals v2 shell"
```

---

### Task 2: 定義資料合約、初始 tuning 同啟動驗證

**Files:**
- Create: `games/hanzi-generals/v2/data/generals.js`
- Create: `games/hanzi-generals/v2/data/enemies.js`
- Create: `games/hanzi-generals/v2/data/recipes.js`
- Create: `games/hanzi-generals/v2/data/stages.js`
- Create: `games/hanzi-generals/v2/data/rewards.js`
- Create: `games/hanzi-generals/v2/data/tuning.js`
- Create: `games/hanzi-generals/v2/src/core/data-validator.js`
- Create: `games/hanzi-generals/v2/tests/data-validator.test.js`

**Interfaces:**
- Consumes: Shared IDs and scope from design spec。
- Produces: `GAME_DATA` modules and `validateGameData(data)`；later tasks不可直接 hard-code武將／敵人名稱分支。

- [ ] **Step 1: 寫 validation tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateGameData } from '../src/core/data-validator.js';
import { GENERALS } from '../data/generals.js';
import { ENEMIES } from '../data/enemies.js';
import { RECIPES } from '../data/recipes.js';
import { STAGES } from '../data/stages.js';
import { REWARDS } from '../data/rewards.js';
import { TUNING } from '../data/tuning.js';

test('approved vertical slice data is internally consistent', () => {
  const result = validateGameData({ GENERALS, ENEMIES, RECIPES, STAGES, REWARDS, TUNING });
  assert.deepEqual(result, { ok: true, errors: [] });
});

test('validator rejects a recipe pointing to a missing unit', () => {
  const bad = RECIPES.map((item) => item.id === 'huang-zhong' ? { ...item, outputId: 'missing' } : item);
  const result = validateGameData({ GENERALS, ENEMIES, RECIPES: bad, STAGES, REWARDS, TUNING });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /missing outputId/);
});
```

- [ ] **Step 2: Run test，確認 modules 未存在**

Run: `node --test games/hanzi-generals/v2/tests/data-validator.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`。

- [ ] **Step 3: 建立完整 ID 資料**

```js
// data/recipes.js
export const RECIPES = Object.freeze([
  { id: 'huang-zhong', symbols: ['黃', '忠'], outputType: 'general', outputId: 'huang-zhong' },
  { id: 'zhao-yun', symbols: ['趙', '雲'], outputType: 'general', outputId: 'zhao-yun' },
  { id: 'guan-yu', symbols: ['關', '羽'], outputType: 'general', outputId: 'guan-yu' },
  { id: 'lu-bu', symbols: ['呂', '布'], outputType: 'general', outputId: 'lu-bu' },
  { id: 'zhang-fei', symbols: ['張', '飛'], outputType: 'general', outputId: 'zhang-fei' },
  { id: 'zhuge-liang', symbols: ['諸', '葛', '亮'], outputType: 'general', outputId: 'zhuge-liang' },
  { id: 'archer', symbols: ['弓', '兵'], outputType: 'troop', outputId: 'archer' },
  { id: 'shield-troop', symbols: ['盾', '兵'], outputType: 'troop', outputId: 'shield-troop' },
]);
```

```js
// data/generals.js
export const GENERALS = Object.freeze([
  { id: 'huang-zhong', name: '黃忠', kind: 'general', role: 'ranged', maxHp: 18, damage: 7, attackEvery: 2, range: 5, pattern: 'same-lane', evolutions: ['divine-shot', 'repeating-crossbow'] },
  { id: 'zhao-yun', name: '趙雲', kind: 'general', role: 'charge', maxHp: 24, damage: 5, attackEvery: 2, range: 1, pattern: 'pierce', evolutions: ['seven-charges', 'guardian'] },
  { id: 'guan-yu', name: '關羽', kind: 'general', role: 'cleave', maxHp: 28, damage: 6, attackEvery: 2, range: 1, pattern: 'lane-cleave', evolutions: ['azure-dragon', 'awe'] },
  { id: 'lu-bu', name: '呂布', kind: 'general', role: 'burst', maxHp: 30, damage: 10, attackEvery: 3, range: 1, pattern: 'adjacent-burst', evolutions: ['peerless', 'flying-general'] },
  { id: 'zhang-fei', name: '張飛', kind: 'general', role: 'tank', maxHp: 34, damage: 5, attackEvery: 2, range: 1, pattern: 'same-lane', evolutions: ['roar', 'last-stand'] },
  { id: 'zhuge-liang', name: '諸葛亮', kind: 'general', role: 'control', maxHp: 20, damage: 4, attackEvery: 2, range: 4, pattern: 'area', evolutions: ['fire-plan', 'eight-formations'] },
  { id: 'archer', name: '弓兵', kind: 'troop', role: 'support-ranged', maxHp: 10, damage: 3, attackEvery: 2, range: 2, pattern: 'same-lane', evolutions: [] },
  { id: 'shield-troop', name: '盾兵', kind: 'troop', role: 'support-guard', maxHp: 22, damage: 1, attackEvery: 3, range: 1, pattern: 'same-lane', guardBehind: 0.25, evolutions: [] },
]);
```

```js
// data/enemies.js
export const ENEMIES = Object.freeze([
  { id: 'soldier', name: '步兵', maxHp: 8, damage: 2, attackEvery: 2, moveEvery: 1, ability: 'none' },
  { id: 'shield-enemy', name: '盾兵', maxHp: 18, damage: 2, attackEvery: 2, moveEvery: 1, ability: 'protect-behind' },
  { id: 'banner', name: '旗手', maxHp: 10, damage: 1, attackEvery: 3, moveEvery: 1, ability: 'aura' },
  { id: 'crossbow', name: '弩兵', maxHp: 9, damage: 3, attackEvery: 2, moveEvery: 2, ability: 'ranged' },
  { id: 'heavy-cavalry', name: '重騎', maxHp: 16, damage: 5, attackEvery: 2, moveEvery: 1, ability: 'charge' },
  { id: 'hua-xiong', name: '華雄', maxHp: 80, damage: 8, attackEvery: 3, moveEvery: 1, ability: 'boss' },
]);
```

```js
// data/tuning.js
export const TUNING = Object.freeze({
  schemaVersion: 1,
  wallMaxHp: 100,
  postBattleHealRatio: 0.15,
  handSize: 5,
  retainLimit: 2,
  freeRerollsPerBattle: 1,
  campCapacity: 2,
  ordersPerBattle: 3,
  focusFriendlyTurns: 3,
  fortifyEnemyTurns: 2,
  fortifyReduction: 0.40,
  bossPhaseTwoHpRatio: 0.50,
});
```

`stages.js` 必須 export 6 個 stage IDs：`tutorial`、`shield-line`、`route-safe`、`route-danger`、`cavalry-warning`、`elite-mixed`、`hua-xiong`；`rewards.js` 必須 export 已批准獎勵 IDs：`copy-card`、`remove-card`、`evolve-general`、`repair-wall`、`extra-reroll`、`extra-camp`、`fire-arrows`、`first-aid`、`expand-wing`、`expand-depth`、`unlock-zhang-fei`、`unlock-zhuge-liang`。

- [ ] **Step 4: 實作 validator**

```js
// src/core/data-validator.js
export function validateGameData({ GENERALS, ENEMIES, RECIPES, STAGES, REWARDS, TUNING }) {
  const errors = [];
  const units = new Set(GENERALS.map(({ id }) => id));
  const enemies = new Set(ENEMIES.map(({ id }) => id));
  const stageIds = new Set(STAGES.map(({ id }) => id));

  for (const recipe of RECIPES) {
    if (!units.has(recipe.outputId)) errors.push(`recipe ${recipe.id} has missing outputId ${recipe.outputId}`);
    if (!Array.isArray(recipe.symbols) || recipe.symbols.length < 2) errors.push(`recipe ${recipe.id} requires at least two symbols`);
  }
  for (const stage of STAGES) {
    for (const phase of stage.phases) {
      for (const spawn of phase.spawns) {
        if (!enemies.has(spawn.enemyId)) errors.push(`stage ${stage.id} has missing enemyId ${spawn.enemyId}`);
      }
    }
  }
  for (const required of ['tutorial', 'shield-line', 'route-safe', 'route-danger', 'cavalry-warning', 'elite-mixed', 'hua-xiong']) {
    if (!stageIds.has(required)) errors.push(`missing stage ${required}`);
  }
  if (TUNING.handSize !== 5) errors.push('handSize must be 5');
  if (TUNING.retainLimit !== 2) errors.push('retainLimit must be 2');
  if (REWARDS.length < 12) errors.push('reward catalogue is incomplete');
  return { ok: errors.length === 0, errors };
}
```

- [ ] **Step 5: Run tests**

Run: `node --test games/hanzi-generals/v2/tests/data-validator.test.js`

Expected: PASS 2 tests。

- [ ] **Step 6: Commit**

```bash
git add games/hanzi-generals/v2/data games/hanzi-generals/v2/src/core/data-validator.js games/hanzi-generals/v2/tests/data-validator.test.js
git commit -m "feat: define Hanzi Generals v2 data contracts"
```

---

### Task 3: 建立固定種子 RNG、events 同版本化存檔

**Files:**
- Create: `games/hanzi-generals/v2/src/core/rng.js`
- Create: `games/hanzi-generals/v2/src/core/events.js`
- Create: `games/hanzi-generals/v2/src/storage/storage.js`
- Create: `games/hanzi-generals/v2/tests/rng.test.js`
- Create: `games/hanzi-generals/v2/tests/storage.test.js`

**Interfaces:**
- Produces: `createRng`、`nextFloat`、`shuffle`、`gameEvent`、`saveSnapshot`、`loadSnapshot`、`clearSnapshot`。
- Storage key fixed為 `hanzi-generals-v2:save:v1`；settings key fixed為 `hanzi-generals-v2:settings:v1`。

- [ ] **Step 1: 寫 deterministic RNG tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng, nextFloat, shuffle } from '../src/core/rng.js';

test('same seed produces the same sequence and shuffle', () => {
  let a = createRng('moonlight');
  let b = createRng('moonlight');
  const seqA = []; const seqB = [];
  for (let i = 0; i < 5; i += 1) {
    const ra = nextFloat(a); a = ra.rng; seqA.push(ra.value);
    const rb = nextFloat(b); b = rb.rng; seqB.push(rb.value);
  }
  assert.deepEqual(seqA, seqB);
  assert.deepEqual(shuffle(a, ['黃', '忠', '趙']).items, shuffle(b, ['黃', '忠', '趙']).items);
});
```

- [ ] **Step 2: 寫 storage corruption tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSnapshot, saveSnapshot, clearSnapshot } from '../src/storage/storage.js';

function memoryStorage() {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) };
}

test('save/load uses schema version and rejects corrupt JSON', () => {
  const storage = memoryStorage();
  saveSnapshot({ version: 1, status: 'expedition-map' }, storage);
  assert.equal(loadSnapshot(storage).ok, true);
  storage.setItem('hanzi-generals-v2:save:v1', '{broken');
  const corrupt = loadSnapshot(storage);
  assert.equal(corrupt.ok, false);
  assert.equal(corrupt.error.code, 'CORRUPT_SAVE');
  clearSnapshot(storage);
  assert.equal(loadSnapshot(storage).error.code, 'NO_SAVE');
});
```

- [ ] **Step 3: 實作 RNG**

```js
// src/core/rng.js
function hashSeed(seed) {
  let hash = 2166136261;
  for (const char of String(seed)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 1;
}

export function createRng(seed) { return { state: hashSeed(seed) }; }
export function nextFloat(rng) {
  let x = rng.state >>> 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  const state = x >>> 0 || 1;
  return { value: state / 0x100000000, rng: { state } };
}
export function shuffle(rng, items) {
  const copy = [...items]; let current = rng;
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const result = nextFloat(current); current = result.rng;
    const j = Math.floor(result.value * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return { items: copy, rng: current };
}
```

- [ ] **Step 4: 實作 events 同 storage**

```js
// src/core/events.js
export function gameEvent(type, payload = {}) {
  return Object.freeze({ type, payload, at: Date.now() });
}
```

```js
// src/storage/storage.js
const SAVE_KEY = 'hanzi-generals-v2:save:v1';
const SAVE_VERSION = 1;

export function saveSnapshot(game, storage = localStorage) {
  storage.setItem(SAVE_KEY, JSON.stringify({ schemaVersion: SAVE_VERSION, game }));
}
export function loadSnapshot(storage = localStorage) {
  const raw = storage.getItem(SAVE_KEY);
  if (!raw) return { ok: false, error: { code: 'NO_SAVE', message: '未有 v2 測試存檔。' } };
  try {
    const parsed = JSON.parse(raw);
    if (parsed.schemaVersion !== SAVE_VERSION) return { ok: false, error: { code: 'UNSUPPORTED_SAVE', message: '存檔版本不支援。' } };
    return { ok: true, game: parsed.game };
  } catch {
    return { ok: false, error: { code: 'CORRUPT_SAVE', message: '存檔已損壞，可重設 v2 測試存檔。' } };
  }
}
export function clearSnapshot(storage = localStorage) { storage.removeItem(SAVE_KEY); }
```

- [ ] **Step 5: Run tests and commit**

Run: `node --test games/hanzi-generals/v2/tests/rng.test.js games/hanzi-generals/v2/tests/storage.test.js`

Expected: PASS。

```bash
git add games/hanzi-generals/v2/src/core games/hanzi-generals/v2/src/storage games/hanzi-generals/v2/tests
git commit -m "feat: add deterministic rng and versioned v2 saves"
```

---

### Task 4: 建立可擴展棋盤模型

**Files:**
- Create: `games/hanzi-generals/v2/src/board/board.js`
- Create: `games/hanzi-generals/v2/tests/board.test.js`

**Interfaces:**
- Produces: `createBoard`、`expandBoard`、`isValidCell`、`areAdjacent`、`placeUnit`、`moveUnit`、`getUnitAt`。
- `row: 0` 固定為最前排；row 數字增加表示更接近城牆／後排。

- [ ] **Step 1: 寫尺寸、相鄰及移動 tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBoard, expandBoard, isValidCell, areAdjacent, placeUnit, moveUnit } from '../src/board/board.js';

test('board supports only approved sizes', () => {
  assert.deepEqual(createBoard('base').size, { columns: 3, rows: 3 });
  assert.deepEqual(expandBoard(createBoard('base'), 'wing').size, { columns: 4, rows: 3 });
  assert.deepEqual(expandBoard(createBoard('base'), 'depth').size, { columns: 3, rows: 4 });
  assert.throws(() => createBoard('freeform'), /Unsupported board size/);
});

test('placement rejects occupied cells and movement preserves unit identity', () => {
  let board = createBoard('base');
  board = placeUnit(board, { id: 'u1' }, { column: 1, row: 1 });
  assert.equal(isValidCell(board, { column: 2, row: 2 }), true);
  assert.throws(() => placeUnit(board, { id: 'u2' }, { column: 1, row: 1 }), /occupied/);
  assert.equal(areAdjacent({ column: 1, row: 1 }, { column: 2, row: 1 }), true);
  board = moveUnit(board, 'u1', { column: 2, row: 1 });
  assert.equal(board.units.u1.cell.column, 2);
});
```

- [ ] **Step 2: Run test，確認 module 未存在**

Run: `node --test games/hanzi-generals/v2/tests/board.test.js`

Expected: FAIL `ERR_MODULE_NOT_FOUND`。

- [ ] **Step 3: 實作 immutable board model**

```js
// src/board/board.js
const SIZES = Object.freeze({
  base: { columns: 3, rows: 3 },
  wing: { columns: 4, rows: 3 },
  depth: { columns: 3, rows: 4 },
});

export function createBoard(sizeId = 'base') {
  const size = SIZES[sizeId];
  if (!size) throw new Error(`Unsupported board size: ${sizeId}`);
  return { sizeId, size: { ...size }, units: {} };
}
export function isValidCell(board, { column, row }) {
  return Number.isInteger(column) && Number.isInteger(row) && column >= 0 && row >= 0 && column < board.size.columns && row < board.size.rows;
}
export function areAdjacent(a, b) { return Math.abs(a.column - b.column) + Math.abs(a.row - b.row) === 1; }
export function getUnitAt(board, cell) { return Object.values(board.units).find((unit) => unit.cell.column === cell.column && unit.cell.row === cell.row) ?? null; }
export function placeUnit(board, unit, cell) {
  if (!isValidCell(board, cell)) throw new Error('illegal cell');
  if (getUnitAt(board, cell)) throw new Error('occupied cell');
  return { ...board, units: { ...board.units, [unit.id]: { ...unit, cell: { ...cell } } } };
}
export function moveUnit(board, unitId, cell) {
  const unit = board.units[unitId];
  if (!unit) throw new Error('missing unit');
  const without = { ...board, units: { ...board.units } }; delete without.units[unitId];
  return placeUnit(without, unit, cell);
}
export function expandBoard(board, sizeId) {
  if (board.sizeId !== 'base' || !['wing', 'depth'].includes(sizeId)) throw new Error('board may expand once from base');
  return { ...board, sizeId, size: { ...SIZES[sizeId] } };
}
```

- [ ] **Step 4: Run tests and commit**

Run: `node --test games/hanzi-generals/v2/tests/board.test.js`

Expected: PASS。

```bash
git add games/hanzi-generals/v2/src/board/board.js games/hanzi-generals/v2/tests/board.test.js
git commit -m "feat: add expandable tactical board model"
```

---

### Task 5: 建立牌庫、抽牌、保留、重抽同洗牌

**Files:**
- Create: `games/hanzi-generals/v2/src/deck/deck.js`
- Create: `games/hanzi-generals/v2/tests/deck.test.js`

**Interfaces:**
- Produces: `createDeckState`、`drawToHand`、`retainCards`、`rerollHand`、`discardCard`、`lockCard`、`unlockAllCards`。
- Card instance 固定為 `{ id: string, symbol: string, locked: boolean }`，重複中文字靠 instance ID 區分。

- [ ] **Step 1: 寫固定種子、保留上限及免費重抽 tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/core/rng.js';
import { createDeckState, drawToHand, retainCards, rerollHand } from '../src/deck/deck.js';

const symbols = ['黃','忠','趙','雲','關','羽','呂','布','弓','兵','盾','兵'];

test('draws to five and retains at most two', () => {
  let rng = createRng(7);
  let result = createDeckState(symbols, rng); rng = result.rng;
  result = drawToHand(result.deck, 5, rng);
  assert.equal(result.deck.hand.length, 5);
  assert.throws(() => retainCards(result.deck, result.deck.hand.slice(0, 3).map((card) => card.id)), /at most 2/);
});

test('one free reroll moves unlocked cards to discard', () => {
  let rng = createRng(9);
  let result = createDeckState(symbols, rng); rng = result.rng;
  result = drawToHand(result.deck, 5, rng); rng = result.rng;
  const locked = [result.deck.hand[0].id];
  const rerolled = rerollHand(result.deck, locked, rng);
  assert.equal(rerolled.deck.freeRerollsRemaining, 0);
  assert.equal(rerolled.deck.hand.some((card) => card.id === locked[0]), true);
  assert.throws(() => rerollHand(rerolled.deck, [], rerolled.rng), /no free reroll/);
});
```

- [ ] **Step 2: 實作 deck module**

```js
// src/deck/deck.js
import { shuffle } from '../core/rng.js';

export function createDeckState(symbols, rng) {
  const cards = symbols.map((symbol, index) => ({ id: `card-${index + 1}`, symbol, locked: false }));
  const shuffled = shuffle(rng, cards);
  return { deck: { drawPile: shuffled.items, discardPile: [], hand: [], retained: [], deployed: [], freeRerollsRemaining: 1 }, rng: shuffled.rng };
}
function recycle(deck, rng) {
  if (deck.drawPile.length || !deck.discardPile.length) return { deck, rng };
  const shuffled = shuffle(rng, deck.discardPile);
  return { deck: { ...deck, drawPile: shuffled.items, discardPile: [] }, rng: shuffled.rng };
}
export function drawToHand(deck, handSize, rng) {
  let next = { ...deck, hand: [...deck.hand], drawPile: [...deck.drawPile], discardPile: [...deck.discardPile] };
  let current = rng;
  while (next.hand.length < handSize) {
    const recycled = recycle(next, current); next = recycled.deck; current = recycled.rng;
    if (!next.drawPile.length) break;
    next.hand.push(next.drawPile.shift());
  }
  return { deck: next, rng: current };
}
export function retainCards(deck, cardIds) {
  if (cardIds.length > 2) throw new Error('retain at most 2 cards');
  if (cardIds.some((id) => !deck.hand.some((card) => card.id === id))) throw new Error('cannot retain missing card');
  return { ...deck, retained: [...cardIds] };
}
export function rerollHand(deck, lockedCardIds, rng) {
  if (deck.freeRerollsRemaining < 1) throw new Error('no free reroll remaining');
  const locked = new Set(lockedCardIds);
  const keep = deck.hand.filter((card) => locked.has(card.id));
  const discard = deck.hand.filter((card) => !locked.has(card.id));
  return drawToHand({ ...deck, hand: keep, discardPile: [...deck.discardPile, ...discard], freeRerollsRemaining: 0 }, 5, rng);
}
export function discardCard(deck, cardId) {
  const card = deck.hand.find((item) => item.id === cardId);
  if (!card) throw new Error('missing card');
  return { ...deck, hand: deck.hand.filter((item) => item.id !== cardId), discardPile: [...deck.discardPile, card] };
}
```

- [ ] **Step 3: Run tests and commit**

Run: `node --test games/hanzi-generals/v2/tests/deck.test.js`

Expected: PASS。

```bash
git add games/hanzi-generals/v2/src/deck/deck.js games/hanzi-generals/v2/tests/deck.test.js
git commit -m "feat: add deterministic deck flow"
```

---

### Task 6: 建立配方、軍營、部署區同單位卡牌生命週期

**Files:**
- Create: `games/hanzi-generals/v2/src/deck/assembly.js`
- Create: `games/hanzi-generals/v2/tests/assembly.test.js`

**Interfaces:**
- Consumes: `RECIPES`、`GENERALS`、Board API、DeckState。
- Produces: `findRecipe`、`confirmAssembly`、`releaseUnitCards`。
- `game.camp` 固定為 `{ capacity, cardIds }`；`deck.deployed` 保存 `{ unitId, cardIds }`。

- [ ] **Step 1: 寫 order-independent recipe、軍營部署及 uniqueness tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { findRecipe, confirmAssembly, releaseUnitCards } from '../src/deck/assembly.js';
import { RECIPES } from '../data/recipes.js';
import { createBoard } from '../src/board/board.js';

test('recipe matching is order independent and respects duplicate symbols', () => {
  assert.equal(findRecipe(['忠','黃'], RECIPES).id, 'huang-zhong');
  assert.equal(findRecipe(['兵','盾'], RECIPES).id, 'shield-troop');
  assert.equal(findRecipe(['兵','兵'], RECIPES), null);
});

test('camp assembly requires an immediate legal deployment cell', () => {
  const game = fixtureGame({ board: createBoard('base'), campCards: ['c1','c2'], symbols: { c1:'黃', c2:'忠' } });
  const result = confirmAssembly(game, { type:'camp', cardIds:['c1','c2'] }, { column:1, row:1 });
  assert.equal(result.ok, true);
  assert.equal(result.state.board.units['unit-1'].definitionId, 'huang-zhong');
  assert.deepEqual(result.state.camp.cardIds, []);
  assert.deepEqual(result.state.deck.deployed[0].cardIds, ['c1','c2']);
});

test('named general cannot be assembled while the same general survives', () => {
  const game = fixtureGameWithLivingGeneral('huang-zhong');
  const result = confirmAssembly(game, { type:'board', cardIds:['c1','c2'] }, { column:2, row:2 });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'DUPLICATE_NAMED_GENERAL');
});
```

`fixtureGame` 同 `fixtureGameWithLivingGeneral` 必須喺 test file 內建立完整最小 state，不可依賴瀏覽器 DOM。

- [ ] **Step 2: 實作 recipe matching 同 action errors**

```js
// src/deck/assembly.js
import { placeUnit } from '../board/board.js';
import { RECIPES } from '../../data/recipes.js';
import { GENERALS } from '../../data/generals.js';
import { gameEvent } from '../core/events.js';

function key(symbols) { return [...symbols].sort((a,b) => a.localeCompare(b, 'zh-Hant')).join('|'); }
export function findRecipe(symbols, recipes = RECIPES) {
  const wanted = key(symbols);
  return recipes.find((recipe) => key(recipe.symbols) === wanted) ?? null;
}
export function confirmAssembly(game, source, target) {
  const cards = source.cardIds.map((id) => game.cardsById[id]);
  const recipe = findRecipe(cards.map(({ symbol }) => symbol));
  if (!recipe) return { ok:false, state:game, events:[], error:{ code:'NO_RECIPE', message:'呢組字未能合成單位。' } };
  const definition = GENERALS.find(({ id }) => id === recipe.outputId);
  if (definition.kind === 'general' && Object.values(game.board.units).some((unit) => unit.definitionId === definition.id && unit.hp > 0)) {
    return { ok:false, state:game, events:[], error:{ code:'DUPLICATE_NAMED_GENERAL', message:`${definition.name}仍然在陣，唔可以重複召喚。` } };
  }
  if (source.type === 'camp' && source.cardIds.some((id) => !game.camp.cardIds.includes(id))) {
    return { ok:false, state:game, events:[], error:{ code:'INVALID_CAMP_SOURCE', message:'軍營字牌已改變。' } };
  }
  try {
    const unitId = `unit-${game.nextUnitId}`;
    const unit = { id:unitId, definitionId:definition.id, kind:definition.kind, hp:definition.maxHp, maxHp:definition.maxHp, cooldown:0, evolution:null, statuses:[] };
    const board = placeUnit(game.board, unit, target);
    const deployed = [...game.deck.deployed, { unitId, cardIds:[...source.cardIds] }];
    return { ok:true, state:{ ...game, board, camp:{ ...game.camp, cardIds:game.camp.cardIds.filter((id) => !source.cardIds.includes(id)) }, deck:{ ...game.deck, hand:game.deck.hand.filter((card) => !source.cardIds.includes(card.id)), deployed }, nextUnitId:game.nextUnitId + 1 }, events:[gameEvent('UNIT_ASSEMBLED', { unitId, definitionId:definition.id })] };
  } catch {
    return { ok:false, state:game, events:[], error:{ code:'ILLEGAL_DEPLOYMENT', message:'揀選位置不可部署。' } };
  }
}
export function releaseUnitCards(game, unitId) {
  const deployed = game.deck.deployed.find((item) => item.unitId === unitId);
  if (!deployed) return game;
  const cards = deployed.cardIds.map((id) => game.cardsById[id]);
  return { ...game, deck:{ ...game.deck, deployed:game.deck.deployed.filter((item) => item.unitId !== unitId), discardPile:[...game.deck.discardPile, ...cards] } };
}
```

- [ ] **Step 3: Run tests and commit**

Run: `node --test games/hanzi-generals/v2/tests/assembly.test.js`

Expected: PASS；invalid target returns `ILLEGAL_DEPLOYMENT`，唔會丟失手牌。

```bash
git add games/hanzi-generals/v2/src/deck/assembly.js games/hanzi-generals/v2/tests/assembly.test.js
git commit -m "feat: add character assembly and camp deployment"
```

---

### Task 7: 建立離散戰鬥核心、目標選擇同基本單位

**Files:**
- Create: `games/hanzi-generals/v2/src/combat/targeting.js`
- Create: `games/hanzi-generals/v2/src/combat/combat-engine.js`
- Create: `games/hanzi-generals/v2/tests/combat-engine.test.js`

**Interfaces:**
- Produces: `createCombatState`、`stepCombat`、`findTargets`。
- 一個 `stepCombat` 等於一個完整離散行動輪：更新狀態 → 友軍按 lane,row,id 排序行動 → 敵軍按 lane,distance,id 排序行動 → 清理死亡 → 更新結束條件。
- Enemy `distance: 0` 表示已到城牆；正數越大代表越遠。

- [ ] **Step 1: 寫 deterministic targeting 同 wall damage tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCombatState, stepCombat } from '../src/combat/combat-engine.js';
import { findTargets } from '../src/combat/targeting.js';

test('same-lane ranged unit selects the nearest reachable enemy', () => {
  const unit = { id:'u1', definitionId:'huang-zhong', cell:{ column:1, row:2 } };
  const enemies = [
    { id:'far', lane:1, distance:5, hp:8 },
    { id:'near', lane:1, distance:2, hp:8 },
    { id:'other', lane:0, distance:1, hp:8 },
  ];
  assert.deepEqual(findTargets(unit, enemies, { range:5, pattern:'same-lane' }).map(({id}) => id), ['near']);
});

test('enemy at distance zero damages wall and emits an event', () => {
  const combat = createCombatState({ board:emptyBoard(), enemies:[enemyAtWall()], wallHp:100, phaseIndex:0, ordersRemaining:3 });
  const result = stepCombat(combat, fixtureContext());
  assert.equal(result.combat.wallHp, 98);
  assert.equal(result.events.some(({type}) => type === 'WALL_DAMAGED'), true);
});
```

- [ ] **Step 2: 實作 targeting**

```js
// src/combat/targeting.js
export function findTargets(unit, enemies, definition) {
  const reachable = enemies
    .filter((enemy) => enemy.hp > 0)
    .filter((enemy) => enemy.distance + unit.cell.row <= definition.range)
    .sort((a,b) => a.distance - b.distance || a.lane - b.lane || a.id.localeCompare(b.id));
  if (definition.pattern === 'same-lane') return reachable.filter((enemy) => enemy.lane === unit.cell.column).slice(0, 1);
  if (definition.pattern === 'pierce') return reachable.filter((enemy) => enemy.lane === unit.cell.column).slice(0, 2);
  if (definition.pattern === 'lane-cleave') return reachable.filter((enemy) => Math.abs(enemy.lane - unit.cell.column) <= 1 && enemy.distance === reachable[0]?.distance);
  if (definition.pattern === 'area') return reachable.slice(0, 3);
  return reachable.slice(0, 1);
}
```

- [ ] **Step 3: 實作 pure combat step**

```js
// src/combat/combat-engine.js
import { gameEvent } from '../core/events.js';
import { findTargets } from './targeting.js';

export function createCombatState({ board, enemies, wallHp, phaseIndex, ordersRemaining }) {
  return { turn:0, status:'running', board, enemies:structuredClone(enemies), wallHp, phaseIndex, ordersRemaining, focus:null, fortify:null, pendingOrders:[] };
}
export function stepCombat(combat, context) {
  if (combat.status !== 'running') return { combat, events:[] };
  const next = structuredClone(combat); const events = [];
  next.turn += 1;
  const units = Object.values(next.board.units).filter((unit) => unit.hp > 0).sort((a,b) => a.cell.column - b.cell.column || a.cell.row - b.cell.row || a.id.localeCompare(b.id));
  for (const unit of units) {
    unit.cooldown = Math.max(0, unit.cooldown - 1);
    if (unit.cooldown > 0) continue;
    const definition = context.unitsById[unit.definitionId];
    const targets = findTargets(unit, next.enemies, definition);
    for (const target of targets) { target.hp -= definition.damage; events.push(gameEvent('UNIT_HIT', { sourceId:unit.id, targetId:target.id, damage:definition.damage })); }
    unit.cooldown = definition.attackEvery;
  }
  next.enemies = next.enemies.filter((enemy) => enemy.hp > 0);
  for (const enemy of [...next.enemies].sort((a,b) => a.lane - b.lane || a.distance - b.distance || a.id.localeCompare(b.id))) {
    enemy.cooldown = Math.max(0, enemy.cooldown - 1);
    if (enemy.distance > 0) { enemy.distance -= 1; events.push(gameEvent('ENEMY_MOVED', { enemyId:enemy.id, distance:enemy.distance })); continue; }
    if (enemy.cooldown === 0) {
      const definition = context.enemiesById[enemy.definitionId];
      next.wallHp = Math.max(0, next.wallHp - definition.damage);
      enemy.cooldown = definition.attackEvery;
      events.push(gameEvent('WALL_DAMAGED', { enemyId:enemy.id, damage:definition.damage }));
    }
  }
  if (next.wallHp <= 0) next.status = 'defeat';
  else if (next.enemies.length === 0) next.status = 'victory';
  return { combat:next, events };
}
```

- [ ] **Step 4: Run tests and commit**

Run: `node --test games/hanzi-generals/v2/tests/combat-engine.test.js`

Expected: PASS；同一 input 產生相同 state/events。

```bash
git add games/hanzi-generals/v2/src/combat games/hanzi-generals/v2/tests/combat-engine.test.js
git commit -m "feat: add deterministic combat turn engine"
```

---

### Task 8: 加入四種特殊敵人、意圖、兵種支援同華雄兩階段

**Files:**
- Create: `games/hanzi-generals/v2/src/combat/intents.js`
- Modify: `games/hanzi-generals/v2/src/combat/combat-engine.js`
- Modify: `games/hanzi-generals/v2/src/combat/targeting.js`
- Create: `games/hanzi-generals/v2/tests/enemy-intents.test.js`

**Interfaces:**
- Produces: `deriveEnemyIntent`、`deriveLaneWarnings`。
- Shield enemy reduction fixed initial hypothesis `35%`；banner aura fixed `25%`；heavy cavalry charge countdown fixed `3 enemy turns`；Boss phase two at `<=50%` once。

- [ ] **Step 1: 寫每種敵人意圖同 Boss transition tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveEnemyIntent } from '../src/combat/intents.js';
import { stepCombat } from '../src/combat/combat-engine.js';

test('heavy cavalry exposes charge countdown and target lane', () => {
  const intent = deriveEnemyIntent({ id:'e1', definitionId:'heavy-cavalry', lane:1, distance:3, chargeIn:2 }, fixtureCombat(), fixtureContext());
  assert.deepEqual(intent, { type:'charge', lane:1, countdown:2, target:'wall' });
});

test('Hua Xiong phase two triggers once at half hp', () => {
  const combat = bossCombat({ hp:40, phase:1, phaseTwoTriggered:false });
  const result = stepCombat(combat, fixtureContext());
  const boss = result.combat.enemies.find(({definitionId}) => definitionId === 'hua-xiong');
  assert.equal(boss.phase, 2);
  assert.equal(boss.phaseTwoTriggered, true);
  assert.equal(result.combat.enemies.filter(({definitionId}) => definitionId === 'heavy-cavalry').length, 2);
});
```

- [ ] **Step 2: 實作 intent derivation**

```js
// src/combat/intents.js
export function deriveEnemyIntent(enemy) {
  switch (enemy.definitionId) {
    case 'shield-enemy': return { type:'protect', lane:enemy.lane, target:'ally-behind' };
    case 'banner': return { type:'strengthen', lane:enemy.lane, target:'nearby-enemies' };
    case 'crossbow': return { type:'ranged-attack', lane:enemy.lane, countdown:Math.max(0, enemy.cooldown ?? 0), target:'rear-unit-or-wall' };
    case 'heavy-cavalry': return { type:'charge', lane:enemy.lane, countdown:enemy.chargeIn ?? 3, target:'wall' };
    case 'hua-xiong': return { type:enemy.phase === 2 ? 'boss-summon-and-strike' : 'boss-heavy-strike', lane:enemy.lane, countdown:enemy.cooldown ?? 0, target:'lane' };
    default: return { type:'advance', lane:enemy.lane, target:'wall' };
  }
}
export function deriveLaneWarnings(combat) {
  return Array.from({ length:combat.board.size.columns }, (_, lane) => {
    const threats = combat.enemies.filter((enemy) => enemy.lane === lane).map(deriveEnemyIntent);
    if (!threats.length) return { lane, level:'safe', text:'安全' };
    if (threats.some(({type}) => type === 'charge')) return { lane, level:'danger', text:'重騎準備衝鋒' };
    if (threats.some(({type}) => type === 'strengthen')) return { lane, level:'warning', text:'旗手正在強化敵軍' };
    return { lane, level:'warning', text:'敵軍正在推進' };
  });
}
```

- [ ] **Step 3: 擴充 combat rules**

修改 `stepCombat`，按以下固定次序處理：

```js
// before friendly damage is applied
const shielded = target.definitionId !== 'shield-enemy' && next.enemies.some((enemy) => enemy.definitionId === 'shield-enemy' && enemy.lane === target.lane && enemy.distance < target.distance && enemy.hp > 0);
const bannerBoost = next.enemies.some((enemy) => enemy.definitionId === 'banner' && Math.abs(enemy.lane - target.lane) <= 1 && enemy.hp > 0);
const incomingDamage = shielded ? Math.ceil(definition.damage * 0.65) : definition.damage;

// heavy cavalry enemy action
if (enemy.definitionId === 'heavy-cavalry') {
  enemy.chargeIn = (enemy.chargeIn ?? 3) - 1;
  if (enemy.chargeIn <= 0) { enemy.distance = Math.max(0, enemy.distance - 2); enemy.chargeIn = 3; }
}

// Hua Xiong once-only transition
if (enemy.definitionId === 'hua-xiong' && !enemy.phaseTwoTriggered && enemy.hp <= enemy.maxHp * 0.5) {
  enemy.phase = 2; enemy.phaseTwoTriggered = true;
  enemy.lane = Math.min(next.board.size.columns - 1, enemy.lane + 1);
  enemy.shieldTurns = 2;
  next.enemies.push(...context.spawnHeavyCavalryPair(enemy.lane));
  events.push(gameEvent('BOSS_PHASE_CHANGED', { enemyId:enemy.id, phase:2 }));
}
```

同一 task 必須加入弓兵射程行為同盾兵「正後方一格友軍減傷 25%」；減傷只處理直接傷害，唔處理燃燒。

- [ ] **Step 4: Run tests and commit**

Run:

```bash
node --test games/hanzi-generals/v2/tests/combat-engine.test.js games/hanzi-generals/v2/tests/enemy-intents.test.js
```

Expected: PASS；所有重要敵人 intent 有文字可 render。

```bash
git add games/hanzi-generals/v2/src/combat games/hanzi-generals/v2/tests
git commit -m "feat: add enemy intents and Hua Xiong phases"
```

---

### Task 9: 實作變陣、集火、堅守同一次性軍策

**Files:**
- Create: `games/hanzi-generals/v2/src/combat/orders.js`
- Modify: `games/hanzi-generals/v2/src/combat/combat-engine.js`
- Modify: `games/hanzi-generals/v2/src/combat/targeting.js`
- Create: `games/hanzi-generals/v2/tests/orders.test.js`

**Interfaces:**
- Produces: `applyOrder(combat, order, context)`。
- Order commands fixed：
  - `{ type:'swap', unitIds:[a,b] }`
  - `{ type:'focus', enemyId }`
  - `{ type:'fortify', lane }`
  - `{ type:'tactic', tacticId:'fire-arrows'|'first-aid', lane?|unitId? }`

- [ ] **Step 1: 寫合法、非法、持續時間 tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyOrder } from '../src/combat/orders.js';

test('swap requires adjacent living idle units and spends one order', () => {
  const combat = fixtureCombatWithAdjacentUnits();
  const result = applyOrder(combat, { type:'swap', unitIds:['u1','u2'] }, fixtureContext());
  assert.equal(result.ok, true);
  assert.equal(result.state.ordersRemaining, 2);
  assert.equal(result.state.pendingOrders[0].type, 'swap');
});

test('focus lasts three friendly turns and fortify lasts two enemy turns', () => {
  const focus = applyOrder(fixtureCombat(), { type:'focus', enemyId:'e1' }, fixtureContext());
  assert.equal(focus.state.focus.remainingFriendlyTurns, 3);
  const fortify = applyOrder(fixtureCombat(), { type:'fortify', lane:1 }, fixtureContext());
  assert.equal(fortify.state.fortify.remainingEnemyTurns, 2);
  assert.equal(fortify.state.fortify.reduction, 0.40);
});
```

- [ ] **Step 2: 實作 order validation**

```js
// src/combat/orders.js
import { areAdjacent } from '../board/board.js';
import { gameEvent } from '../core/events.js';

function fail(combat, code, message) { return { ok:false, state:combat, events:[], error:{ code, message } }; }
export function applyOrder(combat, order, context) {
  if (order.type !== 'tactic' && combat.ordersRemaining < 1) return fail(combat, 'NO_ORDERS', '軍令不足。');
  if (order.type === 'swap') {
    const [a,b] = order.unitIds.map((id) => combat.board.units[id]);
    if (!a || !b || a.hp <= 0 || b.hp <= 0 || !areAdjacent(a.cell,b.cell) || a.isActing || b.isActing) return fail(combat, 'ILLEGAL_SWAP', '只可以交換相鄰、存活而且閒置嘅單位。');
    return { ok:true, state:{ ...combat, ordersRemaining:combat.ordersRemaining-1, pendingOrders:[...combat.pendingOrders, order] }, events:[gameEvent('ORDER_QUEUED', order)] };
  }
  if (order.type === 'focus') {
    const enemy = combat.enemies.find(({id,hp}) => id === order.enemyId && hp > 0);
    const attackable = enemy && Object.values(combat.board.units).some((unit) => context.canAttack(unit, enemy, combat));
    if (!attackable) return fail(combat, 'ILLEGAL_FOCUS', '目前冇友軍可以攻擊呢個目標。');
    return { ok:true, state:{ ...combat, ordersRemaining:combat.ordersRemaining-1, focus:{ enemyId:enemy.id, remainingFriendlyTurns:3 } }, events:[gameEvent('FOCUS_STARTED', { enemyId:enemy.id })] };
  }
  if (order.type === 'fortify') {
    if (!Number.isInteger(order.lane) || order.lane < 0 || order.lane >= combat.board.size.columns) return fail(combat, 'ILLEGAL_LANE', '揀選路線不存在。');
    return { ok:true, state:{ ...combat, ordersRemaining:combat.ordersRemaining-1, fortify:{ lane:order.lane, remainingEnemyTurns:2, reduction:0.40 } }, events:[gameEvent('FORTIFY_STARTED', { lane:order.lane })] };
  }
  return fail(combat, 'UNKNOWN_ORDER', '未知指令。');
}
```

- [ ] **Step 3: 接入 safe-turn resolution 同 tactics**

`stepCombat` 開始時先處理 `pendingOrders`；focus 改寫合法目標排序；fortify 喺敵軍傷害結算時計算；每個對應行動輪完結後遞減 duration。

```js
// tactic behavior inside applyOrder
if (order.type === 'tactic' && order.tacticId === 'fire-arrows') {
  if (!combat.availableTactics.includes('fire-arrows')) return fail(combat, 'MISSING_TACTIC', '未持有火矢。');
  return { ok:true, state:{ ...combat, availableTactics:combat.availableTactics.filter((id) => id !== 'fire-arrows'), pendingTactics:[...combat.pendingTactics, { type:'fire-arrows', lane:order.lane }] }, events:[gameEvent('TACTIC_QUEUED', order)] };
}
if (order.type === 'tactic' && order.tacticId === 'first-aid') {
  const unit = combat.board.units[order.unitId];
  if (!unit || unit.hp <= 0) return fail(combat, 'ILLEGAL_HEAL_TARGET', '急救只可以選擇存活友軍。');
  const healed = { ...unit, hp:Math.min(unit.maxHp, unit.hp + Math.ceil(unit.maxHp * 0.30)) };
  return { ok:true, state:{ ...combat, board:{ ...combat.board, units:{ ...combat.board.units, [unit.id]:healed } }, availableTactics:combat.availableTactics.filter((id) => id !== 'first-aid') }, events:[gameEvent('UNIT_HEALED', { unitId:unit.id })] };
}
```

- [ ] **Step 4: Run tests and commit**

Run: `node --test games/hanzi-generals/v2/tests/orders.test.js games/hanzi-generals/v2/tests/combat-engine.test.js`

Expected: PASS；停用原因透過 error code/message 返回。

```bash
git add games/hanzi-generals/v2/src/combat games/hanzi-generals/v2/tests/orders.test.js
git commit -m "feat: add battlefield orders and one-shot tactics"
```

---

### Task 10: 建立六戰遠征、分支、獎勵、擴陣、進化同狀態機

**Files:**
- Create: `games/hanzi-generals/v2/src/expedition/expedition.js`
- Create: `games/hanzi-generals/v2/src/expedition/rewards.js`
- Create: `games/hanzi-generals/v2/src/core/state-machine.js`
- Create: `games/hanzi-generals/v2/tests/expedition.test.js`
- Create: `games/hanzi-generals/v2/tests/state-machine.test.js`

**Interfaces:**
- Produces: `createExpedition`、`advanceExpedition`、`generateRewardChoices`、`applyReward`、`reduceGame`。
- Status enum fixed：`expedition-map`、`configuration`、`combat`、`reward`、`victory`、`defeat`、`error`。

- [ ] **Step 1: 寫六戰路線同固定 Gate tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createExpedition, advanceExpedition } from '../src/expedition/expedition.js';

test('safe and danger branches both produce exactly six battles', () => {
  const base = createExpedition('route-test');
  const safe = simulateRoute(base, 'safe');
  const danger = simulateRoute(base, 'danger');
  assert.deepEqual(safe.completedBattleIds, ['tutorial','shield-line','route-safe','cavalry-warning','elite-mixed','hua-xiong']);
  assert.deepEqual(danger.completedBattleIds, ['tutorial','shield-line','route-danger','cavalry-warning','elite-mixed','hua-xiong']);
});

test('post battle heals 15 percent without exceeding max wall hp', () => {
  const game = { ...createExpedition(1), wallHp:90, wallMaxHp:100 };
  const next = advanceExpedition({ ...game, status:'reward', currentBattleResult:'victory' }, 'continue');
  assert.equal(next.wallHp, 100);
});
```

- [ ] **Step 2: 寫 state transition tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { reduceGame } from '../src/core/state-machine.js';

const illegal = reduceGame({ status:'combat' }, { type:'DRAW_CARDS' });
assert.equal(illegal.ok, false);
assert.equal(illegal.error.code, 'ILLEGAL_ACTION_FOR_STATE');
```

- [ ] **Step 3: 實作 expedition graph**

```js
// src/expedition/expedition.js
import { createRng } from '../core/rng.js';
import { TUNING } from '../../data/tuning.js';

const ROUTES = Object.freeze({
  safe: ['tutorial','shield-line','route-safe','cavalry-warning','elite-mixed','hua-xiong'],
  danger: ['tutorial','shield-line','route-danger','cavalry-warning','elite-mixed','hua-xiong'],
});
export function createExpedition(seed) {
  return {
    version:1, seed:String(seed), rng:createRng(seed), status:'expedition-map', route:null,
    battleIndex:0, completedBattleIds:[], wallHp:TUNING.wallMaxHp, wallMaxHp:TUNING.wallMaxHp,
    boardSizeId:'base', evolutions:{}, unlockedRecipes:['huang-zhong','zhao-yun','guan-yu','lu-bu','archer','shield-troop'],
    temporary:{ extraRerolls:0, extraCamp:0 }, tactics:[], currentBattle:null, error:null,
  };
}
export function advanceExpedition(game, choice) {
  const route = game.route ?? (choice === 'danger' ? 'danger' : 'safe');
  const completed = game.currentBattle?.stageId ? [...game.completedBattleIds, game.currentBattle.stageId] : game.completedBattleIds;
  const healed = Math.min(game.wallMaxHp, game.wallHp + Math.ceil(game.wallMaxHp * TUNING.postBattleHealRatio));
  const battleIndex = completed.length;
  if (battleIndex >= 6) return { ...game, route, completedBattleIds:completed, wallHp:healed, status:'victory', currentBattle:null };
  return { ...game, route, completedBattleIds:completed, battleIndex, wallHp:healed, status:'expedition-map', currentBattle:null, nextStageId:ROUTES[route][battleIndex] };
}
```

- [ ] **Step 4: 實作 reward compatibility 同 applyReward**

```js
// src/expedition/rewards.js
export function generateRewardChoices(game, catalogue, rng) {
  const compatible = catalogue.filter((reward) => reward.isCompatible(game));
  const preferred = compatible.filter((reward) => reward.matchesBuild(game));
  const pool = preferred.length ? [preferred[0], ...compatible.filter((item) => item.id !== preferred[0].id)] : compatible;
  return { choices:pool.slice(0, 3), rng };
}
export function applyReward(game, rewardId, payload = {}) {
  switch (rewardId) {
    case 'repair-wall': return { ...game, wallHp:Math.min(game.wallMaxHp, game.wallHp + 30) };
    case 'expand-wing': return { ...game, boardSizeId:'wing' };
    case 'expand-depth': return { ...game, boardSizeId:'depth' };
    case 'fire-arrows': return { ...game, tactics:[...game.tactics, 'fire-arrows'] };
    case 'first-aid': return { ...game, tactics:[...game.tactics, 'first-aid'] };
    case 'evolve-general': return { ...game, evolutions:{ ...game.evolutions, [payload.generalId]:payload.evolutionId } };
    case 'unlock-zhang-fei': return { ...game, unlockedRecipes:[...new Set([...game.unlockedRecipes, 'zhang-fei'])] };
    case 'unlock-zhuge-liang': return { ...game, unlockedRecipes:[...new Set([...game.unlockedRecipes, 'zhuge-liang'])] };
    default: return game;
  }
}
```

Task 必須喺指定節點強制提供：第三戰 route choice、第四戰前 4×3／3×4、第五戰前進化選擇；一般獎勵仍用三選一。

- [ ] **Step 5: 實作 reduceGame action table**

```js
// src/core/state-machine.js
const ALLOWED = Object.freeze({
  'expedition-map': new Set(['CHOOSE_ROUTE','START_BATTLE','RESET_RUN']),
  configuration: new Set(['DRAW_CARDS','PLACE_CARD','ASSEMBLE','RETAIN_CARDS','REROLL','START_PHASE']),
  combat: new Set(['PAUSE','RESUME','SET_SPEED','ISSUE_ORDER','STEP_COMBAT']),
  reward: new Set(['CHOOSE_REWARD']),
  victory: new Set(['START_NEW_RUN']),
  defeat: new Set(['START_NEW_RUN']),
  error: new Set(['RESET_SAVE']),
});
export function reduceGame(game, action) {
  if (!ALLOWED[game.status]?.has(action.type)) return { ok:false, state:game, events:[], error:{ code:'ILLEGAL_ACTION_FOR_STATE', message:'而家唔可以執行呢個操作。' } };
  return action.reduce(game);
}
```

實際 app action creators 必須封裝 `reduce`，UI 不可直接寫 state。

- [ ] **Step 6: Run fixed-seed integration tests and commit**

Run:

```bash
node --test games/hanzi-generals/v2/tests/expedition.test.js games/hanzi-generals/v2/tests/state-machine.test.js
```

Expected: PASS；兩條 route 都精確六戰；Boss 後只到 `victory`；wall 0 只到 `defeat`。

```bash
git add games/hanzi-generals/v2/src/expedition games/hanzi-generals/v2/src/core/state-machine.js games/hanzi-generals/v2/tests
git commit -m "feat: add six-battle expedition progression"
```

---

### Task 11: 建立 mobile-first 配置 UI、牌庫、軍營、棋盤同合法操作

**Files:**
- Modify: `games/hanzi-generals/v2/index.html`
- Modify: `games/hanzi-generals/v2/styles/game.css`
- Create: `games/hanzi-generals/v2/src/ui/render.js`
- Create: `games/hanzi-generals/v2/src/ui/interactions.js`
- Modify: `games/hanzi-generals/v2/src/app.js`
- Modify: `games/hanzi-generals/v2/tests/ui-contract.test.js`

**Interfaces:**
- `renderApp(root, game)` only reads state。
- `bindInteractions(root, dispatch)` emits `GameAction` only。
- DOM fixed regions：`#run-status`、`#enemy-intents`、`#battle-board`、`#camp`、`#hand`、`#primary-actions`、`#orders`、`#details-panel`。

- [ ] **Step 1: 擴充 UI contract tests**

```js
const requiredIds = ['run-status','enemy-intents','battle-board','camp','hand','primary-actions','orders','details-panel'];
for (const id of requiredIds) assert.match(html, new RegExp(`id="${id}"`));
assert.match(css, /min-height:\s*44px/);
assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
```

- [ ] **Step 2: 建立 semantic HTML regions**

```html
<main id="v2-game-app">
  <header id="run-status" aria-label="遠征狀態"></header>
  <section id="enemy-intents" aria-label="敵軍意圖"></section>
  <section id="battle-board" aria-label="戰陣棋盤"></section>
  <section id="camp" aria-label="兩格軍營"></section>
  <section id="hand" aria-label="手牌"></section>
  <section id="primary-actions" aria-label="主要操作"></section>
  <section id="orders" aria-label="軍令"></section>
  <details id="details-panel"><summary>牌庫與戰鬥詳情</summary></details>
  <p id="action-message" role="status" aria-live="polite"></p>
</main>
```

- [ ] **Step 3: 實作純 render helpers**

```js
// src/ui/render.js
export function renderApp(root, game) {
  renderStatus(root.querySelector('#run-status'), game);
  renderBoard(root.querySelector('#battle-board'), game);
  renderCamp(root.querySelector('#camp'), game);
  renderHand(root.querySelector('#hand'), game);
  renderActions(root.querySelector('#primary-actions'), game);
}
function renderHand(container, game) {
  container.replaceChildren(...game.deck.hand.map((card) => {
    const button = document.createElement('button');
    button.type = 'button'; button.dataset.action = 'select-card'; button.dataset.cardId = card.id;
    button.textContent = card.symbol; button.setAttribute('aria-pressed', String(game.selection?.cardIds?.includes(card.id) ?? false));
    return button;
  }));
}
function renderBoard(container, game) {
  container.style.setProperty('--columns', game.board.size.columns);
  container.replaceChildren();
  for (let row = 0; row < game.board.size.rows; row += 1) for (let column = 0; column < game.board.size.columns; column += 1) {
    const cell = document.createElement('button');
    cell.type = 'button'; cell.className = 'board-cell'; cell.dataset.action = 'choose-cell'; cell.dataset.column = column; cell.dataset.row = row;
    cell.disabled = !game.legalCells?.some((item) => item.column === column && item.row === row);
    cell.textContent = game.boardCellLabels?.[`${column},${row}`] ?? '空'; container.append(cell);
  }
}
```

所有 disabled controls 必須用相鄰 help text 或 `aria-describedby` 顯示原因；不可只灰色處理。

- [ ] **Step 4: 實作 event delegation，支援點按而唔強制拖放**

```js
// src/ui/interactions.js
export function bindInteractions(root, dispatch) {
  root.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target || target.disabled) return;
    const action = target.dataset.action;
    if (action === 'select-card') dispatch({ type:'SELECT_CARD', cardId:target.dataset.cardId });
    if (action === 'choose-cell') dispatch({ type:'CHOOSE_CELL', cell:{ column:Number(target.dataset.column), row:Number(target.dataset.row) } });
    if (action === 'reroll') dispatch({ type:'REROLL' });
    if (action === 'start-phase') dispatch({ type:'START_PHASE' });
  });
}
```

- [ ] **Step 5: 加 mobile CSS**

```css
#battle-board { display:grid; grid-template-columns:repeat(var(--columns), minmax(0,1fr)); gap:8px; }
.board-cell, #hand button, #camp button, #primary-actions button, #orders button { min-height:44px; }
.board-cell[aria-current="true"] { outline:3px solid #9d2f24; outline-offset:2px; }
#hand { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:8px; position:sticky; bottom:0; padding:8px; background:rgba(239,227,200,.96); }
@media (max-width:359px) { #v2-game-app { width:calc(100% - 16px); } #hand { gap:4px; } }
@media (prefers-reduced-motion: reduce) { *,*::before,*::after { animation-duration:.01ms !important; transition-duration:.01ms !important; } }
```

- [ ] **Step 6: App boot validation and error state**

`app.js` 必須先 `validateGameData`，失敗時 render `error` state 同版本資訊；成功先 load snapshot 或 create expedition。UI action error 顯示喺 `#action-message`，state 唔變。

- [ ] **Step 7: Run UI contract and manual 320px check**

Run:

```bash
npm test
python scripts/build_site.py
python -m http.server 8000 --directory _site
```

Manual: open `http://localhost:8000/games/hanzi-generals/v2/` at 320×700；確認無水平 scroll、手牌及棋盤可點按。

- [ ] **Step 8: Commit**

```bash
git add games/hanzi-generals/v2/index.html games/hanzi-generals/v2/styles games/hanzi-generals/v2/src/ui games/hanzi-generals/v2/src/app.js games/hanzi-generals/v2/tests/ui-contract.test.js
git commit -m "feat: add mobile-first v2 configuration interface"
```

---

### Task 12: 建立戰鬥 UI、暫停、倍速、意圖、教學同低動態模式

**Files:**
- Create: `games/hanzi-generals/v2/src/ui/tutorial.js`
- Modify: `games/hanzi-generals/v2/src/ui/render.js`
- Modify: `games/hanzi-generals/v2/src/ui/interactions.js`
- Modify: `games/hanzi-generals/v2/src/app.js`
- Modify: `games/hanzi-generals/v2/styles/game.css`
- Modify: `games/hanzi-generals/v2/tests/ui-contract.test.js`

**Interfaces:**
- Battle runner interval：1×=`700ms`，2×=`350ms`；pause 停止 timer，唔修改 combat state。
- Tutorial steps fixed：放字 → 合成武將 → 查看攻擊方向 → 開始第一段 → 暫停並用一次軍令。

- [ ] **Step 1: 寫 UI contract assertions**

```js
assert.match(html, /data-action="pause"/);
assert.match(html, /data-action="set-speed"/);
assert.match(html, /data-action="issue-order"/);
assert.match(html, /aria-live="assertive"/);
assert.match(css, /\.intent-countdown/);
assert.match(css, /\[data-reduced-motion="true"\]/);
```

- [ ] **Step 2: Render enemy intents with text + icon + countdown**

```js
function renderIntents(container, game) {
  container.replaceChildren(...game.laneWarnings.map((warning) => {
    const item = document.createElement('article'); item.className = `intent intent-${warning.level}`;
    item.innerHTML = `<strong>第 ${warning.lane + 1} 路</strong><span aria-hidden="true">${warning.level === 'danger' ? '⚠' : '•'}</span><span>${warning.text}</span>`;
    return item;
  }));
}
```

使用 textContent 或可信固定 template；不可將玩家輸入插入 `innerHTML`。

- [ ] **Step 3: Implement battle runner independent of rules**

```js
let timer = null;
function scheduleBattleTick() {
  clearTimeout(timer);
  if (game.status !== 'combat' || game.ui.paused) return;
  const delay = game.ui.speed === 2 ? 350 : 700;
  timer = setTimeout(() => dispatch({ type:'STEP_COMBAT' }), delay);
}
function dispatch(action) {
  const result = reduceGame(game, toReducerAction(action));
  if (!result.ok) { showMessage(result.error.message); return; }
  game = result.state; renderApp(root, game); playEvents(result.events, game.settings.reducedMotion); scheduleBattleTick();
}
```

- [ ] **Step 4: Implement event feedback without controlling results**

```js
function playEvents(events, reducedMotion) {
  for (const event of events) {
    const node = document.querySelector(`[data-entity-id="${CSS.escape(event.payload.targetId ?? event.payload.enemyId ?? '')}"]`);
    if (!node) continue;
    node.dataset.lastEvent = event.type;
    if (!reducedMotion) node.animate([{ transform:'scale(1)' }, { transform:'scale(1.04)' }, { transform:'scale(1)' }], { duration:180 });
  }
}
```

合成使用書法／印章 class；重騎警告使用視覺 pulse，但低動態時改成固定粗框＋文字「衝鋒倒數」。

- [ ] **Step 5: Implement tutorial progression by completed actions**

```js
// src/ui/tutorial.js
const STEPS = ['PLACE_CARD','ASSEMBLE_UNIT','OPEN_RANGE','START_PHASE','USE_ORDER'];
export function advanceTutorial(tutorial, completedAction) {
  if (tutorial.complete || STEPS[tutorial.index] !== completedAction) return tutorial;
  const index = tutorial.index + 1;
  return { index, complete:index >= STEPS.length };
}
```

教學文字只顯示目前一步；玩家完成 action 後先前進。首次玩家可跳過，但跳過按鈕要確認一次。

- [ ] **Step 6: Add settings and keyboard/focus behavior**

- `Escape`：關閉 details／modal，唔清除遊戲進度。
- `Space`：只喺 combat 且焦點不在 button/input 時切換 pause。
- focus order：status → intents → board → camp → hand → primary actions → orders → details。
- settings：`reducedMotion`、`vibration`、`speed`；震動失敗用 try/catch 忽略。

- [ ] **Step 7: Run tests and manual accessibility check**

Run: `npm test && python scripts/build_site.py`

Manual:
- 只用 tap 完成教學五步。
- 只用 keyboard 完成選牌、放置、開始戰鬥、pause。
- 開啟 reduced motion 後仍睇到所有 intent、命中及 charge 資訊。
- 2× 只縮短畫面 delay，固定種子最終 state 同 1× 完全相同。

- [ ] **Step 8: Commit**

```bash
git add games/hanzi-generals/v2/src/ui games/hanzi-generals/v2/src/app.js games/hanzi-generals/v2/styles/game.css games/hanzi-generals/v2/tests/ui-contract.test.js
git commit -m "feat: add v2 combat presentation and tutorial"
```

---

### Task 13: 完成固定種子 smoke tests、錯誤恢復、Playtest Pack 同部署驗證

**Files:**
- Modify: `games/hanzi-generals/v2/tests/expedition.test.js`
- Modify: `games/hanzi-generals/v2/tests/storage.test.js`
- Modify: `tests/test_build_site.py`
- Create: `docs/playtests/hanzi-generals-v2-playtest-template.md`
- Modify: `README.md`

**Interfaces:**
- Produces: repeatable Vertical Slice acceptance suite，同公開前真人測試記錄格式。
- README 只記錄 hidden v2 developer/test path，唔加 Playground 公開卡片。

- [ ] **Step 1: 加五個 fixed-seed smoke tests**

```js
const cases = [
  { seed:'wing-safe', route:'safe', expansion:'wing' },
  { seed:'depth-safe', route:'safe', expansion:'depth' },
  { seed:'wing-danger', route:'danger', expansion:'wing' },
  { seed:'depth-danger', route:'danger', expansion:'depth' },
  { seed:'boss-charge', route:'danger', expansion:'wing', assertBossCharge:true },
];
for (const scenario of cases) {
  test(`full run ${scenario.seed}`, () => {
    const result = autoplayDeterministicRun(scenario);
    assert.equal(result.completedBattleIds.length, 6);
    assert.equal(['victory','defeat'].includes(result.status), true);
    assert.equal(result.classicTouched, false);
    if (scenario.assertBossCharge) assert.equal(result.events.some(({type}) => type === 'BOSS_PHASE_CHANGED'), true);
  });
}
```

`autoplayDeterministicRun` 只可使用公開 action interfaces，唔可以直接改內部 state 跳過戰鬥。

- [ ] **Step 2: 加 save boundary tests**

```js
test('snapshot is written only at approved boundaries', () => {
  const writes = [];
  const storage = { setItem:(key,value) => writes.push(JSON.parse(value).game.status), getItem:() => null, removeItem:() => {} };
  maybeSave({ status:'combat', combat:{ turn:3 } }, storage);
  maybeSave({ status:'reward' }, storage);
  maybeSave({ status:'configuration', currentBattle:{ phaseIndex:0 } }, storage);
  assert.deepEqual(writes, ['reward','configuration']);
});
```

- [ ] **Step 3: 加 build acceptance assertions**

```python
self.assertIn("群雄遠征", v2)
self.assertNotIn('"id": "hanzi-generals-v2"', (ROOT / "_site/projects.json").read_text(encoding="utf-8"))
self.assertTrue((ROOT / "_site/games/hanzi-generals/v2/src/app.js").exists())
self.assertFalse((ROOT / "_site/games/hanzi-generals/v2/tests").exists())
```

- [ ] **Step 4: 建立真人 playtest template**

```markdown
# 字陣無雙 v2 Vertical Slice Playtest

- Build commit:
- Test date:
- Device / viewport:
- First-time player: Yes / No
- Route: Safe / Danger
- Expansion: 4×3 / 3×4

## Uncoached onboarding
- First assembly completed without help: Yes / No
- First battle started without help: Yes / No
- One enemy intent explained correctly: Yes / No
- Facilitator interventions and exact point:

## Decision evidence
- Build direction observed:
- Order held / early use / emergency use:
- Expansion reason stated by player:
- Failure cause stated by player:
- One change player would try next run:
- Would immediately replay: Yes / No / Unsure

## Bugs and clarity failures
- Reproduction seed:
- Exact action sequence:
- Expected:
- Actual:
```

- [ ] **Step 5: README 加 hidden test note**

加入：

```markdown
## 字陣無雙 v2 隱藏測試版

Vertical Slice 開發完成後會由以下路徑提供指定測試者使用：

`/games/hanzi-generals/v2/`

此版本不會加入 `projects.json`，亦不取代 Classic。開發及驗證規格見 `docs/superpowers/specs/` 與 `docs/superpowers/plans/`。
```

- [ ] **Step 6: Run final verification**

Run:

```bash
npm test
python -m unittest tests/test_build_site.py -v
python scripts/build_site.py
```

Expected:
- Node tests全部 PASS。
- Python build regression PASS。
- `SITE_VERIFY_OK`。
- Classic output仍包含 `id="game-app"`。
- v2 output包含 `id="v2-game-app"`。
- `_site/projects.json` 無 v2 entry。

- [ ] **Step 7: Manual release candidate check**

用 iPhone target viewport 同桌面 browser 完成：

1. 開 Classic 玩到第一波，確認無回歸。
2. 直接開 hidden v2 URL。
3. 完成教學戰五個 action。
4. 走一條安全 route 同一條危險 route。
5. 分別選一次 4×3 同 3×4。
6. 華雄進入第二階段並召喚重騎。
7. 重整頁面，只由最近節點恢復。
8. 人為寫入壞 JSON，確認可重設而設定仍保留。
9. reduced motion 下完成一場。
10. 320px 無水平 scroll。

- [ ] **Step 8: Commit**

```bash
git add games/hanzi-generals/v2/tests tests/test_build_site.py docs/playtests README.md
git commit -m "test: complete Hanzi Generals v2 acceptance pack"
```

---

## Implementation Review Gates

每個 task 完成後 reviewer 必須檢查：

1. 新功能係咪只透過已定義 interfaces 接入。
2. 有冇將武將、敵人或關卡名稱硬編碼入 engine。
3. 新 test 係咪先證明失敗，再用最小實作通過。
4. Classic build、網址及 marker 係咪完全不變。
5. UI 係咪只 render state，動畫有冇意外控制規則。
6. 有冇增加 spec 以外內容、框架或依賴。

## Plan Self-Review Result

- **Spec coverage:** 發布隔離、棋盤、牌庫、軍營、六名武將、兵種、敵人意圖、軍令、軍策、六戰、分支、擴陣、進化、華雄、存檔、UI、教學、低動態、固定種子、CI、真人 playtest Gate 均有對應 task。
- **Placeholder scan:** 文件無 `TBD`、`TODO`、`implement later` 或未指定「適當處理」字眼。
- **Type consistency:** 所有 task 沿用 Shared Runtime Interfaces；`ActionResult`、board cell、card instance、order command、status enum 同 storage keys 保持一致。
- **Scope:** 唔包括公開索引、完整三章、超過六名武將、4×4／4×5、雲端、排行榜、多人、商業素材或永久數值成長。
