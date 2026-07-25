# 字陣無雙 v2｜Phase A Playtest Readiness Design

Date: 2026-07-25
Status: Approved design baseline
Scope: v2 release-readiness only

## 1. Goal

Phase A removes the usability problems that currently prevent reliable player testing and v2 release validation. It does not redesign the whole interface, expand the campaign, rebalance the full game, or introduce backend services.

The phase is complete when a mobile player can understand reward choices, follow attacks, find concise rules help, and reliably restart either the current expedition or the entire local experience.

## 2. Scope boundaries

### Included

- Clear explanations for reward and upgrade choices.
- A lightweight combat feedback system showing attacker, target, damage, and defeat.
- A dedicated help surface plus short contextual in-game guidance.
- Two restart modes: expedition reset and complete local-data reset with reload.
- Automated, browser, mobile-layout, and manual release validation.
- Public Playground publication after the v2.0 Stable gate passes.

### Excluded

- Full UI redesign.
- New campaign stages, units, enemies, or progression systems.
- Broad combat balance changes except fixes required to make the approved onboarding path functional.
- Backend, account, cloud-save, analytics, or multiplayer features.
- Internal project-management material in the public repository.

## 3. Reward and upgrade explanations

Every selectable reward or upgrade must expose the following information before confirmation:

1. Display name.
2. One-sentence purpose.
3. Exact numerical or rule change.
4. Short tactical use case.
5. Optional contextual note when it can be derived deterministically from current game state.

Descriptions must be stored with the corresponding game data rather than assembled from UI-only hard-coded strings. The renderer consumes one canonical description model so reward cards, details panels, tests, and future help content cannot drift.

Suggested data shape:

```js
{
  summary: 'Strengthens Huang Zhong as a single-lane damage dealer.',
  effect: 'Damage +2.',
  useCase: 'Best when one lane needs reliable ranged pressure.'
}
```

The mobile card initially shows the name, summary, and exact effect. Tactical detail may appear in an expandable details area or existing details panel. A player must not need to open the full help page to understand a choice.

## 4. Combat feedback system

### 4.1 Event-driven presentation

Combat presentation must consume existing combat events instead of inferring attacks from rendered state changes. Each relevant event must contain enough identifiers and values to render feedback deterministically.

Minimum supported events:

- `UNIT_HIT`: attacker ID, target ID, damage.
- `FRIENDLY_DAMAGED`: enemy ID, target unit ID, damage.
- `WALL_DAMAGED`: enemy ID, lane, damage.
- `UNIT_DEFEATED`: defeated unit ID.
- Enemy defeat must become an explicit event if the current engine only removes enemies silently.
- Order and tactic events continue to provide their existing feedback.

### 4.2 Visual sequence

For each attack:

1. Highlight the attacker briefly.
2. Draw a short-lived path or projectile cue from attacker to target.
3. Apply a hit response to the target.
4. Show a floating damage number near the target.
5. Show a distinct defeat transition when HP reaches zero.

Effects must be queued or grouped safely when several units attack during the same combat step. They must not block state progression, pointer input, pause, or speed controls.

### 4.3 Mobile and accessibility rules

- Effects must remain legible at 320–430 CSS px widths.
- Effects cannot increase document width or create persistent page height.
- Essential information cannot depend only on color.
- Reduced-motion mode removes travel, pulse, and scale animation while preserving attacker/target outlines, damage labels, and event text.
- Effects are presentation-only: a failed animation must never interrupt combat.

## 5. Help and contextual guidance

### 5.1 Full-screen in-app help panel

Add a full-screen in-app help panel reachable from the main game controls and settings area. Opening it pauses active combat, preserves the complete game state, and provides one clear close/back action that returns to the exact previous game screen. Closing the panel resumes combat only when it was running before the panel opened.

Required sections:

- Objective and expedition flow.
- Drawing and retaining cards.
- Character assembly.
- Board rows, lanes, range, and attack patterns.
- Camp behavior.
- Combat timing and speed.
- Orders and tactics.
- Rewards, upgrades, and evolution.
- Saving, restarting, and testing the latest version.

Content should be concise, scan-friendly, and written for a player rather than a developer.

### 5.2 In-game guidance

In-game guidance remains minimal:

- One short message when a mechanic is first encountered.
- Current order-selection instruction while selecting targets.
- Unit details accessible by tapping a unit.
- Reward effects visible directly on choices.
- No long blocking tutorial modal during normal combat.

Tutorial completion state is independent from expedition progress so the two restart modes can behave differently.

## 6. Restart and latest-version validation

Expose two destructive actions in the help/settings surface.

### 6.1 Restart expedition

Behavior:

- Clear current expedition progress and game snapshot.
- Preserve tutorial-completion state.
- Preserve accessibility and speed settings.
- Create a new expedition using the currently loaded runtime.
- Require a concise confirmation because progress is lost.

### 6.2 Clear all data and test latest version

Behavior:

- Clear all game snapshots, tutorial state, settings, and legacy storage keys owned by Hanzi Generals v2.
- Require a stronger confirmation that lists what will be removed.
- Reload the page after clearing data.
- Reload with a cache-busting query value so the browser requests the currently deployed static entry point rather than simply continuing the old in-memory runtime.
- Do not clear unrelated Moonlight Playground or Classic-game storage.

The storage module owns the list of v2 keys and exposes one canonical clearing operation. UI code must not duplicate storage-key knowledge.

## 7. Architecture and component boundaries

### Game data

Owns reward and upgrade explanation fields. It contains no DOM behavior.

### Combat engine

Owns combat truth and complete event payloads. It contains no animation timing or DOM references.

### Combat feedback presenter

Owns temporary visual feedback, effect queueing, reduced-motion behavior, and cleanup. It consumes events and rendered entity anchors but cannot mutate combat state.

### Help content and renderer

Owns player-facing rules content, full-screen panel rendering, pause/resume restoration, and navigation into and out of help. It reads game definitions where useful but does not duplicate combat rules.

### Storage/reset service

Owns key enumeration, expedition-only reset, complete v2 reset, and reload preparation.

### Application controller

Coordinates actions, rendering, event presentation, saving, help-panel lifecycle, and restart flow. Destructive confirmation text remains close to the corresponding action.

## 8. Error handling

- Missing reward-description fields fail data validation and tests before release.
- Missing attacker or target DOM anchors skip the visual effect and retain text feedback; combat continues.
- Temporary effect nodes must always be cleaned up by timeout and render-reset cleanup.
- Storage removal failures show an actionable error and do not claim success.
- Reload occurs only after complete-reset storage operations finish successfully.
- Help remains usable even when no save exists.
- Help close restores the prior pause state even when rendering or effect cleanup fails.

## 9. Testing strategy

### Unit and data tests

- Every public reward and upgrade has complete explanation fields.
- Combat events contain required source, target, and damage data.
- Enemy defeats emit explicit defeat evidence where applicable.
- Expedition reset preserves tutorial/settings but removes run state.
- Complete reset removes every v2-owned key and leaves unrelated keys untouched.

### UI contract tests

- Help entry and required sections exist.
- Opening help pauses combat and closing it restores the previous running/paused state.
- Reward choices render exact effects without requiring expansion.
- Combat feedback layer is non-interactive and cannot cause overflow.
- Reduced-motion selectors preserve non-motion feedback.
- Both restart actions and confirmation paths exist.

### Browser regression

At 390×844 and one narrow-width profile:

- Open help during active combat, verify pause, close it, and restore the previous state without losing the run.
- Inspect a reward/upgrade and confirm its explanation is visible.
- Observe at least one friendly attack and verify attacker, target, and damage feedback.
- Verify effects disappear and controls remain usable.
- Restart expedition and confirm settings/tutorial persistence.
- Seed v2 and unrelated storage, perform complete reset, confirm only v2 data is removed, and verify reload/new onboarding.
- Confirm no horizontal overflow and no runtime errors.

### Manual release validation

A real mobile playthrough must confirm:

- Effects are understandable rather than distracting.
- Help is sufficient without crowding combat.
- Upgrade choices can be understood without external explanation.
- Both reset modes match their labels.
- No P0 or P1 issue remains.

## 10. v2.0 Stable gate

The release may be labelled `v2.0 Stable` and added to the public Playground project list only when:

- All automated suites and Classic regressions pass.
- Browser playthrough and reset regressions pass.
- Real-mobile validation reports no P0/P1 issue.
- Reward and upgrade choices are self-explanatory.
- Attacker, target, damage, and defeat are perceptible.
- Help remains available without degrading the mobile battle layout.
- Both reset modes work exactly as specified.
- Public documentation contains only player-facing and suitable portfolio information.

## 11. Publication result

After the stable gate passes:

- Add the game to the Moonlight Playground public catalogue.
- Present it publicly as a game created end-to-end by ChatGPT, with the initial concept and player feedback supplied by the human project advisor.
- Publish concise player instructions and a public changelog.
- Keep internal planning, detailed decision history, unreleased roadmap, and development governance in Notion.

## 12. Deferred next phase

The next major design cycle begins only after v2 stabilisation. It will cover a full UI/UX redesign, system upgrades, onboarding and balance improvements, richer combat presentation, progression, replayability, and any future backend requirement. None of those items should be smuggled into Phase A.