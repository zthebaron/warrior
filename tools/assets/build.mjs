#!/usr/bin/env node
// The asset pipeline.   npm run assets:build
//
// For every asset under assets/src/ (kit_*.py procedural modules, *.blend hero files):
//   0. export   blender -b tools/blender/export.py         -> assets/build/<name>/0-export.glb (uncompressed)
//   1. style    unlit material, nearest sampling            -> 1-style.glb   (STYLE-BIBLE section 1: no specular,
//               no light direction; palette cells must not blend)
//   2. resize   gltf-transform resize, cap TEXTURE_MAX px   -> 2-resize.glb
//   3. ktx2     gltf-transform uastc|etc1s (KTX-Software)   -> 3-ktx2.glb
//   4. draco    gltf-transform draco — LAST: lossy, irreversible -> 4-draco.glb == assets/dist/<name>.glb
// then assets/src/primitives.json + every mesh's MEASURED numbers -> assets/dist/manifest.json, validated
// against assets/manifest.schema.json, then the Tier-1 budgets (tools/assets/budget.mjs).
//
// Every stage's output stays in assets/build/<name>/ (gitignored) for inspection. assets/dist/ is
// replaced only when every stage, the schema and the budgets all passed (built in staging, then swapped),
// so a failed build never leaves a half-built dist that lints clean.
// Deterministic: Blender gets explicit exporter options and an empty factory scene; encoders run with
// --jobs 1; nothing time- or host-dependent is written. rm -rf assets/dist && npm run assets:build
// regenerates it byte for byte (proof: 00-start-here/H4-ASSET-PROOF.md).
//
// Exit: 0 ok · 1 a stage failed · 2 toolchain missing · 3 over budget / schema

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { KHRMaterialsSpecular, KHRMaterialsUnlit } from '@gltf-transform/extensions';
import { TextureInfo } from '@gltf-transform/core';
import { ROOT, checkBudgets, printBudget, validateManifest } from './budget.mjs';
import { io, measure } from './measure.mjs';

const P = (...p) => join(ROOT, ...p);

export const ASSET_CONFIG = {
  blender: process.env.BLENDER ?? '/Applications/Blender.app/Contents/MacOS/Blender',
  ktx: process.env.KTX ?? 'ktx',
  textureMax: 256, // px, resize cap
  // KTX2 codec. --mipmaps false: every kit face samples ONE palette texel (constant UV per face), so
  // there is no minification to filter, and mip levels below 8px cells would average two palette
  // entries into an off-ramp colour. --jobs 1: deterministic.
  ktx2: { codec: 'uastc', args: ['--level', '2', '--mipmaps', 'false', '--jobs', '1'] },
  draco: ['--method', 'edgebreaker', '--quantize-position', '14', '--quantize-normal', '10', '--quantize-texcoord', '12'],
};
const C = ASSET_CONFIG;
const kb = (n) => `${(n / 1024).toFixed(2)} KB`;
const die = (code, msg) => {
  console.error(`\nASSETS FAILED: ${msg}\nassets/dist/ left unchanged.`);
  process.exit(code);
};

function run(cmd, args, label) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8' });
  if (r.error) return { ok: false, out: `${label}: ${r.error.message}` };
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  if (r.status !== 0) return { ok: false, out: `${label}: exit ${r.status}\n${out.trim().split('\n').slice(-25).join('\n')}` };
  return { ok: true, out };
}

// ---------- toolchain (fail before touching anything) ----------
const blenderV = run(C.blender, ['--version'], 'blender');
if (!blenderV.ok) die(2, `Blender not runnable at ${C.blender} (set BLENDER=). ${blenderV.out}`);
const ktxV = run(C.ktx, ['--version'], 'ktx');
if (!ktxV.ok) die(2, `KTX-Software 'ktx' not found (set KTX= or put it on PATH): the ktx2 stage cannot run. https://github.com/KhronosGroup/KTX-Software/releases`);
const gltfTransform = P('node_modules/.bin/gltf-transform');
const gtV = run(gltfTransform, ['--version'], 'gltf-transform');
if (!gtV.ok) die(2, `gltf-transform CLI missing: npm ci. ${gtV.out}`);
console.log(`toolchain: ${blenderV.out.split('\n')[0].trim()} · ${ktxV.out.trim().split('\n')[0]} · gltf-transform ${gtV.out.trim()}`);

// ---------- sources ----------
const sources = readdirSync(P('assets/src'))
  .filter((f) => /\.(py|blend)$/.test(f))
  .sort();
if (!sources.length) die(1, 'no .py or .blend assets in assets/src/');
const staging = P('assets/build/dist-staging');
rmSync(staging, { recursive: true, force: true });
mkdirSync(staging, { recursive: true });

// stage 1: STYLE-BIBLE section 1 in data — unlit (three -> MeshBasicMaterial), no specular extension,
// NEAREST sampling with no mipmap filter (the ktx2 stage ships no mips).
async function style(src, out) {
  const nio = await io();
  const doc = await nio.read(src);
  const unlit = doc.createExtension(KHRMaterialsUnlit);
  for (const mat of doc.getRoot().listMaterials()) {
    mat.setExtension('KHR_materials_specular', null);
    mat.setExtension('KHR_materials_unlit', unlit.createUnlit());
    mat.setRoughnessFactor(1).setMetallicFactor(0).setDoubleSided(false);
    const info = mat.getBaseColorTextureInfo();
    if (info) info.setMagFilter(TextureInfo.MagFilter.NEAREST).setMinFilter(TextureInfo.MinFilter.NEAREST);
  }
  doc.getRoot().listExtensionsUsed().find((e) => e.extensionName === KHRMaterialsSpecular.EXTENSION_NAME)?.dispose();
  await nio.write(out, doc);
}

const built = [];
for (const file of sources) {
  const name = file.replace(/\.(py|blend)$/, '');
  if (!/^[a-z][a-z0-9_]*$/.test(name)) die(1, `asset "${file}" is not lower_snake_case`);
  const dir = P('assets/build', name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const s = ['0-export', '1-style', '2-resize', '3-ktx2', '4-draco'].map((n) => join(dir, `${n}.glb`));

  // 0. export — --python-exit-code 1: without it Blender exits 0 even when the script raises
  const r = run(C.blender, ['--background', '--factory-startup', '--python-exit-code', '1', '--python', 'tools/blender/export.py', '--', '--input', `assets/src/${file}`, '--out', relative(ROOT, s[0])], `blender ${file}`);
  if (!r.ok) die(1, r.out);
  for (const line of r.out.split('\n')) if (line.startsWith('[export]')) console.log(`  ${line}`);
  const meta = JSON.parse(readFileSync(s[0].replace(/\.glb$/, '.meta.json'), 'utf8'));

  // 1. style
  await style(s[0], s[1]);
  // 2-4. resize -> ktx2 -> draco, each a separate inspectable file
  for (const [label, args] of [
    ['resize', ['resize', s[1], s[2], '--width', String(C.textureMax), '--height', String(C.textureMax)]],
    ['ktx2', [C.ktx2.codec, s[2], s[3], ...C.ktx2.args]],
    ['draco', ['draco', s[3], s[4], ...C.draco]],
  ]) {
    const g = run(gltfTransform, args, `gltf-transform ${label} (${name})`);
    if (!g.ok) die(1, g.out);
  }
  copyFileSync(s[4], join(staging, `${name}.glb`));

  const m = await measure(s[4]);
  if (m.triangles !== meta.triangles) die(1, `${name}: Blender counted ${meta.triangles} triangles, the shipped file has ${m.triangles}`);
  if (m.textures.some((t) => t.mime !== 'image/ktx2')) die(1, `${name}: a texture left the ktx2 stage as ${m.textures.map((t) => t.mime).join(',')}`);
  built.push({
    entry: {
      name,
      kind: 'mesh',
      file: `${name}.glb`,
      source: `assets/src/${file}`,
      sha256: m.sha256,
      collider: meta.collider,
      triangles: m.triangles,
      bytes: m.bytes,
      bytes_export: statSync(s[0]).size,
      bbox: m.bbox,
      materials: m.materials,
      draw_calls: m.draw_calls,
      textures: m.textures,
      compression: { geometry: `draco ${C.draco.join(' ')}`, textures: `ktx2 ${C.ktx2.codec} ${C.ktx2.args.join(' ')} (resize cap ${C.textureMax}px)` },
    },
    stages: s.map((f) => statSync(f).size),
  });
}

// ---------- manifest (a build output) ----------
const primitives = JSON.parse(readFileSync(P('assets/src/primitives.json'), 'utf8')).assets;
const manifest = { generated_by: 'tools/assets/build.mjs', assets: [...primitives, ...built.map((b) => b.entry)] };
const names = manifest.assets.map((a) => a.name);
const dup = names.find((n, i) => names.indexOf(n) !== i);
if (dup) die(1, `duplicate asset name "${dup}"`);
const schemaErrors = validateManifest(manifest);
if (schemaErrors.length) die(3, `generated manifest fails assets/manifest.schema.json:\n  ${schemaErrors.join('\n  ')}`);
writeFileSync(join(staging, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

// ---------- report ----------
console.log('\nasset            tris   export     style      resize     ktx2       draco(dist)  ratio   textures');
for (const b of built) {
  const e = b.entry;
  console.log(
    `${e.name.padEnd(16)} ${String(e.triangles).padStart(5)}  ${b.stages.map((n) => kb(n).padEnd(10)).join(' ')}  ${(b.stages[0] / b.stages[4]).toFixed(2)}x  ${e.textures.map((t) => `${t.width}x${t.height} ${t.mime}`).join(', ')}`,
  );
}

// ---------- budgets (on staging: dist is untouched until they pass) ----------
console.log('\nTier-1 budgets');
const res = await checkBudgets(staging);
printBudget(res);
if (!res.ok) die(3, 'over budget / unbudgeted (see above)');

rmSync(P('assets/dist'), { recursive: true, force: true });
renameSync(staging, P('assets/dist'));
const distFiles = readdirSync(P('assets/dist')).sort();
console.log(`\nASSETS OK  assets/dist/ regenerated: ${distFiles.join(', ')}`);
if (existsSync(P('assets/dist/manifest.json'))) process.exit(0);
