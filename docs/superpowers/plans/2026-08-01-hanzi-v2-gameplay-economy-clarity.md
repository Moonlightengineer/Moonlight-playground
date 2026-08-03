# Hanzi Generals v2 Gameplay Economy & Clarity Implementation Plan

**Goal:** Implement the approved Gameplay Economy & Clarity SOT on top of the merged architecture-stabilisation baseline, ending at one complete browser-verifiable First Playable checkpoint ready for Ken's physical-phone playtest.

**Baseline:** `main` commit `c62d41af52c5371a6f44c90cf4b75a2b92d02872`; Architecture Stabilization T1–T10 complete; 268 JavaScript tests and browser gates green.

**Architecture:** Preserve the existing `{ game, profile, ui }` runtime split, controller boundary, canonical selectors, single panel ownership, battle-report lifecycle, sequential save migrations, reward-flow authority, and card ownership invariant. Extend existing modules rather than reintroducing state-machine or renderer duplication.

**Tech stack:** Native ES modules, Node `node:test`, browser DOM/localStorage, Python static build verification, Playwright iPhone browser playthrough.

## Global gates

- Runtime scope is `games/hanzi-generals/v2/`, focused test/browser scripts, and necessary CI/build docs only.
- Classic `games/hanzi-generals/` must remain byte/behaviour compatible.
- Write a failing behavioural test before every production change; record RED and GREEN evidence in the PR.
- Every successful domain transition and migrated snapshot must pass `validateCardOwnership()`.
- UI reads ViewModels/selectors only; no panel may mutate game state or decide deck/reward/combat legality.
- Save migration must preserve recoverability and must never overwrite an invalid original snapshot.
- First Playable cannot merge with a failed required workflow, unresolved review thread, or unresolved P0–P2 finding.

---

## Slice 1 — Canonical 40-card network and playable base roster

**Files:**
- Modify `games/hanzi-generals/v2/data/recipes.js`
- Modify `games/hanzi-generals/v2/data/generals.js`
- Modify `games/hanzi-generals/v2/src/core/data-validator.js`
- Modify `games/hanzi-generals/v2/tests/data-validator.test.js`
- Add focused content-contract tests if separation improves readability

**Contract:**
- Fixed starting deck contains exactly 40 cards.
- Troop core counts: `兵×7, 盾×3, 槍×3, 弓×3, 騎×3, 軍×1, 醫×1, 斥×1, 候×1, 謀×1, 士×1`.
- Shared general network counts: `張×2, 任×2, 平×2, 飛×1, 峻×1, 關×1, 羽×1, 王×1, 趙×1, 雲×1, 凌×1, 統×1`.
- Public troop recipes: 盾兵、槍兵、弓兵、騎兵、軍醫、斥候、謀士.
- Starting general recipes: 張飛、張任、任峻、關羽、關平、王平、趙雲、趙統、凌統.
- Base unit records include tier, role, complete combat numbers, player-facing ability/range copy, and existing supported targeting patterns.
- 黃忠、呂布／呂蒙、諸葛亮 remain outside the starting 40 and are reserved for reward packs.

**TDD:**
1. Add failing exact-count, exact-recipe, no-orphan-symbol, tier/description and data-validator tests.
2. Confirm failure against the current 12-card/eight-recipe data.
3. Implement the minimum data/validation changes.
4. Run focused test then full JavaScript suite.

---

## Slice 2 — New-run/save migration and per-battle deck reset

**Files:**
- Modify `src/expedition/expedition.js`
- Modify `src/battle/battle-lifecycle.js`
- Modify `src/deck/deck.js` and/or a focused deck-cycle module
- Modify `src/storage/migrations.js`
- Add migration, expedition and ownership tests

**Contract:**
- A new run creates all 40 unique card IDs and a matching registry.
- Deck/growth persists across six battles.
- At battle end, surviving battlefield units are dismantled back to their source cards; battlefield and deployed records reset without losing cards.
- Next battle forms one draw pool from the previous draw pile, discard pile and unused hand; camp remains its independent expedition-wide owner zone.
- Existing valid saves migrate deterministically; incompatible old content snapshots fail recoverably rather than silently corrupting ownership.

---

## Slice 3 — Exposure, retain/reroll and deck-state visibility

**Files:**
- Modify `src/deck/reroll-policy.js`
- Modify deck selectors and ViewModels
- Modify `src/ui/panels/run-status-panel.js`, `hand-panel.js`, and/or `camp-panel.js`
- Modify semantic interactions only where required
- Add selector, policy, ViewModel and UI-contract tests

**Contract:**
- Hand size remains five.
- During preparation the player may lock/unlock/change up to two current hand cards.
- Reroll keeps canonical `deck.retained`, discards every non-retained hand card, consumes one available reroll, and draws back to hand size.
- Retention survives rerolls and phase changes within the battle, then clears at the approved battle boundary.
- UI always shows draw pile, discard pile, hand, camp, deployed and total card counts from canonical zones; counts reconcile with the registry and ownership invariant.

---

## Slice 4 — Assembly clarity, codex and battlefield reset

**Files:**
- Extend recipe/unit selectors and ViewModels
- Modify `details-panel.js`, `battle-stage-panel.js`, Help/Codex presentation and CSS as required
- Add focused assembly/codex/browser contracts

**Contract:**
- Troop recipes are fully visible from the start.
- Starting generals are semi-public through constituent-character clues until discovered; discovered recipes persist in profile/local data.
- Rare-pack generals appear as locked silhouettes until unlocked/discovered.
- Unit details use Chinese player-facing range, attack method, tier and actual ability effects rather than internal values.
- Cards cannot be dismantled out of a formed unit during a battle; legal movement/empty-cell behaviour remains controlled by existing command legality.

---

## Slice 5 — Five concrete reward choices and expedition economy

**Files:**
- Modify `data/rewards.js`
- Modify `src/reward/reward-flow.js` and expedition reward helpers
- Modify reward selectors/ViewModels/panel copy
- Add reward eligibility, target, migration and browser tests

**Contract:**
- Each of the five post-battle rewards is a direct three-choice offer; no intermediate abstract reward-type selection.
- Offers can concretely modify the deck, remove cards, recruit/unlock generals or packs, evolve eligible generals, specialise troops, increase camp/reroll capacity, repair/expand only where useful, and remain valid for the current state.
- Add/remove rewards create a meaningful six-battle economy and always rebuild registry/ownership safely.
- Reward UI shows exact result, target, tactic and why an unavailable option is disabled.

---

## Slice 6 — Battlefield information, combat operation and result hierarchy

**Files:**
- Modify combat/battle selectors and ViewModels
- Modify `battle-stage-panel.js`, `combat-orders-panel.js`, `primary-panel.js`, combat feedback and CSS
- Add pacing, readability, result and browser tests

**Contract:**
- Three lanes/nine cells communicate front/middle/rear position, legal range and current targets clearly.
- Enemy intent and wall threat are readable without opening internal details.
- Combat speed preserves event comprehension; reduced-motion remains equivalent.
- Existing limited orders remain meaningful and legal; any SOT-approved new mid-combat decision uses the controller/command boundary.
- Phase complete, battle victory/defeat and expedition success/failure are visually and semantically distinct.

---

## Slice 7 — First Playable integration and merge gate

**Files:**
- Extend Playwright scripts and machine-readable reports
- Update static/build tests only where public runtime changes require it
- Update player Help/changelog and Notion implementation record after verification

**Required evidence:**
1. Focused tests for every new module/contract.
2. Full `npm test` green.
3. Build regression and static-site verification green.
4. iPhone browser run completes the approved first-playable route with no runtime errors, ownership errors, impossible reward, lost card, stale save or horizontal overflow.
5. Save/reload works in preparation, combat, battle report and reward states.
6. Classic remains isolated.
7. Exact-head self-review covers SOT scope, gameplay regressions, state/data consistency, security/privacy and unresolved review threads.
8. No unresolved P0–P2; squash merge with expected head SHA.
9. Update the Project Hub and Gameplay SOT with merged commit, workflow evidence and a short physical-phone playtest checklist for Ken.
