// Render the film to MP4: frames are drawn in headless Chromium and piped to ffmpeg.
//   node render/render.mjs [--workers 4] [--out out/double-slit-interference.mp4] [--from s] [--to s] [--crf 20]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './server.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const workers = Number(args.workers || 4);
const out = resolve(ROOT, args.out || 'out/double-slit-interference.mp4');
const crf = String(args.crf || 20);
const tmp = join(ROOT, 'out', '.segments');
mkdirSync(tmp, { recursive: true });
mkdirSync(dirname(out), { recursive: true });

const { url, close } = await startServer();
const browser = await chromium.launch();
const probe = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await probe.goto(`${url}/index.html?render`);
await probe.evaluate(() => window.FILM.ready);
const { fps, frames } = await probe.evaluate(() => ({ fps: window.FILM.fps, frames: window.FILM.frames }));
await probe.close();
const f0 = args.from ? Math.round(Number(args.from) * fps) : 0;
const f1 = args.to ? Math.round(Number(args.to) * fps) : frames;
const total = f1 - f0;
console.log(`Rendering frames ${f0}..${f1} (${(total / fps).toFixed(1)} s at ${fps} fps) with ${workers} workers`);

const t0 = Date.now();
let done = 0;
async function renderChunk(page, idx, a, b) {
  const seg = join(tmp, `seg${String(idx).padStart(3, '0')}.mp4`);
  const ff = spawn('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', crf, '-pix_fmt', 'yuv420p', '-tune', 'animation', '-g', String(fps * 4), seg],
  { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let i = a; i < b; i++) {
    const data = await page.evaluate((n) => window.FILM.frameJPEG(n, 0.96), i);
    const buf = Buffer.from(data.slice(data.indexOf(',') + 1), 'base64');
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    done++;
    if (done % 300 === 0) {
      const el = (Date.now() - t0) / 1000;
      console.log(`  ${done}/${total} frames, ${el.toFixed(0)} s elapsed, ~${((el / done) * (total - done)).toFixed(0)} s left`);
    }
  }
  ff.stdin.end();
  await new Promise((r, j) => ff.on('close', (c) => (c === 0 ? r() : j(new Error(`ffmpeg exit ${c}`)))));
  return seg;
}

// Small chunks handed out from a queue keep all workers busy (some scenes are much heavier than others).
const CHUNK = fps * 10;
const jobs = [];
for (let a = f0, i = 0; a < f1; a += CHUNK, i++) jobs.push({ i, a, b: Math.min(f1, a + CHUNK) });
const segs = new Array(jobs.length);
let next = 0;
await Promise.all(
  Array.from({ length: workers }, async () => {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(`${url}/index.html?render`);
    await page.evaluate(() => window.FILM.ready);
    while (next < jobs.length) {
      const job = jobs[next++];
      segs[job.i] = await renderChunk(page, job.i, job.a, job.b);
    }
    await page.close();
  }),
);
await browser.close();
close();

const list = join(tmp, 'list.txt');
writeFileSync(list, segs.map((s) => `file '${s}'`).join('\n'));
await new Promise((r, j) => {
  const ff = spawn('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', out], { stdio: 'inherit' });
  ff.on('close', (c) => (c === 0 ? r() : j(new Error(`concat exit ${c}`))));
});
rmSync(tmp, { recursive: true, force: true });
console.log(`Done: ${out} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
