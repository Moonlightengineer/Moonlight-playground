// Chapter 1: superposition of two waves; in phase vs half a wavelength out of phase.
import { C, F, clamp, lerp, seg, win, easeInOut, easeOut, richText, measureRich, rgba, line, arrow, dimension } from '../core.js';
import { caption, lamp, sineWave } from '../widgets.js';

const X0 = 130;
const X1 = 1170;
const LAM = 260;
const AMP = 62;
const ROWS = { a: 300, b: 520, s: 800 };
const SPEED = 110; // px/s

function shiftAt(t) {
  if (t < 25) return 0;
  if (t < 28) return 0.5 * seg(t, 25, 28);
  if (t < 38) return 0.5;
  if (t < 41) return 0.5 + 0.5 * seg(t, 38, 41);
  return 1.0;
}

export const superposition = {
  id: 'superposition',
  dur: 59,
  tag: [1, 'When waves meet'],
  draw(ctx, t) {
    const out = 1 - seg(t, 58.2, 59);
    ctx.save();
    ctx.globalAlpha *= out;
    const phase = (2 * Math.PI * SPEED * t) / LAM;
    const s = shiftAt(t);
    const ph2 = phase + 2 * Math.PI * s;
    const aA = seg(t, 0, 1.2, easeOut);
    const aB = seg(t, 0.6, 1.8, easeOut);
    const aS = seg(t, 9.0, 10.5, easeOut);

    // row baselines
    for (const [key, a] of [['a', aA], ['b', aB], ['s', aS]]) {
      line(ctx, X0, ROWS[key], X1, ROWS[key], `rgba(150,170,215,${0.18 * a})`, 1.5, [6, 8]);
    }
    // labels
    richText(ctx, '{s1:**Wave 1**}', X0, ROWS.a - 96, { size: 30, alpha: aA, weight: 600 });
    richText(ctx, '{s2:**Wave 2**}', X0, ROWS.b - 96, { size: 30, alpha: aB, weight: 600 });
    richText(ctx, '**Sum** = Wave 1 + Wave 2', X0, ROWS.s - 150, { size: 30, alpha: aS, weight: 600, color: C.ink });

    // crest guides (in the comparison phase)
    const guide = Math.max(win(t, 15.5, 25.5, 0.8, 0.6), win(t, 28.4, 38.2, 0.8, 0.6), win(t, 41.4, 48, 0.8, 0.6));
    if (guide > 0) {
      const base = ((phase / (2 * Math.PI)) % 1) * LAM;
      for (let x = X0 + base; x <= X1; x += LAM) {
        line(ctx, x, ROWS.a - AMP - 14, x, ROWS.s + 2 * AMP + 10, `rgba(255,226,138,${0.32 * guide})`, 2, [4, 7]);
      }
    }

    sineWave(ctx, X0, X1, ROWS.a, AMP, LAM, phase, C.s1, 5, aA);
    sineWave(ctx, X0, X1, ROWS.b, AMP, LAM, ph2, C.s2, 5, aB);
    // sum
    if (aS > 0) {
      ctx.save();
      ctx.globalAlpha *= aS;
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 6;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let x = X0; x <= X1; x += 3) {
        const k = (2 * Math.PI * (x - X0)) / LAM;
        const v = ROWS.s - AMP * (Math.cos(k - phase) + Math.cos(k - ph2));
        if (x === X0) ctx.moveTo(x, v);
        else ctx.lineTo(x, v);
      }
      ctx.stroke();
      ctx.restore();
    }

    // addition bars at sample points
    const bars = win(t, 10.2, 15.2, 0.8, 0.6);
    if (bars > 0) {
      ctx.save();
      ctx.globalAlpha *= bars;
      for (const x of [360, 655, 950]) {
        const k = (2 * Math.PI * (x - X0)) / LAM;
        const v1 = AMP * Math.cos(k - phase);
        const v2 = AMP * Math.cos(k - ph2);
        line(ctx, x, ROWS.a, x, ROWS.a - v1, C.s1, 8);
        line(ctx, x, ROWS.b, x, ROWS.b - v2, C.s2, 8);
        // stacked in the sum row
        line(ctx, x - 7, ROWS.s, x - 7, ROWS.s - v1, C.s1, 8);
        line(ctx, x + 7, ROWS.s - v1, x + 7, ROWS.s - v1 - v2, C.s2, 8);
        ctx.fillStyle = C.ink;
        ctx.beginPath();
        ctx.arc(x, ROWS.s - v1 - v2, 8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // shift readout + bracket
    const sh = Math.max(win(t, 24.4, 39.0, 0.6, 0.6), win(t, 37.6, 48, 0.6, 0.6));
    if (sh > 0) {
      ctx.save();
      ctx.globalAlpha *= sh;
      const frac = (s - Math.floor(s + 1e-9));
      const txt = `Wave 2 shifted by $${s.toFixed(2)}λ$`;
      richText(ctx, txt, X1, ROWS.b - 96, { size: 32, align: 'right', color: C.s2, weight: 600 });
      if (s > 0.03) {
        // bracket from a crest of wave 1 to the matching crest of wave 2
        const base = ((phase / (2 * Math.PI)) % 1) * LAM;
        let xc = X0 + base;
        while (xc < 470) xc += LAM;
        const x2 = xc + s * LAM;
        const yb = ROWS.a + AMP + 50;
        line(ctx, xc, ROWS.a - AMP, xc, yb + 8, rgba(C.s1, 0.8), 2);
        line(ctx, x2, ROWS.b - AMP, x2, yb - 8, rgba(C.s2, 0.8), 2);
        if (x2 - xc > 20) dimension(ctx, xc, yb, x2, yb, C.ink, { tick: 0, head: 12, lw: 2.5 });
        void frac;
      }
      ctx.restore();
    }

    // ---- right column ----
    const RX = 1290;
    const RW = 540;
    caption(ctx, t, 0.8, 8.0, 'Light travels as a **wave**. Here are two waves with the **same wavelength**.', RX, 280, { maxW: RW, size: 42 });
    caption(ctx, t, 8.2, 15.0, 'Where two waves overlap, their displacements **add up**. This is called **superposition**.', RX, 280, { maxW: RW, size: 42 });

    const caseTitle = (a, b, title, body, note) => {
      const th = measureRich(ctx, title, { maxW: RW, size: 44, weight: 600 }).h;
      caption(ctx, t, a, b, title, RX, 250, { maxW: RW, size: 44, color: C.ink, weight: 600 });
      const bh = measureRich(ctx, body, { maxW: RW, size: 38 }).h;
      caption(ctx, t, a + 0.6, b, body, RX, 250 + th + 16, { maxW: RW, size: 38 });
      if (note) caption(ctx, t, a + 4.0, b, note, RX, 250 + th + bh + 40, { maxW: RW, size: 32, color: C.muted });
    };
    caseTitle(15.2, 25.0, '{bright:In phase:} crest meets crest',
      'The waves reinforce. The sum has **double** the amplitude: {bright:**constructive interference**}.',
      'Brightness ∝ amplitude², so double the amplitude means **4×** as bright.');
    caseTitle(28.2, 38.0, '{dark:Half a wavelength out:} crest meets trough',
      'The waves cancel. The sum is **zero**: {dark:**destructive interference**}.');
    caseTitle(41.2, 48.0, '{bright:One whole wavelength out:} in step again',
      'Crests line up once more, so it is **constructive** again.');

    // recap
    const rc = win(t, 48.4, 59, 0.7, 0.6);
    if (rc > 0) {
      ctx.save();
      ctx.globalAlpha *= rc;
      richText(ctx, 'The rule', RX, 250, { size: 46, weight: 600, color: C.ink });
      const r1 = seg(t, 48.8, 49.8, easeOut);
      const r2 = seg(t, 50.6, 51.6, easeOut);
      ctx.save();
      ctx.globalAlpha *= r1;
      richText(ctx, 'Shift of $0, λ, 2λ, …$', RX, 335, { size: 38, color: C.ink });
      richText(ctx, '→ {bright:**constructive**}', RX, 385, { size: 38, color: C.ink });
      ctx.restore();
      ctx.save();
      ctx.globalAlpha *= r2;
      richText(ctx, 'Shift of $½λ, 1½λ, 2½λ, …$', RX, 470, { size: 38, color: C.ink });
      richText(ctx, '→ {dark:**destructive**}', RX, 520, { size: 38, color: C.ink });
      ctx.restore();
      ctx.restore();
    }
    caption(ctx, t, 52.5, 59, 'Keep this rule in mind: it explains the whole pattern.', RX, 600, { maxW: RW, size: 30, color: C.muted });

    // lamp
    const la = win(t, 15.2, 59, 0.8, 0.6);
    if (la > 0) {
      ctx.save();
      ctx.globalAlpha *= la;
      const I = Math.cos(Math.PI * s) ** 2;
      lamp(ctx, RX + RW / 2, 820, I, C.bright, 'Brightness of the sum');
      ctx.restore();
    }
    ctx.restore();
  },
};
