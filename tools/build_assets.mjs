#!/usr/bin/env node
// tools/build_assets.mjs — the asset pipeline.   npm run assets
//
//   1. blender   every tools/blender/*.py, headless, in name order -> assets/src/<name>.glb (uncompressed)
//                + assets/src/<name>.meta.json (instancing metadata; the script is the source of truth)
//   2. resize    gltf-transform resize   (textures capped at TEXTURE_MAX px)        -> assets/build/<name>/1-resize.glb
//   3. ktx2      gltf-transform etc1s    (KTX2 / Basis ETC1S, needs KTX-Software)  -> assets/build/<name>/2-ktx2.glb
//   4. draco     gltf-transform draco    LAST — lossy and irreversible             -> assets/build/<name>/3-draco.glb
//   5. manifest  assets/dist/manifest.json: name, triangles, bytes, collider, bbox, instancing
//   6. budget    fails if any asset or the whole of assets/dist/ is over budget
//
// assets/dist/ is only replaced when EVERY stage succeeded (built in a staging dir, then swapped),
// so a failed build never leaves a half-built dist that lints clean.
// Reproducible: no timestamps, hostnames or absolute paths in any output; single-job encoders.
// rm -rf assets/dist && npm run assets regenerates it byte-for-byte.
//
// Exit: 0 ok · 1 a stage failed · 2 toolchain missing (Blender or KTX-Software) · 3 over budget

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const P = (...p) => join(ROOT, ...p);

export const ASSET_CONFIG = {
  blender: process.env.BLENDER ?? '/opt/homebrew/bin/blender',
  ktx: process.env.KTX ?? 'ktx',
  textureMax: 256,                 // px; resize stage cap
  etc1s: ['--quality', '128', '--compression', '2', '--jobs', '1'], // --jobs 1: deterministic output
  draco: ['--method', 'edgebreaker', '--quantize-position', '14', '--quantize-normal', '10', '--quantize-texcoord', '12'],
  budget: {
    perAssetBytes: 512 * 1024,     // compressed .glb
    distBytes: 8 * 1024 * 1024,    // all of assets/dist/
  },
};

const C = ASSET_CONFIG;
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const die = (code, msg) => {
  console.error(`\nASSETS FAILED: ${msg}`);
  process.exit(code);
};

function run(cmd, args, label) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8' });
  if (r.error) return { ok: false, out: String(r.error.message) };
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  if (r.status !== 0) return { ok: false, out: `${label}: exit ${r.status}\n${out.trim().split('\n').slice(-25).join('\n')}` };
  return { ok: true, out };
}

// ---------- 0. toolchain (fail before touching anything) ----------
const blenderV = run(C.blender, ['--version'], 'blender');
if (!blenderV.ok) die(2, `Blender not runnable at ${C.blender} (set BLENDER=). ${blenderV.out}`);
const ktxV = run(C.ktx, ['--version'], 'ktx');
if (!ktxV.ok) {
  die(2, `KTX-Software 'ktx' not found (set KTX= or put it on PATH) — the ktx2 stage cannot run.
  Install KTX-Software v4.3+ (https://github.com/KhronosGroup/KTX-Software/releases), e.g. macOS arm64:
    gh release download v4.4.2 --repo KhronosGroup/KTX-Software --pattern 'KTX-Software-4.4.2-Darwin-arm64.pkg'
    sudo installer -pkg KTX-Software-4.4.2-Darwin-arm64.pkg -target /      # -> /usr/local/bin/ktx
  Nothing was written to assets/dist/.`);
}
const gltfTransform = P('node_modules/.bin/gltf-transform');
console.log(`toolchain: ${blenderV.out.split('\n')[0].trim()} · ${ktxV.out.trim().split('\n')[0]} · gltf-transform ${run(gltfTransform, ['--version'], 'gltf-transform').out.trim()}`);

// ---------- 1. blender ----------
const scripts = readdirSync(P('tools/blender')).filter((f) => f.endsWith('.py')).sort();
if (scripts.length === 0) die(1, 'no scripts in tools/blender/');
for (const s of scripts) {
  // --python-exit-code 1: without it Blender exits 0 even when the script raises
  const r = run(C.blender, ['--background', '--factory-startup', '--python-exit-code', '1', '--python', `tools/blender/${s}`], `blender ${s}`);
  if (!r.ok) die(1, r.out);
  for (const line of r.out.split('\n')) if (line.startsWith('[')) console.log(`  ${line}`);
}

// ---------- 2-4. resize -> ktx2 -> draco ----------
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const staging = P('assets/build/dist-staging');
rmSync(staging, { recursive: true, force: true });
mkdirSync(staging, { recursive: true });

const sources = readdirSync(P('assets/src')).filter((f) => f.endsWith('.glb')).sort();
const built = [];
for (const file of sources) {
  const name = basename(file, '.glb');
  if (!/^[a-z][a-z0-9_]*$/.test(name)) die(1, `asset "${name}" is not lower_snake_case`);
  const metaPath = P('assets/src', `${name}.meta.json`);
  if (!existsSync(metaPath)) die(1, `${name}: missing assets/src/${name}.meta.json (the Blender script must write it)`);
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  if (meta.collider !== 'trimesh') die(1, `${name}: collider "${meta.collider}" — trimesh only (box sinks; see check:physics)`);

  const dir = P('assets/build', name);
  mkdirSync(dir, { recursive: true });
  const src = P('assets/src', file);
  const s1 = join(dir, '1-resize.glb');
  const s2 = join(dir, '2-ktx2.glb');
  const s3 = join(dir, '3-draco.glb');
  for (const [label, args] of [
    ['resize', ['resize', src, s1, '--width', String(C.textureMax), '--height', String(C.textureMax)]],
    ['ktx2', ['etc1s', s1, s2, ...C.etc1s]],
    ['draco', ['draco', s2, s3, ...C.draco]],
  ]) {
    const r = run(gltfTransform, args, `gltf-transform ${label} (${name})`);
    if (!r.ok) die(1, r.out);
  }
  copyFileSync(s3, join(staging, `${name}.glb`));

  // triangles + bbox from the UNCOMPRESSED source (no decoders needed); bytes from each stage
  const doc = await io.read(src);
  const collisionName = meta.collision_mesh ?? null;
  let triangles = 0;
  let collisionTriangles = 0;
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const mesh of doc.getRoot().listMeshes()) {
    const isCollision = mesh.getName() === collisionName;
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      const pos = prim.getAttribute('POSITION');
      const t = (idx ? idx.getCount() : pos.getCount()) / 3;
      if (isCollision) {
        collisionTriangles += t;
        continue;
      }
      triangles += t;
      const mn = pos.getMin([]);
      const mx = pos.getMax([]);
      for (let k = 0; k < 3; k++) {
        lo[k] = Math.min(lo[k], mn[k]);
        hi[k] = Math.max(hi[k], mx[k]);
      }
    }
  }
  const round = (v) => Math.round(v * 1e5) / 1e5;
  const textures = doc.getRoot().listTextures().map((t) => ({ name: t.getName(), mime: t.getMimeType() }));
  const bytes = {
    src: statSync(src).size,
    resize: statSync(s1).size,
    ktx2: statSync(s2).size,
    draco: statSync(s3).size,
  };
  built.push({
    entry: {
      name,
      kind: 'gltf',
      file: `${name}.glb`,
      collider: 'trimesh',
      collision_mesh: collisionName,
      triangles: triangles * (meta.instancing?.count ?? 1),
      triangles_per_instance: triangles,
      collision_triangles: collisionTriangles,
      bytes: bytes.draco,
      bytes_src: bytes.src,
      bbox: { min: lo.map(round), max: hi.map(round) },
      instancing: meta.instancing ?? null,
      compression: { textures: `KTX2 ETC1S (max ${C.textureMax}px)`, geometry: `Draco ${C.draco.join(' ')}` },
    },
    bytes,
    textures,
  });
}

// ---------- 5. manifest ----------
const primitives = JSON.parse(readFileSync(P('tools/assets/primitives.json'), 'utf8')).assets;
const manifest = { assets: [...primitives, ...built.map((b) => b.entry)] };
const names = manifest.assets.map((a) => a.name);
const dup = names.find((n, i) => names.indexOf(n) !== i);
if (dup) die(1, `duplicate asset name "${dup}"`);
writeFileSync(join(staging, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

// ---------- 6. budget ----------
const distFiles = readdirSync(staging);
const distBytes = distFiles.reduce((n, f) => n + statSync(join(staging, f)).size, 0);
const over = built.filter((b) => b.bytes.draco > C.budget.perAssetBytes).map((b) => `${b.entry.name} ${kb(b.bytes.draco)} > ${kb(C.budget.perAssetBytes)}`);
if (distBytes > C.budget.distBytes) over.push(`assets/dist ${kb(distBytes)} > ${kb(C.budget.distBytes)}`);

// ---------- report ----------
console.log('\nasset            tris (inst x n)     src        resize     ktx2       draco      ratio');
for (const b of built) {
  const e = b.entry;
  const n = e.instancing?.count ?? 1;
  console.log(
    `${e.name.padEnd(16)} ${`${e.triangles_per_instance} x ${n} = ${e.triangles}`.padEnd(19)} ${kb(b.bytes.src).padEnd(10)} ${kb(b.bytes.resize).padEnd(10)} ${kb(b.bytes.ktx2).padEnd(10)} ${kb(b.bytes.draco).padEnd(10)} ${(b.bytes.src / b.bytes.draco).toFixed(1)}x`,
  );
  console.log(`${''.padEnd(16)} collider trimesh${e.collision_mesh ? ` (collision mesh ${e.collision_mesh}, ${e.collision_triangles} tris)` : ' (visual mesh)'} · bbox ${JSON.stringify(e.bbox.min)}..${JSON.stringify(e.bbox.max)} · textures ${b.textures.map((t) => `${t.name}:${t.mime}`).join(', ') || 'none'}`);
}
console.log(`\nassets/dist: ${distFiles.length} files, ${kb(distBytes)} (budget ${kb(C.budget.distBytes)}; per asset ${kb(C.budget.perAssetBytes)})`);
if (over.length) die(3, `over budget: ${over.join('; ')} — assets/dist/ left unchanged`);

// swap in the new dist only now that everything passed
rmSync(P('assets/dist'), { recursive: true, force: true });
renameSync(staging, P('assets/dist'));
console.log('ASSETS OK  assets/dist/ regenerated');
