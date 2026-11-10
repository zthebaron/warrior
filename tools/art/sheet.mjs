// The build-log sheet: the seed frame beside our frames, same size, for judging by eye, plus the measure
// that goes with it (the share of each ramp step, the way MEASUREMENTS "D-019 ink edge and value range" took it).
//
//   node tools/art/sheet.mjs <out.png> <panel.png>...          seed | panel | panel ...
//   node tools/art/sheet.mjs --shares <image.png>...           print each image's ramp-step shares
//
// The seed panel is reference/seed/hero/hero_7s.png box-downscaled 3x (1920x1080 -> 640x360): the frame every
// sheet since D-018 has used. Panels must be 640x360. An 8px white gutter separates them.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { PNG } = createRequire(import.meta.url)('pngjs');
const SEED = 'reference/seed/hero/hero_7s.png';
const W = 640, H = 360, GUTTER = 8, ACCENT_CHROMA = 51; // chroma above this is the accent (tools/harness/post.ts)
const ramp = JSON.parse(fs.readFileSync(path.join(ROOT, 'reference/palette.json'), 'utf8')).colors
  .map((c) => ({ name: c.name, value: [1, 3, 5].reduce((a, i) => a + parseInt(c.hex.slice(i, i + 2), 16), 0) / 3 }));

const read = (f) => PNG.sync.read(fs.readFileSync(path.isAbsolute(f) ? f : path.join(ROOT, f)));

/** Mean of each k x k block. */
function boxDown(img, k) {
  const out = new PNG({ width: img.width / k, height: img.height / k });
  for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) {
    for (let c = 0; c < 4; c++) {
      let s = 0;
      for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) s += img.data[((y * k + dy) * img.width + x * k + dx) * 4 + c];
      out.data[(y * out.width + x) * 4 + c] = Math.round(s / (k * k));
    }
  }
  return out;
}

/** Share of non-accent pixels nearest each ramp step by mean value, lightest first, in percent. */
export function shares(img) {
  const n = new Array(ramp.length).fill(0);
  let total = 0;
  for (let i = 0; i < img.width * img.height; i++) {
    const r = img.data[i * 4], g = img.data[i * 4 + 1], b = img.data[i * 4 + 2];
    if (Math.max(r, g, b) - Math.min(r, g, b) > ACCENT_CHROMA) continue;
    const v = (r + g + b) / 3;
    let best = 0;
    for (let k = 1; k < ramp.length; k++) if (Math.abs(ramp[k].value - v) < Math.abs(ramp[best].value - v)) best = k;
    n[best]++;
    total++;
  }
  return n.map((x) => (100 * x) / total);
}

const args = process.argv.slice(2);
if (args[0] === '--shares') {
  console.log(`${'image'.padEnd(46)} ${ramp.map((r) => r.name.padStart(11)).join(' ')}`);
  for (const f of args.slice(1)) console.log(`${f.slice(-46).padEnd(46)} ${shares(read(f)).map((s) => `${s.toFixed(1)}%`.padStart(11)).join(' ')}`);
} else {
  const [out, ...panels] = args;
  if (!out || !panels.length) { console.error('usage: node tools/art/sheet.mjs <out.png> <panel.png>...   |   --shares <image.png>...'); process.exit(2); }
  const imgs = [boxDown(read(SEED), 3), ...panels.map(read)];
  for (const [i, img] of imgs.entries()) if (img.width !== W || img.height !== H) { console.error(`panel ${i} is ${img.width}x${img.height}, not ${W}x${H}`); process.exit(1); }
  const sheet = new PNG({ width: imgs.length * W + (imgs.length - 1) * GUTTER, height: H });
  sheet.data.fill(255);
  imgs.forEach((img, i) => PNG.bitblt(img, sheet, 0, 0, W, H, i * (W + GUTTER), 0));
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, PNG.sync.write(sheet));
  console.log(`wrote ${out}  ${sheet.width}x${sheet.height}  [seed ${SEED} | ${panels.join(' | ')}]`);
}
