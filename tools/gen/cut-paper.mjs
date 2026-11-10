#!/usr/bin/env node
// Cuts the paper out of an ink painting: a subject painted alone on plain paper becomes a PNG with
// alpha, in the palette of reference/palette.json (round 2 brief, Priority 2).
//
//   node tools/gen/cut-paper.mjs <in.png> <out.png> --cut wash|matte|open [--long 2048] [--stats out.json] [--no-trim] [--floor 2.2,5]
//
// Nothing is keyed by a threshold. The painting is read as INK LAID ON PAPER:
//   1. The paper's tone is estimated from the picture's border and fitted with a smooth surface, so
//      aged paper that is darker in one corner does not come out as a haze.
//   2. Each pixel's ink density is how far it is below that paper, on the scale from the palette's
//      paper-cream to its ink-black. Paper grain (measured on the border) is eased out at the bottom
//      of the scale, softly and on a smoothed copy, so the palest mist survives.
//   3. Two ways to write it, the two a2's own backdrop textures use (tools/art/backdrop-textures.mjs):
//        wash   one flat ink colour, the density in alpha. Over paper it reproduces the painting;
//               where there was paper there is nothing, so there is no fringe. For peaks and mist.
//        matte  a solid form: opaque inside the subject's outline, in the palette ramp colour for
//               each value, feathered into the wash at its rim. Paper the brush skipped INSIDE the
//               outline stays, as pale rock. For cliffs, which have to hide what stands behind them.
//        open   solid wherever there is real ink, and nothing where there is paper, even paper
//               enclosed by ink. For pines: the gaps between the needles stay gaps.
// Either way the output can hold no hue the palette does not have: the painting's own tint is
// measured and reported (hue drift), not carried over.
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const a = process.argv.slice(2);
const opt = (name, d) => { const i = a.indexOf(name); if (i === -1) return d; const v = a[i + 1]; a.splice(i, 2); return v; };
const has = (name) => { const i = a.indexOf(name); if (i === -1) return false; a.splice(i, 1); return true; };
const cut = opt('--cut', null);
const long = Number(opt('--long', 2048));
const statsFile = opt('--stats', null);
const noTrim = has('--no-trim');
const [src, dst] = a;
if (!src || !dst || !['wash', 'matte', 'open'].includes(cut)) { console.error('usage: cut-paper.mjs <in.png> <out.png> --cut wash|matte|open [--long 2048] [--stats out.json] [--no-trim] [--floor 2.2,5]'); process.exit(2); }

const palette = JSON.parse(readFileSync(join(ROOT, 'reference/palette.json'), 'utf8'));
const RAMP = palette.colors.map((c) => [1, 3, 5].map((i) => parseInt(c.hex.slice(i, i + 2), 16))); // lightest first
const mean3 = (c) => (c[0] + c[1] + c[2]) / 3;
const PAPER = RAMP[0], INK = RAMP[RAMP.length - 1];
const paperV = mean3(PAPER), inkV = mean3(INK);
/** The ramp colour at a value: the ramp's own steps joined by straight lines (as a2's rampAt). */
const rampAt = (v) => {
  const m = RAMP.map(mean3);
  if (v >= m[0]) return RAMP[0];
  for (let k = 1; k < RAMP.length; k++) if (v >= m[k]) { const t = (v - m[k]) / (m[k - 1] - m[k]); return RAMP[k].map((c, j) => c + (RAMP[k - 1][j] - c) * t); }
  return RAMP[RAMP.length - 1];
};
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (e0, e1, v) => { const t = clamp01((v - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

const { data: px, info } = await sharp(src).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, N = W * H;
const L = new Float32Array(N);
for (let i = 0; i < N; i++) L[i] = (px[i * 3] + px[i * 3 + 1] + px[i * 3 + 2]) / 3;

// ---- 1. the paper, from the border -------------------------------------------------------------
// Cells in a ring round the edge; each cell's tone is its upper-quartile luminance (ink in a cell
// pulls the median down before it pulls that). A quadratic surface is fitted through them, and
// cells that sit below the fit (a wash reaching the edge) are dropped and the fit repeated.
const cell = Math.max(8, Math.round(Math.max(W, H) / 64));
const cols = Math.floor(W / cell), rows = Math.floor(H / cell);
const ring = Math.max(2, Math.round(Math.min(cols, rows) * 0.07));
const samples = [];
for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
  if (!(cx < ring || cy < ring || cx >= cols - ring || cy >= rows - ring)) continue;
  const v = [], rgb = [0, 0, 0];
  for (let y = cy * cell; y < (cy + 1) * cell; y += 2) for (let x = cx * cell; x < (cx + 1) * cell; x += 2) { const i = y * W + x; v.push(L[i]); rgb[0] += px[i * 3]; rgb[1] += px[i * 3 + 1]; rgb[2] += px[i * 3 + 2]; }
  v.sort((p, q) => p - q);
  samples.push({ x: ((cx + 0.5) * cell) / W * 2 - 1, y: ((cy + 0.5) * cell) / H * 2 - 1, v: v[Math.floor(v.length * 0.75)], rgb: rgb.map((s) => s / v.length), keep: true });
}
const basis = (x, y) => [1, x, y, x * x, y * y, x * y];
const solve = (A, b) => { // Gaussian elimination, 6 unknowns
  const n = b.length, M = A.map((r, i) => r.concat([b[i]]));
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) return null;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / r[i]);
};
let coef = null, sd = 0;
for (let pass = 0; pass < 5; pass++) {
  const kept = samples.filter((s) => s.keep);
  const A = Array.from({ length: 6 }, () => new Array(6).fill(0)), b = new Array(6).fill(0);
  for (const s of kept) { const f = basis(s.x, s.y); for (let i = 0; i < 6; i++) { b[i] += f[i] * s.v; for (let j = 0; j < 6; j++) A[i][j] += f[i] * f[j]; } }
  const c = solve(A, b);
  if (!c) break;
  coef = c;
  const res = kept.map((s) => s.v - basis(s.x, s.y).reduce((t, f, i) => t + f * c[i], 0));
  sd = Math.sqrt(res.reduce((t, r) => t + r * r, 0) / res.length);
  let dropped = 0;
  for (const s of kept) { const r = s.v - basis(s.x, s.y).reduce((t, f, i) => t + f * c[i], 0); if (r < -Math.max(1.5, 1.5 * sd)) { s.keep = false; dropped++; } }
  if (!dropped) break;
}
if (!coef) { console.error('ERROR could not fit the paper: the border of the picture is not paper'); process.exit(1); }
const keptSamples = samples.filter((s) => s.keep);
const paperAt = (x, y) => { const f = basis((x + 0.5) / W * 2 - 1, (y + 0.5) / H * 2 - 1); let t = 0; for (let i = 0; i < 6; i++) t += f[i] * coef[i]; return t; };
const paperRGB = [0, 1, 2].map((k) => keptSamples.reduce((t, s) => t + s.rgb[k], 0) / keptSamples.length);

// ---- 2. ink density ----------------------------------------------------------------------------
// rel = how far below its paper a pixel is, 0..1. Paper grain is the spread of rel on the border.
const rel = new Float32Array(N);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; rel[i] = 1 - L[i] / paperAt(x, y); }
// Paper grain is fine-scale; a wash, however pale, is broad. So "is there ink here" is asked of a
// smoothed copy of rel, where the grain has averaged away, and the density itself is still read
// from the sharp pixel. That is what lets the palest mist through without letting the grain in.
const boxOf = (arr, radius) => {
  const sat = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) { let run = 0; for (let x = 0; x < W; x++) { run += arr[y * W + x]; sat[(y + 1) * (W + 1) + x + 1] = sat[y * (W + 1) + x + 1] + run; } }
  const m = new Float32Array(N);
  for (let y = 0; y < H; y++) { const ya = Math.max(0, y - radius), yb = Math.min(H, y + radius + 1); for (let x = 0; x < W; x++) { const xa = Math.max(0, x - radius), xb = Math.min(W, x + radius + 1); m[y * W + x] = (sat[yb * (W + 1) + xb] - sat[ya * (W + 1) + xb] - sat[yb * (W + 1) + xa] + sat[ya * (W + 1) + xa]) / ((yb - ya) * (xb - xa)); } }
  return m;
};
// Measured on the generated paintings: the paper's own unevenness is about 3% pixel to pixel but
// only about 1.2% across a few dozen pixels, while the palest wash bodies sit 7 to 9% below the
// paper. So the two separate at the coarse scale and not at the fine one.
const coarse = Math.max(6, Math.round(Math.max(W, H) / 130));
const fine = Math.max(1, Math.round(Math.max(W, H) / 1000));
const relCoarse = boxOf(boxOf(rel, coarse), coarse);
const relFine = boxOf(boxOf(rel, fine), fine);
// Spread of the paper on the border ring, robustly (median absolute deviation): a wash that
// reaches the side of the picture must not be counted as paper being uneven.
const spread = (arr) => {
  const v = [];
  for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
    if (!(cx < ring || cy < ring || cx >= cols - ring || cy >= rows - ring)) continue;
    for (let y = cy * cell; y < (cy + 1) * cell; y += 4) for (let x = cx * cell; x < (cx + 1) * cell; x += 4) v.push(arr[y * W + x]);
  }
  v.sort((p, q) => p - q);
  const med = v[v.length >> 1];
  const dev = v.map((x) => Math.abs(x - med)).sort((p, q) => p - q);
  return { med, sd: 1.4826 * dev[dev.length >> 1] };
};
const grain = spread(rel).sd, sc = spread(relCoarse), grainSoft = sc.sd;
// The floor, on the coarse copy: below `lo` there is no ink; by `hi` the density is the measured
// one. A soft step, so a pale wash just above the paper is thinned, never cut at a line.
const FLOOR = (opt('--floor', '2.2,5')).split(',').map(Number); // in spreads of the paper above its median
const lo = Math.max(0.008, sc.med + FLOOR[0] * grainSoft), hi = Math.max(0.025, sc.med + FLOOR[1] * grainSoft);
const scale = paperV / (paperV - inkV); // rel 1 would be black; the palette's ink-black is the densest ink there is
const dens = new Float32Array(N);       // 0..1 on the palette's scale: 1 = ink-black
for (let i = 0; i < N; i++) {
  // a broad wash opens the gate at the coarse scale; a mark that is plainly ink opens it by itself
  const gate = Math.max(smooth(lo, hi, relCoarse[i]), smooth(0.1, 0.2, relFine[i]));
  if (gate <= 0) continue;
  // in a pale wash the sharp pixel is mostly paper grain, so the lightly smoothed value is read
  // there; a dark stroke is read sharp
  const k = smooth(0.06, 0.16, relFine[i]);
  const r = relFine[i] + (rel[i] - relFine[i]) * k;
  if (r > 0) dens[i] = clamp01(r * gate * scale);
}

const boxMean = (radius) => boxOf(dens, radius);
// Stray marks, first by island. An island is everything joined together above a trace of ink.
//   * A tiny island (a fold line, a fleck, a tick) is dropped whole.
//   * A PALE island far smaller than the main form is dropped too: that is the sheet darkening
//     toward a corner, or the last scrap of a wash too faint to survive the floor, and a scrap
//     floating beside the subject reads as a mistake. An island with real ink in it (a small rock
//     off a mountain range) is kept whatever its size.
{
  const label = new Int32Array(N).fill(-1), islands = [];
  const stack = [];
  for (let s0 = 0; s0 < N; s0++) {
    if (label[s0] !== -1 || dens[s0] < 0.02) continue;
    const id = islands.length, isl = { area: 0, strong: 0 };
    label[s0] = id; stack.push(s0);
    while (stack.length) {
      const i = stack.pop(), x = i % W, y = (i - x) / W;
      isl.area++; if (dens[i] > 0.25) isl.strong++;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) if (j >= 0 && label[j] === -1 && dens[j] >= 0.02) { label[j] = id; stack.push(j); }
    }
    islands.push(isl);
  }
  const largest = islands.reduce((m, x) => Math.max(m, x.area), 0), minArea = Math.round(N * 0.00035);
  // "real ink in it": at least 3% of the island is denser than a quarter. One dark fleck in a pale
  // corner does not make the corner a rock.
  const drop = islands.map((x) => x.area < minArea || (x.strong < 0.03 * x.area && x.area < 0.12 * largest));
  for (let i = 0; i < N; i++) if (label[i] !== -1 && drop[label[i]]) dens[i] = 0;
  if (process.env.CUT_DEBUG) console.log('islands (share of largest / strong share / verdict):', islands.filter((x) => x.area >= minArea).map((x) => `${(x.area / largest).toFixed(3)}/${(x.strong / x.area).toFixed(3)}/${x.area < minArea || (x.strong < 0.03 * x.area && x.area < 0.12 * largest) ? 'drop' : 'KEEP'}`).join('  '));
}
// Then by neighbourhood: a faint speck with nothing round it is the paper (a fibre, the sheet's
// own edge), not the subject. A pale wash is faint too, but it has neighbours.
{
  const near = boxMean(Math.max(6, Math.round(Math.max(W, H) / 160)));
  const edge = Math.max(3, Math.round(Math.max(W, H) * 0.005));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (dens[i] > 0 && dens[i] < 0.5) dens[i] *= smooth(0.008, 0.03, near[i]);
    // the outermost few pixels of a generated sheet are often a darker rim
    const e = Math.min(x, y, W - 1 - x, H - 1 - y);
    if (e < edge) dens[i] *= e / edge;
  }
}

// ---- hue drift of the painting (reported, not carried) -----------------------------------------
// White-balance each inked pixel by the paper and measure how far its channels spread, against the
// spread the palette ramp itself has at that value.
let drift = 0, dn = 0, lean = [0, 0, 0];
for (let i = 0; i < N; i += 5) {
  if (dens[i] < 0.15) continue;
  const c = [0, 1, 2].map((k) => (px[i * 3 + k] / paperRGB[k]) * PAPER[k]);
  const v = mean3(c), r = rampAt(v);
  const d = c.map((x, k) => x - v - (r[k] - mean3(r)));
  drift += Math.hypot(...d); for (let k = 0; k < 3; k++) lean[k] += d[k]; dn++;
}
drift = dn ? drift / dn : 0; lean = lean.map((x) => (dn ? x / dn : 0));

// ---- 3. write ----------------------------------------------------------------------------------
const out = Buffer.alloc(N * 4);
if (cut === 'wash') {
  for (let i = 0; i < N; i++) { out[i * 4] = INK[0]; out[i * 4 + 1] = INK[1]; out[i * 4 + 2] = INK[2]; out[i * 4 + 3] = Math.round(dens[i] * 255); }
} else if (cut === 'open') {
  // Each pixel decides for itself: mid-grey and darker is solid, paler is the wash it is.
  const own = boxOf(boxOf(dens, 1), 1);
  for (let i = 0; i < N; i++) {
    const alpha = Math.max(dens[i], smooth(0.1, 0.24, own[i]));
    const v = paperV - dens[i] * (paperV - inkV);
    const c = rampAt(alpha > 0.001 ? Math.max(inkV, paperV - (paperV - v) / alpha) : inkV);
    out[i * 4] = Math.round(c[0]); out[i * 4 + 1] = Math.round(c[1]); out[i * 4 + 2] = Math.round(c[2]); out[i * 4 + 3] = Math.round(alpha * 255);
  }
} else {
  // Outside = everything reachable from the border without crossing real ink. The line is drawn
  // at real ink, not at the first trace of it: the pale paper hugging a dark outline belongs to
  // the outside, or it would be made solid and show as a light rim on anything darker than paper.
  // Everything else is the form, including paper the brush skipped inside it.
  const T = 0.12;
  const outside = new Uint8Array(N);
  const stack = [];
  const push = (i) => { if (!outside[i] && dens[i] < T) { outside[i] = 1; stack.push(i); } };
  for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
  while (stack.length) {
    const i = stack.pop(), x = i % W, y = (i - x) / W;
    if (x > 0) push(i - 1); if (x < W - 1) push(i + 1); if (y > 0) push(i - W); if (y < H - 1) push(i + W);
  }
  // distance from the outside, in pixels (two-pass chamfer), for the feathered rim
  const dist = new Float32Array(N);
  const BIG = 1e6;
  for (let i = 0; i < N; i++) dist[i] = outside[i] ? 0 : BIG;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; let d = dist[i]; if (d === 0) continue;
    if (x > 0) d = Math.min(d, dist[i - 1] + 1); if (y > 0) { d = Math.min(d, dist[i - W] + 1); if (x > 0) d = Math.min(d, dist[i - W - 1] + 1.414); if (x < W - 1) d = Math.min(d, dist[i - W + 1] + 1.414); }
    dist[i] = d;
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const i = y * W + x; let d = dist[i]; if (d === 0) continue;
    if (x < W - 1) d = Math.min(d, dist[i + 1] + 1); if (y < H - 1) { d = Math.min(d, dist[i + W] + 1); if (x < W - 1) d = Math.min(d, dist[i + W + 1] + 1.414); if (x > 0) d = Math.min(d, dist[i + W - 1] + 1.414); }
    dist[i] = d;
  }
  const feather = Math.max(4, Math.round(Math.max(W, H) / 220)); // the rim over which wash becomes solid
  // Only a part of the form that carries real ink is made solid. Where the painting thins away
  // (a cliff's foot going into mist) the local density falls, and the form stays a wash there:
  // it fades out instead of ending at a cut edge.
  const body = boxMean(feather * 3);
  for (let i = 0; i < N; i++) {
    const solid = outside[i] ? 0 : smooth(0, feather, dist[i]) * smooth(0.07, 0.22, body[i]);
    const alpha = Math.max(dens[i], solid);
    // value of the painting on the palette's scale, and the ink value that gives it at this alpha
    const v = paperV - dens[i] * (paperV - inkV);
    const c = rampAt(alpha > 0.001 ? Math.max(inkV, paperV - (paperV - v) / alpha) : inkV);
    out[i * 4] = Math.round(c[0]); out[i * 4 + 1] = Math.round(c[1]); out[i * 4 + 2] = Math.round(c[2]); out[i * 4 + 3] = Math.round(alpha * 255);
  }
}

// trim to what was painted (plus a margin), then set the long side
// The box is found on the LOCAL density, not on single pixels: one surviving fleck in a corner
// must not decide the size of the card.
let x0 = W, y0 = H, x1 = -1, y1 = -1;
{
  const near = boxMean(Math.max(6, Math.round(Math.max(W, H) / 160)));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (near[y * W + x] > 0.03 && out[(y * W + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
}
if (x1 < 0) { console.error('ERROR nothing was painted: the whole picture reads as paper'); process.exit(1); }
const pad = Math.round(Math.max(W, H) * 0.015);
const box = noTrim ? { left: 0, top: 0, width: W, height: H } : { left: Math.max(0, x0 - pad), top: Math.max(0, y0 - pad), width: 0, height: 0 };
if (!noTrim) { box.width = Math.min(W, x1 + pad + 1) - box.left; box.height = Math.min(H, y1 + pad + 1) - box.top; }
const touches = { left: x0 <= 1, right: x1 >= W - 2, top: y0 <= 1, bottom: y1 >= H - 2 };
const k = long / Math.max(box.width, box.height);
const outW = Math.round(box.width * k), outH = Math.round(box.height * k);
await sharp(out, { raw: { width: W, height: H, channels: 4 } }).extract(box).resize(outW, outH, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toFile(dst);

let covered = 0, opaque = 0, darkest = 0;
for (let i = 0; i < N; i++) { const al = out[i * 4 + 3]; if (al > 8) covered++; if (al > 247) opaque++; if (dens[i] > darkest) darkest = dens[i]; }
const boxN = box.width * box.height;
const stats = {
  source: `${W}x${H}`, out: `${outW}x${outH}`, cut, scale: +k.toFixed(3),
  paper_source: '#' + paperRGB.map((v) => Math.round(v).toString(16).padStart(2, '0')).join(''),
  paper_unevenness: +sd.toFixed(2), grain: +grain.toFixed(4), grain_coarse: +grainSoft.toFixed(4), floor: [+lo.toFixed(3), +hi.toFixed(3)],
  inked_share: +(covered / boxN).toFixed(3), opaque_share: +(opaque / boxN).toFixed(3), densest: +darkest.toFixed(2),
  hue_drift: +drift.toFixed(1), hue_lean_rgb: lean.map((x) => +x.toFixed(1)),
  touches_edge: Object.entries(touches).filter(([, v]) => v).map(([n]) => n),
};
if (statsFile) writeFileSync(statsFile, JSON.stringify(stats, null, 1) + '\n');
console.log(`${dst}  ${stats.source} -> ${stats.out} (${cut}, x${stats.scale})  paper ${stats.paper_source} uneven ${stats.paper_unevenness}  grain ${stats.grain} (coarse ${stats.grain_coarse}) floor ${stats.floor.join('..')}  inked ${(stats.inked_share * 100).toFixed(0)}% opaque ${(stats.opaque_share * 100).toFixed(0)}% densest ${stats.densest}  hue drift ${stats.hue_drift} (rgb lean ${stats.hue_lean_rgb.join(' ')})${stats.touches_edge.length ? '  TOUCHES ' + stats.touches_edge.join(',') : ''}`);
