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

function patternCandidates(unit, enemies, definition) {
  const reachable = reachableEnemies(unit, enemies, definition);
  if (definition.pattern === 'same-lane' || definition.pattern === 'pierce') {
    return reachable.filter((enemy) => enemy.lane === unit.cell.column);
  }
  if (definition.pattern === 'lane-cleave' || definition.pattern === 'adjacent-burst') {
    return reachable.filter((enemy) => Math.abs(enemy.lane - unit.cell.column) <= 1);
  }
  return reachable;
}

function prioritizeFocus(candidates, focusId) {
  if (!focusId) return candidates;
  const focused = candidates.find(({ id }) => id === focusId);
  if (!focused) return candidates;
  return [focused, ...candidates.filter(({ id }) => id !== focusId)];
}

export function focusableTargets(unit, enemies, definition) {
  return patternCandidates(unit, enemies, definition);
}

export function canFocusEnemy(combat, enemyId, unitsById = {}) {
  const enemy = combat.enemies.find((item) => item.id === enemyId && item.hp > 0);
  if (!enemy) return false;
  return Object.values(combat.board.units).some((unit) => {
    if (unit.hp <= 0) return false;
    const definition = unitsById[unit.definitionId];
    if (!definition) return false;
    return focusableTargets(unit, combat.enemies, definition).some(({ id }) => id === enemyId);
  });
}

export function findTargets(unit, enemies, definition, options = {}) {
  const candidates = patternCandidates(unit, enemies, definition);
  if (!candidates.length) return [];
  const prioritized = prioritizeFocus(candidates, options.focusId);

  if (definition.pattern === 'same-lane') return prioritized.slice(0, 1);
  if (definition.pattern === 'pierce') return prioritized.slice(0, 2);
  if (definition.pattern === 'lane-cleave') {
    const anchor = prioritized[0];
    return candidates.filter((enemy) => enemy.distance === anchor.distance);
  }
  if (definition.pattern === 'area' || definition.pattern === 'adjacent-burst') {
    return prioritized.slice(0, 3);
  }
  return prioritized.slice(0, 1);
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
