#!/usr/bin/env node
// The asset pipeline.   npm run assets:build
//
// For every asset under assets/src/ (kit_*.py procedural modules, *.blend hero files):
// pre. ACCENT_CONTRAST on assets/src/accent.json (tools/assets/accent.mjs) — fails before Blender runs
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
// HERO assets (D-020), after the kit: assets/hero/<name>.glb, an externally authored or generated model
// with its own painted texture, taken as delivered (Blender is not involved):
//   0. source   the delivered file                                          -> 0-source.glb
//   1. style    unlit; ONLY the base-colour texture is kept (normal, occlusion, emissive and metal-rough maps
//               are inert under an unlit material and would be shipped and counted); linear filtering with
//               mipmaps; scene flattened, meshes joined, vertices welded; the texture's chroma capped
//                                                                            -> 1-style.glb
//   2. simplify only where assets/src/hero.json asks                         -> 2-simplify.glb
//   3. resize   to the hero class's texture ceiling (budgets.json classes.hero) -> 3-resize.glb
//   4. ktx2     UASTC with mipmaps                                           -> 4-ktx2.glb
//   5. draco                                                                -> 5-draco.glb == assets/dist/<name>.glb
// Only what assets/src/hero.json lists is imported. Characters listed there keep their skin and clips and go
// to assets/char/ instead (no flatten, no Draco).
// A hero asset is ALWAYS collider none, whatever the file says: art never becomes collision. The level's
// boxes and the kit are the collision; a hero mesh is drawn over them (paint layer).
// HERO_DIR=<dir> reads the sources from another directory (a fixture); ASSETS_OUT=<dir> writes the result
// there instead of assets/dist (a dry run that leaves the shipped set alone).
//
// Exit: 0 ok · 1 a stage failed · 2 toolchain missing · 3 over budget / schema

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { KHRMaterialsSpecular, KHRMaterialsUnlit } from '@gltf-transform/extensions';
import { dedup, flatten, join as joinMeshes, prune, weld } from '@gltf-transform/functions';
import { TextureInfo } from '@gltf-transform/core';
import { ROOT, checkBudgets, printBudget, validateManifest } from './budget.mjs';
import { io, measure } from './measure.mjs';
import { checkAccents, printAccents } from './accent.mjs';

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
  // hero class (D-020). The texture ceiling is the class line in budgets.json, read below, never retyped.
  heroDir: process.env.HERO_DIR ?? 'assets/hero',
  heroKtx2: { codec: 'uastc', args: ['--level', '2', '--jobs', '1'] }, // mipmaps on (the default): a painted texture is minified
  out: process.env.ASSETS_OUT ?? 'assets/dist',
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

// ---------- accent (D-001): an off-ramp colour must earn its cell before anything is built ----------
const accent = checkAccents();
if (!accent.ok) {
  printAccents(accent);
  die(3, 'ACCENT_CONTRAST (assets/src/accent.json vs reference/palette.json)');
}

// ---------- sources ----------
const sources = readdirSync(P('assets/src'))
  .filter((f) => /\.(py|blend)$/.test(f) && !f.startsWith('char_')) // char_*: rigged characters, built by tools/assets/build-char.mjs (D-020)
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

// ---------- hero assets and characters (D-020) ----------
// assets/src/hero.json names what is imported from assets/hero/: nothing there ships unless it is listed.
const heroClass = JSON.parse(readFileSync(P('tools/assets/budgets.json'), 'utf8')).classes?.hero;
const heroCfg = JSON.parse(readFileSync(P('assets/src/hero.json'), 'utf8'));
if (!heroClass) die(3, 'tools/assets/budgets.json has no classes.hero');
const { PNG } = createRequire(import.meta.url)('pngjs');

/**
 * A painted texture stays inside the ramp's chroma (STYLE §2: nothing off the ramp but the accent and the robe;
 * D-003: nothing on the character reads as the accent). Each texel keeps its value; its channels are pulled
 * toward their mean until max - min is at most chroma_cap. The accent is not painted: it is a material colour.
 */
function capChroma(doc, name) {
  const cap = heroCfg.chroma_cap;
  let capped = 0, total = 0, worst = 0;
  for (const tex of doc.getRoot().listTextures()) {
    if (tex.getMimeType() !== 'image/png') die(1, `${name}: base colour texture "${tex.getName()}" is ${tex.getMimeType()}; the import reads image/png`);
    const png = PNG.sync.read(Buffer.from(tex.getImage()));
    for (let i = 0; i < png.data.length; i += 4) {
      const r = png.data[i], g = png.data[i + 1], bl = png.data[i + 2];
      const c = Math.max(r, g, bl) - Math.min(r, g, bl);
      total++;
      if (c > worst) worst = c;
      if (c <= cap) continue;
      const m = (r + g + bl) / 3, k = cap / c;
      png.data[i] = Math.round(m + (r - m) * k);
      png.data[i + 1] = Math.round(m + (g - m) * k);
      png.data[i + 2] = Math.round(m + (bl - m) * k);
      capped++;
    }
    tex.setImage(PNG.sync.write(png));
  }
  if (total) console.log(`  [hero] ${name}: chroma capped at ${cap} on ${((100 * capped) / total).toFixed(1)}% of texels (largest delivered ${worst})`);
}

/** Unlit, base colour only (or no texture at all), linear filtering with mipmaps. */
function unlitBaseOnly(doc, keepTexture) {
  const unlit = doc.createExtension(KHRMaterialsUnlit);
  for (const mat of doc.getRoot().listMaterials()) {
    mat.setExtension('KHR_materials_specular', null);
    mat.setExtension('KHR_materials_unlit', unlit.createUnlit());
    mat.setNormalTexture(null).setOcclusionTexture(null).setEmissiveTexture(null).setMetallicRoughnessTexture(null);
    mat.setEmissiveFactor([0, 0, 0]).setRoughnessFactor(1).setMetallicFactor(0);
    if (!keepTexture) mat.setBaseColorTexture(null);
    const info = mat.getBaseColorTextureInfo();
    if (info) info.setMagFilter(TextureInfo.MagFilter.LINEAR).setMinFilter(TextureInfo.MinFilter.LINEAR_MIPMAP_LINEAR);
  }
  doc.getRoot().listExtensionsUsed().find((e) => e.extensionName === KHRMaterialsSpecular.EXTENSION_NAME)?.dispose();
}

async function styleHero(src, out, name, opt) {
  const nio = await io();
  const doc = await nio.read(src);
  unlitBaseOnly(doc, opt.texture !== false);
  for (const a of doc.getRoot().listAnimations()) a.dispose(); // a hero asset is static; characters have their own path
  for (const sk of doc.getRoot().listSkins()) sk.dispose();
  await doc.transform(dedup(), flatten(), joinMeshes(), weld(), prune());
  capChroma(doc, name);
  await nio.write(out, doc);
}

/** A character keeps its scene graph, skin and clips: nothing is flattened, joined or welded. */
async function styleCharacter(src, out, name) {
  const nio = await io();
  const doc = await nio.read(src);
  unlitBaseOnly(doc, true);
  await doc.transform(prune());
  capChroma(doc, name);
  await nio.write(out, doc);
}

// static models are delivered at assets/hero/<name>.glb, rigged ones at assets/hero/rigged/<name>.glb (ART-GEN)
const heroSource = (name, sub = '') => {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) die(1, `hero asset "${name}" is not lower_snake_case`);
  const file = P(C.heroDir, sub, `${name}.glb`);
  if (!existsSync(file)) die(1, `assets/src/hero.json names "${name}" but ${join(C.heroDir, sub)}/${name}.glb does not exist`);
  return file;
};

for (const [name, opt] of Object.entries(heroCfg.static ?? {})) {
  if (built.some((x) => x.entry.name === name)) die(1, `hero asset "${name}" has the name of a kit asset`);
  const dir = P('assets/build', name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const st = ['0-source', '1-style', '2-simplify', '3-resize', '4-ktx2', '5-draco'].map((n) => join(dir, `${n}.glb`));
  copyFileSync(heroSource(name), st[0]);
  await styleHero(st[0], st[1], name, opt);
  for (const [label, args] of [
    // a model seen small and often (a gate on every level) need not carry every delivered triangle
    opt.simplify ? ['simplify', ['simplify', st[1], st[2], '--ratio', String(opt.simplify), '--error', '0.001']] : ['copy', null],
    ['resize', ['resize', st[2], st[3], '--width', String(heroClass.texture_px), '--height', String(heroClass.texture_px)]],
    ['ktx2', [C.heroKtx2.codec, st[3], st[4], ...C.heroKtx2.args]],
    ['draco', ['draco', st[4], st[5], ...C.draco]],
  ]) {
    if (!args) { copyFileSync(st[1], st[2]); continue; }
    const g = run(gltfTransform, args, `gltf-transform ${label} (${name})`);
    if (!g.ok) die(1, g.out);
  }
  copyFileSync(st[5], join(staging, `${name}.glb`));
  const m = await measure(st[5]);
  if (m.textures.some((t) => t.mime !== 'image/ktx2')) die(1, `${name}: a texture left the ktx2 stage as ${m.textures.map((t) => t.mime).join(',')}`);
  built.push({
    entry: {
      name,
      kind: 'mesh',
      class: 'hero',
      file: `${name}.glb`,
      source: `assets/hero/${name}.glb`,
      sha256: m.sha256,
      collider: 'none',
      triangles: m.triangles,
      bytes: m.bytes,
      bytes_export: statSync(st[0]).size,
      bbox: m.bbox,
      materials: m.materials,
      draw_calls: m.draw_calls,
      textures: m.textures,
      compression: { geometry: `${opt.simplify ? `simplify --ratio ${opt.simplify} --error 0.001, ` : ''}draco ${C.draco.join(' ')}`, textures: `ktx2 ${C.heroKtx2.codec} ${C.heroKtx2.args.join(' ')} (resize cap ${heroClass.texture_px}px, chroma cap ${heroCfg.chroma_cap})` },
    },
    stages: [st[0], st[1], st[3], st[4], st[5]].map((f) => statSync(f).size),
  });
}

// Characters: unlit, base colour only, chroma cap, resize, KTX2. No Draco: the skin's weights and the clips
// ship exactly as delivered. They are not level assets, so they are not in the manifest: assets/char/<name>.glb,
// held by tools/assets/paint-budget.mjs.
const charStaging = P('assets/build/char-staging');
rmSync(charStaging, { recursive: true, force: true });
mkdirSync(charStaging, { recursive: true });
for (const name of Object.keys(heroCfg.characters ?? {})) {
  const dir = P('assets/build', name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const st = ['0-source', '1-style', '2-resize', '3-ktx2'].map((n) => join(dir, `${n}.glb`));
  copyFileSync(heroSource(name, 'rigged'), st[0]);
  await styleCharacter(st[0], st[1], name);
  for (const [label, args] of [
    ['resize', ['resize', st[1], st[2], '--width', String(heroClass.texture_px), '--height', String(heroClass.texture_px)]],
    ['ktx2', [C.heroKtx2.codec, st[2], st[3], ...C.heroKtx2.args]],
  ]) {
    const g = run(gltfTransform, args, `gltf-transform ${label} (${name})`);
    if (!g.ok) die(1, g.out);
  }
  copyFileSync(st[3], join(charStaging, `${name}.glb`));
  const m = await measure(st[3]);
  console.log(`  [character] ${name}: ${m.triangles} triangles, ${m.bytes} B (delivered ${statSync(st[0]).size} B), ${m.textures.map((t) => `${t.width}x${t.height} ${t.mime}`).join(', ')}`);
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

rmSync(P(C.out), { recursive: true, force: true });
renameSync(staging, P(C.out));
// characters ship beside the level assets, not among them (a dry run keeps them next to its own output)
const charOut = C.out === 'assets/dist' ? 'assets/char' : `${C.out}-char`;
rmSync(P(charOut), { recursive: true, force: true });
renameSync(charStaging, P(charOut));
const distFiles = readdirSync(P(C.out)).sort();
console.log(`\nASSETS OK  ${C.out}/ regenerated: ${distFiles.join(', ')}`);
if (existsSync(P(C.out, 'manifest.json'))) process.exit(0);
