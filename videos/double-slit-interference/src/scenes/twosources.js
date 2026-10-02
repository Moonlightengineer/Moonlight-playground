// Chapter 2: top view — plane wave, two slits become coherent sources, interference, fringes.
import { C, F, clamp, lerp, seg, win, easeInOut, easeOut, richText, rgba, line, dot, glowCircle, roundRect } from '../core.js';
import { caption, screenStrip } from '../widgets.js';
import { WaveField, intensityAt, solveY } from '../field.js';
import { TOP, slitsFor } from './common.js';

let field = null;
export function getField() {
  if (!field) field = new WaveField(TOP.rect, 0.5);
  return field;
}

// Barrier with gaps at the slits
export function drawBarrier(ctx, slits, alpha = 1, gap = 12) {
  const x = TOP.barrierX;
  const y0 = TOP.rect.y;
  const y1 = TOP.rect.y + TOP.rect.h;
  const ys = slits.map((s) => s.y).sort((a, b) => a - b);
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = '#2a3550';
  const segs = [];
  let prev = y0;
  for (const y of ys) {
    segs.push([prev, y - gap / 2]);
    prev = y + gap / 2;
  }
  segs.push([prev, y1]);
  for (const [a, b] of segs) {
    if (b > a) ctx.fillRect(x - 5, a, 10, b - a);
  }
  ctx.restore();
}

export function drawFrame(ctx, alpha = 1) {
  const r = TOP.rect;
  ctx.save();
  ctx.globalAlpha *= alpha;
  roundRect(ctx, r.x, r.y, r.w, r.h, 16);
  ctx.strokeStyle = 'rgba(150,170,215,0.18)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

// Fade the edges of the field into the background
export function fieldVignette(ctx, alpha = 1) {
  const r = TOP.rect;
  ctx.save();
  ctx.globalAlpha *= alpha;
  const edges = [
    [r.x, r.y, r.w, 50, 0, r.y, 0, r.y + 50],
    [r.x, r.y + r.h - 50, r.w, 50, 0, r.y + r.h, 0, r.y + r.h - 50],
  ];
  for (const [x, y, w, h, gx0, gy0, gx1, gy1] of edges) {
    const g = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
    g.addColorStop(0, 'rgba(6,10,20,1)');
    g.addColorStop(1, 'rgba(6,10,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
}

export function topViewBadge(ctx, alpha = 1) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  const x = TOP.rect.x + 22;
  const y = TOP.rect.y + 22;
  roundRect(ctx, x, y, 290, 40, 20);
  ctx.fillStyle = 'rgba(4,7,14,0.75)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.stroke();
  richText(ctx, 'TOP VIEW', x + 20, y + 28, { size: 22, weight: 700, color: C.ink, family: F.display });
  richText(ctx, 'not to scale', x + 140, y + 28, { size: 20, color: C.muted });
  ctx.restore();
}

// Screen strip on the right edge of the top view, exact two-source intensity.
export function drawScreen(ctx, slits, reveal = 1, alpha = 1) {
  const x = TOP.screenX;
  const y0 = TOP.rect.y + 20;
  const y1 = TOP.rect.y + TOP.rect.h - 20;
  // clear behind the screen
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = '#05080f';
  ctx.fillRect(x, TOP.rect.y, TOP.rect.x + TOP.rect.w - x, TOP.rect.h);
  ctx.restore();
  screenStrip(ctx, x + 2, y0, y1, 26, (y) => intensityAt(slits, TOP.lambda, x, y) * reveal, [98, 255, 158], alpha);
}

export function slitLabels(ctx, slits) {
  for (const [i, s] of slits.entries()) {
    const x = TOP.barrierX - 64;
    const y = s.y;
    ctx.fillStyle = 'rgba(4,7,14,0.85)';
    roundRect(ctx, x - 30, y - 26, 62, 50, 12);
    ctx.fill();
    richText(ctx, `$S_${i + 1}$`, x, y + 12, { size: 38, color: i ? C.s2 : C.s1, align: 'center' });
  }
}

export const twoSources = {
  id: 'twosources',
  dur: 56,
  tag: [2, 'Two slits, two sources'],
  draw(ctx, t, info) {
    const F0 = getField();
    const slits = slitsFor(TOP.d);
    const appear = seg(t, 0, 1.2, easeOut);
    const out = 1 - seg(t, 55.2, 56);
    const tArrive = 1.0 + (TOP.barrierX - TOP.rect.x) / TOP.speed; // plane wave reaches slits
    const planeFront = TOP.rect.x + (t - 1.0) * TOP.speed;
    const front = (t - tArrive) * TOP.speed;
    const mode = seg(t, 33.5, 37.5, easeInOut);
    ctx.save();
    ctx.globalAlpha *= appear * out;
    F0.render(ctx, {
      time: info.T,
      lambda: TOP.lambda,
      speed: TOP.speed,
      slits,
      barrierX: TOP.barrierX,
      mode,
      front,
      planeFront,
      color: C.light,
      contrast: 1.15,
    });
    fieldVignette(ctx);
    // screen reveals as the waves arrive
    const reachScreen = tArrive + (TOP.screenX - TOP.barrierX) / TOP.speed;
    const screenOn = seg(t, reachScreen - 1, reachScreen + 1.5);
    drawScreen(ctx, slits, screenOn);
    drawBarrier(ctx, slits);
    drawFrame(ctx);
    topViewBadge(ctx, win(t, 0.5, 56, 0.8, 0.6));
    richText(ctx, 'screen', TOP.screenX + 15, TOP.rect.y - 16, { size: 26, color: C.muted, align: 'center', alpha: screenOn });

    // slit labels and "in step" pulses
    const sl = win(t, tArrive - 0.3, 56, 0.6, 0.6);
    if (sl > 0) {
      ctx.save();
      ctx.globalAlpha *= sl;
      slitLabels(ctx, slits);
      ctx.restore();
    }
    const sync = win(t, 15.2, 24.5, 0.6, 0.6);
    if (sync > 0) {
      const pulse = 0.5 + 0.5 * Math.cos((2 * Math.PI * TOP.speed * info.T) / TOP.lambda);
      for (const s of slits) {
        glowCircle(ctx, s.x, s.y, 30 + 26 * pulse, C.bright, sync * (0.4 + 0.6 * pulse));
      }
      ctx.save();
      ctx.globalAlpha *= sync;
      line(ctx, TOP.barrierX + 34, slits[0].y, TOP.barrierX + 34, slits[1].y, rgba(C.bright, 0.7), 2, [5, 6]);
      richText(ctx, '{bright:**in step**}', TOP.barrierX + 48, TOP.cy + 10, { size: 30 });
      ctx.restore();
    }

    // nodal / antinodal lines overlay
    const ov = win(t, 25.0, 33.6, 1.0, 0.8);
    if (ov > 0) {
      ctx.save();
      ctx.globalAlpha *= ov;
      const draw = (m, color, dash) => {
        const target = m * TOP.lambda;
        ctx.strokeStyle = color;
        ctx.lineWidth = 3.5;
        ctx.setLineDash(dash);
        ctx.beginPath();
        let started = false;
        for (let x = TOP.barrierX + 40; x <= TOP.screenX; x += 10) {
          const y = solveY(slits, x, target, TOP.cy - 2000, TOP.cy + 2000);
          if (y < TOP.rect.y + 10 || y > TOP.rect.y + TOP.rect.h - 10) {
            started = false;
            continue;
          }
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else ctx.lineTo(x, y);
        }
        ctx.stroke();
      };
      for (let m = -3; m <= 3; m++) draw(m, rgba(C.bright, 0.95), []);
      for (let m = -3; m < 3; m++) draw(m + 0.5, rgba(C.dark, 0.95), [10, 9]);
      ctx.setLineDash([]);
      ctx.restore();
      // legend
      ctx.save();
      ctx.globalAlpha *= ov;
      const lx = TOP.rect.x + 30;
      const ly = TOP.rect.y + TOP.rect.h - 90;
      roundRect(ctx, lx - 10, ly - 34, 520, 104, 14);
      ctx.fillStyle = 'rgba(4,7,14,0.8)';
      ctx.fill();
      line(ctx, lx + 6, ly - 8, lx + 56, ly - 8, C.bright, 4);
      richText(ctx, 'always constructive (strong waves)', lx + 72, ly + 2, { size: 26, color: C.ink });
      line(ctx, lx + 6, ly + 36, lx + 56, ly + 36, C.dark, 4, [10, 9]);
      richText(ctx, 'always destructive (calm)', lx + 72, ly + 46, { size: 26, color: C.ink });
      ctx.restore();
    }

    // fringe labels on the screen in the final part
    const fl = win(t, 42.0, 56, 0.8, 0.6);
    if (fl > 0) {
      ctx.save();
      ctx.globalAlpha *= fl;
      const sx = TOP.screenX + 34;
      const yB = [0, 1, 2].map((m) => solveY(slits, TOP.screenX, m * TOP.lambda, TOP.cy - 1000, TOP.cy + 10));
      const yD = [0.5, 1.5].map((m) => solveY(slits, TOP.screenX, m * TOP.lambda, TOP.cy - 1000, TOP.cy + 10));
      for (const y of yB) {
        line(ctx, sx, y, sx + 26, y, C.bright, 2.5);
        richText(ctx, 'bright', sx + 34, y + 9, { size: 26, color: C.bright, weight: 600 });
      }
      for (const y of yD) {
        line(ctx, sx, y, sx + 26, y, C.dark, 2.5);
        richText(ctx, 'dark', sx + 34, y + 9, { size: 26, color: C.dark, weight: 600 });
      }
      ctx.restore();
    }
    ctx.restore();

    // ---- right column captions ----
    const RX = 1300;
    const RW = 540;
    const o = { maxW: RW, size: 40 };
    caption(ctx, t, 1.0, 7.4, '**Seen from above.** Bright bands are wave crests. The light arrives at the two slits.', RX, 250, o);
    caption(ctx, t, 7.6, 15.0, 'Each narrow slit spreads the light out (**diffraction**), so each acts as a **new source** of circular waves.', RX, 250, o);
    caption(ctx, t, 15.2, 24.6, 'The **same** wave reaches both slits at the same moment, so the two new sources stay **in step**. Sources with a fixed phase relationship are called **coherent**.', RX, 250, o);
    caption(ctx, t, 24.8, 33.6, 'Where the waves overlap they **interfere**: some lines have strong waves, others stay almost calm.', RX, 250, o);
    caption(ctx, t, 33.8, 42.0, 'Averaged over time, the pattern is clear: **bright** directions and **dark** directions fan out from the slits.', RX, 250, o);
    caption(ctx, t, 42.2, 55.6, 'Where a bright direction meets the screen, we see a {bright:**bright fringe**}. Where a dark one meets it, a {dark:**dark fringe**}.', RX, 250, o);
    caption(ctx, t, 47.0, 55.6, 'But what decides which is which? Next: **path difference**.', RX, 560, { maxW: RW, size: 34, color: C.ink });
  },
};
