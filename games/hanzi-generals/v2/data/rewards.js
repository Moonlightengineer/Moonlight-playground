export const REWARDS = Object.freeze([
  { id: 'copy-card', name: '臨摹', type: 'deck-copy', rarity: 'common' },
  { id: 'remove-card', name: '裁簡', type: 'deck-remove', rarity: 'common' },
  { id: 'evolve-general', name: '名將進化', type: 'evolution', rarity: 'rare' },
  { id: 'repair-wall', name: '修補城防', type: 'wall-heal', value: 25, rarity: 'common' },
  { id: 'extra-reroll', name: '整軍再抽', type: 'next-battle-reroll', value: 1, rarity: 'common' },
  { id: 'extra-camp', name: '臨時軍帳', type: 'next-battle-camp', value: 1, rarity: 'uncommon' },
  { id: 'fire-arrows', name: '火矢', type: 'tactic', tacticId: 'fire-arrows', rarity: 'uncommon' },
  { id: 'first-aid', name: '急救', type: 'tactic', tacticId: 'first-aid', rarity: 'uncommon' },
  { id: 'expand-wing', name: '側翼擴陣', type: 'board-expand', sizeId: 'wing', rarity: 'scripted' },
  { id: 'expand-depth', name: '縱深擴陣', type: 'board-expand', sizeId: 'depth', rarity: 'scripted' },
  { id: 'unlock-zhang-fei', name: '張飛配方包', type: 'recipe-pack', symbols: ['張', '飛'], rarity: 'scripted' },
  { id: 'unlock-zhuge-liang', name: '諸葛亮配方包', type: 'recipe-pack', symbols: ['諸', '葛', '亮'], rarity: 'scripted' },
]);

export const REWARD_BY_ID = Object.freeze(
  Object.fromEntries(REWARDS.map((reward) => [reward.id, reward])),
);
