// The painted cards the game ships (D-021), made from ART-GEN's paintings.
//
//   node tools/art/backdrop-cards.mjs            write assets/backdrop/cards/*.png
//   node tools/art/backdrop-cards.mjs --check    fail if a committed card differs from what its source gives
//   node tools/art/backdrop-cards.mjs --stats    what the cleaning changed in each card, and write nothing
//
// assets/backdrop/gen/*.png are SOURCES (2048 px, 13 MB, ART-GEN's; this script only reads them). A card is one
// of them, resized to what its layer needs and made safe to draw:
//
//   resize   area average in premultiplied alpha, so a transparent texel's colour never leaks into an edge
//   value    nothing is lighter than the paper it is drawn on (a texel above paper-cream becomes paper-cream)
//   chroma   nothing carries more colour than the ramp's most coloured step (the paint gate's "no hue" check
//            judges the frame against exactly that): a texel over it is pulled toward its own grey, value kept
//   bleed    every texel the painting left empty takes the colour of the nearest inked texel, alpha untouched.
//            The sources hold black under alpha 0; a texture filter or a mipmap averages colour across the
//            cut, and black there would draw a dark fringe round every pale wash
//   wash     a wash card is ONE flat colour (ink-black) with the ink's density in alpha, as its source is cut
//   foot     a cliff card's lowest tenth fades out, so it never ends in a straight edge
//
// Which source ships, and at what size, is CARDS. Every number is in MEASUREMENTS.md "D-021 painted cards".
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { PNG } = createRequire(import.meta.url)('pngjs');
const palette = JSON.parse(fs.readFileSync(path.join(ROOT, 'reference/palette.json'), 'utf8'));
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const RAMP = palette.colors.map((c) => hexRgb(c.hex));
const named = (name) => hexRgb(palette.colors.find((c) => c.name === name).hex);
const PAPER = named('paper-cream');
const INK = named('ink-black');
/** The most colour any ramp step carries (max channel - min channel): the paint gate allows this much and 1 more. */
const RAMP_CHROMA = Math.max(...RAMP.map((c) => Math.max(...c) - Math.min(...c)));

const SRC = 'assets/backdrop/gen';
const OUT = 'assets/backdrop/cards';
const index = JSON.parse(fs.readFileSync(path.join(ROOT, SRC, 'cards.json'), 'utf8'));

// name: the longest side it ships at, px. The cut (wash, matte, open) is the source's own, from gen/cards.json.
export const CARDS = {
  cliff_a: 2048,
  cliff_b: 2048,
  cliff_c: 2048,
  pine_a: 1024,
  pine_b: 1024,
  pine_c: 1024,
  peaks_a: 1024,
  peaks_b: 1024,
  peaks_c: 1024,
  wide_a: 1024,
  wide_b: 1024,
  mist_a: 1024,
  mist_b: 1024,
};
// The path's dry-brush (D-021): not a painting, a brush mark. A dry brush dragged along the path leaves long
// thin broken streaks where single bristles still held ink, in patches where the brush did. That is two layers
// of smooth value noise multiplied: `streak`, stretched far along the stroke, and `patch`, broad; each row of
// bristles also holds its own amount of ink. The lightest `floor` of the texels stay bare paper and the
// strongest streak lays down `ink` of ink-black. Both noises repeat exactly at the card's edges, so it tiles.
export const PATH_WASH = {
  out: 'path_wash',
  size: [1024, 256],   // px: along the stroke, across it
  streak: [96, 2],     // px: the length and the thickness of one bristle's mark
  patch: [256, 32],    // px: the patches where the brush still held ink
  bristle: 0.45,       // how much less ink the driest row of bristles holds than the wettest
  floor: 0.72,         // this share of the texels, the lightest, stay bare paper
  ink: 0.06,           // alpha of the strongest streak: about 10 of 255 below the paper
  seed: 11,
};

// The lowest share of a cliff card's height fades out to nothing. The paintings' own feet fade as painted, but
// not everywhere (cliff_c stands on a rock that runs off the sheet), and a card that ends in a straight edge
// shows it wherever its foot is seen from above. With this no cliff card has a bottom edge.
const FOOT = { cliff_a: 0.1, cliff_b: 0.1, cliff_c: 0.1 };

/** A texel below this alpha (of 255) carries no colour worth keeping: the sources fade to black there. */
const COLOUR_ALPHA = 8;
/** How far past the ink the nearest colour is carried, px: the footprint of the fourth mipmap level. */
const BLEED_PX = 16;

/** Area-average an RGBA8 image to w x h, in premultiplied alpha. Returns straight-alpha floats (0..255). */
function resize(src, sw, sh, w, h) {
  const out = new Float64Array(w * h * 4);
  const fx = sw / w, fy = sh / h;
  for (let y = 0; y < h; y++) {
    const y0 = y * fy, y1 = (y + 1) * fy;
    for (let x = 0; x < w; x++) {
      const x0 = x * fx, x1 = (x + 1) * fx;
      let r = 0, g = 0, b = 0, a = 0, area = 0;
      for (let sy = Math.floor(y0); sy < Math.min(sh, Math.ceil(y1)); sy++) {
        const wy = Math.min(y1, sy + 1) - Math.max(y0, sy);
        for (let sx = Math.floor(x0); sx < Math.min(sw, Math.ceil(x1)); sx++) {
          const wgt = wy * (Math.min(x1, sx + 1) - Math.max(x0, sx));
          const p = (sy * sw + sx) * 4, al = src[p + 3] / 255;
          r += src[p] * al * wgt; g += src[p + 1] * al * wgt; b += src[p + 2] * al * wgt; a += al * wgt; area += wgt;
        }
      }
      const o = (y * w + x) * 4;
      if (a > 0) { out[o] = r / a; out[o + 1] = g / a; out[o + 2] = b / a; }
      out[o + 3] = (a / area) * 255;
    }
  }
  return out;
}

/** Give every texel with too little alpha to hold a colour the colour of the nearest texel that has one (two chamfer sweeps). */
function bleed(px, w, h) {
  const INF = 1e9;
  const dist = new Float64Array(w * h).fill(INF);
  const from = new Int32Array(w * h).fill(-1);
  for (let p = 0; p < w * h; p++) if (px[p * 4 + 3] >= COLOUR_ALPHA) { dist[p] = 0; from[p] = p; }
  const relax = (p, q, d) => { if (dist[q] + d < dist[p]) { dist[p] = dist[q] + d; from[p] = from[q]; } };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x;
    if (x > 0) relax(p, p - 1, 1);
    if (y > 0) { relax(p, p - w, 1); if (x > 0) relax(p, p - w - 1, 1.414); if (x < w - 1) relax(p, p - w + 1, 1.414); }
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const p = y * w + x;
    if (x < w - 1) relax(p, p + 1, 1);
    if (y < h - 1) { relax(p, p + w, 1); if (x < w - 1) relax(p, p + w + 1, 1.414); if (x > 0) relax(p, p + w - 1, 1.414); }
  }
  // beyond the margin a mipmap's average is all empty texels anyway: one flat colour there, the card's own mean,
  // which costs the PNG nothing (a nearest-colour fill of the whole sheet made the cliffs 25% larger than their sources)
  const mean = [0, 0, 0];
  let n = 0;
  for (let p = 0; p < w * h; p++) if (from[p] === p) { mean[0] += px[p * 4]; mean[1] += px[p * 4 + 1]; mean[2] += px[p * 4 + 2]; n++; }
  for (let p = 0; p < w * h; p++) {
    const q = from[p];
    if (q === p) continue;
    const near = q >= 0 && dist[p] <= BLEED_PX;
    for (let c = 0; c < 3; c++) px[p * 4 + c] = near ? px[q * 4 + c] : n ? mean[c] / n : 0;
  }
}

/** The shipped card for a name in CARDS: { png, stats }. Pure in the source file. */
export function buildCard(name) {
  const meta = index[name];
  if (!meta) throw new Error(`${name}: not in ${SRC}/cards.json`);
  const src = PNG.sync.read(fs.readFileSync(path.join(ROOT, SRC, `${name}.png`)));
  const k = Math.min(1, CARDS[name] / Math.max(src.width, src.height)); // never upscaled: a card is at most its source
  const w = Math.round(src.width * k), h = Math.round(src.height * k);
  const px = k === 1 ? Float64Array.from(src.data) : resize(src.data, src.width, src.height, w, h);
  const stats = { cut: meta.cut, source: `${src.width}x${src.height}`, lightened: 0, greyed: 0, inked: 0 };
  for (let p = 0; p < w * h; p++) {
    const o = p * 4;
    if (px[o + 3] >= 0.5) stats.inked++;
    if (meta.cut === 'wash') { px[o] = INK[0]; px[o + 1] = INK[1]; px[o + 2] = INK[2]; continue; }
    if (px[o + 3] < COLOUR_ALPHA) continue;
    let c = [px[o], px[o + 1], px[o + 2]];
    if (c[0] > PAPER[0] || c[1] > PAPER[1] || c[2] > PAPER[2]) { c = c.map((v, i) => Math.min(v, PAPER[i])); stats.lightened++; }
    const chroma = Math.max(...c) - Math.min(...c);
    if (chroma > RAMP_CHROMA) {
      const grey = (c[0] + c[1] + c[2]) / 3, f = RAMP_CHROMA / chroma;
      c = c.map((v) => grey + (v - grey) * f);
      stats.greyed++;
    }
    px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2];
  }
  if (meta.cut !== 'wash') bleed(px, w, h);
  const foot = FOOT[name];
  if (foot) {
    const rows = Math.round(h * foot);
    for (let y = h - rows; y < h; y++) {
      const t = (h - 1 - y) / rows, k = t * t * (3 - 2 * t); // 0 at the bottom row, 1 where the fade starts
      for (let x = 0; x < w; x++) px[(y * w + x) * 4 + 3] *= k;
    }
  }
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < px.length; i++) png.data[i] = Math.max(0, Math.min(255, Math.round(px[i])));
  return { png, stats };
}

/** The path's dry-brush card: flat ink-black, the streaks' density in alpha. Pure: no input but PATH_WASH. */
export function buildPathWash() {
  const P = PATH_WASH;
  const [w, h] = P.size;
  const hash = (ix, iy, seed) => { const x = Math.sin(ix * 127.1 + iy * 311.7 + seed * 74.7) * 43758.5453; return x - Math.floor(x); };
  /** Smooth value noise with cells of cw x ch px, repeating every w x h (the cell counts are whole). */
  const noise = (x, y, cw, ch, seed) => {
    const nx = Math.round(w / cw), ny = Math.round(h / ch);
    const fx = (x / w) * nx, fy = (y / h) * ny;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = fx - ix, ty = fy - iy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const at = (dx, dy) => hash((ix + dx) % nx, (iy + dy) % ny, seed);
    return (at(0, 0) * (1 - sx) + at(1, 0) * sx) * (1 - sy) + (at(0, 1) * (1 - sx) + at(1, 1) * sx) * sy;
  };
  const v = new Float64Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = 1 - P.bristle * hash(y, 0, P.seed + 2);
    for (let x = 0; x < w; x++) v[y * w + x] = noise(x, y, P.streak[0], P.streak[1], P.seed) * noise(x, y, P.patch[0], P.patch[1], P.seed + 1) * row;
  }
  const sorted = Float64Array.from(v).sort();
  const lo = sorted[Math.floor(P.floor * (sorted.length - 1))], hi = sorted[sorted.length - 1];
  const png = new PNG({ width: w, height: h });
  let inked = 0;
  for (let p = 0; p < w * h; p++) {
    const a = Math.max(0, (v[p] - lo) / (hi - lo)) * P.ink;
    png.data[p * 4] = INK[0]; png.data[p * 4 + 1] = INK[1]; png.data[p * 4 + 2] = INK[2]; png.data[p * 4 + 3] = Math.round(a * 255);
    if (png.data[p * 4 + 3] > 0) inked++;
  }
  return { png, stats: { cut: 'wash', source: 'authored', lightened: 0, greyed: 0, inked } };
}

/** Every card the game ships: name -> () => { png, stats }. */
export const BUILDERS = { ...Object.fromEntries(Object.keys(CARDS).map((n) => [n, () => buildCard(n)])), [PATH_WASH.out]: buildPathWash };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check'), statsOnly = process.argv.includes('--stats');
  const dir = path.join(ROOT, OUT);
  if (!check && !statsOnly) fs.mkdirSync(dir, { recursive: true });
  let bad = 0, total = 0;
  for (const [name, build] of Object.entries(BUILDERS)) {
    const { png, stats } = build();
    const file = path.join(dir, `${name}.png`);
    if (check) {
      const have = fs.existsSync(file) ? PNG.sync.read(fs.readFileSync(file)) : null;
      const same = !!have && have.width === png.width && have.height === png.height && Buffer.compare(have.data, png.data) === 0;
      console.log(`${same ? 'ok   ' : 'STALE'} ${OUT}/${name}.png`);
      if (!same) bad++;
      continue;
    }
    // pngjs's own default deflate strategy made the cliffs 18% larger than this one does
    if (!statsOnly) fs.writeFileSync(file, PNG.sync.write(png, { deflateLevel: 9, deflateStrategy: zlib.constants.Z_DEFAULT_STRATEGY, filterType: -1 }));
    const bytes = statsOnly ? 0 : fs.statSync(file).size;
    total += bytes;
    const n = png.width * png.height;
    console.log(`${statsOnly ? 'would write' : 'wrote'} ${OUT}/${name}.png  ${stats.cut.padEnd(5)} ${stats.source} -> ${png.width}x${png.height}  ${statsOnly ? '' : `${bytes} B  `}inked ${((100 * stats.inked) / n).toFixed(1)}%  lightened ${stats.lightened}  greyed ${stats.greyed}`);
  }
  if (!check && !statsOnly) console.log(`total ${total} B (ramp chroma ${RAMP_CHROMA}, paper ${PAPER.join(',')})`);
  if (bad) { console.error('painted cards are stale: run node tools/art/backdrop-cards.mjs'); process.exit(1); }
}
