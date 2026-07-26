import { GENERAL_BY_ID } from '../../data/generals.js';
import { REWARDS } from '../../data/rewards.js';
import { eligibleEvolutionGenerals } from '../expedition/evolution-eligibility.js';
import { reduceGame as reduceBaseGame, ALLOWED } from './state-machine.js?base=1';

const SAFE_REWARD_FALLBACKS = Object.freeze([
  'extra-reroll',
  'extra-camp',
  'repair-wall',
  'fire-arrows',
  'first-aid',
]);

function recordAssembledGenerals(state, events) {
  const recruited = new Set(state.recruitedGeneralIds ?? []);
  for (const event of events ?? []) {
    if (event.type !== 'UNIT_ASSEMBLED') continue;
    const generalId = event.payload?.definitionId;
    if (GENERAL_BY_ID[generalId]?.kind === 'general') recruited.add(generalId);
  }
  return { ...state, recruitedGeneralIds: [...recruited] };
}

function normalizeEvolutionRewards(state) {
  if (state.status !== 'reward') return state;
  if (eligibleEvolutionGenerals(state).length) return state;

  const choices = (state.rewardChoices ?? []).filter(({ id }) => id !== 'evolve-general');
  const chosen = new Set(choices.map(({ id }) => id));
  for (const rewardId of SAFE_REWARD_FALLBACKS) {
    if (choices.length >= 3) break;
    if (chosen.has(rewardId)) continue;
    const reward = REWARDS.find(({ id }) => id === rewardId);
    if (!reward) continue;
    choices.push(reward);
    chosen.add(rewardId);
  }
  return { ...state, rewardChoices: choices.slice(0, 3) };
}

export function finalizeGameResult(result) {
  if (!result.ok) return result;
  const recruited = recordAssembledGenerals(result.state, result.events);
  return { ...result, state: normalizeEvolutionRewards(recruited) };
}

export function reduceGame(game, action) {
  return finalizeGameResult(reduceBaseGame(game, action));
}

export { ALLOWED };
