// Timeline, preview player and the frame API used by render/render.mjs.
import { W, H, C, clamp, win } from './core.js';
import { SCENES } from './scenes.js';
import { background, progressBar, chapterTag } from './widgets.js';

export const FPS = 30;

let acc = 0;
const timeline = SCENES.map((s) => {
  const o = { ...s, start: acc };
  acc += s.dur;
  return o;
});
export const DURATION = acc;
const chapterMarks = timeline.filter((s) => s.card).map((s) => s.start / DURATION);

export function renderAt(ctx, T) {
  T = clamp(T, 0, DURATION - 1e-6);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  background(ctx);
  const sc = timeline.find((s) => T >= s.start && T < s.start + s.dur) || timeline[timeline.length - 1];
  const t = T - sc.start;
  ctx.save();
  sc.draw(ctx, t, { T, dur: sc.dur });
  ctx.restore();
  if (sc.tag) {
    const a = sc.tagFade === false ? 1 : win(t, 0, sc.dur, sc.tagIn ?? 0.6, sc.tagOut ?? 0.6);
    chapterTag(ctx, sc.tag[0], sc.tag[1], a);
  }
  if (!sc.noBar) progressBar(ctx, T / DURATION, chapterMarks, sc.barAlpha ?? 1);
}

// ---------- page wiring ----------
const canvas = document.getElementById('film');
const ctx = canvas.getContext('2d');
const params = new URLSearchParams(location.search);
const renderMode = params.has('render');

async function loadFonts() {
  const specs = [
    '400 40px "Inter"', '600 40px "Inter"', '800 40px "Inter"',
    'italic 400 40px "STIX"', '400 40px "STIX"',
    '700 40px "Space Grotesk"', '500 40px "Space Grotesk"', '500 40px "JetBrains Mono"',
  ];
  await Promise.all(specs.map((s) => document.fonts.load(s, 'AaΔδλθ≈≫→0123')));
  await document.fonts.ready;
}

const ready = loadFonts();

window.FILM = {
  fps: FPS,
  duration: DURATION,
  frames: Math.ceil(DURATION * FPS),
  ready,
  renderFrame(i) {
    renderAt(ctx, i / FPS);
  },
  frameJPEG(i, q = 0.97) {
    renderAt(ctx, i / FPS);
    return canvas.toDataURL('image/jpeg', q);
  },
  scenes: timeline.map((s) => ({ id: s.id, start: s.start, dur: s.dur })),
};

if (!renderMode) {
  document.body.classList.add('player');
  const playBtn = document.getElementById('play');
  const scrub = document.getElementById('scrub');
  const timeEl = document.getElementById('time');
  const chapters = document.getElementById('chapters');
  scrub.max = String(DURATION);
  let playing = false;
  let T = parseFloat(params.get('t') || '0');
  let last = 0;
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const draw = () => {
    renderAt(ctx, T);
    scrub.value = String(T);
    timeEl.textContent = `${fmt(T)} / ${fmt(DURATION)}`;
  };
  const tick = (now) => {
    if (playing) {
      const dt = Math.min(0.1, (now - last) / 1000);
      T += dt;
      if (T >= DURATION) {
        T = DURATION;
        playing = false;
        playBtn.textContent = 'Play';
      }
      draw();
    }
    last = now;
    requestAnimationFrame(tick);
  };
  playBtn.addEventListener('click', () => {
    playing = !playing;
    if (T >= DURATION) T = 0;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  });
  scrub.addEventListener('input', () => {
    T = parseFloat(scrub.value);
    draw();
  });
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      playBtn.click();
    } else if (e.code === 'ArrowRight') {
      T = Math.min(DURATION, T + 5);
      draw();
    } else if (e.code === 'ArrowLeft') {
      T = Math.max(0, T - 5);
      draw();
    }
  });
  timeline.filter((s) => s.card).forEach((s) => {
    const b = document.createElement('button');
    b.textContent = s.card;
    b.addEventListener('click', () => {
      T = s.start;
      draw();
    });
    chapters.appendChild(b);
  });
  ready.then(() => {
    draw();
    requestAnimationFrame(tick);
  });
}

export { W, H, C };
