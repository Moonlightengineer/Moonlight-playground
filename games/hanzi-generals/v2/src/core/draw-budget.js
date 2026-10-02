export const CONFIGURATION_DRAWS_PER_PHASE = 1;

export function normalizeDrawBudget(game) {
  if (!game?.currentBattle || typeof game.currentBattle !== 'object') return game;
  const value = game.currentBattle.drawsRemaining;
  const drawsRemaining = Number.isInteger(value) && value >= 0 && value <= CONFIGURATION_DRAWS_PER_PHASE
    ? value
    : 0;
  return {
    ...game,
    currentBattle: { ...game.currentBattle, drawsRemaining },
  };
}

export function canDrawThisPhase(game) {
  return game?.currentBattle?.drawsRemaining === CONFIGURATION_DRAWS_PER_PHASE;
}
