import { selectOrderTargets } from '../core/selectors/index.js';
import { buildAppViewModel as buildBaseViewModel } from './view-model.js';

export function buildAppViewModel(game, profile, ui) {
  const viewModel = buildBaseViewModel(game, profile, ui);
  const targets = selectOrderTargets(game);
  return {
    ...viewModel,
    orders: {
      ...viewModel.orders,
      swapPairs: targets.swapPairs.map((pair) => [...pair]),
      reinforce: targets.reinforce.map(({ unitId, targetCells }) => ({
        unitId,
        targetCells: targetCells.map((cell) => ({ ...cell })),
      })),
      focusEnemyIds: [...targets.focusEnemyIds],
      fortifyLanes: [...targets.fortifyLanes],
    },
  };
}
