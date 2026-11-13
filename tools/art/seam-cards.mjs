// The cliff seam's painted cards (D-028): assets/seam/*.png, each made here and nowhere else.
//
//   node tools/art/seam-cards.mjs            write assets/seam/*.png
//   node tools/art/seam-cards.mjs --check    fail if a committed PNG differs from what this gives
//
// Chapter 2's rock is seen where chapter 1's never was: head on, across the path, as the faces he climbs. So its
// faces carry the brushwork of a cliff painting laid flat on them. Nothing new was painted for that: every card
// here is CUT FROM THE INSIDE of one of ART-GEN's three cliff paintings (assets/backdrop/gen/cliff_*.png, paid for
// in round 2, read only), where the painting is all rock: grey wash and near-black vertical fracture strokes.
//
// Every card is a WASH: one flat colour (ink-black), the painting's ink density in alpha, so it is laid OVER the
// face the ink pass drew and bare rock shows between the strokes. A card repeats mirrored both ways
// (src/loaders/seam.ts), so no edge of a crop is ever seen as a cut.
// `npm run assets:budget` re-runs this and compares every committed card pixel for pixel (tools/assets/paint-budget.mjs).
// Every number is in MEASUREMENTS.md "D-028 the seam's cards".
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { PNG } = createRequire(import.meta.url)('pngjs');
const palette = JSON.parse(fs.readFileSync(path.join(ROOT, 'reference/palette.json'), 'utf8'));
const rgb = (name) => { const h = palette.colors.find((c) => c.name === name).hex; return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); };
const lumOf = (c) => (c[0] + c[1] + c[2]) / 3;

export const OUT_DIR = 'assets/seam';
const SRC_DIR = 'assets/backdrop/gen';

// rect: x0, y0, x1, y1 in the source painting's own pixels, inside its rock. size: the card, px.
// floor: density under this is bare rock (the painting's pale wash is not laid twice over the face's own fill);
// gain: how much of the density above the floor is kept.
export const CARDS = {
  // two buttresses and the dark cleft between them: what a face across the path is painted with
  seam_face_a: { src: 'cliff_b', rect: [150, 760, 850, 1460], size: [1024, 1024], floor: 0.3, gain: 1.25 },
  // a broad stepped wall, long dry strokes: the faces along the path, on the void side
  seam_face_b: { src: 'cliff_c', rect: [280, 390, 860, 970], size: [1024, 1024], floor: 0.3, gain: 1.25 },
};

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const sources = new Map();
const source = (name) => {
  if (!sources.has(name)) sources.set(name, PNG.sync.read(fs.readFileSync(path.join(ROOT, SRC_DIR, `${name}.png`))));
  return sources.get(name);
};

/** The ink density of a crop (0 bare paper .. 1 brush black), area-averaged down to W x H. */
function density(c) {
  const s = source(c.src), [x0, y0, x1, y1] = c.rect, [W, H] = c.size;
  if (x0 < 0 || y0 < 0 || x1 > s.width || y1 > s.height) throw new Error(`${c.src}: rect ${c.rect} is outside the ${s.width}x${s.height} painting`);
  const paper = lumOf(rgb('paper-cream')), ink = lumOf(rgb('ink-black'));
  const out = new Float64Array(W * H);
  for (let y = 0; y < H; y++) {
    const sy0 = y0 + (y / H) * (y1 - y0), sy1 = y0 + ((y + 1) / H) * (y1 - y0);
    for (let x = 0; x < W; x++) {
      const sx0 = x0 + (x / W) * (x1 - x0), sx1 = x0 + ((x + 1) / W) * (x1 - x0);
      let sum = 0, area = 0;
      for (let yy = Math.floor(sy0); yy < Math.ceil(sy1); yy++) {
        const wy = Math.min(sy1, yy + 1) - Math.max(sy0, yy);
        for (let xx = Math.floor(sx0); xx < Math.ceil(sx1); xx++) {
          const wx = Math.min(sx1, xx + 1) - Math.max(sx0, xx);
          const i = (yy * s.width + xx) * 4;
          const d = clamp01((paper - (s.data[i] + s.data[i + 1] + s.data[i + 2]) / 3) / (paper - ink)) * (s.data[i + 3] / 255);
          sum += d * wx * wy;
          area += wx * wy;
        }
      }
      out[y * W + x] = sum / area;
    }
  }
  return out;
}

function build(c) {
  const [W, H] = c.size, d = density(c), colour = rgb('ink-black');
  const png = new PNG({ width: W, height: H });
  for (let i = 0; i < W * H; i++) {
    png.data[i * 4] = colour[0];
    png.data[i * 4 + 1] = colour[1];
    png.data[i * 4 + 2] = colour[2];
    png.data[i * 4 + 3] = Math.round(clamp01(((d[i] - c.floor) / (1 - c.floor)) * c.gain) * 255);
  }
  return png;
}

/** name -> a function that builds the card: what tools/assets/paint-budget.mjs compares each committed PNG with. */
export const BUILDERS = Object.fromEntries(Object.entries(CARDS).map(([name, c]) => [name, () => ({ png: build(c) })]));

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  let bad = 0;
  fs.mkdirSync(path.join(ROOT, OUT_DIR), { recursive: true });
  for (const [name, make] of Object.entries(BUILDERS)) {
    const { png } = make(), file = path.join(ROOT, OUT_DIR, `${name}.png`);
    if (check) {
      const have = fs.existsSync(file) ? PNG.sync.read(fs.readFileSync(file)) : null;
      const same = have && have.width === png.width && have.height === png.height && Buffer.compare(have.data, png.data) === 0;
      if (!same) { bad++; console.error(`${name}: ${OUT_DIR}/${name}.png is not what this script gives`); }
      continue;
    }
    fs.writeFileSync(file, PNG.sync.write(png, { colorType: 6 }));
    let ink = 0;
    for (let i = 3; i < png.data.length; i += 4) ink += png.data[i] / 255;
    console.log(`${name}: ${png.width}x${png.height}, ${fs.statSync(file).size} B, ink ${((ink / (png.width * png.height)) * 100).toFixed(1)}% of the card`);
  }
  if (check) { console.log(bad ? `${bad} card(s) differ` : `${Object.keys(BUILDERS).length} seam cards are what the script gives`); process.exit(bad ? 1 : 0); }
}
