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
import { createExpedition } from '../expedition/expedition.js';
import { recordBattleEvents } from '../report/battle-report.js';
import { applyRewardChoice } from '../reward/reward-flow.js';
import { reduceGame as reduceBaseGame, ALLOWED } from './state-machine-base.js';

const SAFE_REWARD_FALLBACKS = Object.freeze([
  'extra-reroll',
  'extra-camp',
  'repair-wall',
  'fire-arrows',
  'first-aid',
]);

function success(state, events = []) {
  return { ok: true, state, events };
}

function failure(game, code, message) {
  return { ok: false, state: game, events: [], error: { code, message } };
}

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
    battleReport: state.battleReport ?? null,
    lastBattleReport: state.lastBattleReport ?? null,
    battleMetrics: state.battleMetrics ?? null,
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

function canonicalRewardPolicyResult(game, action) {
  if (game.status !== 'reward' || action.type !== 'CHOOSE_REWARD') return null;
  return applyRewardChoice(
    game,
    action.rewardId,
    action.payload ?? {},
    action.route,
  );
}

function continueAfterReport(game) {
  const report = game.battleReport;
  if (!report) return failure(game, 'MISSING_BATTLE_REPORT', '戰鬥報告不存在。');
  if (report.nextStatus === 'reward') {
    return success({
      ...game,
      status: 'reward',
      battleReport: null,
      lastBattleReport: report,
      legalActions: ['CHOOSE_REWARD'],
    });
  }
  if (report.nextStatus === 'defeat') {
    return success({
      ...game,
      status: 'defeat',
      combat: null,
      battleReport: null,
      lastBattleReport: report,
      legalActions: ['START_NEW_RUN'],
    });
  }
  return failure(game, 'INVALID_BATTLE_REPORT_DESTINATION', '戰鬥報告下一步無效。');
}

function canonicalReportPolicyResult(game, action) {
  if (game.status !== 'battle-report') return null;
  if (['CONTINUE_AFTER_REPORT', 'START_NEW_RUN'].includes(action.type)) {
    return continueAfterReport(game);
  }
  if (action.type === 'RESET_RUN') {
    return success(createExpedition(action.seed ?? game.seed ?? Date.now()));
  }
  return failure(game, 'ILLEGAL_ACTION_FOR_STATE', '而家唔可以執行呢個操作。');
}

function recordOngoingBattleResult(action, result) {
  if (!result.ok || !result.state?.battleMetrics || action.type === 'STEP_COMBAT') return result;
  const state = result.state;
  return {
    ...result,
    state: {
      ...state,
      battleMetrics: recordBattleEvents(
        state.battleMetrics,
        result.events,
        {
          turn: state.combat?.turn ?? 0,
          ordersRemaining: state.combat?.ordersRemaining
            ?? state.currentBattle?.ordersRemaining,
          phaseCount: state.currentBattle?.phaseCount,
        },
      ),
    },
  };
}

export function reduceGame(game, action) {
  const normalized = normalizeGameState(game);
  const canonical = action && normalized.status === 'battle-report'
    ? canonicalReportPolicyResult(normalized, action)
    : action && normalized.status === 'reward' && action.type === 'CHOOSE_REWARD'
      ? canonicalRewardPolicyResult(normalized, action)
      : action && ['RETAIN_CARDS', 'REROLL'].includes(action.type)
        ? canonicalDeckPolicyResult(normalized, action)
        : action && ['MOVE_CARD_TO_CAMP', 'RETURN_CAMP_CARD'].includes(action.type)
          ? canonicalCampPolicyResult(normalized, action)
          : action && ['START_BATTLE', 'START_PHASE', 'STEP_COMBAT'].includes(action.type)
            ? canonicalBattlePolicyResult(normalized, action)
            : null;
  const baseResult = canonical ?? reduceBaseGame(normalized, action);
  const result = action ? recordOngoingBattleResult(action, baseResult) : baseResult;
  if (!result.ok) return { ...result, state: game };
  return finalizeGameResult(result);
}

export { ALLOWED };
