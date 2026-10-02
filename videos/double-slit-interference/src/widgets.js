// Reusable on-screen components.
import {
  W, H, C, F, clamp, lerp, seg, win, easeOut, easeInOut, richText, measureRich, roundRect, panel,
  rgba, rgbaAny, line, glowCircle, wavelengthRGB,
} from './core.js';

export function background(ctx) {
  const g = ctx.createRadialGradient(W * 0.5, H * 0.45, 100, W * 0.5, H * 0.5, W * 0.75);
  g.addColorStop(0, C.bg1);
  g.addColorStop(1, C.bg0);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// Caption: fades/rises in at a, out at b.
export function caption(ctx, t, a, b, text, x, y, opts = {}) {
  const al = win(t, a, b, opts.fi ?? 0.6, opts.fo ?? 0.5);
  if (al <= 0) return null;
  const rise = (1 - easeOut(clamp((t - a) / 0.7))) * (opts.rise ?? 18);
  ctx.save();
  ctx.globalAlpha *= al;
  const r = richText(ctx, text, x, y + rise, {
    size: opts.size || 42,
    maxW: opts.maxW || 760,
    color: opts.color || C.muted,
    weight: opts.weight || 400,
    align: opts.align || 'left',
    lineH: opts.lineH || 1.32,
    family: opts.family,
  });
  ctx.restore();
  return r;
}

// Chapter title card (full screen). t local, dur total.
export function chapterCard(ctx, t, dur, num, title, sub) {
  const a = win(t, 0, dur, 0.6, 0.6);
  ctx.save();
  ctx.globalAlpha *= a;
  const p = seg(t, 0, 1.2, easeOut);
  // numeral
  ctx.font = `700 260px "${F.display}"`;
  ctx.textBaseline = 'alphabetic';
  const gx = 230;
  const grad = ctx.createLinearGradient(gx, 300, gx + 400, 600);
  grad.addColorStop(0, rgba(C.light, 0.95));
  grad.addColorStop(1, rgba(C.s1, 0.35));
  ctx.fillStyle = grad;
  ctx.fillText(String(num).padStart(2, '0'), gx - (1 - p) * 40, 610);
  // rule
  ctx.strokeStyle = rgba(C.ink, 0.25);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(gx + 10, 680);
  ctx.lineTo(gx + 10 + 1400 * p, 680);
  ctx.stroke();
  richText(ctx, title, gx + 10, 780 + (1 - p) * 20, { size: 76, family: F.display, weight: 700, color: C.ink });
  if (sub) {
    const a2 = seg(t, 0.5, 1.4, easeOut);
    ctx.globalAlpha *= a2;
    richText(ctx, sub, gx + 12, 860, { size: 38, color: C.muted, maxW: 1400 });
  }
  ctx.restore();
}

// Small persistent tag at top-left naming the current chapter.
export function chapterTag(ctx, num, title, alpha = 1) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.font = `700 24px "${F.display}"`;
  ctx.fillStyle = rgba(C.light, 0.9);
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(String(num).padStart(2, '0'), 72, 70);
  richText(ctx, title, 116, 70, { size: 24, color: C.muted, weight: 600 });
  ctx.restore();
}

// Bottom progress bar with chapter ticks.
export function progressBar(ctx, frac, marks, alpha = 1) {
  ctx.save();
  ctx.globalAlpha *= alpha * 0.9;
  const x0 = 72;
  const x1 = W - 72;
  const y = H - 34;
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(x0, y, x1 - x0, 3);
  ctx.fillStyle = rgba(C.light, 0.7);
  ctx.fillRect(x0, y, (x1 - x0) * frac, 3);
  for (const m of marks) {
    ctx.fillStyle = m <= frac ? rgba(C.light, 0.9) : 'rgba(255,255,255,0.25)';
    ctx.fillRect(x0 + (x1 - x0) * m - 1, y - 4, 2, 11);
  }
  ctx.restore();
}

// "Pause & think" question with a countdown ring, then answer reveal.
// Timeline (local t): question appears at 0, ring runs [tq, tq+think], answer at tq+think.
export function questionCard(ctx, t, dur, q, answer, opts = {}) {
  const a = win(t, 0, dur, 0.6, 0.6);
  if (a <= 0) return;
  const think = opts.think ?? 5;
  const tq = opts.tq ?? 1.2;
  const cx = W / 2;
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.fillStyle = 'rgba(3,6,12,0.82)';
  ctx.fillRect(0, 0, W, H);
  const pw = 1240;
  const ph = 600;
  panel(ctx, cx - pw / 2, 230, pw, ph, { r: 28, fill: 'rgba(16,26,46,0.95)', stroke: rgba(C.bright, 0.35), lw: 2 });
  // heading
  richText(ctx, 'QUICK CHECK', cx, 315, { size: 30, weight: 700, color: C.bright, align: 'center', family: F.display });
  richText(ctx, q, cx, 410, { size: 50, color: C.ink, maxW: pw - 160, align: 'center', lineH: 1.3 });
  // ring
  const pr = clamp((t - tq) / think);
  const reveal = seg(t, tq + think, tq + think + 0.6, easeOut);
  const ry = 690;
  if (reveal < 1) {
    ctx.save();
    ctx.globalAlpha *= 1 - reveal;
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.arc(cx, ry, 48, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = C.bright;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, ry, 48, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pr);
    ctx.stroke();
    const left = Math.max(0, Math.ceil(think - (t - tq)));
    richText(ctx, t < tq ? '' : String(Math.min(think, left)), cx, ry + 16, { size: 44, align: 'center', weight: 700, color: C.ink, family: F.display });
    richText(ctx, 'Pause and think…', cx, ry + 105, { size: 30, align: 'center', color: C.muted });
    ctx.restore();
  }
  if (reveal > 0) {
    ctx.save();
    ctx.globalAlpha *= reveal;
    richText(ctx, answer, cx, ry - 20 + (1 - reveal) * 16, { size: 44, color: C.ink, maxW: pw - 160, align: 'center', lineH: 1.3 });
    ctx.restore();
  }
  ctx.restore();
}

// Physically scaled fringe pattern strip (horizontal).
// opts: { spacingPx, nm, envelopePx (half-width of single-slit envelope zero), label }
export function fringeStrip(ctx, x, y, w, h, opts) {
  const sp = opts.spacingPx;
  const [r, g, b] = opts.rgb || wavelengthRGB(opts.nm || 532);
  const env = opts.envelopePx || 1e9;
  const cx = x + w / 2 + (opts.offset || 0);
  ctx.save();
  if (opts.alpha !== undefined) ctx.globalAlpha *= opts.alpha;
  roundRect(ctx, x, y, w, h, opts.r ?? 10);
  ctx.fillStyle = '#020409';
  ctx.fill();
  ctx.save();
  roundRect(ctx, x, y, w, h, opts.r ?? 10);
  ctx.clip();
  const step = 1;
  for (let px = 0; px < w; px += step) {
    const X = x + px + 0.5 - cx;
    const c2 = Math.cos((Math.PI * X) / sp) ** 2;
    const u = (Math.PI * X) / env;
    const e = Math.abs(u) < 1e-6 ? 1 : (Math.sin(u) / u) ** 2;
    const I = c2 * e;
    const v = Math.pow(I, 0.7);
    ctx.fillStyle = `rgb(${Math.round(r * v)},${Math.round(g * v)},${Math.round(b * v)})`;
    ctx.fillRect(x + px, y, step + 0.6, h);
  }
  // soft vertical vignette to look like light on a screen
  const vg = ctx.createLinearGradient(0, y, 0, y + h);
  vg.addColorStop(0, 'rgba(2,4,9,0.65)');
  vg.addColorStop(0.25, 'rgba(2,4,9,0)');
  vg.addColorStop(0.75, 'rgba(2,4,9,0)');
  vg.addColorStop(1, 'rgba(2,4,9,0.65)');
  ctx.fillStyle = vg;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
  roundRect(ctx, x, y, w, h, opts.r ?? 10);
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

// Ruler under a strip: pxPerMm, centred at cx.
export function ruler(ctx, x, y, w, pxPerMm, opts = {}) {
  const cx = x + w / 2;
  ctx.save();
  if (opts.alpha !== undefined) ctx.globalAlpha *= opts.alpha;
  ctx.strokeStyle = 'rgba(220,230,255,0.55)';
  ctx.fillStyle = 'rgba(220,230,255,0.75)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.stroke();
  const nHalf = Math.floor(w / 2 / pxPerMm);
  for (let i = -nHalf; i <= nHalf; i++) {
    const px = cx + i * pxPerMm;
    const major = i % 5 === 0;
    ctx.beginPath();
    ctx.moveTo(px, y);
    ctx.lineTo(px, y + (major ? 18 : 10));
    ctx.stroke();
    if (major && opts.numbers !== false) {
      ctx.font = `500 20px "${F.mono}"`;
      ctx.textAlign = 'center';
      ctx.fillText(String(i), px, y + 42);
    }
  }
  ctx.textAlign = 'left';
  if (opts.unit !== false) {
    ctx.font = `500 20px "${F.mono}"`;
    ctx.fillText('mm', x + w + 12, y + 20);
  }
  ctx.restore();
}

// Glowing 'lamp' showing brightness 0..1
export function lamp(ctx, x, y, I, color, labelText) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, 46, 0, Math.PI * 2);
  ctx.fillStyle = '#060a14';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 2;
  ctx.stroke();
  glowCircle(ctx, x, y, 46 + 110 * I, color, Math.min(1, I * 1.1));
  ctx.beginPath();
  ctx.arc(x, y, 40, 0, Math.PI * 2);
  ctx.fillStyle = rgbaAny(color, 0.08 + 0.9 * I);
  ctx.fill();
  if (labelText) richText(ctx, labelText, x, y + 100, { size: 28, color: C.muted, align: 'center' });
  ctx.restore();
}

// Sine wave polyline
export function sineWave(ctx, x0, x1, y, amp, lambda, phase, color, lw = 4, alpha = 1) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let x = x0; x <= x1; x += 3) {
    const v = y - amp * Math.cos((2 * Math.PI * (x - x0)) / lambda - phase);
    if (x === x0) ctx.moveTo(x, v);
    else ctx.lineTo(x, v);
  }
  ctx.stroke();
  ctx.restore();
}

export function screenStrip(ctx, x, y0, y1, w, fn, color, alpha = 1) {
  // vertical strip on a top-view diagram; fn(y) returns intensity 0..1
  const [r, g, b] = Array.isArray(color) ? color : [98, 255, 158];
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = '#020409';
  ctx.fillRect(x, y0, w, y1 - y0);
  for (let y = y0; y < y1; y += 2) {
    const I = clamp(fn(y + 1));
    const v = Math.pow(I, 0.75);
    ctx.fillStyle = `rgb(${Math.round(r * v)},${Math.round(g * v)},${Math.round(b * v)})`;
    ctx.fillRect(x, y, w, 2.5);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y0, w, y1 - y0);
  ctx.restore();
}

export { lerp, line, panel, roundRect, measureRich };
