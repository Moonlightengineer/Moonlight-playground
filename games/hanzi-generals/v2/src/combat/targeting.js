function reachableEnemies(unit, enemies, definition) {
  return enemies
    .filter((enemy) => enemy.hp > 0)
    .filter((enemy) => enemy.distance + unit.cell.row <= definition.range)
    .sort((a, b) => (
      a.distance - b.distance
      || a.lane - b.lane
      || a.id.localeCompare(b.id)
    ));
}

export function findTargets(unit, enemies, definition, options = {}) {
  const reachable = reachableEnemies(unit, enemies, definition);
  if (!reachable.length) return [];

  if (options.focusId) {
    const focused = reachable.find(({ id }) => id === options.focusId);
    if (focused) return [focused];
  }

  if (definition.pattern === 'same-lane') {
    return reachable.filter((enemy) => enemy.lane === unit.cell.column).slice(0, 1);
  }
  if (definition.pattern === 'pierce') {
    return reachable.filter((enemy) => enemy.lane === unit.cell.column).slice(0, 2);
  }
  if (definition.pattern === 'lane-cleave') {
    const nearest = reachable[0]?.distance;
    return reachable.filter((enemy) => (
      Math.abs(enemy.lane - unit.cell.column) <= 1 && enemy.distance === nearest
    ));
  }
  if (definition.pattern === 'area') {
    return reachable.slice(0, 3);
  }
  if (definition.pattern === 'adjacent-burst') {
    return reachable.filter((enemy) => Math.abs(enemy.lane - unit.cell.column) <= 1).slice(0, 3);
  }
  return reachable.slice(0, 1);
}

export function nearestFriendlyTarget(board, lane, { preferRear = false } = {}) {
  const candidates = Object.values(board.units)
    .filter((unit) => unit.hp > 0 && unit.cell.column === lane)
    .sort((a, b) => (
      (preferRear ? b.cell.row - a.cell.row : a.cell.row - b.cell.row)
      || a.id.localeCompare(b.id)
    ));
  return candidates[0] ?? null;
}
