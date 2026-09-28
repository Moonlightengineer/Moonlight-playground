// Live mode: the same film computed in real time on the viewer's own GPU,
// with the soundtrack synthesised on the spot. One sample per frame, so no
// motion blur or depth of field — the rendered video has those.
import { Film } from './film.js';
import { drawOverlay, DURATION } from './timeline.js';

const MODES = { final: { debug: 0, raw: false }, raw: { debug: 0, raw: true }, geometry: { debug: 1, raw: false } };

export function createLive({ canvas, fonts, onStatus, onEnd }) {
  let film = null, overlay = null, octx = null;
  let audio = null, buffer = null, source = null;
  let raf = 0, t0 = 0, running = false, mode = 'final';
  let scale = window.matchMedia('(max-width: 700px)').matches ? 0.45 : 0.7;
  const maxScale = window.matchMedia('(max-width: 700px)').matches ? 0.6 : 1;
  let ema = 0, lastFrame = 0, lastAdjust = 0;

  function setup() {
    if (film) return;
    const w = canvas.clientWidth > 900 ? 1920 : 1280;
    const h = Math.round(w * 9 / 16);
    overlay = document.createElement('canvas');
    overlay.width = w; overlay.height = h;
    octx = overlay.getContext('2d');
    film = new Film(canvas, { width: w, height: h, scale, overlay });
    film.allFeatures = true;                 // one shader; GPUs branch for real
  }

  function synthesise() {
    if (buffer) return Promise.resolve(buffer);
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./score-worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }) => {
        buffer = audio.createBuffer(2, data.left.length, 48000);
        buffer.copyToChannel(data.left, 0);
        buffer.copyToChannel(data.right, 1);
        worker.terminate();
        resolve(buffer);
      };
      worker.onerror = (e) => { worker.terminate(); reject(e); };
      worker.postMessage('go');
    });
  }

  function frame(now) {
    if (!running) return;
    const t = audio ? audio.currentTime - t0 : (now - t0) / 1000;
    if (t >= DURATION) { stop(); onEnd?.(); return; }
    // adaptive resolution: re-check once a second, aim for 25–45 fps
    if (lastFrame) { const dt = now - lastFrame; ema = ema ? ema * 0.85 + dt * 0.15 : dt; }
    lastFrame = now;
    if (!lastAdjust) lastAdjust = now;
    if (now - lastAdjust > 1000 && ema > 40 && scale > 0.25) {
      scale = Math.max(0.25, scale * 0.75); film.setScale(scale); lastAdjust = now;
    } else if (now - lastAdjust > 3000 && ema < 22 && scale < maxScale) {
      scale = Math.min(maxScale, scale * 1.2); film.setScale(scale); lastAdjust = now;
    }
    Object.assign(film, MODES[mode]);
    drawOverlay(octx, t, overlay.width, overlay.height, fonts);
    film.render(Math.max(0, t), { samples: 1, frame: Math.round(t * 24) });
    onStatus?.(`${t.toFixed(1)} s・${ema ? Math.round(1000 / ema) : "–"} fps・解像度 ${Math.round(scale * 100)}%`);
    raf = requestAnimationFrame(frame);
  }

  async function start() {
    setup();
    audio = audio || new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
    await audio.resume();
    onStatus?.('合成緊配樂（喺你部機即場計）…');
    const buf = await synthesise();
    source = audio.createBufferSource();
    source.buffer = buf;
    source.connect(audio.destination);
    t0 = audio.currentTime + 0.1;
    source.start(t0);
    running = true;
    lastFrame = 0; lastAdjust = 0; ema = 0;
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    try { source?.stop(); } catch { /* already stopped */ }
    source = null;
  }

  return { start, stop, setMode(m) { mode = m; }, get running() { return running; } };
}

export function supportsLive() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    return !!(gl && gl.getExtension('EXT_color_buffer_float'));
  } catch {
    return false;
  }
}
