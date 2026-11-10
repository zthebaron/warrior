#!/usr/bin/env node
// same-picture: is a display-size frame the SAME PICTURE as the 640x360 reference frame of the same camera?
// The display frame (a whole multiple of the reference, e.g. 2560x1440) is box-downscaled to the reference's
// size and compared pixel by pixel. An anti-aliased frame cannot match exactly along an edge, so this reports
// how far apart the two are and where, and does not gate anything:
//   mean  : mean absolute difference per channel, 0..255
//   over  : share of pixels whose largest channel difference exceeds 32 (a full ramp step is ~20 to 45 apart)
//   node tools/same-picture.mjs display.png reference.png [diff-out.png]
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const [a, b, out] = process.argv.slice(2);
const big = PNG.sync.read(readFileSync(a));
const ref = PNG.sync.read(readFileSync(b));
const k = big.width / ref.width;
if (!Number.isInteger(k) || big.height !== ref.height * k) throw new Error(`${big.width}x${big.height} is not a whole multiple of ${ref.width}x${ref.height}`);
const diff = new PNG({ width: ref.width, height: ref.height });
let sum = 0, over = 0;
for (let y = 0; y < ref.height; y++) {
  for (let x = 0; x < ref.width; x++) {
    const q = (y * ref.width + x) * 4;
    let worst = 0;
    for (let c = 0; c < 3; c++) {
      let acc = 0;
      for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) acc += big.data[((y * k + j) * big.width + x * k + i) * 4 + c];
      const d = Math.abs(acc / (k * k) - ref.data[q + c]);
      sum += d;
      worst = Math.max(worst, d);
    }
    if (worst > 32) over++;
    const v = Math.min(255, Math.round(worst * 2));
    diff.data[q] = v; diff.data[q + 1] = v; diff.data[q + 2] = v; diff.data[q + 3] = 255;
  }
}
const n = ref.width * ref.height;
console.log(`${a.split('/').pop()} vs ${b.split('/').slice(-2).join('/')}: mean ${(sum / (n * 3)).toFixed(2)} / 255, over ${(100 * over / n).toFixed(2)}% (${over} of ${n} px)`);
if (out) writeFileSync(out, PNG.sync.write(diff));
