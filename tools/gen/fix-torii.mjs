#!/usr/bin/env node
// The image model kept painting the torii's lintel cap and post feet black, twice, against the
// prompt. The brief is "posts and lintel a single flat vermilion, the only colour", so this
// repaints every near-black pixel with the gate's own median red. Free, local, deterministic.
//
//   node tools/gen/fix-torii.mjs <in.png> <out.png>
import sharp from 'sharp';

const [src, dst] = process.argv.slice(2);
if (!src || !dst) { console.error('usage: fix-torii.mjs <in.png> <out.png>'); process.exit(2); }
const { data, info } = await sharp(src).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const n = info.width * info.height;
const isRed = (r, g, b) => r > 150 && r - g > 70 && r - b > 70;
const isDark = (r, g, b) => Math.max(r, g, b) < 110;
const reds = [[], [], []];
for (let i = 0; i < n; i++) {
  const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
  if (isRed(r, g, b)) { reds[0].push(r); reds[1].push(g); reds[2].push(b); }
}
const med = reds.map((c) => c.sort((a, b) => a - b)[c.length >> 1]);
let changed = 0;
for (let i = 0; i < n; i++) {
  const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
  if (isDark(r, g, b)) { data[i * 3] = med[0]; data[i * 3 + 1] = med[1]; data[i * 3 + 2] = med[2]; changed++; }
}
await sharp(data, { raw: info }).png().toFile(dst);
const hex = '#' + med.map((v) => v.toString(16).padStart(2, '0')).join('');
console.log(`${dst}: gate red ${hex} over ${reds[0].length} px; repainted ${changed} dark px (${(100 * changed / n).toFixed(2)}% of the image)`);
