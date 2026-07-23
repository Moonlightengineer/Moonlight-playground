export const ENEMIES = Object.freeze([
  { id: 'soldier', name: '步兵', maxHp: 8, damage: 2, attackEvery: 2, moveEvery: 1, ability: 'none' },
  { id: 'shield-enemy', name: '盾兵', maxHp: 18, damage: 2, attackEvery: 2, moveEvery: 1, ability: 'protect-behind' },
  { id: 'banner', name: '旗手', maxHp: 10, damage: 1, attackEvery: 3, moveEvery: 1, ability: 'aura' },
  { id: 'crossbow', name: '弩兵', maxHp: 9, damage: 3, attackEvery: 2, moveEvery: 2, ability: 'ranged' },
  { id: 'heavy-cavalry', name: '重騎', maxHp: 16, damage: 5, attackEvery: 2, moveEvery: 1, ability: 'charge' },
  { id: 'hua-xiong', name: '華雄', maxHp: 80, damage: 8, attackEvery: 3, moveEvery: 1, ability: 'boss' },
]);

export const ENEMY_BY_ID = Object.freeze(
  Object.fromEntries(ENEMIES.map((enemy) => [enemy.id, enemy])),
);
