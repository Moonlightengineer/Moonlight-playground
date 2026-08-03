
import { GENERAL_BY_ID } from '../../../data/generals.js';
import { TUNING } from '../../../data/tuning.js';
import { canFocusEnemy } from '../../combat/targeting.js';
import { selectCampState, selectRerollState } from './cards.js';

export function selectOrderTargets(game) {
  const empty = { focusEnemyIds: [], fortifyLanes: [], assaultLanes: [] };
  if (game?.status !== 'combat' || !game.combat?.board) return empty;

  const { combat } = game;
  const focusEnemyIds = [...(combat.enemies ?? [])]
    .filter(({ id, hp }) => hp > 0 && canFocusEnemy(combat, id, GENERAL_BY_ID))
    .sort((a, b) => a.lane - b.lane || a.distance - b.distance || a.id.localeCompare(b.id))
    .map(({ id }) => id);
  const lanes = Array.from({ length: combat.board.size.columns }, (_, lane) => lane);

  return {
    focusEnemyIds,
    fortifyLanes: lanes,
    assaultLanes: [...lanes],
  };
}

function addConfigurationCommands(game, commands) {
  const hand = Array.isArray(game.deck?.hand) ? game.deck.hand : [];
  const drawCount = (game.deck?.drawPile?.length ?? 0) + (game.deck?.discardPile?.length ?? 0);
  const camp = selectCampState(game);
  const selected = game.selection?.cardIds ?? [];
  const boardCards = Object.keys(game.boardCards ?? {});
  const units = Object.keys(game.board?.units ?? {});

  if (drawCount > 0 && hand.length < TUNING.handSize) commands.add('DRAW_CARDS');
  if (hand.length || camp.count) commands.add('SELECT_CARD');
  if (hand.length && !camp.isFull) commands.add('MOVE_CARD_TO_CAMP');
  if (camp.count) commands.add('RETURN_CAMP_CARD');
  if (boardCards.length) commands.add('RETURN_BOARD_CARD');
  if (selected.length) commands.add('ASSEMBLE');
  if (hand.length) commands.add('RETAIN_CARDS');
  if (selectRerollState(game).available) commands.add('REROLL');
  if (units.length) commands.add('START_PHASE');
}

export function selectLegalCommands(game) {
  const commands = new Set();
  if (!game || typeof game !== 'object') return commands;

  switch (game.status) {
    case 'expedition-map':
      if (game.awaitingRoute) commands.add('CHOOSE_ROUTE');
      else if (game.nextStageId) commands.add('START_BATTLE');
      commands.add('RESET_RUN');
      break;
    case 'configuration':
      addConfigurationCommands(game, commands);
      commands.add('RESET_RUN');
      break;
    case 'combat':
      if (game.combat?.paused) commands.add('RESUME');
      else commands.add('PAUSE');
      commands.add('SET_SPEED');
      if (!game.combat?.paused) commands.add('STEP_COMBAT');
      if ((game.combat?.ordersRemaining ?? 0) > 0) commands.add('ISSUE_ORDER');
      commands.add('RESET_RUN');
      break;
    case 'battle-report':
      if (game.battleReport) commands.add('CONTINUE_AFTER_REPORT');
      commands.add('RESET_RUN');
      break;
    case 'reward':
      if ((game.rewardChoices ?? []).length) commands.add('CHOOSE_REWARD');
      commands.add('RESET_RUN');
      break;
    case 'victory':
    case 'defeat':
      commands.add('START_NEW_RUN');
      break;
    case 'error':
      commands.add('RESET_SAVE');
      commands.add('START_NEW_RUN');
      break;
    default:
      break;
  }
  return commands;
}
