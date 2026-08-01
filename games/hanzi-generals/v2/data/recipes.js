export const RECIPES = Object.freeze([
  { id: 'shield-troop', symbols: ['兵', '盾'], outputType: 'troop', outputId: 'shield-troop', availability: 'starting', visibility: 'public' },
  { id: 'spear-troop', symbols: ['兵', '槍'], outputType: 'troop', outputId: 'spear-troop', availability: 'starting', visibility: 'public' },
  { id: 'archer', symbols: ['兵', '弓'], outputType: 'troop', outputId: 'archer', availability: 'starting', visibility: 'public' },
  { id: 'cavalry', symbols: ['兵', '騎'], outputType: 'troop', outputId: 'cavalry', availability: 'starting', visibility: 'public' },
  { id: 'field-medic', symbols: ['軍', '醫'], outputType: 'troop', outputId: 'field-medic', availability: 'starting', visibility: 'public' },
  { id: 'scout', symbols: ['斥', '候'], outputType: 'troop', outputId: 'scout', availability: 'starting', visibility: 'public' },
  { id: 'strategist', symbols: ['謀', '士'], outputType: 'troop', outputId: 'strategist', availability: 'starting', visibility: 'public' },
  { id: 'zhang-fei', symbols: ['張', '飛'], outputType: 'general', outputId: 'zhang-fei', availability: 'starting', visibility: 'clue' },
  { id: 'zhang-ren', symbols: ['張', '任'], outputType: 'general', outputId: 'zhang-ren', availability: 'starting', visibility: 'clue' },
  { id: 'ren-jun', symbols: ['任', '峻'], outputType: 'general', outputId: 'ren-jun', availability: 'starting', visibility: 'clue' },
  { id: 'guan-yu', symbols: ['關', '羽'], outputType: 'general', outputId: 'guan-yu', availability: 'starting', visibility: 'clue' },
  { id: 'guan-ping', symbols: ['關', '平'], outputType: 'general', outputId: 'guan-ping', availability: 'starting', visibility: 'clue' },
  { id: 'wang-ping', symbols: ['王', '平'], outputType: 'general', outputId: 'wang-ping', availability: 'starting', visibility: 'clue' },
  { id: 'zhao-yun', symbols: ['趙', '雲'], outputType: 'general', outputId: 'zhao-yun', availability: 'starting', visibility: 'clue' },
  { id: 'zhao-tong', symbols: ['趙', '統'], outputType: 'general', outputId: 'zhao-tong', availability: 'starting', visibility: 'clue' },
  { id: 'ling-tong', symbols: ['凌', '統'], outputType: 'general', outputId: 'ling-tong', availability: 'starting', visibility: 'clue' },
  { id: 'huang-zhong', symbols: ['黃', '忠'], outputType: 'general', outputId: 'huang-zhong', availability: 'reward-pack', visibility: 'silhouette' },
  { id: 'lu-bu', symbols: ['呂', '布'], outputType: 'general', outputId: 'lu-bu', availability: 'reward-pack', visibility: 'silhouette' },
  { id: 'lu-meng', symbols: ['呂', '蒙'], outputType: 'general', outputId: 'lu-meng', availability: 'reward-pack', visibility: 'silhouette' },
  { id: 'zhuge-liang', symbols: ['諸', '葛', '亮'], outputType: 'general', outputId: 'zhuge-liang', availability: 'reward-pack', visibility: 'silhouette' },
]);

export const STARTING_SYMBOLS = Object.freeze([
  '兵', '兵', '兵', '兵', '兵', '兵', '兵',
  '盾', '盾', '盾',
  '槍', '槍', '槍',
  '弓', '弓', '弓',
  '騎', '騎', '騎',
  '軍', '醫', '斥', '候', '謀', '士',
  '張', '張', '任', '任', '平', '平',
  '飛', '峻', '關', '羽', '王', '趙', '雲', '凌', '統',
]);

export const STARTING_RECIPE_IDS = Object.freeze(
  RECIPES.filter(({ availability }) => availability === 'starting').map(({ id }) => id),
);

export const REWARD_PACK_RECIPE_IDS = Object.freeze(
  RECIPES.filter(({ availability }) => availability === 'reward-pack').map(({ id }) => id),
);
