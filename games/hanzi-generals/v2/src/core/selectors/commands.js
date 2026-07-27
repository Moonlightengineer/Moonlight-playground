import { GENERAL_BY_ID } from '../../../data/generals.js';
import { TUNING } from '../../../data/tuning.js';
import { listCells } from '../../board/board.js';
import { canFocusEnemy } from '../../combat/targeting.js';
import { selectCampState, selectRerollState } from './cards.js';

function byId(a, b) {
  return a.id.localeCompare(b.id);
}

function cellDistance(a, b) {
  return Math.abs(a.column - b.column) + Math.abs(a.row - b.row);
}

export function selectOrderTargets(game) {
  const empty = { swapPairs: [], reinforce: [], focusEnemyIds: [], fortifyLanes: [] };
  if (game?.status !== 'combat' || !game.combat?.board) return empty;

  const { combat } = game;
  const board = combat.board;
  const units = Object.values(board.units ?? {}).filter(({ hp }) => hp > 0).sort(byId);
  const swapPairs = [];
  for (let first = 0; first < units.length; first += 1) {
    for (let second = first + 1; second < units.length; second += 1) {
      if (cellDistance(units[first].cell, units[second].cell) === 1) {
        swapPairs.push([units[first].id, units[second].id]);
      }
    }
  }

  const occupied = new Set(units.map(({ cell }) => `${cell.column},${cell.row}`));
  const allCells = listCells(board);
  const reinforce = units.map((unit) => ({
    unitId: unit.id,
    targetCells: allCells.filter((cell) => (
      cellDistance(unit.cell, cell) === 1
      && cell.column !== unit.cell.column
      && !occupied.has(`${cell.column},${cell.row}`)
    )),
  })).filter(({ targetCells }) => targetCells.length > 0);

  const focusEnemyIds = [...(combat.enemies ?? [])]
    .filter(({ id, hp }) => hp > 0 && canFocusEnemy(combat, id, GENERAL_BY_ID))
    .sort((a, b) => a.lane - b.lane || a.distance - b.distance || a.id.localeCompare(b.id))
    .map(({ id }) => id);

  return {
    swapPairs,
    reinforce,
    focusEnemyIds,
    fortifyLanes: Array.from({ length: board.size.columns }, (_, lane) => lane),
  };
}

function isLegacyPreDrawConfiguration(game) {
  return Array.isArray(game.legalActions)
    && game.legalActions.length === 1
    && game.legalActions[0] === 'DRAW_CARDS';
}

function addConfigurationCommands(game, commands) {
  // Until Task 6 introduces an explicit battle lifecycle step, the existing
  // DRAW_CARDS-only marker is the compatibility signal that a new phase has
  // not completed its mandatory draw transition. It is never copied as the
  // general command authority; all ready-state commands below are derived.
  if (isLegacyPreDrawConfiguration(game)) {
    commands.add('DRAW_CARDS');
    return;
  }

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
