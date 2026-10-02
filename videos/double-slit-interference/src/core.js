// Core drawing helpers: palette, easing, rich text, equations, shapes.
export const W = 1920;
export const H = 1080;

export const C = {
  bg0: '#04070e',
  bg1: '#0a1222',
  panel: 'rgba(14, 22, 40, 0.78)',
  panelLine: 'rgba(140, 165, 215, 0.20)',
  line: 'rgba(150, 172, 215, 0.35)',
  ink: '#eef2ff',
  muted: '#9aa6c4',
  faint: '#7d89a8',
  s1: '#4cc9ff', // wave / path from slit 1
  s2: '#ffa04d', // wave / path from slit 2
  bright: '#ffe28a', // constructive / bright fringe
  dark: '#a993ff', // destructive / dark fringe
  light: '#62ff9e', // the light itself (532 nm green, softened)
  good: '#6dffb0',
  warn: '#ff6b6b',
};

export const F = {
  sans: 'Inter',
  display: 'Space Grotesk',
  math: 'STIX',
  mono: 'JetBrains Mono',
};

// ---------- maths & easing ----------
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);
export const easeIn = (t) => t * t * t;
export const linear = (t) => t;
export const smooth = (t) => t * t * (3 - 2 * t);
// eased progress of t through [a, b]
export const seg = (t, a, b, e = easeInOut) => e(clamp((t - a) / (b - a)));
// visibility envelope: fades in at a, out at b
export function win(t, a, b, fi = 0.5, fo = 0.5) {
  if (t < a || t > b) return 0;
  const i = fi > 0 ? easeOut(clamp((t - a) / fi)) : 1;
  const o = fo > 0 ? 1 - easeInOut(clamp((t - (b - fo)) / fo)) : 1;
  return Math.min(i, o);
}

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
export function rgba(hex, a = 1) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
export function mixHex(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const m = A.map((v, i) => Math.round(lerp(v, B[i], t)));
  return `rgb(${m[0]},${m[1]},${m[2]})`;
}

// Approximate visible colour of a wavelength (nm), after Dan Bruton.
export function wavelengthRGB(nm) {
  let r = 0, g = 0, b = 0;
  if (nm >= 380 && nm < 440) { r = -(nm - 440) / 60; b = 1; }
  else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
  else if (nm < 510) { g = 1; b = -(nm - 510) / 20; }
  else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
  else if (nm < 645) { r = 1; g = -(nm - 645) / 65; }
  else if (nm <= 780) { r = 1; }
  let f = 1;
  if (nm > 700) f = 0.3 + 0.7 * (780 - nm) / 80;
  else if (nm < 420) f = 0.3 + 0.7 * (nm - 380) / 40;
  const gam = 0.8;
  const c = (v) => Math.round(255 * Math.pow(v * f, gam));
  // lift slightly so it reads as light on a dark background
  return [c(r), c(g), c(b)].map((v) => Math.min(255, Math.round(v * 0.85 + 38)));
}

// ---------- rich text ----------
// Markup:
//   **bold**            emphasis (heavier, ink colour)
//   {key:text}          colour span, key from palette C (s1, s2, bright, dark, light, muted ...)
//   $math$              STIX math: letters italic, digits/operators upright,
//                       _x / _{..} subscript, ^x / ^{..} superscript,
//                       sin / tan / cos upright, "text" upright
const GREEK_OR_LATIN = /[A-Za-zα-ωΑ-Ω]/;
const UPRIGHT_WORDS = ['sin', 'tan', 'cos', 'max'];

function parseMath(src, base) {
  const runs = [];
  let i = 0;
  const push = (text, style) => runs.push({ ...base, ...style, text });
  while (i < src.length) {
    const ch = src[i];
    if (ch === '_' || ch === '^') {
      let inner;
      if (src[i + 1] === '{') {
        const j = src.indexOf('}', i + 2);
        inner = src.slice(i + 2, j);
        i = j + 1;
      } else {
        inner = src[i + 1];
        i += 2;
      }
      const sub = parseMath(inner, base);
      for (const r of sub) {
        r.scale = (r.scale || 1) * 0.68;
        r.dy = ch === '_' ? 0.22 : -0.42;
        runs.push(r);
      }
      continue;
    }
    if (ch === '"') {
      const j = src.indexOf('"', i + 1);
      push(src.slice(i + 1, j), { family: F.math, style: 'normal' });
      i = j + 1;
      continue;
    }
    const word = UPRIGHT_WORDS.find((w) => src.startsWith(w, i));
    if (word) {
      push(word, { family: F.math, style: 'normal' });
      i += word.length;
      continue;
    }
    if (GREEK_OR_LATIN.test(ch) && ch !== 'Δ') {
      push(ch, { family: F.math, style: 'italic' });
    } else if (ch === ' ') {
      push(' ', { family: F.math, style: 'normal' });
    } else {
      push(ch, { family: F.math, style: 'normal' });
    }
    i += 1;
  }
  return runs;
}

// Parse markup into "atoms": units that may not be split across lines.
// Each atom: { runs: [...], space: bool (followed by a breakable space) }
export function parseRich(src, base) {
  const atoms = [];
  let cur = [];
  const flush = (space) => {
    if (cur.length) atoms.push({ runs: cur, space });
    else if (space && atoms.length) atoms[atoms.length - 1].space = true;
    cur = [];
  };
  function walk(s, style) {
    let i = 0;
    let buf = '';
    const emit = () => {
      if (buf) cur.push({ ...style, text: buf });
      buf = '';
    };
    while (i < s.length) {
      const ch = s[i];
      if (ch === '\n') {
        emit();
        flush(false);
        atoms.push({ br: true });
        i++;
        continue;
      }
      if (ch === ' ') {
        emit();
        flush(true);
        i++;
        continue;
      }
      if (s.startsWith('**', i)) {
        emit();
        const j = s.indexOf('**', i + 2);
        walk(s.slice(i + 2, j), { ...style, weight: 700, color: style.colorLocked ? style.color : C.ink });
        i = j + 2;
        continue;
      }
      if (ch === '{') {
        const colon = s.indexOf(':', i);
        const key = s.slice(i + 1, colon);
        // find matching brace
        let depth = 1;
        let j = colon + 1;
        while (j < s.length && depth > 0) {
          if (s[j] === '{') depth++;
          else if (s[j] === '}') depth--;
          if (depth > 0) j++;
        }
        emit();
        const color = C[key] || key;
        walk(s.slice(colon + 1, j), { ...style, color, colorLocked: true });
        i = j + 1;
        continue;
      }
      if (ch === '$') {
        emit();
        const j = s.indexOf('$', i + 1);
        const runs = parseMath(s.slice(i + 1, j), { ...style });
        cur.push(...runs);
        i = j + 1;
        continue;
      }
      buf += ch;
      i++;
    }
    emit();
  }
  walk(src, base);
  flush(false);
  return atoms;
}

function runFont(r, size) {
  const s = size * (r.scale || 1);
  const fam = r.family || F.sans;
  const style = r.style || 'normal';
  let weight = r.weight || 400;
  if (fam === F.math) weight = 400;
  else if (fam === F.sans) weight = weight >= 700 ? 800 : weight >= 600 ? 600 : 400;
  // DSymbols (DejaVu subset) supplies ≪ ≫ ∝ that the Inter and STIX subsets lack
  const famCss = fam === F.sans ? `"${F.sans}", "DSymbols"` : fam === F.math ? `"${F.math}", "${F.sans}", "DSymbols"` : `"${fam}"`;
  return `${style} ${weight} ${s.toFixed(1)}px ${famCss}`;
}

function measureRuns(ctx, runs, size) {
  let w = 0;
  for (const r of runs) {
    ctx.font = runFont(r, size);
    r._w = ctx.measureText(r.text).width;
    w += r._w;
  }
  return w;
}

function drawRuns(ctx, runs, x, y, size) {
  for (const r of runs) {
    ctx.font = runFont(r, size);
    ctx.fillStyle = r.color;
    ctx.fillText(r.text, x, y + (r.dy || 0) * size);
    x += r._w;
  }
  return x;
}

// Draw wrapped rich text. Returns {w, h, lines}.
export function richText(ctx, src, x, y, opts = {}) {
  const size = opts.size || 40;
  const maxW = opts.maxW || 1e9;
  const lineH = (opts.lineH || 1.32) * size;
  const align = opts.align || 'left';
  const base = {
    family: opts.family || F.sans,
    weight: opts.weight || 400,
    color: opts.color || C.ink,
    style: opts.style || 'normal',
  };
  const atoms = parseRich(src, base);
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.font = runFont(base, size);
  const spaceW = ctx.measureText(' ').width;
  const lines = [];
  let line = [];
  let lw = 0;
  for (const a of atoms) {
    if (a.br) {
      lines.push({ atoms: line, w: lw });
      line = [];
      lw = 0;
      continue;
    }
    const aw = measureRuns(ctx, a.runs, size);
    a._w = aw;
    const add = (line.length && line[line.length - 1].space ? spaceW : 0) + aw;
    if (line.length && lw + add > maxW) {
      lines.push({ atoms: line, w: lw });
      line = [a];
      lw = aw;
    } else {
      line.push(a);
      lw += add;
    }
  }
  if (line.length) lines.push({ atoms: line, w: lw });
  let maxLine = 0;
  if (opts.alpha !== undefined) ctx.globalAlpha *= opts.alpha;
  lines.forEach((ln, li) => {
    maxLine = Math.max(maxLine, ln.w);
    let lx = x;
    if (align === 'center') lx = x - ln.w / 2;
    else if (align === 'right') lx = x - ln.w;
    const ly = y + li * lineH;
    ln.atoms.forEach((a, ai) => {
      if (ai > 0 && ln.atoms[ai - 1].space) lx += spaceW;
      lx = drawRuns(ctx, a.runs, lx, ly, size);
    });
  });
  ctx.restore();
  return { w: maxLine, h: lines.length * lineH, lines: lines.length };
}

export function measureRich(ctx, src, opts = {}) {
  ctx.save();
  ctx.globalAlpha = 0;
  const r = richText(ctx, src, -9999, -9999, opts);
  ctx.restore();
  return r;
}

// ---------- equations with fractions ----------
// parts: array of strings (rich markup, typically $..$) or {frac: [top, bottom]}
export function equation(ctx, parts, x, y, opts = {}) {
  const size = opts.size || 56;
  const color = opts.color || C.ink;
  const align = opts.align || 'left';
  const gap = size * 0.12;
  const items = parts.map((p) => {
    if (typeof p === 'string') {
      const m = measureRich(ctx, p, { size, color, family: F.math });
      return { kind: 's', p, w: m.w };
    }
    const ts = p.size || size * 0.92;
    const tw = measureRich(ctx, p.frac[0], { size: ts, color }).w;
    const bw = measureRich(ctx, p.frac[1], { size: ts, color }).w;
    return { kind: 'f', p, ts, tw, bw, w: Math.max(tw, bw) + size * 0.3 };
  });
  const total = items.reduce((s, it) => s + it.w, 0) + gap * (items.length - 1);
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  const axis = y - size * 0.3;
  ctx.save();
  if (opts.alpha !== undefined) ctx.globalAlpha *= opts.alpha;
  for (const it of items) {
    if (it.kind === 's') {
      richText(ctx, it.p, cx, y, { size, color, family: F.math });
    } else {
      const mid = cx + it.w / 2;
      richText(ctx, it.p.frac[0], mid, axis - size * 0.2, { size: it.ts, color, align: 'center' });
      richText(ctx, it.p.frac[1], mid, axis + size * 0.2 + it.ts * 0.72, { size: it.ts, color, align: 'center' });
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2, size * 0.045);
      ctx.beginPath();
      ctx.moveTo(cx + size * 0.08, axis);
      ctx.lineTo(cx + it.w - size * 0.08, axis);
      ctx.stroke();
    }
    cx += it.w + gap;
  }
  ctx.restore();
  return total;
}

// ---------- shapes ----------
export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function panel(ctx, x, y, w, h, opts = {}) {
  ctx.save();
  if (opts.alpha !== undefined) ctx.globalAlpha *= opts.alpha;
  roundRect(ctx, x, y, w, h, opts.r ?? 22);
  ctx.fillStyle = opts.fill || C.panel;
  ctx.fill();
  ctx.strokeStyle = opts.stroke || C.panelLine;
  ctx.lineWidth = opts.lw || 1.5;
  ctx.stroke();
  if (opts.accent) {
    ctx.beginPath();
    roundRect(ctx, x, y, 6, h, 3);
    ctx.fillStyle = opts.accent;
    ctx.fill();
  }
  ctx.restore();
}

export function line(ctx, x1, y1, x2, y2, color, lw = 3, dash = null) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

// Draw a partial line (progress p in 0..1) from (x1,y1) towards (x2,y2)
export function lineP(ctx, x1, y1, x2, y2, p, color, lw = 3, dash = null) {
  if (p <= 0) return;
  line(ctx, x1, y1, lerp(x1, x2, p), lerp(y1, y2, p), color, lw, dash);
}

export function arrowHead(ctx, x, y, ang, size, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-size, size * 0.55);
  ctx.lineTo(-size * 0.75, 0);
  ctx.lineTo(-size, -size * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function arrow(ctx, x1, y1, x2, y2, color, lw = 3, head = 16, both = false) {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const sh = head * 0.7;
  line(ctx, x1 + (both ? Math.cos(ang) * sh : 0), y1 + (both ? Math.sin(ang) * sh : 0),
    x2 - Math.cos(ang) * sh, y2 - Math.sin(ang) * sh, color, lw);
  arrowHead(ctx, x2, y2, ang, head, color);
  if (both) arrowHead(ctx, x1, y1, ang + Math.PI, head, color);
}

export function dot(ctx, x, y, r, color, glow = 0) {
  ctx.save();
  if (glow > 0) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * glow);
    g.addColorStop(0, rgbaAny(color, 0.55));
    g.addColorStop(1, rgbaAny(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * glow, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function rgbaAny(color, a) {
  if (color.startsWith('#')) return rgba(color, a);
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const p = m[1].split(',').map((s) => parseFloat(s));
    return `rgba(${p[0]},${p[1]},${p[2]},${a})`;
  }
  return color;
}

export function glowCircle(ctx, x, y, r, color, a = 1) {
  ctx.save();
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgbaAny(color, 0.9 * a));
  g.addColorStop(0.25, rgbaAny(color, 0.45 * a));
  g.addColorStop(1, rgbaAny(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Curly-ish bracket / dimension line with end ticks and a label slot
export function dimension(ctx, x1, y1, x2, y2, color, opts = {}) {
  const lw = opts.lw || 2.5;
  const tick = opts.tick ?? 12;
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const nx = -Math.sin(ang) * tick;
  const ny = Math.cos(ang) * tick;
  ctx.save();
  if (opts.alpha !== undefined) ctx.globalAlpha *= opts.alpha;
  arrow(ctx, x1, y1, x2, y2, color, lw, opts.head || 13, true);
  line(ctx, x1 - nx, y1 - ny, x1 + nx, y1 + ny, color, lw);
  line(ctx, x2 - nx, y2 - ny, x2 + nx, y2 + ny, color, lw);
  ctx.restore();
}

export function label(ctx, text, x, y, opts = {}) {
  return richText(ctx, text, x, y, { size: 32, ...opts });
}

// Pill-shaped tag
export function pill(ctx, text, x, y, opts = {}) {
  const size = opts.size || 28;
  const m = measureRich(ctx, text, { size, weight: opts.weight || 600 });
  const padX = size * 0.7;
  const h = size * 1.6;
  let px = x;
  if (opts.align === 'center') px = x - (m.w + padX * 2) / 2;
  if (opts.align === 'right') px = x - (m.w + padX * 2);
  ctx.save();
  if (opts.alpha !== undefined) ctx.globalAlpha *= opts.alpha;
  roundRect(ctx, px, y - h / 2, m.w + padX * 2, h, h / 2);
  ctx.fillStyle = opts.fill || 'rgba(255,255,255,0.08)';
  ctx.fill();
  if (opts.stroke) {
    ctx.strokeStyle = opts.stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  richText(ctx, text, px + padX, y + size * 0.36, { size, weight: opts.weight || 600, color: opts.color || C.ink });
  ctx.restore();
  return m.w + padX * 2;
}
