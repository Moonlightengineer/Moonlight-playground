import { EVOLUTION_BY_ID } from '../../data/evolutions.js';
import { GENERAL_BY_ID } from '../../data/generals.js';
import { REWARD_BY_ID, REWARDS } from '../../data/rewards.js';
import { gameEvent } from '../core/events.js';
import { shuffle } from '../core/rng.js';
import { selectCardZoneIndex } from '../core/selectors/index.js';
import { normalizeLegacyCampBonus } from '../expedition/camp-lifecycle.js';
import {
  eligibleEvolutionGenerals,
  validateEvolutionSelection,
} from '../expedition/evolution-eligibility.js';
import { advanceExpedition } from '../expedition/expedition.js';
import { applyReward } from '../expedition/rewards.js';

const CARD_TARGET_ZONES = new Set(['drawPile', 'discardPile', 'hand', 'camp']);
const TARGET_REQUIRED = new Set(['copy-card', 'remove-card', 'evolve-general']);
const SAFE_FALLBACKS = Object.freeze([
  'extra-reroll', 'extra-camp', 'repair-wall', 'fire-arrows', 'first-aid',
]);

function success(state, events = []) {
  return { ok: true, state, events };
}

function failure(game, code, message) {
  return { ok: false, state: game, events: [], error: { code, message } };
}

function cardTargetCandidates(game) {
  const zones = selectCardZoneIndex(game);
  return [...zones.entries()]
    .map(([cardId, ownerZones]) => {
      const zone = ownerZones.find((item) => CARD_TARGET_ZONES.has(item));
      const card = game.cardsById?.[cardId];
      return zone && card ? { cardId, symbol: card.symbol, zone } : null;
    })
    .filter(Boolean);
}

function resolveReward(rewardOrId) {
  if (typeof rewardOrId === 'string') return REWARD_BY_ID[rewardOrId] ?? null;
  if (!rewardOrId || typeof rewardOrId.id !== 'string') return null;
  return REWARD_BY_ID[rewardOrId.id] ?? rewardOrId;
}

function canonicalCatalogue(catalogue) {
  const result = [];
  const seen = new Set();
  for (const entry of Array.isArray(catalogue) ? catalogue : []) {
    const reward = resolveReward(entry);
    if (!reward || seen.has(reward.id)) continue;
    seen.add(reward.id);
    result.push(reward);
  }
  return result;
}

export function selectRewardTargets(game, rewardId) {
  if (rewardId === 'copy-card') {
    const seenSymbols = new Set();
    return cardTargetCandidates(game)
      .filter(({ symbol }) => !seenSymbols.has(symbol) && seenSymbols.add(symbol))
      .map((target) => ({
        type: 'card',
        ...target,
        label: target.symbol,
      }));
  }

  if (rewardId === 'remove-card') {
    const candidates = cardTargetCandidates(game);
    if (candidates.length <= 6) return [];
    return candidates.map((target) => ({
      type: 'card',
      ...target,
      label: `${target.symbol}（${target.cardId}）`,
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
            type: 'evolution',
            generalId,
            evolutionId,
            generalName: general.name,
            evolutionName: evolution.name,
            label: `${general.name}・${evolution.name}`,
          };
        });
    });
  }

  return [];
}

export function assessRewardAvailability(game, rewardOrId) {
  const reward = resolveReward(rewardOrId);
  if (!reward) {
    return {
      available: false,
      code: 'UNKNOWN_REWARD',
      reason: '獎勵資料不存在。',
      targets: [],
    };
  }

  if (reward.id === 'repair-wall' && !(game.wallHp < game.wallMaxHp)) {
    return {
      available: false,
      code: 'REWARD_UNAVAILABLE',
      reason: '城牆已經滿血，請選擇其他獎勵。',
      targets: [],
    };
  }

  if (TARGET_REQUIRED.has(reward.id)) {
    const targets = selectRewardTargets(game, reward.id);
    if (!targets.length) {
      return {
        available: false,
        code: 'REWARD_UNAVAILABLE',
        reason: '目前冇符合資格嘅獎勵目標，請選擇其他獎勵。',
        targets,
      };
    }
    return { available: true, code: null, reason: null, targets };
  }

  if (reward.type === 'board-expand' && game.boardSizeId !== 'base') {
    return {
      available: false,
      code: 'REWARD_UNAVAILABLE',
      reason: '戰陣已經擴展，請選擇其他獎勵。',
      targets: [],
    };
  }

  if (reward.type === 'recipe-pack') {
    const recipeId = reward.id.replace('unlock-', '');
    if ((game.unlockedRecipes ?? []).includes(recipeId)) {
      return {
        available: false,
        code: 'REWARD_UNAVAILABLE',
        reason: '呢個武將配方已經解鎖，請選擇其他獎勵。',
        targets: [],
      };
    }
  }

  return { available: true, code: null, reason: null, targets: [] };
}

function rewardMatchesBuild(game, reward) {
  if (reward.id === 'repair-wall') return game.wallHp < game.wallMaxHp * 0.65;
  if (reward.id === 'extra-camp') return cardTargetCandidates(game).length >= 4;
  if (reward.id === 'fire-arrows') return game.route === 'danger';
  if (reward.id === 'unlock-zhang-fei') return game.boardSizeId === 'wing';
  if (reward.id === 'unlock-zhuge-liang') return game.boardSizeId === 'depth';
  return false;
}

function selectChoices(game, orderedCandidates, catalogue, targetCount = 3) {
  const allowed = canonicalCatalogue(catalogue);
  const allowedById = new Map(allowed.map((reward) => [reward.id, reward]));
  const result = [];
  const seen = new Set();
  for (const candidate of orderedCandidates) {
    const reward = resolveReward(candidate);
    const allowedReward = reward ? allowedById.get(reward.id) : null;
    if (!allowedReward || seen.has(allowedReward.id)) continue;
    if (!assessRewardAvailability(game, allowedReward).available) continue;
    result.push(allowedReward);
    seen.add(allowedReward.id);
    if (result.length >= targetCount) break;
  }
  return result;
}

export function normalizeRewardChoices(
  game,
  choices = game.rewardChoices ?? [],
  catalogue = REWARDS,
  targetCount = 3,
) {
  const allowed = canonicalCatalogue(catalogue);
  return selectChoices(game, [...(Array.isArray(choices) ? choices : []), ...allowed], allowed, targetCount);
}

function randomRewardOffer(game, catalogue, rng) {
  const allowed = canonicalCatalogue(catalogue);
  const eligible = allowed.filter((reward) => assessRewardAvailability(game, reward).available);
  const preferred = eligible.filter((reward) => rewardMatchesBuild(game, reward));
  const preferredIds = new Set(preferred.map(({ id }) => id));
  const rest = eligible.filter(({ id }) => !preferredIds.has(id));
  const shuffled = shuffle(rng, rest);
  return {
    choices: selectChoices(game, [...preferred, ...shuffled.items], allowed),
    rng: shuffled.rng,
  };
}

/**
 * Generate an offer strictly within `catalogue`. When fewer than three
 * catalogue entries are currently usable, the returned offer is intentionally
 * shorter rather than silently crossing the caller's progression boundary.
 */
export function generateRewardOffer(game, catalogue = REWARDS, rng = game.rng) {
  const allowed = canonicalCatalogue(catalogue);
  const completedAfterCurrent = (game.completedBattleIds?.length ?? 0) + 1;
  if (completedAfterCurrent === 3) {
    const routeReward = game.route === 'safe' ? 'unlock-zhang-fei' : 'unlock-zhuge-liang';
    const scripted = [routeReward, 'repair-wall', 'remove-card'].map((id) => REWARD_BY_ID[id]);
    return { choices: selectChoices(game, [...scripted, ...allowed], allowed), rng };
  }
  if (completedAfterCurrent === 4 && game.boardSizeId === 'base') {
    const scripted = ['expand-wing', 'expand-depth', 'repair-wall'].map((id) => REWARD_BY_ID[id]);
    return { choices: selectChoices(game, [...scripted, ...allowed], allowed), rng };
  }
  if (completedAfterCurrent === 5) {
    const scripted = ['evolve-general', 'fire-arrows', 'first-aid'].map((id) => REWARD_BY_ID[id]);
    const fallbacks = SAFE_FALLBACKS.map((id) => REWARD_BY_ID[id]);
    return { choices: selectChoices(game, [...scripted, ...fallbacks, ...allowed], allowed), rng };
  }
  return randomRewardOffer(game, allowed, rng);
}

export function validateRewardChoice(game, rewardId, payload = {}) {
  const offered = (game.rewardChoices ?? []).some(({ id }) => id === rewardId);
  if (!offered) {
    return {
      valid: false,
      error: { code: 'REWARD_NOT_OFFERED', message: '呢個獎勵唔喺目前選項。' },
    };
  }

  const reward = REWARD_BY_ID[rewardId] ?? game.rewardChoices.find(({ id }) => id === rewardId);
  const availability = assessRewardAvailability(game, reward);
  if (!availability.available) {
    return {
      valid: false,
      error: { code: availability.code, message: availability.reason },
    };
  }

  if (!TARGET_REQUIRED.has(rewardId)) return { valid: true, target: null };

  if (rewardId === 'evolve-general') {
    const invalid = validateEvolutionSelection(game, payload);
    if (invalid) return { valid: false, error: invalid };
  }

  if (rewardId !== 'evolve-general' && !payload.cardId) {
    return {
      valid: false,
      error: { code: 'REWARD_TARGET_REQUIRED', message: '請先明確選擇獎勵目標。' },
    };
  }

  const target = rewardId === 'evolve-general'
    ? availability.targets.find(({ generalId, evolutionId }) => (
      generalId === payload.generalId && evolutionId === payload.evolutionId
    ))
    : availability.targets.find(({ cardId }) => cardId === payload.cardId);
  if (!target) {
    return {
      valid: false,
      error: { code: 'REWARD_TARGET_INVALID', message: '所選獎勵目標已失效或不符合資格。' },
    };
  }
  return { valid: true, target };
}

export function applyRewardChoice(game, rewardId, payload = {}, route) {
  const validation = validateRewardChoice(game, rewardId, payload);
  if (!validation.valid) {
    return failure(game, validation.error.code, validation.error.message);
  }

  let rewarded = applyReward(game, rewardId, payload);
  if (rewardId === 'extra-camp') rewarded = normalizeLegacyCampBonus(rewarded);
  if (rewarded === game) {
    return failure(game, 'REWARD_APPLICATION_FAILED', '獎勵未能套用。');
  }

  return success(
    advanceExpedition(rewarded, route),
    [gameEvent('REWARD_CHOSEN', { rewardId, ...payload })],
  );
}
