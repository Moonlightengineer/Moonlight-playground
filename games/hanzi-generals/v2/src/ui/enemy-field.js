export const MAX_VISIBLE_ENEMY_DISTANCE = 6;

export function enemyDistanceToProgress(distance, maxDistance = MAX_VISIBLE_ENEMY_DISTANCE) {
  const safeMax = Number.isFinite(maxDistance) && maxDistance > 0 ? maxDistance : 1;
  const safeDistance = Number.isFinite(distance) ? distance : safeMax;
  const clamped = Math.min(safeMax, Math.max(0, safeDistance));
  return Math.round(((safeMax - clamped) / safeMax) * 100);
}
