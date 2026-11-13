// Budgets for what D-020 added outside the kit: the painted backdrop textures (assets/backdrop/*.png) and
// rigged characters (assets/char/*.glb). Same discipline as the kit lines: every file has a line in
// tools/assets/budgets.json set AT its measured value, a file with no line fails, and a line with no file fails.
// Run by `npm run assets:budget` (tools/assets/budget.mjs), so CI holds it.
//
// It also proves the backdrop PNGs are what the seed gives: tools/art/backdrop-textures.mjs is re-run in
// memory and each committed PNG must match it pixel for pixel. A hand-painted or stale texture fails.
// The painted cards (D-021, assets/backdrop/cards/*.png) are held the same way against
// tools/art/backdrop-cards.mjs and ART-GEN's sources in assets/backdrop/gen, and the courtyard's cards (D-026,
// assets/courtyard/*.png) against tools/art/courtyard-cards.mjs.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { io, measure } from './measure.mjs';
import { LAYERS, buildLayer } from '../art/backdrop-textures.mjs';
import { BUILDERS } from '../art/backdrop-cards.mjs';
import { BUILDERS as YARD_BUILDERS, OUT_DIR as YARD_DIR } from '../art/courtyard-cards.mjs';

const { PNG } = createRequire(import.meta.url)('pngjs');
const list = (dir, ext) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(ext)).sort() : []);

export async function checkPaintBudgets(root) {
  const budgets = JSON.parse(readFileSync(join(root, 'tools/assets/budgets.json'), 'utf8'));
  const errors = [];
  const rows = [];
  const over = (name, label, value, limit) => {
    const ok = typeof limit === 'number' && value <= limit;
    if (typeof limit !== 'number') errors.push(`${name}: budgets.json is missing "${label}"`);
    else if (!ok) errors.push(`${name}: ${label} ${value} > budget ${limit}`);
    return { label, value, limit, ok };
  };

  // ---- backdrop textures
  const bLines = budgets.backdrop ?? {};
  const files = list(join(root, 'assets/backdrop'), '.png');
  for (const name of Object.keys(bLines)) if (!files.includes(`${name}.png`)) errors.push(`budgets.json backdrop has "${name}" but assets/backdrop/${name}.png does not exist: stale budget line`);
  for (const f of files) {
    const name = f.slice(0, -4);
    const file = join(root, 'assets/backdrop', f);
    const png = PNG.sync.read(readFileSync(file));
    const layer = LAYERS.find((l) => l.out === f);
    if (!layer) errors.push(`${name}: assets/backdrop/${f} is not made by tools/art/backdrop-textures.mjs (no layer writes it)`);
    else {
      const want = buildLayer(layer);
      if (want.width !== png.width || want.height !== png.height || Buffer.compare(want.data, png.data) !== 0) errors.push(`${name}: the committed PNG is not what the seed gives. Run: node tools/art/backdrop-textures.mjs`);
    }
    const b = bLines[name];
    if (!b) { errors.push(`${name}: no backdrop budget in tools/assets/budgets.json (measured ${Math.max(png.width, png.height)} px, ${statSync(file).size} B)`); continue; }
    rows.push({ name: `backdrop/${name}`, checks: [over(name, 'px', Math.max(png.width, png.height), b.px), over(name, 'bytes', statSync(file).size, b.bytes)] });
  }
  for (const l of LAYERS) if (!files.includes(l.out)) errors.push(`${l.out}: tools/art/backdrop-textures.mjs makes it but assets/backdrop/ does not have it`);

  // ---- painted cards (D-021): assets/backdrop/cards/*.png, each exactly what tools/art/backdrop-cards.mjs gives
  const kLines = budgets.cards ?? {};
  const cards = list(join(root, 'assets/backdrop/cards'), '.png');
  for (const name of Object.keys(kLines)) if (!cards.includes(`${name}.png`)) errors.push(`budgets.json cards has "${name}" but assets/backdrop/cards/${name}.png does not exist: stale budget line`);
  for (const f of cards) {
    const name = f.slice(0, -4);
    const file = join(root, 'assets/backdrop/cards', f);
    const png = PNG.sync.read(readFileSync(file));
    const build = BUILDERS[name];
    if (!build) errors.push(`${name}: assets/backdrop/cards/${f} is not made by tools/art/backdrop-cards.mjs (no card of that name)`);
    else {
      const want = build().png;
      if (want.width !== png.width || want.height !== png.height || Buffer.compare(want.data, png.data) !== 0) errors.push(`${name}: the committed card is not what its source gives. Run: node tools/art/backdrop-cards.mjs`);
    }
    const b = kLines[name];
    if (!b) { errors.push(`${name}: no cards budget in tools/assets/budgets.json (measured ${Math.max(png.width, png.height)} px, ${statSync(file).size} B)`); continue; }
    rows.push({ name: `cards/${name}`, checks: [over(name, 'px', Math.max(png.width, png.height), b.px), over(name, 'bytes', statSync(file).size, b.bytes)] });
  }
  for (const name of Object.keys(BUILDERS)) if (!cards.includes(`${name}.png`)) errors.push(`${name}.png: tools/art/backdrop-cards.mjs makes it but assets/backdrop/cards/ does not have it`);

  // ---- the courtyard's cards (D-026): assets/courtyard/*.png, each exactly what tools/art/courtyard-cards.mjs gives
  const yLines = budgets.courtyard ?? {};
  const yard = list(join(root, YARD_DIR), '.png');
  for (const name of Object.keys(yLines)) if (!yard.includes(`${name}.png`)) errors.push(`budgets.json courtyard has "${name}" but ${YARD_DIR}/${name}.png does not exist: stale budget line`);
  for (const f of yard) {
    const name = f.slice(0, -4);
    const file = join(root, YARD_DIR, f);
    const png = PNG.sync.read(readFileSync(file));
    const build = YARD_BUILDERS[name];
    if (!build) errors.push(`${name}: ${YARD_DIR}/${f} is not made by tools/art/courtyard-cards.mjs (no card of that name)`);
    else {
      const want = build().png;
      if (want.width !== png.width || want.height !== png.height || Buffer.compare(want.data, png.data) !== 0) errors.push(`${name}: the committed card is not what the script gives. Run: node tools/art/courtyard-cards.mjs`);
    }
    const b = yLines[name];
    if (!b) { errors.push(`${name}: no courtyard budget in tools/assets/budgets.json (measured ${Math.max(png.width, png.height)} px, ${statSync(file).size} B)`); continue; }
    rows.push({ name: `courtyard/${name}`, checks: [over(name, 'px', Math.max(png.width, png.height), b.px), over(name, 'bytes', statSync(file).size, b.bytes)] });
  }
  for (const name of Object.keys(YARD_BUILDERS)) if (!yard.includes(`${name}.png`)) errors.push(`${name}.png: tools/art/courtyard-cards.mjs makes it but ${YARD_DIR}/ does not have it`);

  // ---- rigged characters
  const cLines = budgets.characters ?? {};
  const glbs = list(join(root, 'assets/char'), '.glb');
  for (const name of Object.keys(cLines)) if (!glbs.includes(`${name}.glb`)) errors.push(`budgets.json characters has "${name}" but assets/char/${name}.glb does not exist: stale budget line`);
  for (const f of glbs) {
    const name = f.slice(0, -4);
    const file = join(root, 'assets/char', f);
    const m = await measure(file);
    const doc = await (await io()).read(file);
    const bones = Math.max(0, ...doc.getRoot().listSkins().map((s) => s.listJoints().length));
    const clips = doc.getRoot().listAnimations().map((a) => a.getName()).sort();
    const b = cLines[name];
    if (!b) { errors.push(`${name}: no character budget in tools/assets/budgets.json (measured ${m.triangles} tris, ${m.bytes} B, ${m.materials} materials, ${m.draw_calls} draw calls, ${bones} bones, ${m.textures.length} textures; clips ${clips.join(' ')})`); continue; }
    const checks = [
      over(name, 'triangles', m.triangles, b.triangles),
      over(name, 'bytes', m.bytes, b.bytes),
      over(name, 'materials', m.materials, b.materials),
      over(name, 'draw_calls', m.draw_calls, b.draw_calls),
      over(name, 'bones', bones, b.bones),
      over(name, 'textures', m.textures.length, b.textures),
    ];
    const want = [...(b.clips ?? [])].sort();
    if (JSON.stringify(want) !== JSON.stringify(clips)) errors.push(`${name}: clips are [${clips.join(', ')}], budgets.json says [${want.join(', ')}]`);
    rows.push({ name: `char/${name}`, checks });
  }
  return { ok: errors.length === 0, rows, errors };
}

export function printPaintBudget({ rows, errors }) {
  for (const r of rows) {
    console.log(`  ${r.name}`);
    for (const c of r.checks) console.log(`    ${c.ok ? '✓' : '✗'} ${c.label.padEnd(26)} ${String(c.value).padStart(7)}  / ${c.limit}`);
  }
  for (const e of errors) console.log(`  ✗ ${e}`);
}
