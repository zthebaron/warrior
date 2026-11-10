#!/usr/bin/env node
// Crops of the seed frames used as the style/design reference for each input image.
// None of these is a clean single object (every subject overlaps cliff, cloud or path), which is
// why they are references for the image model and not inputs to image-to-3D.
//
//   node tools/gen/crop-refs.mjs <out dir>
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = process.argv[2];
if (!out) { console.error('usage: crop-refs.mjs <out dir>'); process.exit(2); }
mkdirSync(out, { recursive: true });

// name: [frame, left, top, width, height] in the 1920x1080 seed frame
const CROPS = {
  warrior: ['hero_1s', 1090, 150, 520, 930],
  pine: ['hero_1s', 0, 390, 640, 690],
  cliff: ['hero_5s', 0, 0, 820, 720],
  boulder: ['hero_1s', 660, 700, 520, 380],
  torii: ['hero_9s', 670, 270, 300, 350],
  // Round 2, the painted backdrop cards (make-backdrop-payloads.mjs). All clear of the figure.
  bd_cliff: ['hero_7s', 0, 0, 760, 640],        // the cliff on the left: near-black vertical ink masses
  bd_peaks: ['hero_11s', 760, 215, 1160, 150],  // the far ridge on the horizon
  bd_mist: ['hero_11s', 1270, 380, 650, 560],   // the cloud sea
  bd_wide: ['hero_11s', 1270, 200, 650, 500],   // far ridge over the cloud sea, mostly bare paper
};
for (const [name, [frame, left, top, width, height]] of Object.entries(CROPS)) {
  const scale = Math.max(1, Math.ceil(1024 / Math.max(width, height)));
  await sharp(join(ROOT, 'reference/seed/hero', frame + '.png'))
    .extract({ left, top, width, height })
    .resize({ width: width * scale, kernel: 'lanczos3' })
    .png()
    .toFile(join(out, `ref_${name}.png`));
  console.log(`ref_${name}.png  ${frame} ${width}x${height} x${scale}`);
}
