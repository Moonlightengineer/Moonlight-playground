import { GENERAL_BY_ID } from '../../data/generals.js';
import { EVOLUTION_BY_ID } from '../../data/evolutions.js';

export function eligibleEvolutionGenerals(game) {
  return [...new Set(game.recruitedGeneralIds ?? [])]
    .filter((generalId) => {
      const general = GENERAL_BY_ID[generalId];
      return general?.kind === 'general'
        && !game.evolutions?.[generalId]
        && general.evolutions?.some((evolutionId) => EVOLUTION_BY_ID[evolutionId]?.generalId === generalId);
    });
}

export function validateEvolutionSelection(game, payload = {}) {
  const { generalId, evolutionId } = payload;
  if (!generalId || !evolutionId) {
    return { code: 'EVOLUTION_SELECTION_REQUIRED', message: '請先選擇已招募武將及進化方向。' };
  }
  if (!eligibleEvolutionGenerals(game).includes(generalId)) {
    return game.evolutions?.[generalId]
      ? { code: 'GENERAL_ALREADY_EVOLVED', message: '呢名武將已經完成進化。' }
      : { code: 'GENERAL_NOT_RECRUITED', message: '只可以進化今次遠征曾經招募嘅武將。' };
  }
  const general = GENERAL_BY_ID[generalId];
  const evolution = EVOLUTION_BY_ID[evolutionId];
  if (!general.evolutions.includes(evolutionId) || evolution?.generalId !== generalId) {
    return { code: 'EVOLUTION_MISMATCH', message: '進化方向同目標武將唔相符。' };
  }
  return null;
}
