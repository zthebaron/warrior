#!/usr/bin/env node
// crop-png: cut a rectangle out of a PNG at 1:1 (optionally enlarged by an integer, nearest), so a region of a
// large screenshot can be inspected or shown at the pixel level. node tools/crop-png.mjs in.png out.png x y w h [scale]
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
const [src, dst, x, y, w, h, s = 1] = process.argv.slice(2).map((v, i) => (i < 2 ? v : Number(v)));
const a = PNG.sync.read(readFileSync(src));
const o = new PNG({ width: w * s, height: h * s });
for (let j = 0; j < h * s; j++) for (let i = 0; i < w * s; i++) {
  const p = ((y + Math.floor(j / s)) * a.width + x + Math.floor(i / s)) * 4, q = (j * o.width + i) * 4;
  o.data[q] = a.data[p]; o.data[q + 1] = a.data[p + 1]; o.data[q + 2] = a.data[p + 2]; o.data[q + 3] = 255;
}
writeFileSync(dst, PNG.sync.write(o));
