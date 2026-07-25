export const EVOLUTIONS = Object.freeze([
  { id: 'divine-shot', generalId: 'huang-zhong', name: '神射', summary: '每次命中造成更多傷害。', effect: '傷害 +3。', modifiers: { damage: 3 } },
  { id: 'repeating-crossbow', generalId: 'huang-zhong', name: '連弩', summary: '縮短兩次攻擊之間嘅等待。', effect: '攻擊間隔 -1，最低為 1。', modifiers: { attackEvery: -1 } },
  { id: 'seven-charges', generalId: 'zhao-yun', name: '七進七出', summary: '突擊範圍及殺傷力提升。', effect: '傷害 +2、射程 +1。', modifiers: { damage: 2, range: 1 } },
  { id: 'guardian', generalId: 'zhao-yun', name: '護主', summary: '以更穩定嘅節奏守住前線。', effect: '攻擊間隔 -1，最低為 1。', modifiers: { attackEvery: -1 } },
  { id: 'azure-dragon', generalId: 'guan-yu', name: '青龍偃月', summary: '橫掃攻擊造成更高傷害。', effect: '傷害 +3。', modifiers: { damage: 3 } },
  { id: 'awe', generalId: 'guan-yu', name: '威震華夏', summary: '更早截擊接近中嘅敵軍。', effect: '射程 +1。', modifiers: { range: 1 } },
  { id: 'peerless', generalId: 'lu-bu', name: '天下無雙', summary: '爆發攻擊進一步強化。', effect: '傷害 +5。', modifiers: { damage: 5 } },
  { id: 'flying-general', generalId: 'lu-bu', name: '飛將', summary: '更快再次發動爆發攻擊。', effect: '攻擊間隔 -1，最低為 1。', modifiers: { attackEvery: -1 } },
  { id: 'roar', generalId: 'zhang-fei', name: '當陽怒吼', summary: '怒吼後每次攻擊更具威力。', effect: '傷害 +2。', modifiers: { damage: 2 } },
  { id: 'last-stand', generalId: 'zhang-fei', name: '死守長坂', summary: '以更密集攻擊拖住敵軍。', effect: '攻擊間隔 -1，最低為 1。', modifiers: { attackEvery: -1 } },
  { id: 'fire-plan', generalId: 'zhuge-liang', name: '火攻', summary: '計策攻擊覆蓋更遠並提升傷害。', effect: '傷害 +2、射程 +1。', modifiers: { damage: 2, range: 1 } },
  { id: 'eight-formations', generalId: 'zhuge-liang', name: '八陣圖', summary: '更頻密發動範圍攻擊。', effect: '攻擊間隔 -1，最低為 1。', modifiers: { attackEvery: -1 } },
]);

export const EVOLUTION_BY_ID = Object.freeze(
  Object.fromEntries(EVOLUTIONS.map((evolution) => [evolution.id, evolution])),
);

export function resolveEvolvedDefinition(base, evolutionId) {
  const evolution = EVOLUTION_BY_ID[evolutionId];
  if (!base || !evolution || evolution.generalId !== base.id) return base;
  return {
    ...base,
    damage: Math.max(1, base.damage + (evolution.modifiers.damage ?? 0)),
    range: Math.max(1, base.range + (evolution.modifiers.range ?? 0)),
    attackEvery: Math.max(1, base.attackEvery + (evolution.modifiers.attackEvery ?? 0)),
    evolution,
  };
}
