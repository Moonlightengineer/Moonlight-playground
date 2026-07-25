export const REWARDS = Object.freeze([
  {
    id: 'copy-card',
    name: '臨摹',
    type: 'deck-copy',
    rarity: 'common',
    description: {
      summary: '複製一張現有字牌，提高關鍵配方出現率。',
      effect: '將所選字牌永久增加 1 張到牌庫。',
      useCase: '缺少某個常用字，或者想更穩定合成主力武將時選。',
    },
  },
  {
    id: 'remove-card',
    name: '裁簡',
    type: 'deck-remove',
    rarity: 'common',
    description: {
      summary: '刪走一張字牌，令牌庫更集中。',
      effect: '將所選、未部署字牌永久移除 1 張。',
      useCase: '牌庫有多餘字牌，經常阻礙主力配方時選。',
    },
  },
  {
    id: 'evolve-general',
    name: '名將進化',
    type: 'evolution',
    rarity: 'rare',
    description: {
      summary: '強化一名已解鎖而未進化的武將。',
      effect: '為所選武將套用 1 個永久進化分支。',
      useCase: '已有穩定主力武將，想集中提升其戰鬥能力時選。',
    },
  },
  {
    id: 'repair-wall',
    name: '修補城防',
    type: 'wall-heal',
    value: 30,
    rarity: 'common',
    description: {
      summary: '立即修復受損城牆，增加遠征容錯。',
      effect: '城牆生命回復 30，最多回復至上限。',
      useCase: '城牆已明顯受損，下一戰可能守不住時選。',
    },
  },
  {
    id: 'extra-reroll',
    name: '整軍再抽',
    type: 'next-battle-reroll',
    value: 1,
    rarity: 'common',
    description: {
      summary: '下一戰多一次免費重抽，改善起手牌。',
      effect: '下一場戰鬥的免費重抽次數 +1。',
      useCase: '依賴特定配方，想降低抽不到關鍵字牌的風險時選。',
    },
  },
  {
    id: 'extra-camp',
    name: '臨時軍帳',
    type: 'next-battle-camp',
    value: 1,
    rarity: 'uncommon',
    description: {
      summary: '下一戰增加軍營空間，方便暫存字牌。',
      effect: '下一場戰鬥的軍營容量 +1。',
      useCase: '手牌多、需要保留跨回合配方字牌時選。',
    },
  },
  {
    id: 'fire-arrows',
    name: '火矢',
    type: 'tactic',
    tacticId: 'fire-arrows',
    rarity: 'uncommon',
    description: {
      summary: '獲得一次範圍攻擊軍策，清理同一路敵軍。',
      effect: '永久加入 1 個「火矢」軍策到遠征軍策池。',
      useCase: '危險路線敵人密集，或者需要快速壓低一整路血量時選。',
    },
  },
  {
    id: 'first-aid',
    name: '急救',
    type: 'tactic',
    tacticId: 'first-aid',
    rarity: 'uncommon',
    description: {
      summary: '獲得一次治療軍策，保住受傷單位。',
      effect: '永久加入 1 個「急救」軍策到遠征軍策池。',
      useCase: '主力武將容易累積傷害，想避免中途倒下時選。',
    },
  },
  {
    id: 'expand-wing',
    name: '側翼擴陣',
    type: 'board-expand',
    sizeId: 'wing',
    rarity: 'scripted',
    description: {
      summary: '增加一條路線，擴闊橫向部署空間。',
      effect: '戰陣由 3×3 永久擴展為 4×3。',
      useCase: '需要分散敵軍、建立更多同路組合或容納更多單位時選。',
    },
  },
  {
    id: 'expand-depth',
    name: '縱深擴陣',
    type: 'board-expand',
    sizeId: 'depth',
    rarity: 'scripted',
    description: {
      summary: '增加後排深度，擴闊前後排部署空間。',
      effect: '戰陣由 3×3 永久擴展為 3×4。',
      useCase: '想加強前排保護、後排輸出及縱向站位調整時選。',
    },
  },
  {
    id: 'unlock-zhang-fei',
    name: '張飛配方包',
    type: 'recipe-pack',
    symbols: ['張', '飛'],
    rarity: 'scripted',
    description: {
      summary: '解鎖張飛，並把所需字牌加入牌庫。',
      effect: '解鎖「張＋飛」配方，並永久加入「張」「飛」各 1 張。',
      useCase: '想增加強力近戰前排，或者已選側翼擴陣時選。',
    },
  },
  {
    id: 'unlock-zhuge-liang',
    name: '諸葛亮配方包',
    type: 'recipe-pack',
    symbols: ['諸', '葛', '亮'],
    rarity: 'scripted',
    description: {
      summary: '解鎖諸葛亮，並把三張所需字牌加入牌庫。',
      effect: '解鎖「諸＋葛＋亮」配方，並永久加入三個字各 1 張。',
      useCase: '想建立後排支援及更高價值三字配方，或者已選縱深擴陣時選。',
    },
  },
]);

export const REWARD_BY_ID = Object.freeze(
  Object.fromEntries(REWARDS.map((reward) => [reward.id, reward])),
);
