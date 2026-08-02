import { GENERAL_BY_ID } from '../../data/generals.js';
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
import { createExpedition } from '../expedition/expedition.js';
import { recordBattleEvents } from '../report/battle-report.js';
import { assessRewardAvailability, applyRewardChoice, generateRewardOffer } from '../reward/reward-flow.js';
import { createRng } from './rng.js';
import { reduceGame as reduceBaseGame, ALLOWED } from './state-machine-base.js';

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

function normalizeOrderDuration(order, legacyField, multiplier, canonical) {
  if (!order || typeof order !== 'object') return null;
  const direct = Number(order.remainingSeconds);
  const legacy = Number(order[legacyField]);
  const remainingSeconds = Number.isFinite(direct) && direct > 0
    ? Math.min(6, Math.ceil(direct))
    : Number.isFinite(legacy) && legacy > 0
      ? Math.min(6, Math.ceil(legacy * multiplier))
      : 6;
  return { ...order, ...canonical, remainingSeconds };
}

function normalizeCombatOrders(combat) {
  if (!combat || typeof combat !== 'object') return combat;
  return {
    ...combat,
    pendingOrders: [],
    fortify: normalizeOrderDuration(
      combat.fortify,
      'remainingEnemyTurns',
      3,
      { damageReduction: 0.35 },
    ),
    assault: normalizeOrderDuration(
      combat.assault,
      'remainingFriendlyTurns',
      2,
      { attackSpeedBonus: 0.3 },
    ),
    focus: normalizeOrderDuration(
      combat.focus,
      'remainingFriendlyTurns',
      2,
      { damageBonus: 0.2 },
    ),
  };
}

function rewardChoicesAreCanonical(state) {
  const choices = state.rewardChoices ?? [];
  return choices.length === 3
    && new Set(choices.map(({ id }) => id)).size === 3
    && choices.every((choice) => (
      choice?.concrete === true
      && choice?.permanent === true
      && assessRewardAvailability(state, choice).available
    ));
}

function normalizeRewardChoices(state) {
  if (state.status !== 'reward' || rewardChoicesAreCanonical(state)) return state;
  const rng = Number.isInteger(state.rng?.state)
    ? state.rng
    : createRng(`reward-normalize:${state.seed ?? state.runId ?? state.completedBattleIds?.length ?? 0}`);
  const generated = generateRewardOffer({ ...state, rng });
  const history = [...(state.rewardOfferHistory ?? [])];
  const lastIndex = history.length - 1;
  if (lastIndex >= 0 && history[lastIndex]?.battleNumber === generated.record.battleNumber) {
    history[lastIndex] = generated.record;
  } else {
    history.push(generated.record);
  }
  return {
    ...state,
    rng: generated.rng,
    rewardChoices: generated.choices,
    rewardOfferHistory: history,
  };
}

export function normalizeGameState(state) {
  if (!state || typeof state !== 'object') return state;
  const migrated = normalizeLegacyCampBonus({
    ...state,
    combat: normalizeCombatOrders(state.combat),
    recruitedGeneralIds: [...new Set(state.recruitedGeneralIds ?? [])],
    rewardHistory: [...(state.rewardHistory ?? [])],
    evolutions: { ...(state.evolutions ?? {}) },
    battleReport: state.battleReport ?? null,
    lastBattleReport: state.lastBattleReport ?? null,
    battleMetrics: state.battleMetrics ?? null,
  });
  return normalizeRewardChoices(migrated);
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
  if (report.nextStatus === 'victory') {
    return success({
      ...game,
      status: 'victory',
      combat: null,
      currentBattle: null,
      currentBattleResult: null,
      nextStageId: null,
      rewardChoices: [],
      battleReport: null,
      lastBattleReport: report,
      legalActions: ['START_NEW_RUN'],
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
  if (action.type === 'CONTINUE_AFTER_REPORT') return continueAfterReport(game);
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
