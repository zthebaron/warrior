#!/usr/bin/env node
// levels/05-courtyard.json, written from the yard's own measurements, so that a wall, the gateway in it and the
// door in the gateway cannot drift apart by a hand edit. The level file is what ships and what every tool reads;
// this script is how it was laid out. `--check` (run by `npm run lint:levels`) fails if the two differ.
//
//   node tools/levelgen/courtyard-05.mjs            write levels/05-courtyard.json
//   node tools/levelgen/courtyard-05.mjs --check    exit 1 if the file is not what this script writes
//
// The courtyard of Tim's painting (D-026): a causeway over the mist, a roofed gate, one walled yard of stone
// flags with three swordsmen in it, and the tiled gate at the far side, shut until the yard is clear.
// +x is the way in, as in every chapter. Every number here is level data: MEASUREMENTS "D-026 the courtyard".
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../../levels/05-courtyard.json', import.meta.url));

// ---- the yard, in metres -------------------------------------------------------------------------------------
const Y = {
  deep: 8,              // how far every floor and wall goes down under y 0 (as chapter 4's ground does)
  causeway: { x0: -3, x1: 10, half: 4.5 },   // the walk in: a terrace 9 wide, open over the mist on both sides
  yard: { x0: 10, x1: 32, half: 8 },         // the flags: 22 deep, 16 wide, ONE box (a swordsman's ground is one box top)
  wall: { thick: 1, top: 4.8 },              // above the highest catch a climb makes (MOVE.climb.maxRise 4.5)
  gate: { half: 3, door: 1.6, doorTop: 4.8 },// the far gate fills a 6 m gap in its wall; the doorway in it is 3.2 m wide
  // the way in: an open gateway as wide as the causeway, two tall posts and a beam far overhead. No roof and no
  // doorway to look through: the follow camera is 6.7 m behind the warrior, so it is still outside this wall
  // when he stands at the checkpoint, and it has to see the yard from there
  entrance: { half: 3.5, post: 0.5, postTop: 6.6 },
  landing: { x1: 38, half: 3.5 },            // beyond the far gate: where the goal is
  torii: 12,                                 // the checkpoint torii, just inside the entrance
};
const nearX = Y.yard.x0 - Y.wall.thick / 2, farX = Y.yard.x1 + Y.wall.thick / 2; // the centre lines of the two end walls
const outer = Y.yard.half + Y.wall.thick;                                        // the outside face of a side wall

/** A collision box from its two corners in x and z, standing from `y0` up to `y1`. */
const box = (x0, x1, z0, z1, y0, y1, tag) => ({
  asset: 'prim_box',
  pos: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
  scale: [x1 - x0, y1 - y0, z1 - z0],
  ...(tag ? { tag } : {}),
});
const wallBox = (x0, x1, z0, z1, tag = 'wall') => box(x0, x1, z0, z1, -Y.deep, Y.wall.top, tag);

const geometry = [
  box(Y.causeway.x0, Y.causeway.x1, -Y.causeway.half, Y.causeway.half, -Y.deep, 0, 'causeway'),
  box(Y.yard.x0, Y.yard.x1, -Y.yard.half, Y.yard.half, -Y.deep, 0, 'yard'),
  box(Y.yard.x1, Y.landing.x1, -Y.landing.half, Y.landing.half, -Y.deep, 0, 'landing'),
  // the side walls run the whole depth and close the corners
  wallBox(nearX - Y.wall.thick / 2, farX + Y.wall.thick / 2, -outer, -Y.yard.half),
  wallBox(nearX - Y.wall.thick / 2, farX + Y.wall.thick / 2, Y.yard.half, outer),
  // the two end walls, each with a gap for its gate
  wallBox(nearX - Y.wall.thick / 2, nearX + Y.wall.thick / 2, -Y.yard.half, -Y.entrance.half),
  wallBox(nearX - Y.wall.thick / 2, nearX + Y.wall.thick / 2, Y.entrance.half, Y.yard.half),
  wallBox(farX - Y.wall.thick / 2, farX + Y.wall.thick / 2, -Y.yard.half, -Y.gate.half),
  wallBox(farX - Y.wall.thick / 2, farX + Y.wall.thick / 2, Y.gate.half, Y.yard.half),
  // the entrance's two posts, at the ends of the near wall
  box(nearX - Y.entrance.post / 2, nearX + Y.entrance.post / 2, -Y.entrance.half, -Y.entrance.half + Y.entrance.post, -Y.deep, Y.entrance.postTop, 'gate_post'),
  box(nearX - Y.entrance.post / 2, nearX + Y.entrance.post / 2, Y.entrance.half - Y.entrance.post, Y.entrance.half, -Y.deep, Y.entrance.postTop, 'gate_post'),
  // the far gate: a panel either side of the doorway. They stand in the wall's line, off the yard's own box.
  wallBox(farX - Y.wall.thick / 2, farX + Y.wall.thick / 2, -Y.gate.half, -Y.gate.door, 'gate_side'),
  wallBox(farX - Y.wall.thick / 2, farX + Y.wall.thick / 2, Y.gate.door, Y.gate.half, 'gate_side'),
  // the far gate's door: it stands in the doorway until every swordsman is down (D-026)
  box(farX - Y.wall.thick / 2, farX + Y.wall.thick / 2, -Y.gate.door, Y.gate.door, 0, Y.gate.doorTop, 'gate_door'),
  { asset: 'kit_torii', pos: [Y.torii, 0, 0], tag: 'torii' },
];

const level = {
  id: '05-courtyard',
  title: 'The Courtyard',
  chapter: 5,
  palette: 'ink',
  spawn: { pos: [0, 0, 0], facing: -90 },
  goal: { type: 'reach', pos: [35.5, 0, 0], radius: 1.5, once_clear: true },
  bounds: { min: [-20, -15, -18], max: [48, 40, 18] },
  lighting: { preset: 'ink', ambienceZone: 'courtyard' },
  difficulty: 3,
  moves_allowed: ['ground', 'jump', 'wall', 'double', 'climb', 'platform', 'dash', 'dashjump'],
  geometry,
  hazards: [{ type: 'fall', y: -10 }],
  // the painting has one to the left, one to the right and one nearer the middle, further in
  enemies: [
    { id: 'guard-left', type: 'swordsman', pos: [19.5, 0, -2.4], facing: 90 },
    { id: 'guard-right', type: 'swordsman', pos: [19.9, 0, 2.4], facing: 90 },
    { id: 'guard-middle', type: 'swordsman', pos: [21.9, 0, 0.2], facing: 90 },
  ],
  checkpoints: [{ pos: [Y.torii + 2, 0, 0], facing: -90 }],
  critical_path: [
    [0, 0, 0],
    { pos: [nearX, 0, 0], via: 'ground', note: 'through the entrance gate' },
    { pos: [Y.torii + 2, 0, 0], via: 'ground', note: 'T1, just inside: the yard is ahead' },
    { pos: [21, 0, 0], via: 'ground', note: 'the middle of the yard: three swordsmen' },
    { pos: [Y.yard.x1 - 1, 0, 0], via: 'ground', note: 'before the far gate, shut until the yard is clear' },
    { pos: [35.5, 0, 0], via: 'ground', note: 'through the gate: the goal' },
  ],
};

const text = JSON.stringify(level, null, 2) + '\n';
if (process.argv.includes('--check')) {
  const have = readFileSync(OUT, 'utf8');
  if (have !== text) { console.error('levels/05-courtyard.json is not what tools/levelgen/courtyard-05.mjs writes: change the script and run it, not the file'); process.exit(1); }
  console.log(`levels/05-courtyard.json: as laid out (${geometry.length} placements)`);
} else {
  writeFileSync(OUT, text);
  console.log(`wrote levels/05-courtyard.json (${geometry.length} placements)`);
}
