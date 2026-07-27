# Hanzi Generals v2 Architecture Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize the existing v2 engine and UI by establishing canonical selectors, one renderer owner per panel, a single gameplay orchestration boundary, explicit battle/camp/reroll/reward lifecycles, battle reports, and safe save migration without rewriting the game.

**Architecture:** Use a strangler migration. Add pure selectors and ViewModels beside the current runtime, route all intents through one controller, then move lifecycle rules out of `state-machine-base.js` one bounded module at a time. Preserve current action/result contracts until parity tests prove each legacy path can be removed.

**Tech Stack:** Native ES modules, Node.js `node:test`, browser DOM, localStorage, Python static-site verification, Playwright-based scripted iPhone playtest.

## Global Constraints

- Repository: `Moonlightengineer/Moonlight-playground`.
- Runtime scope: `games/hanzi-generals/v2/` only, except focused CI/docs changes.
- No framework, backend, database, login, or new runtime dependency.
- Do not alter Classic `games/hanzi-generals/` behaviour.
- Preserve mobile-first interaction, keyboard focus, reduced-motion support, and current public route.
- Every card must pass `validateCardOwnership()` after migrations and successful domain transitions in tests.
- No renderer may mutate game state or write another panel owner's DOM root.
- No UI module may decide canonical reward, reroll, camp, battle, or command legality.
- Each task must be independently testable and reviewable before the next task begins.
- Final verification requires `npm test`, build tests, static build, and `npm run playtest:hanzi-v2`.

---

## File and Responsibility Map

- `src/core/selectors/` — pure derived-state queries; no DOM, storage, or mutation.
- `src/ui/view-model.js` — converts `game`, `profile`, and transient `ui` into panel-specific data.
- `src/ui/panels/` — one renderer per DOM root.
- `src/app-controller.js` — sole intent/orchestration boundary.
- `src/deck/reroll-policy.js` — canonical retain/reroll rule.
- `src/expedition/camp-lifecycle.js` — expedition-wide camp ownership and capacity.
- `src/battle/battle-lifecycle.js` — battle/phase/report transitions.
- `src/report/battle-report.js` — event-derived immutable metrics.
- `src/reward/reward-flow.js` — reward choice, target validation, application, continuation.
- `src/storage/migrations.js` — sequential pure save migrations.
- `src/storage/storage.js` — browser I/O only after migration split.
- `src/core/game-reducer.js` — thin lifecycle router introduced after extracted handlers exist.

### Shared interfaces

```js
buildAppViewModel(game, profile, ui) => {
  screen, runStatus, battleStage, camp, primary, orders,
  hand, details, overlays, feedback
}

handleIntent(runtime, intent) => {
  ok, runtime, events, effects, error
}

reduceGame(game, command) => {
  ok, state, events, error
}
```

`runtime` has exactly `{ game, profile, ui }`. Save snapshots contain only `game`; settings/tutorial persist through `profile`; `ui` is never persisted.

---

### Task 1: Canonical Selectors

**Files:**
- Create: `games/hanzi-generals/v2/src/core/selectors/lifecycle.js`
- Create: `games/hanzi-generals/v2/src/core/selectors/cards.js`
- Create: `games/hanzi-generals/v2/src/core/selectors/commands.js`
- Create: `games/hanzi-generals/v2/src/core/selectors/index.js`
- Create: `games/hanzi-generals/v2/tests/selectors.test.js`

**Interfaces:**
- Consumes: existing `GameState`, `GENERAL_BY_ID`, `canFocusEnemy`, `listCells`.
- Produces: `selectLifecycle`, `selectActiveBoard`, `selectCardZoneIndex`, `selectCampState`, `selectRerollState`, `selectAssemblyTargets`, `selectOrderTargets`, `selectLegalCommands`.

- [ ] **Step 1: Write failing selector contract tests**

```js
assert.equal(selectLifecycle(game).screen, 'configuration');
assert.deepEqual(selectCardZoneIndex(game).get(cardId), ['hand']);
assert.deepEqual(selectRerollState(game), {
  available: true,
  remaining: 1,
  retainedIds: [],
  retainLimit: 2,
});
assert.equal(selectLegalCommands(game).has('START_PHASE'), false);
```

- [ ] **Step 2: Verify the new test fails because selector modules do not exist**

Run: `node --test games/hanzi-generals/v2/tests/selectors.test.js`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement pure selectors with deterministic arrays/Sets**

`selectLegalCommands()` must derive legality from lifecycle and current state rather than trust `game.legalActions`. `selectAssemblyTargets()` returns only empty, in-bounds cells. `selectOrderTargets()` returns explicit swap/reinforce/focus/fortify targets.

- [ ] **Step 4: Add regression cases for legacy disagreement**

Create states where `game.legalActions` or `game.legalCells` are deliberately stale and assert selectors still return the canonical result.

- [ ] **Step 5: Run focused and full JavaScript tests**

Run:
```bash
node --test games/hanzi-generals/v2/tests/selectors.test.js
npm test
```
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add games/hanzi-generals/v2/src/core/selectors games/hanzi-generals/v2/tests/selectors.test.js
git commit -m "feat(hanzi-v2): add canonical gameplay selectors"
```

---

### Task 2: ViewModel and Single Panel Ownership

**Files:**
- Create: `games/hanzi-generals/v2/src/ui/view-model.js`
- Create: `games/hanzi-generals/v2/src/ui/panels/run-status-panel.js`
- Create: `games/hanzi-generals/v2/src/ui/panels/battle-stage-panel.js`
- Create: `games/hanzi-generals/v2/src/ui/panels/camp-panel.js`
- Create: `games/hanzi-generals/v2/src/ui/panels/primary-panel.js`
- Create: `games/hanzi-generals/v2/src/ui/panels/combat-orders-panel.js`
- Create: `games/hanzi-generals/v2/src/ui/panels/hand-panel.js`
- Create: `games/hanzi-generals/v2/src/ui/panels/details-panel.js`
- Create: `games/hanzi-generals/v2/src/ui/render-app.js`
- Create: `games/hanzi-generals/v2/tests/view-model.test.js`
- Create: `games/hanzi-generals/v2/tests/panel-ownership.test.js`
- Modify: `games/hanzi-generals/v2/src/ui/render-interactive.js`

**Interfaces:**
- Consumes: Task 1 selectors.
- Produces: `buildAppViewModel(game, profile, ui)` and `renderApp(root, viewModel)`.

- [ ] Write failing tests proving labels, disabled reasons, selected state, reward target choices, and ARIA labels come from the ViewModel.
- [ ] Write a failing DOM ownership test that spies on `replaceChildren()` and requires each panel root to be written exactly once per render.
- [ ] Implement the ViewModel as a pure function and focused panel renderers accepting only their panel model.
- [ ] Route `render-interactive.js` through the new `render-app.js` adapter while preserving current output markers.
- [ ] Run `node --test games/hanzi-generals/v2/tests/view-model.test.js games/hanzi-generals/v2/tests/panel-ownership.test.js` and `npm test`.
- [ ] Commit with `feat(hanzi-v2): establish single-owner panel rendering`.

---

### Task 3: Runtime State and App Controller Boundary

**Files:**
- Create: `games/hanzi-generals/v2/src/runtime/runtime-state.js`
- Create: `games/hanzi-generals/v2/src/app-controller.js`
- Create: `games/hanzi-generals/v2/tests/app-controller.test.js`
- Modify: `games/hanzi-generals/v2/src/app.js`
- Modify: `games/hanzi-generals/v2/src/ui/interactions.js`

**Interfaces:**
- Consumes: `reduceGame`, `buildAppViewModel`, storage/profile functions, effect presenter.
- Produces: `createAppController(dependencies)` with `getRuntime()`, `dispatchIntent(intent)`, `render()`, `destroy()`.

- [ ] Write failing tests separating UI-only intents from domain commands and proving failed commands preserve exact game identity.
- [ ] Add `createRuntimeState({ game, profile, ui })` and normalize legacy `game.settings`, `game.tutorial`, `game.ui`, and `game.selection` into adapters.
- [ ] Implement one controller that performs command dispatch, persistence boundary checks, rendering, effect delivery, and one combat timer.
- [ ] Change interactions to emit semantic intents only; remove DOM scans used to infer gameplay legality when selectors already provide targets.
- [ ] Reduce `app.js` to bootstrapping dependencies and controller startup.
- [ ] Run controller tests, `npm test`, and browser playtest.
- [ ] Commit with `refactor(hanzi-v2): add app controller boundary`.

---

### Task 4: Canonical Reroll Policy

**Files:**
- Create: `games/hanzi-generals/v2/src/deck/reroll-policy.js`
- Create: `games/hanzi-generals/v2/tests/reroll-policy.test.js`
- Modify: `games/hanzi-generals/v2/src/deck/deck.js`
- Modify: `games/hanzi-generals/v2/src/core/state-machine-base.js`
- Modify: `games/hanzi-generals/v2/src/ui/interactions.js`

**Interfaces:**
- Produces: `setRetainedCards(deck, cardIds)`, `canReroll(deck)`, `rerollRetainedHand(deck, rng, handSize)`.

- [ ] Write failing tests for 0/1/2 retained cards, three-card rejection, unavailable reroll, recycle behaviour, exact hand size, counter consumption, and retained reset.
- [ ] Implement policy with `deck.retained` as the sole authority; `REROLL` accepts no `lockedCardIds` payload.
- [ ] Keep legacy `locked` values normalized to false and outside legality decisions.
- [ ] Update selector/ViewModel/interaction contracts to reflect canonical retained cards.
- [ ] Run reroll, deck, state-machine, full JS, and browser tests.
- [ ] Commit with `fix(hanzi-v2): make reroll retention canonical`.

---

### Task 5: Expedition-wide Camp Lifecycle

**Files:**
- Create: `games/hanzi-generals/v2/src/expedition/camp-lifecycle.js`
- Create: `games/hanzi-generals/v2/tests/camp-lifecycle.test.js`
- Modify: `games/hanzi-generals/v2/src/core/state-machine-base.js`
- Modify: `games/hanzi-generals/v2/src/expedition/rewards.js`

**Interfaces:**
- Produces: `campCapacity(game)`, `moveHandCardToCamp(game, cardId)`, `returnCampCardToHand(game, cardId)`, `preserveCampAcrossSettlement(game)`, `clearCampAtRunEnd(game)`.

- [ ] Write failing phase/battle transition tests proving camp IDs survive while remaining exclusive owner-zone cards.
- [ ] Move hand↔camp operations into the camp lifecycle module.
- [ ] Stop clearing camp during between-phase, after-battle, and start-battle transitions.
- [ ] Make `extra-camp` increase expedition capacity permanently and migrate existing temporary bonus without overflow.
- [ ] Assert card ownership after all camp transitions.
- [ ] Run camp, ownership, state-machine, storage, full JS, and browser tests.
- [ ] Commit with `feat(hanzi-v2): preserve camp across the expedition`.

---

### Task 6: Battle Lifecycle Extraction

**Files:**
- Create: `games/hanzi-generals/v2/src/battle/battle-lifecycle.js`
- Create: `games/hanzi-generals/v2/tests/battle-lifecycle.test.js`
- Modify: `games/hanzi-generals/v2/src/core/state-machine-base.js`
- Modify: `games/hanzi-generals/v2/src/combat/combat-engine.js`

**Interfaces:**
- Produces: `startBattle`, `startPhase`, `stepBattleCombat`, `finishPhase`, `finishBattle`.

- [ ] Capture current start/phase/victory/defeat behaviour in failing extraction tests.
- [ ] Move battle setup, phase spawning, defeated-unit card release, and settlements into the module without changing combat math.
- [ ] Keep reducer as a command router returning the existing result envelope.
- [ ] Add transition-table tests for every legal and illegal lifecycle command.
- [ ] Run battle/combat/state-machine/ownership/full tests.
- [ ] Commit with `refactor(hanzi-v2): extract battle lifecycle`.

---

### Task 7: Canonical Battle Report

**Files:**
- Create: `games/hanzi-generals/v2/src/report/battle-report.js`
- Create: `games/hanzi-generals/v2/tests/battle-report.test.js`
- Modify: `games/hanzi-generals/v2/src/battle/battle-lifecycle.js`
- Modify: `games/hanzi-generals/v2/src/core/state-machine-base.js`
- Modify: `games/hanzi-generals/v2/src/ui/view-model.js`

**Interfaces:**
- Produces: `createBattleMetrics`, `recordBattleEvents`, `finalizeBattleReport`.
- New lifecycle: `combat -> battle-report -> reward|defeat` through `CONTINUE_AFTER_REPORT`.

- [ ] Write failing tests for report fields, event aggregation, reload safety, victory continuation, and defeat continuation.
- [ ] Accumulate only stable metrics: battle/stage, result, wall start/end/damage, phases, turns, enemies defeated, units fielded/lost, orders used, event counts.
- [ ] Introduce `battle-report` status and command legality without storing raw unbounded event history.
- [ ] Add report ViewModel and render it through the single `PrimaryPanel` owner.
- [ ] Run report/state-machine/storage/full/browser tests.
- [ ] Commit with `feat(hanzi-v2): add persistent battle reports`.

---

### Task 8: Reward Flow and Reward UI Contract

**Files:**
- Create: `games/hanzi-generals/v2/src/reward/reward-flow.js`
- Create: `games/hanzi-generals/v2/tests/reward-flow.test.js`
- Modify: `games/hanzi-generals/v2/src/expedition/rewards.js`
- Modify: `games/hanzi-generals/v2/src/core/state-machine-base.js`
- Modify: `games/hanzi-generals/v2/src/core/selectors/commands.js`
- Modify: `games/hanzi-generals/v2/src/ui/view-model.js`

**Interfaces:**
- Produces: `generateRewardOffer`, `selectRewardTargets`, `validateRewardChoice`, `applyRewardChoice`.

- [ ] Write failing tests for deterministic offers, unavailable evolution, explicit copy/remove targets, disabled reasons, and continuation.
- [ ] Move eligibility and target requirements into reward flow; remove renderer-side default target guessing.
- [ ] Require UI intents to include an explicit valid target when the reward needs one.
- [ ] Render all choices and target choices from ViewModel only.
- [ ] Run reward/state-machine/ViewModel/full/browser tests.
- [ ] Commit with `refactor(hanzi-v2): centralize reward flow`.

---

### Task 9: Sequential Save Migration and Validation

**Files:**
- Create: `games/hanzi-generals/v2/src/storage/migrations.js`
- Create: `games/hanzi-generals/v2/tests/storage-migrations-v3.test.js`
- Modify: `games/hanzi-generals/v2/src/storage/storage.js`
- Modify: `games/hanzi-generals/v2/src/core/state-machine.js`

**Interfaces:**
- Produces: `migrateSnapshot(snapshot) => { ok, game, fromVersion, toVersion, error }`.

- [ ] Write failing fixtures for current v1/v2 snapshots, legacy UI/profile fields, camp persistence, reroll retained values, battle report, unknown future schema, malformed zones, and no-partial-overwrite behaviour.
- [ ] Implement sequential pure migrations to the new schema; preserve every card ID and validate with `validateCardOwnership()` after migration.
- [ ] Split localStorage I/O from parse/migrate/validate logic.
- [ ] Save only canonical `game`; load profile separately; never persist transient `ui`.
- [ ] Run all storage, ownership, state-machine, full JS, build, and browser tests.
- [ ] Commit with `feat(hanzi-v2): add validated sequential save migration`.

---

### Task 10: Legacy Removal, Integration, Release Gate

**Files:**
- Create: `games/hanzi-generals/v2/src/core/game-reducer.js`
- Modify: `games/hanzi-generals/v2/src/core/state-machine.js`
- Modify: `games/hanzi-generals/v2/src/core/state-machine-base.js`
- Modify: `games/hanzi-generals/v2/src/ui/render.js`
- Modify: `games/hanzi-generals/v2/src/ui/render-interactive-base.js`
- Modify: `games/hanzi-generals/v2/src/ui/render-interactive.js`
- Modify: `games/hanzi-generals/v2/src/app.js`
- Modify: `games/hanzi-generals/v2/README.md` when runtime architecture or controls differ.
- Modify: `.github/workflows/pages.yml` only for focused new test commands.

**Interfaces:**
- Final reducer is the thin router over extracted lifecycle modules.

- [ ] Add architecture-boundary tests rejecting imports from UI to storage/domain internals and detecting duplicate panel owners.
- [ ] Route `state-machine.js` through `game-reducer.js`; delete legacy duplicated transition logic only after parity tests pass.
- [ ] Remove layered renderer overrides and legacy canonical dependencies on `legalActions`, `legalCells`, `game.ui`, `game.settings`, `game.tutorial`, and `game.selection`.
- [ ] Confirm no save migration loses cards, camp capacity, rewards, evolutions, or current lifecycle position.
- [ ] Run fresh final verification:

```bash
node --test games/hanzi-generals/v2/tests/*.test.js
npm test
python3 -m unittest tests/test_build_site.py -v
python3 scripts/build_site.py
npm run playtest:hanzi-v2
```

Expected: zero failures, `SITE_VERIFY_OK`, and both playtest reports contain `bugs: []` and `runtimeErrors: []`.

- [ ] Review the complete diff for unrelated changes, secret exposure, Classic regressions, save-data loss, and incomplete documentation.
- [ ] Update Notion SOT with task status, exact commits, PR, verification evidence, residual risks, and manual mobile checks.
- [ ] Mark the PR ready only after the entire branch meets the release gate.
- [ ] Commit with `refactor(hanzi-v2): complete architecture stabilization`.

---

## Review and Merge Policy

- Maintain one long-lived stabilization branch and draft PR for integration visibility.
- Each task ends in its own commit and architecture review checkpoint.
- Do not merge partial T1–T9 into `main`; merge the integration PR only after T10 full verification, unless a proven low-risk independent slice needs an emergency split.
- Any newly discovered player-facing rule change, irreversible save decision, or scope expansion becomes a Decision Gate for Ken.

## Plan Self-review

- Spec coverage: UI ownership, selectors, ViewModel, controller boundary, state-machine reduction, battle lifecycle, expedition camp, canonical reroll, battle report, reward UI, migrations, integration, testing, merge and release are each mapped to T1–T10.
- Placeholder scan: no `TBD`, `TODO`, or unspecified implementation step remains.
- Interface consistency: `game/profile/ui`, selector names, ViewModel shape, controller result envelope, reducer envelope, battle-report status, and migration result are consistent across tasks.
