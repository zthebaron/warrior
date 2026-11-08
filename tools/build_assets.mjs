#!/usr/bin/env node
// tools/build_assets.mjs — the asset pipeline (H4). `npm run assets`.
//
//   1. blender   every tools/blender/<name>.py, headless, in sorted order -> assets/src/<name>.glb
//                (uncompressed; each script fails itself if over its triangle budget)
//   2. resize    gltf-transform: textures down to TEXTURE_MAX_SIZE        -> assets/build/<name>.1-resize.glb
//   3. ktx2      Basis Universal ETC1S (wasm, from npm — no system ktx)    -> assets/build/<name>.2-ktx2.glb
//   4. draco     KHR_draco_mesh_compression, LAST: it is lossy/irreversible -> assets/dist/<name>.glb
//   5. manifest  assets/src/primitives.json + every mesh asset             -> assets/dist/manifest.json
//
// Each stage is a separate read -> transform -> write, so every intermediate can be opened and
// inspected. Fails (exit 1) on: a script that fails, a missing/misnamed output, a texture that did
// not become KTX2, a mesh that did not get Draco, exported triangles != one repeat unit (an applied
// Array modifier), a non-trimesh collider, or assets/dist over DIST_BUDGET_BYTES.
//
// Deterministic: same inputs -> byte-identical assets/src, assets/dist and manifest (no timestamps,
// sorted assets, fixed encoder settings). `rm -rf assets/dist && npm run assets` regenerates it.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { draco, getBounds, textureCompress } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';
import { ktx2 } from 'ktx2-encoder/gltf-transform';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BLENDER_DIR = join(ROOT, 'tools/blender');
const SRC = join(ROOT, 'assets/src');
const BUILD = join(ROOT, 'assets/build');
const DIST = join(ROOT, 'assets/dist');
const PRIMITIVES = join(SRC, 'primitives.json');

const BLENDER = process.env.BLENDER ?? (existsSync('/opt/homebrew/bin/blender') ? '/opt/homebrew/bin/blender' : 'blender');
const DIST_BUDGET_BYTES = 256 * 1024; // whole assets/dist/, manifest included
const TEXTURE_MAX_SIZE = 256;
const NAME_RE = /^[a-z0-9]+(?:_[a-z0-9]+)*$/; // lower_snake_case, same as level.schema.json assetRef
const ALLOWED_COLLIDERS = new Set(['trimesh', 'none']); // no box: the capsule sinks (MEASUREMENTS.md)

// Encoder settings are fixed constants: they are part of the output's identity.
const KTX2_OPTIONS = {
  isUASTC: false, // ETC1S: small; fine for albedo
  qualityLevel: 128,
  compressionLevel: 2,
  generateMipmap: true,
  isPerceptual: true,
  isSetKTX2SRGBTransferFunc: true, // base colour is sRGB
  needSupercompression: false,
  enableDebug: false,
};
const DRACO_OPTIONS = { method: 'edgebreaker', encodeSpeed: 5, decodeSpeed: 5, quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 };

const t0 = Date.now();
const die = (msg) => {
  console.error(`\nASSETS FAIL: ${msg}`);
  process.exit(1);
};
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 12);
const round = (n) => Math.round(n * 1e6) / 1e6;
const rel = (p) => relative(ROOT, p);

// ---------- 1. blender ----------
const scripts = readdirSync(BLENDER_DIR).filter((f) => f.endsWith('.py')).sort();
if (!scripts.length) die(`no scripts in ${rel(BLENDER_DIR)}`);
const v = spawnSync(BLENDER, ['--version'], { encoding: 'utf8' });
if (v.status !== 0) die(`blender not runnable at "${BLENDER}" (set BLENDER=/path/to/blender): ${v.error?.message ?? v.stderr}`);
console.log(`asset pipeline — ${v.stdout.split('\n')[0]}, ${scripts.length} script(s)\n`);

rmSync(BUILD, { recursive: true, force: true });
rmSync(DIST, { recursive: true, force: true });
mkdirSync(BUILD, { recursive: true });
mkdirSync(DIST, { recursive: true });
mkdirSync(SRC, { recursive: true });

const names = [];
const blenderTris = new Map();
for (const s of scripts) {
  const name = s.replace(/\.py$/, '');
  if (!NAME_RE.test(name)) die(`tools/blender/${s}: asset name "${name}" is not lower_snake_case`);
  const out = join(SRC, `${name}.glb`);
  rmSync(out, { force: true });
  const r = spawnSync(BLENDER, ['--background', '--factory-startup', '--python-exit-code', '1', '--python', join(BLENDER_DIR, s)], { encoding: 'utf8' });
  const lines = `${r.stdout}\n${r.stderr}`.split('\n');
  for (const l of lines) if (/^(ASSET|FAIL) /.test(l)) console.log(`  blender  ${l}`);
  if (r.status !== 0) {
    console.error(lines.filter((l) => /Error|Traceback|FAIL|^\s+File /.test(l)).join('\n'));
    die(`tools/blender/${s} exited ${r.status}`);
  }
  if (!existsSync(out)) die(`tools/blender/${s} exited 0 but wrote no ${rel(out)} (script and asset must share a name)`);
  const m = lines.map((l) => l.match(new RegExp(`^ASSET ${name}\\s+triangles=(\\d+)`))).find(Boolean);
  if (!m) die(`tools/blender/${s} did not print "ASSET ${name} triangles=<n> ..."`);
  blenderTris.set(name, Number(m[1]));
  names.push(name);
}

// ---------- 2-4. gltf-transform stages ----------
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
});
const imageDecoder = async (buf) => {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
};

function triangles(doc) {
  let n = 0;
  for (const mesh of doc.getRoot().listMeshes())
    for (const p of mesh.listPrimitives()) {
      if (p.getMode() !== 4) die(`${mesh.getName()}: primitive mode ${p.getMode()} is not TRIANGLES`);
      n += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
    }
  return n;
}

async function stage(label, inPath, outPath, transforms, check) {
  const doc = await io.read(inPath);
  await doc.transform(...transforms);
  check?.(doc);
  await io.write(outPath, doc);
  return { label, path: outPath, bytes: statSync(outPath).size };
}

const meshAssets = [];
for (const name of names) {
  const src = join(SRC, `${name}.glb`);
  const srcDoc = await io.read(src);
  const nodes = srcDoc.getRoot().listNodes().filter((n) => n.getMesh());
  if (nodes.length !== 1) die(`${name}: expected exactly 1 mesh node (one repeat unit), found ${nodes.length}`);
  const node = nodes[0];
  if (node.getName() !== name) die(`${name}: mesh node is named "${node.getName()}" — glTF names must match the asset name`);
  const t = node.getTranslation(), q = node.getRotation(), sc = node.getScale();
  if (t.some((x) => x !== 0) || q[0] || q[1] || q[2] || q[3] !== 1 || sc.some((x) => x !== 1))
    die(`${name}: mesh node must have an identity transform (the loader instances raw geometry)`);
  const extras = node.getExtras();
  const repeat = Number(extras.repeat_count ?? 1);
  const step = extras.repeat_step ?? [0, 0, 0];
  if (!Number.isInteger(repeat) || repeat < 1 || !Array.isArray(step) || step.length !== 3) die(`${name}: bad repeat_count/repeat_step extras`);
  const collider = String(extras.collider ?? 'trimesh');
  if (!ALLOWED_COLLIDERS.has(collider)) die(`${name}: collider "${collider}" not allowed (trimesh | none)`);
  const srcTris = triangles(srcDoc);
  const textures = srcDoc.getRoot().listTextures().length;

  const stages = [{ label: 'src (blender)', path: src, bytes: statSync(src).size }];
  stages.push(
    await stage('resize', src, join(BUILD, `${name}.1-resize.glb`), [
      textureCompress({ encoder: sharp, targetFormat: 'png', resize: [TEXTURE_MAX_SIZE, TEXTURE_MAX_SIZE] }),
    ]),
  );
  stages.push(
    await stage('ktx2', stages[1].path, join(BUILD, `${name}.2-ktx2.glb`), [ktx2({ ...KTX2_OPTIONS, imageDecoder })], (doc) => {
      // ktx2-encoder logs and CONTINUES on an encode failure — verify instead of trusting it.
      for (const tx of doc.getRoot().listTextures())
        if (tx.getMimeType() !== 'image/ktx2') die(`${name}: texture "${tx.getName()}" is still ${tx.getMimeType()} after the ktx2 stage`);
    }),
  );
  const out = join(DIST, `${name}.glb`);
  stages.push(await stage('draco', stages[2].path, out, [draco(DRACO_OPTIONS)]));

  // Verify the shipped file, read back as the game will see it.
  const fin = await io.read(out);
  const used = fin.getRoot().listExtensionsUsed().map((e) => e.extensionName);
  for (const ext of ['KHR_draco_mesh_compression', ...(textures ? ['KHR_texture_basisu'] : [])])
    if (!used.includes(ext)) die(`${name}: ${ext} missing from the final GLB`);
  const tris = triangles(fin);
  if (tris !== srcTris) die(`${name}: triangle count changed in the pipeline (${srcTris} -> ${tris})`);
  // The Blender script counts the UNMODIFIED mesh. If the exported file holds more, a modifier was
  // baked on export (export_apply=True turns one tread into the whole run).
  if (srcTris !== blenderTris.get(name))
    die(`${name}: GLB holds ${srcTris} triangles but the Blender unit is ${blenderTris.get(name)} — was a modifier applied on export? (export_apply must be False)`);
  const bb = getBounds(fin.getRoot().listScenes()[0]);
  const unit = { min: bb.min.map(round), max: bb.max.map(round) };
  const run = { min: unit.min.map((m, i) => round(m + Math.min(0, step[i] * (repeat - 1)))), max: unit.max.map((m, i) => round(m + Math.max(0, step[i] * (repeat - 1)))) };

  meshAssets.push({
    name,
    kind: 'mesh',
    file: `${name}.glb`,
    collider,
    triangles: tris, // ONE repeat unit (what is in the file)
    bytes: statSync(out).size,
    bytes_src: stages[0].bytes,
    bbox: unit, // ONE repeat unit, asset-local, glTF Y-up
    ...(repeat > 1
      ? { instancing: { count: repeat, step: step.map(round), triangles_total: tris * repeat, bbox: run } }
      : {}),
    ...Object.fromEntries(['tread_depth', 'riser_height', 'tread_width', 'slope_deg'].filter((k) => k in extras).map((k) => [k, round(Number(extras[k]))])),
  });
  console.log(`\n  ${name}  (${tris} tris/unit${repeat > 1 ? ` x ${repeat} instances = ${tris * repeat} tris` : ''}, collider ${collider})`);
  for (const s of stages) console.log(`    ${s.label.padEnd(14)} ${String(s.bytes).padStart(8)} B  ${kb(s.bytes).padStart(9)}  ${((s.bytes / stages[0].bytes) * 100).toFixed(1).padStart(5)}%  ${sha(s.path)}  ${rel(s.path)}`);
}

// ---------- 5. manifest ----------
const prim = JSON.parse(readFileSync(PRIMITIVES, 'utf8')).assets;
for (const p of prim) {
  if (!NAME_RE.test(p.name)) die(`primitives.json: "${p.name}" is not lower_snake_case`);
  if (!ALLOWED_COLLIDERS.has(p.collider)) die(`primitives.json: "${p.name}" collider "${p.collider}" not allowed (trimesh | none)`);
}
const all = [...prim, ...meshAssets].sort((a, b) => a.name.localeCompare(b.name));
const dup = all.find((a, i) => all.findIndex((b) => b.name === a.name) !== i);
if (dup) die(`duplicate asset name "${dup.name}"`);
const manifestPath = join(DIST, 'manifest.json');
writeFileSync(manifestPath, JSON.stringify({ assets: all }, null, 2) + '\n');

// ---------- budget ----------
const distFiles = readdirSync(DIST).sort();
const total = distFiles.reduce((n, f) => n + statSync(join(DIST, f)).size, 0);
console.log(`\n  assets/dist/`);
for (const f of distFiles) console.log(`    ${f.padEnd(24)} ${String(statSync(join(DIST, f)).size).padStart(8)} B  ${sha(join(DIST, f))}`);
console.log(`    ${'TOTAL'.padEnd(24)} ${String(total).padStart(8)} B  ${kb(total)} / ${kb(DIST_BUDGET_BYTES)} budget (${((total / DIST_BUDGET_BYTES) * 100).toFixed(1)}%)`);
if (total > DIST_BUDGET_BYTES) die(`assets/dist is ${kb(total)} > ${kb(DIST_BUDGET_BYTES)} budget`);
console.log(`\nASSETS PASS  ${all.length} assets (${meshAssets.length} mesh, ${prim.length} primitive) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
