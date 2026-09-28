// Timeline: camera choreography and story state as pure functions of time.
// 24 fps, 96 BPM → one beat is exactly 15 frames, one bar 60 frames.
import {
  BEAT, CODE, CELL, CHAR_W, LINE_H, T_BUILD, T_RISE, T_LIGHT, T_RUN, T_PRINT,
  PRINT_STEP, OUTPUT, typingSchedule, cursorCell,
} from './city.js';

export const FPS = 24;
export const DURATION = 30;
export const FRAMES = FPS * DURATION;
export const BAR = BEAT * 4;
export const CUT = T_LIGHT;                    // the one hard cut, on the drop
export const CUTS = [CUT];

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// Non-uniform Catmull-Rom (Hermite with time-scaled tangents): C1 in time,
// so velocity never jumps between keys. `hold` zeroes a key's tangent.
export function track(keys) {
  const n = keys.length;
  const dim = Array.isArray(keys[0].v) ? keys[0].v.length : 1;
  const V = keys.map((k) => (dim === 1 ? [k.v] : k.v));
  const T = keys.map((k) => k.t);
  const M = keys.map((k, i) => {
    if (k.hold || n === 1) return new Array(dim).fill(0);
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    return V[i].map((_, d) => (V[b][d] - V[a][d]) / (T[b] - T[a]));
  });
  return (t) => {
    if (t <= T[0]) return dim === 1 ? V[0][0] : V[0].slice();
    if (t >= T[n - 1]) return dim === 1 ? V[n - 1][0] : V[n - 1].slice();
    let i = 0;
    while (t > T[i + 1]) i++;
    const h = T[i + 1] - T[i];
    const s = (t - T[i]) / h;
    const s2 = s * s, s3 = s2 * s;
    const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
    const out = V[i].map((_, d) => h00 * V[i][d] + h10 * h * M[i][d] + h01 * V[i + 1][d] + h11 * h * M[i + 1][d]);
    return dim === 1 ? out[0] : out;
  };
}

// Camera orientation from yaw/pitch/roll (degrees). yaw 0 looks toward -z
// (toward the moon); pitch -90 looks straight down with -z at the top of frame.
export function camRot(yawD, pitchD, rollD) {
  const y = yawD * Math.PI / 180, p = pitchD * Math.PI / 180, r = rollD * Math.PI / 180;
  const f = [Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p)];
  const r0 = [Math.cos(y), 0, Math.sin(y)];
  const u0 = [r0[1] * f[2] - r0[2] * f[1], r0[2] * f[0] - r0[0] * f[2], r0[0] * f[1] - r0[1] * f[0]];
  const c = Math.cos(r), s = Math.sin(r);
  const R = r0.map((v, i) => v * c + u0[i] * s);
  const U = u0.map((v, i) => v * c - r0[i] * s);
  return [...R, ...U, ...f];
}

// ---------------------------------------------------------------- shot 1
// 0–10 s. Top-down on a black "screen" while the code streams in, then
// the pixels rise as towers and the camera swoops down to the skyline.
const S1 = {
  pos: track([
    { t: 0.0, v: [330, 1150, 120], hold: true },
    { t: 1.3, v: [360, 1220, 130] },
    { t: 2.2, v: [800, 1900, 250] },
    { t: 3.2, v: [1450, 3200, 470] },
    { t: 4.2, v: [1760, 4550, 600] },
    { t: 5.0, v: [1800, 4900, 630] },
    { t: 6.2, v: [1880, 2900, 1350] },
    { t: 7.3, v: [1920, 1100, 1900] },
    { t: 8.4, v: [1880, 330, 1880] },
    { t: 10.0, v: [1860, 140, 1620] },
  ]),
  ang: track([   // yaw, pitch, roll
    { t: 0.0, v: [0, -90, 0], hold: true },
    { t: 5.0, v: [0, -90, 0], hold: true },
    { t: 6.2, v: [0, -66, 0] },
    { t: 7.3, v: [-2, -32, 0] },
    { t: 8.4, v: [-4, -5, 0] },
    { t: 10.0, v: [-5, 8, 0] },
  ]),
  fov: track([
    { t: 0.0, v: 22, hold: true }, { t: 5.0, v: 22 }, { t: 7.3, v: 30 }, { t: 10.0, v: 36 },
  ]),
  aperture: track([
    { t: 0.0, v: 20, hold: true }, { t: 3.5, v: 20 }, { t: 5.2, v: 26 }, { t: 7.5, v: 6 }, { t: 9.0, v: 1.5 }, { t: 10.0, v: 1.0 },
  ]),
};

// ---------------------------------------------------------------- shot 2
// 10–30 s. One continuous take: a diagonal rush across the harbour, into
// the canyon between two characters, a banked right turn down an avenue
// between two lines of code, a punch-out climb, and a slow top-down spin
// that settles the words upright while the city prints its own output.
const S2 = {
  pos: track([
    { t: 10.0, v: [2650, 24, 3150] },
    { t: 11.2, v: [2330, 30, 2500] },
    { t: 12.4, v: [2000, 38, 1880] },
    { t: 13.4, v: [1830, 46, 1480] },
    { t: 14.2, v: [1788, 52, 1180] },
    { t: 15.4, v: [1785, 58, 900] },
    { t: 16.6, v: [1785, 62, 690] },
    { t: 17.4, v: [1797, 64, 572] },
    { t: 18.0, v: [1860, 66, 520] },
    { t: 18.7, v: [2010, 70, 510] },
    { t: 19.6, v: [2250, 80, 510] },
    { t: 20.4, v: [2440, 140, 512] },
    { t: 21.2, v: [2560, 420, 530] },
    { t: 22.2, v: [2480, 1250, 600] },
    { t: 23.4, v: [2210, 2420, 660] },
    { t: 24.6, v: [1960, 3420, 690] },
    { t: 25.8, v: [1830, 4080, 700] },
    { t: 27.0, v: [1805, 4330, 703] },
    { t: 30.0, v: [1800, 4120, 706] },
  ]),
  ang: track([
    { t: 10.0, v: [-18, 2, 0] },
    { t: 11.2, v: [-14, 1, 0] },
    { t: 12.4, v: [-8, 0, 0] },
    { t: 13.4, v: [-2, -1, 0] },
    { t: 14.2, v: [0, -2, 0] },
    { t: 16.6, v: [0, -3, 0] },
    { t: 17.4, v: [30, -4, -20] },
    { t: 18.0, v: [68, -4, -24] },
    { t: 18.7, v: [88, -3, -8] },
    { t: 19.6, v: [90, 2, 0] },
    { t: 20.4, v: [90, 11, 0] },
    { t: 21.2, v: [90, 4, 0] },
    { t: 22.2, v: [88, -32, 0] },
    { t: 23.4, v: [72, -72, 0] },
    { t: 24.6, v: [40, -90, 0] },
    { t: 25.8, v: [8, -90, 0] },
    { t: 27.0, v: [0, -90, 0] },
    { t: 30.0, v: [0, -90, 0], hold: true },
  ]),
  fov: track([
    { t: 10.0, v: 34 }, { t: 13.4, v: 40 }, { t: 18.0, v: 46 }, { t: 21.2, v: 42 }, { t: 24.0, v: 28 }, { t: 30.0, v: 24 },
  ]),
  aperture: track([{ t: 10.0, v: 0.6 }, { t: 25.0, v: 0.6 }, { t: 27.4, v: 26 }, { t: 30.0, v: 34 }]),
};

export function cameraAt(t) {
  const S = t < CUT ? S1 : S2;
  const pos = S.pos(t);
  const [yaw, pitch, roll] = S.ang(t);
  const fov = S.fov(t);
  // focus: ground/objects along the view axis (auto-focus on what we look at)
  const rot = camRot(yaw, pitch, roll);
  const f = rot.slice(6, 9);
  let focus = f[1] < -0.05 ? pos[1] / -f[1] : 1800;
  if (t < CUT) focus = Math.min(focus, t < 7.5 ? focus : 2600);
  if (t >= CUT && t < 20.5) focus = 400;
  if (t >= 26.8) focus = mix(focus, 1700, smooth(26.8, 28.2, t));
  return { pos, rot, fov, focus, aperture: S.aperture(t), yaw, pitch, roll };
}

// ---------------------------------------------------------------- music hooks
// Kick positions (seconds) — mirrored by the score so light and sound agree.
export const KICKS = [];
for (let b = 16; b < 32; b++) KICKS.push(b * BEAT);       // bars 5–8 four-on-the-floor
for (let b = 40; b < 44; b += 2) KICKS.push(b * BEAT);    // soft pulse under the print

function kickEnv(t) {
  let e = 0;
  for (const k of KICKS) if (t >= k) e = Math.max(e, Math.exp(-(t - k) * 7));
  return e;
}

// ---------------------------------------------------------------- story state
const typed = typingSchedule();
const MOON_DIR = (() => { const v = [-0.13, 0.25, -1]; const l = Math.hypot(...v); return v.map((x) => x / l); })();
export const MOON_ANG = 0.034;
const FLIGHT = 2.2;                                         // cursor → moon

// After the city prints "hello, world" a new cursor waits on the next slot,
// blinking on the beat — the film ends where it began.
export const END_CURSOR = { t: T_PRINT + PRINT_STEP * 11 + 0.12, blinks: [43, 45, 47].map((b) => b * BEAT) };

function cursorAt(t, cam) {
  if (t >= END_CURSOR.t) {
    const x = (OUTPUT.length + 2) * CHAR_W * CELL + 75, z = (CODE.length * LINE_H) * CELL + 105;
    let glow = t < END_CURSOR.blinks[0] ? 1 : 0;
    for (const b of END_CURSOR.blinks) glow = Math.max(glow, smooth(b - 0.02, b + 0.04, t) * (1 - smooth(b + BEAT - 0.04, b + BEAT + 0.02, t)));
    return { mode: 0, pos: [x, 0, z], size: [70, 1, 100], r: 60, morph: 0, glow, col: [1.0, 0.62, 0.3], moonness: 0 };
  }
  // insertion point while typing: after the latest streamed token
  let li = 0, ci = 0;
  for (const tok of typed.tokens) {
    if (tok.t + 0.04 <= t) { li = tok.line; ci = tok.start + tok.text.length; }
  }
  const lastTok = typed.tokens[typed.tokens.length - 1];
  const done = t >= lastTok.t + 0.04;
  if (done) { const c = cursorCell(); li = c.cz / LINE_H; ci = c.cx / CHAR_W; }
  const cx = ci * CHAR_W * CELL + 75, cz = li * LINE_H * CELL + 105;
  if (t < T_RISE) {
    const typing = t >= typed.tokens[0].t - 0.02 && !done;
    const phase = ((t / BEAT) % 2);
    const blink = typing ? 1 : smooth(0.0, 0.06, phase) * (1 - smooth(1.0, 1.08, phase));
    return { mode: 0, pos: [cx, 0, cz], size: [70, 1, 100], r: 60, morph: 0, glow: blink, col: [1.0, 0.56, 0.22], moonness: 0 };
  }
  // lift-off: thicken, round off, then fly into the sky and become the moon
  const k = clamp((t - T_RISE) / FLIGHT);
  const lift = smooth(0, 0.3, k);
  const fly = easeInOut(smooth(0.18, 1.0, k));
  const start = [cx, 110 * lift + 1, cz];
  const D = 16000;
  const far = [cam.pos[0] + MOON_DIR[0] * D, cam.pos[1] + MOON_DIR[1] * D, cam.pos[2] + MOON_DIR[2] * D];
  const pos = start.map((v, i) => mix(v, far[i], Math.pow(fly, 1.6)));
  const dist = Math.hypot(pos[0] - cam.pos[0], pos[1] - cam.pos[1], pos[2] - cam.pos[2]);
  const rEnd = dist * Math.tan(MOON_ANG);
  const morph = smooth(0.05, 0.35, k);
  const r = mix(80, rEnd, smooth(0.25, 1.0, k));
  const warm = [1.0, 0.56, 0.22], cool = [0.95, 0.97, 1.0];
  const col = warm.map((v, i) => mix(v, cool[i], smooth(0.2, 0.8, k)));
  return {
    mode: k >= 1 ? -1 : 1,
    pos, size: [70 * (1 - 0.3 * morph), mix(1, 60, lift), 100 * (1 - 0.4 * morph)], r, morph,
    glow: 1.0 - 0.35 * smooth(0.6, 1.0, k), col, moonness: smooth(0.55, 0.95, k),
  };
}

function beamsAt(t) {
  const on = smooth(T_LIGHT - 0.05, T_LIGHT + 0.25, t) * (1 - smooth(21.0, 23.5, t));
  if (on <= 0) return { n: 0, O: new Float32Array(24), D: new Float32Array(24), C: new Float32Array(18) };
  const O = [], D = [], C = [];
  const roots = [[420, 820, 30], [1320, 820, 290], [2190, 820, 560], [2880, 820, 30], [980, 820, 830], [3300, 820, 290]];
  roots.forEach(([x, h, z], i) => {
    const ph = i * 1.7 + t * (0.35 + 0.07 * i);
    const sway = Math.sin(ph) * 0.45, tilt = 0.82 + 0.1 * Math.sin(ph * 0.7 + i);
    const d = [Math.sin(sway), tilt, -Math.cos(sway) * 0.6 - 0.2];
    const l = Math.hypot(...d);
    O.push(x, h * 0 + 360 + 40 * (i % 3), z, 0.9 * on * (0.6 + 0.4 * kickEnv(t)));
    D.push(d[0] / l, d[1] / l, d[2] / l, 6.0);
    const c = i % 3 === 0 ? [0.55, 0.8, 1.0] : i % 3 === 1 ? [1.0, 0.75, 0.45] : [0.7, 0.55, 1.0];
    C.push(...c);
  });
  return { n: 6, O: new Float32Array(O), D: new Float32Array(D), C: new Float32Array(C) };
}

export function sceneAt(t, city) {
  const cam = cameraAt(t);
  const cur = cursorAt(t, cam);
  const moonVis = t >= T_RISE + FLIGHT ? 1 : 0;
  const drop = smooth(T_LIGHT - 0.02, T_LIGHT + 0.12, t);
  const b = beamsAt(t);
  const reveal = smooth(23.0, 25.5, t);
  const u = {
    uMoonDir: MOON_DIR,
    uMoonAng: MOON_ANG,
    uMoonVis: moonVis,
    uMoonLight: smooth(T_RISE, T_RISE + FLIGHT, t),
    uCursor: [...cur.pos, cur.morph],
    uCursorSize: cur.size,
    uCursorR: cur.r,
    uCursorMode: cur.mode,
    uCursorGlow: cur.glow,
    uCursorCol: cur.col,
    uCursorMoon: cur.moonness,
    uLights: mix(0.62, 1.0, drop),
    uLED: drop * (1 - 0.7 * smooth(20.0, 22.5, t)),
    uBeat: kickEnv(t),
    uStreet: mix(smooth(T_BUILD + 1.2, T_LIGHT - 0.5, t) * 0.55, 1.0, drop) * (1 - 0.55 * reveal),
    uReveal: reveal,
    uRevealWave: t - 22.6,
    uGeneric: mix(smooth(T_BUILD + 1.0, T_LIGHT - 0.3, t) * 0.65, 1.0, drop),
    uFogDen: 0.00026,
    uStars: smooth(T_BUILD, T_RISE + 1.0, t),
    uTextGlow: 1.0,
    uCrown: mix(0.0, 0.35, drop) + 0.9 * reveal,
    uLEDWave: Math.max(0, t - T_LIGHT) * 2600,
    uBeatPhase: t / BEAT,
    uBeamO: b.O, uBeamD: b.D, uBeamC: b.C, uBeamN: b.n,
  };
  cam.focus = Math.max(20, cam.focus);
  return { cam, u, cur };
}

// Which shader features each moment can actually see. The offline renderer
// (CPU WebGL) pays for every compiled line on every pixel, so each stretch of
// the film gets a variant with only what is in frame.
export function featuresAt(t) {
  if (t < T_BUILD) return [];                                     // flat screen, top-down
  const f = ['HAS_CITY', 'HAS_SKY'];
  if (t < CUT) {
    if (t >= T_RISE - 0.05) f.push('HAS_CURSOR3D');
    if (t >= T_BUILD + 1.0) f.push('HAS_STREET');
    if (t >= 8.4) f.push('HAS_WATER');
    return f;
  }
  f.push('HAS_STREET', 'HAS_LED');
  if (t < 23.6) f.push('HAS_BEAMS');
  if (t < 15.0) f.push('HAS_WATER', 'HAS_WATER_TRACE');
  else if (t >= 20.5) f.push('HAS_WATER');
  if (t >= 13.0 && t < 21.5) f.push('HAS_INTERIOR');
  return f;
}

// Offline sampling plan: samples per frame and shutter angle (fraction of
// the frame interval). Fast sections use a 120° shutter so 12 sub-frame
// samples still blur smoothly; the bokeh-heavy opening and title get more.
export function samplingAt(t) {
  if (t < T_BUILD) return { samples: 32, shutter: 0.5 };
  if (t < CUT) return { samples: 16, shutter: 0.5 };
  if (t < 20.5) return { samples: 12, shutter: 1 / 3 };
  if (t < 26.8) return { samples: 12, shutter: 0.5 };
  return { samples: 24, shutter: 0.5 };
}

// ---------------------------------------------------------------- grade
export function gradeAt(t) {
  const fadeIn = smooth(0.0, 0.5, t);
  const fadeOut = 1 - smooth(29.2, 29.95, t);
  const flash = t >= T_LIGHT ? Math.exp(-(t - T_LIGHT) * 5) : 0;
  const title = smooth(26.9, 28.0, t);
  return {
    exposure: (1.0 + 0.8 * flash) * (1 - 0.55 * title),
    bloom: 0.11 + 0.05 * flash,
    streak: 0.07,
    streakThreshold: 1.5,
    ca: 0.012,
    grain: 0.02,
    vignette: 0.5,
    fade: fadeIn * fadeOut,
  };
}

// ---------------------------------------------------------------- overlay
// The executing line of the program runs as a quiet subtitle in the
// letterbox — the whole film is this program being run.
export const HUD = [
  { t0: T_BUILD, t1: T_RISE, n: '1', code: CODE[0], note: '用程式碼起一座城' },
  { t0: T_RISE, t1: T_LIGHT, n: '2', code: CODE[1], note: '游標升起，變成月亮' },
  { t0: T_LIGHT, t1: T_RUN + BAR, n: '3', code: CODE[2], note: '全城亮燈' },
  { t0: T_RUN + BAR, t1: T_PRINT, n: '4', code: CODE[3], note: '運行呢個世界' },
  { t0: T_PRINT, t1: 27.5, n: '>', code: OUTPUT, note: '世界回應' },
];

export function drawOverlay(ctx, t, W, H, fonts) {
  ctx.clearRect(0, 0, W, H);
  const barH = (H - Math.round(W / 2.39 / 2) * 2) / 2;
  const s = W / 1920;
  // code HUD in the lower letterbox
  for (const line of HUD) {
    if (t < line.t0 - 0.2 || t > line.t1 + 0.2) continue;
    const a = smooth(line.t0 - 0.05, line.t0 + 0.2, t) * (1 - smooth(line.t1 - 0.15, line.t1 + 0.05, t));
    if (a <= 0) continue;
    const y = H - barH / 2 + 10 * s;
    ctx.save();
    ctx.globalAlpha = a * 0.92 * smooth(0, 0.4, 29.5 - t);
    ctx.font = `${22 * s}px ${fonts.mono}`;
    ctx.textBaseline = 'middle';
    const isOut = line.n === '>';
    const left = 150 * s;
    ctx.fillStyle = 'rgba(255,176,102,0.85)';
    ctx.fillText(isOut ? '>' : `${line.n.padStart(2, '0')}`, left, y);
    ctx.fillStyle = isOut ? 'rgba(255,226,190,1)' : 'rgba(236,240,248,0.95)';
    // typewriter reveal of the line itself
    const chars = Math.floor(clamp((t - line.t0) / 0.35) * line.code.length + 0.001);
    ctx.fillText(line.code.slice(0, chars), left + 64 * s, y);
    ctx.font = `${19 * s}px ${fonts.cjk}`;
    ctx.fillStyle = 'rgba(150,164,190,0.9)';
    ctx.textAlign = 'right';
    ctx.fillText(`// ${line.note}`, W - 150 * s, y);
    ctx.restore();
  }
  // end title: the city has printed "hello, world"; the card answers it
  const ta = smooth(27.0, 27.9, t) * (1 - smooth(29.35, 29.95, t));
  if (ta > 0) {
    const cy = H / 2;
    ctx.save();
    // a soft pool of shadow behind the words keeps them readable over the bokeh
    const pool = ctx.createRadialGradient(W / 2, cy + 20 * s, 0, W / 2, cy + 20 * s, 620 * s);
    pool.addColorStop(0, 'rgba(4,6,12,0.62)');
    pool.addColorStop(0.55, 'rgba(4,6,12,0.38)');
    pool.addColorStop(1, 'rgba(4,6,12,0)');
    ctx.globalAlpha = ta;
    ctx.fillStyle = pool;
    ctx.fillRect(0, cy - 420 * s, W, 840 * s);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(255,170,90,0.6)';
    ctx.shadowBlur = 30 * s;
    ctx.fillStyle = '#fff3e3';
    ctx.font = `600 ${92 * s}px ${fonts.cjkTitle || fonts.cjk}`;
    ctx.fillText('你好，世界。', W / 2, cy - 34 * s);
    ctx.shadowBlur = 0;
    const tb = smooth(27.5, 28.3, t) * (1 - smooth(29.35, 29.95, t));
    ctx.globalAlpha = tb;
    ctx.font = `${27 * s}px ${fonts.cjk}`;
    ctx.fillStyle = 'rgba(232,238,250,0.94)';
    ctx.fillText('每一格畫面、每一個音，都由程式計算出嚟。', W / 2, cy + 52 * s);
    ctx.font = `${18 * s}px ${fonts.mono}`;
    ctx.fillStyle = 'rgba(206,214,230,0.95)';
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 8 * s;
    ctx.fillText(fonts.credit || 'no camera · no footage · no stock assets — just code', W / 2, cy + 100 * s);
    ctx.restore();
  }
}
