import { selectOrderTargets } from '../core/selectors/index.js';
import { buildBattleReportViewModel } from './battle-report-view-model.js';
import { buildRewardViewModels } from './reward-view-model.js';
import { buildAppViewModel as buildBaseViewModel } from './view-model.js';

function battleReportAction(report) {
  if (!report.visible || !report.continueIntent) return [];
  return [{
    label: report.continueLabel,
    intent: report.continueIntent,
    // Compatibility adapter until the interaction switch is deleted in T10.
    // The reducer still exposes CONTINUE_AFTER_REPORT as the canonical command.
    action: 'start-new-run',
    data: {},
    className: 'primary-button',
    disabled: false,
    disabledReason: null,
  }];
}

export function buildAppViewModel(game, profile, ui) {
  const viewModel = buildBaseViewModel(game, profile, ui);
  const targets = selectOrderTargets(game);
  const battleReport = buildBattleReportViewModel(game.battleReport);
  const rewards = buildRewardViewModels(game);
  return {
    ...viewModel,
    runStatus: {
      ...viewModel.runStatus,
      title: battleReport.visible ? '戰鬥報告' : viewModel.runStatus.title,
    },
    primary: {
      ...viewModel.primary,
      battleReport,
      rewards,
      evolution: null,
      actions: battleReport.visible
        ? battleReportAction(battleReport)
        : viewModel.primary.actions,
    },
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
