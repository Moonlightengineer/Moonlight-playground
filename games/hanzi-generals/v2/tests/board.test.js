import test from 'node:test';
import assert from 'node:assert/strict';
import {
  areAdjacent,
  createBoard,
  expandBoard,
  getUnitAt,
  isValidCell,
  listCells,
  moveUnit,
  placeUnit,
} from '../src/board/board.js';

test('board supports only approved sizes', () => {
  assert.deepEqual(createBoard('base').size, { columns: 3, rows: 3 });
  assert.deepEqual(expandBoard(createBoard('base'), 'wing').size, { columns: 4, rows: 3 });
  assert.deepEqual(expandBoard(createBoard('base'), 'depth').size, { columns: 3, rows: 4 });
  assert.throws(() => createBoard('freeform'), /Unsupported board size/);
  assert.throws(() => expandBoard(createBoard('wing'), 'depth'), /expand once/);
});

test('placement rejects occupied cells and movement preserves unit identity', () => {
  let board = createBoard('base');
  board = placeUnit(board, { id: 'u1' }, { column: 1, row: 1 });
  assert.equal(isValidCell(board, { column: 2, row: 2 }), true);
  assert.equal(isValidCell(board, { column: 3, row: 2 }), false);
  assert.throws(() => placeUnit(board, { id: 'u2' }, { column: 1, row: 1 }), /occupied/);
  assert.equal(areAdjacent({ column: 1, row: 1 }, { column: 2, row: 1 }), true);
  board = moveUnit(board, 'u1', { column: 2, row: 1 });
  assert.equal(board.units.u1.cell.column, 2);
  assert.equal(getUnitAt(board, { column: 2, row: 1 }).id, 'u1');
});

test('listCells returns every legal cell exactly once', () => {
  const board = createBoard('depth');
  const cells = listCells(board);
  assert.equal(cells.length, 12);
  assert.equal(new Set(cells.map(({ column, row }) => `${column}:${row}`)).size, 12);
});
