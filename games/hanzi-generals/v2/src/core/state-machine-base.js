import { GENERAL_BY_ID } from '../../data/generals.js';
import { TUNING } from '../../data/tuning.js';
import {
  confirmAssembly,
  placeBoardCard,
  returnBoardCard,
} from '../deck/assembly.js';
import { drawToHand } from '../deck/deck.js';
import { applyOrder } from '../combat/orders.js';
import { createExpedition, ROUTES } from '../expedition/expedition.js';
import { gameEvent } from './events.js';

const ALLOWED = Object.freeze({
  'expedition-map': new Set(['CHOOSE_ROUTE', 'START_BATTLE', 'RESET_RUN']),
  configuration: new Set([
    'DRAW_CARDS', 'SELECT_CARD', 'MOVE_CARD_TO_CAMP', 'RETURN_CAMP_CARD',
    'RETURN_BOARD_CARD', 'ASSEMBLE', 'RETAIN_CARDS', 'REROLL',
    'START_PHASE', 'RESET_RUN',
  ]),
  combat: new Set(['PAUSE', 'RESUME', 'SET_SPEED', 'ISSUE_ORDER', 'STEP_COMBAT', 'RESET_RUN']),
  'battle-report': new Set(['CONTINUE_AFTER_REPORT', 'RESET_RUN']),
  reward: new Set(['CHOOSE_REWARD', 'RESET_RUN']),
  victory: new Set(['START_NEW_RUN']),
  defeat: new Set(['START_NEW_RUN']),
  error: new Set(['RESET_SAVE', 'START_NEW_RUN']),
});

function success(state, events = []) {
  return { ok: true, state, events };
}

function failure(game, code, message) {
  return { ok: false, state: game, events: [], error: { code, message } };
}

function drawCards(game) {
  const result = drawToHand(game.deck, TUNING.handSize, game.rng);
  return success({
    ...game,
    deck: result.deck,
    rng: result.rng,
    legalActions: [
      'SELECT_CARD', 'MOVE_CARD_TO_CAMP', 'RETURN_CAMP_CARD',
      'RETURN_BOARD_CARD', 'ASSEMBLE', 'RETAIN_CARDS', 'REROLL', 'START_PHASE',
    ],
  }, [gameEvent('CARDS_DRAWN', { count: result.deck.hand.length })]);
}

function toggleCardSelection(game, cardId) {
  const exists = game.deck.hand.some((card) => card.id === cardId)
    || game.camp.cardIds.includes(cardId);
  if (!exists) return failure(game, 'MISSING_CARD', '字牌已經唔喺可選位置。');
  const selected = new Set(game.selection?.cardIds ?? []);
  if (selected.has(cardId)) selected.delete(cardId);
  else {
    if (selected.size >= 3) return failure(game, 'SELECTION_LIMIT', '一次最多選三張字牌。');
    selected.add(cardId);
  }
  return success({ ...game, selection: { cardIds: [...selected] } });
}

function recordRecruitment(game, result) {
  if (!result.ok) return result;
  const assembled = result.events.find(({ type }) => type === 'UNIT_ASSEMBLED');
  const definitionId = assembled?.payload?.definitionId;
  if (GENERAL_BY_ID[definitionId]?.kind !== 'general') return result;
  return {
    ...result,
    state: {
      ...result.state,
      recruitedGeneralIds: [...new Set([...(game.recruitedGeneralIds ?? []), definitionId])],
    },
  };
}

function assemble(game, action) {
  const selected = action.source?.cardIds ?? game.selection?.cardIds ?? [];
  if (selected.length === 1 && game.deck.hand.some(({ id }) => id === selected[0])) {
    const result = placeBoardCard(game, selected[0], action.target);
    return result.ok
      ? success({ ...result.state, selection: { cardIds: [] } }, result.events)
      : result;
  }
  const source = action.source ?? {
    type: selected.every((id) => game.camp.cardIds.includes(id)) ? 'camp' : 'hand',
    cardIds: selected,
  };
  const result = recordRecruitment(game, confirmAssembly(game, source, action.target));
  return result.ok
    ? success({ ...result.state, selection: { cardIds: [] } }, result.events)
    : result;
}

export function reduceGame(game, action) {
  if (!action || typeof action.type !== 'string') {
    return failure(game, 'INVALID_ACTION', '操作格式錯誤。');
  }
  if (!ALLOWED[game.status]?.has(action.type)) {
    return failure(game, 'ILLEGAL_ACTION_FOR_STATE', '而家唔可以執行呢個操作。');
  }

  switch (action.type) {
    case 'RESET_RUN':
    case 'START_NEW_RUN':
    case 'RESET_SAVE':
      return success(createExpedition(action.seed ?? game.seed ?? Date.now()));
    case 'CHOOSE_ROUTE':
      if (!['safe', 'danger'].includes(action.route)) {
        return failure(game, 'INVALID_ROUTE', '請揀安全或危險路線。');
      }
      return success({
        ...game,
        route: action.route,
        awaitingRoute: false,
        nextStageId: ROUTES[action.route][game.completedBattleIds.length],
        legalActions: ['START_BATTLE'],
      }, [gameEvent('ROUTE_CHOSEN', { route: action.route })]);
    case 'DRAW_CARDS':
      return drawCards(game);
    case 'SELECT_CARD':
      return toggleCardSelection(game, action.cardId);
    case 'RETURN_BOARD_CARD':
      return returnBoardCard(game, action.target);
    case 'ASSEMBLE':
      return assemble(game, action);
    case 'ISSUE_ORDER': {
      const result = applyOrder(game.combat, action.order, { unitsById: GENERAL_BY_ID });
      return result.ok
        ? success({ ...game, combat: result.state }, result.events)
        : { ...result, state: game };
    }
    case 'PAUSE':
      return success({ ...game, combat: { ...game.combat, paused: true } });
    case 'RESUME':
      return success({ ...game, combat: { ...game.combat, paused: false } });
    case 'SET_SPEED':
      if (![1, 2].includes(action.speed)) {
        return failure(game, 'INVALID_SPEED', '速度只支援 1× 或 2×。');
      }
      return success({ ...game, settings: { ...game.settings, speed: action.speed } });
    default:
      return failure(game, 'UNKNOWN_ACTION', '操作已由 canonical lifecycle module 負責。');
  }
}

export { ALLOWED };
