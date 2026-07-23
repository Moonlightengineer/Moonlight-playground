const STEPS = Object.freeze([
  { action: 'SELECT_CARD', text: '第一步：點選兩張可以組成武將嘅中文字牌。' },
  { action: 'ASSEMBLE_UNIT', text: '第二步：點一個高亮空格，將字牌合成並部署武將。' },
  { action: 'OPEN_RANGE', text: '第三步：點已部署武將，查看攻擊方向同射程。' },
  { action: 'START_PHASE', text: '第四步：開始第一段戰鬥。' },
  { action: 'USE_ORDER', text: '第五步：暫停戰鬥，使用一次軍令。' },
]);

export function createTutorial() {
  return { index: 0, complete: false, skipped: false };
}

export function advanceTutorial(tutorial, completedAction) {
  if (!tutorial || tutorial.complete || tutorial.skipped) return tutorial;
  if (STEPS[tutorial.index]?.action !== completedAction) return tutorial;
  const index = tutorial.index + 1;
  return { ...tutorial, index, complete: index >= STEPS.length };
}

export function skipTutorial(tutorial) {
  return { ...tutorial, skipped: true, complete: true };
}

export function tutorialText(tutorial) {
  if (!tutorial || tutorial.skipped) return '教學已略過。';
  if (tutorial.complete) return '教學完成，可以自由遠征。';
  return STEPS[tutorial.index]?.text ?? '';
}

export const TUTORIAL_STEPS = STEPS;
