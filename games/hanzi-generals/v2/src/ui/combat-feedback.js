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

export function createCombatFeedback({ root, reducedMotion = false }) {
  const layer = root.querySelector('#combat-feedback-layer');
  if (!layer) throw new Error('Combat feedback layer is missing');

  const activeNodes = new Set();
  const activeAnchors = new Set();
  const timers = new Set();

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
    });
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
    }, 440);
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
    rememberAnchor(target, 'is-hit');
    projectile(sourcePoint, targetPoint);
    eventLabel(`-${payload.damage ?? '?'}`, targetPoint, 'combat-damage');

    scheduleCleanup(() => {
      source?.classList.remove('is-attacking');
      target?.classList.remove('is-hit');
      if (source) activeAnchors.delete(source);
      if (target) activeAnchors.delete(target);
    });
  }

  function presentWallHit(event) {
    const payload = event.payload ?? {};
    const source = anchorFor(root, 'enemy', payload.attackerId);
    const target = laneAnchor(root, payload.lane);
    const sourcePoint = centerOf(source);
    const targetPoint = centerOf(target);
    rememberAnchor(source, 'is-attacking');
    rememberAnchor(target, 'is-hit');
    projectile(sourcePoint, targetPoint);
    eventLabel(`城牆 -${payload.damage ?? '?'}`, targetPoint, 'combat-damage combat-wall-damage');
    scheduleCleanup(() => {
      source?.classList.remove('is-attacking');
      target?.classList.remove('is-hit');
      if (source) activeAnchors.delete(source);
      if (target) activeAnchors.delete(target);
    });
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
    }, 760);
  }

  function presentEvent(event) {
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
    }
  }

  function present(events) {
    for (const event of events ?? []) presentEvent(event);
  }

  function clear() {
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
