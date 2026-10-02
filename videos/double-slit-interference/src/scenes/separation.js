// Chapter 5: slit separation d and fringe spacing; graph of δ against y; real-scale strips; other factors.
import { C, F, clamp, lerp, seg, win, easeInOut, easeOut, richText, rgba, line, lineP, dot, roundRect, panel, dimension, equation, glowCircle, wavelengthRGB } from '../core.js';
import { caption, fringeStrip, ruler, questionCard } from '../widgets.js';
import { solveY } from '../field.js';
import { TOP, slitsFor } from './common.js';
import { getField, drawBarrier, drawFrame, fieldVignette, topViewBadge, drawScreen, slitLabels } from './twosources.js';

const RX = 1300;
const GREEN = [98, 255, 158]; // the film's 532 nm green
const RW = 540;

function dAt(t) {
  let d = 130;
  if (t >= 6) d = lerp(130, 280, seg(t, 6, 14));
  if (t >= 18) d = lerp(280, 110, seg(t, 18, 24));
  return d;
}

// ---------- part A: live field ----------
function partA(ctx, t, T, alpha) {
  if (alpha <= 0) return;
  const d = dAt(t);
  const slits = slitsFor(d);
  ctx.save();
  ctx.globalAlpha *= alpha;
  getField().render(ctx, { time: T, lambda: TOP.lambda, speed: TOP.speed, slits, barrierX: TOP.barrierX, mode: 0.6, color: C.light, contrast: 1.1 });
  fieldVignette(ctx);
  drawScreen(ctx, slits, 1);
  drawBarrier(ctx, slits);
  drawFrame(ctx);
  topViewBadge(ctx);
  slitLabels(ctx, slits);
  richText(ctx, 'screen', TOP.screenX + 15, TOP.rect.y - 16, { size: 26, color: C.muted, align: 'center' });
  // d bracket
  const bx = TOP.barrierX + 40;
  ctx.fillStyle = 'rgba(4,7,14,0.7)';
  roundRect(ctx, bx - 14, slits[0].y - 4, 70, d + 8, 10);
  ctx.fill();
  dimension(ctx, bx, slits[0].y, bx, slits[1].y, C.ink, { tick: 9, head: 11 });
  richText(ctx, '$d$', bx + 26, TOP.cy + 13, { size: 40, color: C.ink });
  // Δy bracket on the screen: centre to first bright fringe above
  const y1 = solveY(slits, TOP.screenX, TOP.lambda, TOP.cy - 2000, TOP.cy + 1);
  const x = TOP.screenX + 46;
  dimension(ctx, x, TOP.cy, x, y1, C.bright, { tick: 9, head: 11 });
  richText(ctx, '{bright:$Δy$}', x + 18, (TOP.cy + y1) / 2 + 14, { size: 38 });
  ctx.restore();
}

// ---------- part B: graph δ vs y ----------
const GX = 200;
const GY = 800;
const GW = 920;
const PX_PER_LAM = 150;

function partB(ctx, t, alpha) {
  if (alpha <= 0) return;
  const k = seg(t, 46.0, 50.0, easeInOut);
  const dy = lerp(230, 115, k); // fringe spacing on the graph (px)
  const slope = PX_PER_LAM / dy; // px of δ per px of y
  ctx.save();
  ctx.globalAlpha *= alpha;
  // horizontal reference lines
  for (let m = 0.5; m <= 4; m += 0.5) {
    const y = GY - m * PX_PER_LAM;
    const whole = Number.isInteger(m);
    line(ctx, GX, y, GX + GW, y, whole ? rgba(C.bright, 0.55) : rgba(C.dark, 0.5), whole ? 2 : 2, whole ? [] : [8, 8]);
    const lbl = whole ? (m === 1 ? 'λ' : `${m}λ`) : `${Math.floor(m) || ''}½λ`;
    richText(ctx, `{${whole ? 'bright' : 'dark'}:$${lbl}$}`, GX - 16, y + 11, { size: 30, align: 'right' });
  }
  // axes
  line(ctx, GX, GY, GX + GW + 20, GY, C.ink, 2.5);
  line(ctx, GX, GY, GX, GY - 4.3 * PX_PER_LAM, C.ink, 2.5);
  richText(ctx, 'path difference $δ$', GX - 10, GY - 4.3 * PX_PER_LAM - 22, { size: 30, color: C.ink });
  richText(ctx, 'position on screen, $y$ (from the centre)', GX + GW, GY - 16, { size: 28, color: C.ink, align: 'right' });
  richText(ctx, '{bright:bright}', GX + GW + 10, GY - PX_PER_LAM + 10, { size: 24 });
  richText(ctx, '{dark:dark}', GX + GW + 10, GY - 1.5 * PX_PER_LAM + 10, { size: 24 });
  // the line δ = (d/D) y
  const lp = seg(t, 31.0, 33.5, easeInOut);
  const xEnd = Math.min(GW, (4.2 * PX_PER_LAM) / slope);
  ctx.save();
  ctx.shadowColor = C.s1;
  ctx.shadowBlur = 12;
  lineP(ctx, GX, GY, GX + xEnd, GY - xEnd * slope, lp, '#bfefff', 5);
  ctx.restore();
  if (lp > 0.9) {
    const lx = GX + Math.min(xEnd * 0.8, 620);
    const ly = GY - Math.min(xEnd * 0.8, 620) * slope;
    ctx.fillStyle = 'rgba(4,7,14,0.85)';
    roundRect(ctx, lx - 210, ly - 50, 200, 96, 12);
    ctx.fill();
    equation(ctx, ['$δ ≈ $', { frac: ['$d$', '$D$'] }, '$y$'], lx - 195, ly + 14, { size: 40, color: '#bfefff' });
  }
  // intersections → bright fringe positions
  const ia = seg(t, 37.0, 39.0);
  if (ia > 0) {
    ctx.save();
    ctx.globalAlpha *= ia;
    for (let m = 1; m <= 4; m++) {
      const x = GX + m * dy;
      if (x > GX + GW) break;
      const y = GY - m * PX_PER_LAM;
      line(ctx, x, y, x, GY, rgba(C.bright, 0.7), 2, [5, 6]);
      glowCircle(ctx, x, y, 26, C.bright, 0.8);
      dot(ctx, x, y, 7, C.bright);
      dot(ctx, x, GY, 7, C.bright);
    }
    dot(ctx, GX, GY, 7, C.bright);
    // Δy brackets
    dimension(ctx, GX, GY + 90, GX + dy, GY + 90, C.bright, { tick: 0, head: 10, lw: 2 });
    richText(ctx, '{bright:$Δy$}', GX + dy / 2, GY + 80, { size: 32, align: 'center' });
    dimension(ctx, GX + dy, GY + 90, GX + 2 * dy, GY + 90, C.bright, { tick: 0, head: 10, lw: 2 });
    richText(ctx, '{bright:$Δy$}', GX + 1.5 * dy, GY + 80, { size: 32, align: 'center' });
    ctx.restore();
    // fringe strip (upper half of the pattern) under the axis
    ctx.save();
    ctx.globalAlpha *= ia;
    const sy = GY + 108;
    for (let x = 0; x < GW; x += 2) {
      const I = Math.cos((Math.PI * x) / dy) ** 2;
      const v = Math.pow(I, 0.75);
      ctx.fillStyle = `rgb(${Math.round(98 * v)},${Math.round(255 * v)},${Math.round(158 * v)})`;
      ctx.fillRect(GX + x, sy, 2.5, 46);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.strokeRect(GX, sy, GW, 46);
    richText(ctx, 'fringes on the screen', GX + GW + 10, sy + 32, { size: 22, color: C.muted });
    ctx.restore();
  }
  // doubling label
  const dl = win(t, 47.0, 62.0, 0.6, 0.6);
  if (dl > 0) {
    ctx.save();
    ctx.globalAlpha *= dl;
    ctx.fillStyle = 'rgba(4,7,14,0.85)';
    roundRect(ctx, GX + 520, GY - 4.25 * PX_PER_LAM + 30, 430, 64, 14);
    ctx.fill();
    richText(ctx, '$d$ doubled → line twice as steep', GX + 540, GY - 4.25 * PX_PER_LAM + 72, { size: 30, color: C.ink });
    ctx.restore();
  }
  ctx.restore();
}

// ---------- part C: real scale ----------
function partC(ctx, t, alpha) {
  if (alpha <= 0) return;
  const pxmm = 62;
  const x = 160;
  const w = 1600;
  const rows = [
    { y: 300, d: 0.4, dy: 2.0 },
    { y: 640, d: 0.8, dy: 1.0 },
  ];
  ctx.save();
  ctx.globalAlpha *= alpha;
  richText(ctx, 'Real scale', W2(), 140, { size: 30, color: C.bright, weight: 700, family: F.display, align: 'center' });
  richText(ctx, 'Same green laser ($λ = 532$ nm), same screen distance ($D = 1.5$ m)', W2(), 196, { size: 36, color: C.ink, align: 'center' });
  rows.forEach((r, i) => {
    const a = seg(t, 64 + i * 2.2, 65 + i * 2.2, easeOut);
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha *= a;
    const spacingMm = (532e-9 * 1.5) / (r.d * 1e-3) * 1e3; // exact Δy in mm
    richText(ctx, `$d = ${r.d.toFixed(2)}$ mm`, x, r.y - 26, { size: 38, color: C.ink });
    richText(ctx, `→  {bright:$Δy ≈ ${r.dy.toFixed(1)}$ mm}`, x + 290, r.y - 26, { size: 38, color: C.ink });
    fringeStrip(ctx, x, r.y, w, 130, { spacingPx: spacingMm * pxmm, nm: 532, rgb: GREEN, envelopePx: (532e-9 * 1.5 / 0.08e-3) * 1e3 * pxmm });
    ruler(ctx, x, r.y + 150, w, pxmm);
    // bracket between centre and next bright fringe
    const cx = x + w / 2;
    dimension(ctx, cx, r.y + 65, cx + spacingMm * pxmm, r.y + 65, C.ink, { tick: 0, head: 10, lw: 2.5 });
    ctx.restore();
  });
  const fn = seg(t, 70, 71);
  if (fn > 0) {
    ctx.save();
    ctx.globalAlpha *= fn;
    richText(ctx, 'Twice the slit separation → **half** the fringe spacing.', W2(), 940, { size: 40, color: C.ink, align: 'center' });
    richText(ctx, 'Each slit is 0.08 mm wide; that width causes the gradual fade, not the spacing.', W2(), 995, { size: 26, color: C.faint, align: 'center' });
    ctx.restore();
  }
  ctx.restore();
}
const W2 = () => 960;

// ---------- part D: other factors ----------
function partD(ctx, t, alpha) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  richText(ctx, 'The formula tells the whole story', 960, 150, { size: 36, color: C.muted, align: 'center' });
  equation(ctx, ['$Δy = $', { frac: ['$λ D$', '$d$'] }], 960, 290, { size: 84, color: C.ink, align: 'center' });
  const items = [
    { a: 82.0, txt: 'Longer wavelength $λ$  →  {bright:**wider**} fringes', y: 470 },
    { a: 84.0, txt: 'Larger screen distance $D$  →  {bright:**wider**} fringes', y: 560 },
    { a: 86.0, txt: 'Larger slit separation $d$  →  {dark:**narrower**} fringes', y: 650 },
  ];
  for (const it of items) {
    const a = seg(t, it.a, it.a + 0.8, easeOut);
    if (a <= 0) continue;
    richText(ctx, it.txt, 960, it.y + (1 - a) * 14, { size: 40, color: C.ink, align: 'center', alpha: a });
  }
  // red vs blue strips
  const sa = seg(t, 88.0, 89.0, easeOut);
  if (sa > 0) {
    ctx.save();
    ctx.globalAlpha *= sa;
    const pxmm = 48;
    const sp = (nm) => ((nm * 1e-9 * 1.5) / 0.4e-3) * 1e3 * pxmm;
    richText(ctx, 'red, $λ = 650$ nm', 300, 770, { size: 30, color: C.ink, align: 'right' });
    fringeStrip(ctx, 330, 735, 1260, 60, { spacingPx: sp(650), nm: 650 });
    richText(ctx, 'blue, $λ = 450$ nm', 300, 860, { size: 30, color: C.ink, align: 'right' });
    fringeStrip(ctx, 330, 825, 1260, 60, { spacingPx: sp(450), nm: 450 });
    richText(ctx, 'same $d$ and $D$', 960, 940, { size: 26, color: C.faint, align: 'center' });
    ctx.restore();
  }
  ctx.restore();
}

export const separation = {
  id: 'separation',
  dur: 110,
  tag: [5, 'Slit separation and fringe spacing'],
  draw(ctx, t, info) {
    const out = 1 - seg(t, 109.2, 110);
    ctx.save();
    ctx.globalAlpha *= out;
    partA(ctx, t, info.T, win(t, 0, 27.6, 1.0, 0.8));
    partB(ctx, t, win(t, 28.2, 62.4, 0.8, 0.7));
    partC(ctx, t, win(t, 63.0, 79.4, 0.8, 0.7));
    partD(ctx, t, win(t, 80.0, 97.0, 0.8, 0.7));
    ctx.restore();

    const o = { maxW: RW, size: 38 };
    const cy = 170;
    caption(ctx, t, 0.6, 7.8, 'What happens if we move the slits **further apart**? Watch the fringes on the screen.', RX, cy, o);
    caption(ctx, t, 8.0, 17.4, 'Larger slit separation $d$ → fringes **closer together** ($Δy$ shrinks).', RX, cy, o);
    caption(ctx, t, 17.6, 27.4, 'Smaller $d$ → fringes **further apart**. But **why**?', RX, cy, o);
    caption(ctx, t, 28.6, 36.4, 'Plot the path difference $δ$ against the position $y$. Since $δ ≈ (d / D) y$, the graph is a straight line.', RX, cy, o);
    caption(ctx, t, 36.6, 45.6, 'A bright fringe appears each time $δ$ reaches another **whole wavelength**. The gap between them is $Δy$.', RX, cy, o);
    caption(ctx, t, 45.8, 54.4, 'Double $d$: the line is **twice as steep**, so $δ$ reaches each wavelength in **half** the distance.', RX, cy, o);
    caption(ctx, t, 54.6, 62.2, 'So the fringe spacing is **inversely proportional** to the slit separation:', RX, cy, o);
    const ip = win(t, 55.4, 62.2, 0.8, 0.6);
    if (ip > 0) {
      equation(ctx, ['$Δy = $', { frac: ['$λ D$', '$d$'] }], RX, 470, { size: 56, color: C.ink, alpha: ip });
      richText(ctx, '$Δy ∝ 1 / d$', RX, 600, { size: 52, color: C.bright, alpha: ip });
    }
    if (t > 97.0) {
      questionCard(ctx, t - 97.0, 13,
        'The slit separation is **tripled**, with everything else unchanged. What happens to the fringe spacing?',
        'It becomes {bright:**one third**} as large, because $Δy ∝ 1 / d$.',
        { think: 5, tq: 1.0 });
    }
  },
};
