// Painted backdrop textures, cut from the seed (D-020: the far field is painted planes, not kit geometry).
//
//   node tools/art/backdrop-textures.mjs            write assets/backdrop/*.png
//   node tools/art/backdrop-textures.mjs --check    fail if a committed PNG differs from what the seed gives
//
// A layer is INK ON PAPER: the PNG stores one flat ink colour and, in alpha, how much ink the seed laid
// down at that pixel (0 = bare paper). Drawn over the paper sky it reproduces the seed's wash, and where
// the seed left paper the layer is simply absent: nothing is keyed, so there is no fringe.
// Every number here is recorded in 00-start-here/MEASUREMENTS.md, "D-020 painted backdrop".
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { PNG } = createRequire(import.meta.url)('pngjs');
const palette = JSON.parse(fs.readFileSync(path.join(ROOT, 'reference/palette.json'), 'utf8'));
const rgb = (name) => { const h = palette.colors.find((c) => c.name === name).hex; return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); };
const mean = (c) => (c[0] + c[1] + c[2]) / 3;

export const LAYERS = [
  {
    // The far ridge: one long low ridge with a paler second ridge behind it, clear of the figure's hat.
    out: 'far_ridge.png',
    src: 'reference/seed/hero/hero_11s.png',
    rect: [740, 245, 1920, 320], // x0, y0, x1, y1 in the 1920x1080 frame
    size: [1024, 64],
    ink: 'wash-mid',             // the darkest wash in the crop is lighter than this, so alpha stays below 1
    floor: 0.05,                 // density below this is paper noise (sky luminance sd 1.6-2.3 of 88): no ink
  },
];

/** Area-average resample of an RGBA float image (w x h, 4 channels) to W x H. */
function resample(src, w, h, W, H) {
  const out = new Float64Array(W * H * 4);
  for (let Y = 0; Y < H; Y++) {
    const y0 = (Y * h) / H, y1 = ((Y + 1) * h) / H;
    for (let X = 0; X < W; X++) {
      const x0 = (X * w) / W, x1 = ((X + 1) * w) / W;
      let area = 0;
      const acc = [0, 0, 0, 0];
      for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
        const wy = Math.min(y + 1, y1) - Math.max(y, y0);
        for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
          const a = wy * (Math.min(x + 1, x1) - Math.max(x, x0));
          const i = (y * w + x) * 4;
          for (let c = 0; c < 4; c++) acc[c] += src[i + c] * a;
          area += a;
        }
      }
      for (let c = 0; c < 4; c++) out[(Y * W + X) * 4 + c] = acc[c] / area;
    }
  }
  return out;
}

export function buildLayer(layer) {
  const img = PNG.sync.read(fs.readFileSync(path.join(ROOT, layer.src)));
  const [x0, y0, x1, y1] = layer.rect;
  const w = x1 - x0, h = y1 - y0;
  const paper = mean(rgb('paper-cream'));
  const ink = rgb(layer.ink);
  const span = paper - mean(ink);
  // ink density per source pixel, as the only channel that varies
  const dens = new Float64Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((y + y0) * img.width + (x + x0)) * 4;
      const L = (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3;
      const d = Math.min(1, Math.max(0, (paper - L) / span));
      dens[(y * w + x) * 4 + 3] = d <= layer.floor ? 0 : (d - layer.floor) / (1 - layer.floor);
    }
  }
  const [W, H] = layer.size;
  const r = resample(dens, w, h, W, H);
  const png = new PNG({ width: W, height: H });
  for (let p = 0; p < W * H; p++) {
    png.data[p * 4] = ink[0];
    png.data[p * 4 + 1] = ink[1];
    png.data[p * 4 + 2] = ink[2];
    png.data[p * 4 + 3] = Math.round(r[p * 4 + 3] * 255);
  }
  return png;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  const dir = path.join(ROOT, 'assets/backdrop');
  if (!check) fs.mkdirSync(dir, { recursive: true });
  let bad = 0;
  for (const layer of LAYERS) {
    const png = buildLayer(layer);
    const file = path.join(dir, layer.out);
    if (check) {
      const have = fs.existsSync(file) ? PNG.sync.read(fs.readFileSync(file)) : null;
      const same = !!have && have.width === png.width && have.height === png.height && Buffer.compare(have.data, png.data) === 0;
      console.log(`${same ? 'ok   ' : 'STALE'} assets/backdrop/${layer.out}`);
      if (!same) bad++;
    } else {
      fs.writeFileSync(file, PNG.sync.write(png));
      let inked = 0;
      for (let p = 3; p < png.data.length; p += 4) if (png.data[p] > 0) inked++;
      console.log(`wrote assets/backdrop/${layer.out}  ${png.width}x${png.height}  ${fs.statSync(file).size} B  inked ${((100 * inked) / (png.width * png.height)).toFixed(1)}%`);
    }
  }
  if (bad) { console.error('backdrop textures are stale: run node tools/art/backdrop-textures.mjs'); process.exit(1); }
}
