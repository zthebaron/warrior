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
  // The far gate is the hero asset `gate`, 8 m tall: at that height its eaves (5.0 m) clear the wall's top, its
  // doorway is 4.4 m wide between posts whose outer faces are 6 m apart, and its tie beam is 4.17 m up. It has
  // four posts, two in the wall's line and two 2.4 m out from it: `out` is how far the model's centre stands
  // from the wall's line, and `post` the depth of a post's collision. Its doorway holds the door.
  gate: { half: 3, door: 2.2, doorTop: 4.8, height: 8, out: 1.2, post: 0.8 },
  // The way in: an open gateway 7 m wide, two tall posts and a beam far overhead, drawn in ink. No roof and no
  // doorway to look through: the follow camera is 6.7 m behind the warrior, so it is still outside this wall
  // when he stands at the checkpoint, and it has to see the yard from there. And not the gate model: a painted
  // thing may not stand in front of a torii (D-020), and the checkpoint torii is just inside.
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
  // the way in: its two posts, at the ends of the near wall
  box(nearX - Y.entrance.post / 2, nearX + Y.entrance.post / 2, -Y.entrance.half, -Y.entrance.half + Y.entrance.post, -Y.deep, Y.entrance.postTop, 'gate_frame'),
  box(nearX - Y.entrance.post / 2, nearX + Y.entrance.post / 2, Y.entrance.half - Y.entrance.post, Y.entrance.half, -Y.deep, Y.entrance.postTop, 'gate_frame'),
  wallBox(farX - Y.wall.thick / 2, farX + Y.wall.thick / 2, -Y.yard.half, -Y.gate.half),
  wallBox(farX - Y.wall.thick / 2, farX + Y.wall.thick / 2, Y.gate.half, Y.yard.half),
  // the far gate's four posts, as collision: two in the wall's line (off the yard's own box, so no swordsman's
  // ground is cut by them) and two on the landing beyond it. What is drawn is the gate model below.
  ...[farX, farX + 2 * Y.gate.out].flatMap((px) => [-1, 1].map((side) =>
    box(px - Y.gate.post / 2, px + Y.gate.post / 2, side > 0 ? Y.gate.door : -Y.gate.half, side > 0 ? Y.gate.half : -Y.gate.door, 0, Y.gate.doorTop, 'gate_post'))),
  // the far gate's door: it stands in the doorway until every swordsman is down (D-026)
  box(farX - Y.wall.thick / 2, farX + Y.wall.thick / 2, -Y.gate.door, Y.gate.door, 0, Y.gate.doorTop, 'gate_door'),
  { asset: 'kit_torii', pos: [Y.torii, 0, 0], tag: 'torii' },
  // the far gate: the model's front is +z and it is as wide as it is along x, so it is turned a quarter
  { asset: 'gate', pos: [farX + Y.gate.out, 0, 0], rot: [0, 90, 0], scale: Y.gate.height, collider: 'none', tag: 'gate' },
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
