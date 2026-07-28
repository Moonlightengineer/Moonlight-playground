export function buildBattleReportViewModel(report) {
  if (!report) return { visible: false, stats: [], continueIntent: null };
  const resultLabel = report.result === 'victory' ? '戰鬥勝利' : '戰鬥失敗';
  const destinationLabel = report.nextStatus === 'reward' ? '繼續選擇獎勵' : '查看遠征結果';
  return {
    visible: true,
    result: report.result,
    kicker: `第 ${report.battleNumber} 戰完成`,
    title: resultLabel,
    summary: report.result === 'victory'
      ? `成功完成 ${report.phasesCompleted} 個階段，城牆剩餘 ${report.wallHpEnd} 點。`
      : `城牆失守；本戰完成 ${report.phasesCompleted} 個階段。`,
    stats: [
      ['關卡', report.stageId],
      ['結果', resultLabel],
      ['總回合', report.totalTurns],
      ['完成階段', report.phasesCompleted],
      ['擊破敵軍', report.enemiesDefeated],
      ['投入單位', report.unitsFielded],
      ['損失單位', report.unitsLost],
      ['使用軍令', report.ordersUsed],
      ['城牆損傷', report.wallDamageTaken],
      ['剩餘城牆', report.wallHpEnd],
    ],
    eventCounts: { ...(report.eventCounts ?? {}) },
    continueLabel: destinationLabel,
    continueIntent: { type: 'CONTINUE_AFTER_REPORT' },
    action: 'continue-after-report',
  };
}
