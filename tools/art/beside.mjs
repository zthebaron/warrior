#!/usr/bin/env node
// Two or more frames side by side, at their own size, with a paper gutter: for build-log pairs (greybox | ink).
//
//   node tools/art/beside.mjs <out.png> <left.png> <right.png> [<more.png> ...] [--gutter 16]
//
// Every frame is scaled to the first one's height. It judges nothing.
import sharp from 'sharp';

const a = process.argv.slice(2);
const gi = a.indexOf('--gutter');
const gutter = gi === -1 ? 16 : Number(a.splice(gi, 2)[1]);
const out = a.shift();
if (!out || a.length < 2) { console.error('usage: beside.mjs <out.png> <left.png> <right.png> [...] [--gutter N]'); process.exit(2); }
const PAPER = '#cabfac'; // STYLE-BIBLE paper-cream
const height = (await sharp(a[0]).metadata()).height;
const tiles = [];
let left = 0;
for (const f of a) {
  const { data, info } = await sharp(f).resize({ height }).png().toBuffer({ resolveWithObject: true });
  tiles.push({ input: data, left, top: 0 });
  left += info.width + gutter;
}
await sharp({ create: { width: left - gutter, height, channels: 3, background: PAPER } }).composite(tiles).png({ compressionLevel: 9 }).toFile(out);
console.log(`${out}  ${left - gutter}x${height}`);
