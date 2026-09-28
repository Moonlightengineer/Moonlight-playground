// Soundtrack: every sample is computed here — no recordings, no samples,
// no plug-ins. Runs in Node (offline WAV) and in the browser (live page).
// The score is written against the same clock as the picture: typed tokens
// play notes, the drop lands on the cut, kicks drive the LED facades.
import { BEAT, CODE, CHAR_W, T_BUILD, T_RISE, T_LIGHT, T_PRINT, PRINT_STEP, typingSchedule, mulberry32 } from './city.js';
import { KICKS } from './timeline.js';

export const SR = 48000;
export const LENGTH = 30;
const TAU = Math.PI * 2;
const B = (b) => b * BEAT;                       // beats → seconds
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const n = (s) => { const m = /^([A-G][#b]?)(-?\d)$/.exec(s); return NOTE[m[1]] + (+m[2] + 1) * 12; };

// ------------------------------------------------------------------ DSP
function polyblep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

class SVF { // Zavalishin TPT state-variable filter
  constructor() { this.ic1 = 0; this.ic2 = 0; this.set(1000, 0.707); }
  set(fc, q) {
    const g = Math.tan(Math.PI * Math.min(fc, SR * 0.45) / SR);
    this.k = 1 / q; this.a1 = 1 / (1 + g * (g + this.k)); this.a2 = g * this.a1; this.a3 = g * this.a2;
  }
  run(v0) {
    const v3 = v0 - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1; this.ic2 = 2 * v2 - this.ic2;
    this.lp = v2; this.bp = v1; this.hp = v0 - this.k * v1 - v2;
    return v2;
  }
}

const panL = (p) => Math.cos((p + 1) * Math.PI / 4);
const panR = (p) => Math.sin((p + 1) * Math.PI / 4);

class Bus {
  constructor(len) { this.L = new Float32Array(len); this.R = new Float32Array(len); }
}

// ------------------------------------------------------------------ score
export function renderScore({ sampleRate = SR, stems = false } = {}) {
  if (sampleRate !== SR) throw new Error('score is authored at 48 kHz');
  const len = Math.ceil(LENGTH * SR);
  const bus = {
    drums: new Bus(len), bass: new Bus(len), music: new Bus(len), lead: new Bus(len), fx: new Bus(len),
    verb: new Bus(len), delay: new Bus(len),
  };
  const rnd = mulberry32(96);
  const noise = () => rnd() * 2 - 1;
  const at = (t) => Math.max(0, Math.round(t * SR));

  // write a voice: fn(i, t) returns [l, r] or a mono number
  function voice(target, t0, dur, fn, { pan = 0, verb = 0, delay = 0 } = {}) {
    const i0 = at(t0), i1 = Math.min(len, at(t0 + dur));
    const gl = panL(pan), gr = panR(pan);
    const tail = Math.round(0.006 * SR);                             // de-click every voice's end
    for (let i = i0; i < i1; i++) {
      const t = (i - i0) / SR;
      const v = fn(t);
      let l, r;
      if (typeof v === 'number') { l = v * gl; r = v * gr; } else { l = v[0]; r = v[1]; }
      if (i1 - i < tail) { const w = 0.5 - 0.5 * Math.cos(Math.PI * (i1 - i) / tail); l *= w; r *= w; }
      target.L[i] += l; target.R[i] += r;
      if (verb) { bus.verb.L[i] += l * verb; bus.verb.R[i] += r * verb; }
      if (delay) { bus.delay.L[i] += l * delay; bus.delay.R[i] += r * delay; }
    }
  }

  // ---------------------------------------------------------------- instruments
  const bell = (t0, midi, { amp = 0.2, pan = 0, dur = 2.4, verb = 0.5, delay = 0.15, ratio = 3.5, index = 3.2 } = {}) => {
    const f = mtof(midi);
    let pc = 0, pm = 0, p2 = 0;
    voice(bus.music, t0, dur, (t) => {
      pm += f * ratio / SR; pc += f / SR; p2 += f * 2.756 / SR;
      const idx = index * Math.exp(-t * 6) + 0.4;
      const a = amp * (1 - Math.exp(-t * 900)) * Math.exp(-t * 2.6);
      return a * (Math.sin(TAU * pc + idx * Math.sin(TAU * pm)) + 0.22 * Math.sin(TAU * p2) * Math.exp(-t * 5));
    }, { pan, verb, delay });
  };

  const tick = (t0, pan, amp = 0.06) => {
    const bp = new SVF(); bp.set(4200 + 1500 * rnd(), 2.5);
    let ph = 0;
    voice(bus.fx, t0, 0.05, (t) => {
      ph += 70 / SR;
      return amp * (bp.run(noise()) * Math.exp(-t * 900) * 2.2 + 0.5 * Math.sin(TAU * ph) * Math.exp(-t * 160));
    }, { pan, verb: 0.08 });
  };

  const kick = (t0, vel = 1) => {
    let ph = 0;
    const hp = new SVF(); hp.set(2500, 0.7);
    voice(bus.drums, t0, 0.55, (t) => {
      const f = 44 + 115 * Math.exp(-t * 26) + 30 * Math.exp(-t * 110);
      ph += f / SR;
      const body = Math.tanh(2.1 * Math.sin(TAU * ph) * Math.exp(-t * 6.2) * (1 - Math.exp(-t * 3000)));
      hp.run(noise());
      return vel * (0.86 * body + 0.18 * hp.hp * Math.exp(-t * 320));
    });
  };

  const clap = (t0, vel = 1) => {
    const f1 = new SVF(), f2 = new SVF(); f1.set(1300, 0.9); f2.set(1500, 0.9);
    voice(bus.drums, t0, 0.5, (t) => {
      let e = 0;
      for (const o of [0, 0.011, 0.023]) if (t >= o) e = Math.max(e, Math.exp(-(t - o) * 140));
      if (t >= 0.031) e = Math.max(e, 0.75 * Math.exp(-(t - 0.031) * 17));
      const l = f1.run(noise()), r = f2.run(noise());
      return [vel * 0.5 * l * e, vel * 0.5 * r * e];
    }, { verb: 0.18 });
  };

  const HAT_F = [205.3, 304.4, 369.6, 522.7, 540, 800];
  const hat = (t0, vel = 1, open = false, pan = 0.25) => {
    const ph = new Float64Array(6);
    const bp = new SVF(); bp.set(10500, 1.1);
    const hp = new SVF(); hp.set(7000, 0.7);
    const dec = open ? 7 : 48;
    voice(bus.drums, t0, open ? 0.6 : 0.16, (t) => {
      let s = 0;
      for (let k = 0; k < 6; k++) { ph[k] += HAT_F[k] * 2.1 / SR; s += (ph[k] % 1) < 0.5 ? 1 : -1; }
      bp.run(s * 0.12 + noise() * 0.5);
      hp.run(bp.bp);
      return vel * 0.2 * hp.hp * Math.exp(-t * dec) * (1 - Math.exp(-t * 4000));
    }, { pan, verb: 0.05 });
  };

  const snare = (t0, vel = 1, pan = 0) => {
    let ph = 0;
    const bp = new SVF(); bp.set(3500, 0.8);
    voice(bus.drums, t0, 0.35, (t) => {
      ph += (182 + 40 * Math.exp(-t * 60)) / SR;
      return vel * (0.35 * Math.sin(TAU * ph) * Math.exp(-t * 28) + 0.45 * bp.run(noise()) * Math.exp(-t * 19));
    }, { pan, verb: 0.2 });
  };

  const tom = (t0, midi, vel = 1, pan = 0) => {
    let ph = 0;
    const f = mtof(midi);
    voice(bus.drums, t0, 0.6, (t) => {
      ph += f * (1 + 0.6 * Math.exp(-t * 18)) / SR;
      return vel * 0.55 * Math.tanh(1.5 * Math.sin(TAU * ph)) * Math.exp(-t * 7.5);
    }, { pan, verb: 0.25 });
  };

  const crash = (t0, vel = 1, reverse = 0) => {
    const hl = new SVF(), hr = new SVF(); hl.set(5200, 0.6); hr.set(5600, 0.6);
    const ph = new Float64Array(6);
    const dur = reverse || 3.2;
    voice(bus.drums, t0, dur, (t) => {
      let s = 0;
      for (let k = 0; k < 6; k++) { ph[k] += HAT_F[k] * 3.3 / SR; s += (ph[k] % 1) < 0.5 ? 1 : -1; }
      const e = reverse ? Math.pow(t / dur, 3) : Math.exp(-t * 1.25) * (1 - Math.exp(-t * 900));
      hl.run(noise() * 0.8 + s * 0.05); hr.run(noise() * 0.8 + s * 0.05);
      return [vel * 0.24 * hl.hp * e, vel * 0.24 * hr.hp * e];
    }, { verb: 0.3 });
  };

  const subBoom = (t0, amp = 0.8, from = 62, to = 30, dur = 2.6) => {
    let ph = 0;
    voice(bus.fx, t0, dur, (t) => {
      ph += (to + (from - to) * Math.exp(-t * 2.2)) / SR;
      return amp * Math.sin(TAU * ph) * Math.exp(-t * 1.5) * (1 - Math.exp(-t * 400));
    });
  };

  const braam = (t0, roots, { amp = 0.24, dur = 3.0, open = 0.7 } = {}) => {
    const fl = new SVF(), fr = new SVF();
    const osc = [];
    roots.forEach((m) => { for (let k = 0; k < 4; k++) osc.push({ f: mtof(m) * (1 + (k - 1.5) * 0.004), ph: rnd(), side: k % 2 }); });
    voice(bus.fx, t0, dur, (t) => {
      const cut = 120 + 1400 * Math.pow(Math.sin(Math.min(1, t / open) * Math.PI / 2), 2) * Math.exp(-Math.max(0, t - open) * 1.2);
      if ((Math.round(t * SR) & 15) === 0) { fl.set(cut, 1.2); fr.set(cut * 1.03, 1.2); }
      let l = 0, r = 0;
      for (const o of osc) {
        const dt = o.f / SR; o.ph += dt; if (o.ph >= 1) o.ph -= 1;
        const v = 2 * o.ph - 1 - polyblep(o.ph, dt);
        if (o.side) r += v; else l += v;
      }
      const e = amp * (1 - Math.exp(-t * 18)) * Math.exp(-t * 0.9);
      return [Math.tanh(fl.run(l) * 0.6) * e, Math.tanh(fr.run(r) * 0.6) * e];
    }, { verb: 0.15 });
  };

  const riser = (t0, dur, { amp = 0.16, f0 = 300, f1 = 7000, pitch = [n('D3'), n('D5')] } = {}) => {
    const bl = new SVF(), br = new SVF();
    let ph = 0;
    voice(bus.fx, t0, dur, (t) => {
      const x = t / dur;
      const fc = f0 * Math.pow(f1 / f0, x * x);
      if ((Math.round(t * SR) & 15) === 0) { bl.set(fc, 2.2); br.set(fc * 1.08, 2.2); }
      ph += mtof(pitch[0] + (pitch[1] - pitch[0]) * x * x) / SR;
      const tone = 0.25 * Math.sin(TAU * ph) + 0.12 * Math.sin(TAU * ph * 2.003);
      const e = amp * Math.pow(x, 1.8);
      return [e * (bl.run(noise()) * 1.6 + tone), e * (br.run(noise()) * 1.6 + tone)];
    }, { verb: 0.35 });
  };

  const whoosh = (t0, dur, { amp = 0.22, lo = 350, hi = 2600, from = -0.8, to = 0.8 } = {}) => {
    const bp = new SVF(), bp2 = new SVF();
    voice(bus.fx, t0, dur, (t) => {
      const x = t / dur;
      const bell = Math.sin(Math.PI * x);
      const fc = lo + (hi - lo) * Math.pow(bell, 1.5);
      if ((Math.round(t * SR) & 15) === 0) { bp.set(fc, 1.4); bp2.set(fc * 1.7, 2.0); }
      const s = (bp.run(noise()) + 0.5 * bp2.run(noise())) * amp * Math.pow(bell, 2.2);
      const p = from + (to - from) * x;
      return [s * panL(p), s * panR(p)];
    }, { verb: 0.2 });
  };

  const rumble = (t0, dur, amp = 0.35) => {
    const lp = new SVF(); lp.set(90, 0.8);
    let brown = 0;
    voice(bus.fx, t0, dur, (t) => {
      brown = brown * 0.995 + noise() * 0.05;
      const x = t / dur;
      return amp * lp.run(brown) * 6 * Math.sin(Math.PI * Math.min(1, x * 1.4)) ;
    });
  };

  // mains hum as the grid energises: 50 Hz is Hong Kong's supply frequency
  const hum = (t0, dur = 1.6, amp = 0.09) => {
    let ph = 0;
    const bp = new SVF(); bp.set(260, 0.6);
    voice(bus.fx, t0, dur, (t) => {
      ph += 50 / SR;
      const buzz = Math.tanh(4 * Math.sin(TAU * ph)) + 0.3 * Math.sin(TAU * ph * 2);
      const e = amp * (1 - Math.exp(-t * 60)) * Math.exp(-t * 2.2);
      return e * (0.4 * buzz + bp.run(buzz) * 1.5);
    }, { pan: 0, verb: 0.1 });
  };

  const relay = (t0, amp = 0.3) => {
    let ph = 0;
    const bp = new SVF(); bp.set(1800, 1.5);
    voice(bus.fx, t0, 0.12, (t) => {
      ph += (95 + 60 * Math.exp(-t * 80)) / SR;
      return amp * (Math.sin(TAU * ph) * Math.exp(-t * 55) + 0.6 * bp.run(noise()) * Math.exp(-t * 180));
    }, { verb: 0.1 });
  };

  // air: a soft breath of filtered noise under the opening
  function air(t0, dur, amp) {
    const bl = new SVF(), br = new SVF(); bl.set(1400, 0.6); br.set(1600, 0.6);
    voice(bus.fx, t0, dur, (t) => {
      const e = amp * Math.min(1, t / 1.5) * Math.min(1, (dur - t) / 1.2) * (0.8 + 0.2 * Math.sin(TAU * 0.3 * t));
      return [bl.run(noise()) * e, br.run(noise()) * e];
    }, { verb: 0.3 });
  }

  // supersaw pad: 7 detuned saws per note, one filter per side
  const pad = (t0, t1, notes, { amp = 0.05, att = 0.8, rel = 1.2, cut = 1800, cut1 = null, target = bus.music, verb = 0.35, q = 0.8 } = {}) => {
    const fl = new SVF(), fr = new SVF();
    const osc = [];
    notes.forEach((m) => {
      for (let k = 0; k < 7; k++) {
        const det = (k - 3) / 3 * 0.012;
        osc.push({ f: mtof(m) * (1 + det), ph: rnd(), side: k % 2, g: k === 3 ? 0.7 : 1 });
      }
    });
    const dur = t1 - t0 + rel;
    voice(target, t0, dur, (t) => {
      if ((Math.round(t * SR) & 31) === 0) {
        const c = cut1 === null ? cut : cut + (cut1 - cut) * Math.min(1, t / (t1 - t0));
        fl.set(c, q); fr.set(c * 1.04, q);
      }
      let l = 0, r = 0;
      for (const o of osc) {
        const dt = o.f / SR; o.ph += dt; if (o.ph >= 1) o.ph -= 1;
        const v = (2 * o.ph - 1 - polyblep(o.ph, dt)) * o.g;
        if (o.side) r += v; else l += v;
      }
      const e = amp * Math.min(1, t / att) * (t > t1 - t0 ? Math.exp(-(t - (t1 - t0)) / rel * 3) : 1);
      return [fl.run(l) * e, fr.run(r) * e];
    }, { verb });
  };

  // formant "aah" choir
  const choir = (t0, t1, notes, amp = 0.05) => {
    const F = [[800, 10, 1], [1150, 12, 0.5], [2900, 24, 0.12]];
    notes.forEach((m, j) => {
      const fs = F.map(([f, q]) => { const s = new SVF(); s.set(f, q); return s; });
      let ph = rnd();
      const f0 = mtof(m);
      const pan = (j / Math.max(1, notes.length - 1)) * 1.2 - 0.6;
      voice(bus.music, t0, t1 - t0 + 1.5, (t) => {
        const vib = 1 + 0.004 * Math.sin(TAU * 5.1 * t + j) * Math.min(1, t * 2);
        const dt = f0 * vib / SR; ph += dt; if (ph >= 1) ph -= 1;
        const saw = 2 * ph - 1 - polyblep(ph, dt);
        let s = 0;
        for (let k = 0; k < 3; k++) s += fs[k].run(saw) * F[k][2];
        const e = amp * Math.min(1, t / 1.2) * (t > t1 - t0 ? Math.exp(-(t - (t1 - t0)) * 2.5) : 1);
        return s * e * 3;
      }, { pan, verb: 0.6 });
    });
  };

  const pluck = (t0, midi, { amp = 0.1, pan = 0, dur = 0.45, verb = 0.25, delay = 0.25, bright = 3200 } = {}) => {
    const f = mtof(midi);
    const lp = new SVF();
    let ph = rnd();
    voice(bus.music, t0, dur, (t) => {
      if ((Math.round(t * SR) & 15) === 0) lp.set(260 + bright * Math.exp(-t * 16), 0.9);
      const dt = f / SR; ph += dt; if (ph >= 1) ph -= 1;
      const v = 2 * ph - 1 - polyblep(ph, dt);
      return amp * lp.run(v) * Math.exp(-t * 7) * (1 - Math.exp(-t * 2000));
    }, { pan, verb, delay });
  };

  const bassNote = (t0, midi, dur, vel = 1) => {
    const lp = new SVF();
    let p1 = 0, p2 = 0;
    const f = mtof(midi);
    voice(bus.bass, t0, dur + 0.05, (t) => {
      if ((Math.round(t * SR) & 15) === 0) lp.set(170 + 1100 * Math.exp(-t * 22) * vel, 1.1);
      const dt = f / SR; p1 += dt; if (p1 >= 1) p1 -= 1; p2 += dt * 0.5; if (p2 >= 1) p2 -= 1;
      const saw = 2 * p1 - 1 - polyblep(p1, dt);
      const e = (1 - Math.exp(-t * 900)) * (t < dur ? 1 : Math.exp(-(t - dur) * 120));
      return 0.27 * e * (lp.run(saw) * 0.8 + 0.55 * Math.sin(TAU * p2));
    });
  };

  const leadLine = (notes) => { // [{t, d, m}] mono line with glide and vibrato
    const lp = new SVF();
    let ph1 = 0, ph2 = 0, cur = mtof(notes[0].m);
    const tStart = notes[0].t, tEnd = notes[notes.length - 1].t + notes[notes.length - 1].d + 0.6;
    let k = 0;
    voice(bus.lead, tStart, tEnd - tStart, (t) => {
      const ta = tStart + t;
      while (k < notes.length - 1 && ta >= notes[k + 1].t) k++;
      const nt = notes[k];
      const since = ta - nt.t;
      const target = mtof(nt.m);
      cur += (target - cur) * 0.0025;                                 // portamento
      const vib = 1 + 0.005 * Math.sin(TAU * 5.4 * ta) * Math.min(1, Math.max(0, since - 0.12) * 4);
      const f = cur * vib;
      const dt1 = f / SR, dt2 = f * 1.006 / SR;
      ph1 += dt1; if (ph1 >= 1) ph1 -= 1; ph2 += dt2; if (ph2 >= 1) ph2 -= 1;
      const v = (2 * ph1 - 1 - polyblep(ph1, dt1)) + 0.7 * (2 * ph2 - 1 - polyblep(ph2, dt2));
      if ((Math.round(t * SR) & 15) === 0) lp.set(900 + 2600 * Math.exp(-since * 5), 1.0);
      const on = since < nt.d ? 1 : Math.exp(-(since - nt.d) * 14);
      const e = 0.16 * (1 - Math.exp(-since * 120)) * on;
      return lp.run(v) * e;
    }, { verb: 0.3, delay: 0.35 });
  };

  // ---------------------------------------------------------------- the piece
  // Bar 1: a blinking cursor in the dark, the hush of a screen
  subBoom(0.0, 0.18, 40, 36, 5.2);
  air(0.0, 5.4, 0.022);
  bell(0.02, n('A6'), { amp: 0.05, ratio: 1, index: 0.5, dur: 0.8, verb: 0.6, delay: 0 });

  // Bars 1–2: code streams in, token by token — each token plays a note
  const typed = typingSchedule();
  const melody = [
    ['D5', 'F5', 'A5', 'C6', 'A5', 'G5', 'A5'],
    ['F5', 'A5', 'C6', 'D6', 'C6', 'A5', 'C6'],
    ['A5', 'C6', 'D6', 'F6', 'E6', 'D6', 'C6'],
    ['D6', 'C6', 'A5', 'G5', 'A5'],
  ];
  const perLine = [0, 0, 0, 0];
  const widest = Math.max(...CODE.map((l) => l.length));
  for (const tok of typed.tokens) {
    const k = perLine[tok.line]++;
    const x = (tok.start + tok.text.length / 2) / widest;            // where it appears on screen
    const pan = (x * 2 - 1) * 0.7;
    bell(tok.t, n(melody[tok.line][k]), { amp: 0.075, pan, dur: 1.6, verb: 0.45, delay: 0.2 });
    tick(tok.t, pan, 0.05);
  }
  pad(B(4), B(8), [n('D3'), n('A3'), n('C4'), n('E4'), n('F4')], { amp: 0.018, att: 2.2, cut: 900, cut1: 1500 });

  // Bar 3: city = build(code) — the ground heaves, towers rise
  braam(T_BUILD, [n('D1'), n('D2'), n('A2')], { amp: 0.12, dur: 3.2, open: 0.9 });
  subBoom(T_BUILD, 0.34, 70, 34, 2.8);
  rumble(T_BUILD, 2.6, 0.28);
  whoosh(T_BUILD + 0.1, 2.2, { amp: 0.16, lo: 180, hi: 1200, from: 0.2, to: -0.2 });
  pad(B(8), B(12), [n('Bb2'), n('F3'), n('A3'), n('D4')], { amp: 0.026, att: 0.6, cut: 700, cut1: 2200 });
  for (let k = 0; k < 16; k++) pluck(B(8) + k * B(0.25), n(['D4', 'F4', 'A4', 'D5', 'F5', 'D5', 'A4', 'F4'][k % 8]), { amp: 0.05 + k * 0.003, pan: (k % 2 ? 0.4 : -0.4), delay: 0.3, bright: 2600 + k * 120 });

  // Bar 4: moon = rise(cursor) — shimmer up, riser, snare roll, a breath
  for (let k = 0; k < 10; k++) bell(T_RISE + k * 0.11, n('D5') + [0, 3, 7, 10, 12, 15, 19, 22, 24, 27][k], { amp: 0.04, pan: -0.5 + k * 0.1, dur: 1.4, verb: 0.6, delay: 0.1, index: 1.5 });
  whoosh(T_RISE, 1.6, { amp: 0.2, lo: 500, hi: 5200, from: 0, to: 0.3 });
  riser(T_RISE + 0.1, T_LIGHT - T_RISE - 0.22, { amp: 0.27 });
  pad(B(12), B(16) - 0.12, [n('C3'), n('G3'), n('C4'), n('F4')], { amp: 0.03, att: 0.4, rel: 0.05, cut: 900, cut1: 3200 });
  crash(B(14), 0.8, B(2) - 0.1);                                      // reverse cymbal into the drop
  const rollStart = B(14.5);
  for (let k = 0, t = rollStart; t < T_LIGHT - 0.14; k++) {
    const rate = t < B(15) ? B(0.25) : (t < B(15.5) ? B(0.125) : B(0.0625));
    snare(t, 0.25 + 0.7 * (t - rollStart) / (T_LIGHT - rollStart), (k % 2 ? 0.15 : -0.15));
    t += rate;
  }

  // Bar 5: light(city, moon) — the drop. Power on.
  relay(T_LIGHT - 0.012, 0.35);
  hum(T_LIGHT, 1.8, 0.1);
  subBoom(T_LIGHT, 0.9, 64, 29, 2.8);
  braam(T_LIGHT, [n('D1'), n('D2'), n('A2'), n('F3')], { amp: 0.22, dur: 2.6, open: 0.25 });
  crash(T_LIGHT, 1.0);

  // Bars 5–8: the city runs — four on the floor, locked to the LED facades
  for (const k of KICKS) kick(k, k >= B(40) ? 0.55 : 1);
  const prog = [['D2', ['D3', 'A3', 'D4', 'F4']], ['Bb1', ['Bb2', 'F3', 'Bb3', 'D4']], ['F2', ['F3', 'A3', 'C4', 'F4']], ['C2', ['C3', 'G3', 'C4', 'E4']]];
  prog.forEach(([root, chord], bar) => {
    const t0 = T_LIGHT + bar * B(4);
    pad(t0, t0 + B(4), chord.map(n), { amp: 0.03, att: 0.05, rel: 0.4, cut: 1500, cut1: 2600 });
    for (let s = 0; s < 16; s++) {
      const oct = [0, 0, 12, 0, 0, 12, 0, 12, 0, 0, 12, 0, 0, 12, 7, 12][s];
      bassNote(t0 + s * B(0.25), n(root) + oct, B(0.25) * 0.8, s % 4 === 0 ? 1 : 0.7);
      const tone = chord.map(n)[[0, 1, 2, 3, 2, 1, 2, 3][s % 8]] + 12;
      pluck(t0 + s * B(0.25), tone, { amp: 0.04, pan: s % 2 ? 0.35 : -0.35, delay: 0.2, bright: 2400 });
    }
  });
  for (let b = 16; b < 32; b++) {
    if (b % 2 === 1) clap(B(b), 0.9);
    for (let s = 0; s < 4; s++) {
      const sw = s % 2 ? 0.018 : 0;
      if (s === 2) hat(B(b + 0.5) + sw, 0.55, true, 0.3);
      else hat(B(b + s * 0.25) + sw, [0.7, 0.35, 0, 0.45][s], false, 0.22);
    }
  }
  // fill into the breakdown
  [['A2', 0], ['F2', 0.25], ['D2', 0.5], ['A1', 0.75]].forEach(([m, o], k) => tom(B(31 + o), n(m) + 12, 0.8, -0.4 + k * 0.25));

  // the hook: "hel-lo, world" (short, short, long) — minor now, major at the end
  const L = (b, d, m) => ({ t: T_LIGHT + B(b), d: B(d), m: n(m) });
  leadLine([
    L(0, 0.5, 'A4'), L(0.5, 0.5, 'D5'), L(1, 1.75, 'F5'), L(3, 0.5, 'E5'), L(3.5, 0.5, 'D5'),
    L(4, 0.5, 'A4'), L(4.5, 0.5, 'D5'), L(5, 1.75, 'F5'), L(7, 0.33, 'G5'), L(7.33, 0.33, 'F5'), L(7.66, 0.34, 'E5'),
    L(8, 0.5, 'C5'), L(8.5, 0.5, 'F5'), L(9, 1.75, 'A5'), L(11, 0.5, 'G5'), L(11.5, 0.5, 'A5'),
    L(12, 0.5, 'G5'), L(12.5, 0.5, 'E5'), L(13, 1.0, 'C5'), L(14, 0.5, 'D5'), L(14.5, 0.5, 'E5'), L(15, 0.9, 'G5'),
  ]);

  // camera choreography in sound: harbour → canyon → bank → punch-out
  whoosh(13.25, 1.2, { amp: 0.26, lo: 300, hi: 2400, from: -0.3, to: 0.3 });
  whoosh(14.9, 0.55, { amp: 0.16, lo: 500, hi: 3200, from: 0.9, to: 0.6 });
  whoosh(15.8, 0.55, { amp: 0.16, lo: 500, hi: 3200, from: -0.9, to: -0.6 });
  whoosh(16.6, 0.5, { amp: 0.14, lo: 500, hi: 3200, from: 0.8, to: 0.5 });
  whoosh(17.2, 1.4, { amp: 0.28, lo: 260, hi: 2000, from: 0.9, to: -0.9 });   // banked turn
  whoosh(18.9, 0.5, { amp: 0.14, lo: 600, hi: 3500, from: -0.8, to: -0.5 });
  whoosh(19.5, 0.5, { amp: 0.14, lo: 600, hi: 3500, from: 0.8, to: 0.5 });

  // Bar 9: the punch-out — drums fall away, the city drops below
  riser(B(32) + 0.2, 2.1, { amp: 0.12, f0: 200, f1: 4000, pitch: [n('D4'), n('A5')] });
  whoosh(B(32) + 0.3, 2.2, { amp: 0.2, lo: 200, hi: 1800, from: 0, to: 0 });
  subBoom(B(32), 0.35, 50, 32, 2.5);
  pad(B(32), B(36), [n('G2'), n('D3'), n('F3'), n('A3'), n('Bb3')], { amp: 0.03, att: 1.4, cut: 700, cut1: 1800 });

  // Bar 10: the reveal — the words light up line by line
  pad(B(36), B(40), [n('A2'), n('E3'), n('A3'), n('D4'), n('E4')], { amp: 0.032, att: 1.0, cut: 1200, cut1: 3200 });
  choir(B(36), B(40) + 0.2, [n('A3'), n('D4'), n('E4'), n('A4')], 0.04);
  subBoom(B(36), 0.2, 56, 55, B(4) + 0.4);                          // warm A1 floor under the reveal
  [0, 1, 2, 3].forEach((line) => bell(22.6 + line * 0.32 + 0.15, n(['A5', 'D6', 'E6', 'A6'][line]), { amp: 0.06, pan: -0.3 + line * 0.2, dur: 2.2, verb: 0.6 }));

  // Bar 11: the city prints "hello, world" — the hook returns, in D major
  const out = ['A5', 'D6', 'F#6', 'E6', 'D6', 'A5', null, 'B5', 'C#6', 'D6', 'E6', 'F#6'];
  out.forEach((m, k) => { if (m) bell(T_PRINT + k * PRINT_STEP, n(m), { amp: 0.085, pan: -0.55 + k * 0.1, dur: 2.2, verb: 0.5, delay: 0.18 }); });
  pad(B(40), B(44), [n('D3'), n('A3'), n('D4'), n('F#4'), n('A4')], { amp: 0.03, att: 0.9, cut: 1400, cut1: 2600 });
  choir(B(40), B(43), [n('D4'), n('F#4'), n('A4')], 0.03);

  // Bar 12: 你好，世界。 — the answer. One chord, a long breath out.
  bell(27.0, n('D6'), { amp: 0.09, dur: 3.0, verb: 0.7, index: 1.2 });
  bell(27.02, n('A6'), { amp: 0.05, dur: 3.0, verb: 0.7, index: 1.0 });
  subBoom(27.0, 0.3, 45, 36, 3.0);
  pad(B(43.2), 29.9, [n('D3'), n('A3'), n('C#4'), n('E4'), n('F#4')], { amp: 0.03, att: 1.0, rel: 0.1, cut: 1600, cut1: 900 });
  for (const b of [45, 47]) bell(B(b), n('A6'), { amp: 0.03, ratio: 1, index: 0.4, dur: 0.5, verb: 0.5, delay: 0 });   // the new cursor blinks

  const mix = mixdown(bus, len);
  if (!stems) { delete mix.stems; delete mix.sends; }
  return mix;
}

// ------------------------------------------------------------------ effects & master
function fdnReverb(inL, inR, { decay = 2.6, damp = 5200, pre = 0.022 } = {}) {
  const len = inL.length;
  const outL = new Float32Array(len), outR = new Float32Array(len);
  const sizes = [1447, 1621, 1871, 2053, 2269, 2417, 2633, 2819];
  const lines = sizes.map((d) => ({ buf: new Float32Array(d), d, w: 0, lp: 0, g: Math.pow(10, -3 * d / (SR * decay)) }));
  const a = Math.exp(-TAU * damp / SR);
  const preN = Math.round(pre * SR);
  const x = new Float64Array(8);
  for (let i = 0; i < len; i++) {
    const il = i >= preN ? inL[i - preN] : 0, ir = i >= preN ? inR[i - preN] : 0;
    for (let k = 0; k < 8; k++) { const L = lines[k]; x[k] = L.buf[L.w]; }
    // fast Walsh–Hadamard mixing (orthogonal, lossless)
    for (let h = 1; h < 8; h <<= 1) for (let s = 0; s < 8; s += h << 1) for (let j = s; j < s + h; j++) {
      const u = x[j], v = x[j + h]; x[j] = u + v; x[j + h] = u - v;
    }
    let ol = 0, or = 0;
    for (let k = 0; k < 8; k++) {
      const L = lines[k];
      const y = x[k] * 0.35355339;
      L.lp = y * (1 - a) + L.lp * a;                                   // damping
      L.buf[L.w] = L.lp * L.g + (k % 2 ? ir : il) * 0.5;
      L.w = (L.w + 1) % L.d;
      if (k % 2) or += y * (k & 2 ? -1 : 1); else ol += y * (k & 4 ? -1 : 1);
    }
    outL[i] = ol * 0.5; outR[i] = or * 0.5;
  }
  return [outL, outR];
}

function pingPong(inL, inR, time, fb = 0.38) {
  const len = inL.length, d = Math.round(time * SR);
  const outL = new Float32Array(len), outR = new Float32Array(len);
  const bl = new Float32Array(d), br = new Float32Array(d);
  let w = 0, lpL = 0, lpR = 0;
  for (let i = 0; i < len; i++) {
    const yl = bl[w], yr = br[w];
    lpL = lpL * 0.6 + yl * 0.4; lpR = lpR * 0.6 + yr * 0.4;
    bl[w] = (inL[i] + inR[i]) * 0.5 + lpR * fb;
    br[w] = lpL * fb;
    w = (w + 1) % d;
    outL[i] = yl; outR[i] = yr;
  }
  return [outL, outR];
}

// ITU-R BS.1770 integrated loudness (K-weighting, 400 ms blocks, gating)
export function loudness(L, R) {
  const biquad = (x, b0, b1, b2, a1, a2) => {
    const y = new Float64Array(x.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
    }
    return y;
  };
  const kw = (x) => biquad(biquad(x, 1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585),
    1.0, -2.0, 1.0, -1.99004745483398, 0.99007225036621);
  const kl = kw(L), kr = kw(R);
  const blk = Math.round(0.4 * SR), hop = Math.round(0.1 * SR);
  const ms = [];
  for (let s = 0; s + blk <= L.length; s += hop) {
    let acc = 0;
    for (let i = s; i < s + blk; i++) acc += kl[i] * kl[i] + kr[i] * kr[i];
    ms.push(acc / blk);
  }
  const lufs = (m) => -0.691 + 10 * Math.log10(m);
  let gated = ms.filter((m) => lufs(m) > -70);
  const rel = lufs(gated.reduce((a, b) => a + b, 0) / gated.length) - 10;
  gated = gated.filter((m) => lufs(m) > rel);
  return lufs(gated.reduce((a, b) => a + b, 0) / gated.length);
}

function mixdown(bus, len) {
  const [rvL, rvR] = fdnReverb(bus.verb.L, bus.verb.R, { decay: 2.8, damp: 5200 });
  const [dlL, dlR] = pingPong(bus.delay.L, bus.delay.R, BEAT * 0.75, 0.36);
  // sidechain: pads, bass and arps duck under every kick
  const duck = new Float32Array(len).fill(1);
  for (const k of KICKS) {
    const i0 = Math.round(k * SR);
    for (let i = i0; i < Math.min(len, i0 + Math.round(0.42 * SR)); i++) {
      const t = (i - i0) / SR;
      duck[i] = Math.min(duck[i], 1 - 0.62 * Math.exp(-t * 9) * (k >= 40 * BEAT ? 0.4 : 1));
    }
  }
  const L = new Float32Array(len), R = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const d = duck[i];
    L[i] = bus.drums.L[i] * 0.95 + bus.bass.L[i] * d * 0.9 + bus.music.L[i] * d + bus.lead.L[i] * (0.75 + 0.25 * d) + bus.fx.L[i] + rvL[i] * 0.55 + dlL[i] * 0.4;
    R[i] = bus.drums.R[i] * 0.95 + bus.bass.R[i] * d * 0.9 + bus.music.R[i] * d + bus.lead.R[i] * (0.75 + 0.25 * d) + bus.fx.R[i] + rvR[i] * 0.55 + dlR[i] * 0.4;
  }
  // master: DC/rumble high-pass, loudness to -14 LUFS, soft clip, look-ahead limiter at -1.6 dBFS
  const hpL = new SVF(), hpR = new SVF(); hpL.set(24, 0.7); hpR.set(24, 0.7);
  for (let i = 0; i < len; i++) { hpL.run(L[i]); hpR.run(R[i]); L[i] = hpL.hp; R[i] = hpR.hp; }
  const g = Math.pow(10, (-14 - loudness(L, R)) / 20);
  const ceil = Math.pow(10, -1.6 / 20);                            // leaves room for AAC overshoot
  const look = Math.round(0.004 * SR);
  const peak = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    L[i] = Math.tanh(L[i] * g * 0.9) / 0.9;
    R[i] = Math.tanh(R[i] * g * 0.9) / 0.9;
    peak[i] = Math.max(Math.abs(L[i]), Math.abs(R[i]));
  }
  let gain = 1;
  const fade = (i) => Math.min(1, i / (0.01 * SR), (len - i) / (0.35 * SR));
  for (let i = 0; i < len; i++) {
    let p = 0;
    for (let j = i; j < Math.min(len, i + look); j++) if (peak[j] > p) p = peak[j];
    const want = p > ceil ? ceil / p : 1;
    gain = want < gain ? want : gain + (want - gain) * 0.0004;
    const f = fade(i);
    L[i] *= gain * f; R[i] *= gain * f;
  }
  return { left: L, right: R, lufs: loudness(L, R), stems: bus, sends: { rvL, dlL } };
}

export function wav({ left, right }) {
  const len = left.length;
  const buf = new ArrayBuffer(44 + len * 4);
  const v = new DataView(buf);
  const s = (o, str) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
  s(0, 'RIFF'); v.setUint32(4, 36 + len * 4, true); s(8, 'WAVE'); s(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
  v.setUint32(24, SR, true); v.setUint32(28, SR * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true);
  s(36, 'data'); v.setUint32(40, len * 4, true);
  const rnd = mulberry32(1970);
  for (let i = 0; i < len; i++) {
    const d1 = (rnd() - rnd()) / 32768;                             // TPDF dither to 16-bit
    v.setInt16(44 + i * 4, Math.max(-32768, Math.min(32767, Math.round((left[i] + d1) * 32767))), true);
    v.setInt16(46 + i * 4, Math.max(-32768, Math.min(32767, Math.round((right[i] + d1) * 32767))), true);
  }
  return new Uint8Array(buf);
}
