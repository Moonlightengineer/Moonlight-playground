# Hanzi Generals v2 Phase A Playtest Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Hanzi Generals v2 understandable, observable, restartable, and ready for final real-mobile validation before publishing it as `v2.0 Stable` in Moonlight Playground.

**Architecture:** Keep combat truth, storage truth, player-facing copy, and transient visual effects in separate modules. Add canonical explanation data to game definitions, emit complete combat events from the engine, render non-blocking feedback through a dedicated presenter, and centralise both reset modes in the storage layer. The existing app controller coordinates these modules without moving game rules into the DOM layer.

**Tech Stack:** HTML, CSS, native JavaScript ES modules, Node 20 built-in test runner, Playwright browser regressions, GitHub Actions, static GitHub Pages build.

## Global Constraints

- Work only in `Moonlightengineer/Moonlight-playground` on a feature branch and open a PR; do not merge.
- ChatGPT Chat is the sole developer for this project; do not use Work, Codex, or another coding agent.
- No production runtime dependency may be added.
- Classic Hanzi Generals must remain unchanged.
- Phase A must not include the deferred full UI redesign, new campaign content, backend, accounts, cloud save, analytics, multiplayer, or broad balance work.
- Help must be a full-screen in-app panel that preserves the run and restores the previous pause state.
- Complete reset must remove only Hanzi Generals v2-owned storage and must not clear Classic or unrelated Playground data.
- Essential combat feedback must remain understandable with reduced motion enabled and cannot rely only on colour.
- Public repository content must remain suitable for public display; internal project governance stays in Notion.
- Publication is blocked until automated checks pass and a real-mobile playtest reports no P0/P1 issue.

---

## File Structure

### Create

- `games/hanzi-generals/v2/src/ui/combat-feedback.js` — consumes combat events and owns temporary visual feedback lifecycle.
- `games/hanzi-generals/v2/src/ui/help-content.js` — canonical player-facing help section data.
- `games/hanzi-generals/v2/src/ui/help-panel.js` — help panel open/close/render behavior and pause-state restoration.

### Modify

- `games/hanzi-generals/v2/data/rewards.js` — canonical reward and upgrade explanations.
- `games/hanzi-generals/v2/src/core/data-validator.js` — explanation-field validation.
- `games/hanzi-generals/v2/src/core/events.js` — explicit event names and payload conventions.
- `games/hanzi-generals/v2/src/combat/combat-engine.js` — complete attacker/target/damage/defeat event evidence.
- `games/hanzi-generals/v2/src/storage/storage.js` — owned-key registry and two reset operations.
- `games/hanzi-generals/v2/src/ui/render.js` — render reward explanations and stable entity anchors.
- `games/hanzi-generals/v2/src/ui/render-interactive.js` — preserve interaction semantics while feedback runs.
- `games/hanzi-generals/v2/src/ui/interactions.js` — help and reset actions.
- `games/hanzi-generals/v2/src/app.js` — module coordination, confirmations, reload, and event presentation.
- `games/hanzi-generals/v2/index.html` — help/settings entry, panel shell, feedback layer, reset controls.
- `games/hanzi-generals/v2/styles/game.css` — mobile feedback, help panel, reward explanation, reduced-motion styles.
- `games/hanzi-generals/v2/tests/data-validator.test.js` — explanation contract.
- `games/hanzi-generals/v2/tests/combat-engine.test.js` — event payload and defeat evidence.
- `games/hanzi-generals/v2/tests/storage.test.js` — reset isolation and persistence rules.
- `games/hanzi-generals/v2/tests/ui-contract.test.js` — DOM/CSS/help/restart contracts.
- `scripts/hanzi_v2_browser_playtest.mjs` — real-browser attack feedback and help checks.
- `scripts/hanzi_v2_browser_ui_regressions.mjs` — narrow-width, reset, storage-isolation regressions.
- `README.md` and public game copy only after the stable gate passes.
- `projects.json` only after the stable gate passes.

---

### Task 1: Canonical reward and upgrade explanations

**Files:**
- Modify: `games/hanzi-generals/v2/data/rewards.js`
- Modify: `games/hanzi-generals/v2/src/core/data-validator.js`
- Modify: `games/hanzi-generals/v2/src/ui/render.js`
- Test: `games/hanzi-generals/v2/tests/data-validator.test.js`
- Test: `games/hanzi-generals/v2/tests/ui-contract.test.js`

**Interfaces:**
- Produces: every selectable reward exposes `description: { summary: string, effect: string, useCase: string }`.
- Produces: `validateGameData()` reports a validation error when any explanation field is missing or blank.
- Consumes: the current reward data objects and existing reward renderer.

- [ ] **Step 1: Write failing data tests**

Add assertions that iterate through every selectable reward and require non-empty `description.summary`, `description.effect`, and `description.useCase`. Add a malformed fixture and assert that validation rejects it with the reward ID in the error.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test games/hanzi-generals/v2/tests/data-validator.test.js
```

Expected: FAIL because current rewards do not provide the canonical description object and the validator does not enforce it.

- [ ] **Step 3: Add canonical explanation data and validation**

Use this exact shape on each selectable definition:

```js
description: {
  summary: '一句說明主要用途。',
  effect: '明確數值或規則變化。',
  useCase: '一句戰術使用情境。',
}
```

Implement one validator helper:

```js
function validateDescription(ownerType, ownerId, description, errors) {
  for (const field of ['summary', 'effect', 'useCase']) {
    if (typeof description?.[field] !== 'string' || !description[field].trim()) {
      errors.push(`${ownerType} ${ownerId} missing description.${field}`);
    }
  }
}
```

Call it for every reward or upgrade that can appear as a player choice.

- [ ] **Step 4: Write failing UI contract assertions**

Require each rendered reward choice to expose the name, summary, and exact effect without opening another screen. Require `useCase` to be present in the existing detail area or expandable detail region.

- [ ] **Step 5: Run UI contracts and verify RED**

```bash
node --test games/hanzi-generals/v2/tests/ui-contract.test.js
```

Expected: FAIL because the current reward cards do not render the new fields.

- [ ] **Step 6: Render explanations with mobile-first hierarchy**

Render:

```html
<strong class="reward-name">...</strong>
<span class="reward-summary">...</span>
<span class="reward-effect">...</span>
<span class="reward-use-case">...</span>
```

The name, summary, and effect remain visible on the choice. The use case may use the current details panel but cannot require the full Help panel.

- [ ] **Step 7: Run focused and full JS tests**

```bash
node --test games/hanzi-generals/v2/tests/data-validator.test.js games/hanzi-generals/v2/tests/ui-contract.test.js
npm test
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add games/hanzi-generals/v2/data/rewards.js games/hanzi-generals/v2/src/core/data-validator.js games/hanzi-generals/v2/src/ui/render.js games/hanzi-generals/v2/tests/data-validator.test.js games/hanzi-generals/v2/tests/ui-contract.test.js
git commit -m "feat: explain Hanzi v2 reward choices"
```

---

### Task 2: Complete combat event evidence

**Files:**
- Modify: `games/hanzi-generals/v2/src/core/events.js`
- Modify: `games/hanzi-generals/v2/src/combat/combat-engine.js`
- Test: `games/hanzi-generals/v2/tests/combat-engine.test.js`

**Interfaces:**
- Produces: `UNIT_HIT { attackerId, targetId, damage }`.
- Produces: `FRIENDLY_DAMAGED { attackerId, targetId, damage }`.
- Produces: `WALL_DAMAGED { attackerId, lane, damage }`.
- Produces: `UNIT_DEFEATED { unitId, defeatedById }`.
- Produces: `ENEMY_DEFEATED { enemyId, defeatedById }`.
- Consumes: existing combat step result/event list.

- [ ] **Step 1: Write failing combat-event tests**

Create deterministic fixtures for: friendly attacks enemy, enemy attacks unit, enemy damages wall, friendly unit defeated, enemy defeated. Assert exact event names and payload keys.

Example assertion:

```js
assert.deepEqual(result.events.find((event) => event.type === 'UNIT_HIT'), {
  type: 'UNIT_HIT',
  attackerId: 'huang-zhong-1',
  targetId: 'enemy-1',
  damage: 3,
});
```

- [ ] **Step 2: Run combat tests and verify RED**

```bash
node --test games/hanzi-generals/v2/tests/combat-engine.test.js
```

Expected: FAIL on missing identifiers, inconsistent property names, or missing explicit defeat events.

- [ ] **Step 3: Define and emit complete events**

Keep animation timing out of the engine. Extend only the event payloads and add explicit defeat evidence at the point where HP crosses to zero. Use `attackerId` consistently for both friendly and enemy sources.

- [ ] **Step 4: Verify combat tests and no rule regression**

```bash
node --test games/hanzi-generals/v2/tests/combat-engine.test.js games/hanzi-generals/v2/tests/orders.test.js
npm test
```

Expected: PASS with unchanged combat outcomes.

- [ ] **Step 5: Commit**

```bash
git add games/hanzi-generals/v2/src/core/events.js games/hanzi-generals/v2/src/combat/combat-engine.js games/hanzi-generals/v2/tests/combat-engine.test.js
git commit -m "feat: expose complete Hanzi v2 combat events"
```

---

### Task 3: Non-blocking combat feedback presenter

**Files:**
- Create: `games/hanzi-generals/v2/src/ui/combat-feedback.js`
- Modify: `games/hanzi-generals/v2/src/ui/render.js`
- Modify: `games/hanzi-generals/v2/src/ui/render-interactive.js`
- Modify: `games/hanzi-generals/v2/src/app.js`
- Modify: `games/hanzi-generals/v2/index.html`
- Modify: `games/hanzi-generals/v2/styles/game.css`
- Test: `games/hanzi-generals/v2/tests/ui-contract.test.js`
- Browser: `scripts/hanzi_v2_browser_playtest.mjs`

**Interfaces:**
- Consumes: combat event objects from Task 2.
- Produces: `createCombatFeedback({ root, reducedMotion })` returning `{ present(events), clear() }`.
- Requires entity anchors: `[data-unit-id="..."]`, `[data-enemy-id="..."]`, and `[data-lane="..."]`.
- Must never mutate game state.

- [ ] **Step 1: Write failing UI contract tests**

Require:

- `#combat-feedback-layer` exists and is `aria-live="polite"`.
- feedback layer uses `pointer-events: none`.
- friendly and enemy tokens expose stable data IDs.
- CSS contains attacker, target, damage, defeat, and reduced-motion states.
- temporary feedback cannot create horizontal overflow.

- [ ] **Step 2: Run UI contracts and verify RED**

```bash
node --test games/hanzi-generals/v2/tests/ui-contract.test.js
```

Expected: FAIL because the presenter and layer do not exist.

- [ ] **Step 3: Implement the presenter API**

Use this public interface:

```js
export function createCombatFeedback({ root, reducedMotion }) {
  const activeNodes = new Set();

  function present(events) {
    for (const event of events) presentEvent(event);
  }

  function clear() {
    for (const node of activeNodes) node.remove();
    activeNodes.clear();
  }

  return { present, clear };
}
```

For hit events, find source and target anchors, add short-lived outline classes, create an absolutely positioned cue in the feedback layer, and add a text damage label. Missing anchors must fall back to an event text label and must not throw.

- [ ] **Step 4: Add stable render anchors and app coordination**

Render unit and enemy roots with exact IDs:

```html
<div class="unit-token" data-unit-id="..."></div>
<div class="enemy-token" data-enemy-id="..."></div>
```

After each action resolves and the normal render completes, call `feedback.present(result.events ?? [])`. Call `feedback.clear()` before full screen/state replacement and on reset.

- [ ] **Step 5: Add reduced-motion behavior**

Under `prefers-reduced-motion: reduce` and the game’s own low-motion setting:

- no projectile travel, pulse, or scale transform;
- attacker and target receive static outlines;
- damage labels and event text remain visible;
- cleanup timing remains finite.

- [ ] **Step 6: Run focused tests and browser playtest**

```bash
node --test games/hanzi-generals/v2/tests/ui-contract.test.js
node scripts/hanzi_v2_browser_playtest.mjs
```

Expected browser evidence:

- at least one friendly attack identifies attacker and target;
- a damage label appears;
- feedback nodes disappear;
- pause, speed, order controls remain clickable;
- `bugs: []` and `runtimeErrors: []`.

- [ ] **Step 7: Commit**

```bash
git add games/hanzi-generals/v2/src/ui/combat-feedback.js games/hanzi-generals/v2/src/ui/render.js games/hanzi-generals/v2/src/ui/render-interactive.js games/hanzi-generals/v2/src/app.js games/hanzi-generals/v2/index.html games/hanzi-generals/v2/styles/game.css games/hanzi-generals/v2/tests/ui-contract.test.js scripts/hanzi_v2_browser_playtest.mjs
git commit -m "feat: show Hanzi v2 combat feedback"
```

---

### Task 4: Full-screen in-app Help panel

**Files:**
- Create: `games/hanzi-generals/v2/src/ui/help-content.js`
- Create: `games/hanzi-generals/v2/src/ui/help-panel.js`
- Modify: `games/hanzi-generals/v2/src/ui/interactions.js`
- Modify: `games/hanzi-generals/v2/src/app.js`
- Modify: `games/hanzi-generals/v2/index.html`
- Modify: `games/hanzi-generals/v2/styles/game.css`
- Test: `games/hanzi-generals/v2/tests/ui-contract.test.js`
- Browser: `scripts/hanzi_v2_browser_playtest.mjs`

**Interfaces:**
- Produces: `HELP_SECTIONS`, an ordered array of `{ id, title, body }`.
- Produces: `createHelpPanel({ panel, contentRoot, onOpen, onClose })` returning `{ open(), close(), render() }`.
- Consumes: app pause state through callbacks; it does not directly mutate combat state.

- [ ] **Step 1: Write failing help contracts**

Assert the document contains a Help entry, a full-screen panel with dialog semantics, a close action, and all required section IDs:

```text
objective, cards, assembly, board, camp, combat, orders, rewards, saves
```

Assert Help content is scan-friendly and does not duplicate developer terminology.

- [ ] **Step 2: Run UI contracts and verify RED**

```bash
node --test games/hanzi-generals/v2/tests/ui-contract.test.js
```

Expected: FAIL because Help modules and shell do not exist.

- [ ] **Step 3: Implement canonical player help content**

Create `HELP_SECTIONS` with concise Traditional Chinese player copy. Each body should use short paragraphs or compact lists and explain rules from the player’s perspective. Do not include roadmap, tests, architecture, or internal AI workflow.

- [ ] **Step 4: Implement panel lifecycle and pause restoration**

On open:

1. remember whether combat was running;
2. pause only when it was running;
3. render/open the panel;
4. move focus to the panel heading or close button.

On close:

1. hide the panel;
2. restore focus to the Help trigger;
3. resume only when combat had been running before Help opened.

- [ ] **Step 5: Add minimal contextual guidance**

Keep existing tutorial messages short. Add only:

- current target-selection instruction;
- reward explanations from Task 1;
- tap-to-view unit detail cue where needed;
- first-encounter messages for Help-relevant mechanics.

Do not add blocking tutorial modals during combat.

- [ ] **Step 6: Run contracts and browser regression**

```bash
node --test games/hanzi-generals/v2/tests/ui-contract.test.js
node scripts/hanzi_v2_browser_playtest.mjs
```

Expected browser evidence:

- open Help during an active run;
- combat pauses;
- required sections are reachable;
- close Help;
- previous run state remains intact;
- combat resumes only when previously running;
- no horizontal overflow at 390×844.

- [ ] **Step 7: Commit**

```bash
git add games/hanzi-generals/v2/src/ui/help-content.js games/hanzi-generals/v2/src/ui/help-panel.js games/hanzi-generals/v2/src/ui/interactions.js games/hanzi-generals/v2/src/app.js games/hanzi-generals/v2/index.html games/hanzi-generals/v2/styles/game.css games/hanzi-generals/v2/tests/ui-contract.test.js scripts/hanzi_v2_browser_playtest.mjs
git commit -m "feat: add Hanzi v2 in-game help"
```

---

### Task 5: Canonical storage ownership and two reset modes

**Files:**
- Modify: `games/hanzi-generals/v2/src/storage/storage.js`
- Modify: `games/hanzi-generals/v2/src/ui/interactions.js`
- Modify: `games/hanzi-generals/v2/src/app.js`
- Modify: `games/hanzi-generals/v2/index.html`
- Test: `games/hanzi-generals/v2/tests/storage.test.js`
- Test: `games/hanzi-generals/v2/tests/ui-contract.test.js`
- Browser: `scripts/hanzi_v2_browser_ui_regressions.mjs`

**Interfaces:**
- Produces: `V2_STORAGE_KEYS: readonly string[]`.
- Produces: `resetExpedition(storage): { ok: true } | { ok: false, error: Error }`.
- Produces: `clearAllV2Data(storage): { ok: true } | { ok: false, error: Error }`.
- Produces: `buildLatestVersionUrl(location): string` with a `v2reload=<timestamp>` query value.

- [ ] **Step 1: Write failing storage tests**

Seed:

- current expedition snapshot;
- tutorial-completion key;
- settings key;
- one legacy v2 key;
- one unrelated Playground key;
- one Classic key.

Assert expedition reset removes only the run snapshot and preserves tutorial/settings. Assert complete reset removes every v2 key, including legacy keys, while preserving unrelated and Classic keys.

- [ ] **Step 2: Run storage tests and verify RED**

```bash
node --test games/hanzi-generals/v2/tests/storage.test.js
```

Expected: FAIL because key ownership and reset behavior are not centralised.

- [ ] **Step 3: Implement canonical key ownership and reset operations**

Keep all owned keys in one exported constant. UI code must call reset functions and must not contain raw storage key strings.

Use result objects rather than silently ignoring storage exceptions:

```js
export function clearAllV2Data(storage = localStorage) {
  try {
    for (const key of V2_STORAGE_KEYS) storage.removeItem(key);
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}
```

- [ ] **Step 4: Write failing UI contracts for both destructive actions**

Require two separately labelled actions and two separate confirmation messages. The complete reset confirmation must explicitly mention expedition, tutorial, settings, and old v2 data.

- [ ] **Step 5: Implement restart flows in the app controller**

`Restart expedition`:

1. confirm;
2. pause and clear feedback;
3. call `resetExpedition()`;
4. create a fresh expedition in the currently loaded runtime;
5. preserve tutorial and settings;
6. render success or actionable error.

`Clear all data and test latest version`:

1. stronger confirm;
2. pause and clear feedback;
3. call `clearAllV2Data()`;
4. on success, assign `window.location.href = buildLatestVersionUrl(window.location)`;
5. on failure, remain on page and show the storage error.

- [ ] **Step 6: Add browser reset and storage-isolation regression**

In `scripts/hanzi_v2_browser_ui_regressions.mjs`:

- seed v2 and unrelated keys;
- trigger expedition restart and verify tutorial/settings remain;
- trigger complete reset and accept confirmation;
- verify reload contains `v2reload`;
- verify new onboarding starts;
- verify unrelated and Classic keys remain;
- verify no runtime error.

- [ ] **Step 7: Run focused and browser tests**

```bash
node --test games/hanzi-generals/v2/tests/storage.test.js games/hanzi-generals/v2/tests/ui-contract.test.js
node scripts/hanzi_v2_browser_ui_regressions.mjs
npm test
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add games/hanzi-generals/v2/src/storage/storage.js games/hanzi-generals/v2/src/ui/interactions.js games/hanzi-generals/v2/src/app.js games/hanzi-generals/v2/index.html games/hanzi-generals/v2/tests/storage.test.js games/hanzi-generals/v2/tests/ui-contract.test.js scripts/hanzi_v2_browser_ui_regressions.mjs
git commit -m "feat: add Hanzi v2 restart controls"
```

---

### Task 6: Mobile polish and integrated release regression

**Files:**
- Modify: `games/hanzi-generals/v2/styles/game.css`
- Modify: `scripts/hanzi_v2_browser_playtest.mjs`
- Modify: `scripts/hanzi_v2_browser_ui_regressions.mjs`
- Modify: `.github/workflows/pages.yml` only if the existing path filters do not already cover the new files.

**Interfaces:**
- Consumes: all Phase A interfaces from Tasks 1–5.
- Produces: machine-readable evidence for reward clarity, combat feedback, Help, reset behavior, overflow, and runtime errors.

- [ ] **Step 1: Extend browser report gates**

Add explicit report fields:

```js
gates: {
  rewardExplanationVisible: boolean,
  combatFeedbackObserved: boolean,
  helpRoundTripPassed: boolean,
  expeditionResetPassed: boolean,
  completeResetPassed: boolean,
  storageIsolationPassed: boolean,
  noHorizontalOverflow: boolean,
}
```

A failed gate must appear in `bugs` or `warnings` according to release severity; no gate may be inferred solely from workflow success.

- [ ] **Step 2: Run browser scripts and verify failures expose incomplete integration**

```bash
node scripts/hanzi_v2_browser_playtest.mjs
node scripts/hanzi_v2_browser_ui_regressions.mjs
```

Expected: any missing integrated behavior is reported by a named gate rather than hidden behind `bugs: []`.

- [ ] **Step 3: Fix mobile layout only where Phase A introduced regressions**

At 320px, 390×844, and 430px widths verify:

- reward text remains readable without horizontal scroll;
- feedback remains inside the battlefield;
- Help panel fits the viewport and uses normal vertical page scrolling;
- destructive controls are separated enough to prevent accidental taps;
- no new persistent page height or width is created by temporary effects.

Do not redesign unrelated visual hierarchy.

- [ ] **Step 4: Run all validation**

```bash
npm test
python -m pytest tests/test_build_site.py
node scripts/hanzi_v2_browser_playtest.mjs
node scripts/hanzi_v2_browser_ui_regressions.mjs
```

Expected: all tests pass; reports contain no runtime errors and all Phase A gates are true except the explicitly manual real-mobile gate.

- [ ] **Step 5: Commit**

```bash
git add games/hanzi-generals/v2/styles/game.css scripts/hanzi_v2_browser_playtest.mjs scripts/hanzi_v2_browser_ui_regressions.mjs .github/workflows/pages.yml
git commit -m "test: verify Hanzi v2 release readiness"
```

---

### Task 7: Real-mobile validation package

**Files:**
- No internal planning file is added to the public repository.
- Update the Notion Project Hub player-feedback and release-gate sections.
- Attach or link only public-safe evidence to the PR description.

**Interfaces:**
- Consumes: deployed feature-branch preview or GitHub Pages test URL, browser reports, CI results.
- Produces: one structured player validation result with severity classification.

- [ ] **Step 1: Prepare the player test script in Notion**

The advisor/player checks:

1. understand one upgrade without external explanation;
2. identify one attacker, target, damage amount, and defeat;
3. open/close Help during a run;
4. restart expedition and confirm settings/tutorial behavior;
5. complete reset and confirm fresh onboarding/latest version;
6. report any P0, P1, P2, or preference note.

- [ ] **Step 2: Deploy and provide the test URL**

Confirm CI, static build, and browser reports are green before asking for the real-mobile test.

- [ ] **Step 3: Record real-mobile evidence**

Store device/browser, tested commit SHA, result, issue severity, and concise observations in Notion. Do not mark Stable when any P0/P1 remains.

- [ ] **Step 4: Fix any P0/P1 on the same feature branch**

For each defect, add a failing automated regression where feasible, implement the minimum fix, rerun all gates, and update the PR evidence.

- [ ] **Step 5: Obtain advisor/player acceptance of v2**

Acceptance means the player reports no blocking issue and confirms the four Phase A problems are resolved. It does not mean the deferred v3 UI redesign is complete.

---

### Task 8: Publish v2.0 Stable to Moonlight Playground

**Files:**
- Modify: `projects.json`
- Modify: `README.md` only for concise public catalogue or usage content.
- Create or modify: public game-facing changelog/instructions only where the current repository convention requires them.
- Update: Notion Project Hub Current v2, Release History, Decision Log, and Roadmap.

**Interfaces:**
- Consumes: green CI/browser evidence and accepted real-mobile result from Task 7.
- Produces: public catalogue entry labelled `v2.0 Stable` and public-safe player documentation.

- [ ] **Step 1: Write failing public catalogue/build test**

Add or extend the existing build regression so the intended Hanzi v2 public entry must resolve to `/games/hanzi-generals/v2/` and the built files must exist.

- [ ] **Step 2: Run the build regression and verify RED**

```bash
python -m pytest tests/test_build_site.py
```

Expected: FAIL because v2 is not yet listed publicly.

- [ ] **Step 3: Add the public project entry and concise player-facing copy**

Public positioning:

- title: `字陣無雙｜群雄遠征`;
- version: `v2.0 Stable`;
- describe it as created end-to-end by ChatGPT, with the initial idea and player feedback supplied by the human project advisor;
- include only player instructions, version highlights, and suitable portfolio information;
- do not publish internal roadmap, governance, detailed test history, or Notion SOT content.

- [ ] **Step 4: Run the complete release suite**

```bash
npm test
python -m pytest tests/test_build_site.py
node scripts/hanzi_v2_browser_playtest.mjs
node scripts/hanzi_v2_browser_ui_regressions.mjs
```

Expected: PASS with all automated Phase A gates true.

- [ ] **Step 5: Update PR description with final evidence**

Include exact HEAD SHA, workflow run links/numbers, browser report gate values, real-mobile device/result, public-files list, and confirmation that Classic remains unchanged.

- [ ] **Step 6: Update Notion SOT**

Set Current v2 to `v2.0 Stable — pending owner merge` until the PR is merged. Record Phase A as complete, preserve deferred v3 roadmap, and link the final PR.

- [ ] **Step 7: Commit**

```bash
git add projects.json README.md tests/test_build_site.py games/hanzi-generals/v2
git commit -m "release: publish Hanzi Generals v2"
```

- [ ] **Step 8: Stop before merge**

Report that the release PR is ready. Do not merge without the repository owner’s explicit instruction.

---

## Plan Self-Review Result

- Spec coverage: reward explanations, combat feedback, Help, contextual guidance, both reset modes, storage isolation, mobile constraints, error handling, automated/browser/manual gates, public/private documentation boundary, and publication are all mapped to tasks.
- Placeholder scan: no `TBD`, `TODO`, unspecified error handling, or undefined follow-up implementation remains.
- Type consistency: event payloads, feedback API, Help API, storage API, and browser gate names are defined once and reused consistently.
- Scope check: the four subsystems are implemented as separate reviewable tasks, followed by integration, manual validation, and publication; deferred v3 work is excluded.
