// Opening: a 3D lab view. Prediction (two bands) vs reality (many fringes), then the hook question.
import { W, H, C, F, clamp, lerp, seg, win, easeInOut, easeOut, richText, rgba, glowCircle } from '../core.js';
import { caption } from '../widgets.js';

// ---- tiny perspective camera ----
function camera(eye, target, focal) {
  const fx = target[0] - eye[0];
  const fy = target[1] - eye[1];
  const fz = target[2] - eye[2];
  const fl = Math.hypot(fx, fy, fz);
  const f = [fx / fl, fy / fl, fz / fl];
  // right = f x up(0,1,0)
  let r = [f[1] * 0 - f[2] * 1, f[2] * 0 - f[0] * 0, f[0] * 1 - f[1] * 0];
  const rl = Math.hypot(...r);
  r = r.map((v) => v / rl);
  // up = r x f
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  return (p) => {
    const d = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]];
    const z = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
    const x = d[0] * r[0] + d[1] * r[1] + d[2] * r[2];
    const y = d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
    if (z < 0.05) return null;
    return [W / 2 + (focal * x) / z, H / 2 - (focal * y) / z, z];
  };
}

function poly(ctx, proj, pts, fill) {
  const q = pts.map(proj);
  if (q.some((v) => !v)) return false;
  ctx.beginPath();
  q.forEach((v, i) => (i ? ctx.lineTo(v[0], v[1]) : ctx.moveTo(v[0], v[1])));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  return q;
}

const SLIT_Z = 0.45; // half separation (exaggerated for visibility)
const SCREEN_X = 8;
const FRINGE = 0.62; // fringe spacing on the screen (world units)
const ENV = 4.6; // single-slit envelope zero

function fringeI(z) {
  const c = Math.cos((Math.PI * z) / FRINGE) ** 2;
  const u = (Math.PI * z) / ENV;
  const e = Math.abs(u) < 1e-6 ? 1 : (Math.sin(u) / u) ** 2;
  return c * e;
}

let glowCache = null;
function glowStrip() {
  if (glowCache) return glowCache;
  const w = 96;
  const h = 24;
  const c = new OffscreenCanvas(w, h);
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const gy = Math.exp(-(((y + 0.5 - h / 2) / (h * 0.28)) ** 2));
    for (let x = 0; x < w; x++) {
      const z = -4.2 - 0.4 + (9.0 * (x + 0.5)) / w;
      const I = fringeI(z) * gy;
      const j = (y * w + x) * 4;
      img.data[j] = 98;
      img.data[j + 1] = 255;
      img.data[j + 2] = 158;
      img.data[j + 3] = Math.round(255 * 0.6 * I);
    }
  }
  g.putImageData(img, 0, 0);
  // blur once more by downscale/upscale
  const c2 = new OffscreenCanvas(w / 2, h / 2);
  c2.getContext('2d').drawImage(c, 0, 0, w / 2, h / 2);
  glowCache = c2;
  return glowCache;
}

export const intro = {
  id: 'intro',
  dur: 33,
  noBar: false,
  draw(ctx, t) {
    // camera path: oblique overview -> face-on screen
    const k = seg(t, 15.5, 22.5, easeInOut);
    const eye = [lerp(-8.5, 1.6, k), lerp(4.6, 0.0, k), lerp(10.5, 0.0, k)];
    const target = [lerp(0.3, SCREEN_X, k), lerp(0.3, 0, k), lerp(-0.4, 0, k)];
    const focal = lerp(1380, 1240, k);
    const proj = camera(eye, target, focal);
    const sceneA = win(t, 0, 33, 1.2, 0.8);

    ctx.save();
    ctx.globalAlpha = sceneA;
    const beamOn = seg(t, 1.0, 2.2, easeOut);
    const predict = win(t, 8.0, 14.0, 1.0, 1.0);
    const reality = seg(t, 13.2, 15.2, easeInOut);
    const cardFade = 1 - seg(t, 17.5, 19.5);

    // table surface lines (subtle grid for depth)
    ctx.save();
    ctx.globalAlpha *= 0.35 * (1 - k);
    ctx.strokeStyle = 'rgba(120,150,210,0.18)';
    ctx.lineWidth = 1;
    for (let gx = -10; gx <= 10; gx += 1) {
      const a = proj([gx, -2.6, -5]);
      const b = proj([gx, -2.6, 5]);
      if (a && b) {
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
      }
    }
    for (let gz = -5; gz <= 5; gz += 1) {
      const a = proj([-10, -2.6, gz]);
      const b = proj([10, -2.6, gz]);
      if (a && b) {
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
      }
    }
    ctx.restore();

    // screen
    const sz = 4.2;
    const sy = 2.5;
    poly(ctx, proj, [[SCREEN_X, -sy, -sz], [SCREEN_X, sy, -sz], [SCREEN_X, sy, sz], [SCREEN_X, -sy, sz]], '#0d1322');
    // screen frame
    const sq = [[SCREEN_X, -sy, -sz], [SCREEN_X, sy, -sz], [SCREEN_X, sy, sz], [SCREEN_X, -sy, sz]].map(proj);
    if (sq.every(Boolean)) {
      ctx.strokeStyle = 'rgba(160,180,230,0.25)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      sq.forEach((v, i) => (i ? ctx.lineTo(v[0], v[1]) : ctx.moveTo(v[0], v[1])));
      ctx.closePath();
      ctx.stroke();
    }

    // light fan after the slits (reality)
    if (reality > 0 && k < 0.7) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha *= 1 - seg(k, 0, 0.6);
      for (const s of [-1, 1]) {
        const a = proj([0.02, 0, s * SLIT_Z]);
        const b = proj([SCREEN_X - 0.01, 0, -sz]);
        const c = proj([SCREEN_X - 0.01, 0, sz]);
        const b2 = proj([SCREEN_X - 0.01, 1.2, 0]);
        const c2 = proj([SCREEN_X - 0.01, -1.2, 0]);
        if (a && b && c) {
          const g = ctx.createLinearGradient(a[0], a[1], (b[0] + c[0]) / 2, (b[1] + c[1]) / 2);
          g.addColorStop(0, rgba(C.light, 0.11 * reality));
          g.addColorStop(1, rgba(C.light, 0.02 * reality));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(b[0], b[1]);
          ctx.lineTo(c[0], c[1]);
          ctx.closePath();
          ctx.fill();
          if (b2 && c2) {
            ctx.beginPath();
            ctx.moveTo(a[0], a[1]);
            ctx.lineTo(b2[0], b2[1]);
            ctx.lineTo(c2[0], c2[1]);
            ctx.closePath();
            ctx.fill();
          }
        }
      }
      ctx.restore();
    }

    // fringes on the screen
    if (reality > 0) {
      ctx.save();
      const N = 200;
      for (let i = 0; i < N; i++) {
        const z0 = -sz + (2 * sz * i) / N;
        const z1 = -sz + (2 * sz * (i + 1)) / N;
        const I = fringeI((z0 + z1) / 2) * reality;
        if (I < 0.008) continue;
        const top = proj([SCREEN_X - 0.005, 1.6, (z0 + z1) / 2]);
        const bot = proj([SCREEN_X - 0.005, -1.6, (z0 + z1) / 2]);
        if (!top || !bot) continue;
        const g = ctx.createLinearGradient(top[0], top[1], bot[0], bot[1]);
        for (let j = 0; j <= 8; j++) {
          const yy = 1.6 - (3.2 * j) / 8;
          const gy = Math.exp(-((yy / 1.0) ** 2));
          g.addColorStop(j / 8, `rgba(98,255,158,${Math.min(1, I * gy * 1.05)})`);
        }
        poly(ctx, proj, [[SCREEN_X - 0.005, -1.6, z0], [SCREEN_X - 0.005, 1.6, z0], [SCREEN_X - 0.005, 1.6, z1 + 0.003], [SCREEN_X - 0.005, -1.6, z1 + 0.003]], g);
      }
      ctx.restore();
    }

    // prediction: two straight beams + two bands
    if (predict > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const s of [-1, 1]) {
        const a = proj([0.02, 0, s * SLIT_Z]);
        const b = proj([SCREEN_X, 0, s * SLIT_Z]);
        if (a && b) {
          const grow = seg(t, 8.0, 9.5, easeOut);
          ctx.strokeStyle = rgba(C.light, 0.55 * predict);
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(lerp(a[0], b[0], grow), lerp(a[1], b[1], grow));
          ctx.stroke();
        }
        const band = seg(t, 9.2, 10.4);
        for (let j = 0; j < 10; j++) {
          const y0 = -1.0 + 0.2 * j;
          const gy = Math.exp(-(((y0 + 0.1) / 0.75) ** 2));
          poly(ctx, proj, [[SCREEN_X - 0.01, y0, s * SLIT_Z - 0.12], [SCREEN_X - 0.01, y0 + 0.2, s * SLIT_Z - 0.12], [SCREEN_X - 0.01, y0 + 0.2, s * SLIT_Z + 0.12], [SCREEN_X - 0.01, y0, s * SLIT_Z + 0.12]],
            rgba(C.light, 0.8 * gy * band * predict));
        }
      }
      ctx.restore();
      // dashed outline marking the prediction
      const p = proj([SCREEN_X, 1.35, 0]);
      if (p) {
        ctx.save();
        ctx.globalAlpha *= seg(t, 9.6, 10.6) * predict;
        richText(ctx, 'PREDICTION', p[0], p[1] - 22, { size: 26, weight: 700, color: C.light, align: 'center', family: F.display });
        ctx.restore();
      }
    }

    // slit card (fades as camera moves through)
    if (cardFade > 0) {
      ctx.save();
      ctx.globalAlpha *= cardFade;
      const cz = 2.3;
      const cy = 1.7;
      poly(ctx, proj, [[0, -cy, -cz], [0, cy, -cz], [0, cy, cz], [0, -cy, cz]], '#1a2133');
      // beam spot on card
      const spot = proj([0, 0, 0]);
      if (spot && beamOn > 0.95) glowCircle(ctx, spot[0], spot[1], 120, C.light, 0.35);
      for (const s of [-1, 1]) {
        poly(ctx, proj, [[-0.005, -1.0, s * SLIT_Z - 0.05], [-0.005, 1.0, s * SLIT_Z - 0.05], [-0.005, 1.0, s * SLIT_Z + 0.05], [-0.005, -1.0, s * SLIT_Z + 0.05]],
          beamOn > 0.95 ? rgba('#c8ffe0', 0.95) : '#05080f');
      }
      ctx.restore();
    }

    // laser box + beam
    if (cardFade > 0) {
      ctx.save();
      ctx.globalAlpha *= cardFade;
      const L0 = -7.5;
      const L1 = -5.2;
      const hh = 0.38;
      poly(ctx, proj, [[L0, -hh, -hh], [L1, -hh, -hh], [L1, hh, -hh], [L0, hh, -hh]], '#2a3348');
      poly(ctx, proj, [[L0, hh, -hh], [L1, hh, -hh], [L1, hh, hh], [L0, hh, hh]], '#3a4560');
      poly(ctx, proj, [[L1, -hh, -hh], [L1, hh, -hh], [L1, hh, hh], [L1, -hh, hh]], '#222a3c');
      const a = proj([L1, 0, 0]);
      const b = proj([-0.02, 0, 0]);
      if (a && b && beamOn > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const ex = lerp(a[0], b[0], beamOn);
        const ey = lerp(a[1], b[1], beamOn);
        ctx.strokeStyle = rgba(C.light, 0.25);
        ctx.lineWidth = 16;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.strokeStyle = rgba('#d9ffe9', 0.95);
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.restore();
      }
      // labels
      const lab = win(t, 3.0, 15.0, 0.8, 0.8);
      if (lab > 0) {
        ctx.save();
        ctx.globalAlpha *= lab;
        const items = [
          [[(L0 + L1) / 2, hh, -hh], 'laser', -70],
          [[0, 1.7, -2.3], 'card with two slits', -40],
          [[SCREEN_X, 2.5, -4.2], 'screen', -40],
        ];
        for (const [pt, txt, off] of items) {
          const q = proj(pt);
          if (!q) continue;
          ctx.strokeStyle = 'rgba(200,215,255,0.45)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(q[0], q[1]);
          ctx.lineTo(q[0], q[1] + off + 12);
          ctx.stroke();
          richText(ctx, txt, q[0], q[1] + off, { size: 28, color: C.ink, align: 'center', weight: 600 });
        }
        ctx.restore();
      }
      ctx.restore();
    }
    ctx.restore();

    // face-on: glow layer over the fringes once camera arrives
    const faceOn = seg(t, 21.0, 23.0);
    if (faceOn > 0) {
      ctx.save();
      ctx.globalAlpha *= faceOn * 0.55 * sceneA;
      ctx.globalCompositeOperation = 'lighter';
      const q0 = proj([SCREEN_X, 0, -4.2]);
      const q1 = proj([SCREEN_X, 0, 4.2]);
      if (q0 && q1) {
        // soft glow: a tiny pre-rendered strip scaled up (cheap blur)
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(glowStrip(), q0[0] - 40, H / 2 - 260, q1[0] - q0[0] + 80, 520);
      }
      ctx.restore();
    }

    // ---- captions ----
    const capOpts = { size: 46, maxW: 860, color: C.ink };
    caption(ctx, t, 2.6, 8.0, 'A laser shines on a card with **two narrow slits**. What will appear on the screen?', 110, 150, capOpts);
    caption(ctx, t, 8.4, 13.4, 'If light simply went straight through each slit, we would expect **two bright bands**.', 110, 150, capOpts);
    caption(ctx, t, 14.0, 20.4, 'Instead, the screen shows **many** bright and dark stripes, called {light:**fringes**}.', 110, 150, capOpts);
    // hook question on the face-on screen
    const hq = win(t, 22.6, 33, 0.9, 0.8);
    if (hq > 0) {
      ctx.save();
      ctx.globalAlpha *= hq;
      const grd = ctx.createLinearGradient(0, H - 420, 0, H);
      grd.addColorStop(0, 'rgba(4,7,14,0)');
      grd.addColorStop(0.45, 'rgba(4,7,14,0.85)');
      grd.addColorStop(1, 'rgba(4,7,14,0.95)');
      ctx.fillStyle = grd;
      ctx.fillRect(0, H - 420, W, 420);
      const grd2 = ctx.createLinearGradient(0, 0, 0, 330);
      grd2.addColorStop(0, 'rgba(4,7,14,0.95)');
      grd2.addColorStop(1, 'rgba(4,7,14,0)');
      ctx.fillStyle = grd2;
      ctx.fillRect(0, 0, W, 330);
      richText(ctx, 'Light from **both** slits reaches the dark stripes — yet they stay dark.', W / 2, 140, { size: 44, color: C.ink, align: 'center', maxW: 1500 });
      const q2 = seg(t, 24.6, 25.6, easeOut);
      ctx.globalAlpha *= q2;
      richText(ctx, 'How can adding light make **darkness**?', W / 2, 210 + (1 - q2) * 12, { size: 52, color: C.bright, align: 'center', weight: 600 });
      ctx.restore();
      const tt = seg(t, 27.0, 28.4, easeOut);
      if (tt > 0) {
        ctx.save();
        ctx.globalAlpha *= tt * hq;
        richText(ctx, "Young's Double-Slit Experiment", W / 2, H - 190 + (1 - tt) * 16, { size: 84, family: F.display, weight: 700, color: C.ink, align: 'center' });
        richText(ctx, 'Interference of light, step by step', W / 2, H - 120, { size: 36, color: C.muted, align: 'center' });
        ctx.restore();
      }
    }
  },
};
