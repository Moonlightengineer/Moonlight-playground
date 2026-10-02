// Chapter 3: path difference decides bright or dark.
import { C, F, clamp, lerp, seg, win, easeInOut, easeOut, richText, measureRich, rgba, line, dot, glowCircle, roundRect, panel, dimension } from '../core.js';
import { caption, questionCard } from '../widgets.js';
import { pathDiff, solveY, intensityAt } from '../field.js';
import { TOP, slitsFor } from './common.js';
import { getField, drawBarrier, drawFrame, fieldVignette, topViewBadge, drawScreen, slitLabels } from './twosources.js';

const LAM = TOP.lambda;

// δ (in wavelengths) as a function of local time
function deltaAt(t) {
  const steps = [
    [33, 37, 0, 0.5],
    [45, 48, 0.5, 1.0],
    [56, 58, 1.0, 1.5],
    [59.4, 61.4, 1.5, 2.0],
  ];
  let v = 0;
  for (const [a, b, from, to] of steps) {
    if (t >= a) v = lerp(from, to, seg(t, a, b));
  }
  return v;
}

const RX = 1300;
const RW = 540;

// Straightened paths. Both start in step at the slits (left); a shared middle chunk is cut out.
function strips(ctx, T, r1, r2, alpha) {
  if (alpha <= 0) return;
  const sc = 1.9; // strip scale relative to the field
  const lam = LAM * sc;
  const x0 = RX + 70;
  const pre = 1.5 * lam; // visible start part
  const brk = 34; // gap for the break symbol
  const L = Math.floor((r1 - 3.2 * LAM) / LAM) * LAM; // removed length (whole wavelengths)
  const ys = [540, 640];
  const rs = [r1, r2];
  const cols = [C.s1, C.s2];
  const omegaT = (2 * Math.PI * TOP.speed * T) / LAM;
  const amp = 22;
  ctx.save();
  ctx.globalAlpha *= alpha;
  richText(ctx, 'Both paths, straightened:', RX, 485, { size: 28, color: C.muted });
  const endX = [];
  for (let i = 0; i < 2; i++) {
    const y = ys[i];
    richText(ctx, i ? '{s2:$r_2$}' : '{s1:$r_1$}', RX + 16, y + 12, { size: 38 });
    const visEnd = (rs[i] - L) * sc; // strip length after the break (in strip px, measured from start)
    const xEnd = x0 + pre + brk + (visEnd - pre);
    endX.push(xEnd);
    // draw two segments: [0, pre] and [pre, visEnd] mapped after the break
    const drawSeg = (sStart, sEnd, xOff, color, lw) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let sp = sStart; sp <= sEnd + 0.01; sp += 2) {
        const dist = sp / sc + (sp > pre ? L : 0); // true distance from slit
        const v = y - amp * Math.cos((2 * Math.PI * dist) / LAM - omegaT);
        const x = x0 + sp + xOff;
        if (sp === sStart) ctx.moveTo(x, v);
        else ctx.lineTo(x, v);
      }
      ctx.stroke();
    };
    drawSeg(0, pre, 0, cols[i], 4);
    const shared = (r1 - L) * sc;
    drawSeg(pre, Math.min(visEnd, shared), brk, cols[i], 4);
    if (i === 1 && visEnd > shared + 1) {
      // the extra piece of path 2 — highlighted
      ctx.save();
      ctx.shadowColor = C.s2;
      ctx.shadowBlur = 14;
      drawSeg(shared, visEnd, brk, '#ffd2a8', 6);
      ctx.restore();
    }
    // break symbol
    const bx = x0 + pre + brk / 2;
    line(ctx, bx - 9, y + 26, bx - 1, y - 26, 'rgba(220,230,255,0.6)', 2.5);
    line(ctx, bx + 1, y + 26, bx + 9, y - 26, 'rgba(220,230,255,0.6)', 2.5);
    // start mark
    line(ctx, x0, y - 34, x0, y + 34, rgba(cols[i], 0.7), 2);
    // end dot (what arrives at P now)
    const vEnd = y - amp * Math.cos((2 * Math.PI * rs[i]) / LAM - omegaT);
    dot(ctx, xEnd, vEnd, 8, cols[i]);
    line(ctx, xEnd, y - 34, xEnd, y + 34, rgba(cols[i], 0.7), 2);
  }
  richText(ctx, 'start at slits, in step', x0 - 4, ys[1] + 66, { size: 22, color: C.faint });
  // δ bracket between the two end marks
  if (endX[1] - endX[0] > 6) {
    const yb = ys[0] + 52;
    dimension(ctx, endX[0], yb, endX[1], yb, C.ink, { tick: 0, head: 10, lw: 2 });
    richText(ctx, '$δ$', (endX[0] + endX[1]) / 2, yb - 10, { size: 32, color: C.ink, align: 'center' });
  }
  ctx.restore();
}

// What arrives at P over time: two traces and their sum.
function atP(ctx, T, r1, r2, alpha) {
  if (alpha <= 0) return;
  const x = RX;
  const y = 730;
  const w = RW;
  const h = 170;
  ctx.save();
  ctx.globalAlpha *= alpha;
  panel(ctx, x, y, w, h, { r: 14, fill: 'rgba(8,13,26,0.85)' });
  richText(ctx, 'At **P**: the two arriving waves and their sum', x + 18, y + 34, { size: 24, color: C.muted });
  const mid = y + 105;
  const amp = 26;
  const k = (2 * Math.PI) / LAM;
  const om = (2 * Math.PI * TOP.speed) / LAM;
  const span = 2.2 * (2 * Math.PI) / om; // seconds shown
  const plot = (fn, color, lw) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.beginPath();
    for (let px = 0; px <= w - 36; px += 3) {
      const tau = T - span * (1 - px / (w - 36));
      const v = mid - amp * fn(tau);
      if (px === 0) ctx.moveTo(x + 18 + px, v);
      else ctx.lineTo(x + 18 + px, v);
    }
    ctx.stroke();
  };
  plot((tau) => Math.cos(k * r1 - om * tau), rgba(C.s1, 0.9), 2.5);
  plot((tau) => Math.cos(k * r2 - om * tau), rgba(C.s2, 0.9), 2.5);
  plot((tau) => Math.cos(k * r1 - om * tau) + Math.cos(k * r2 - om * tau), C.ink, 4.5);
  ctx.restore();
}

export const pathDiffScene = {
  id: 'pathdiff',
  dur: 92,
  tag: [3, 'Path difference'],
  draw(ctx, t, info) {
    const slits = slitsFor(TOP.d);
    const F0 = getField();
    const appear = seg(t, 0, 1.2, easeOut);
    const out = 1 - seg(t, 91.2, 92);
    const dl = deltaAt(t);
    const yP = solveY(slits, TOP.screenX, dl * LAM, TOP.cy - 1000, TOP.cy + 1);
    const { r1, r2 } = pathDiff(slits, TOP.screenX, yP);
    const P = { x: TOP.screenX, y: yP };
    const I = intensityAt(slits, LAM, P.x, P.y);

    ctx.save();
    ctx.globalAlpha *= appear * out;
    // field backdrop
    ctx.save();
    ctx.globalAlpha *= 0.55;
    F0.render(ctx, { time: info.T, lambda: LAM, speed: TOP.speed, slits, barrierX: TOP.barrierX, mode: 0, color: C.light, contrast: 1.1 });
    ctx.restore();
    fieldVignette(ctx);
    drawScreen(ctx, slits, 1);
    drawBarrier(ctx, slits);
    drawFrame(ctx);
    topViewBadge(ctx);
    slitLabels(ctx, slits);
    richText(ctx, 'screen', TOP.screenX + 15, TOP.rect.y - 16, { size: 26, color: C.muted, align: 'center' });

    // paths
    const pa = seg(t, 2.5, 4.5, easeInOut);
    if (pa > 0) {
      for (const [i, s] of slits.entries()) {
        const col = i ? C.s2 : C.s1;
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 8;
        line(ctx, s.x, s.y, lerp(s.x, P.x, pa), lerp(s.y, P.y, pa), col, 4.5);
        ctx.restore();
      }
      const lab = seg(t, 8.4, 9.4);
      if (lab > 0) {
        for (const [i, s] of slits.entries()) {
          const mx = lerp(s.x, P.x, 0.45);
          const my = lerp(s.y, P.y, 0.45) + (i ? 46 : -22);
          ctx.fillStyle = `rgba(4,7,14,${0.8 * lab})`;
          roundRect(ctx, mx - 30, my - 34, 60, 46, 10);
          ctx.fill();
          richText(ctx, i ? '{s2:$r_2$}' : '{s1:$r_1$}', mx, my, { size: 38, align: 'center', alpha: lab });
        }
      }
    }
    // P marker
    const pA = seg(t, 1.4, 2.4, easeOut);
    if (pA > 0) {
      ctx.save();
      ctx.globalAlpha *= pA;
      glowCircle(ctx, P.x, P.y, 34 + 40 * I, C.bright, 0.25 + 0.75 * I);
      dot(ctx, P.x, P.y, 9, C.ink);
      ctx.fillStyle = 'rgba(4,7,14,0.85)';
      roundRect(ctx, P.x - 70, P.y - 26, 44, 46, 10);
      ctx.fill();
      richText(ctx, '**P**', P.x - 48, P.y + 11, { size: 32, align: 'center', color: C.ink });
      ctx.restore();
    }
    // marks left on the screen at each visited value
    const marks = [[0, '$δ = 0$', 24.6], [0.5, '$½λ$', 37.2], [1, '$λ$', 48.2], [1.5, '$1½λ$', 58], [2, '$2λ$', 61.4]];
    for (const [m, txt, ta] of marks) {
      const a = seg(t, ta, ta + 0.6);
      if (a <= 0) continue;
      const y = solveY(slits, TOP.screenX, m * LAM, TOP.cy - 1000, TOP.cy + 1);
      const col = Number.isInteger(m) ? C.bright : C.dark;
      ctx.save();
      ctx.globalAlpha *= a;
      line(ctx, TOP.screenX + 32, y, TOP.screenX + 50, y, col, 3);
      richText(ctx, `{${Number.isInteger(m) ? 'bright' : 'dark'}:${txt}}`, TOP.screenX + 58, y + 11, { size: 30 });
      ctx.restore();
    }
    ctx.restore();

    // ---- right column ----
    const o = { maxW: RW, size: 38 };
    const cy = 150;
    caption(ctx, t, 1.0, 8.0, 'Pick any point **P** on the screen. A wave from each slit reaches it.', RX, cy, o);
    caption(ctx, t, 8.2, 16.0, 'The two paths have lengths {s1:$r_1$} and {s2:$r_2$}. Their difference is the **path difference**, $δ$.', RX, cy, o);
    caption(ctx, t, 16.2, 24.0, 'Straighten both paths. The waves leave the slits **in step**, so only the **extra** distance $δ$ matters.', RX, cy, o);
    caption(ctx, t, 24.2, 33.0, 'At the centre, $r_1 = r_2$, so $δ = 0$. The waves arrive in step: {bright:**bright**} (the central fringe).', RX, cy, o);
    caption(ctx, t, 37.2, 45.0, '$δ = ½λ$: the waves arrive half a wavelength out of step. Crest meets trough: {dark:**dark**}.', RX, cy, o);
    caption(ctx, t, 48.2, 56.0, '$δ = λ$: one whole extra wavelength. In step again: {bright:**bright**}.', RX, cy, o);
    caption(ctx, t, 56.2, 64.0, 'Keep going: $1½λ$ → {dark:**dark**}, $2λ$ → {bright:**bright**}… so the fringes **alternate**.', RX, cy, o);

    // δ readout
    const ra = win(t, 9.6, 64.2, 0.8, 0.6);
    if (ra > 0) {
      ctx.save();
      ctx.globalAlpha *= ra;
      const w0 = richText(ctx, '$δ = r_2 − r_1$', RX, 420, { size: 52, color: C.ink, family: F.math }).w;
      const va = seg(t, 24.4, 25.2);
      if (va > 0) {
        ctx.globalAlpha *= va;
        const val = (r2 - r1) / LAM;
        richText(ctx, `$ = ${val.toFixed(2)}λ$`, RX + w0 + 6, 420, { size: 52, color: C.bright });
      }
      ctx.restore();
    }
    strips(ctx, info.T, r1, r2, win(t, 16.6, 64.2, 0.8, 0.6));
    atP(ctx, info.T, r1, r2, win(t, 24.6, 64.2, 0.8, 0.6));
    // verdict
    const vd = win(t, 24.8, 64.2, 0.6, 0.6);
    if (vd > 0) {
      const txt = I > 0.9 ? '{bright:**BRIGHT**} · constructive' : I < 0.1 ? '{dark:**DARK**} · destructive' : 'in between';
      richText(ctx, txt, RX, 960, { size: 36, color: C.ink, alpha: vd });
    }

    // rule card
    const rc = win(t, 64.6, 79.2, 0.8, 0.6);
    if (rc > 0) {
      ctx.save();
      ctx.globalAlpha *= rc;
      richText(ctx, 'The rule', RX, 170, { size: 48, color: C.ink, weight: 600 });
      panel(ctx, RX, 220, RW, 120, { accent: C.bright });
      richText(ctx, '{bright:**Bright fringe**}', RX + 30, 268, { size: 32 });
      richText(ctx, '$δ = mλ$', RX + 30, 320, { size: 46, color: C.ink });
      panel(ctx, RX, 360, RW, 120, { accent: C.dark });
      richText(ctx, '{dark:**Dark fringe**}', RX + 30, 408, { size: 32 });
      richText(ctx, '$δ = (m + ½)λ$', RX + 30, 460, { size: 46, color: C.ink });
      richText(ctx, '$m = 0, 1, 2, …$ is the **order** of the fringe. The same pattern is mirrored below the centre.', RX, 540, { size: 32, maxW: RW, color: C.muted });
      ctx.restore();
    }
    const mc = win(t, 70.5, 79.2, 0.8, 0.6);
    if (mc > 0) {
      ctx.save();
      ctx.globalAlpha *= mc;
      panel(ctx, RX, 700, RW, 250, { fill: 'rgba(40,24,70,0.6)', stroke: rgba(C.dark, 0.5) });
      richText(ctx, '{dark:**Common mistake**}', RX + 28, 748, { size: 28 });
      richText(ctx, 'A dark fringe is **not** a place that light fails to reach. Light from **both** slits arrives there, and cancels.', RX + 28, 800, { size: 31, maxW: RW - 56, color: C.ink });
      ctx.restore();
    }

    // quick check
    if (t > 79.4) {
      questionCard(ctx, t - 79.4, 12.6,
        'At a point on the screen, the path difference is $δ = 2.5λ$. Bright or dark?',
        '{dark:**Dark.**} $2.5λ = (2 + ½)λ$, so the waves arrive crest-to-trough. It is the 3rd dark fringe from the centre.',
        { think: 5, tq: 1.0 });
    }
  },
};
