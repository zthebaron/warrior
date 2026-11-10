#!/usr/bin/env node
// Raw fal download -> the GLB that ships in assets/hero/.
//
//   node tools/gen/process.mjs <raw.glb> <out.glb> [--match <input.png>] [--elev 0] [--tint <hex> [--pin-median]] [--stats <file.json>]
//
// 1. weld, then simplify to at most MAX_TRIS triangles (the error bound is raised until it gets there)
// 2. textures resized to at most MAX_TEX px
// 3. --match: the base colour is tone-matched back to the input painting. Hunyuan's texture
//    comes out "de-lit": mid washes lifted toward white. The match renders the model unlit from
//    the input's viewpoint, builds a monotonic lightness curve (one for cool pixels, one for
//    warm) that carries the render's histogram onto the painting's, and scales each texel by it,
//    so hue is kept. It moves tones; it cannot repaint, so a patch the generator left blank
//    stays a (darker) blank patch.
// 4. normalised: +Y up, base sitting on y = 0, centred on x and z, exactly 1.0 unit tall.
//    The facing is left as generated (front toward +Z).
//
// The two limits are the ones in 00-start-here/PROMPT-ART-GEN.md ("at most 30k triangles and
// 1024 px textures"); they are an output spec for this tool, not a game budget.
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, dedup, prune, textureCompress, clearNodeTransform, flatten } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { spawnSync } from 'node:child_process';
import { writeFileSync, statSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_TRIS = 30000;
const MAX_TEX = 1024;
const HERE = dirname(fileURLToPath(import.meta.url));
const a = process.argv.slice(2);
const opt = (name, d) => { const i = a.indexOf(name); if (i === -1) return d; const v = a[i + 1]; a.splice(i, 2); return v; };
const match = opt('--match', null);
const elev = opt('--elev', '0');
const statsFile = opt('--stats', null);
const tint = opt('--tint', null);
const pinMedian = (() => { const i = a.indexOf('--pin-median'); if (i === -1) return false; a.splice(i, 1); return true; })();
const [src, dst] = a;
if (!src || !dst) { console.error('usage: process.mjs <raw.glb> <out.glb> [--match <input.png>] [--elev 0] [--stats <file.json>]'); process.exit(2); }

await MeshoptSimplifier.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const triCount = (doc) => doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).reduce((n, p) => n + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0);
const texSizes = (doc) => doc.getRoot().listTextures().map((t) => t.getSize()?.join('x'));

// ---- 1. geometry ---------------------------------------------------------------------------------
let doc = await io.read(src);
const before = { triangles: triCount(doc), textures: texSizes(doc), bytes: statSync(src).size };
let usedError = null;
if (before.triangles > MAX_TRIS) {
  for (const error of [0.001, 0.003, 0.01, 0.03, 0.1, 1]) {
    doc = await io.read(src);
    await doc.transform(dedup(), weld(), simplify({ simplifier: MeshoptSimplifier, ratio: (MAX_TRIS * 0.98) / before.triangles, error, lockBorder: false }), prune());
    usedError = error;
    if (triCount(doc) <= MAX_TRIS) break;
  }
} else {
  await doc.transform(dedup(), weld(), prune());
}
const tris = triCount(doc);
if (tris > MAX_TRIS) { console.error(`ERROR could not get under ${MAX_TRIS} triangles (stuck at ${tris})`); process.exit(1); }

// ---- 2. textures ---------------------------------------------------------------------------------
await doc.transform(
  textureCompress({ encoder: sharp, resize: [MAX_TEX, MAX_TEX], slots: /^baseColor/ }),
  textureCompress({ encoder: sharp, resize: [MAX_TEX, MAX_TEX], targetFormat: 'jpeg', quality: 90, slots: /^(normal|metallicRoughness|occlusion)/ }),
);

// ---- 4 (before 3, so the match render sees the final geometry). normalise ---------------------------
await doc.transform(flatten());
for (const node of doc.getRoot().listNodes()) if (node.getMesh()) clearNodeTransform(node);
const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
const b = getBounds(scene);
const height = b.max[1] - b.min[1];
const off = [-(b.min[0] + b.max[0]) / 2, -b.min[1], -(b.min[2] + b.max[2]) / 2];
const done = new Set();
for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) {
  const pos = p.getAttribute('POSITION');
  if (done.has(pos)) continue;
  done.add(pos);
  const arr = pos.getArray();
  for (let i = 0; i < arr.length; i += 3) for (let k = 0; k < 3; k++) arr[i + k] = (arr[i + k] + off[k]) / height;
  pos.setArray(arr);
}

// ---- 3. tone match ---------------------------------------------------------------------------------
let matchInfo = null;
if (match) {
  const tmp = mkdtempSync(join(tmpdir(), 'hero-match-'));
  const pre = join(tmp, 'pre.glb'), shot = join(tmp, 'shot.png');
  await io.write(pre, doc);
  const KEY = [255, 0, 255];
  const r = spawnSync(process.execPath, [join(HERE, 'render-glb.mjs'), pre, shot, '--views', '0', '--modes', 'unlit', '--size', '768', '--elev', elev, '--bg', '#ff00ff'], { encoding: 'utf8' });
  if (r.status !== 0) { console.error('ERROR match render failed: ' + r.stderr); process.exit(1); }

  // histogram of the model as rendered: everything that is not the key colour
  // Two classes, cool (index 0) and warm (index 1), split softly on red minus blue. One global
  // curve cannot work: Hunyuan lifts the blue-grey robe to the same lightness as the straw hat,
  // and in the painting the robe is far darker than the hat. Hue tells them apart.
  const lum = (r, g, b) => Math.min(255, Math.round(0.299 * r + 0.587 * g + 0.114 * b));
  // The split sits above neutral on purpose: Hunyuan's blank near-white patches are faintly warm,
  // and they must fall in with the greys (cool), not with the straw, skin and gourds (warm).
  const warm = (r, b) => { const t = Math.min(1, Math.max(0, (r - b - 14) / 20)); return t * t * (3 - 2 * t); };
  const hist = () => [new Float64Array(256), new Float64Array(256)];
  const hr = hist(), hp = hist();
  const add = (h, r, g, b) => { const w = warm(r, b), L = lum(r, g, b); h[0][L] += 1 - w; h[1][L] += w; };
  let nr = 0, np = 0;
  {
    const { data, info } = await sharp(shot).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < info.width * info.height; i++) {
      const px = [data[i * 3], data[i * 3 + 1], data[i * 3 + 2]];
      if (Math.abs(px[0] - KEY[0]) + Math.abs(px[1] - KEY[1]) + Math.abs(px[2] - KEY[2]) < 120) continue;
      if (px[0] > 200 && px[2] > 200 && px[1] < 120) continue; // antialiased key fringe
      add(hr, px[0], px[1], px[2]);
      nr++;
    }
  }
  // histogram of the painting's subject: flood the paper in from the border, keep the rest
  {
    const { data, info } = await sharp(match).removeAlpha().resize({ width: 768 }).raw().toBuffer({ resolveWithObject: true });
    const W = info.width, H = info.height;
    const at = (x, y) => (y * W + x) * 3;
    const border = [];
    for (let x = 0; x < W; x++) border.push(at(x, 0), at(x, H - 1));
    for (let y = 0; y < H; y++) border.push(at(0, y), at(W - 1, y));
    const med = [0, 1, 2].map((c) => border.map((i) => data[i + c]).sort((p, q) => p - q)[border.length >> 1]);
    const isPaper = (i) => Math.abs(data[i] - med[0]) + Math.abs(data[i + 1] - med[1]) + Math.abs(data[i + 2] - med[2]) < 60;
    const bg = new Uint8Array(W * H);
    const stack = [];
    for (const i of border) if (isPaper(i) && !bg[i / 3]) { bg[i / 3] = 1; stack.push(i / 3); }
    while (stack.length) {
      const p = stack.pop(), x = p % W, y = (p - x) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const q = ny * W + nx;
        if (!bg[q] && isPaper(q * 3)) { bg[q] = 1; stack.push(q); }
      }
    }
    for (let p = 0; p < W * H; p++) { if (bg[p]) continue; add(hp, data[p * 3], data[p * 3 + 1], data[p * 3 + 2]); np++; }
  }
  // one monotonic lightness curve per class: render CDF -> painting CDF
  const cdf = (h) => { const o = new Float64Array(256); let s = 0; for (let i = 0; i < 256; i++) { s += h[i]; o[i] = s; } for (let i = 0; i < 256; i++) o[i] /= s || 1; return o; };
  const mass = (h) => h.reduce((s, v) => s + v, 0);
  const luts = [0, 1].map((c) => {
    // a class that is nearly absent on either side has no curve worth trusting: leave it alone
    if (mass(hr[c]) < 0.01 * nr || mass(hp[c]) < 0.01 * np) return Uint8Array.from({ length: 256 }, (_, i) => i);
    const cr = cdf(hr[c]), cp = cdf(hp[c]);
    const raw = new Float64Array(256);
    let j = 0;
    for (let i = 0; i < 256; i++) { while (j < 255 && cp[j] < cr[i]) j++; raw[i] = j; }
    const lut = new Uint8Array(256);
    for (let i = 0; i < 256; i++) { let s = 0, n = 0; for (let k = -6; k <= 6; k++) { const q = i + k; if (q >= 0 && q < 256) { s += raw[q]; n++; } } lut[i] = Math.round(s / n); }
    for (let i = 1; i < 256; i++) if (lut[i] < lut[i - 1]) lut[i] = lut[i - 1];
    return lut;
  });
  for (const mat of doc.getRoot().listMaterials()) {
    const tex = mat.getBaseColorTexture();
    if (!tex || tex.__matched) continue;
    tex.__matched = true;
    const { data, info } = await sharp(tex.getImage()).raw().toBuffer({ resolveWithObject: true });
    const ch = info.channels;
    for (let i = 0; i < data.length; i += ch) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const L = lum(r, g, b), w = warm(r, b);
      const k = ((1 - w) * luts[0][L] + w * luts[1][L]) / Math.max(L, 1); // scale, so hue is kept
      data[i] = Math.min(255, Math.round(r * k)); data[i + 1] = Math.min(255, Math.round(g * k)); data[i + 2] = Math.min(255, Math.round(b * k));
    }
    tex.setImage(await sharp(data, { raw: info }).png().toBuffer()).setMimeType('image/png');
  }
  const mid = (lut) => [64, 128, 192, 240].map((v) => lut[v]);
  matchInfo = { input: match, renderPx: nr, paintingPx: np, lightness_curve_at_64_128_192_240: { cool: mid(luts[0]), warm: mid(luts[1]) } };
}

// ---- 3b. tint --------------------------------------------------------------------------------------
// --tint <hex>: throw the hue away and rebuild every texel as that colour scaled by the texel's
// lightness, so the texture is a single-hue ramp through the given palette colour. Used to put
// stone and pine on the STYLE-BIBLE warm-grey ramp (the generator drifts to tan and olive) and
// the torii on the authored accent. --pin-median additionally slides the lightness so the
// texture's median lands exactly on the tint: for a subject that is one flat colour.
if (tint) {
  const T = [0, 2, 4].map((i) => parseInt(tint.replace('#', '').slice(i, i + 2), 16));
  const lumT = 0.299 * T[0] + 0.587 * T[1] + 0.114 * T[2];
  const seen = new Set();
  for (const mat of doc.getRoot().listMaterials()) {
    const tex = mat.getBaseColorTexture();
    if (!tex || seen.has(tex)) continue;
    seen.add(tex);
    const { data, info } = await sharp(tex.getImage()).raw().toBuffer({ resolveWithObject: true });
    const ch = info.channels, n = data.length / ch;
    const L = new Float32Array(n);
    for (let i = 0; i < n; i++) L[i] = 0.299 * data[i * ch] + 0.587 * data[i * ch + 1] + 0.114 * data[i * ch + 2];
    let k = 1 / lumT;
    if (pinMedian) { const sorted = Float32Array.from(L).sort(); k = 1 / Math.max(sorted[n >> 1], 1); }
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) data[i * ch + c] = Math.min(255, Math.round(T[c] * L[i] * k));
    tex.setImage(await sharp(data, { raw: info }).png().toBuffer()).setMimeType('image/png');
  }
}

await io.write(dst, doc);
const nb =getBounds(doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0]);
const stats = {
  out: dst, bytes: statSync(dst).size,
  triangles_before: before.triangles, triangles_after: tris, simplify_error: usedError,
  textures_before: before.textures, textures_after: texSizes(doc), raw_bytes: before.bytes,
  raw_height: +height.toFixed(4),
  size: nb.max.map((v, i) => +(v - nb.min[i]).toFixed(3)), min: nb.min.map((v) => +v.toFixed(3)), max: nb.max.map((v) => +v.toFixed(3)),
  match: matchInfo, tint: tint ? { hex: tint, pin_median: pinMedian } : null,
};
if (statsFile) writeFileSync(statsFile, JSON.stringify(stats, null, 1) + '\n');
console.log(`${dst}: ${before.triangles.toLocaleString()} -> ${tris.toLocaleString()} tris (error ${usedError}), textures ${before.textures.join(',')} -> ${stats.textures_after.join(',')}, ${(before.bytes / 1e6).toFixed(1)} MB -> ${(stats.bytes / 1e6).toFixed(2)} MB, size ${stats.size.join(' x ')}${matchInfo ? ', tone-matched' : ''}`);
