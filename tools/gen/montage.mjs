#!/usr/bin/env node
// Tile images into one row-major grid on paper colour, for looking at several at once.
//
//   node tools/gen/montage.mjs <out.png> [--cell 512] [--cols 4] <img> [<img> ...]
import sharp from 'sharp';

const a = process.argv.slice(2);
const out = a.shift();
const opt = (name, d) => { const i = a.indexOf(name); if (i === -1) return d; const v = Number(a[i + 1]); a.splice(i, 2); return v; };
const cell = opt('--cell', 512);
const cols = opt('--cols', Math.min(a.length, 4));
if (!out || !a.length) { console.error('usage: montage.mjs <out.png> [--cell N] [--cols N] <img>...'); process.exit(2); }
const PAPER = '#cabfac'; // STYLE-BIBLE paper-cream
const rows = Math.ceil(a.length / cols);
const tiles = await Promise.all(a.map(async (f, i) => ({
  input: await sharp(f).resize({ width: cell, height: cell, fit: 'contain', background: PAPER }).flatten({ background: PAPER }).png().toBuffer(),
  left: (i % cols) * cell,
  top: Math.floor(i / cols) * cell,
})));
await sharp({ create: { width: cols * cell, height: rows * cell, channels: 3, background: PAPER } }).composite(tiles).png().toFile(out);
console.log(`${out}  ${cols}x${rows} of ${cell}px`);
