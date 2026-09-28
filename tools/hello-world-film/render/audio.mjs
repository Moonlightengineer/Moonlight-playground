#!/usr/bin/env node
// Synthesise the soundtrack to a 48 kHz / 16-bit WAV: node render/audio.mjs out.wav
import fs from 'node:fs';
import { renderScore, wav } from '../score.js';
const out = process.argv[2] || 'score.wav';
const t0 = Date.now();
const mix = renderScore();
fs.writeFileSync(out, wav(mix));
let peak = 0;
for (const ch of [mix.left, mix.right]) for (const v of ch) peak = Math.max(peak, Math.abs(v));
console.log(`${out}: ${mix.left.length / 48000}s, ${mix.lufs.toFixed(1)} LUFS, peak ${(20 * Math.log10(peak)).toFixed(2)} dBFS, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
