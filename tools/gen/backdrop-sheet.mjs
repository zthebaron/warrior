#!/usr/bin/env node
// Contact sheet of the backdrop cards, composited over a flat colour.
//
//   node tools/gen/backdrop-sheet.mjs <out.png> [--bg #cabfac] [--dir assets/backdrop/gen] [--ext .png] [--title "..."]
//
// The default background is the game's paper (reference/palette.json paper-cream), which is what
// the cards are for. A sheet on paper hides a pale halo, so the same tool with a dark --bg is how
// each card is checked before it is accepted.
import sharp from 'sharp';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CARDS } from './make-backdrop-payloads.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const a = process.argv.slice(2);
const opt = (name, d) => { const i = a.indexOf(name); if (i === -1) return d; const v = a[i + 1]; a.splice(i, 2); return v; };
const palette = JSON.parse(readFileSync(join(ROOT, 'reference/palette.json'), 'utf8'));
const bg = opt('--bg', palette.colors[0].hex);
const dir = resolve(opt('--dir', join(ROOT, 'assets/backdrop/gen')));
const ext = opt('--ext', '.png');
const title = opt('--title', '');
const out = a[0];
if (!out) { console.error('usage: backdrop-sheet.mjs <out.png> [--bg #rrggbb] [--dir d] [--ext .png]'); process.exit(2); }
const lum = (h) => [1, 3, 5].reduce((t, i) => t + parseInt(h.slice(i, i + 2), 16), 0) / 3;
const ink = lum(bg) > 128 ? '#26231f' : '#e8e0d0', ink2 = lum(bg) > 128 ? '#4a4540' : '#b8b0a2';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

// rows of cells: [names, cell width, cell height]
const ROWS = [
  [['cliff_a', 'cliff_b', 'cliff_c'], 620, 960],
  [['pine_a', 'pine_b', 'pine_c'], 620, 470],
  [['peaks_a', 'peaks_b'], 940, 300],
  [['peaks_c', 'mist_a'], 940, 300],
  [['mist_b', 'wide_a'], 940, 400],
  [['wide_b'], 940, 400],
];
const GAP = 20, LAB = 46, HEAD = title ? 44 : 0, WIDTH = 1900;
const comps = [];
let y = HEAD + GAP;
for (const [names, cw, ch] of ROWS) {
  let x = GAP;
  for (const name of names) {
    const f = join(dir, name + ext);
    if (existsSync(f)) {
      const m = await sharp(f).metadata();
      const b = await sharp(f).resize(cw, ch, { fit: 'inside' }).png().toBuffer();
      const bm = await sharp(b).metadata();
      comps.push({ input: b, left: x + Math.round((cw - bm.width) / 2), top: y + (ch - bm.height) });
      comps.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${LAB}"><text x="4" y="19" font-family="Helvetica" font-size="17" font-weight="bold" fill="${ink}">${esc(name)}</text><text x="4" y="38" font-family="Helvetica" font-size="13" fill="${ink2}">${esc(CARDS[name]?.what ?? '')}  ·  ${m.width}x${m.height}${m.hasAlpha ? `, ${CARDS[name]?.cut ?? ''}` : ''}</text></svg>`), left: x, top: y + ch + 2 });
    } else {
      comps.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${LAB}"><text x="4" y="19" font-family="Helvetica" font-size="17" fill="${ink2}">${esc(name)}: not made</text></svg>`), left: x, top: y + ch + 2 });
    }
    x += cw + GAP;
  }
  y += ch + LAB + GAP;
}
if (title) comps.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEAD}"><text x="${GAP}" y="30" font-family="Helvetica" font-size="19" fill="${ink}">${esc(title)}</text></svg>`), left: 0, top: 0 });
await sharp({ create: { width: WIDTH, height: y, channels: 3, background: bg } }).composite(comps).png().toFile(out);
console.log(`wrote ${out} (${WIDTH}x${y}) on ${bg}`);
