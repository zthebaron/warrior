#!/usr/bin/env node
// Free, local fix for the two things wrong with the warrior's base-colour texture (round 2 brief,
// Priority 1): the face under the hat is a blank pale patch and the hands are near-white.
//
//   node tools/gen/paint-warrior.mjs --weights <rigged.glb> --apply <a.glb> [<b.glb> ...] [--png out.png] [--debug]
//
// The atlas is several hundred small islands, so nothing can be found by looking at the texture.
// Instead every triangle of the rigged mesh is rasterised into UV space carrying its rest-pose
// position, its normal and its skin weights, and a texel is painted by WHERE IT IS ON THE BODY:
//   face   weighted to the head joints, under the hat brim, in front of the skull, and pale
//   hands  weighted to a hand joint, and pale (the dark forearm wraps stop at the wrist)
// The face is re-toned, not redrawn: skin in the brim's shadow, with the generator's own faint
// eyes, brows, nose and mouth deepened so they survive at game size.
// The unpainted texture is always read from the --weights file, which is never written, so the
// tool is idempotent: --apply targets may hold either the unpainted or the painted texture.
//
// No colour here is a game constant: these are paint values in an asset, like the tints in finish.sh.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const a = process.argv.slice(2);
const opt = (name) => { const i = a.indexOf(name); if (i === -1) return null; const v = a[i + 1]; a.splice(i, 2); return v; };
const has = (name) => { const i = a.indexOf(name); if (i === -1) return false; a.splice(i, 1); return true; };
const weightsFile = opt('--weights');
const pngOut = opt('--png');
const debug = has('--debug');
const ai = a.indexOf('--apply');
const targets = ai === -1 ? [] : a.slice(ai + 1);
if (!weightsFile) { console.error('usage: paint-warrior.mjs --weights <rigged.glb> --apply <a.glb> ... [--png out.png] [--debug]'); process.exit(2); }

// ---- paint values ------------------------------------------------------------------------------
const SKIN = [186, 156, 126];        // warm tan, between the seed's gourds and its paper
const SKIN_SHADE = [112, 95, 80];    // the same skin in the hat's shadow
const INK = [34, 31, 29];            // what a drawn line deepens toward: the dark of the hair already in the texture
const HEAD_JOINTS = ['Head', 'head_end', 'headfront'];
const HAND_JOINTS = ['LeftHand', 'RightHand'];

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(weightsFile);
const root = doc.getRoot();
const skin = root.listSkins()[0];
if (!skin) { console.error(`ERROR ${weightsFile} has no skin`); process.exit(1); }
const joints = skin.listJoints();
const jointIndex = (names) => names.map((n) => { const i = joints.findIndex((j) => j.getName() === n); if (i === -1) { console.error(`ERROR joint "${n}" is not in the rig`); process.exit(1); } return i; });
const headIdx = new Set(jointIndex(HEAD_JOINTS)), handIdx = new Set(jointIndex(HAND_JOINTS));
const worldOf = (name) => { const m = joints.find((j) => j.getName() === name).getWorldMatrix(); return [m[12], m[13], m[14]]; };
const head = worldOf('Head'), headEnd = worldOf('head_end');

const prim = root.listMeshes()[0].listPrimitives()[0];
const P = prim.getAttribute('POSITION').getArray(), N = prim.getAttribute('NORMAL').getArray();
const UV = prim.getAttribute('TEXCOORD_0').getArray();
const J = prim.getAttribute('JOINTS_0').getArray(), Wt = prim.getAttribute('WEIGHTS_0').getArray();
const idx = prim.getIndices().getArray();
const nv = P.length / 3;
const wHead = new Float32Array(nv), wHand = new Float32Array(nv);
for (let v = 0; v < nv; v++) {
  let sum = 0, h = 0, k = 0;
  for (let c = 0; c < 4; c++) { const w = Wt[v * 4 + c]; sum += w; if (headIdx.has(J[v * 4 + c])) h += w; if (handIdx.has(J[v * 4 + c])) k += w; }
  wHead[v] = sum ? h / sum : 0; wHand[v] = sum ? k / sum : 0;
}

const texture = root.listTextures()[0];
const srcPng = Buffer.from(texture.getImage());
const { data: px, info } = await sharp(srcPng).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height;

// ---- rasterise the mesh into UV space ----------------------------------------------------------
// Per texel: position (3), normal (3), head weight, hand weight; cover = 1 where a triangle lands.
const tex = new Float32Array(W * H * 8);
const cover = new Uint8Array(W * H);
for (let t = 0; t < idx.length; t += 3) {
  const v = [idx[t], idx[t + 1], idx[t + 2]];
  const x = v.map((i) => UV[i * 2] * W - 0.5), y = v.map((i) => UV[i * 2 + 1] * H - 0.5);
  const area = (x[1] - x[0]) * (y[2] - y[0]) - (x[2] - x[0]) * (y[1] - y[0]);
  if (Math.abs(area) < 1e-9) continue;
  const x0 = Math.max(0, Math.floor(Math.min(...x)) - 1), x1 = Math.min(W - 1, Math.ceil(Math.max(...x)) + 1);
  const y0 = Math.max(0, Math.floor(Math.min(...y)) - 1), y1 = Math.min(H - 1, Math.ceil(Math.max(...y)) + 1);
  for (let py = y0; py <= y1; py++) for (let pxl = x0; pxl <= x1; pxl++) {
    const b0 = ((x[1] - pxl) * (y[2] - py) - (x[2] - pxl) * (y[1] - py)) / area;
    const b1 = ((x[2] - pxl) * (y[0] - py) - (x[0] - pxl) * (y[2] - py)) / area;
    const b2 = 1 - b0 - b1;
    const inside = b0 >= 0 && b1 >= 0 && b2 >= 0;
    // one texel of bleed past each edge, so bilinear filtering at an island's rim reads paint too
    const near = b0 >= -0.6 && b1 >= -0.6 && b2 >= -0.6;
    const o = py * W + pxl;
    if (!inside && (!near || cover[o])) continue;
    if (!inside && cover[o] === 0) cover[o] = 2; else cover[o] = 1;
    const b = [b0, b1, b2];
    const out = o * 8;
    for (let k = 0; k < 3; k++) {
      tex[out + k] = b[0] * P[v[0] * 3 + k] + b[1] * P[v[1] * 3 + k] + b[2] * P[v[2] * 3 + k];
      tex[out + 3 + k] = b[0] * N[v[0] * 3 + k] + b[1] * N[v[1] * 3 + k] + b[2] * N[v[2] * 3 + k];
    }
    tex[out + 6] = b[0] * wHead[v[0]] + b[1] * wHead[v[1]] + b[2] * wHead[v[2]];
    tex[out + 7] = b[0] * wHand[v[0]] + b[1] * wHand[v[1]] + b[2] * wHand[v[2]];
  }
}

// ---- classify and paint ------------------------------------------------------------------------
const lumOf = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const satOf = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx; };
const mix = (c0, c1, t) => c0.map((v, k) => v + (c1[k] - v) * t);
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (e0, e1, v) => { const t = clamp01((v - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

// The face is the pale skin in front of the head joint and under the brim. Measured on this mesh
// with --debug, in the rig's own units (the figure is 1.7 tall): the head joint sits at the back
// of the skull, so the face is centred a little forward of it; the brim starts near y 1.56 and
// the collar near y 1.41.
const FACE = { yMin: head[1] - 0.022, yMax: 1.578, zFwd: 0.05, rMax: 0.112, rBrow: 0.135, browY: 1.522, brimY: 1.535 };
const out = Buffer.from(px);
const stats = { face: 0, hand: 0 };
const acc = { faceY: [], faceR: [], faceX: [], faceZ: [], faceL: [], handL: [] };
const faceTexels = [], handTexels = [];
for (let o = 0; o < W * H; o++) {
  if (!cover[o]) continue;
  const t = o * 8, r = px[o * 3], g = px[o * 3 + 1], b = px[o * 3 + 2];
  const L = lumOf(r, g, b), S = satOf(r, g, b);
  const x = tex[t] - head[0], y = tex[t + 1], z = tex[t + 2] - head[2];
  const rad = Math.hypot(x, z - FACE.zFwd);
  // Hair and wraps are dark; faint drawn features inside the face are darker than the skin around
  // them but lighter than hair, so the luminance floor is low.
  // The upper face is a warmer cream than the chin, as saturated as the hat, so the hat is told
  // apart by geometry: it is farther from the skull's centre, and at brim height its underside
  // faces down (lower on the face a downward normal is only the underside of the nose or lip).
  if (tex[t + 6] > 0.5 && L > 0.34 && S < 0.36 && y > FACE.yMin && y < FACE.yMax && rad < (y < FACE.brimY ? FACE.rMax : FACE.rBrow) && z > -0.02 && (y < FACE.brimY || tex[t + 4] > -0.35)) {
    faceTexels.push(o); acc.faceY.push(y); acc.faceR.push(rad); acc.faceX.push(x); acc.faceZ.push(z); acc.faceL.push(L);
  } else if (tex[t + 7] > 0.5 && L > 0.45 && S < 0.2) {
    handTexels.push(o); acc.handL.push(L);
  }
}
const median = (arr) => { const s = Float32Array.from(arr).sort(); return s.length ? s[s.length >> 1] : 1; };
const faceRef = median(acc.faceL), handRef = median(acc.handL);
stats.face = faceTexels.length; stats.hand = handTexels.length;
for (const o of faceTexels) {
  if (debug) { out[o * 3] = 255; out[o * 3 + 1] = 0; out[o * 3 + 2] = 255; continue; }
  const L = lumOf(px[o * 3], px[o * 3 + 1], px[o * 3 + 2]), y = tex[o * 8 + 1];
  // Shadow from the brim: deep across the brow and eyes, easing to open skin at the chin.
  const shade = smooth(FACE.browY - 0.07, FACE.browY - 0.005, y);
  const base = mix(SKIN, SKIN_SHADE, shade);
  // The generator did draw eyes, brows, nose and mouth, but so faintly that they wash out to a
  // blank patch. Keep them and deepen them: a texel darker than the face's median goes much darker.
  const rel = clamp01(L / faceRef);
  const k = Math.min(1.05, Math.pow(rel, 5.0));
  const c = mix(INK, base, k);
  for (let j = 0; j < 3; j++) out[o * 3 + j] = Math.round(Math.max(0, Math.min(255, c[j])));
}
for (const o of handTexels) {
  if (debug) { out[o * 3] = 0; out[o * 3 + 1] = 255; out[o * 3 + 2] = 0; continue; }
  const L = lumOf(px[o * 3], px[o * 3 + 1], px[o * 3 + 2]);
  // keep the drawn finger lines the same way
  const k = Math.min(1.04, Math.pow(clamp01(L / handRef), 2.0));
  const c = mix(INK, SKIN, k);
  for (let j = 0; j < 3; j++) out[o * 3 + j] = Math.round(Math.max(0, Math.min(255, c[j])));
}
if (debug) {
  const q = (arr, p) => { const s = Float32Array.from(arr).sort(); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(4) : 'n/a'; };
  console.log(`head joint y ${head[1].toFixed(4)}, head_end y ${headEnd[1].toFixed(4)}`);
  console.log(`median luminance: face ${faceRef.toFixed(3)}, hands ${handRef.toFixed(3)}`);
  for (const k of ['faceY', 'faceR', 'faceX', 'faceZ']) console.log(k, 'p01', q(acc[k], 0.01), 'p10', q(acc[k], 0.1), 'p50', q(acc[k], 0.5), 'p90', q(acc[k], 0.9), 'p99', q(acc[k], 0.99));
}
console.log(`texels: face ${stats.face}, hands ${stats.hand} of ${W}x${H}`);
if (!stats.face || !stats.hand) { console.error('ERROR found no face or no hand texels; the mesh or its weights are not what this tool was written for'); process.exit(1); }

const painted = await sharp(out, { raw: { width: W, height: H, channels: 3 } }).png({ compressionLevel: 9 }).toBuffer();
if (pngOut) writeFileSync(pngOut, painted);

for (const f of targets) {
  const d = await io.read(f);
  const texs = d.getRoot().listTextures();
  if (texs.length !== 1) { console.error(`ERROR ${f}: expected one texture, found ${texs.length}`); process.exit(1); }
  const cur = Buffer.from(texs[0].getImage());
  const m = await sharp(cur).metadata();
  if (m.width !== W || m.height !== H) { console.error(`ERROR ${f}: texture is ${m.width}x${m.height}, the weights file's is ${W}x${H}`); process.exit(1); }
  // Same atlas? Compare decoded pixels with the unpainted source outside the painted texels.
  const { data: curPx } = await sharp(cur).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let differ = 0, checked = 0;
  for (let o = 0; o < W * H; o += 7) {
    if (out[o * 3] !== px[o * 3] || out[o * 3 + 1] !== px[o * 3 + 1] || out[o * 3 + 2] !== px[o * 3 + 2]) continue; // a painted texel
    checked++;
    if (Math.abs(curPx[o * 3] - px[o * 3]) + Math.abs(curPx[o * 3 + 1] - px[o * 3 + 1]) + Math.abs(curPx[o * 3 + 2] - px[o * 3 + 2]) > 6) differ++;
  }
  if (differ / checked > 0.002) { console.error(`ERROR ${f}: its texture is not the atlas in ${weightsFile} (${differ} of ${checked} sampled texels differ); painting it would land on the wrong places`); process.exit(1); }
  texs[0].setImage(painted).setMimeType('image/png');
  await io.write(f, d);
  console.log(`painted ${f}`);
}
