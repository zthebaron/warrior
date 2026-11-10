#!/usr/bin/env node
// Contact sheet: one row per model in assets/hero/hero.json.
//   input painting | textured three-quarter | textured from behind | textured side | clay three-quarter
// Textured cells are unlit (the base colour exactly as it is, no lighting) on paper colour.
// The clay cell has no texture: it is there so a relief with a picture on it cannot pass as a solid.
// Nothing is rendered front-on, because a front-on render matches its input by construction.
//
//   node tools/gen/sheet.mjs [out.png]      default docs/build-log/art-gen/sheet.png
import sharp from 'sharp';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const out = process.argv[2] ?? join(ROOT, 'docs/build-log/art-gen/sheet.png');
const assets = JSON.parse(readFileSync(join(ROOT, 'assets/hero/hero.json'), 'utf8')).assets;
const PAPER = '#cabfac', INK = '#20201e';   // STYLE-BIBLE paper-cream, ink-black
const CELL = 440, LABEL = 64, HEAD = 56;
const COLS = ['input painting', 'three-quarter', 'from behind', 'side', 'clay (no texture)'];
const tmp = mkdtempSync(join(tmpdir(), 'hero-sheet-'));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const text = (w, h, s, size, weight = 400, fill = INK) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><text x="12" y="${Math.round(h / 2 + size * 0.36)}" font-family="Helvetica, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${esc(s)}</text></svg>`);

const W = COLS.length * CELL, rowH = LABEL + CELL;
const layers = COLS.map((c, i) => ({ input: text(CELL, HEAD, c, 22, 700), left: i * CELL, top: 0 }));
for (const [r, a] of assets.entries()) {
  const top = HEAD + r * rowH;
  const glb = join(ROOT, 'assets/hero', a.file);
  const strip = join(tmp, `${a.name}.png`), clay = join(tmp, `${a.name}.clay.png`);
  for (const [dst, extra] of [[strip, ['--views', '35,215,90', '--modes', 'unlit']], [clay, ['--views', '35', '--modes', 'clay']]]) {
    const pose = a.clip ? ['--clip', a.clip, '--time', String(a.time ?? 0)] : []; // a rigged model is shown mid-clip
    const res = spawnSync(process.execPath, [join(HERE, 'render-glb.mjs'), glb, dst, '--size', String(CELL), '--elev', '12', ...extra, ...pose], { encoding: 'utf8' });
    if (res.status !== 0) { console.error(`ERROR rendering ${a.name}: ${res.stderr}`); process.exit(1); }
  }
  layers.push({ input: text(W, LABEL, `${a.name}   ${a.triangles_after.toLocaleString()} tris   ${a.verdict}`, 24, 700), left: 0, top });
  layers.push({ input: await sharp(join(ROOT, 'assets/hero', a.input)).resize({ width: CELL, height: CELL, fit: 'contain', background: PAPER }).flatten({ background: PAPER }).png().toBuffer(), left: 0, top: top + LABEL });
  layers.push({ input: strip, left: CELL, top: top + LABEL });
  layers.push({ input: clay, left: 4 * CELL, top: top + LABEL });
}
mkdirSync(dirname(out), { recursive: true });
await sharp({ create: { width: W, height: HEAD + assets.length * rowH, channels: 3, background: PAPER } }).composite(layers).png().toFile(out);
console.log(`${out}  ${assets.length} model(s), ${W}x${HEAD + assets.length * rowH}`);
