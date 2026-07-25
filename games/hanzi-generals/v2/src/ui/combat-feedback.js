function cssEscape(value) {
  const text = String(value ?? '');
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(text);
  return text.replaceAll('"', '\\"');
}

function anchorFor(root, kind, id) {
  if (!id) return null;
  const attribute = kind === 'unit' ? 'data-unit-id' : 'data-enemy-id';
  return root.querySelector(`[${attribute}="${cssEscape(id)}"]`);
}

function laneAnchor(root, lane) {
  return root.querySelector(`[data-lane-track="${Number(lane)}"]`)
    ?? root.querySelector(`.enemy-lane[data-lane="${Number(lane)}"]`);
}

function centerOf(element) {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function reducedMotionEnabled(value) {
  return typeof value === 'function' ? Boolean(value()) : Boolean(value);
}

function eventText(event) {
  const payload = event.payload ?? {};
  const labels = {
    UNIT_HIT: `${payload.attackerId ?? '友軍'} → ${payload.targetId ?? '敵軍'}：${payload.damage ?? '?'} 傷害${payload.evolutionId ? `（${payload.evolutionId}）` : ''}`,
    FRIENDLY_DAMAGED: `${payload.attackerId ?? '敵軍'} → ${payload.targetId ?? '友軍'}：${payload.damage ?? '?'} 傷害`,
    WALL_DAMAGED: `${payload.attackerId ?? '敵軍'}攻擊第 ${(payload.lane ?? 0) + 1} 路城牆：${payload.damage ?? '?'} 傷害`,
    ENEMY_DEFEATED: `${payload.enemyId ?? '敵軍'}被擊破`,
    UNIT_DEFEATED: `${payload.unitId ?? '友軍'}倒下`,
    FIRE_ARROWS_HIT: `火矢命中 ${payload.enemyId ?? '敵軍'}：${payload.damage ?? '?'} 傷害`,
    UNIT_HEALED: `${payload.unitId ?? '友軍'}回復 ${payload.amount ?? '?'} 生命`,
    UNIT_REINFORCED: `${payload.unitId ?? '友軍'}援防至第 ${(payload.targetCell?.column ?? 0) + 1} 路`,
    FORTIFY_ORDERED: `第 ${(payload.lane ?? 0) + 1} 路開始堅守`,
    FOCUS_ORDERED: `集火目標：${payload.enemyId ?? '敵軍'}`,
  };
  return labels[event.type] ?? null;
}

export function createCombatFeedback({ root, reducedMotion = false }) {
  const layer = root.querySelector('#combat-feedback-layer');
  if (!layer) throw new Error('Combat feedback layer is missing');

  const activeNodes = new Set();
  const activeAnchors = new Set();
  const timers = new Set();
  const queue = [];
  const recentLog = [];
  let running = false;
  let generation = 0;

  const log = document.createElement('ol');
  log.id = 'combat-log';
  log.className = 'combat-log';
  log.dataset.combatLogVisible = 'true';
  log.setAttribute('aria-live', 'polite');
  log.setAttribute('aria-label', '最近戰報');
  layer.after(log);

  function speed() {
    return Number(root.dataset.combatSpeed) === 2 ? 2 : 1;
  }

  function pacing() {
    if (reducedMotionEnabled(reducedMotion)) return speed() === 2 ? 170 : 280;
    return speed() === 2 ? 300 : 600;
  }

  function rememberNode(node) {
    activeNodes.add(node);
    layer.append(node);
    return node;
  }

  function rememberAnchor(anchor, className) {
    if (!anchor) return;
    anchor.classList.add(className);
    activeAnchors.add(anchor);
  }

  function scheduleCleanup(callback, delay = 620) {
    const timer = window.setTimeout(() => {
      timers.delete(timer);
      callback();
    }, delay);
    timers.add(timer);
  }

  function eventLabel(text, point, className = 'combat-event-text') {
    const label = document.createElement('span');
    label.className = className;
    label.textContent = text;
    const position = point ?? { x: window.innerWidth / 2, y: Math.max(48, window.innerHeight * 0.36) };
    label.style.left = `${position.x}px`;
    label.style.top = `${position.y}px`;
    rememberNode(label);
    scheduleCleanup(() => {
      label.remove();
      activeNodes.delete(label);
    }, Math.max(300, pacing()));
    return label;
  }

  function projectile(sourcePoint, targetPoint) {
    if (!sourcePoint || !targetPoint || reducedMotionEnabled(reducedMotion)) return null;
    const dx = targetPoint.x - sourcePoint.x;
    const dy = targetPoint.y - sourcePoint.y;
    const cue = document.createElement('span');
    cue.className = 'combat-projectile';
    cue.style.left = `${sourcePoint.x}px`;
    cue.style.top = `${sourcePoint.y}px`;
    cue.style.width = `${Math.hypot(dx, dy)}px`;
    cue.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
    rememberNode(cue);
    scheduleCleanup(() => {
      cue.remove();
      activeNodes.delete(cue);
    }, Math.max(220, pacing() * 0.7));
    return cue;
  }

  function presentHit(event) {
    const payload = event.payload ?? {};
    const friendlyAttack = event.type === 'UNIT_HIT';
    const source = friendlyAttack
      ? anchorFor(root, 'unit', payload.attackerId)
      : anchorFor(root, 'enemy', payload.attackerId);
    const target = friendlyAttack
      ? anchorFor(root, 'enemy', payload.targetId)
      : anchorFor(root, 'unit', payload.targetId);
    const sourcePoint = centerOf(source);
    const targetPoint = centerOf(target);

    rememberAnchor(source, 'is-attacking');
    projectile(sourcePoint, targetPoint);
    scheduleCleanup(() => rememberAnchor(target, 'is-hit'), Math.round(pacing() * 0.28));
    scheduleCleanup(() => eventLabel(`-${payload.damage ?? '?'}`, targetPoint, 'combat-damage'), Math.round(pacing() * 0.42));

    scheduleCleanup(() => {
      source?.classList.remove('is-attacking');
      target?.classList.remove('is-hit');
      if (source) activeAnchors.delete(source);
      if (target) activeAnchors.delete(target);
    }, pacing());
  }

  function presentWallHit(event) {
    const payload = event.payload ?? {};
    const source = anchorFor(root, 'enemy', payload.attackerId);
    const target = laneAnchor(root, payload.lane);
    const sourcePoint = centerOf(source);
    const targetPoint = centerOf(target);
    rememberAnchor(source, 'is-attacking');
    projectile(sourcePoint, targetPoint);
    scheduleCleanup(() => rememberAnchor(target, 'is-hit'), Math.round(pacing() * 0.28));
    scheduleCleanup(() => eventLabel(`城牆 -${payload.damage ?? '?'}`, targetPoint, 'combat-damage combat-wall-damage'), Math.round(pacing() * 0.42));
    scheduleCleanup(() => {
      source?.classList.remove('is-attacking');
      target?.classList.remove('is-hit');
      if (source) activeAnchors.delete(source);
      if (target) activeAnchors.delete(target);
    }, pacing());
  }

  function presentDefeat(event) {
    const payload = event.payload ?? {};
    const enemyDefeat = event.type === 'ENEMY_DEFEATED';
    const target = enemyDefeat
      ? anchorFor(root, 'enemy', payload.enemyId)
      : anchorFor(root, 'unit', payload.unitId);
    rememberAnchor(target, 'is-defeated');
    eventLabel(enemyDefeat ? '擊破' : '倒下', centerOf(target), 'combat-defeat');
    scheduleCleanup(() => {
      target?.classList.remove('is-defeated');
      if (target) activeAnchors.delete(target);
    }, Math.max(420, pacing()));
  }

  function appendLog(event) {
    const text = eventText(event);
    if (!text) return;
    recentLog.unshift(text);
    recentLog.splice(6);
    log.replaceChildren(...recentLog.map((entry) => {
      const item = document.createElement('li');
      item.textContent = entry;
      return item;
    }));
  }

  function presentEvent(event) {
    appendLog(event);
    if (event.type === 'UNIT_HIT' || event.type === 'FRIENDLY_DAMAGED') {
      presentHit(event);
      return;
    }
    if (event.type === 'WALL_DAMAGED') {
      presentWallHit(event);
      return;
    }
    if (event.type === 'ENEMY_DEFEATED' || event.type === 'UNIT_DEFEATED') {
      presentDefeat(event);
      return;
    }
    const text = eventText(event);
    if (text) eventLabel(text, null, 'combat-event-text');
  }

  function wait(delay, token) {
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        resolve(token === generation);
      }, delay);
      timers.add(timer);
    });
  }

  async function drain() {
    if (running) return;
    running = true;
    const token = generation;
    while (queue.length && token === generation) {
      const event = queue.shift();
      presentEvent(event);
      const current = root.querySelector('[data-last-combat-sequence]');
      current?.removeAttribute('data-last-combat-sequence');
      const relevant = event.payload?.attackerId ?? event.payload?.targetId ?? event.payload?.enemyId ?? event.payload?.unitId;
      const anchor = anchorFor(root, event.type === 'UNIT_HIT' ? 'unit' : 'enemy', relevant);
      anchor?.setAttribute('data-last-combat-sequence', String(event.turn ?? ''));
      const active = await wait(pacing(), token);
      if (!active) break;
    }
    running = false;
  }

  function present(events) {
    const meaningful = (events ?? []).filter((event) => eventText(event));
    queue.push(...meaningful);
    root.dataset.combatSequenceReadable = String(queue.length > 0 || running || meaningful.length > 0);
    drain();
  }

  function clear() {
    generation += 1;
    queue.length = 0;
    running = false;
    for (const timer of timers) window.clearTimeout(timer);
    timers.clear();
    for (const node of activeNodes) node.remove();
    activeNodes.clear();
    for (const anchor of activeAnchors) {
      anchor.classList.remove('is-attacking', 'is-hit', 'is-defeated');
    }
    activeAnchors.clear();
  }

  return { present, clear };
}
