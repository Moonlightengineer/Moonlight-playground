export const GENERALS = Object.freeze([
  {
    id: 'huang-zhong', name: '黃忠', kind: 'general', role: 'ranged',
    maxHp: 18, damage: 7, attackEvery: 2, range: 5, pattern: 'same-lane',
    evolutions: ['divine-shot', 'repeating-crossbow'],
  },
  {
    id: 'zhao-yun', name: '趙雲', kind: 'general', role: 'charge',
    maxHp: 24, damage: 5, attackEvery: 2, range: 1, pattern: 'pierce',
    evolutions: ['seven-charges', 'guardian'],
  },
  {
    id: 'guan-yu', name: '關羽', kind: 'general', role: 'cleave',
    maxHp: 28, damage: 6, attackEvery: 2, range: 1, pattern: 'lane-cleave',
    evolutions: ['azure-dragon', 'awe'],
  },
  {
    id: 'lu-bu', name: '呂布', kind: 'general', role: 'burst',
    maxHp: 30, damage: 10, attackEvery: 3, range: 1, pattern: 'adjacent-burst',
    evolutions: ['peerless', 'flying-general'],
  },
  {
    id: 'zhang-fei', name: '張飛', kind: 'general', role: 'tank',
    maxHp: 34, damage: 5, attackEvery: 2, range: 1, pattern: 'same-lane',
    evolutions: ['roar', 'last-stand'],
  },
  {
    id: 'zhuge-liang', name: '諸葛亮', kind: 'general', role: 'control',
    maxHp: 20, damage: 4, attackEvery: 2, range: 4, pattern: 'area',
    evolutions: ['fire-plan', 'eight-formations'],
  },
  {
    id: 'archer', name: '弓兵', kind: 'troop', role: 'support-ranged',
    maxHp: 10, damage: 3, attackEvery: 2, range: 2, pattern: 'same-lane',
    evolutions: [],
  },
  {
    id: 'shield-troop', name: '盾兵', kind: 'troop', role: 'support-guard',
    maxHp: 22, damage: 1, attackEvery: 3, range: 1, pattern: 'same-lane',
    guardBehind: 0.25, evolutions: [],
  },
]);

export const GENERAL_BY_ID = Object.freeze(
  Object.fromEntries(GENERALS.map((unit) => [unit.id, unit])),
);
