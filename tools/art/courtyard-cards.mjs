// The courtyard's painted cards (D-026): assets/courtyard/*.png, each made here and nowhere else.
//
//   node tools/art/courtyard-cards.mjs            write assets/courtyard/*.png
//   node tools/art/courtyard-cards.mjs --check    fail if a committed PNG differs from what this gives
//   node tools/art/courtyard-cards.mjs --stats    print each card's size and how much ink it carries
//
// Two sources:
//   the painting   assets/ui/src/courtyard-duel.png, Tim's courtyard painting (1024 x 1024). What stands beyond
//                  its walls (the mountains and pines in mist) and its sky are CUT FROM IT: the ink it laid
//                  down becomes the alpha of one flat ramp colour (a wash, as tools/art/backdrop-textures.mjs
//                  makes one from the seed), so bare paper is simply absent.
//   drawn here     the flagstones, the plaster's stains and the tile rows. The painting's ground and walls are
//                  in perspective, under four figures, and its roofs are a few dozen pixels, so none of them
//                  can be lifted from it flat; they are drawn by this script from a seed, as brush lines of
//                  uneven weight that break and washes that pool, after what the painting shows of each.
//
// Every card is a WASH: one flat colour, the ink's density in alpha. Nothing here carries a hue but the sky,
// whose colour is the paper's own value and chroma turned toward rose (MEASUREMENTS "D-026 the courtyard's look").
// `npm run assets:budget` re-runs this and compares every committed card pixel for pixel (tools/assets/paint-budget.mjs).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { PNG } = createRequire(import.meta.url)('pngjs');
const palette = JSON.parse(fs.readFileSync(path.join(ROOT, 'reference/palette.json'), 'utf8'));
const rgb = (name) => { const h = palette.colors.find((c) => c.name === name).hex; return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); };

export const OUT_DIR = 'assets/courtyard';
const PAINTING = 'assets/ui/src/courtyard-duel.png';

export const CARDS = {
  // What stands beyond the walls. rect: x0, y0, x1, y1 in the painting. `cut`: a line across the crop (points in
  // the painting's own pixels, left to right); everything under it is the painting's walls and gate and is taken
  // out, fading over `fade` px above it. ink: the ramp colour the wash is laid in; gain: how much of the
  // painting's density is kept (a far form is never darker than ink-grey, STYLE §3).
  yard_far: {
    kind: 'crop', rect: [0, 70, 1024, 380], size: [2048, 620], ink: 'ink-grey', gain: 1.2, floor: 0.1,
    cut: [[0, 236], [262, 368], [384, 368], [384, 284], [641, 284], [641, 368], [762, 368], [1024, 252]], fade: 26, topFade: 0.16,
  },
  // The stains on a plastered wall: `metres` of wall, foot to cap, that repeats along it. The lit wall carries
  // little; the walls in shade carry more (the painting's right wall is the darker one).
  yard_plaster_lit: { kind: 'plaster', size: [1024, 512], metres: 12, ink: 'wash-mid', seed: 21, wash: 0.2, foot: 0.3, post: 0.6 },
  yard_plaster_shade: { kind: 'plaster', size: [1024, 512], metres: 12, ink: 'wash-mid', seed: 23, wash: 0.42, foot: 0.5, post: 0.75 },
  // The sky: where the painting's sky is rose. The colour is fixed (see ROSE); alpha is how rose the painting is there.
  yard_sky: { kind: 'sky', rect: [0, 0, 1024, 196], size: [1024, 196], gain: 1.0 },
  // Flagstones: one tile, `metres` on a side, that repeats without a seam.
  yard_flags: { kind: 'flags', size: [2048, 2048], metres: 16, ink: 'ink-deep', seed: 5, rows: [2.1, 3.1], slabs: [2.4, 4.2], joint: 3.0 },
  // Tile rows down a roof slope: `metres` along the roof by one slope deep.
  yard_tiles: { kind: 'tiles', size: [512, 256], metres: 4, ink: 'ink-deep', seed: 9 },
};

/** The sky's wash: the paper's own value and chroma (202,191,172: value 188, chroma 30), turned toward rose. */
export const ROSE = [204, 184, 174];

// ---------- helpers ----------
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (e0, e1, v) => { const t = clamp01((v - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash2 = (x, y, s) => { const n = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return n - Math.floor(n); };
/** Smooth value noise in 0..1 that repeats every `period` cells. */
function noise2(x, y, period, s) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const w = (i) => ((i % period) + period) % period;
  const a = hash2(w(xi), w(yi), s), b = hash2(w(xi + 1), w(yi), s), c = hash2(w(xi), w(yi + 1), s), d = hash2(w(xi + 1), w(yi + 1), s);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
let painting = null;
const src = () => (painting ??= PNG.sync.read(fs.readFileSync(path.join(ROOT, PAINTING))));

/** Area-average of one channel-function of the painting over rect, resampled to W x H. */
function resampled(rect, W, H, f) {
  const img = src(), [x0, y0, x1, y1] = rect, w = x1 - x0, h = y1 - y0, out = new Float64Array(W * H);
  for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
    // bilinear: the crops here are enlarged, never reduced
    const sx = x0 + ((X + 0.5) * w) / W - 0.5, sy = y0 + ((Y + 0.5) * h) / H - 0.5;
    const xi = Math.max(0, Math.min(img.width - 2, Math.floor(sx))), yi = Math.max(0, Math.min(img.height - 2, Math.floor(sy)));
    const fx = clamp01(sx - xi), fy = clamp01(sy - yi);
    const at = (x, y) => { const i = (y * img.width + x) * 4; return f(img.data[i], img.data[i + 1], img.data[i + 2]); };
    out[Y * W + X] = (at(xi, yi) * (1 - fx) + at(xi + 1, yi) * fx) * (1 - fy) + (at(xi, yi + 1) * (1 - fx) + at(xi + 1, yi + 1) * fx) * fy;
  }
  return out;
}
/** A flat-colour card whose alpha is `dens` (0..1). */
function card(W, H, colour, dens) {
  const png = new PNG({ width: W, height: H });
  for (let i = 0; i < W * H; i++) {
    png.data[i * 4] = colour[0]; png.data[i * 4 + 1] = colour[1]; png.data[i * 4 + 2] = colour[2];
    png.data[i * 4 + 3] = Math.round(clamp01(dens[i]) * 255);
  }
  return png;
}
/** The luminance a crop's paper has: the 92nd percentile of it. */
function paperOf(lum) { const s = Float64Array.from(lum).sort(); return s[Math.floor(s.length * 0.92)]; }

// ---------- the kinds ----------
function buildCrop(c) {
  const [W, H] = c.size, [x0, y0, x1, y1] = c.rect;
  const lum = resampled(c.rect, W, H, (r, g, b) => (r + g + b) / 3);
  const paper = paperOf(lum), dark = 40; // the painting's own brush black
  const dens = new Float64Array(W * H);
  for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
    let d = clamp01((paper - lum[Y * W + X]) / (paper - dark));
    d = d <= c.floor ? 0 : ((d - c.floor) / (1 - c.floor)) * c.gain;
    if (c.cut) {
      // the cut line's height at this column, in the crop's own rows
      const px = x0 + ((X + 0.5) * (x1 - x0)) / W;
      let k = 0;
      while (k < c.cut.length - 2 && px > c.cut[k + 1][0]) k++;
      const [ax, ay] = c.cut[k], [bx, by] = c.cut[k + 1];
      const lineY = ay + (by - ay) * clamp01((px - ax) / Math.max(1e-9, bx - ax));
      const py = y0 + ((Y + 0.5) * (y1 - y0)) / H;
      d *= smooth(lineY, lineY - c.fade, py); // 0 at and under the line, 1 from `fade` px above it
    }
    if (c.topFade) d *= smooth(0, c.topFade, Y / H); // the crop's top is the painting's cloud: it thins into the paper
    dens[Y * W + X] = d;
  }
  return card(W, H, rgb(c.ink), dens);
}

function buildSky(c) {
  const [W, H] = c.size;
  // how rose a pixel is: red over the mean of green and blue, beyond what the painting's bare paper has
  const rose = resampled(c.rect, W, H, (r, g, b) => r - (g + b) / 2);
  const base = paperOf(Float64Array.from(rose).map((v) => -v)) * -1; // the 8th percentile: bare paper
  let top = 0;
  for (const v of rose) top = Math.max(top, v);
  const dens = new Float64Array(W * H);
  for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
    const e = Math.min(X, W - 1 - X) / W, ey = Math.min(Y, H - 1 - Y) / H;
    dens[Y * W + X] = smooth(base + (top - base) * 0.12, base + (top - base) * 0.6, rose[Y * W + X]) * c.gain * smooth(0, 0.06, e) * smooth(0, 0.14, ey);
  }
  return card(W, H, ROSE, dens);
}

/** Lay a brush line along a polyline into `dens`: uneven weight, and it breaks. Wraps at the tile's edges. */
function brush(dens, W, H, pts, width, alpha, r, seed, dry = 0.35) {
  for (let k = 0; k + 1 < pts.length; k++) {
    const [ax, ay] = pts[k], [bx, by] = pts[k + 1], len = Math.hypot(bx - ax, by - ay), n = Math.ceil(len * 2);
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
      const along = (k * 97 + t * len) / 40;
      const press = noise2(along, seed * 3.1, 4096, seed);              // how hard the brush is pressed
      if (press < dry * noise2(along / 5, seed * 1.7, 4096, seed + 1)) continue; // a dry stretch: the line breaks
      const w = width * (0.45 + 1.1 * press), a = alpha * (0.55 + 0.45 * press), rad = Math.ceil(w + 1);
      for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
        const d = Math.hypot(dx, dy);
        if (d > w + 1) continue;
        const X = (((Math.round(x) + dx) % W) + W) % W, Y = (((Math.round(y) + dy) % H) + H) % H;
        const v = a * smooth(w + 1, w - 0.5, d);
        if (v > dens[Y * W + X]) dens[Y * W + X] = v;
      }
    }
  }
  void r;
}

function buildFlags(c) {
  const [W, H] = c.size, r = rng(c.seed), px = W / c.metres, dens = new Float64Array(W * H);
  // rows of slabs: row depths and slab widths in metres, each summing to the tile so it repeats without a seam
  const split = (total, lo, hi) => { const out = []; let left = total; while (left > hi + lo) { const v = lo + (hi - lo) * r(); out.push(v); left -= v; } out.push(left / 2, left / 2); return out; };
  const rows = split(c.metres, c.rows[0], c.rows[1]);
  let y = 0;
  rows.forEach((depth, ri) => {
    const widths = split(c.metres, c.slabs[0], c.slabs[1]), off = r() * 3;
    // the joint under this row: one long line, wobbling
    const line = [];
    for (let x = 0; x <= W; x += 16) line.push([x, (y + (noise2(x / 300, ri * 7.3, Math.round(W / 300), c.seed + ri) - 0.5) * 0.10) * px]);
    brush(dens, W, H, line, c.joint, 0.9, r, c.seed + ri * 11);
    let x = off;
    widths.forEach((w, wi) => {
      // the joint between two slabs of the row: a short line across it, leaning a little
      const lean = (r() - 0.5) * 0.12, x0 = x * px, y0 = y * px, y1 = (y + depth) * px;
      const seg = [];
      for (let k = 0; k <= 8; k++) seg.push([x0 + lean * px * (k / 8) + (noise2(k * 0.7, wi * 3.3, 64, c.seed + ri * 13 + wi) - 0.5) * 5, y0 + ((y1 - y0) * k) / 8]);
      brush(dens, W, H, seg, c.joint * 0.8, 0.85, r, c.seed + ri * 17 + wi * 5);
      // now and then a crack runs out of a corner into the slab
      if (r() < 0.3) {
        const crack = [[x0, y0]];
        let cx = x0, cy = y0;
        const dir = r() * Math.PI * 0.5 + 0.2;
        for (let k = 0; k < 6; k++) { cx += Math.cos(dir + (r() - 0.5) * 0.9) * 0.22 * px; cy += Math.sin(dir + (r() - 0.5) * 0.9) * 0.22 * px; crack.push([cx, cy]); }
        brush(dens, W, H, crack, 0.8, 0.6, r, c.seed + ri * 19 + wi * 7, 0.5);
      }
      x += w;
    });
    y += depth;
  });
  // worn stone: a thin wash pooled in patches, and a little darker along the joints it has run into
  const out = new Float64Array(W * H);
  for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
    const n = 0.6 * noise2(X / 256, Y / 256, W / 256, c.seed + 40) + 0.4 * noise2(X / 64, Y / 64, W / 64, c.seed + 41);
    const stain = smooth(0.62, 0.84, n) * 0.1;
    out[Y * W + X] = Math.max(dens[Y * W + X], stain);
  }
  return card(W, H, rgb(c.ink), out);
}

function buildPlaster(c) {
  const [W, H] = c.size, r = rng(c.seed), dens = new Float64Array(W * H), px = W / c.metres;
  // washes that have run down the wall: noise stretched tall, pooled under the cap and at the foot
  for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
    const fy = Y / (H - 1); // 0 under the cap, 1 at the foot
    const run = 0.65 * noise2(X / 90, Y / 420, Math.round(W / 90), c.seed) + 0.35 * noise2(X / 28, Y / 150, Math.round(W / 28), c.seed + 1);
    const pool = 0.35 + 0.65 * Math.max(smooth(0.3, 0, fy), smooth(0.55, 1, fy));
    const stain = smooth(0.5, 0.82, run) * c.wash * pool;
    const foot = smooth(0.86, 1, fy) * c.foot * (0.6 + 0.4 * noise2(X / 60, 3.3, Math.round(W / 60), c.seed + 2));
    const cap = smooth(0.07, 0, fy) * c.foot;
    dens[Y * W + X] = Math.max(stain, foot, cap);
  }
  // a timber post against the wall, as the painting's walls have
  const post = [];
  for (let y = 0; y <= H; y += 10) post.push([W * 0.31 + (noise2(y / 80, 1.1, 64, c.seed + 5) - 0.5) * 4, y]);
  brush(dens, W, H, post, 4.5, c.post, r, c.seed + 6, 0.1);
  // the stones of its base: a line along it, and a few uprights
  const base = [];
  for (let x = 0; x <= W; x += 12) base.push([x, H * 0.9 + (noise2(x / 110, 2.2, Math.round(W / 110), c.seed + 7) - 0.5) * 8]);
  brush(dens, W, H, base, 2.0, 0.7, r, c.seed + 8, 0.3);
  for (let k = 0; k < Math.round(c.metres / 1.6); k++) {
    const x = (k + r() * 0.6) * 1.6 * px;
    brush(dens, W, H, [[x, H * 0.9], [x + (r() - 0.5) * 6, H - 2]], 1.5, 0.6, r, c.seed + 9 + k, 0.3);
  }
  return card(W, H, rgb(c.ink), dens);
}

function buildTiles(c) {
  const [W, H] = c.size, r = rng(c.seed), dens = new Float64Array(W * H), px = W / c.metres;
  // the rolls of tile that run down the slope, a quarter of a metre apart
  const n = Math.round(c.metres / 0.25);
  for (let k = 0; k < n; k++) {
    const x = ((k + 0.5) * W) / n, line = [];
    for (let y = 0; y <= H; y += 8) line.push([x + (noise2(y / 40, k * 1.9, 64, c.seed + k) - 0.5) * 3, y]);
    brush(dens, W, H, line, 1.5, 0.62, r, c.seed + k * 3, 0.28);
  }
  // the ridge along the top and the eave along the bottom: two heavier strokes
  const along = (y, wob) => { const l = []; for (let x = 0; x <= W; x += 12) l.push([x, y + (noise2(x / 90, y, Math.ceil(W / 90), c.seed + 70) - 0.5) * wob]); return l; };
  brush(dens, W, H, along(7, 3), 4.2, 0.92, r, c.seed + 80, 0.12);
  brush(dens, W, H, along(H - 8, 3), 3.0, 0.8, r, c.seed + 81, 0.2);
  // a course line or two across the rolls
  brush(dens, W, H, along(H * 0.38, 4), 0.9, 0.35, r, c.seed + 82, 0.5);
  brush(dens, W, H, along(H * 0.7, 4), 0.9, 0.35, r, c.seed + 83, 0.5);
  void px;
  return card(W, H, rgb(c.ink), dens);
}

const KINDS = { crop: buildCrop, sky: buildSky, flags: buildFlags, plaster: buildPlaster, tiles: buildTiles };
/** name -> a function that builds the card: what tools/assets/paint-budget.mjs compares each committed PNG with. */
export const BUILDERS = Object.fromEntries(Object.entries(CARDS).map(([name, c]) => [name, () => ({ png: KINDS[c.kind](c) })]));

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check'), stats = process.argv.includes('--stats');
  let bad = 0;
  fs.mkdirSync(path.join(ROOT, OUT_DIR), { recursive: true });
  for (const [name, build] of Object.entries(BUILDERS)) {
    const { png } = build(), file = path.join(ROOT, OUT_DIR, `${name}.png`);
    if (check) {
      const have = fs.existsSync(file) ? PNG.sync.read(fs.readFileSync(file)) : null;
      const same = have && have.width === png.width && have.height === png.height && Buffer.compare(have.data, png.data) === 0;
      if (!same) { bad++; console.error(`${name}: ${OUT_DIR}/${name}.png is not what this script gives`); }
      continue;
    }
    fs.writeFileSync(file, PNG.sync.write(png, { colorType: 6 }));
    let ink = 0;
    for (let i = 3; i < png.data.length; i += 4) ink += png.data[i] / 255;
    if (stats || true) console.log(`${name}: ${png.width}x${png.height}, ${fs.statSync(file).size} B, ink ${((ink / (png.width * png.height)) * 100).toFixed(1)}% of the card`);
  }
  if (check) { console.log(bad ? `${bad} card(s) differ` : `${Object.keys(BUILDERS).length} courtyard cards are what the script gives`); process.exit(bad ? 1 : 0); }
}
