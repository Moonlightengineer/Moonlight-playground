export const STAGES = Object.freeze([
  {
    id: 'tutorial', name: '初陣教學', kind: 'battle',
    phases: [
      { id: 'tutorial-vanguard', label: '前鋒', spawns: [{ enemyId: 'soldier', lane: 1 }] },
      { id: 'tutorial-main', label: '主力', spawns: [{ enemyId: 'soldier', lane: 0 }, { enemyId: 'soldier', lane: 2 }] },
      { id: 'tutorial-captain', label: '小隊長', spawns: [{ enemyId: 'soldier', lane: 1 }, { enemyId: 'soldier', lane: 1, delay: 1 }] },
    ],
  },
  {
    id: 'shield-line', name: '盾陣壓境', kind: 'battle',
    phases: [
      { id: 'shield-vanguard', label: '前鋒', spawns: [{ enemyId: 'shield-enemy', lane: 1 }] },
      { id: 'shield-main', label: '主力', spawns: [{ enemyId: 'shield-enemy', lane: 0 }, { enemyId: 'soldier', lane: 0, delay: 1 }, { enemyId: 'soldier', lane: 2 }] },
      { id: 'shield-captain', label: '盾牆', spawns: [{ enemyId: 'shield-enemy', lane: 1 }, { enemyId: 'soldier', lane: 1, delay: 1 }, { enemyId: 'soldier', lane: 2 }] },
    ],
  },
  {
    id: 'route-safe', name: '安全山道', kind: 'branch-safe',
    phases: [
      { id: 'safe-vanguard', label: '前鋒', spawns: [{ enemyId: 'soldier', lane: 0 }, { enemyId: 'soldier', lane: 2 }] },
      { id: 'safe-main', label: '主力', spawns: [{ enemyId: 'shield-enemy', lane: 1 }, { enemyId: 'soldier', lane: 2 }] },
      { id: 'safe-captain', label: '守軍', spawns: [{ enemyId: 'shield-enemy', lane: 0 }, { enemyId: 'soldier', lane: 1 }, { enemyId: 'soldier', lane: 2 }] },
    ],
  },
  {
    id: 'route-danger', name: '危險峽谷', kind: 'branch-danger',
    phases: [
      { id: 'danger-vanguard', label: '前鋒', spawns: [{ enemyId: 'banner', lane: 1 }, { enemyId: 'soldier', lane: 0 }] },
      { id: 'danger-main', label: '弩陣', spawns: [{ enemyId: 'crossbow', lane: 0 }, { enemyId: 'banner', lane: 1 }, { enemyId: 'crossbow', lane: 2 }] },
      { id: 'danger-captain', label: '混編', spawns: [{ enemyId: 'shield-enemy', lane: 1 }, { enemyId: 'banner', lane: 1, delay: 1 }, { enemyId: 'crossbow', lane: 2 }] },
    ],
  },
  {
    id: 'cavalry-warning', name: '重騎預警', kind: 'battle',
    phases: [
      { id: 'cavalry-vanguard', label: '前鋒', spawns: [{ enemyId: 'soldier', lane: 1 }, { enemyId: 'heavy-cavalry', lane: 2, delay: 1 }] },
      { id: 'cavalry-main', label: '主力', spawns: [{ enemyId: 'heavy-cavalry', lane: 0 }, { enemyId: 'shield-enemy', lane: 1 }] },
      { id: 'cavalry-captain', label: '衝鋒隊', spawns: [{ enemyId: 'heavy-cavalry', lane: 0 }, { enemyId: 'heavy-cavalry', lane: 2 }, { enemyId: 'banner', lane: 1 }] },
    ],
  },
  {
    id: 'elite-mixed', name: '精英混編', kind: 'elite',
    phases: [
      { id: 'elite-vanguard', label: '前鋒', spawns: [{ enemyId: 'shield-enemy', lane: 0 }, { enemyId: 'crossbow', lane: 0, delay: 1 }, { enemyId: 'soldier', lane: 2 }] },
      { id: 'elite-main', label: '主力', spawns: [{ enemyId: 'banner', lane: 1 }, { enemyId: 'crossbow', lane: 2 }, { enemyId: 'heavy-cavalry', lane: 0 }] },
      { id: 'elite-captain', label: '精英隊', spawns: [{ enemyId: 'shield-enemy', lane: 0 }, { enemyId: 'banner', lane: 1 }, { enemyId: 'crossbow', lane: 2 }, { enemyId: 'heavy-cavalry', lane: 1, delay: 1 }] },
    ],
  },
  {
    id: 'hua-xiong', name: '虎牢關・華雄', kind: 'boss',
    phases: [
      { id: 'boss-vanguard', label: '護衛', spawns: [{ enemyId: 'shield-enemy', lane: 1 }, { enemyId: 'soldier', lane: 0 }, { enemyId: 'soldier', lane: 2 }] },
      { id: 'boss-main', label: '華雄出陣', spawns: [{ enemyId: 'hua-xiong', lane: 1 }, { enemyId: 'shield-enemy', lane: 1, delay: 1 }] },
      { id: 'boss-final', label: '決戰', spawns: [{ enemyId: 'hua-xiong', lane: 1 }, { enemyId: 'heavy-cavalry', lane: 0, delay: 1 }, { enemyId: 'heavy-cavalry', lane: 2, delay: 1 }] },
    ],
  },
]);

export const STAGE_BY_ID = Object.freeze(
  Object.fromEntries(STAGES.map((stage) => [stage.id, stage])),
);
