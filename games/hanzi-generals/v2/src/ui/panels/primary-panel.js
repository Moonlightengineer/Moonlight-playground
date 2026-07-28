import { actionButton, node, setVisible } from './dom.js';

function appendActions(container, actions) {
  for (const action of actions) {
    const button = actionButton(action.label, action.action, {
      className: action.className,
      data: action.data,
      disabled: action.disabled,
      descriptionId: action.disabledReason ? 'primary-disabled-help' : undefined,
    });
    container.append(button);
  }
  const disabledReason = actions.find(({ disabledReason }) => disabledReason)?.disabledReason;
  if (disabledReason) {
    const help = node('p', 'visually-hidden', disabledReason);
    help.id = 'primary-disabled-help';
    container.append(help);
  }
}

function appendRewardDescription(container, reward) {
  container.append(
    node('span', 'reward-summary', reward.summary),
    node('span', 'reward-effect', reward.effect),
    node('span', 'reward-use-case', reward.useCase),
  );
}

function appendTargetReward(container, reward) {
  const panel = node('details', `reward-button reward-target-panel${reward.disabled ? ' is-disabled' : ''}`);
  panel.dataset.rewardId = reward.id;
  const summary = node('summary', 'reward-target-summary');
  summary.append(node('strong', 'reward-name', reward.name));
  panel.append(summary);
  appendRewardDescription(panel, reward);

  if (reward.disabledReason) panel.append(node('p', 'empty-copy', reward.disabledReason));
  const choices = node('div', 'reward-target-choices');
  for (const choice of reward.targetChoices) {
    choices.append(actionButton(choice.label, choice.action, {
      className: 'primary-button reward-target-choice',
      data: choice.data,
      ariaLabel: choice.ariaLabel,
    }));
  }
  panel.append(choices);
  container.append(panel);
}

function appendRewards(container, rewards) {
  for (const reward of rewards) {
    if (reward.requiresTarget) {
      appendTargetReward(container, reward);
      continue;
    }
    const button = actionButton('', reward.action, {
      className: 'primary-button reward-button',
      data: reward.data,
      disabled: reward.disabled,
      ariaLabel: reward.ariaLabel,
    });
    button.dataset.rewardId = reward.id;
    button.append(node('strong', 'reward-name', reward.name));
    appendRewardDescription(button, reward);
    container.append(button);
  }
}

function appendEvolution(container, evolution) {
  if (!evolution) return;
  const panel = node('details', 'evolution-choice-panel');
  panel.open = true;
  panel.dataset.evolutionChoiceVisible = 'true';
  panel.append(node('summary', '', evolution.title));
  panel.append(node('p', 'reward-summary', evolution.description));
  if (evolution.emptyText) panel.append(node('p', 'empty-copy', evolution.emptyText));
  for (const groupModel of evolution.groups) {
    const group = node('section', 'evolution-general-group');
    group.append(node('h3', '', groupModel.name));
    for (const choice of groupModel.choices) {
      const button = actionButton('', choice.action, {
        className: 'primary-button reward-button evolution-choice',
        data: choice.data,
        ariaLabel: choice.ariaLabel,
      });
      button.dataset.rewardId = 'evolve-general';
      button.append(
        node('strong', 'reward-name', choice.name),
        node('span', 'reward-summary', choice.summary),
        node('span', 'reward-effect', choice.effect),
      );
      group.append(button);
    }
    panel.append(group);
  }
  container.append(panel);
}

function appendStat(list, label, value) {
  const item = node('li', 'result-stat');
  item.append(node('strong', '', label), node('span', '', value));
  list.append(item);
}

function appendBattleReport(container, report) {
  if (!report?.visible) return;
  const panel = node('section', `battle-report report-${report.result}`);
  panel.dataset.battleReportVisible = 'true';
  panel.append(node('p', 'result-kicker', report.kicker));
  panel.append(node('h2', 'result-title', report.title));
  panel.append(node('p', 'result-summary', report.summary));
  const stats = node('ul', 'result-stats battle-report-stats');
  for (const [label, value] of report.stats) appendStat(stats, label, value);
  panel.append(stats);
  const eventEntries = Object.entries(report.eventCounts ?? {});
  if (eventEntries.length) {
    const details = node('details', 'result-details battle-report-events');
    details.append(node('summary', '', '查看事件統計'));
    const list = node('ul', 'result-stats');
    for (const [type, count] of eventEntries) appendStat(list, type, count);
    details.append(list);
    panel.append(details);
  }
  container.append(panel);
}

function appendResult(container, result) {
  if (!result) return;
  const panel = node('section', `expedition-result result-${result.status}`);
  panel.dataset.expeditionResultVisible = 'true';
  panel.append(node('p', 'result-kicker', result.kicker));
  panel.append(node('h2', 'result-title', result.title));
  panel.append(node('p', 'result-summary', result.summary));
  const stats = node('ul', 'result-stats');
  for (const [label, value] of result.stats) appendStat(stats, label, value);
  panel.append(stats);
  const details = node('details', 'result-details');
  details.append(node('summary', '', '查看詳情'));
  details.append(node('h3', '', '已解鎖武將／配方'), node('p', '', result.unlockedText));
  details.append(node('h3', '', '已取得獎勵'), node('p', '', result.rewardsText));
  details.append(node('h3', '', '已進化武將'), node('p', '', result.evolvedText));
  panel.append(details);
  container.append(panel);
}

export function renderPrimaryPanel(container, model) {
  if (!container) return;
  setVisible(container, model.visible);
  if (!model.visible) return;
  container.replaceChildren();
  appendBattleReport(container, model.battleReport);
  appendResult(container, model.result);
  appendEvolution(container, model.evolution);
  appendRewards(container, model.rewards);
  appendActions(container, model.actions);
}
