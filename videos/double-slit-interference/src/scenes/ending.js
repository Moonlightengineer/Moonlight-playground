// Chapter 6 worked example, and the summary / closing.
import { C, F, clamp, lerp, seg, win, easeInOut, easeOut, richText, rgba, line, panel, dimension, equation, roundRect } from '../core.js';
import { caption, fringeStrip, ruler } from '../widgets.js';

export const example = {
  id: 'example',
  dur: 52,
  tag: [6, 'Try a calculation'],
  draw(ctx, t) {
    const out = 1 - seg(t, 51.2, 52);
    ctx.save();
    ctx.globalAlpha *= out * seg(t, 0, 1, easeOut);
    // problem
    panel(ctx, 110, 150, 900, 360, { accent: C.s2 });
    richText(ctx, 'PROBLEM', 150, 205, { size: 26, color: C.s2, weight: 700, family: F.display });
    richText(ctx, 'Orange light of wavelength $λ = 600$ nm falls on two slits $d = 0.30$ mm apart. The screen is $D = 1.5$ m away.', 150, 265, { size: 38, color: C.ink, maxW: 820 });
    richText(ctx, '**Find the fringe spacing $Δy$.**', 150, 445, { size: 40, color: C.bright });
    // think prompt
    const th = win(t, 4.0, 12.6, 0.6, 0.6);
    if (th > 0) {
      ctx.save();
      ctx.globalAlpha *= th;
      const pr = clamp((t - 5.0) / 7);
      ctx.lineWidth = 7;
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.arc(1180, 330, 42, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = C.bright;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(1180, 330, 42, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pr);
      ctx.stroke();
      richText(ctx, 'Try it first —\npause if you need to.', 1250, 316, { size: 34, color: C.ink, lineH: 1.3 });
      ctx.restore();
    }
    // solution steps
    const SX = 1110;
    const step = (a, n, title, y) => {
      const k = seg(t, a, a + 0.8, easeOut);
      if (k <= 0) return 0;
      ctx.save();
      ctx.globalAlpha *= k;
      ctx.fillStyle = rgba(C.light, 0.16);
      ctx.beginPath();
      ctx.arc(SX + 20, y - 12, 22, 0, Math.PI * 2);
      ctx.fill();
      richText(ctx, String(n), SX + 20, y, { size: 26, color: C.light, weight: 700, align: 'center', family: F.display });
      richText(ctx, title, SX + 60, y, { size: 32, color: C.muted, weight: 600 });
      ctx.restore();
      return k;
    };
    const k1 = step(13.0, 1, 'Convert to metres', 190);
    if (k1 > 0) {
      richText(ctx, '$λ = 600 × 10^{−9}$ m', SX + 60, 255, { size: 44, color: C.ink, alpha: k1 });
      richText(ctx, '$d = 0.30 × 10^{−3}$ m', SX + 60, 315, { size: 44, color: C.ink, alpha: k1 });
    }
    const k2 = step(18.0, 2, 'Substitute into $Δy = λD / d$', 390);
    if (k2 > 0) {
      equation(ctx, ['$Δy = $', { frac: ['$600 × 10^{−9} × 1.5$', '$0.30 × 10^{−3}$'], size: 42 }], SX + 60, 480, { size: 46, alpha: k2 });
    }
    const k3 = step(24.0, 3, 'Calculate', 580);
    if (k3 > 0) {
      richText(ctx, '$Δy = 3.0 × 10^{−3}$ m = {bright:**3.0 mm**}', SX + 60, 645, { size: 46, color: C.ink, alpha: k3 });
    }
    // strip at real scale
    const sa = seg(t, 29.0, 30.2, easeOut);
    if (sa > 0) {
      ctx.save();
      ctx.globalAlpha *= sa;
      const pxmm = 46;
      const x = 160;
      const w = 1600;
      fringeStrip(ctx, x, 730, w, 110, { spacingPx: 3.0 * pxmm, nm: 600, rgb: [255, 150, 45], envelopePx: 30 * pxmm });
      ruler(ctx, x, 858, w, pxmm);
      const cx = x + w / 2;
      dimension(ctx, cx, 785, cx + 3 * pxmm, 785, C.ink, { tick: 0, head: 10, lw: 2.5 });
      richText(ctx, '**3.0 mm**', cx + 1.5 * pxmm, 720, { size: 28, color: C.ink, align: 'center' });
      ctx.restore();
    }
    ctx.restore();
    caption(ctx, t, 31.0, 40.6, 'Slits a fraction of a millimetre apart and a screen metres away give fringes a few **millimetres** apart: big enough to see and measure.', 960, 968, { size: 32, maxW: 1500, align: 'center', color: C.ink });
    caption(ctx, t, 40.8, 51.6, '**Lab tip:** measure across many fringes (say 10 spacings) and divide, to get $Δy$ more accurately.', 960, 968, { size: 32, maxW: 1500, align: 'center', color: C.ink });
  },
};

const CARDS = [
  { n: 1, title: 'Superposition', col: C.s1, body: 'Waves **in step** add up: constructive, {bright:**bright**}. Waves **half a wavelength** out of step cancel: destructive, {dark:**dark**}.' },
  { n: 2, title: 'Path difference', col: C.s2, body: '$δ = r_2 − r_1$\n{bright:Bright:} $δ = mλ$\n{dark:Dark:} $δ = (m + ½)λ$' },
  { n: 3, title: 'Fringe spacing', col: C.bright, body: '$Δy = λD / d$\nValid when $D ≫ d$ and $y ≪ D$ (small angles). The fringes are **evenly spaced**.' },
  { n: 4, title: 'Slit separation', col: C.dark, body: 'Larger $d$ → **closer** fringes ($Δy ∝ 1 / d$).\nLonger $λ$ or larger $D$ → **wider** fringes.' },
];

export const summary = {
  id: 'summary',
  dur: 44,
  card: '7 · Summary',
  draw(ctx, t) {
    const cardsA = win(t, 0, 24.0, 0.8, 0.8);
    if (cardsA > 0) {
      ctx.save();
      ctx.globalAlpha *= cardsA;
      richText(ctx, 'Summary', 120, 120, { size: 60, color: C.ink, weight: 700, family: F.display });
      CARDS.forEach((c, i) => {
        const a = seg(t, 1.2 + i * 2.6, 2.2 + i * 2.6, easeOut);
        if (a <= 0) return;
        const x = 120 + (i % 2) * 860;
        const y = 180 + Math.floor(i / 2) * 400;
        ctx.save();
        ctx.globalAlpha *= a;
        ctx.translate(0, (1 - a) * 20);
        panel(ctx, x, y, 820, 360, { accent: c.col, r: 22 });
        richText(ctx, `${c.n}`, x + 44, y + 72, { size: 40, color: c.col, weight: 700, family: F.display });
        richText(ctx, c.title, x + 90, y + 70, { size: 40, color: C.ink, weight: 600 });
        richText(ctx, c.body, x + 44, y + 150, { size: 38, color: C.ink, maxW: 740, lineH: 1.4 });
        ctx.restore();
      });
      ctx.restore();
    }
    // callback to the opening question
    const cb = win(t, 24.6, 44, 1.0, 1.0);
    if (cb > 0) {
      ctx.save();
      ctx.globalAlpha *= cb;
      fringeStrip(ctx, 0, 330, 1920, 330, { spacingPx: 150, rgb: [98, 255, 158], envelopePx: 1150, r: 0, alpha: 0.9 });
      const g = ctx.createLinearGradient(0, 300, 0, 700);
      g.addColorStop(0, 'rgba(4,7,14,1)');
      g.addColorStop(0.12, 'rgba(4,7,14,0)');
      g.addColorStop(0.88, 'rgba(4,7,14,0)');
      g.addColorStop(1, 'rgba(4,7,14,1)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 300, 1920, 400);
      ctx.restore();
      caption(ctx, t, 25.0, 44, 'So, how can adding light make darkness?', 960, 190, { size: 54, color: C.bright, align: 'center', maxW: 1600, weight: 600 });
      caption(ctx, t, 27.5, 44, 'At a dark fringe, light from **both** slits does arrive, but crest meets trough and the waves **cancel**.', 960, 790, { size: 40, color: C.ink, align: 'center', maxW: 1500 });
      caption(ctx, t, 32.0, 44, 'The energy is not destroyed: it is **redistributed** into the bright fringes.', 960, 920, { size: 40, color: C.ink, align: 'center', maxW: 1500 });
    }
  },
};

export const endCard = {
  id: 'end',
  dur: 8,
  noBar: true,
  draw(ctx, t) {
    const a = win(t, 0, 8, 1.0, 1.4);
    ctx.save();
    ctx.globalAlpha *= a;
    richText(ctx, "Young's Double-Slit Experiment", 960, 500, { size: 80, color: C.ink, weight: 700, family: F.display, align: 'center' });
    richText(ctx, 'Same light, different paths: bright where they agree, dark where they cancel.', 960, 580, { size: 36, color: C.muted, align: 'center' });
    richText(ctx, 'Diagrams of the wave field are not to scale.', 960, 980, { size: 24, color: C.faint, align: 'center' });
    ctx.restore();
  },
};
