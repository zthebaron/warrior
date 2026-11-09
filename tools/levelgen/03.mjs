// Generator for levels/03-drifting-stones.json (CHAPTER-3). Data only; the linter and the playtest judge it.
import fs from 'fs';
const BOT = -12, W = 7;
const box = (x0, x1, top, extra = {}) => ({ asset: 'prim_box', pos: [(x0 + x1) / 2, (top + BOT) / 2, 0], scale: [x1 - x0, top - BOT, W], ...extra });
const ground = [
  box(-6, 12, 0), //    g0 spawn shelf
  box(15, 27, 0), //    g1 after the 3u gap
  box(33, 48.3, 1), //  g2 after the 6u double; T1 at its end, platform A boards here
  box(59.8, 66.5, 1), //g3 far side of the ride, under stone_a's docked half (2u overlap); T2 at its end
  box(68, 96, 1), //    g4 after the 1.5u dash gap; T3, the crow sweep
  box(97, 110.5, 2.5), //g5 up +1.5; T4 at its end, platform B boards here
  box(122, 128, 2.5), //g6 far side of ride B, under stone_b's docked half
  box(129.5, 140, 2.5), //g7 after the second 1.5u dash gap: goal
];
// A lintel covers the takeoff and the gap and ends 0.2 short of the landing lip, so the step up onto the far
// side has headroom (one that overhung the lip pinned the bot under it). 2.0 clear over the floor: a 1.9
// capsule fits, and any jump, even a tap (+0.995), bonks it.
const lintel = (x0, x1, floor) => ({ asset: 'prim_box', pos: [(x0 + x1) / 2, floor + 2.0 + 0.25, 0], scale: [x1 - x0, 0.5, W] });
const geometry = [
  ...ground,
  lintel(65.5, 67.8, 1),
  lintel(127, 129.3, 2.5),
  { asset: 'prim_box', pos: [83, 1.2, 3.2], scale: [0.6, 0.4, 0.6] },
];
const torii = [46, 64, 75, 108.2, 132];
const ys = { 46: 1, 64: 1, 75: 1, 108.2: 2.5, 132: 2.5 };
for (const x of torii) geometry.push({ asset: 'kit_torii', pos: [x, ys[x], 0] });
const topAt = (x) => (x < 30 ? 0 : x < 96 ? 1 : 2.5);
// Rocks stand 2.4u off the path edge (z -8, inner face -5.9 vs path edge -3.5): chapter 3 has climb and wall, and at
// z -5.7 (chapters 1-2) the chaos stage climbed onto them and wedged.
for (let x = -2; x <= 140; x += 7) geometry.push({ asset: 'kit_rock_mass', pos: [x, topAt(x) - 2, -8] });

const level = {
  id: '03-drifting-stones',
  title: 'The Drifting Stones',
  chapter: 3,
  moves_allowed: ['ground', 'jump', 'wall', 'double', 'climb', 'platform', 'dash'],
  palette: 'greybox',
  spawn: { pos: [0, 0, 0], facing: -90 },
  goal: { type: 'reach', pos: [134, 2.5, 0], radius: 1.5 },
  bounds: { min: [-25, -15, -25], max: [155, 45, 25] },
  geometry,
  platforms: [
    { id: 'stone_a', asset: 'prim_slab', path: [[49.8, 0.75, 0], [59.8, 0.75, 0]], duration: 2.5, easing: 'sine', loop: 'pingpong', collider: 'trimesh' },
    { id: 'stone_b', asset: 'prim_slab', path: [[112, 2.25, 0], [122, 2.25, 0]], duration: 2.5, easing: 'sine', loop: 'pingpong', collider: 'trimesh' },
  ],
  hazards: [
    { type: 'fall', y: -10 },
    { type: 'patroller', path: [[86, 2, -5], [86, 2, 5]], size: [2, 2, 2], speed: 5, phase: 0, crow: { perch: [83, 1.6, 3.2], to: [80, 6, 9.5], size: [0.35, 0.35, 0.6], lift: 0.11, away: 0.45 } },
  ],
  checkpoints: [
    { pos: [48, 1, 0], facing: -90 },
    { pos: [66, 1, 0], facing: -90 },
    { pos: [77, 1, 0], facing: -90 },
    { pos: [110.2, 2.5, 0], facing: -90 },
  ],
  lighting: { preset: 'greybox' },
  critical_path: [
    [0, 0, 0],
    { pos: [11.5, 0, 0], via: 'ground', note: 'edge of the first gap' },
    { pos: [15.5, 0, 0], via: 'jump', note: 'gap 3' },
    { pos: [26, 0, 0], via: 'ground', note: 'edge of the 6u gap' },
    { pos: [34, 1, 0], via: 'double', note: 'gap 6, +1: a jump short' },
    { pos: [48, 1, 0], via: 'ground', note: 'T1, at the edge where stone_a docks' },
    { pos: [49.8, 1, 0], via: 'ground', note: 'onto stone_a at its start' },
    { pos: [59.8, 1, 0], via: 'platform', platform: 'stone_a', note: 'the first ride: 10u over an 11.5u void (a double cannot bypass it), boarded from a torii' },
    { pos: [62, 1, 0], via: 'ground', note: 'step off' },
    { pos: [66, 1, 0], via: 'ground', note: 'T2, under the lintel edge' },
    { pos: [68.5, 1, 0], via: 'dash', note: 'the first dash: gap 1.5 under a lintel no jump clears, from a torii' },
    { pos: [77, 1, 0], via: 'ground', note: 'T3' },
    { pos: [92, 1, 0], via: 'ground', note: 'wait for the crow, then cross the sweep', cue: 1 },
    { pos: [95.5, 1, 0], via: 'ground', note: '1.5u short of the step' },
    { pos: [98.5, 2.5, 0], via: 'jump', note: '+1.5' },
    { pos: [110.2, 2.5, 0], via: 'ground', note: 'T4, at the edge where stone_b docks' },
    { pos: [112, 2.5, 0], via: 'ground', note: 'onto stone_b at its start' },
    { pos: [122, 2.5, 0], via: 'platform', platform: 'stone_b', note: 'ride again' },
    { pos: [124.5, 2.5, 0], via: 'ground', note: 'step off' },
    { pos: [127.5, 2.5, 0], via: 'ground', note: 'edge of the second lintel gap' },
    { pos: [130, 2.5, 0], via: 'dash', note: 'transfer: dash again, straight off the ride, over the void' },
    { pos: [134, 2.5, 0], via: 'ground', note: 'goal' },
  ],
  difficulty: 3,
};
fs.writeFileSync(new URL('../../levels/03-drifting-stones.json', import.meta.url), JSON.stringify(level, null, 2) + '\n');
console.log('wrote levels/03-drifting-stones.json', geometry.length, 'geometry');
