from __future__ import annotations

from pathlib import Path
import re
import textwrap

ROOT = Path(__file__).resolve().parents[1]


def target(relative: str) -> Path:
    return ROOT / relative


def read(relative: str) -> str:
    return target(relative).read_text(encoding='utf-8')


def write(relative: str, content: str) -> None:
    target(relative).write_text(content.rstrip() + '\n', encoding='utf-8')


def replace_once(relative: str, old: str, new: str) -> None:
    text = read(relative)
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{relative}: expected one exact match, found {count}')
    write(relative, text.replace(old, new, 1))


def replace_regex(relative: str, pattern: str, replacement: str, *, flags: int = re.S) -> None:
    text = read(relative)
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f'{relative}: expected one regex match, found {count}: {pattern}')
    write(relative, updated)


# The runtime adapter must expose the approved timed-order target set only.
replace_once(
    'games/hanzi-generals/v2/src/ui/runtime-view-model.js',
    """    orders: {
      ...viewModel.orders,
      swapPairs: targets.swapPairs.map((pair) => [...pair]),
      reinforce: targets.reinforce.map(({ unitId, targetCells }) => ({
        unitId,
        targetCells: targetCells.map((cell) => ({ ...cell })),
      })),
      focusEnemyIds: [...targets.focusEnemyIds],
      fortifyLanes: [...targets.fortifyLanes],
    },
""",
    """    orders: {
      ...viewModel.orders,
      focusEnemyIds: [...targets.focusEnemyIds],
      fortifyLanes: [...targets.fortifyLanes],
      assaultLanes: [...targets.assaultLanes],
    },
""",
)

# Real saves carry an RNG, but normalization must remain total for older or
# partially repaired reward snapshots rather than throwing inside shuffle().
state_path = 'games/hanzi-generals/v2/src/core/state-machine.js'
replace_once(
    state_path,
    "import { reduceGame as reduceBaseGame, ALLOWED } from './state-machine-base.js';\n",
    "import { createRng } from './rng.js';\nimport { reduceGame as reduceBaseGame, ALLOWED } from './state-machine-base.js';\n",
)
replace_once(
    state_path,
    """function normalizeRewardChoices(state) {
  if (state.status !== 'reward' || rewardChoicesAreCanonical(state)) return state;
  const generated = generateRewardOffer(state);
""",
    """function normalizeRewardChoices(state) {
  if (state.status !== 'reward' || rewardChoicesAreCanonical(state)) return state;
  const rng = Number.isInteger(state.rng?.state)
    ? state.rng
    : createRng(`reward-normalize:${state.seed ?? state.runId ?? state.completedBattleIds?.length ?? 0}`);
  const generated = generateRewardOffer({ ...state, rng });
""",
)

# The canonical reducer test now supplies a structurally complete legacy state
# while deliberately omitting RNG, so it proves the compatibility guard rather
# than depending on an impossible fragmentary game object.
replace_once(
    'games/hanzi-generals/v2/tests/canonical-state-machine.test.js',
    """  const legacyReward = {
    status: 'reward',
    rewardChoices: [
      { id: 'evolve-general' },
      { id: 'copy-card' },
      { id: 'remove-card' },
    ],
    evolutions: {},
  };
""",
    """  const legacyReward = {
    ...createExpedition('canonical-legacy-reward'),
    status: 'reward',
    rng: undefined,
    rewardChoices: [
      { id: 'evolve-general' },
      { id: 'copy-card' },
      { id: 'remove-card' },
    ],
    evolutions: {},
  };
""",
)

# The follow-up fixture likewise represents an old complete run without RNG.
review_followup_path = 'games/hanzi-generals/v2/tests/review-followup.test.js'
replace_once(
    review_followup_path,
    "import { finalizeGameResult } from '../src/core/state-machine.js';\n",
    "import { finalizeGameResult } from '../src/core/state-machine.js';\nimport { createExpedition } from '../src/expedition/expedition.js';\n",
)
replace_once(
    review_followup_path,
    """    state: {
      status: 'reward',
      recruitedGeneralIds: [],
      evolutions: {},
      rewardChoices: [reward('evolve-general'), reward('fire-arrows'), reward('first-aid')],
    },
""",
    """    state: {
      ...createExpedition('review-followup-legacy-reward'),
      status: 'reward',
      rng: undefined,
      recruitedGeneralIds: [],
      evolutions: {},
      rewardChoices: [reward('evolve-general'), reward('fire-arrows'), reward('first-aid')],
    },
""",
)

# Exercise the real concrete three-choice offer when checking permanent camp
# growth. A one-item legacy offer is intentionally no longer a valid reducer state.
camp_path = 'games/hanzi-generals/v2/tests/camp-lifecycle.test.js'
replace_once(
    camp_path,
    "import { REWARDS } from '../data/rewards.js';\n",
    "import { REWARDS } from '../data/rewards.js';\nimport { generateRewardOffer } from '../src/reward/reward-flow.js';\n",
)
NEW_CAMP_REWARD_TEST = r"""
test('extra-camp reward permanently increases expedition capacity and clears legacy pending bonus', () => {
  const catalogue = REWARDS.filter(({ id }) => [
    'copy-card', 'extra-camp', 'specialize-troop',
  ].includes(id));
  let game = createExpedition('camp-reward');
  const cardId = game.deck.drawPile[0].id;
  game = moveRegistryCardToCamp(game, cardId);
  const offer = generateRewardOffer(game, catalogue, game.rng);
  const reward = offer.choices.find(({ baseId }) => baseId === 'extra-camp');
  assert.ok(reward);
  assert.equal(offer.choices.length, 3);
  game = {
    ...game,
    rng: offer.rng,
    status: 'reward',
    currentBattle: { stageId: 'tutorial', phaseIndex: 2, phaseCount: 3, ordersRemaining: 0 },
    currentBattleResult: 'victory',
    rewardChoices: offer.choices,
    rewardOfferHistory: [offer.record],
    legalActions: ['CHOOSE_REWARD'],
  };
  const beforeCapacity = game.camp.capacity;

  const chosen = reduceGame(game, { type: 'CHOOSE_REWARD', rewardId: reward.id });
  assert.equal(chosen.ok, true);
  assert.equal(chosen.state.camp.capacity, beforeCapacity + 1);
  assert.deepEqual(chosen.state.camp.cardIds, [cardId]);
  assert.equal(chosen.state.temporary.extraCamp, 0);
  assertCardOwnership(chosen.state);

  const started = reduceGame(chosen.state, { type: 'START_BATTLE' });
  assert.equal(started.ok, true);
  assert.equal(started.state.camp.capacity, beforeCapacity + 1);
  assert.deepEqual(started.state.camp.cardIds, [cardId]);
  assertCardOwnership(started.state);
});
"""
replace_regex(
    camp_path,
    r"test\('extra-camp reward permanently increases expedition capacity and clears legacy pending bonus'.*?\n}\);\n\ntest\('starting a new run",
    textwrap.dedent(NEW_CAMP_REWARD_TEST).strip() + "\n\ntest('starting a new run",
)

# Evolution is now a concrete one-click offer. Keep detailed domain validation
# coverage at validateEvolutionSelection(), while the reducer boundary proves
# stale second-step offers are removed before they can be chosen.
review_fixes_path = 'games/hanzi-generals/v2/tests/review-fixes.test.js'
replace_once(
    review_fixes_path,
    "import { createExpedition } from '../src/expedition/expedition.js';\n",
    "import { REWARD_BY_ID } from '../data/rewards.js';\nimport { createExpedition } from '../src/expedition/expedition.js';\nimport { validateEvolutionSelection } from '../src/expedition/evolution-eligibility.js';\n",
)
NEW_EVOLUTION_TESTS = r"""
function concreteReward(baseId, suffix = 'permanent', payload = {}) {
  return {
    ...REWARD_BY_ID[baseId],
    id: `${baseId}:${suffix}`,
    baseId,
    concrete: true,
    permanent: true,
    payload,
  };
}

function evolutionRewardGame(evolutionId = 'divine-shot', overrides = {}) {
  const game = createExpedition('evolution-review');
  const evolution = concreteReward(
    'evolve-general',
    `huang-zhong-${evolutionId}`,
    { generalId: 'huang-zhong', evolutionId },
  );
  return {
    ...game,
    route: 'safe',
    status: 'reward',
    completedBattleIds: ['tutorial', 'shield-line', 'route-safe', 'cavalry-warning'],
    battleIndex: 4,
    currentBattle: {
      stageId: 'elite-mixed',
      phaseIndex: 2,
      phaseCount: 3,
      ordersRemaining: 2,
    },
    currentBattleResult: 'victory',
    rewardChoices: [
      evolution,
      concreteReward('extra-camp'),
      concreteReward('expand-depth'),
    ],
    legalActions: ['CHOOSE_REWARD'],
    recruitedGeneralIds: ['huang-zhong'],
    ...overrides,
  };
}

test('both Huang Zhong evolution branches are accepted as concrete one-click rewards', () => {
  for (const evolutionId of ['divine-shot', 'repeating-crossbow']) {
    const game = evolutionRewardGame(evolutionId);
    const reward = game.rewardChoices[0];
    const result = reduceGame(game, {
      type: 'CHOOSE_REWARD',
      rewardId: reward.id,
    });
    assert.equal(result.ok, true);
    assert.equal(result.state.evolutions['huang-zhong'], evolutionId);
  }
});

test('evolution validation rejects missing choice, un-recruited generals, mismatch, and repeat', () => {
  const game = evolutionRewardGame();
  assert.equal(validateEvolutionSelection(game, {}).code, 'EVOLUTION_SELECTION_REQUIRED');
  assert.equal(validateEvolutionSelection(game, {
    generalId: 'zhao-yun', evolutionId: 'seven-charges',
  }).code, 'GENERAL_NOT_RECRUITED');
  assert.equal(validateEvolutionSelection(game, {
    generalId: 'huang-zhong', evolutionId: 'seven-charges',
  }).code, 'EVOLUTION_MISMATCH');
  assert.equal(validateEvolutionSelection({
    ...game,
    recruitedGeneralIds: ['huang-zhong', 'zhao-yun'],
    evolutions: { 'huang-zhong': 'divine-shot' },
  }, {
    generalId: 'huang-zhong', evolutionId: 'repeating-crossbow',
  }).code, 'GENERAL_ALREADY_EVOLVED');

  const stale = {
    ...game,
    rewardChoices: [{ id: 'evolve-general' }],
  };
  const rejected = reduceGame(stale, {
    type: 'CHOOSE_REWARD',
    rewardId: 'evolve-general',
    payload: { generalId: 'huang-zhong', evolutionId: 'divine-shot' },
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error.code, 'REWARD_NOT_OFFERED');
});
"""
replace_regex(
    review_fixes_path,
    r"function evolutionRewardGame\(overrides = \{}\) \{.*\Z",
    textwrap.dedent(NEW_EVOLUTION_TESTS).strip(),
)

# Keep the lower-level legacy adapter tests, but align the canonical reducer and
# player ViewModel with the approved no-second-target-layer contract.
reward_flow_path = 'games/hanzi-generals/v2/tests/reward-flow.test.js'
replace_once(
    reward_flow_path,
    "import { reduceGame } from '../src/core/state-machine.js';\n",
    "import { normalizeGameState, reduceGame } from '../src/core/state-machine.js';\n",
)
NEW_CANONICAL_REWARD_TEST = r"""
test('canonical reducer replaces legacy target rewards with concrete one-click choices', () => {
  const legacy = rewardState(['copy-card', 'remove-card', 'extra-reroll']);
  const normalized = normalizeGameState(legacy);
  assert.equal(normalized.rewardChoices.length, 3);
  assert.equal(normalized.rewardChoices.every(({ concrete, permanent }) => concrete && permanent), true);

  const stale = reduceGame(legacy, { type: 'CHOOSE_REWARD', rewardId: 'copy-card' });
  assert.equal(stale.ok, false);
  assert.equal(stale.state, legacy);
  assert.equal(stale.error.code, 'REWARD_NOT_OFFERED');

  const selected = normalized.rewardChoices[0];
  const applied = reduceGame(normalized, {
    type: 'CHOOSE_REWARD', rewardId: selected.id,
  });
  assert.equal(applied.ok, true);
});
"""
replace_regex(
    reward_flow_path,
    r"test\('canonical reducer refuses target-required rewards without an explicit target'.*?\n}\);",
    textwrap.dedent(NEW_CANONICAL_REWARD_TEST).strip(),
)
NEW_REWARD_VIEW_TEST = r"""
test('reward ViewModel exposes direct concrete actions without a second target layer', () => {
  const base = rewardState(['copy-card', 'remove-card', 'extra-reroll']);
  const offer = generateRewardOffer(base);
  const game = { ...base, rng: offer.rng, rewardChoices: offer.choices };
  const viewModel = buildAppViewModel(game, { settings: game.settings, tutorial: game.tutorial }, {});

  assert.equal(viewModel.primary.rewards.length, 3);
  for (const reward of viewModel.primary.rewards) {
    assert.equal(reward.action, 'choose-reward');
    assert.equal(reward.data.rewardId, reward.id);
    assert.deepEqual(reward.targetChoices, []);
    assert.equal(reward.disabled, false);
  }
  assert.equal(viewModel.primary.evolution, null);
});
"""
replace_regex(
    reward_flow_path,
    r"test\('reward ViewModel exposes explicit target choices without a guessed top-level card payload'.*?\n}\);",
    textwrap.dedent(NEW_REWARD_VIEW_TEST).strip(),
)

print('HANZI_V2_FOLLOWUP_FIXES_APPLIED')
