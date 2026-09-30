import * as P from './physics.js';

const $ = (id) => document.getElementById(id);
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const reduced = () => motionQuery.matches;
const TEXT = '#e7ebf5';
const MUTED = '#8f99b5';
const GRID = 'rgba(160, 172, 204, 0.18)';

// ---------- formatting ----------
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
function sci(value, digits = 2) {
  const exponent = Math.floor(Math.log10(Math.abs(value)));
  const mantissa = value / 10 ** exponent;
  const power = String(exponent).split('').map((ch) => SUP[ch]).join('');
  return `${mantissa.toFixed(digits)} × 10${power}`;
}
const minus = (text) => text.replace('-', '−');
const eV = (value) => minus(`${value.toFixed(2)} eV`);
const nmText = (nm) => `${nm < 100 ? nm.toFixed(1) : Math.round(nm)} nm`;
const regionShort = { ultraviolet: 'UV', visible: 'visible', infrared: 'IR' };

// ---------- canvas helpers ----------
function setupCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { canvas, ctx, w: 0, h: 0 };
  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    view.w = rect.width;
    view.h = rect.height;
  };
  new ResizeObserver(resize).observe(canvas);
  resize();
  return view;
}

function wavePx(nm) {
  const t = (Math.log(nm) - Math.log(80)) / (Math.log(2000) - Math.log(80));
  return Math.min(16, Math.max(4, 4 + 12 * t));
}

// A short wave packet: a photon drawn as a wiggle along its direction of travel.
function drawPhoton(ctx, x, y, angle, colour, nm) {
  const length = 36;
  const lambda = wavePx(nm);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.strokeStyle = colour;
  ctx.lineWidth = 2.5;
  ctx.shadowColor = colour;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  for (let s = -length; s <= 0; s += 1) {
    const envelope = Math.sin((Math.PI * (s + length)) / length);
    const yy = 6 * envelope * Math.sin((2 * Math.PI * s) / lambda);
    if (s === -length) ctx.moveTo(s, yy);
    else ctx.lineTo(s, yy);
  }
  ctx.stroke();
  ctx.restore();
}

function drawElectron(ctx, x, y, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#5cc8ff';
  ctx.shadowColor = '#5cc8ff';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(x, y, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#062033';
  ctx.fillRect(x - 3.5, y - 1, 7, 2);
  ctx.restore();
}

function arrowHead(ctx, x, y, dir) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - 5, y - 8 * dir);
  ctx.lineTo(x + 5, y - 8 * dir);
  ctx.closePath();
  ctx.fill();
}

// ---------- tabs ----------
const tabs = [...document.querySelectorAll('[role="tab"]')];
let activeTab = 'pe';
function selectTab(id, focus = false) {
  activeTab = id;
  for (const tab of tabs) {
    const on = tab.id === `tab-${id}`;
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
    $(tab.getAttribute('aria-controls')).hidden = !on;
    if (on && focus) tab.focus();
  }
}
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectTab(tab.id.slice(4)));
  tab.addEventListener('keydown', (event) => {
    let next = null;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next === null) return;
    event.preventDefault();
    selectTab(tabs[next].id.slice(4), true);
  });
});

$('projector-toggle').addEventListener('click', (event) => {
  const on = document.documentElement.classList.toggle('projector');
  event.currentTarget.setAttribute('aria-pressed', String(on));
});

function setVerdict(node, text, tone) {
  node.textContent = text;
  node.className = `verdict${tone ? ` ${tone}` : ''}`;
}

// =====================================================================
// Photoelectric effect
// =====================================================================
const pe = {
  nm: 450,
  metal: P.METALS[1],
  intensity: 4,
  beam: false,
  photons: [],
  electrons: [],
  sparks: [],
  hits: 0,
  emitted: 0,
  spawnDebt: 0,
};
const peView = setupCanvas($('pe-canvas'));
const peGraph = setupCanvas($('pe-graph'));

for (const metal of P.METALS) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.metal = metal.id;
  button.textContent = `${metal.name} ${metal.phi.toFixed(1)} eV`;
  button.addEventListener('click', () => { pe.metal = metal; peUpdate(); });
  $('pe-metals').append(button);
}

function peGeometry() {
  const { w, h } = peView;
  return {
    lamp: { x: Math.max(34, w * 0.12), y: h * 0.2 },
    plate: { x0: w * 0.3, x1: w * 0.94, y: h * 0.72, t: 24 },
  };
}

function peSpawn() {
  if (!peView.w || pe.photons.length > 60) return;
  const { lamp, plate } = peGeometry();
  const tx = plate.x0 + 12 + Math.random() * (plate.x1 - plate.x0 - 24);
  const angle = Math.atan2(plate.y - lamp.y, tx - lamp.x);
  const speed = reduced() ? 1400 : 260;
  pe.photons.push({ x: lamp.x, y: lamp.y, angle, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, nm: pe.nm });
}

function peHit(photon) {
  pe.hits += 1;
  const result = P.photoelectric(photon.nm, pe.metal.phi);
  if (result.emits) {
    pe.emitted += 1;
    const speed = 16 + 95 * Math.sqrt(result.keMax);
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.1;
    pe.electrons.push({ x: photon.x, y: photon.y - 4, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, age: 0 });
  } else {
    pe.sparks.push({ x: photon.x, y: photon.y, age: 0 });
  }
  peCounts();
}

function peStep(dt) {
  if (pe.beam) {
    pe.spawnDebt += dt * pe.intensity * 1.5;
    while (pe.spawnDebt >= 1) { pe.spawnDebt -= 1; peSpawn(); }
  }
  const { plate } = peGeometry();
  pe.photons = pe.photons.filter((photon) => {
    photon.x += photon.vx * dt;
    photon.y += photon.vy * dt;
    if (photon.y >= plate.y) { photon.y = plate.y; peHit(photon); return false; }
    return true;
  });
  pe.electrons = pe.electrons.filter((electron) => {
    electron.age += dt;
    electron.x += electron.vx * dt;
    electron.y += electron.vy * dt;
    return electron.y > -20 && electron.x > -20 && electron.x < peView.w + 20 && electron.age < 12;
  });
  pe.sparks = pe.sparks.filter((spark) => (spark.age += dt) < 0.5);
  peDraw();
}

function peDraw() {
  const { ctx, w, h } = peView;
  if (!w) return;
  ctx.clearRect(0, 0, w, h);
  const { lamp, plate } = peGeometry();
  const colour = P.wavelengthColour(pe.nm);

  // lamp
  ctx.save();
  ctx.fillStyle = colour;
  ctx.shadowColor = colour;
  ctx.shadowBlur = pe.beam ? 26 : 10;
  ctx.beginPath();
  ctx.arc(lamp.x, lamp.y, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#3a4466';
  ctx.fillRect(lamp.x - 20, lamp.y - 26, 40, 10);
  ctx.fillStyle = TEXT;
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`λ = ${Math.round(pe.nm)} nm`, lamp.x, lamp.y + 32);

  for (const photon of pe.photons) drawPhoton(ctx, photon.x, photon.y, photon.angle, P.wavelengthColour(photon.nm), photon.nm);

  // metal plate with free electrons inside
  const gradient = ctx.createLinearGradient(0, plate.y, 0, plate.y + plate.t);
  gradient.addColorStop(0, '#c7ccd9');
  gradient.addColorStop(1, '#6f7790');
  ctx.fillStyle = gradient;
  ctx.fillRect(plate.x0, plate.y, plate.x1 - plate.x0, plate.t);
  ctx.fillStyle = 'rgba(20, 60, 110, 0.55)';
  for (let x = plate.x0 + 10; x < plate.x1 - 4; x += 18) {
    ctx.beginPath();
    ctx.arc(x, plate.y + plate.t / 2, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = TEXT;
  ctx.textAlign = 'center';
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.fillText(`${pe.metal.name} (φ = ${pe.metal.phi.toFixed(1)} eV)`, (plate.x0 + plate.x1) / 2, plate.y + plate.t + 20);

  for (const electron of pe.electrons) drawElectron(ctx, electron.x, electron.y);
  for (const spark of pe.sparks) {
    const t = spark.age / 0.5;
    ctx.strokeStyle = `rgba(255, 183, 77, ${1 - t})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(spark.x, spark.y, 3 + 12 * t, Math.PI, Math.PI * 2);
    ctx.stroke();
  }

  ctx.textAlign = 'right';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillStyle = MUTED;
  ctx.fillText(`photons hit: ${pe.hits}`, w - 10, 18);
  ctx.fillText(`electrons out: ${pe.emitted}`, w - 10, 34);
}

function peCounts() {
  $('pe-count').textContent = `${pe.hits} / ${pe.emitted}`;
}

function peUpdate() {
  const result = P.photoelectric(pe.nm, pe.metal.phi);
  const region = P.spectralRegion(pe.nm);
  $('pe-wavelength-out').textContent = `${Math.round(pe.nm)} nm · ${region}`;
  $('pe-intensity-out').textContent = `${pe.intensity} / 10`;
  for (const button of $('pe-metals').children) {
    button.setAttribute('aria-pressed', String(button.dataset.metal === pe.metal.id));
  }
  $('pe-energy').textContent = `${eV(result.energy)} (${sci(result.energy * P.E_CHARGE)} J)`;
  $('pe-frequency').textContent = `${sci(P.frequencyHz(pe.nm))} Hz`;
  $('pe-phi').textContent = eV(pe.metal.phi);
  $('pe-threshold').textContent = `${sci(result.thresholdHz)} Hz / ${Math.round(result.thresholdNm)} nm`;
  $('pe-ke').textContent = result.emits ? eV(result.keMax) : 'no emission';
  $('pe-vs').textContent = result.emits ? `${result.keMax.toFixed(2)} V` : '—';
  peCounts();

  const scale = (value) => `${Math.min(100, (value / 13) * 100)}%`;
  $('pe-bar-photon').style.width = scale(result.energy);
  const phiBar = $('pe-bar-phi');
  phiBar.style.width = scale(pe.metal.phi);
  phiBar.classList.toggle('short', !result.emits);
  $('pe-bar-ke').style.width = scale(result.keMax);

  const photon = `Each photon carries hf = ${eV(result.energy)}`;
  if (result.emits) {
    setVerdict($('pe-verdict'),
      `Electrons escape. ${photon} and gives all of it to one electron: ${eV(pe.metal.phi)} is used to escape the surface and up to ${eV(result.keMax)} is left as kinetic energy. Changing the intensity changes how many electrons come out, not their KE_max.`,
      'good');
  } else {
    setVerdict($('pe-verdict'),
      `No electrons escape at any intensity. ${photon}, which is ${eV(result.shortBy)} short of the work function (${eV(pe.metal.phi)}). One electron cannot add up energy from several photons. Use λ below ${Math.round(result.thresholdNm)} nm (f above ${sci(result.thresholdHz)} Hz).`,
      'bad');
  }
}

function peGraphDraw() {
  const { ctx, w, h } = peGraph;
  if (!w) return;
  ctx.clearRect(0, 0, w, h);
  const pad = { l: 42, r: 14, t: 14, b: 34 };
  const fMax = 3.2e15;
  const yMin = -5;
  const yMax = 11;
  const X = (f) => pad.l + (f / fMax) * (w - pad.l - pad.r);
  const Y = (ke) => pad.t + ((yMax - ke) / (yMax - yMin)) * (h - pad.t - pad.b);

  ctx.font = '11px system-ui, sans-serif';
  ctx.lineWidth = 1;
  for (let ke = yMin + 1; ke <= yMax; ke += 2) {
    ctx.strokeStyle = GRID;
    ctx.beginPath(); ctx.moveTo(pad.l, Y(ke)); ctx.lineTo(w - pad.r, Y(ke)); ctx.stroke();
    ctx.fillStyle = MUTED; ctx.textAlign = 'right'; ctx.fillText(String(ke), pad.l - 6, Y(ke) + 4);
  }
  for (let f = 0.5e15; f <= fMax; f += 0.5e15) {
    ctx.strokeStyle = GRID;
    ctx.beginPath(); ctx.moveTo(X(f), pad.t); ctx.lineTo(X(f), h - pad.b); ctx.stroke();
    ctx.fillStyle = MUTED; ctx.textAlign = 'center'; ctx.fillText((f / 1e15).toFixed(1), X(f), Y(yMin) + 14);
  }
  ctx.strokeStyle = TEXT;
  ctx.beginPath(); ctx.moveTo(pad.l, Y(0)); ctx.lineTo(w - pad.r, Y(0)); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, h - pad.b); ctx.stroke();
  ctx.fillStyle = TEXT;
  ctx.textAlign = 'right';
  ctx.fillText('f / 10¹⁵ Hz', w - pad.r, h - 4);
  ctx.textAlign = 'left';
  ctx.fillText('KE_max / eV', pad.l + 6, pad.t + 10);

  for (const metal of P.METALS) {
    const selected = metal.id === pe.metal.id;
    const f0 = (metal.phi * P.E_CHARGE) / P.H;
    const ke = (f) => (P.H * f) / P.E_CHARGE - metal.phi;
    ctx.strokeStyle = selected ? '#7d97ff' : 'rgba(170, 180, 210, 0.35)';
    ctx.lineWidth = selected ? 3 : 1.5;
    ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.moveTo(X(0), Y(ke(0))); ctx.lineTo(X(f0), Y(0)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(X(f0), Y(0)); ctx.lineTo(X(fMax), Y(ke(fMax))); ctx.stroke();
    if (selected) {
      ctx.fillStyle = '#7d97ff';
      ctx.textAlign = 'left';
      ctx.fillText(`f₀ (${metal.name})`, X(f0) + 4, Y(0) + 14);
      ctx.textAlign = 'right';
      ctx.fillText(`−φ = −${metal.phi.toFixed(1)}`, pad.l + 70, Y(-metal.phi) - 6);
    }
  }

  const f = P.frequencyHz(pe.nm);
  const result = P.photoelectric(pe.nm, pe.metal.phi);
  ctx.strokeStyle = P.wavelengthColour(pe.nm);
  ctx.setLineDash([2, 4]);
  ctx.beginPath(); ctx.moveTo(X(f), pad.t); ctx.lineTo(X(f), h - pad.b); ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  if (result.emits) {
    ctx.fillStyle = '#4fd18a';
    ctx.arc(X(f), Y(result.keMax), 6, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.strokeStyle = '#ff8a80';
    ctx.lineWidth = 2.5;
    ctx.arc(X(f), Y(0), 6, 0, Math.PI * 2);
    ctx.stroke();
  }
}

$('pe-wavelength').addEventListener('input', (event) => { pe.nm = Number(event.target.value); peUpdate(); });
$('pe-intensity').addEventListener('input', (event) => { pe.intensity = Number(event.target.value); peUpdate(); });
$('pe-fire').addEventListener('click', peSpawn);
$('pe-beam').addEventListener('click', (event) => {
  pe.beam = !pe.beam;
  event.currentTarget.setAttribute('aria-pressed', String(pe.beam));
  event.currentTarget.textContent = pe.beam ? 'Beam off' : 'Beam on';
});
$('pe-reset').addEventListener('click', () => {
  pe.hits = 0; pe.emitted = 0; pe.photons = []; pe.electrons = []; pe.sparks = [];
  peCounts();
});

function peApply({ metal, nm, intensity, beam }) {
  if (metal) pe.metal = P.METALS.find((item) => item.id === metal);
  if (nm) { pe.nm = nm; $('pe-wavelength').value = nm; }
  if (intensity) { pe.intensity = intensity; $('pe-intensity').value = intensity; }
  if (beam !== undefined && beam !== pe.beam) $('pe-beam').click();
  peUpdate();
}

// =====================================================================
// Hydrogen atom (Bohr model)
// =====================================================================
const h = {
  start: 1,
  level: 1,
  ionised: false,
  energy: 10.2,
  angle: -Math.PI / 2,
  radius: null,
  photon: null,
  flyers: [],
  arrows: [],
  lines: new Map(),
  busy: false,
  timer: null,
};
const atomView = setupCanvas($('h-atom'));
const levelView = setupCanvas($('h-levels'));
const spectrumView = setupCanvas($('h-spectrum'));
const PRESETS = [1.89, 2.55, 3.40, 10.20, 11.00, 12.09, 12.75, 13.60, 15.00];

for (const value of PRESETS) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = value.toFixed(2);
  button.setAttribute('aria-label', `${value.toFixed(2)} eV`);
  button.addEventListener('click', () => hSetEnergy(value));
  $('h-presets').append(button);
}

function orbitRadius(n) {
  const { w, h: height } = atomView;
  const max = Math.min(w, height) / 2 - 14;
  const min = 18;
  return min + ((n - 1) * (max - min)) / (P.MAX_LEVEL - 1);
}

function electronPosition() {
  const cx = atomView.w / 2;
  const cy = atomView.h / 2;
  const r = h.radius ?? orbitRadius(h.level);
  return { x: cx + r * Math.cos(h.angle), y: cy + r * Math.sin(h.angle) };
}

function hSetEnergy(value) {
  const clamped = Math.min(16, Math.max(0.5, Math.round(value * 100) / 100));
  h.energy = clamped;
  $('h-energy').value = clamped;
  $('h-energy-number').value = clamped.toFixed(2);
  const nm = P.wavelengthNm(clamped);
  $('h-energy-out').textContent = `${eV(clamped)} · λ = ${nmText(nm)} (${regionShort[P.spectralRegion(nm)]})`;
  for (const button of $('h-presets').children) {
    button.setAttribute('aria-pressed', String(Number(button.textContent) === clamped));
  }
  hTable();
  if (!h.busy && !h.ionised) {
    setVerdict($('h-verdict'),
      `Photon ready: ${eV(clamped)}. Electron in n = ${h.level} (${eV(P.levelEnergy(h.level))}). Predict first: absorbed, ionised, or passes through? Then fire.`);
  }
}

function hTable() {
  const body = $('h-gaps');
  body.replaceChildren();
  if (h.ionised) {
    const row = body.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 3;
    cell.textContent = 'No electron left: the atom is ionised.';
    return;
  }
  for (const gap of P.gapsFrom(h.level)) {
    const row = body.insertRow();
    if (Math.abs(gap.energy - h.energy) <= P.MATCH_TOLERANCE_EV) row.className = 'match';
    row.insertCell().textContent = `n = ${h.level} → ${gap.upper}`;
    row.insertCell().textContent = eV(gap.energy);
    row.insertCell().textContent = `${nmText(gap.nm)} ${regionShort[gap.region]}`;
  }
  const ion = P.ionisationFrom(h.level);
  const row = body.insertRow();
  row.className = `ionise${h.energy >= ion - 1e-9 ? ' match' : ''}`;
  row.insertCell().textContent = `n = ${h.level} → ∞ (ionise)`;
  row.insertCell().textContent = `≥ ${eV(ion)}`;
  row.insertCell().textContent = `≤ ${nmText(P.wavelengthNm(ion))}`;
}

function hButtons() {
  $('h-fire').disabled = h.busy || h.ionised;
  $('h-fall').disabled = h.busy || h.ionised || h.level <= 1;
}

function hSchedule(fn, seconds) {
  clearTimeout(h.timer);
  h.timer = setTimeout(fn, (reduced() ? 0.25 : 1) * seconds * 1000);
}

function hFire() {
  if (h.busy || h.ionised) return;
  const outcome = P.hitAtom(h.level, h.energy);
  const nm = P.wavelengthNm(h.energy);
  h.arrows = [];
  h.busy = true;
  h.photon = {
    x: -30,
    y: null,
    energy: h.energy,
    nm,
    colour: P.wavelengthColour(nm),
    outcome,
    from: h.level,
    passed: false,
  };
  hButtons();
  setVerdict($('h-verdict'), `Photon of ${eV(h.energy)} on its way…`);
}

function hResolve(photon) {
  const { outcome, from, energy, colour } = photon;
  const startE = P.levelEnergy(from);
  const reach = startE + energy;
  if (outcome.type === 'excite') {
    h.level = outcome.to;
    h.arrows = [{ from: startE, to: reach, colour, kind: 'up' }];
    setVerdict($('h-verdict'),
      `Absorbed. ${eV(energy)} matches the gap from n = ${from} (${eV(startE)}) to n = ${outcome.to} (${eV(P.levelEnergy(outcome.to))}), so the electron jumps up to n = ${outcome.to}. Press "Let it fall back" to see it give out light.`,
      'good');
  } else if (outcome.type === 'ionise') {
    h.ionised = true;
    const cx = atomView.w / 2;
    const cy = atomView.h / 2;
    const pos = electronPosition();
    const angle = Math.atan2(pos.y - cy, pos.x - cx);
    const speed = 40 + 60 * Math.sqrt(outcome.ke);
    h.flyers.push({ kind: 'electron', x: pos.x, y: pos.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed });
    h.arrows = [{ from: startE, to: reach, colour, kind: 'ion' }];
    setVerdict($('h-verdict'),
      `Ionised! ${eV(energy)} is at least the ${eV(outcome.ionisation)} needed to free the electron from n = ${from}. The extra ${eV(outcome.ke)} becomes the kinetic energy of the free electron. Only the proton is left: a hydrogen ion (H⁺).`,
      'warn');
  } else {
    h.arrows = [{ from: startE, to: reach, colour, kind: 'miss' }];
    const beyond = reach > P.levelEnergy(P.MAX_LEVEL) + P.MATCH_TOLERANCE_EV
      ? ` (This simulator stops at n = ${P.MAX_LEVEL}. Real hydrogen has more levels crowded just below 0 eV.)` : '';
    setVerdict($('h-verdict'),
      `Not absorbed: the photon passes straight through. From n = ${from}, ${eV(energy)} would take the electron to ${eV(reach)}, but there is no energy level there, and it is less than the ${eV(outcome.ionisation)} needed to ionise. A photon cannot give away only part of its energy.${beyond}`,
      'bad');
  }
  hTable();
}

function hFall() {
  if (h.busy || h.ionised || h.level <= 1) return;
  h.arrows = [];
  h.busy = true;
  hButtons();
  hFallStep();
}

function hFallStep() {
  const upper = h.level;
  const lower = 1 + Math.floor(Math.random() * (upper - 1));
  const line = P.transition(upper, lower);
  const pos = electronPosition();
  h.level = lower;
  const colour = P.wavelengthColour(line.nm);
  h.arrows.push({ from: P.levelEnergy(upper), to: P.levelEnergy(lower), colour, kind: 'down' });
  const angle = Math.random() * Math.PI * 2;
  const speed = reduced() ? 900 : 240;
  h.flyers.push({ kind: 'photon', x: pos.x, y: pos.y, angle, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, colour, nm: line.nm });
  const key = `${upper}-${lower}`;
  h.lines.set(key, line);
  hSpectrumList();
  setVerdict($('h-verdict'),
    `The electron fell from n = ${upper} to n = ${lower} and emitted a photon of ${eV(line.energy)} (λ = ${nmText(line.nm)}, ${line.series} series, ${line.region}).${lower > 1 ? ' It keeps falling…' : ' It is back in the ground state.'}`,
    'good');
  hTable();
  if (lower > 1) {
    hSchedule(hFallStep, 1.1);
  } else {
    hSchedule(() => { h.busy = false; hButtons(); }, 0.4);
  }
}

function hReset() {
  clearTimeout(h.timer);
  h.level = h.start;
  h.ionised = false;
  h.photon = null;
  h.flyers = [];
  h.arrows = [];
  h.busy = false;
  h.radius = null;
  hButtons();
  hTable();
  setVerdict($('h-verdict'),
    `Electron in n = ${h.level} (${eV(P.levelEnergy(h.level))}). Choose a photon energy, predict what will happen, then fire.`);
}

function hStep(dt) {
  if (!atomView.w) return;
  if (!reduced()) h.angle += dt * (1.6 / h.level);
  const target = orbitRadius(h.level);
  if (h.radius === null) h.radius = target;
  h.radius += (target - h.radius) * Math.min(1, dt * (reduced() ? 60 : 7));

  const photon = h.photon;
  if (photon) {
    if (photon.y === null) photon.y = atomView.h / 2;
    const speed = reduced() ? 1600 : 230;
    if (photon.outcome.type === 'none') {
      photon.x += speed * dt;
      photon.angle = 0;
      if (!photon.passed && photon.x >= atomView.w / 2) { photon.passed = true; hResolve(photon); }
      if (photon.x > atomView.w + 40) { h.photon = null; h.busy = false; hButtons(); }
    } else {
      const pos = electronPosition();
      const dx = pos.x - photon.x;
      const dy = pos.y - photon.y;
      const dist = Math.hypot(dx, dy);
      photon.angle = Math.atan2(dy, dx);
      if (dist < 10 || dist < speed * dt) {
        h.photon = null;
        hResolve(photon);
        h.busy = false;
        hButtons();
      } else {
        photon.x += (dx / dist) * speed * dt;
        photon.y += (dy / dist) * speed * dt;
      }
    }
  }
  h.flyers = h.flyers.filter((item) => {
    item.x += item.vx * dt;
    item.y += item.vy * dt;
    return item.x > -40 && item.y > -40 && item.x < atomView.w + 40 && item.y < atomView.h + 40;
  });
  hDrawAtom();
  hDrawLevels();
}

function hDrawAtom() {
  const { ctx, w, h: height } = atomView;
  ctx.clearRect(0, 0, w, height);
  const cx = w / 2;
  const cy = height / 2;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  for (let n = 1; n <= P.MAX_LEVEL; n += 1) {
    const r = orbitRadius(n);
    ctx.strokeStyle = n === h.level && !h.ionised ? 'rgba(125, 151, 255, 0.7)' : 'rgba(160, 172, 204, 0.25)';
    ctx.lineWidth = n === h.level && !h.ionised ? 2 : 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = MUTED;
    ctx.fillText(`${n}`, cx + r * 0.72 + 2, cy - r * 0.72 - 2);
  }
  ctx.fillStyle = '#ff6b6b';
  ctx.shadowColor = '#ff6b6b';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(cx, cy, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#2a0707';
  ctx.fillRect(cx - 3.5, cy - 1, 7, 2);
  ctx.fillRect(cx - 1, cy - 3.5, 2, 7);

  if (!h.ionised) {
    const pos = electronPosition();
    drawElectron(ctx, pos.x, pos.y);
  }
  for (const item of h.flyers) {
    if (item.kind === 'electron') drawElectron(ctx, item.x, item.y);
    else drawPhoton(ctx, item.x, item.y, item.angle, item.colour, item.nm);
  }
  if (h.photon) drawPhoton(ctx, h.photon.x, h.photon.y, h.photon.angle || 0, h.photon.colour, h.photon.nm);
  if (h.ionised) {
    ctx.fillStyle = TEXT;
    ctx.textAlign = 'center';
    ctx.fillText('H⁺ (electron removed)', cx, cy + 24);
  }
}

function hDrawLevels() {
  const { ctx, w, h: height } = levelView;
  if (!w) return;
  ctx.clearRect(0, 0, w, height);
  const top = 2.2;
  const bottom = -14.4;
  const Y = (E) => 12 + ((top - E) / (top - bottom)) * (height - 24);
  const x0 = 46;
  const x1 = w - 58;

  // continuum above 0 eV
  ctx.fillStyle = 'rgba(240, 179, 90, 0.12)';
  ctx.fillRect(x0, Y(top), x1 - x0, Y(0) - Y(top));
  ctx.fillStyle = '#f0b35a';
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('free electron (ionised)', (x0 + x1) / 2, Y(top) + 14);

  ctx.textAlign = 'left';
  for (let n = 1; n <= P.MAX_LEVEL; n += 1) {
    const y = Y(P.levelEnergy(n));
    const current = n === h.level && !h.ionised;
    ctx.strokeStyle = current ? '#7d97ff' : 'rgba(210, 218, 240, 0.7)';
    ctx.lineWidth = current ? 3 : 1.5;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
    if (n <= 4) {
      ctx.fillStyle = current ? '#7d97ff' : TEXT;
      ctx.textAlign = 'right';
      ctx.fillText(`n = ${n}`, x0 - 4, y + 4);
      ctx.textAlign = 'left';
      ctx.fillText(minus(P.levelEnergy(n).toFixed(2)), x1 + 4, y + 4);
    }
  }
  ctx.strokeStyle = '#f0b35a';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.beginPath(); ctx.moveTo(x0, Y(0)); ctx.lineTo(x1, Y(0)); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#f0b35a';
  ctx.textAlign = 'right';
  ctx.fillText('n = ∞', x0 - 4, Y(0) - 3);
  ctx.textAlign = 'left';
  ctx.fillText('0 eV', x1 + 4, Y(0) - 3);

  // every possible downward line from the current level
  if ($('h-all-lines').checked && !h.ionised && h.level > 1) {
    const pairs = [];
    for (let u = h.level; u >= 2; u -= 1) for (let l = u - 1; l >= 1; l -= 1) pairs.push([u, l]);
    const span = Math.min(18, (x1 - x0) * 0.45 / pairs.length);
    pairs.forEach(([u, l], i) => {
      const x = x1 - 10 - i * span;
      const line = P.transition(u, l);
      ctx.strokeStyle = P.wavelengthColour(line.nm);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, Y(P.levelEnergy(u))); ctx.lineTo(x, Y(P.levelEnergy(l)) - 6); ctx.stroke();
      arrowHead(ctx, x, Y(P.levelEnergy(l)), 1);
    });
    ctx.fillStyle = TEXT;
    ctx.textAlign = 'right';
    ctx.fillText(`${pairs.length} possible lines`, x1 - 4, Y(-9));
  }

  // arrows for the last event
  h.arrows.forEach((arrow, i) => {
    const x = x0 + 40 + i * 24;
    const yFrom = Y(arrow.from);
    const yTo = Y(Math.min(arrow.to, top - 0.3));
    ctx.strokeStyle = arrow.kind === 'miss' ? '#ff8a80' : arrow.colour;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 2.5;
    if (arrow.kind === 'miss') ctx.setLineDash([5, 4]);
    const dir = arrow.kind === 'down' ? 1 : -1;
    ctx.beginPath(); ctx.moveTo(x, yFrom); ctx.lineTo(x, yTo + 7 * dir * -1); ctx.stroke();
    ctx.setLineDash([]);
    if (arrow.kind === 'miss') {
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x - 6, yTo - 6); ctx.lineTo(x + 6, yTo + 6);
      ctx.moveTo(x + 6, yTo - 6); ctx.lineTo(x - 6, yTo + 6);
      ctx.stroke();
      ctx.textAlign = 'left';
      ctx.fillText('no level here', x + 10, yTo + 4);
    } else {
      arrowHead(ctx, x, yTo, dir);
    }
  });

  // electron marker
  if (h.ionised) {
    drawElectron(ctx, x0 + 18, Y(1.1));
  } else {
    drawElectron(ctx, x0 + 18, Y(P.levelEnergy(h.level)));
  }
  ctx.fillStyle = MUTED;
  ctx.textAlign = 'left';
  ctx.fillText('E / eV', x1 + 4, 14);
}

function hSpectrumList() {
  const list = $('h-emitted');
  list.replaceChildren();
  const lines = [...h.lines.values()].sort((a, b) => a.nm - b.nm);
  for (const line of lines) {
    const item = document.createElement('li');
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = P.wavelengthColour(line.nm);
    item.append(swatch, `${line.upper}→${line.lower} · ${nmText(line.nm)} · ${line.series} (${regionShort[line.region]})`);
    list.append(item);
  }
  hDrawSpectrum();
}

function hDrawSpectrum() {
  const { ctx, w, h: height } = spectrumView;
  if (!w) return;
  ctx.clearRect(0, 0, w, height);
  const lo = Math.log(80);
  const hi = Math.log(2000);
  const X = (nm) => 10 + ((Math.log(nm) - lo) / (hi - lo)) * (w - 20);
  const band = { y: 26, h: height - 52 };
  const gradient = ctx.createLinearGradient(X(400), 0, X(700), 0);
  for (let nm = 400; nm <= 700; nm += 25) gradient.addColorStop((nm - 400) / 300, P.wavelengthColour(nm));
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = gradient;
  ctx.fillRect(X(400), band.y, X(700) - X(400), band.h);
  ctx.globalAlpha = 1;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = MUTED;
  ctx.fillText('UV', (X(80) + X(400)) / 2, 16);
  ctx.fillText('visible', (X(400) + X(700)) / 2, 16);
  ctx.fillText('IR', (X(700) + X(2000)) / 2, 16);
  for (const nm of [100, 200, 400, 700, 1000, 2000]) {
    ctx.fillText(String(nm), Math.min(w - 14, X(nm)), height - 8);
  }
  for (const line of h.lines.values()) {
    const x = X(line.nm);
    ctx.strokeStyle = P.wavelengthColour(line.nm);
    ctx.lineWidth = 3;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.moveTo(x, band.y); ctx.lineTo(x, band.y + band.h); ctx.stroke();
    ctx.shadowBlur = 0;
  }
  if (!h.lines.size) {
    ctx.fillStyle = MUTED;
    ctx.fillText(w < 420 ? 'Lines appear when the electron falls.' : 'Lines appear here when the electron falls to a lower level.', w / 2, band.y + band.h / 2 + 4);
  }
}

$('h-energy').addEventListener('input', (event) => hSetEnergy(Number(event.target.value)));
$('h-energy-number').addEventListener('change', (event) => hSetEnergy(Number(event.target.value) || 0.5));
$('h-start').addEventListener('change', (event) => { h.start = Number(event.target.value); hReset(); });
$('h-fire').addEventListener('click', hFire);
$('h-fall').addEventListener('click', hFall);
$('h-reset').addEventListener('click', hReset);
$('h-clear-spectrum').addEventListener('click', () => { h.lines.clear(); hSpectrumList(); });
new ResizeObserver(hDrawSpectrum).observe($('h-spectrum'));

function hApply({ start, energy, allLines, fire }) {
  if (start) { h.start = start; $('h-start').value = String(start); }
  hReset();
  if (allLines !== undefined) $('h-all-lines').checked = allLines;
  if (energy) hSetEnergy(energy);
  if (fire) hFire();
}

// =====================================================================
// Quiz
// =====================================================================
const QUESTIONS = [
  {
    q: 'Monochromatic light shines on a metal surface but no photoelectrons are emitted. Which change could make photoelectrons be emitted?',
    options: ['Increase the intensity of the light', 'Shine the light for a longer time', 'Use light of a shorter wavelength', 'Use a larger metal plate'],
    answer: 2,
    explain: 'Emission depends on the energy of each photon, hf = hc/λ. A shorter wavelength gives each photon more energy. More intensity or more time only gives more photons of the same, too-small energy.',
    setup: { tab: 'pe', metal: 'zn', nm: 500, intensity: 10, beam: true },
  },
  {
    q: 'Photons of energy 3.5 eV fall on a metal of work function 2.3 eV. What is the maximum kinetic energy of the photoelectrons?',
    options: ['1.2 eV', '2.3 eV', '3.5 eV', '5.8 eV'],
    answer: 0,
    explain: 'KE_max = hf − φ = 3.5 − 2.3 = 1.2 eV.',
    setup: { tab: 'pe', metal: 'na', nm: 355, intensity: 4, beam: true },
  },
  {
    q: 'Light above the threshold frequency falls on a metal. The intensity is increased while the frequency is kept constant. Which of the following statements is/are correct?',
    statements: ['(1) More photoelectrons are emitted per second.', '(2) The maximum kinetic energy of the photoelectrons increases.', '(3) The stopping potential increases.'],
    options: ['(1) only', '(1) and (2) only', '(2) and (3) only', '(1), (2) and (3)'],
    answer: 0,
    explain: 'Higher intensity means more photons per second, so more electrons per second. Each photon still has the same hf, so KE_max and the stopping potential (eVₛ = KE_max) do not change.',
    setup: { tab: 'pe', metal: 'na', nm: 400, intensity: 10, beam: true },
  },
  {
    q: 'The work function of zinc is 4.3 eV. What is the threshold wavelength?',
    options: ['144 nm', '289 nm', '434 nm', '578 nm'],
    answer: 1,
    explain: 'λ₀ = hc/φ = (6.63 × 10⁻³⁴ × 3.0 × 10⁸) ÷ (4.3 × 1.6 × 10⁻¹⁹) = 2.89 × 10⁻⁷ m = 289 nm.',
    setup: { tab: 'pe', metal: 'zn', nm: 289, intensity: 4, beam: true },
  },
  {
    q: 'A hydrogen atom is in its ground state. Which photon can be absorbed by the atom?',
    options: ['1.89 eV', '10.20 eV', '12.00 eV', '3.40 eV'],
    answer: 1,
    explain: 'From n = 1, the possible gaps are 10.20 eV (to n = 2), 12.09 eV (to n = 3), 12.75 eV (to n = 4)… 1.89 eV is the gap between n = 2 and n = 3, not from the ground state. 3.40 eV would ionise from n = 2, not from n = 1.',
    setup: { tab: 'h', start: 1, energy: 10.2, fire: true },
  },
  {
    q: 'A photon of energy 11.0 eV is incident on a hydrogen atom in the ground state. What happens?',
    options: ['The electron jumps to n = 2 and the remaining 0.8 eV is emitted as another photon.', 'The atom is ionised.', 'The photon is not absorbed.', 'The electron jumps to n = 2 and the remaining 0.8 eV becomes its kinetic energy.'],
    answer: 2,
    explain: 'A photon is absorbed completely or not at all. 11.0 eV does not match any gap from n = 1 (10.20, 12.09, 12.75 eV…) and is less than 13.6 eV, so the photon passes through.',
    setup: { tab: 'h', start: 1, energy: 11.0, fire: true },
  },
  {
    q: 'What is the minimum energy needed to ionise a hydrogen atom whose electron is in the n = 2 level?',
    options: ['3.40 eV', '10.20 eV', '13.60 eV', '17.00 eV'],
    answer: 0,
    explain: 'E₂ = −13.6 / 2² = −3.40 eV. To reach 0 eV (n = ∞) the electron needs at least 3.40 eV.',
    setup: { tab: 'h', start: 2, energy: 3.4, fire: true },
  },
  {
    q: 'A sample of hydrogen atoms is excited to the n = 4 level. What is the maximum number of different spectral lines that can be emitted?',
    options: ['3', '4', '6', '10'],
    answer: 2,
    explain: 'Possible transitions: 4→3, 4→2, 4→1, 3→2, 3→1, 2→1, so 6 lines. In general n(n − 1)/2.',
    setup: { tab: 'h', start: 1, energy: 12.75, allLines: true, fire: true },
  },
  {
    q: 'Which transition of the electron in a hydrogen atom emits visible light?',
    options: ['n = 2 → n = 1', 'n = 3 → n = 2', 'n = 4 → n = 3', 'n = 5 → n = 1'],
    answer: 1,
    explain: '3 → 2 gives ΔE = 1.89 eV, λ ≈ 658 nm (red, Balmer series). Jumps to n = 1 are ultraviolet (Lyman); 4 → 3 is infrared (Paschen).',
    setup: { tab: 'h', start: 1, energy: 12.09, fire: true },
  },
  {
    q: 'A photon of energy 15.0 eV ionises a hydrogen atom in the ground state. What is the kinetic energy of the freed electron?',
    options: ['1.4 eV', '13.6 eV', '15.0 eV', '28.6 eV'],
    answer: 0,
    explain: '13.6 eV is used to free the electron from n = 1. The remaining 15.0 − 13.6 = 1.4 eV becomes its kinetic energy.',
    setup: { tab: 'h', start: 1, energy: 15.0, fire: true },
  },
];

const quiz = { answers: new Map() };

function quizScore() {
  const correct = [...quiz.answers.entries()].filter(([i, choice]) => QUESTIONS[i].answer === choice).length;
  $('quiz-score').textContent = `Score: ${correct} / ${quiz.answers.size} answered (${QUESTIONS.length} questions)`;
}

function openInSimulator(setup) {
  selectTab(setup.tab);
  if (setup.tab === 'pe') peApply(setup);
  else hApply(setup);
  $(`panel-${setup.tab}`).scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
}

function renderQuiz() {
  const list = $('quiz');
  list.replaceChildren();
  QUESTIONS.forEach((item, index) => {
    const li = document.createElement('li');
    const question = document.createElement('p');
    question.className = 'question';
    question.textContent = item.q;
    li.append(question);
    if (item.statements) {
      const statements = document.createElement('ul');
      statements.className = 'statements';
      for (const text of item.statements) {
        const s = document.createElement('li');
        s.textContent = text;
        statements.append(s);
      }
      li.append(statements);
    }
    const options = document.createElement('div');
    options.className = 'options';
    options.setAttribute('role', 'group');
    options.setAttribute('aria-label', `Question ${index + 1} options`);
    const feedback = document.createElement('div');
    feedback.className = 'explain';
    feedback.hidden = true;
    feedback.setAttribute('aria-live', 'polite');
    item.options.forEach((text, choice) => {
      const button = document.createElement('button');
      button.type = 'button';
      const letter = document.createElement('span');
      letter.className = 'letter';
      letter.textContent = 'ABCD'[choice];
      const label = document.createElement('span');
      label.textContent = text;
      button.append(letter, label);
      button.addEventListener('click', () => {
        if (quiz.answers.has(index)) return;
        quiz.answers.set(index, choice);
        [...options.children].forEach((b, i) => {
          b.disabled = true;
          if (i === item.answer) b.classList.add('correct');
          else if (i === choice) b.classList.add('wrong');
        });
        const right = choice === item.answer;
        feedback.replaceChildren();
        const verdict = document.createElement('strong');
        verdict.textContent = right ? 'Correct. ' : `Not quite. The answer is ${'ABCD'[item.answer]}. `;
        feedback.append(verdict, item.explain);
        if (item.setup) {
          const show = document.createElement('div');
          const go = document.createElement('button');
          go.type = 'button';
          go.textContent = 'Show me in the simulator →';
          go.addEventListener('click', () => openInSimulator(item.setup));
          show.append(go);
          feedback.append(show);
        }
        feedback.hidden = false;
        quizScore();
      });
      options.append(button);
    });
    li.append(options, feedback);
    list.append(li);
  });
  quizScore();
}

$('quiz-restart').addEventListener('click', () => { quiz.answers.clear(); renderQuiz(); });

// ---------- start ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (activeTab === 'pe') { peStep(dt); peGraphDraw(); }
  if (activeTab === 'h') hStep(dt);
  requestAnimationFrame(frame);
}

peUpdate();
hSetEnergy(h.energy);
hReset();
hSpectrumList();
renderQuiz();
requestAnimationFrame(frame);
