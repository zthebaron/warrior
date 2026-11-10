#!/usr/bin/env node
// edge-stats: is a frame anti-aliased at all?
//   soft edges : of the pixels that sit on a strong horizontal edge (the pixels left and right of it differ by
//                more than 60 levels), the share whose own value lies between the two, at least 12 levels from
//                each. A frame with no anti-aliasing scores ~0%: every edge pixel is one side or the other.
//   node tools/edge-stats.mjs frame.png [more.png ...]
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';

for (const f of process.argv.slice(2)) {
  const a = PNG.sync.read(readFileSync(f));
  const lum = (i) => (a.data[i] + a.data[i + 1] + a.data[i + 2]) / 3;
  let edge = 0, soft = 0;
  for (let y = 0; y < a.height; y++) {
    for (let x = 1; x < a.width - 1; x++) {
      const i = (y * a.width + x) * 4;
      const l = lum(i - 4), c = lum(i), r = lum(i + 4);
      if (Math.abs(l - r) > 60) { edge++; if (Math.min(Math.abs(c - l), Math.abs(c - r)) >= 12 && (c - l) * (c - r) < 0) soft++; }
    }
  }
  console.log(`${f.split('/').pop()}: soft edges ${(100 * soft / edge).toFixed(1)}% of ${edge} edge px`);
}
