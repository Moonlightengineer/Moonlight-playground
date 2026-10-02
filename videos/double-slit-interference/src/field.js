// Two-source wave field, top view, computed per pixel on a reduced grid.
// Physics: each slit radiates a circular wave u_i = a_i(r) cos(k r_i - ωt).
// Incoming plane wave on the left of the barrier is phase-matched at the slits.
import { clamp, hexToRgb } from './core.js';

const TAU = Math.PI * 2;

export class WaveField {
  constructor(rect, scale = 0.5) {
    this.rect = rect;
    this.scale = scale;
    this.gw = Math.round(rect.w * scale);
    this.gh = Math.round(rect.h * scale);
    this.canvas = new OffscreenCanvas(this.gw, this.gh);
    this.cx = this.canvas.getContext('2d');
    this.img = this.cx.createImageData(this.gw, this.gh);
    this.n = this.gw * this.gh;
    this.r = [];
    this.key = '';
  }

  _geometry(slits) {
    const key = slits.map((s) => `${s.x.toFixed(2)},${s.y.toFixed(2)}`).join('|');
    if (key === this.key) return;
    this.key = key;
    const { rect, scale, gw, gh } = this;
    this.r = slits.map((s) => {
      const arr = new Float32Array(this.n);
      let i = 0;
      for (let gy = 0; gy < gh; gy++) {
        const y = rect.y + (gy + 0.5) / scale - s.y;
        for (let gx = 0; gx < gw; gx++) {
          const x = rect.x + (gx + 0.5) / scale - s.x;
          arr[i++] = Math.sqrt(x * x + y * y);
        }
      }
      return arr;
    });
  }

  // p: { time, lambda, speed (px/s), slits:[{x,y}], barrierX, weights:[w1,w2],
  //      mode (0 = instantaneous ripples, 1 = time-averaged brightness),
  //      front (px travelled by circular waves), planeFront (x of incoming front),
  //      color (hex), contrast }
  render(ctx, p) {
    const { rect, scale, gw, gh } = this;
    const slits = p.slits;
    this._geometry(slits);
    const k = TAU / p.lambda;
    const phaseT = (TAU * (p.speed || 60) * p.time) / p.lambda; // ωt
    const weights = p.weights || slits.map(() => 1);
    const mode = clamp(p.mode || 0);
    const front = p.front ?? 1e9;
    const planeFront = p.planeFront ?? 1e9;
    const bx = p.barrierX;
    const [cr, cg, cb] = hexToRgb(p.color || '#62ff9e');
    const fall = p.fall ?? 0.0018; // gentle amplitude fall-off with distance
    const soft = p.lambda * 0.9; // softness of the expanding front
    const d = this.img.data;
    const nS = slits.length;
    const rs = this.r;
    const contrast = p.contrast ?? 1;
        const wsum = weights.reduce((a, b) => a + b, 0) || 1;
    let i = 0;
    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++, i++) {
        const x = rect.x + (gx + 0.5) / scale;
        let u = 0;
        let inten = 0;
        let pres = 0; // how much wave is present here (0 = undisturbed, dark)
        if (x < bx) {
          // incoming plane wave
          const rev = clamp((planeFront - x) / soft + 0.5) * (p.incoming ?? 1);
          if (rev > 0) {
            u = Math.cos(k * (x - bx) - phaseT);
            inten = 0.06 * rev; // uniform incoming light, kept dim so the fan of fringes stands out
            pres = rev;
          }
        } else {
          let re = 0;
          let im = 0;
          let wl = 0;
          for (let s = 0; s < nS; s++) {
            const r = rs[s][i];
            const w = weights[s];
            if (w <= 0) continue;
            const rev = clamp((front - r) / soft + 0.5);
            if (rev <= 0) continue;
            const a = (w * rev) / (1 + r * fall);
            const ph = k * r;
            u += a * Math.cos(ph - phaseT);
            re += a * Math.cos(ph);
            im += a * Math.sin(ph);
            wl = Math.max(wl, rev);
          }
          u /= wsum;
          inten = (re * re + im * im) / (wsum * wsum); // 0..1 (1 = fully constructive)
          pres = wl;
        }
        // instantaneous: crest bright, trough dark; time-average: brightness = intensity
        const vInst = pres * Math.pow(0.5 + 0.5 * clamp(u * contrast, -1, 1), 2);
        const vAvg = Math.pow(clamp(inten), 0.8);
        const b = vInst * (1 - mode) + vAvg * mode;
        const hi = Math.max(0, b - 0.75) * 2.2; // push the brightest crests toward white
        const j = i * 4;
        d[j] = 6 + (cr - 6) * b + 120 * hi;
        d[j + 1] = 11 + (cg - 11) * b + 40 * hi;
        d[j + 2] = 22 + (cb - 22) * b + 90 * hi;
        d[j + 3] = 255;
      }
    }
    this.cx.putImageData(this.img, 0, 0);
    ctx.save();
    if (p.alpha !== undefined) ctx.globalAlpha *= p.alpha;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (p.clip) p.clip(ctx);
    ctx.drawImage(this.canvas, rect.x, rect.y, rect.w, rect.h);
    ctx.restore();
  }
}

// Exact relative intensity at a point (x, y) from equal-amplitude point sources.
export function intensityAt(slits, lambda, x, y) {
  const k = TAU / lambda;
  let re = 0;
  let im = 0;
  for (const s of slits) {
    const r = Math.hypot(x - s.x, y - s.y);
    re += Math.cos(k * r);
    im += Math.sin(k * r);
  }
  return (re * re + im * im) / (slits.length * slits.length);
}

export function pathDiff(slits, x, y) {
  const r1 = Math.hypot(x - slits[0].x, y - slits[0].y);
  const r2 = Math.hypot(x - slits[1].x, y - slits[1].y);
  return { r1, r2, delta: r2 - r1 };
}

// Find y on the screen line x = sx where (r2 - r1) = target (bisection).
export function solveY(slits, sx, target, yLo, yHi) {
  let a = yLo;
  let b = yHi;
  const f = (y) => pathDiff(slits, sx, y).delta - target;
  let fa = f(a);
  for (let it = 0; it < 60; it++) {
    const m = (a + b) / 2;
    const fm = f(m);
    if ((fm < 0) === (fa < 0)) {
      a = m;
      fa = fm;
    } else b = m;
  }
  return (a + b) / 2;
}
