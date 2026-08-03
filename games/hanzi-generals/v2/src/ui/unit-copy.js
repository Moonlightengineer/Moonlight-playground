import { EVOLUTION_BY_ID } from '../../data/evolutions.js';
import { resolveUnitDefinition } from '../../data/specializations.js';

const TIER_LABELS = Object.freeze({
  troop: '兵種',
  ordinary: '普通將',
  notable: '良將',
  famous: '名將',
});

const ATTACK_METHOD_LABELS = Object.freeze({
  'same-lane': '攻擊同路最近敵人',
  pierce: '貫穿同路敵陣',
  'lane-cleave': '斬擊同路多名敵人',
  area: '攻擊多路範圍敵人',
  'adjacent-burst': '重擊鄰近敵人',
});

export function buildUnitPlayerDetail(definition, evolutionId = null, specializationIds = []) {
  if (!definition || typeof definition !== 'object') return null;
  const effective = resolveUnitDefinition(definition, evolutionId, specializationIds) ?? definition;
  const evolution = EVOLUTION_BY_ID[evolutionId];
  const validEvolution = evolution?.generalId === definition.id ? evolution : null;
  const tierLabel = TIER_LABELS[definition.tier] ?? (definition.kind === 'troop' ? '兵種' : '武將');
  const rangeLabel = definition.rangeLabel ?? `射程 ${effective.range}`;
  const attackMethodLabel = ATTACK_METHOD_LABELS[definition.pattern] ?? '按單位規則攻擊';
  const ability = definition.ability ?? '沒有額外能力。';
  const statsLabel = `生命 ${effective.maxHp}｜傷害 ${effective.damage}｜每 ${effective.attackEvery} 回合攻擊｜射程 ${effective.range}`;
  const evolutionLabel = validEvolution?.name ?? null;
  const evolutionEffect = validEvolution?.effect ?? null;
  const specializationText = (effective.specializations ?? [])
    .map(({ name, effect }) => `${name}：${effect}`)
    .join('；') || null;
  const text = [
    `${definition.name}｜${tierLabel}`,
    `${rangeLabel}｜${attackMethodLabel}`,
    ability,
    statsLabel,
    validEvolution ? `進化「${validEvolution.name}」：${validEvolution.effect}` : null,
    specializationText ? `兵種專精：${specializationText}` : null,
  ].filter(Boolean).join('。');

  return {
    name: definition.name,
    tierLabel,
    rangeLabel,
    attackMethodLabel,
    ability,
    statsLabel,
    evolutionLabel,
    evolutionEffect,
    specializationText,
    text,
  };
}
