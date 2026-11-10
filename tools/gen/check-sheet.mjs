#!/usr/bin/env node
// Is every cell of the contact sheet actually drawn? Prints the red-channel range of each cell
// and exits 1 if any cell is nothing but paper.
//
//   node tools/gen/check-sheet.mjs [sheet.png]
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sheet = process.argv[2] ?? join(ROOT, 'docs/build-log/art-gen/sheet.png');
const names = JSON.parse(readFileSync(join(ROOT, 'assets/hero/hero.json'), 'utf8')).assets.map((a) => a.name);
const CELL = 440, LABEL = 64, HEAD = 56; // the layout constants in sheet.mjs
let empty = 0;
for (const [r, name] of names.entries()) {
  const row = [];
  for (let c = 0; c < 5; c++) {
    const px = await sharp(sheet).extract({ left: c * CELL, top: HEAD + r * (LABEL + CELL) + LABEL, width: CELL, height: CELL }).removeAlpha().raw().toBuffer();
    let lo = 255, hi = 0;
    for (let i = 0; i < px.length; i += 3) { if (px[i] < lo) lo = px[i]; if (px[i] > hi) hi = px[i]; }
    if (hi - lo < 8) empty++;
    row.push(String(hi - lo).padStart(3));
  }
  console.log(name.padEnd(15), row.join(' '));
}
console.log(empty ? `${empty} EMPTY cell(s)` : `all ${names.length * 5} cells drawn`);
process.exit(empty ? 1 : 0);
