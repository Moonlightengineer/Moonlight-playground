export function deriveEnemyIntent(enemy) {
  switch (enemy.definitionId) {
    case 'shield-enemy':
      return { type: 'protect', lane: enemy.lane, target: 'ally-behind' };
    case 'banner':
      return { type: 'strengthen', lane: enemy.lane, target: 'nearby-enemies' };
    case 'crossbow':
      return {
        type: 'ranged-attack',
        lane: enemy.lane,
        countdown: Math.max(0, enemy.cooldown ?? 0),
        target: 'rear-unit-or-wall',
      };
    case 'heavy-cavalry':
      return {
        type: 'charge',
        lane: enemy.lane,
        countdown: enemy.chargeIn ?? 3,
        target: 'wall',
      };
    case 'hua-xiong':
      return {
        type: enemy.phase === 2 ? 'boss-summon-and-strike' : 'boss-heavy-strike',
        lane: enemy.lane,
        countdown: enemy.cooldown ?? 0,
        target: 'lane',
      };
    default:
      return { type: 'advance', lane: enemy.lane, target: 'wall' };
  }
}

export function deriveLaneWarnings(combat) {
  return Array.from({ length: combat.board.size.columns }, (_, lane) => {
    const threats = combat.enemies
      .filter((enemy) => enemy.hp > 0 && enemy.lane === lane)
      .map(deriveEnemyIntent);

    if (!threats.length) return { lane, level: 'safe', text: '安全' };
    if (threats.some(({ type }) => type === 'charge')) {
      return { lane, level: 'danger', text: '重騎準備衝鋒' };
    }
    if (threats.some(({ type }) => type === 'boss-summon-and-strike')) {
      return { lane, level: 'danger', text: '華雄進入第二階段' };
    }
    if (threats.some(({ type }) => type === 'strengthen')) {
      return { lane, level: 'warning', text: '旗手正在強化敵軍' };
    }
    if (threats.some(({ type }) => type === 'ranged-attack')) {
      return { lane, level: 'warning', text: '弩兵準備遠射' };
    }
    return { lane, level: 'warning', text: '敵軍正在推進' };
  });
}
