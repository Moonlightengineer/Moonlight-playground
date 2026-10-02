// Chapter 4: from path difference to fringe position: δ = d sinθ ≈ d y / D  =>  Δy = λD/d.
import { C, F, clamp, lerp, seg, win, easeInOut, easeOut, richText, measureRich, rgba, line, lineP, dot, roundRect, panel, dimension, equation, glowCircle } from '../core.js';
import { caption } from '../widgets.js';

const RX = 1300;
const RW = 540;

// full diagram geometry (not to scale)
const G = {
  bx: 240,
  s1: { x: 240, y: 500 },
  s2: { x: 240, y: 660 },
  M: { x: 240, y: 580 },
  sx: 1080,
  O: { x: 1080, y: 580 },
  P: { x: 1080, y: 300 },
  top: 130,
  bot: 950,
  dy: 140, // fringe spacing drawn on the diagram
};

function arcAngle(ctx, cx, cy, r, a0, a1, color, lw = 2.5) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.min(a0, a1), Math.max(a0, a1));
  ctx.stroke();
  ctx.restore();
}

function mathLabel(ctx, txt, x, y, size = 36, color = C.ink, align = 'center', alpha = 1, bg = true) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  if (bg) {
    const w = measureRich(ctx, txt, { size }).w;
    ctx.fillStyle = 'rgba(4,7,14,0.8)';
    const x0 = align === 'center' ? x - w / 2 - 8 : align === 'right' ? x - w - 8 : x - 8;
    roundRect(ctx, x0, y - size * 0.85, w + 16, size * 1.15, 8);
    ctx.fill();
  }
  richText(ctx, txt, x, y, { size, color, align });
  ctx.restore();
}

function fullDiagram(ctx, t, a, opts) {
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha *= a;
  const { s1, s2, M, O, P } = G;
  // barrier
  ctx.fillStyle = '#2a3550';
  ctx.fillRect(G.bx - 5, G.top, 10, s1.y - 6 - G.top);
  ctx.fillRect(G.bx - 5, s1.y + 6, 10, s2.y - s1.y - 12);
  ctx.fillRect(G.bx - 5, s2.y + 6, 10, G.bot - s2.y - 6);
  // screen
  ctx.fillStyle = '#1b2438';
  ctx.fillRect(G.sx, G.top, 14, G.bot - G.top);
  richText(ctx, 'screen', G.sx + 7, G.top - 18, { size: 26, color: C.muted, align: 'center' });
  // centre line
  line(ctx, M.x, M.y, O.x, O.y, 'rgba(200,215,255,0.45)', 2, [8, 8]);
  // paths
  const pa = opts.paths;
  ctx.save();
  ctx.globalAlpha *= 1 - 0.75 * opts.fringes;
  lineP(ctx, s1.x, s1.y, P.x, P.y, pa, C.s1, 4);
  lineP(ctx, s2.x, s2.y, P.x, P.y, pa, C.s2, 4);
  ctx.restore();
  dot(ctx, s1.x, s1.y, 7, C.s1);
  dot(ctx, s2.x, s2.y, 7, C.s2);
  mathLabel(ctx, '$S_1$', s1.x - 52, s1.y + 10, 34, C.s1);
  mathLabel(ctx, '$S_2$', s2.x - 52, s2.y + 14, 34, C.s2);
  // O, P
  dot(ctx, O.x, O.y, 7, C.ink);
  mathLabel(ctx, '$O$', O.x - 32, O.y + 40, 34);
  ctx.save();
  ctx.globalAlpha *= 1 - opts.fringes;
  glowCircle(ctx, P.x, P.y, 40, C.bright, 0.6);
  dot(ctx, P.x, P.y, 8, C.ink);
  mathLabel(ctx, '$P$', P.x - 34, P.y - 16, 34);
  ctx.restore();
  // dimensions
  const dimA = opts.dims;
  if (dimA > 0) {
    ctx.save();
    ctx.globalAlpha *= dimA;
    dimension(ctx, 110, s1.y, 110, s2.y, C.ink, { tick: 10, head: 11 });
    mathLabel(ctx, '$d$', 82, M.y + 12, 38, C.ink, 'center', 1, false);
    dimension(ctx, G.bx, 900, G.sx, 900, C.ink, { tick: 10, head: 12 });
    mathLabel(ctx, '$D$', (G.bx + G.sx) / 2, 912, 38);
    ctx.save();
    ctx.globalAlpha *= 1 - opts.fringes;
    dimension(ctx, 1140, O.y, 1140, P.y, C.ink, { tick: 10, head: 12 });
    mathLabel(ctx, '$y$', 1168, (O.y + P.y) / 2 + 12, 38, C.ink, 'center', 1, false);
    ctx.restore();
    ctx.restore();
  }
  // big triangle with θ
  const tri = opts.triangle;
  if (tri > 0) {
    ctx.save();
    ctx.globalAlpha *= tri;
    ctx.fillStyle = rgba(C.bright, 0.08);
    ctx.beginPath();
    ctx.moveTo(M.x, M.y);
    ctx.lineTo(O.x, O.y);
    ctx.lineTo(P.x, P.y);
    ctx.closePath();
    ctx.fill();
    line(ctx, M.x, M.y, P.x, P.y, C.bright, 3, [10, 7]);
    const ang = Math.atan2(P.y - M.y, P.x - M.x);
    arcAngle(ctx, M.x, M.y, 150, ang, 0, C.bright, 3);
    mathLabel(ctx, '$θ$', M.x + 185, M.y - 16, 38, C.bright, 'center', 1, false);
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 2;
    ctx.strokeRect(O.x - 24, O.y - 24, 24, 24);
    ctx.restore();
  }
  // evenly spaced fringe marks
  const fm = opts.fringes;
  if (fm > 0) {
    ctx.save();
    ctx.globalAlpha *= fm;
    for (let m = -3; m <= 3; m++) {
      const y = O.y - m * G.dy;
      if (y < G.top || y > G.bot) continue;
      glowCircle(ctx, G.sx + 7, y, 34, C.bright, 0.9);
      line(ctx, G.sx - 14, y, G.sx + 28, y, C.bright, 3);
      richText(ctx, `$m = ${m}$`, G.sx + 40, y + 10, { size: 26, color: C.bright });
    }
    for (let m = -3; m < 3; m++) {
      const y = O.y - (m + 0.5) * G.dy;
      if (y < G.top || y > G.bot) continue;
      line(ctx, G.sx - 8, y, G.sx + 22, y, rgba(C.dark, 0.9), 2.5);
    }
    const bxp = G.sx - 50;
    dimension(ctx, bxp, O.y - G.dy, bxp, O.y - 2 * G.dy, C.ink, { tick: 8, head: 10 });
    mathLabel(ctx, '$Δy$', bxp - 44, O.y - 1.5 * G.dy + 12, 34);
    dimension(ctx, bxp, O.y + G.dy, bxp, O.y, C.ink, { tick: 8, head: 10 });
    mathLabel(ctx, '$Δy$', bxp - 44, O.y + 0.5 * G.dy + 12, 34);
    ctx.restore();
  }
  ctx.restore();
}

// zoomed view of the two slits with parallel rays
function zoomDiagram(ctx, t, a, p) {
  if (a <= 0) return;
  const th = (16 * Math.PI) / 180;
  const u = { x: Math.cos(th), y: -Math.sin(th) };
  const S1 = { x: 470, y: 360 };
  const S2 = { x: 470, y: 760 };
  const d = S2.y - S1.y;
  const N = { x: S2.x + d * Math.sin(th) * u.x, y: S2.y + d * Math.sin(th) * u.y };
  const far = 760;
  ctx.save();
  ctx.globalAlpha *= a;
  // barrier
  ctx.fillStyle = '#2a3550';
  ctx.fillRect(S1.x - 10, 130, 20, S1.y - 14 - 130);
  ctx.fillRect(S1.x - 10, S1.y + 14, 20, S2.y - S1.y - 28);
  ctx.fillRect(S1.x - 10, S2.y + 14, 20, 960 - S2.y - 14);
  // normal (horizontal) reference at S2
  line(ctx, S2.x, S2.y, S2.x + 300, S2.y, 'rgba(200,215,255,0.35)', 2, [8, 8]);
  // rays
  const rp = p.rays;
  lineP(ctx, S1.x, S1.y, S1.x + u.x * far, S1.y + u.y * far, rp, C.s1, 5);
  lineP(ctx, S2.x, S2.y, S2.x + u.x * (far + 120), S2.y + u.y * (far + 120), rp, C.s2, 5);
  if (rp > 0.95) {
    richText(ctx, 'to $P$ (far away)', S1.x + u.x * far - 10, S1.y + u.y * far - 26, { size: 30, color: C.muted, align: 'right' });
  }
  dot(ctx, S1.x, S1.y, 9, C.s1);
  dot(ctx, S2.x, S2.y, 9, C.s2);
  mathLabel(ctx, '$S_1$', S1.x - 60, S1.y + 12, 40, C.s1);
  mathLabel(ctx, '$S_2$', S2.x - 60, S2.y + 14, 40, C.s2);
  // θ at S2 between normal and ray
  if (rp > 0.95) {
    arcAngle(ctx, S2.x, S2.y, 200, -th, 0, C.bright, 3);
    mathLabel(ctx, '$θ$', S2.x + 232, S2.y - 22, 38, C.bright, 'center', 1, false);
  }
  // perpendicular from S1 to ray 2
  const pp = p.perp;
  if (pp > 0) {
    lineP(ctx, S1.x, S1.y, N.x, N.y, pp, C.ink, 3, [9, 7]);
    // extend as the 'equal distance' line
    const ext = { x: S1.x - (N.x - S1.x) * 0.25, y: S1.y - (N.y - S1.y) * 0.25 };
    lineP(ctx, S1.x, S1.y, ext.x, ext.y, pp, 'rgba(255,255,255,0.4)', 2, [9, 7]);
    if (pp > 0.95) {
      // right angle mark at N
      ctx.save();
      ctx.translate(N.x, N.y);
      ctx.rotate(-th);
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 2;
      ctx.strokeRect(-26, 0, 26, -26);
      ctx.restore();
      // angle θ at S1 between S1S2 (down) and S1N
      const aDown = Math.PI / 2;
      const aN = Math.atan2(N.y - S1.y, N.x - S1.x);
      arcAngle(ctx, S1.x, S1.y, 110, aN, aDown, C.bright, 3);
      mathLabel(ctx, '$θ$', S1.x + 50, S1.y + 150, 38, C.bright, 'center', 1, false);
    }
  }
  // d
  if (p.d > 0) {
    ctx.save();
    ctx.globalAlpha *= p.d;
    dimension(ctx, S1.x - 120, S1.y, S1.x - 120, S2.y, C.ink, { tick: 10, head: 12 });
    mathLabel(ctx, '$d$', S1.x - 156, (S1.y + S2.y) / 2 + 14, 44, C.ink, 'center', 1, false);
    ctx.restore();
  }
  // δ highlight
  const dh = p.delta;
  if (dh > 0) {
    ctx.save();
    ctx.globalAlpha *= dh;
    ctx.shadowColor = C.s2;
    ctx.shadowBlur = 20;
    line(ctx, S2.x, S2.y, N.x, N.y, '#ffd9b0', 10);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha *= dh;
    const mx = (S2.x + N.x) / 2;
    const my = (S2.y + N.y) / 2;
    mathLabel(ctx, '$δ = d  sinθ$', mx + 30, my + 78, 42, '#ffd9b0', 'left');
    ctx.restore();
  }
  // equal-length note
  if (p.equal > 0) {
    ctx.save();
    ctx.globalAlpha *= p.equal;
    richText(ctx, 'from this line on, both paths are equally long', S1.x + 110, S1.y + 150, { size: 28, color: C.muted, maxW: 380 });
    ctx.restore();
  }
  richText(ctx, 'zoomed in · angle exaggerated', 1150, 1000, { size: 24, color: C.faint, align: 'right', alpha: 1 });
  ctx.restore();
}

export const geometry = {
  id: 'geometry',
  dur: 90,
  tag: [4, 'Where are the fringes?'],
  draw(ctx, t) {
    const out = 1 - seg(t, 89.2, 90);
    ctx.save();
    ctx.globalAlpha *= out;
    const zIn = seg(t, 16.0, 17.6, easeInOut);
    const zOut = seg(t, 34.0, 35.6, easeInOut);
    const zoomA = zIn * (1 - zOut);
    const fullA = seg(t, 0, 1.2, easeOut) * (1 - zoomA);
    fullDiagram(ctx, t, fullA, {
      paths: seg(t, 1.5, 3.5),
      dims: seg(t, 3.0, 4.5),
      triangle: seg(t, 36.0, 37.5),
      fringes: seg(t, 72.0, 73.5),
    });
    // zoom box transition
    if (zIn > 0 && zIn < 1) {
      const bx = lerp(185, 60, zIn);
      const by = lerp(450, 110, zIn);
      const bw = lerp(110, 1120, zIn);
      const bh = lerp(260, 900, zIn);
      ctx.save();
      ctx.strokeStyle = rgba(C.bright, 0.8 * (1 - zIn * 0.6));
      ctx.lineWidth = 2.5;
      ctx.strokeRect(bx, by, bw, bh);
      ctx.restore();
    }
    if (t > 14.8 && t < 16.2) {
      const a = win(t, 14.8, 16.2, 0.4, 0.3);
      ctx.save();
      ctx.strokeStyle = rgba(C.bright, 0.9 * a);
      ctx.lineWidth = 2.5;
      ctx.strokeRect(185, 450, 110, 260);
      ctx.restore();
    }
    zoomDiagram(ctx, t, zoomA, {
      rays: seg(t, 18.0, 20.0),
      d: seg(t, 18.5, 19.5),
      perp: seg(t, 24.6, 26.4),
      equal: win(t, 26.4, 34, 0.6, 0.6),
      delta: seg(t, 28.6, 29.6),
    });
    // small-angle check panel
    const sa = win(t, 44.0, 60.0, 0.7, 0.6);
    if (sa > 0) {
      ctx.save();
      ctx.globalAlpha *= sa;
      panel(ctx, 300, 670, 620, 170, { fill: 'rgba(10,16,30,0.92)' });
      richText(ctx, 'Example: $θ = 0.2°$', 330, 720, { size: 32, color: C.ink });
      richText(ctx, '$sin θ = 0.003491$', 330, 775, { size: 34, color: C.muted });
      richText(ctx, '$tan θ = 0.003491$', 330, 820, { size: 34, color: C.muted });
      richText(ctx, '→ equal to 4 s.f.', 650, 800, { size: 28, color: C.good });
      ctx.restore();
    }
    ctx.restore();

    // ---- right column ----
    const o = { maxW: RW, size: 38 };
    const cy = 150;
    caption(ctx, t, 0.6, 8.6, "Now let's find **where** the fringes are. The slits are $d$ apart, the screen is $D$ away, and $P$ is a height $y$ above the centre $O$.", RX, cy, o);
    caption(ctx, t, 8.8, 15.8, 'In a real set-up $d ≈ 0.3$ mm and $D ≈ 1.5$ m: $D$ is about **5000 times** $d$. This diagram is stretched to show the details.', RX, cy, o);
    caption(ctx, t, 17.8, 24.4, 'Zoom in on the slits. $P$ is so far away that the two paths are practically **parallel**, both at angle $θ$.', RX, cy, o);
    caption(ctx, t, 24.6, 34.0, 'Draw a line from $S_1$ at right angles to the paths. After it, both paths are equally long, so the path difference is the short extra piece:', RX, cy, o);
    caption(ctx, t, 36.0, 44.0, 'Back to the full picture. In the big triangle, $tan θ = y / D$.', RX, cy, o);
    caption(ctx, t, 44.2, 52.0, 'Fringes near the centre have $y ≪ D$, so $θ$ is **very small**. For small angles, $sin θ ≈ tan θ$.', RX, cy, o);
    caption(ctx, t, 52.2, 60.0, 'So the path difference becomes simply:', RX, cy, o);
    caption(ctx, t, 60.2, 68.0, 'A bright fringe needs $δ = mλ$. Solving for its position:', RX, cy, o);
    caption(ctx, t, 68.2, 81.0, 'Neighbouring bright fringes (and dark fringes) are all the same distance apart: the **fringe spacing**.', RX, cy, o);
    caption(ctx, t, 81.2, 89.5, 'The fringes are **evenly spaced**. (They fade far from the centre because each slit has a width, but the spacing stays the same.)', RX, cy, { ...o, size: 34 });

    // equation stack
    const eqs = [
      { a: 29.6, y: 460, parts: ['$δ = d sin θ$'] },
      { a: 38.0, y: 580, parts: ['$tan θ = $', { frac: ['$y$', '$D$'] }] },
      { a: 53.0, y: 720, parts: ['$δ ≈ d tan θ = $', { frac: ['$d y$', '$D$'] }] },
      { a: 61.0, y: 850, parts: ['$y_m = $', { frac: ['$m λ D$', '$d$'] }] },
    ];
    const stackA = win(t, 29.6, 89.5, 0.8, 0.6) ;
    if (stackA > 0) {
      ctx.save();
      ctx.globalAlpha *= stackA;
      for (const [i, e] of eqs.entries()) {
        let a = seg(t, e.a, e.a + 0.8, easeOut);
        if (a <= 0) continue;
        // dim earlier steps once later results arrive
        if (i < 2) a *= 1 - 0.6 * seg(t, 60, 61);
        if (t > 68) a *= 1 - seg(t, 68.4, 69.4);
        equation(ctx, e.parts, RX + (1 - a) * 20, e.y, { size: 48, alpha: a, color: i === 2 ? C.bright : C.ink });
      }
      // fringe spacing result
      const fa = seg(t, 69.0, 70.2, easeOut);
      if (fa > 0) {
        ctx.save();
        ctx.globalAlpha *= fa;
        const by = 480;
        panel(ctx, RX, by, RW, 230, { fill: 'rgba(40,34,10,0.55)', stroke: rgba(C.bright, 0.7), lw: 2.5, r: 20 });
        richText(ctx, 'FRINGE SPACING', RX + 30, by + 50, { size: 26, color: C.bright, weight: 700, family: F.display });
        equation(ctx, ['$Δy = y_{m+1} − y_m = $', { frac: ['$λ D$', '$d$'] }], RX + 30, by + 150, { size: 50, color: C.ink });
        ctx.restore();
        ctx.save();
        ctx.globalAlpha *= seg(t, 71, 72);
        richText(ctx, '$λ$ = wavelength', RX + 10, 780, { size: 30, color: C.muted });
        richText(ctx, '$D$ = slit-to-screen distance', RX + 10, 825, { size: 30, color: C.muted });
        richText(ctx, '$d$ = slit separation', RX + 10, 870, { size: 30, color: C.muted });
        richText(ctx, 'valid when $D ≫ d$ and $y ≪ D$ (small $θ$)', RX + 10, 925, { size: 28, color: C.faint });
        ctx.restore();
      }
      ctx.restore();
    }
  },
};
