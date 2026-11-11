#!/usr/bin/env node
// The swordsman's accepted input image (D-023), made locally from the T-pose take.
//
//   node tools/gen/swordsman-input.mjs <swordsman_front_v2.png> <out.png>
//
// The figure goes to image-to-3D and to the rig EMPTY-HANDED. A blade fused to one hand is the rig's to
// misread (a wrist placed at the sword's tip is charged in full), and a skinned blade bends. The katana is a
// small rigid mesh the game hangs on the hand bone instead (src/entities/swordsman-model.ts), so its angle in
// the grip is a number in a table.
//
// Take v2 has the katana hanging straight down from the right fist, in empty paper. Asking the image model to
// remove it returned a blank sheet (ledger row 84), so it is removed here: the paper beside the sword is
// copied over the hilt above the fist and over the guard and blade below it. The fist is kept.
import sharp from 'sharp';

const [src, out] = process.argv.slice(2);
if (!src || !out) { console.error('usage: swordsman-input.mjs <swordsman_front_v2.png> <out.png>'); process.exit(2); }

// In the 864 x 1184 take: the sword's column, and the clean paper column just left of it.
const SWORD = { left: 98, width: 66 };
const PAPER = { left: 30, width: 66 };
// rows above the fist (the hilt) and below it (guard and blade)
const ROWS = [{ top: 222, height: 72 }, { top: 338, height: 318 }];

const meta = await sharp(src).metadata();
if (meta.width !== 864 || meta.height !== 1184) { console.error(`ERROR ${src} is ${meta.width}x${meta.height}, not the 864x1184 take these rows were read from`); process.exit(1); }
const patches = await Promise.all(ROWS.map(async (r) => ({
  input: await sharp(src).extract({ left: PAPER.left, top: r.top, width: PAPER.width, height: r.height }).png().toBuffer(),
  left: SWORD.left,
  top: r.top,
})));
await sharp(src).composite(patches).png().toFile(out);
console.log(`${out}: the hanging katana painted out (${ROWS.map((r) => `rows ${r.top}-${r.top + r.height}`).join(', ')})`);
