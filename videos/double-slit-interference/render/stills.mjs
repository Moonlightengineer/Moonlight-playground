// Render selected times to JPEG stills for review: node render/stills.mjs out_dir t1 t2 ...
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { startServer } from './server.mjs';

const [outDir, ...times] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const { url, close } = await startServer();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`${url}/index.html?render`);
await page.evaluate(() => window.FILM.ready);
const dur = await page.evaluate(() => window.FILM.duration);
console.log('duration', dur.toFixed(1));
for (const ts of times) {
  const t = parseFloat(ts);
  const data = await page.evaluate((tt) => window.FILM.frameJPEG(Math.round(tt * 30), 0.9), t);
  writeFileSync(`${outDir}/t${t.toFixed(1).padStart(6, '0')}.jpg`, Buffer.from(data.split(',')[1], 'base64'));
}
await browser.close();
close();
