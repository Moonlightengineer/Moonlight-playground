# 字陣無雙 v2｜Implementation Test Fixture Contract

> 本文件係 `2026-07-23-hanzi-generals-v2-vertical-slice-implementation.md` 嘅 required companion。執行 implementation plan 時，所有 test snippet 出現嘅 fixture helper 必須由以下單一檔案提供，避免各 task 自行建立互相矛盾嘅 state shape。

## Required file

Create: `games/hanzi-generals/v2/tests/helpers/fixtures.js`

## Exact exports

```js
import { createBoard, placeUnit } from '../../src/board/board.js';
import { createCombatState } from '../../src/combat/combat-engine.js';
import { createExpedition, advanceExpedition } from '../../src/expedition/expedition.js';
import { GENERALS } from '../../data/generals.js';
import { ENEMIES } from '../../data/enemies.js';

export function emptyBoard(sizeId = 'base') {
  return createBoard(sizeId);
}

export function makeUnit({
  id = 'u1',
  definitionId = 'huang-zhong',
  column = 1,
  row = 1,
  hp,
  cooldown = 0,
  evolution = null,
} = {}) {
  const definition = GENERALS.find((item) => item.id === definitionId);
  if (!definition) throw new Error(`Unknown unit definition: ${definitionId}`);
  return {
    id,
    definitionId,
    kind: definition.kind,
    hp: hp ?? definition.maxHp,
    maxHp: definition.maxHp,
    cooldown,
    evolution,
    statuses: [],
    cell: { column, row },
  };
}

export function makeEnemy({
  id = 'e1',
  definitionId = 'soldier',
  lane = 1,
  distance = 2,
  hp,
  cooldown = 0,
  chargeIn,
  phase = 1,
  phaseTwoTriggered = false,
} = {}) {
  const definition = ENEMIES.find((item) => item.id === definitionId);
  if (!definition) throw new Error(`Unknown enemy definition: ${definitionId}`);
  return {
    id,
    definitionId,
    lane,
    distance,
    hp: hp ?? definition.maxHp,
    maxHp: definition.maxHp,
    cooldown,
    chargeIn,
    phase,
    phaseTwoTriggered,
    statuses: [],
  };
}

export function enemyAtWall(overrides = {}) {
  return makeEnemy({ distance: 0, ...overrides });
}

export function fixtureContext() {
  return {
    unitsById: Object.fromEntries(GENERALS.map((item) => [item.id, item])),
    enemiesById: Object.fromEntries(ENEMIES.map((item) => [item.id, item])),
    canAttack(unit, enemy, combat) {
      const definition = this.unitsById[unit.definitionId];
      return enemy.hp > 0 && enemy.distance + unit.cell.row <= definition.range;
    },
    spawnHeavyCavalryPair(lane) {
      return [
        makeEnemy({ id: 'boss-cavalry-1', definitionId: 'heavy-cavalry', lane, distance: 3, chargeIn: 3 }),
        makeEnemy({ id: 'boss-cavalry-2', definitionId: 'heavy-cavalry', lane: Math.max(0, lane - 1), distance: 3, chargeIn: 3 }),
      ];
    },
  };
}

export function fixtureCombat({
  board = createBoard('base'),
  enemies = [makeEnemy()],
  wallHp = 100,
  phaseIndex = 0,
  ordersRemaining = 3,
} = {}) {
  return createCombatState({ board, enemies, wallHp, phaseIndex, ordersRemaining });
}

export function fixtureCombatWithAdjacentUnits() {
  let board = createBoard('base');
  board = placeUnit(board, makeUnit({ id: 'u1', column: 0, row: 1 }), { column: 0, row: 1 });
  board = placeUnit(board, makeUnit({ id: 'u2', definitionId: 'guan-yu', column: 1, row: 1 }), { column: 1, row: 1 });
  return fixtureCombat({ board });
}

export function bossCombat({ hp = 40, phase = 1, phaseTwoTriggered = false } = {}) {
  return fixtureCombat({
    enemies: [makeEnemy({
      id: 'boss',
      definitionId: 'hua-xiong',
      lane: 1,
      distance: 2,
      hp,
      phase,
      phaseTwoTriggered,
    })],
  });
}

export function fixtureGame({
  board = createBoard('base'),
  campCards = [],
  symbols = {},
  livingUnits = [],
} = {}) {
  let nextBoard = board;
  for (const unit of livingUnits) nextBoard = placeUnit(nextBoard, unit, unit.cell);
  const cardsById = Object.fromEntries(
    Object.entries(symbols).map(([id, symbol]) => [id, { id, symbol, locked: false }]),
  );
  return {
    version: 1,
    status: 'configuration',
    board: nextBoard,
    camp: { capacity: 2, cardIds: [...campCards] },
    cardsById,
    deck: {
      drawPile: [],
      discardPile: [],
      hand: Object.values(cardsById),
      retained: [],
      deployed: [],
      freeRerollsRemaining: 1,
    },
    nextUnitId: 1,
    selection: null,
  };
}

export function fixtureGameWithLivingGeneral(definitionId) {
  const symbols = definitionId === 'huang-zhong'
    ? { c1: '黃', c2: '忠' }
    : { c1: '趙', c2: '雲' };
  return fixtureGame({
    symbols,
    livingUnits: [makeUnit({ id: 'existing', definitionId, column: 0, row: 0 })],
  });
}

export function simulateRoute(initialGame, route) {
  let game = { ...initialGame, route };
  while (game.completedBattleIds.length < 6) {
    const stageId = game.nextStageId
      ?? (game.completedBattleIds.length === 0 ? 'tutorial' : null);
    if (!stageId) throw new Error('Route simulation has no next stage');
    game = {
      ...game,
      status: 'reward',
      currentBattleResult: 'victory',
      currentBattle: { stageId },
    };
    game = advanceExpedition(game, route);
  }
  return game;
}

export function makeMemoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
    dump: () => new Map(data),
  };
}
```

## Per-test imports

Tests must import helpers explicitly. Examples:

```js
import {
  emptyBoard,
  enemyAtWall,
  fixtureContext,
  fixtureCombat,
  fixtureCombatWithAdjacentUnits,
  bossCombat,
  fixtureGame,
  fixtureGameWithLivingGeneral,
  simulateRoute,
  makeMemoryStorage,
} from './helpers/fixtures.js';
```

## Full-run test helper

`autoplayDeterministicRun` must not live in the shared fixture file until Task 13, because it consumes the completed public action interface. Add it inside `expedition.test.js` with this exact contract:

```js
function autoplayDeterministicRun({ seed, route, expansion, assertBossCharge = false }) {
  let game = createExpedition(seed);
  const events = [];

  while (!['victory', 'defeat'].includes(game.status)) {
    const action = chooseDeterministicLegalAction(game, { route, expansion });
    const result = reduceGame(game, action);
    assert.equal(result.ok, true, result.error?.message);
    game = result.state;
    events.push(...result.events);
  }

  return {
    ...game,
    events,
    classicTouched: false,
    assertBossCharge,
  };
}
```

`chooseDeterministicLegalAction(game, options)` must be defined in the same test file as a switch over the approved status enum and may only select from `game.legalActions`; it must never mutate `game` directly.

## Plan correction rule

Where the implementation plan says a fixture should be defined inline, importing the equivalent helper from this contract is the preferred interpretation. No task may invent a second incompatible board, card, unit, enemy, combat or game-state fixture shape.
