#!/usr/bin/env node
// Tier-1 asset budgets — CI-enforceable, renderer-independent.   npm run assets:budget
//
// Reads the COMMITTED assets/dist/ (CI has no Blender; it never rebuilds) and, for every mesh:
//   1. validates assets/dist/manifest.json against assets/manifest.schema.json (strict)
//   2. re-measures the shipped .glb (tools/assets/measure.mjs) and requires the manifest to agree
//      field for field — a hand-edited or stale manifest fails here
//   4. ACCENT_CONTRAST: every accent candidate separates from the palette (tools/assets/accent.mjs)
//   3. checks the measurement against tools/assets/budgets.json: triangles, compressed bytes,
//      texture count and max dimension, material count, draw calls when placed once
//   5. D-020: the painted backdrop textures and rigged characters, each against its own measured line
//      (tools/assets/paint-budget.mjs)
//
// Budgets are set AT the measured value (MOVE-table discipline: MEASUREMENTS.md, "H4 asset
// budgets"). A budget is a ratchet: an asset that grows fails until someone raises its line in
// budgets.json AND records the new measurement and the reason in MEASUREMENTS.md.
// Draw calls are also asserted in a real renderer by the harness `assets` stage (renderer.info).
//
// Exit: 0 within budget · 1 over budget / unbudgeted / manifest mismatch

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import AjvMod from 'ajv';
import { measure } from './measure.mjs';
import { checkAccents, printAccents } from './accent.mjs';
import { checkPaintBudgets, printPaintBudget } from './paint-budget.mjs';
import { checkShellBudgets } from './shell-budget.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const Ajv = AjvMod.default ?? AjvMod;

export function loadBudgets(root = ROOT) {
  return JSON.parse(readFileSync(join(root, 'tools/assets/budgets.json'), 'utf8')).assets;
}

export function validateManifest(manifest, root = ROOT) {
  const schema = JSON.parse(readFileSync(join(root, 'assets/manifest.schema.json'), 'utf8'));
  const validate = new Ajv({ strict: true, allErrors: true }).compile(schema);
  if (validate(manifest)) return [];
  return validate.errors.map((e) => `manifest${e.instancePath} ${e.message}${e.params?.additionalProperty ? ` "${e.params.additionalProperty}"` : ''}`);
}

const LIMITS = [
  // [budget key, label, measured(m) -> number]
  ['triangles', 'triangles', (m) => m.triangles],
  ['bytes', 'compressed bytes', (m) => m.bytes],
  ['textures', 'textures', (m) => m.textures.length],
  ['texture_px', 'texture max dimension px', (m) => Math.max(0, ...m.textures.flatMap((t) => [t.width, t.height]))],
  ['materials', 'materials', (m) => m.materials],
  ['draw_calls', 'draw calls (placed once)', (m) => m.draw_calls],
];

/**
 * @param dist directory holding manifest.json and the .glb files (assets/dist, or build staging)
 * @returns {{ok: boolean, rows: object[], errors: string[]}}
 */
export async function checkBudgets(dist = join(ROOT, 'assets/dist'), root = ROOT) {
  const errors = [];
  const rows = [];
  const manifestPath = join(dist, 'manifest.json');
  if (!existsSync(manifestPath)) return { ok: false, rows, errors: [`${manifestPath} missing — run npm run assets:build`] };
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  errors.push(...validateManifest(manifest, root));
  if (errors.length) return { ok: false, rows, errors };

  const budgets = loadBudgets(root);
  const classes = JSON.parse(readFileSync(join(root, 'tools/assets/budgets.json'), 'utf8')).classes ?? {};
  const meshes = manifest.assets.filter((a) => a.kind === 'mesh');
  for (const name of Object.keys(budgets)) if (!meshes.some((a) => a.name === name)) errors.push(`budgets.json has "${name}" but the manifest has no such mesh — stale budget line`);
  for (const a of meshes) {
    const file = join(dist, a.file);
    if (!existsSync(file)) {
      errors.push(`${a.name}: ${a.file} missing from ${dist}`);
      continue;
    }
    const m = await measure(file);
    for (const k of ['sha256', 'bytes', 'triangles', 'draw_calls', 'materials']) {
      if (m[k] !== a[k]) errors.push(`${a.name}: manifest ${k}=${a[k]} but the shipped file measures ${m[k]} — manifest stale or hand-edited; rebuild`);
    }
    if (JSON.stringify(m.textures) !== JSON.stringify(a.textures)) errors.push(`${a.name}: manifest textures disagree with the shipped file`);
    if (JSON.stringify(m.bbox) !== JSON.stringify(a.bbox)) errors.push(`${a.name}: manifest bbox disagrees with the shipped file`);
    const b = budgets[a.name];
    if (!b) {
      errors.push(`${a.name}: no budget in tools/assets/budgets.json — measure it, record it in MEASUREMENTS.md, then add the line`);
      rows.push({ name: a.name, m, checks: [] });
      continue;
    }
    const checks = LIMITS.map(([key, label, get]) => {
      const value = get(m);
      const limit = b[key];
      if (typeof limit !== 'number') errors.push(`${a.name}: budgets.json is missing "${key}"`);
      const ok = typeof limit === 'number' && value <= limit;
      if (typeof limit === 'number' && !ok) errors.push(`${a.name}: ${label} ${value} > budget ${limit}`);
      return { key, label, value, limit, ok };
    });
    // D-020: a hero asset has its own measured line like any other, AND that line may not pass the class ceiling
    if (a.class) {
      const ceiling = classes[a.class];
      if (!ceiling) errors.push(`${a.name}: class "${a.class}" has no ceiling in budgets.json classes`);
      else for (const [key, max] of Object.entries(ceiling)) if (typeof b[key] === 'number' && b[key] > max) errors.push(`${a.name}: its ${key} line ${b[key]} is above the ${a.class} class ceiling ${max}`);
      if (a.collider !== 'none') errors.push(`${a.name}: a ${a.class} asset must be collider none (art never becomes collision), manifest says ${a.collider}`);
    }
    rows.push({ name: a.name, m, checks });
  }
  return { ok: errors.length === 0, rows, errors };
}

export function printBudget({ rows, errors }) {
  for (const r of rows) {
    console.log(`  ${r.name}  (${r.m.extensions.join(', ') || 'no extensions'})`);
    for (const c of r.checks) console.log(`    ${c.ok ? '✓' : '✗'} ${c.label.padEnd(26)} ${String(c.value).padStart(7)}  / ${c.limit}`);
    if (!r.checks.length) console.log(`    measured: ${r.m.triangles} tris, ${r.m.bytes} B, ${r.m.textures.length} tex ${r.m.textures.map((t) => `${t.width}x${t.height} ${t.mime}`).join(',')}, ${r.m.materials} mat, ${r.m.draw_calls} draw`);
  }
  for (const e of errors) console.log(`  ✗ ${e}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const res = await checkBudgets();
  console.log('asset budgets (Tier-1) — assets/dist/');
  printBudget(res);
  const acc = checkAccents();
  console.log('accent (D-001, ACCENT_CONTRAST)');
  printAccents(acc);
  const paint = await checkPaintBudgets(ROOT);
  console.log('painted backdrop and characters (D-020) — assets/backdrop/, assets/char/');
  printPaintBudget(paint);
  const shell = checkShellBudgets(ROOT);
  console.log('title, how-to-play and sound (D-022) — assets/ui/, assets/audio/');
  printPaintBudget(shell);
  const ok = res.ok && acc.ok && paint.ok && shell.ok;
  console.log(ok ? 'BUDGET PASS' : 'BUDGET FAIL');
  process.exit(ok ? 0 : 1);
}
