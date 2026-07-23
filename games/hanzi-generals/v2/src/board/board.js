const SIZES = Object.freeze({
  base: Object.freeze({ columns: 3, rows: 3 }),
  wing: Object.freeze({ columns: 4, rows: 3 }),
  depth: Object.freeze({ columns: 3, rows: 4 }),
});

export function createBoard(sizeId = 'base') {
  const size = SIZES[sizeId];
  if (!size) throw new Error(`Unsupported board size: ${sizeId}`);
  return { sizeId, size: { ...size }, units: {} };
}

export function isValidCell(board, { column, row }) {
  return Number.isInteger(column)
    && Number.isInteger(row)
    && column >= 0
    && row >= 0
    && column < board.size.columns
    && row < board.size.rows;
}

export function areAdjacent(a, b) {
  return Math.abs(a.column - b.column) + Math.abs(a.row - b.row) === 1;
}

export function getUnitAt(board, cell) {
  return Object.values(board.units).find((unit) => (
    unit.cell.column === cell.column && unit.cell.row === cell.row
  )) ?? null;
}

export function placeUnit(board, unit, cell) {
  if (!isValidCell(board, cell)) throw new Error('illegal cell');
  if (getUnitAt(board, cell)) throw new Error('occupied cell');
  return {
    ...board,
    units: {
      ...board.units,
      [unit.id]: { ...unit, cell: { ...cell } },
    },
  };
}

export function removeUnit(board, unitId) {
  if (!board.units[unitId]) return board;
  const units = { ...board.units };
  delete units[unitId];
  return { ...board, units };
}

export function moveUnit(board, unitId, cell) {
  const unit = board.units[unitId];
  if (!unit) throw new Error('missing unit');
  return placeUnit(removeUnit(board, unitId), unit, cell);
}

export function expandBoard(board, sizeId) {
  if (board.sizeId !== 'base' || !['wing', 'depth'].includes(sizeId)) {
    throw new Error('board may expand once from base');
  }
  return { ...board, sizeId, size: { ...SIZES[sizeId] } };
}

export function listCells(board) {
  const cells = [];
  for (let row = 0; row < board.size.rows; row += 1) {
    for (let column = 0; column < board.size.columns; column += 1) {
      cells.push({ column, row });
    }
  }
  return cells;
}

export const BOARD_SIZES = SIZES;
