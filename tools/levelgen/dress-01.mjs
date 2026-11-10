// dress-01 — derive chapter 1's art placements FROM its collision geometry (CH1-ASSETS).
//
//   node tools/levelgen/dress-01.mjs [levels/01-lower-stair.json]      rewrite in place
//   node tools/levelgen/dress-01.mjs --check                             exit 1 if the file is stale
//
// ASSETS DRESS THE GEOMETRY, THEY DO NOT REPLACE IT. Every prim_box keeps its trimesh collider. For
// each one this emits a collider-none kit placement with the box's own pos and scale, so the drawn
// top IS the collider top, and FACE_RISE / READABLE_RISE / ASSIST_CASE / the MOVE table / every golden,
// all computed against the boxes, are untouched. Placements are APPENDED after every authored entry:
// lint messages cite geometry[i], and appending keeps every existing index (and message) identical.
// tools/geometry-fingerprint.mjs is the proof: run it before and after, --against.
//
// Text surgery, not a JSON round-trip: the authored file keeps literals like `9.0`, so re-serialising
// would rewrite lines nobody changed. Each generated entry is one line tagged "dress:...", stripped
// and regenerated on every run. Deterministic: same boxes in, same bytes out.
//
// Which kit dresses which box (rules, not a hand list, so a geometry edit re-derives its art):
//   tread   x extent <= TREAD_MAX_X: a stair tread or a perch stone          -> kit_stair_tread
//   raised  overlaps a box with a LARGER footprint (the first step, the two  -> kit_stair_tread,
//           1.75 shelves): cut stone, inflated by                              x and z by OVERLAP_EPS
//           OVERLAP_EPS in x and z, because its sides are coplanar with the
//           box under it and two different patterns on one plane z-fight
//   ledge   everything else (the seam ledges, the sweep slabs, the landings) -> kit_ledge, tiled
//           along x into pieces of ~TILE_X so its fraction-sized strokes stay thin; alternate tiles
//           turned 180deg so the pattern does not visibly repeat
// Plus HERO: the hero dressing (D-020). The far field is painted, in src/loaders/backdrop.ts, not placed here.
// Every constant here is recorded in MEASUREMENTS.md "CH1-ASSETS dressing".
import fs from 'node:fs';

const TREAD_MAX_X = 0.6;   // the stair treads and the perch stones are 0.6u along x; no ledge is under 3u
const OVERLAP_EPS = 0.08;  // u, total (0.04 per side). DERIVED: > kit_ledge's stroke float (0.003 x a 7u face = 0.021u)
                           // + depth resolution at 130u (~0.01u, 24-bit, near 0.1), so the box below's strokes stay inside
const TILE_X = 4.5;        // u: kit_ledge's 0.014 stroke is 0.06u wide at this length
const TILE_OVERLAP = 0.01; // u, each side of an INTERIOR seam (D-018): abutting tops leave a raster crack through
                           // which the neighbour's ink lip shows and the §6 ink edge outlines it as a dotted
                           // line. Overlapped coplanar tops are the same paper fill, so nothing z-fights.
                           // The box's own ends stay exact.

// D-020: the far field is PAINTED (src/loaders/backdrop.ts: paper sky, far ridges, bare-paper mist, mid cliffs),
// not kit geometry. The kit_mid_cliff, kit_far_peak and kit_cloud_band placements that stood here are gone.
//
// What IS placed here is hero dressing (assets/hero, imported as class hero: collider none, drawn on the
// paint layer). Each model is 1 unit tall as delivered, so scale is its height in u. Tim's ruling: lanterns as
// dressing; the cliff and the boulder SPARINGLY, each with its own rotation and scale so no two read as copies;
// the painted backdrop stays the main cliff mass. Nothing stands on the walking line (z 0), and nothing that
// looks like an obstacle stands where a player can walk: the cliffs stand in the mist.
const HERO = [
  // stone lanterns at the path's edge, a little taller than the figure (1.9)
  { asset: 'lantern', pos: [2.5, 0, -2.7], rot: [0, 15, 0], scale: 2.2 },
  { asset: 'lantern', pos: [24.5, 0, 2.8], rot: [0, 100, 0], scale: 2.2 },
  { asset: 'lantern', pos: [47, 5.5, -2.7], rot: [0, 190, 0], scale: 2.2 },
  { asset: 'lantern', pos: [104.5, 9, -2.7], rot: [0, 280, 0], scale: 2.2 },
  // D-021: the three boulders that sat on top of the rock masses are gone. The masses collide and are not
  // drawn (the painted cliff wall stands there: src/loaders/cliff-wall.ts), so a boulder on one would float.
  // two cliff stacks far out in the void, feet in the mist (the mist is solid paper below y -7): two different models
  { asset: 'cliff', pos: [30, -9, 62], rot: [0, 35, 0], scale: [14, 24, 14] },
  { asset: 'cliff_b', pos: [92, -9, 78], rot: [0, 160, 0], scale: [18, 30, 17] },
];

const args = process.argv.slice(2);
const check = args.includes('--check');
const file = args.find((a) => !a.startsWith('--')) ?? 'levels/01-lower-stair.json';
const before = fs.readFileSync(file, 'utf8');

// 1. strip the previous run's lines
const DRESS_LINE = /^[ \t]*\{[^\n]*"tag": "dress:[^"\n]*"[^\n]*\},?\n/gm;
let text = before.replace(DRESS_LINE, '');

// 2. find the geometry array (string-aware bracket matching)
const open = text.indexOf('"geometry": [');
if (open < 0) throw new Error(`${file}: no "geometry" array`);
let i = text.indexOf('[', open), depth = 0, inStr = false;
for (; i < text.length; i++) {
  const ch = text[i];
  if (inStr) { if (ch === '\\') i++; else if (ch === '"') inStr = false; continue; }
  if (ch === '"') inStr = true;
  else if (ch === '[' || ch === '{') depth++;
  else if (ch === ']' || ch === '}') { depth--; if (depth === 0) break; }
}
const close = i; // index of the geometry array's closing ]
let head = text.slice(0, close).replace(/,(\s*)$/, '$1'); // a stripped last entry leaves a trailing comma
const tail = text.slice(close);

// 3. derive from the authored boxes (the parsed geometry, generated lines already removed)
const level = JSON.parse(head + tail);
const boxes = level.geometry.map((g, gi) => ({ g, gi })).filter(({ g }) => g.asset === 'prim_box' && Array.isArray(g.scale) && !(g.rot ?? []).some((v) => v !== 0));
const ext = (g) => ({ x0: g.pos[0] - g.scale[0] / 2, x1: g.pos[0] + g.scale[0] / 2, y0: g.pos[1] - g.scale[1] / 2, y1: g.pos[1] + g.scale[1] / 2, z0: g.pos[2] - g.scale[2] / 2, z1: g.pos[2] + g.scale[2] / 2 });
const overlaps = (a, b) => a.x0 < b.x1 - 1e-9 && b.x0 < a.x1 - 1e-9 && a.z0 < b.z1 - 1e-9 && b.z0 < a.z1 - 1e-9 && a.y0 < b.y1 - 1e-9 && b.y0 < a.y1 - 1e-9;
const r6 = (v) => Math.round(v * 1e6) / 1e6;
const out = [];
for (const { g, gi } of boxes) {
  const e = ext(g);
  const tag = `dress:g${gi}`;
  if (g.scale[0] <= TREAD_MAX_X + 1e-9) { out.push({ asset: 'kit_stair_tread', pos: g.pos, scale: g.scale, collider: 'none', tag }); continue; }
  // raised: the SMALLER of two overlapping boxes (the first step on the floor, a shelf straddling two
  // ledges). The larger box keeps its own ledge dressing.
  const area = (g) => g.scale[0] * g.scale[2];
  const under = boxes.find((o) => o.gi !== gi && overlaps(e, ext(o.g)) && area(o.g) > area(g) + 1e-9);
  if (under) { out.push({ asset: 'kit_stair_tread', pos: g.pos, scale: [r6(g.scale[0] + OVERLAP_EPS), g.scale[1], r6(g.scale[2] + OVERLAP_EPS)], collider: 'none', tag }); continue; }
  const n = Math.max(1, Math.round(g.scale[0] / TILE_X)), w = g.scale[0] / n;
  for (let k = 0; k < n; k++) {
    const lo = e.x0 + w * k - (k > 0 ? TILE_OVERLAP : 0), hi = e.x0 + w * (k + 1) + (k < n - 1 ? TILE_OVERLAP : 0);
    out.push({ asset: 'kit_ledge', pos: [r6((lo + hi) / 2), g.pos[1], g.pos[2]], ...(k % 2 ? { rot: [0, 180, 0] } : {}), scale: [r6(hi - lo), g.scale[1], g.scale[2]], collider: 'none', tag: n > 1 ? `${tag}.${k}` : tag });
  }
}
HERO.forEach((b, k) => out.push({ ...b, collider: 'none', tag: `dress:hero.${k}` }));

// 4. one line per entry, key order fixed
const line = (o) => '    {' + ['asset', 'pos', 'rot', 'scale', 'collider', 'tag'].filter((k) => o[k] !== undefined).map((k) => `"${k}": ${JSON.stringify(o[k]).replace(/,/g, ', ')}`).join(', ') + '}';
const after = head.replace(/\s*$/, '') + ',\n' + out.map(line).join(',\n') + '\n  ' + tail.replace(/^\s*/, '');
JSON.parse(after); // still JSON

if (check) {
  if (after !== before) { console.error(`${file}: dressing is stale — run node tools/levelgen/dress-01.mjs`); process.exit(1); }
  console.log(`${file}: dressing up to date (${out.length} placements)`);
} else {
  fs.writeFileSync(file, after);
  const by = out.reduce((m, o) => ((m[o.asset] = (m[o.asset] ?? 0) + 1), m), {});
  console.log(`${file}: ${out.length} dressing placements ${JSON.stringify(by)}`);
}
