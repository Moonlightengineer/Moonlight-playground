export function selectLifecycle(game) {
  const status = typeof game?.status === 'string' ? game.status : 'error';
  const phaseIndex = game?.currentBattle?.phaseIndex;
  const phaseCount = game?.currentBattle?.phaseCount;
  return {
    status,
    screen: status,
    battleNumber: Number.isInteger(game?.battleIndex) ? game.battleIndex + 1 : 1,
    phaseNumber: Number.isInteger(phaseIndex) ? phaseIndex + 1 : null,
    phaseCount: Number.isInteger(phaseCount) ? phaseCount : null,
  };
}

export function selectActiveBoard(game) {
  if (game?.status === 'combat' && game.combat?.board) return game.combat.board;
  return game?.board ?? null;
}
