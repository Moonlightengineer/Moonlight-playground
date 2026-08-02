import { EVOLUTION_BY_ID } from '../../data/evolutions.js';
import { GENERAL_BY_ID } from '../../data/generals.js';
import { REWARD_BY_ID, REWARDS } from '../../data/rewards.js';
import { gameEvent } from '../core/events.js';
import { shuffle } from '../core/rng.js';
import { selectCardZoneIndex } from '../core/selectors/index.js';
import {
  eligibleEvolutionGenerals,
  validateEvolutionSelection,
} from '../expedition/evolution-eligibility.js';
import { advanceExpedition } from '../expedition/expedition.js';
import { applyReward } from '../expedition/rewards.js';

const CARD_TARGET_ZONES = new Set(['drawPile', 'discardPile', 'hand', 'camp']);
const CARD_TARGET_PRIORITY = Object.freeze({ camp: 0, hand: 1, discardPile: 2, drawPile: 3 });
const LEGACY_TARGET_REQUIRED = new Set(['copy-card', 'remove-card', 'evolve-general']);
const CONVERSION_SYMBOLS = Object.freeze(['弓', '騎', '盾', '槍', '兵', '張', '任', '平']);

function success(state, events = []) {
  return { ok: true, state, events };
}

function failure(game, code, message) {
  return { ok: false, state: game, events: [], error: { code, message } };
}

function baseIdOf(reward) {
  return reward?.baseId ?? reward?.id ?? null;
}

function cardTargetCandidates(game) {
  const zones = selectCardZoneIndex(game);
  return [...zones.entries()]
    .map(([cardId, ownerZones]) => {
      const zone = ownerZones.find((item) => CARD_TARGET_ZONES.has(item));
      const card = game.cardsById?.[cardId];
      return zone && card ? { cardId, symbol: card.symbol, zone } : null;
    })
    .filter(Boolean)
    .sort((left, right) => (
      (CARD_TARGET_PRIORITY[left.zone] ?? 99) - (CARD_TARGET_PRIORITY[right.zone] ?? 99)
      || left.cardId.localeCompare(right.cardId)
    ));
}

function resolveReward(rewardOrId) {
  if (typeof rewardOrId === 'string') return REWARD_BY_ID[rewardOrId] ?? null;
  if (!rewardOrId || typeof rewardOrId.id !== 'string') return null;
  return REWARD_BY_ID[rewardOrId.id] ?? rewardOrId;
}

function canonicalCatalogue(catalogue = REWARDS) {
  const result = [];
  const seen = new Set();
  for (const entry of Array.isArray(catalogue) ? catalogue : []) {
    const reward = resolveReward(entry);
    if (!reward || reward.legacy || seen.has(reward.id)) continue;
    seen.add(reward.id);
    result.push(reward);
  }
  return result;
}

function targetToken(value) {
  return String(value).replace(/[^a-zA-Z0-9-]/g, (char) => char.codePointAt(0).toString(16));
}

function concrete(template, idSuffix, overrides) {
  return {
    ...template,
    ...overrides,
    id: `${template.id}:${idSuffix}`,
    baseId: template.id,
    concrete: true,
    permanent: true,
  };
}

function symbolCounts(game) {
  const counts = new Map();
  for (const card of Object.values(game.cardsById ?? {})) {
    counts.set(card.symbol, (counts.get(card.symbol) ?? 0) + 1);
  }
  return counts;
}

export function selectRewardTargets(game, rewardId) {
  if (rewardId === 'copy-card') {
    const seenSymbols = new Set();
    return cardTargetCandidates(game)
      .filter(({ symbol }) => !seenSymbols.has(symbol) && seenSymbols.add(symbol))
      .map((target) => ({ type: 'card', ...target, label: target.symbol }));
  }

  if (rewardId === 'remove-card') {
    const candidates = cardTargetCandidates(game);
    if (candidates.length <= 6) return [];
    return candidates.map((target) => ({
      type: 'card', ...target, label: `${target.symbol}（${target.cardId}）`,
    }));
  }

  if (rewardId === 'evolve-general') {
    return eligibleEvolutionGenerals(game).flatMap((generalId) => {
      const general = GENERAL_BY_ID[generalId];
      return (general?.evolutions ?? [])
        .filter((evolutionId) => EVOLUTION_BY_ID[evolutionId]?.generalId === generalId)
        .map((evolutionId) => {
          const evolution = EVOLUTION_BY_ID[evolutionId];
          return {
            type: 'evolution', generalId, evolutionId,
            generalName: general.name, evolutionName: evolution.name,
            label: `${general.name}・${evolution.name}`,
          };
        });
    });
  }

  return [];
}

function ownerHasCard(game, cardId) {
  return selectCardZoneIndex(game).has(cardId);
}

export function assessRewardAvailability(game, rewardOrId) {
  const reward = resolveReward(rewardOrId) ?? (typeof rewardOrId === 'object' ? rewardOrId : null);
  if (!reward) {
    return { available: false, code: 'UNKNOWN_REWARD', reason: '獎勵資料不存在。', targets: [] };
  }
  const baseId = baseIdOf(reward);

  if (reward.concrete) {
    if (baseId === 'copy-card') {
      const valid = typeof reward.payload?.symbol === 'string' && reward.payload.amount === 2;
      return { available: valid, code: valid ? null : 'REWARD_UNAVAILABLE', reason: valid ? null : '指定臨摹字已失效。', targets: [] };
    }
    if (baseId === 'remove-card') {
      const ids = reward.payload?.cardIds;
      const valid = Array.isArray(ids) && ids.length === 2
        && new Set(ids).size === 2
        && ids.every((id) => ownerHasCard(game, id))
        && Object.keys(game.cardsById ?? {}).length - ids.length >= 6;
      return { available: valid, code: valid ? null : 'REWARD_UNAVAILABLE', reason: valid ? null : '精簡目標已失效。', targets: [] };
    }
    if (baseId === 'convert-cards') {
      const removeIds = reward.payload?.removeCardIds;
      const addSymbols = reward.payload?.addSymbols;
      const valid = Array.isArray(removeIds) && removeIds.length === 2
        && new Set(removeIds).size === 2 && removeIds.every((id) => ownerHasCard(game, id))
        && Array.isArray(addSymbols) && addSymbols.length === 2
        && addSymbols.every((symbol) => typeof symbol === 'string' && symbol);
      return { available: valid, code: valid ? null : 'REWARD_UNAVAILABLE', reason: valid ? null : '改編內容已失效。', targets: [] };
    }
    if (baseId === 'evolve-general') {
      const invalid = validateEvolutionSelection(game, reward.payload ?? {});
      return { available: !invalid, code: invalid?.code ?? null, reason: invalid?.message ?? null, targets: [] };
    }
  }

  if (baseId === 'repair-wall' && !(game.wallHp < game.wallMaxHp)) {
    return { available: false, code: 'REWARD_UNAVAILABLE', reason: '城牆已經滿血，請選擇其他獎勵。', targets: [] };
  }

  if (LEGACY_TARGET_REQUIRED.has(baseId) && !reward.concrete) {
    const targets = selectRewardTargets(game, baseId);
    if (!targets.length) {
      return { available: false, code: 'REWARD_UNAVAILABLE', reason: '目前冇符合資格嘅獎勵目標，請選擇其他獎勵。', targets };
    }
    return { available: true, code: null, reason: null, targets };
  }

  if (reward.type === 'board-expand' && game.boardSizeId !== 'base') {
    return { available: false, code: 'REWARD_UNAVAILABLE', reason: '戰陣已經擴展，請選擇其他獎勵。', targets: [] };
  }

  if (reward.type === 'recipe-pack') {
    const recipeIds = reward.recipeIds ?? [reward.recipeId ?? reward.id.replace('unlock-', '')];
    if (recipeIds.every((recipeId) => (game.unlockedRecipes ?? []).includes(recipeId))) {
      return { available: false, code: 'REWARD_UNAVAILABLE', reason: '呢個武將字包已經解鎖。', targets: [] };
    }
  }

  if (baseId === 'remove-card' || baseId === 'convert-cards') {
    if (cardTargetCandidates(game).length < 8) {
      return { available: false, code: 'REWARD_UNAVAILABLE', reason: '牌庫太薄，不能再精簡。', targets: [] };
    }
  }

  return { available: true, code: null, reason: null, targets: [] };
}

function makeCopyChoice(game, template, rng) {
  const seen = new Set();
  const symbols = cardTargetCandidates(game)
    .map(({ symbol }) => symbol)
    .filter((symbol) => !seen.has(symbol) && seen.add(symbol));
  if (!symbols.length) return { choice: null, rng };
  const shuffled = shuffle(rng, symbols);
  const symbol = shuffled.items[0];
  return {
    choice: concrete(template, targetToken(symbol), {
      name: `臨摹「${symbol}」`,
      payload: { symbol, amount: 2 },
      description: {
        summary: `增加「${symbol}」出現率，強化相關共享配方。`,
        effect: `永久加入「${symbol}」×2。`,
        useCase: '想令主力配方更穩定時選。',
      },
    }),
    rng: shuffled.rng,
  };
}

function makeRemoveChoice(game, template, rng) {
  const candidates = cardTargetCandidates(game);
  if (candidates.length < 8) return { choice: null, rng };
  const counts = symbolCounts(game);
  const ordered = [...candidates].sort((a, b) => (
    (counts.get(b.symbol) ?? 0) - (counts.get(a.symbol) ?? 0)
    || a.cardId.localeCompare(b.cardId)
  ));
  const pool = ordered.slice(0, Math.max(4, Math.ceil(ordered.length / 2)));
  const shuffled = shuffle(rng, pool);
  const chosen = shuffled.items.slice(0, 2);
  if (chosen.length < 2) return { choice: null, rng: shuffled.rng };
  const symbols = chosen.map(({ symbol }) => symbol);
  return {
    choice: concrete(template, chosen.map(({ cardId }) => cardId).join('-'), {
      name: '精簡軍備',
      payload: { cardIds: chosen.map(({ cardId }) => cardId) },
      description: {
        summary: `移除「${symbols.join('」「')}」，令牌庫更集中。`,
        effect: `永久移除 ${symbols.map((symbol) => `${symbol} ×1`).join('、')}。`,
        useCase: '多餘字牌經常阻礙主力配方時選。',
      },
    }),
    rng: shuffled.rng,
  };
}

function makeConversionChoice(game, template, rng) {
  const removal = makeRemoveChoice(game, { ...template, id: 'convert-source' }, rng);
  if (!removal.choice) return { choice: null, rng: removal.rng };
  const removeCardIds = removal.choice.payload.cardIds;
  const counts = symbolCounts(game);
  const targetOrder = [...CONVERSION_SYMBOLS].sort((a, b) => (
    (counts.get(a) ?? 0) - (counts.get(b) ?? 0) || a.localeCompare(b, 'zh-Hant')
  ));
  const targetShuffle = shuffle(removal.rng, targetOrder.slice(0, 5));
  const addSymbols = targetShuffle.items.slice(0, 2);
  const removedSymbols = removeCardIds.map((id) => game.cardsById[id]?.symbol ?? '?');
  return {
    choice: concrete(template, `${removeCardIds.join('-')}-${addSymbols.map(targetToken).join('-')}`, {
      name: `${addSymbols.join('')}改編`,
      payload: { removeCardIds, addSymbols },
      description: {
        summary: `把「${removedSymbols.join('」「')}」改編成「${addSymbols.join('」「')}」。`,
        effect: `永久移除 ${removedSymbols.join('、')}，加入 ${addSymbols.join('、')}；牌庫總數不變。`,
        useCase: '想改變共享字網方向而不增加牌庫厚度時選。',
      },
    }),
    rng: targetShuffle.rng,
  };
}

function makeEvolutionChoice(game, template, rng) {
  const targets = selectRewardTargets(game, 'evolve-general');
  if (!targets.length) return { choice: null, rng };
  const shuffled = shuffle(rng, targets);
  const target = shuffled.items[0];
  const evolution = EVOLUTION_BY_ID[target.evolutionId];
  return {
    choice: concrete(template, `${target.generalId}-${target.evolutionId}`, {
      name: `${target.generalName}｜${target.evolutionName}`,
      payload: { generalId: target.generalId, evolutionId: target.evolutionId },
      description: {
        summary: evolution.summary,
        effect: evolution.effect,
        useCase: `本輪往後每次重新合成${target.generalName}都自動套用。`,
      },
    }),
    rng: shuffled.rng,
  };
}

function concretize(game, template, rng) {
  if (!template || !assessRewardAvailability(game, template).available) return { choice: null, rng };
  if (template.id === 'copy-card') return makeCopyChoice(game, template, rng);
  if (template.id === 'remove-card') return makeRemoveChoice(game, template, rng);
  if (template.id === 'convert-cards') return makeConversionChoice(game, template, rng);
  if (template.id === 'evolve-general') return makeEvolutionChoice(game, template, rng);
  const payload = template.type === 'recipe-pack'
    ? { recipeIds: [...(template.recipeIds ?? [template.recipeId])], symbols: [...(template.symbols ?? [])] }
    : {};
  return {
    choice: concrete(template, 'permanent', { payload }),
    rng,
  };
}

function rarityWeight(rarity, battleNumber) {
  if (rarity === 'rare') {
    if (battleNumber <= 2) return -Infinity;
    if (battleNumber === 3) return 1;
    if (battleNumber === 4) return 2;
    return 3;
  }
  if (rarity === 'uncommon') return battleNumber <= 2 ? 2 : 3;
  return battleNumber <= 2 ? 3 : 2;
}

function rewardMatchesBuild(game, reward) {
  const baseId = baseIdOf(reward);
  if (baseId === 'extra-camp') return (game.camp?.cardIds?.length ?? 0) >= Math.max(1, (game.camp?.capacity ?? 0) - 1);
  if (baseId === 'expand-wing') return game.route === 'danger';
  if (baseId === 'expand-depth') return game.route === 'safe';
  return false;
}

function recentCategories(game) {
  const latest = [...(game.rewardOfferHistory ?? [])].at(-1);
  return new Set(latest?.categories ?? []);
}

function hasRareBeenOffered(game) {
  return (game.rewardOfferHistory ?? []).some(({ rareOffered }) => rareOffered === true);
}

export function generateRewardOffer(game, catalogue = REWARDS, rng = game.rng) {
  const allowed = canonicalCatalogue(catalogue);
  const battleNumber = (game.completedBattleIds?.length ?? 0) + 1;
  let current = rng;
  const candidates = [];
  for (const template of allowed) {
    if (rarityWeight(template.rarity, battleNumber) === -Infinity) continue;
    const built = concretize(game, template, current);
    current = built.rng;
    if (built.choice && assessRewardAvailability(game, built.choice).available) candidates.push(built.choice);
  }

  const shuffled = shuffle(current, candidates);
  current = shuffled.rng;
  const recent = recentCategories(game);
  const ranked = shuffled.items
    .map((choice, index) => ({
      choice,
      index,
      score: rarityWeight(choice.rarity, battleNumber)
        + (rewardMatchesBuild(game, choice) ? 2 : 0)
        - (recent.has(choice.category) ? 1.5 : 0),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ choice }) => choice);

  const pityTriggered = battleNumber === 5 && !hasRareBeenOffered(game);
  if (pityTriggered) {
    const rareIndex = ranked.findIndex(({ rarity }) => rarity === 'rare');
    if (rareIndex > 0) ranked.unshift(...ranked.splice(rareIndex, 1));
  }

  const choices = ranked.slice(0, 3);
  const record = {
    battleNumber,
    choiceIds: choices.map(({ id }) => id),
    baseIds: choices.map(baseIdOf),
    categories: choices.map(({ category }) => category),
    rareOffered: choices.some(({ rarity }) => rarity === 'rare'),
    pityTriggered,
  };
  return { choices, rng: current, record };
}

export function normalizeRewardChoices(
  game,
  choices = game.rewardChoices ?? [],
  catalogue = REWARDS,
  targetCount = 3,
) {
  const allowed = canonicalCatalogue(catalogue);
  const allowedIds = new Set(allowed.map(({ id }) => id));
  const kept = [];
  const seen = new Set();
  for (const choice of Array.isArray(choices) ? choices : []) {
    const baseId = baseIdOf(choice);
    if (!choice?.concrete || !allowedIds.has(baseId) || seen.has(choice.id)) continue;
    if (!assessRewardAvailability(game, choice).available) continue;
    kept.push(choice);
    seen.add(choice.id);
    if (kept.length >= targetCount) return kept;
  }
  const generated = generateRewardOffer(game, allowed, game.rng).choices;
  for (const choice of generated) {
    if (seen.has(choice.id)) continue;
    kept.push(choice);
    seen.add(choice.id);
    if (kept.length >= targetCount) break;
  }
  return kept;
}

export function validateRewardChoice(game, rewardId, payload = {}) {
  const offeredReward = (game.rewardChoices ?? []).find(({ id }) => id === rewardId);
  if (!offeredReward) {
    return { valid: false, error: { code: 'REWARD_NOT_OFFERED', message: '呢個獎勵唔喺目前選項。' } };
  }
  const availability = assessRewardAvailability(game, offeredReward);
  if (!availability.available) {
    return { valid: false, error: { code: availability.code, message: availability.reason } };
  }
  if (offeredReward.concrete) return { valid: true, reward: offeredReward, target: offeredReward.payload ?? null };

  const baseId = baseIdOf(offeredReward);
  if (!LEGACY_TARGET_REQUIRED.has(baseId)) return { valid: true, reward: offeredReward, target: null };
  if (baseId === 'evolve-general') {
    const invalid = validateEvolutionSelection(game, payload);
    if (invalid) return { valid: false, error: invalid };
  }
  if (baseId !== 'evolve-general' && !payload.cardId) {
    return { valid: false, error: { code: 'REWARD_TARGET_REQUIRED', message: '請先明確選擇獎勵目標。' } };
  }
  const target = baseId === 'evolve-general'
    ? availability.targets.find(({ generalId, evolutionId }) => generalId === payload.generalId && evolutionId === payload.evolutionId)
    : availability.targets.find(({ cardId }) => cardId === payload.cardId);
  if (!target) {
    return { valid: false, error: { code: 'REWARD_TARGET_INVALID', message: '所選獎勵目標已失效或不符合資格。' } };
  }
  return { valid: true, reward: offeredReward, target };
}

export function applyRewardChoice(game, rewardId, payload = {}, route) {
  const validation = validateRewardChoice(game, rewardId, payload);
  if (!validation.valid) return failure(game, validation.error.code, validation.error.message);

  const effectivePayload = validation.reward.concrete ? validation.reward.payload ?? {} : payload;
  const rewarded = applyReward(game, validation.reward, effectivePayload);
  if (rewarded === game) return failure(game, 'REWARD_APPLICATION_FAILED', '獎勵未能套用。');

  return success(
    advanceExpedition(rewarded, route),
    [gameEvent('REWARD_CHOSEN', {
      rewardId: validation.reward.id,
      baseId: baseIdOf(validation.reward),
      ...effectivePayload,
    })],
  );
}
