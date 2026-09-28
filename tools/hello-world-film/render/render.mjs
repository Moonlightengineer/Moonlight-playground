#!/usr/bin/env node
// Offline renderer: drives render.html in headless Chromium (SwiftShader,
// CPU only) and pipes raw frames into FFmpeg. Frames are independent, so a
// range can be re-rendered on its own and concatenated later.
//
//   node render/render.mjs --out=out.mkv [--from=0 --to=720] [--samples=auto]
//        [--res=1] [--scale=1] [--preview] [--plates] [--credit="..."]
//        [--debug=1] [--raw] [--features=HAS_CITY]   # breakdown passes
//   node render/render.mjs --overlay=dir     # titles only, RGBA PNG per frame
//
// --samples=auto follows timeline.samplingAt(): 12–32 sub-frame samples per
// frame (motion blur, depth of field and anti-aliasing all come from these).
// --plates renders without titles; composite the --overlay PNGs afterwards.
//
// Requires: `npm i playwright` (Chromium) and an FFmpeg binary on PATH or in
// $FFMPEG. Lossless FFV1 keeps chunks editable; --preview writes H.264.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { samplingAt } from '../timeline.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FILM_DIR = path.resolve(HERE, '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, ...v] = a.replace(/^--/, '').split('=');
  return [k, v.length ? v.join('=') : true];
}));
const FPS = 24;
const from = +(args.from ?? 0), to = +(args.to ?? 720);
const autoSamples = (args.samples ?? 'auto') === 'auto';
const fixedSamples = autoSamples ? 0 : +args.samples;
const res = +(args.res ?? 1), scale = +(args.scale ?? 1);
const W = Math.round(1920 * res / 2) * 2, H = Math.round(1080 * res / 2) * 2;
const out = args.out || 'out.mkv';
const ffmpeg = process.env.FFMPEG || 'ffmpeg';

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
const server = http.createServer((req, res2) => {
  const p = path.join(FILM_DIR, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(FILM_DIR)) { res2.writeHead(403); res2.end(); return; }
  fs.readFile(p, (e, d) => {
    if (e) { res2.writeHead(404); res2.end(); return; }
    res2.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
    res2.end(d);
  });
}).listen(0);
const port = server.address().port;

const enc = args.preview
  ? ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p']
  : ['-c:v', 'ffv1', '-level', '3', '-g', '1', '-pix_fmt', 'bgr0'];
const overlayDir = typeof args.overlay === 'string' ? args.overlay : null;
const ff = overlayDir ? null : spawn(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`,
  '-r', String(FPS), '-i', 'pipe:0', '-vf', 'vflip', ...enc, out], { stdio: ['pipe', 'inherit', 'inherit'] });

const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => { console.error('[pageerror]', e.message); process.exitCode = 1; });
const q = args.credit ? `?credit=${encodeURIComponent(args.credit)}` : '';
await page.goto(`http://localhost:${port}/render.html${q}`);
await page.waitForFunction(() => window.ready);
const info = await page.evaluate(([w, h, s]) => window.api.init({ width: w, height: h, scale: s }), [W, H, scale]);
if (args.plates) await page.evaluate(() => { window.api.plates = true; });
if (args.debug || args.raw) await page.evaluate(([d, r]) => window.api.setDebug(d, r), [+(args.debug || 0), !!args.raw]);
if (typeof args.features === 'string') await page.evaluate((f) => window.api.setFeatures(f ? f.split(',') : []), args.features);
if (overlayDir) fs.mkdirSync(overlayDir, { recursive: true });
console.log(`render ${from}..${to - 1} ${W}x${H} internal ${info.vw}x${info.vh} spp=${autoSamples ? 'auto' : fixedSamples} → ${overlayDir || out}`);

const t0 = Date.now();
for (let i = from; i < to; i++) {
  if (overlayDir) {
    const url = await page.evaluate((i) => window.api.overlayPNG(i), i);
    fs.writeFileSync(path.join(overlayDir, `o_${String(i).padStart(4, '0')}.png`), Buffer.from(url.split(',')[1], 'base64'));
    continue;
  }
  const plan = autoSamples ? samplingAt(i / FPS) : { samples: fixedSamples, shutter: 0.5 };
  const b64 = await page.evaluate(([i, s, sh]) => window.api.frameRGBA(i, s, sh), [i, plan.samples, plan.shutter]);
  const buf = Buffer.from(b64, 'base64');
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  const done = i - from + 1;
  if (done % 12 === 0 || i === to - 1) {
    const el = (Date.now() - t0) / 1000;
    const eta = el / done * (to - from - done);
    console.log(`frame ${i} (${done}/${to - from}) ${(el / done).toFixed(2)} s/frame, eta ${(eta / 60).toFixed(1)} min`);
  }
}
if (ff) {
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
}
await browser.close();
server.close();
console.log(`done in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
