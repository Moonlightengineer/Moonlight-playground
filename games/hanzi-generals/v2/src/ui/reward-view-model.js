import { assessRewardAvailability } from '../reward/reward-flow.js';

const TARGET_REQUIRED = new Set(['copy-card', 'remove-card', 'evolve-general']);

const ZONE_LABELS = Object.freeze({
  drawPile: '抽牌堆',
  discardPile: '棄牌堆',
  hand: '手牌',
  camp: '軍營',
});

function targetLabel(reward, target) {
  if (target.type === 'evolution') return target.label;
  return `${reward.name}「${target.symbol}」・${ZONE_LABELS[target.zone] ?? target.zone}`;
}

function targetData(rewardId, target) {
  if (target.type === 'evolution') {
    return {
      rewardId,
      generalId: target.generalId,
      evolutionId: target.evolutionId,
    };
  }
  return { rewardId, cardId: target.cardId };
}

function targetChoice(reward, target) {
  const label = targetLabel(reward, target);
  return {
    label,
    action: 'choose-reward',
    data: targetData(reward.id, target),
    ariaLabel: `${label}。${reward.description.effect}`,
  };
}

export function buildRewardViewModels(game) {
  if (game.status !== 'reward') return [];
  return (game.rewardChoices ?? []).map((reward) => {
    const availability = assessRewardAvailability(game, reward);
    const targets = availability.targets;
    const requiresTarget = !reward.concrete && TARGET_REQUIRED.has(reward.baseId ?? reward.id);
    const disabled = !availability.available;
    return {
      id: reward.id,
      name: reward.name,
      summary: reward.description.summary,
      effect: reward.description.effect,
      useCase: reward.description.useCase,
      requiresTarget,
      disabled,
      disabledReason: disabled ? availability.reason : null,
      ariaLabel: `${reward.name}。${reward.description.summary} ${reward.description.effect} ${reward.description.useCase}`,
      action: disabled || requiresTarget ? null : 'choose-reward',
      data: { rewardId: reward.id },
      targetChoices: disabled ? [] : targets.map((target) => targetChoice(reward, target)),
    };
  });
}
