import { GENERAL_BY_ID } from '../../data/generals.js';
import { ENEMY_BY_ID } from '../../data/enemies.js';
import { createBoard, placeUnit } from '../../src/board/board.js';
import { createCombatState } from '../../src/combat/combat-engine.js';
import { createExpedition } from '../../src/expedition/expedition.js';

export function makeCard(id, symbol, overrides = {}) {
  return { id, symbol, locked: false, ...overrides };
}

export function makeUnit(definitionId, overrides = {}) {
  const definition = GENERAL_BY_ID[definitionId];
  if (!definition) throw new Error(`Unknown unit fixture: ${definitionId}`);
  return {
    id: overrides.id ?? `unit-${definitionId}`,
    definitionId,
    kind: definition.kind,
    hp: definition.maxHp,
    maxHp: definition.maxHp,
    cooldown: 0,
    evolution: null,
    statuses: [],
    ...overrides,
  };
}

export function makeEnemy(definitionId, overrides = {}) {
  const definition = ENEMY_BY_ID[definitionId];
  if (!definition) throw new Error(`Unknown enemy fixture: ${definitionId}`);
  return {
    id: overrides.id ?? `enemy-${definitionId}`,
    definitionId,
    lane: 1,
    distance: 3,
    hp: definition.maxHp,
    maxHp: definition.maxHp,
    cooldown: 0,
    chargeIn: definitionId === 'heavy-cavalry' ? 3 : undefined,
    phase: 1,
    phaseTwoTriggered: false,
    statuses: [],
    ...overrides,
  };
}

export function makeBoard(sizeId = 'base', units = []) {
  let board = createBoard(sizeId);
  for (const unit of units) {
    board = placeUnit(board, unit, unit.cell);
  }
  return board;
}

export function makeGameState(overrides = {}) {
  const game = createExpedition(overrides.seed ?? 'fixture-seed');
  return {
    ...game,
    ...overrides,
    board: overrides.board ?? game.board,
    deck: overrides.deck ?? game.deck,
    cardsById: overrides.cardsById ?? game.cardsById,
  };
}

export function makeCombatState(overrides = {}) {
  return createCombatState({
    board: overrides.board ?? makeBoard(),
    enemies: overrides.enemies ?? [makeEnemy('soldier')],
    wallHp: overrides.wallHp ?? 100,
    phaseIndex: overrides.phaseIndex ?? 0,
    ordersRemaining: overrides.ordersRemaining ?? 3,
    tactics: overrides.tactics ?? [],
  });
}
