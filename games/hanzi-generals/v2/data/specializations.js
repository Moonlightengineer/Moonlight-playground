import { resolveEvolvedDefinition } from './evolutions.js';

export const TROOP_SPECIALIZATIONS = Object.freeze([
  {
    id: 'shield-wall',
    troopId: 'shield-troop',
    name: '堅壁操練',
    summary: '盾兵更耐打，並進一步保護同路後排。',
    effect: '生命 +6；後排減傷由 25% 提升至 35%。',
    modifiers: { maxHp: 6, guardBehind: 0.1 },
  },
  {
    id: 'spear-drill',
    troopId: 'spear-troop',
    name: '長槍操典',
    summary: '槍兵正面輸出更可靠。',
    effect: '傷害 +2。',
    modifiers: { damage: 2 },
  },
  {
    id: 'rapid-volley',
    troopId: 'archer',
    name: '連射訓練',
    summary: '弓兵更頻密射擊。',
    effect: '攻擊間隔 -1，最低為 1。',
    modifiers: { attackEvery: -1 },
  },
  {
    id: 'cavalry-discipline',
    troopId: 'cavalry',
    name: '騎陣操練',
    summary: '騎兵兼顧生存與衝擊力。',
    effect: '生命 +4；傷害 +1。',
    modifiers: { maxHp: 4, damage: 1 },
  },
]);

export const SPECIALIZATION_BY_ID = Object.freeze(
  Object.fromEntries(TROOP_SPECIALIZATIONS.map((specialization) => [specialization.id, specialization])),
);

function matchingSpecializations(definition, specializationIds = []) {
  if (definition?.kind !== 'troop') return [];
  const seen = new Set();
  return specializationIds
    .map((id) => SPECIALIZATION_BY_ID[id])
    .filter((specialization) => (
      specialization
      && specialization.troopId === definition.id
      && !seen.has(specialization.id)
      && seen.add(specialization.id)
    ));
}

export function resolveUnitDefinition(base, evolutionId = null, specializationIds = []) {
  if (!base) return base;
  const evolved = resolveEvolvedDefinition(base, evolutionId) ?? base;
  const specializations = matchingSpecializations(base, specializationIds);
  if (!specializations.length) return evolved;
  const modifiers = specializations.reduce((total, specialization) => ({
    maxHp: total.maxHp + (specialization.modifiers.maxHp ?? 0),
    damage: total.damage + (specialization.modifiers.damage ?? 0),
    range: total.range + (specialization.modifiers.range ?? 0),
    attackEvery: total.attackEvery + (specialization.modifiers.attackEvery ?? 0),
    guardBehind: total.guardBehind + (specialization.modifiers.guardBehind ?? 0),
  }), { maxHp: 0, damage: 0, range: 0, attackEvery: 0, guardBehind: 0 });
  return {
    ...evolved,
    maxHp: Math.max(1, evolved.maxHp + modifiers.maxHp),
    damage: Math.max(1, evolved.damage + modifiers.damage),
    range: Math.max(1, evolved.range + modifiers.range),
    attackEvery: Math.max(1, evolved.attackEvery + modifiers.attackEvery),
    guardBehind: Math.max(0, (evolved.guardBehind ?? 0) + modifiers.guardBehind),
    specializations,
  };
}
