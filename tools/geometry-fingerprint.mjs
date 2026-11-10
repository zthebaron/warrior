// geometry-fingerprint — everything a level's verdicts are computed FROM, as one canonical JSON.
//
//   node tools/geometry-fingerprint.mjs <level.json> <manifest.json> [--out=f.json] [--against=f.json]
//
// Dressing (CH1-ASSETS) must not move collision. This dumps, for one level:
//   colliders   every placement that becomes a Rapier collider (geometry with collider != none,
//               platforms, hazard volumes), with its asset, transform and, for a kit mesh, a sha256 of
//               the placed collision soup the linter casts against (the loader's own triangles)
//   faces       FACE_RISE: every face along every `ground` segment (groundFaces)
//   rises       READABLE_RISE inputs/outputs per rising non-ground segment (riseViews)
//   assist      ASSIST_CASE (assistCases)
//   lint        lintLevel's ok/errors/warnings, verbatim
// --against compares with an earlier dump and exits 1 naming the first key that differs.
// Exit: 0 identical (or written) · 1 differs · 2 usage.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { lintLevel, withColliders, obstaclesOf, riseViews, assistCases, groundFaces } from './lint-level.mjs';

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const [levelPath, manifestPath] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!levelPath || !manifestPath) { console.error('usage: node tools/geometry-fingerprint.mjs <level.json> <manifest.json> [--out=f] [--against=f]'); process.exit(2); }

const level = JSON.parse(fs.readFileSync(levelPath, 'utf8'));
const manifest = await withColliders(JSON.parse(fs.readFileSync(manifestPath, 'utf8')), manifestPath);
const byName = new Map(manifest.assets.map((a) => [a.name, a]));
const sha = (x) => crypto.createHash('sha256').update(x).digest('hex');

const colliders = [];
(level.geometry ?? []).forEach((g, gi) => {
  const a = byName.get(g.asset);
  const kind = g.collider ?? a?.collider;
  if (kind === 'none') return;
  colliders.push({ gi, asset: g.asset, pos: g.pos, rot: g.rot ?? null, scale: g.scale ?? null, collider: kind });
});
// placed soups, as the linter sees them (only collider-bearing placements reach obstaclesOf)
const obst = obstaclesOf(level, manifest).map((o) => ({ gi: o.gi, mn: o.mn, mx: o.mx, tris: o.tris ? sha(Buffer.from(o.tris.W.buffer)) + ':' + sha(Buffer.from(new Uint32Array(o.tris.ix).buffer)) : null }));
const platforms = level.platforms ?? [];
const hazards = level.hazards ?? [];

const P = (w) => (Array.isArray(w) ? w : w.pos);
const cp = level.critical_path ?? [];
const boxes = (level.geometry ?? []).map((g, gi) => (g.asset !== 'prim_box' || !Array.isArray(g.scale) || (Array.isArray(g.rot) && g.rot.some((v) => v !== 0)) ? null
  : { gi, x0: g.pos[0] - g.scale[0] / 2, x1: g.pos[0] + g.scale[0] / 2, z0: g.pos[2] - g.scale[2] / 2, z1: g.pos[2] + g.scale[2] / 2, top: g.pos[1] + g.scale[1] / 2, bot: g.pos[1] - g.scale[1] / 2 })).filter(Boolean);
const faces = [];
for (let i = 1; i < cp.length; i++) if (cp[i]?.via === 'ground') faces.push({ seg: `${i - 1}->${i}`, faces: groundFaces(boxes, P(cp[i - 1]), P(cp[i])) });

const out = {
  level: level.id,
  colliders, obstacles: obst, platforms, hazards,
  critical_path: cp,
  faces,
  rises: riseViews(level, manifest),
  assist: assistCases(level, manifest),
  lint: lintLevel(level, manifest),
};
const text = JSON.stringify(out, null, 1);
const hash = sha(text);
console.log(`fingerprint ${level.id}: ${hash}  (${colliders.length} collider placements, ${obst.length} obstacles, ${faces.length} ground segs, ${out.rises.length} rises, ${out.assist.length} assist, lint ${out.lint.ok ? 'PASS' : 'FAIL'} ${out.lint.errors.length}E/${out.lint.warnings.length}W)`);
if (args.out) fs.writeFileSync(args.out, text + '\n');
if (args.against) {
  const prev = JSON.parse(fs.readFileSync(args.against, 'utf8'));
  for (const k of Object.keys({ ...prev, ...out })) {
    if (JSON.stringify(prev[k]) !== JSON.stringify(out[k])) { console.error(`DIFFERS at "${k}"`); process.exit(1); }
  }
  console.log(`IDENTICAL to ${args.against}`);
}
