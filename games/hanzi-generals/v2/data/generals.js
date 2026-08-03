export const GENERALS = Object.freeze([
  {
    id: 'shield-troop', name: '盾兵', kind: 'troop', tier: 'troop', role: 'guard',
    maxHp: 22, damage: 2, attackEvery: 3, range: 1, pattern: 'same-lane',
    rangeLabel: '同路前排', ability: '守護後排：同路後方友軍承受傷害降低 25%。',
    guardBehind: 0.25, evolutions: [],
  },
  {
    id: 'spear-troop', name: '槍兵', kind: 'troop', tier: 'troop', role: 'frontline',
    maxHp: 18, damage: 5, attackEvery: 2, range: 1, pattern: 'same-lane',
    rangeLabel: '同路近戰', ability: '列陣迎擊：穩定守住前排並攻擊同路最近敵人。',
    evolutions: [],
  },
  {
    id: 'archer', name: '弓兵', kind: 'troop', tier: 'troop', role: 'support-ranged',
    maxHp: 10, damage: 3, attackEvery: 2, range: 3, pattern: 'same-lane',
    rangeLabel: '同路遠程', ability: '遠程射擊：可由中後排攻擊同路敵人。',
    evolutions: [],
  },
  {
    id: 'cavalry', name: '騎兵', kind: 'troop', tier: 'troop', role: 'charge',
    maxHp: 17, damage: 5, attackEvery: 2, range: 1, pattern: 'pierce',
    rangeLabel: '同路突擊', ability: '突擊：攻擊可貫穿同路前方敵陣。',
    evolutions: [],
  },
  {
    id: 'field-medic', name: '軍醫', kind: 'troop', tier: 'troop', role: 'healer',
    maxHp: 13, damage: 2, attackEvery: 3, range: 2, pattern: 'same-lane',
    rangeLabel: '同路支援', ability: '救治：支援同路受傷友軍，沒有傷員時作低傷害攻擊。',
    evolutions: [],
  },
  {
    id: 'scout', name: '斥候', kind: 'troop', tier: 'troop', role: 'debuff',
    maxHp: 12, damage: 3, attackEvery: 2, range: 3, pattern: 'same-lane',
    rangeLabel: '同路遠程', ability: '偵察：優先標記同路最近敵人，協助軍陣集火。',
    evolutions: [],
  },
  {
    id: 'strategist', name: '謀士', kind: 'troop', tier: 'troop', role: 'control',
    maxHp: 13, damage: 3, attackEvery: 3, range: 4, pattern: 'area',
    rangeLabel: '跨路策略', ability: '擾陣：以較慢攻擊牽制多路敵軍。',
    evolutions: [],
  },
  {
    id: 'ren-jun', name: '任峻', kind: 'general', tier: 'ordinary', role: 'supply',
    maxHp: 21, damage: 4, attackEvery: 2, range: 2, pattern: 'same-lane',
    rangeLabel: '同路中程', ability: '補給：以穩定攻守支援同路軍陣。',
    evolutions: [],
  },
  {
    id: 'guan-ping', name: '關平', kind: 'general', tier: 'ordinary', role: 'guard',
    maxHp: 25, damage: 4, attackEvery: 2, range: 1, pattern: 'same-lane',
    rangeLabel: '同路近戰', ability: '護衛：保護同路後方友軍。',
    guardBehind: 0.15, evolutions: [],
  },
  {
    id: 'zhao-tong', name: '趙統', kind: 'general', tier: 'ordinary', role: 'defence',
    maxHp: 23, damage: 4, attackEvery: 2, range: 1, pattern: 'same-lane',
    rangeLabel: '同路近戰', ability: '固守：提升同路前線的穩定性。',
    evolutions: [],
  },
  {
    id: 'zhang-ren', name: '張任', kind: 'general', tier: 'notable', role: 'ranged',
    maxHp: 19, damage: 7, attackEvery: 2, range: 4, pattern: 'same-lane',
    rangeLabel: '同路遠程', ability: '伏擊首箭：每個戰段首次攻擊造成較高威脅。',
    evolutions: [],
  },
  {
    id: 'wang-ping', name: '王平', kind: 'general', tier: 'notable', role: 'balanced',
    maxHp: 27, damage: 5, attackEvery: 2, range: 2, pattern: 'same-lane',
    rangeLabel: '同路中程', ability: '持重：兼顧防守與持續輸出。',
    evolutions: [],
  },
  {
    id: 'ling-tong', name: '凌統', kind: 'general', tier: 'notable', role: 'pursuit',
    maxHp: 21, damage: 6, attackEvery: 2, range: 1, pattern: 'pierce',
    rangeLabel: '同路突擊', ability: '追擊：快速壓迫同路受創敵軍。',
    evolutions: [],
  },
  {
    id: 'zhang-fei', name: '張飛', kind: 'general', tier: 'famous', role: 'tank',
    maxHp: 34, damage: 5, attackEvery: 2, range: 1, pattern: 'same-lane',
    rangeLabel: '同路前排', ability: '震喝：前排爆發並吸引敵軍火力。',
    evolutions: ['roar', 'last-stand'],
  },
  {
    id: 'guan-yu', name: '關羽', kind: 'general', tier: 'famous', role: 'cleave',
    maxHp: 28, damage: 6, attackEvery: 2, range: 1, pattern: 'lane-cleave',
    rangeLabel: '同路斬擊', ability: '青龍斬：斬擊同路多名敵人。',
    evolutions: ['azure-dragon', 'awe'],
  },
  {
    id: 'zhao-yun', name: '趙雲', kind: 'general', tier: 'famous', role: 'charge',
    maxHp: 24, damage: 5, attackEvery: 2, range: 1, pattern: 'pierce',
    rangeLabel: '同路突擊', ability: '龍膽：機動突擊並貫穿同路敵陣。',
    evolutions: ['seven-charges', 'guardian'],
  },
  {
    id: 'huang-zhong', name: '黃忠', kind: 'general', tier: 'famous', role: 'ranged',
    maxHp: 18, damage: 7, attackEvery: 2, range: 5, pattern: 'same-lane',
    rangeLabel: '同路超遠程', ability: '神射：由後排精準攻擊同路遠方敵人。',
    evolutions: ['divine-shot', 'repeating-crossbow'],
  },
  {
    id: 'lu-bu', name: '呂布', kind: 'general', tier: 'famous', role: 'burst',
    maxHp: 30, damage: 10, attackEvery: 3, range: 1, pattern: 'adjacent-burst',
    rangeLabel: '近戰爆發', ability: '無雙：重擊鄰近敵軍，單次傷害極高。',
    evolutions: ['peerless', 'flying-general'],
  },
  {
    id: 'lu-meng', name: '呂蒙', kind: 'general', tier: 'notable', role: 'control',
    maxHp: 24, damage: 5, attackEvery: 2, range: 3, pattern: 'area',
    rangeLabel: '跨路中程', ability: '克敵：以穩定策略攻擊牽制多路敵軍。',
    evolutions: [],
  },
  {
    id: 'zhuge-liang', name: '諸葛亮', kind: 'general', tier: 'famous', role: 'control',
    maxHp: 20, damage: 4, attackEvery: 2, range: 4, pattern: 'area',
    rangeLabel: '跨路遠程', ability: '奇謀：以範圍策略削弱多路敵軍。',
    evolutions: ['fire-plan', 'eight-formations'],
  },
]);

export const GENERAL_BY_ID = Object.freeze(
  Object.fromEntries(GENERALS.map((unit) => [unit.id, unit])),
);
