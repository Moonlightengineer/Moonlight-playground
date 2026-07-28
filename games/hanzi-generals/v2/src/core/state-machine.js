import { GENERAL_BY_ID } from '../../data/generals.js';
import { REWARDS } from '../../data/rewards.js';
import { TUNING } from '../../data/tuning.js';
import {
  startBattle,
  startPhase,
  stepBattleCombat,
} from '../battle/battle-lifecycle.js';
import { rerollRetainedHand, setRetainedCards } from '../deck/reroll-policy.js';
import {
  moveHandCardToCamp,
  normalizeLegacyCampBonus,
  returnCampCardToHand,
} from '../expedition/camp-lifecycle.js';
import { eligibleEvolutionGenerals } from '../expedition/evolution-eligibility.js';
import { reduceGame as reduceBaseGame, ALLOWED } from './state-machine-base.js';

const SAFE_REWARD_FALLBACKS = Object.freeze([
  'extra-reroll',
  'extra-camp',
  'repair-wall',
  'fire-arrows',
  'first-aid',
]);

function recordAssembledGenerals(state, events) {
  const recruited = new Set(state.recruitedGeneralIds ?? []);
  for (const event of events ?? []) {
    if (event.type !== 'UNIT_ASSEMBLED') continue;
    const generalId = event.payload?.definitionId;
    if (GENERAL_BY_ID[generalId]?.kind === 'general') recruited.add(generalId);
  }
  return { ...state, recruitedGeneralIds: [...recruited] };
}

function normalizeEvolutionRewards(state) {
  if (state.status !== 'reward') return state;
  if (eligibleEvolutionGenerals(state).length) return state;

  const choices = (state.rewardChoices ?? []).filter(({ id }) => id !== 'evolve-general');
  const chosen = new Set(choices.map(({ id }) => id));
  for (const rewardId of SAFE_REWARD_FALLBACKS) {
    if (choices.length >= 3) break;
    if (chosen.has(rewardId)) continue;
    const reward = REWARDS.find(({ id }) => id === rewardId);
    if (!reward) continue;
    choices.push(reward);
    chosen.add(rewardId);
  }
  return { ...state, rewardChoices: choices.slice(0, 3) };
}

export function normalizeGameState(state) {
  if (!state || typeof state !== 'object') return state;
  const migrated = normalizeLegacyCampBonus({
    ...state,
    recruitedGeneralIds: [...new Set(state.recruitedGeneralIds ?? [])],
    rewardHistory: [...(state.rewardHistory ?? [])],
    evolutions: { ...(state.evolutions ?? {}) },
  });
  return normalizeEvolutionRewards(migrated);
}

export function finalizeGameResult(result) {
  if (!result.ok) return result;
  const recruited = recordAssembledGenerals(result.state, result.events);
  return { ...result, state: normalizeGameState(recruited) };
}

function canonicalDeckPolicyResult(game, action) {
  if (!ALLOWED[game.status]?.has(action.type)) return null;
  try {
    if (action.type === 'RETAIN_CARDS') {
      return {
        ok: true,
        state: { ...game, deck: setRetainedCards(game.deck, action.cardIds ?? []) },
        events: [],
      };
    }
    if (action.type === 'REROLL') {
      const result = rerollRetainedHand(game.deck, game.rng, TUNING.handSize);
      return {
        ok: true,
        state: {
          ...game,
          deck: result.deck,
          rng: result.rng,
          selection: { cardIds: [] },
        },
        events: [],
      };
    }
  } catch (error) {
    return {
      ok: false,
      state: game,
      events: [],
      error: {
        code: action.type === 'REROLL' ? 'REROLL_UNAVAILABLE' : 'INVALID_RETAIN',
        message: error.message,
      },
    };
  }
  return null;
}

function canonicalCampPolicyResult(game, action) {
  if (!ALLOWED[game.status]?.has(action.type)) return null;
  if (action.type === 'MOVE_CARD_TO_CAMP') return moveHandCardToCamp(game, action.cardId);
  if (action.type === 'RETURN_CAMP_CARD') return returnCampCardToHand(game, action.cardId);
  return null;
}

function canonicalBattlePolicyResult(game, action) {
  if (!ALLOWED[game.status]?.has(action.type)) return null;
  if (action.type === 'START_BATTLE') return startBattle(game);
  if (action.type === 'START_PHASE') return startPhase(game);
  if (action.type === 'STEP_COMBAT') return stepBattleCombat(game);
  return null;
}

function applyCampRewardBoundary(action, result) {
  if (!result.ok) return result;
  if (action.type === 'CHOOSE_REWARD' && action.rewardId === 'extra-camp') {
    return { ...result, state: normalizeLegacyCampBonus(result.state) };
  }
  return result;
}

export function reduceGame(game, action) {
  const normalized = normalizeGameState(game);
  const canonical = action && ['RETAIN_CARDS', 'REROLL'].includes(action.type)
    ? canonicalDeckPolicyResult(normalized, action)
    : action && ['MOVE_CARD_TO_CAMP', 'RETURN_CAMP_CARD'].includes(action.type)
      ? canonicalCampPolicyResult(normalized, action)
      : action && ['START_BATTLE', 'START_PHASE', 'STEP_COMBAT'].includes(action.type)
        ? canonicalBattlePolicyResult(normalized, action)
        : null;
  const baseResult = canonical ?? reduceBaseGame(normalized, action);
  const result = action ? applyCampRewardBoundary(action, baseResult) : baseResult;
  if (!result.ok) return { ...result, state: game };
  return finalizeGameResult(result);
}

export { ALLOWED };
