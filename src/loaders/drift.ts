// The drifting stones (D-029): what an ink level whose ambience zone is `drift` is drawn as. Chapter 3.
//
// Chapter 2 is a climb, read from below: the top of every face is a paper lip, the edge of ground to catch
// (seam.ts). Chapter 3 is a crossing, read from ABOVE: he looks down on gaps and across them, and what he needs
// to see is where ground stops, where it starts again, and the two stones that carry him over the void. So this
// level's own boxes are drawn here by D-028's method, with three differences:
//
//   the brink        the top `brink.depth` u of every face is one dark band, with no paper over it. From behind
//                    and above, the far side of a gap shows only the top half metre of its face: here that slice
//                    IS the dark band, so a gap is a dark slot between two papers, and the far top is paper
//                    starting at a hard edge. Ground he acts on is bare paper edged in dark; rock that is only
//                    scenery (the painted wall) is brushwork with no edge.
//   rock that floats a box thinner than `minSlab` (the two lintels that force the dash, a crow's perch) hangs in
//                    the air: it is the dark band all the way down, with a paper top and a dark underside.
//                    A moving stone (buildDriftStone) is the same slab with a dark keel of rock hanging under it:
//                    the darkest thing in the void, so where it is can be read at any distance, and its top is
//                    mist-pale, one step off the paper of the void and of the ground. It is ink-pass geometry only: the paint
//                    layer's rule is that nothing painted moves (tools/harness/post.ts, D-020), and it rides the
//                    platform's own mesh, so it is the `platform` move and not ambient motion (NOT #18).
//   where it goes    under each stone's travel lies one streak of mist, dock to dock, fixed in the world: the
//                    channel it drifts along. It says where the stone is going before it gets there.
//
// No painted face is stretched (D-029): the brushwork is the seam's two square cards (assets/seam, already paid
// for), laid as SQUARE tiles, each tile the whole painting or a crop of it at a face's end, never scaled to fit.
// Along a face the tiles run through a cycle of four (two paintings, each also mirrored), so a face shows the
// same strokes again only every 28 u (B-112: every 7 to 9 u in chapter 2).
//
// The mist stands higher here than in chapters 1 and 2 (backdrop.ts takes this level's heights): the rock's feet
// dissolve 1.5 u under the lowest top. Far rocks hang in the void with their feet in the air.
//
// RENDER ONLY. Not one collider is made or changed here. Every number is in MEASUREMENTS.md "D-029 the drift's look".

import * as THREE from 'three';

import { paint, paintMaterial } from '../engine/paint-layer';
import { ramp, type RampName } from '../engine/palette';
import { cardAspect, cardPlane, cardTexture } from './backdrop';
import { Quads, rockLedges, seamCard, type SeamBox, type SeamRock } from './seam';

type Vec3 = [number, number, number];

export const DRIFT = {
  /** `lighting.ambienceZone` of a level drawn this way */
  zone: 'drift',
  // ramp steps (STYLE §2)
  top: 'paper-cream',
  face: 'mist-pale',
  /** the dark band at the top of every face (u), and its step */
  brink: { depth: 0.5, step: 'ink-grey' },
  /** a box thinner than this (u) is rock hanging in the air: the band all the way down, and an underside */
  minSlab: 1,
  under: 'ink-deep',
  // ---- the paint layer: the seam's cards (assets/seam), in square tiles of `tile` u ----
  // cycle: the card of each tile along a face, and whether it is mirrored; ink: how much of its ink is laid.
  // Across the path a face is 7 u wide: one tile, the whole painting. Down a face a tile is laid from under the
  // brink and repeats mirrored (the texture's own wrap), 7 u down: in the mist.
  tile: 7,
  cycle: [['seam_face_a', false], ['seam_face_b', true], ['seam_face_a', true], ['seam_face_b', false]] as [string, boolean][],
  ink: 0.85,
  /** draw order on the paint layer: before the far field's mist sheets, which are paper over whatever stands in them */
  order: -20,
  /** the rock wall's ledges within reach, as level ground (seam.ts rockLedges) */
  ledge: { reach: 6, up: 0.9, step: 'paper-cream' } as { reach: number; up: number; step: RampName },
  /** the mist's heights in this level (chapters 1 and 2: -7 and -3). The lowest landing is y 0. */
  mist: { baseY: -5.5, topY: -1.5 },
  // A moving stone, in the ink pass. Its four sides are the brink's step. top: mist-pale, the one top in the level
  // that is not paper: docked, he looks DOWN on it, and a paper top over a paper void is an outline and nothing
  // else (measured: 94% of it paper on paper). Mist-pale is one step off the paper at any distance (the post pass
  // never pushes it) and tells the stone from the ground it docks against. lift: the stone's top lies in the
  // plane of the ground at each dock (0.5 u of it at one, 2 u at the other), so it is drawn with this polygon
  // offset (factor and units): the stone wins that tie, and wins it over the path's dry-brush (offset -1) too.
  // keel: rock hanging under it, an uneven pyramid from `inset` u inside the slab's underside down to a point
  // `drop` u below it, `off` u off centre (along the path, across it). It has no collider: it is under a slab
  // he stands on, over the void.
  stone: { top: 'mist-pale', lift: -2, keel: { inset: 0.35, drop: 1.7, off: [0.45, -0.3], steps: ['ink-deep', 'ink-black'] as RampName[] } },
  // The channel under a stone's travel: one mist card lying flat, at its own proportion, as long as the travel
  // plus the stone plus `beyond` u past each dock (its thin ends lie inside the rock he boards from; what shows
  // is its middle, wider than the stone, so it is seen on both sides of it from above), `over` u above the
  // mist's top. order: after the mist sheets (they would paper over it).
  channel: { card: 'mist_a', beyond: 3, over: 0.15, ink: 0.6, order: 60 },
  // The far field (src/loaders/backdrop.ts BACKDROP.cliffs columns: card, x, z, height, yaw, ink, mirrored):
  // three towers behind the wall and one past each end. Fewer and thinner than the seam's eight: more void.
  cliffs: [
    ['cliff_a', 18, -58, 60, 8, 0.5, true],
    ['cliff_c', 70, -62, 72, -6, 0.45, false],
    ['cliff_b', 122, -58, 64, 10, 0.5, true],
    ['cliff_c', -34, -30, 46, 40, 0.55, true],
    ['cliff_a', 172, -16, 56, -80, 0.5, true],
  ] as [string, number, number, number, number, number, boolean][],
  // Rocks adrift in the void: a cliff painting hung with its foot in the air (its foot fades in the painting
  // itself). Columns: card, x, foot y, z, height, yaw, ink, mirrored. 18 u and more from the path's edge, thin
  // (STYLE §3: mid band): nothing he could take for a place to stand. Each is turned to face the way he comes
  // (a card facing straight across the path is a sliver from behind him). order: after the mist sheets.
  adrift: [
    ['cliff_b', 36, 2, 24, 14, 232, 0.5, false],
    ['cliff_a', 64, 6, 38, 20, 236, 0.42, true],
    ['cliff_c', 96, 1.5, 22, 12, 228, 0.5, false],
    ['cliff_a', 118, 8, 44, 22, 238, 0.4, false],
    ['cliff_b', 152, 4, 28, 15, 232, 0.45, true],
  ] as [string, number, number, number, number, number, number, boolean][],
  adriftOrder: 40,
} as const;

/**
 * What buildDrift reads of a look (D-030): the drift's own (DRIFT, the default) or another zone's on the same
 * method (summit.ts). hang: a box whose foot stands above the mist's top hangs in the air, and is drawn with its
 * underside and, under that, a root of rock narrowing from `inset` u inside the underside down to a ridge at the
 * mist's base, where the mist takes it; steps: its two sides' values. Without `hang`: the drift, as D-029 built it.
 */
export interface RockLook {
  top: RampName; face: RampName; brink: { depth: number; step: RampName }; minSlab: number; under: RampName;
  tile: number; cycle: readonly (readonly [string, boolean])[]; ink: number; order: number;
  ledge: { reach: number; up: number; step: RampName };
  mist: { baseY: number; topY: number };
  channel: { card: string; beyond: number; over: number; ink: number; order: number };
  adrift: readonly (readonly [string, number, number, number, number, number, number, boolean])[];
  adriftOrder: number;
  hang?: { inset: number; steps: readonly RampName[] };
}

/** Where a moving stone travels: the two ends of its path (its centre) and its size. */
export interface DriftTravel { from: Vec3; to: Vec3; size: Vec3 }

const col = (name: RampName): THREE.Color => new THREE.Color(ramp(name));
const D = DRIFT;

/**
 * A moving stone as the ink pass draws it: a slab of `size`, centred on its own origin, with a paper top, dark
 * sides and a dark keel under it. One mesh, flat fills, no texture: it moves, and nothing painted may.
 */
export function buildDriftStone(size: THREE.Vector3): { mesh: THREE.Mesh; dispose(): void } {
  const q = new Quads();
  const hx = size.x / 2, hy = size.y / 2, hz = size.z / 2;
  const cTop = col(D.stone.top), cRim = col(D.brink.step), cUnder = col(D.under);
  q.flat([-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz], cTop);
  q.flat([hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz], cRim);     // +x
  q.flat([-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz], cRim); // -x
  q.flat([-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz], cRim);     // +z
  q.flat([hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz], cRim); // -z
  q.flat([-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz], cUnder); // the underside, seen from below
  const k = D.stone.keel, ix = hx - k.inset, iz = hz - k.inset;
  const apex: Vec3 = [k.off[0], -hy - k.drop, k.off[1]];
  const base: Vec3[] = [[-ix, -hy, iz], [ix, -hy, iz], [ix, -hy, -iz], [-ix, -hy, -iz]];
  for (let i = 0; i < 4; i++) q.tri(base[(i + 1) % 4]!, base[i]!, apex, col(k.steps[i % k.steps.length]!)); // outward, seen from beside it
  const geo = q.geometry();
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: D.stone.lift, polygonOffsetUnits: D.stone.lift }); // D-018: unlit, flat, ramp steps only
  const mesh = new THREE.Mesh(geo, mat);
  return { mesh, dispose() { geo.dispose(); mat.dispose(); } };
}

/**
 * Dress a drift level. `boxes`: every unturned box of the level; `rocks`: the rock masses it collides with and
 * does not draw; `travels`: its moving stones' paths; `L`: the look (the drift's own unless another zone passes
 * its own: D-030). Static: built once, never moved.
 */
export function buildDrift(boxes: SeamBox[], rocks: SeamRock[], travels: DriftTravel[], L: RockLook = DRIFT): { root: THREE.Group; dispose(): void } {
  const root = new THREE.Group();
  root.name = 'drift';
  const ink = new Quads();
  const washes = new Map<string, Quads>();
  const washOf = (card: string): Quads => washes.get(card) ?? (washes.set(card, new Quads()), washes.get(card)!);
  const cTop = col(L.top), cFace = col(L.face), cBrink = col(L.brink.step), cUnder = col(L.under);
  const S = L.tile;

  boxes.forEach((b, bi) => {
    const { x0, x1, y0, y1, z0, z1 } = b;
    ink.flat([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], cTop);
    const slab = y1 - y0 >= L.minSlab;
    const yBrink = slab ? y1 - L.brink.depth : y0;
    if (!slab) ink.flat([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], cUnder); // it hangs: its underside is seen
    if (slab && L.hang && y0 > L.mist.topY) {
      // D-030: its foot is over the mist, so it hangs too: its underside, and a root of rock under it. The four
      // sides wind as the stone's keel does (outward, seen from beside it); the ridge runs along the box's long way.
      ink.flat([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], cUnder);
      const i0 = L.hang.inset, yr = L.mist.baseY, zc = (z0 + z1) / 2, half = Math.min(x1 - x0, z1 - z0) / 2 - i0;
      const base: Vec3[] = [[x0 + i0, y0, z1 - i0], [x1 - i0, y0, z1 - i0], [x1 - i0, y0, z0 + i0], [x0 + i0, y0, z0 + i0]];
      const r0: Vec3 = [x0 + i0 + half, yr, zc], r1: Vec3 = [x1 - i0 - half, yr, zc];
      const c = L.hang.steps.map(col);
      ink.flat(base[1]!, base[0]!, r0, r1, c[0]!);             // +z
      ink.flat(base[3]!, base[2]!, r1, r0, c[1 % c.length]!);  // -z
      ink.tri(base[0]!, base[3]!, r0, c[1 % c.length]!);       // -x
      ink.tri(base[2]!, base[1]!, r1, c[0]!);                  // +x
    }
    // The four faces, each from its left end to its right as seen from outside. at: a point of the face from its
    // coordinate along the face and its height; from, to: that coordinate at the two ends; origin: where its
    // tiles count from (across the path, the box's own edge; along it, the world's x 0: the strokes carry on
    // from one box to the next); turn: where in the cycle its first tile is.
    // axis: which of a point's coordinates runs along the face (0: x, 2: z).
    const faces: { at: (c: number, y: number) => Vec3; axis: 0 | 2; from: number; to: number; origin: number; turn: number }[] = [
      { at: (c, y) => [x1, y, c], axis: 2, from: z1, to: z0, origin: z0, turn: bi },         // +x
      { at: (c, y) => [x0, y, c], axis: 2, from: z0, to: z1, origin: z0, turn: bi + 2 },     // -x
      { at: (c, y) => [c, y, z1], axis: 0, from: x0, to: x1, origin: 0, turn: 0 },           // +z
      { at: (c, y) => [c, y, z0], axis: 0, from: x1, to: x0, origin: 0, turn: 1 },           // -z
    ];
    for (const f of faces) {
      const band = (lo: number, hi: number, a = f.from, c = f.to): [Vec3, Vec3, Vec3, Vec3] => [f.at(a, lo), f.at(c, lo), f.at(c, hi), f.at(a, hi)];
      ink.flat(...band(yBrink, y1), cBrink);
      if (!slab) continue;
      ink.flat(...band(y0, yBrink), cFace);
      // square tiles under the brink: each the whole painting, or a crop of it at the face's ends, never scaled
      const lo = Math.min(f.from, f.to), hi = Math.max(f.from, f.to);
      for (let k = Math.floor((lo - f.origin) / S); f.origin + k * S < hi; k++) {
        const c0 = Math.max(lo, f.origin + k * S), c1 = Math.min(hi, f.origin + (k + 1) * S);
        if (c1 - c0 <= 0) continue;
        const [card, mirror] = L.cycle[(((k + f.turn) % L.cycle.length) + L.cycle.length) % L.cycle.length]!;
        const [a, c] = f.from < f.to ? [c0, c1] : [c1, c0];
        const tileAt = f.origin + k * S;
        washOf(card).wash(...band(y0, yBrink, a, c), (p) => {
          const u = (p[f.axis] - tileAt) / S;
          return [mirror ? 1 - u : u, 1 - (yBrink - p[1]) / S];
        });
      }
    }
  });

  // the rock wall's reachable ledges, as level ground
  rockLedges(ink, rocks, L.ledge);

  const disposables: { dispose(): void }[] = [];
  const inkGeo = ink.geometry();
  const inkMat = new THREE.MeshBasicMaterial({ vertexColors: true }); // D-018: unlit, flat, ramp steps only
  const rock = new THREE.Mesh(inkGeo, inkMat);
  rock.name = 'drift:rock';
  root.add(rock);
  disposables.push(inkGeo, inkMat);

  for (const [card, q] of washes) {
    if (!q.idx.length) continue;
    const geo = q.geometry();
    const mat = paintMaterial({ map: seamCard(card), opacity: L.ink, wash: true });
    mat.polygonOffset = true; // the wash lies exactly on the face the ink pass drew (as the path's dry-brush does)
    mat.polygonOffsetFactor = -1;
    mat.polygonOffsetUnits = -1;
    const mesh = paint(new THREE.Mesh(geo, mat));
    mesh.name = `drift:face:${card}`;
    mesh.renderOrder = L.order;
    root.add(mesh);
    disposables.push(geo, mat); // the decoded textures stay cached
  }

  // rocks adrift in the void
  L.adrift.forEach(([card, x, footY, z, height, yaw, inkShare, mirror], i) => {
    const geo = cardPlane(height * cardAspect(card), height, mirror);
    const mat = paintMaterial({ map: cardTexture(card), opacity: inkShare, wash: true, side: THREE.DoubleSide });
    const mesh = paint(new THREE.Mesh(geo, mat));
    mesh.name = 'drift:adrift';
    mesh.position.set(x, footY + height / 2, z);
    mesh.rotation.y = (yaw * Math.PI) / 180;
    mesh.renderOrder = L.adriftOrder + i;
    root.add(mesh);
    disposables.push(geo, mat);
  });

  // the channel under each stone's travel: a mist card lying flat on the mist, dock to dock
  travels.forEach((t, i) => {
    const dx = t.to[0] - t.from[0], dz = t.to[2] - t.from[2], run = Math.hypot(dx, dz);
    if (run === 0) return; // a stone that only rises has no channel
    const along = Math.abs(dx) >= Math.abs(dz) ? t.size[0] : t.size[2];
    const length = run + along + 2 * L.channel.beyond, width = length / cardAspect(L.channel.card);
    const geo = cardPlane(length, width, i % 2 === 1);
    geo.rotateX(-Math.PI / 2); // flat, its painted side up
    const mat = paintMaterial({ map: cardTexture(L.channel.card), opacity: L.channel.ink, wash: true, side: THREE.DoubleSide });
    const mesh = paint(new THREE.Mesh(geo, mat));
    mesh.name = 'drift:channel';
    mesh.position.set((t.from[0] + t.to[0]) / 2, L.mist.topY + L.channel.over, (t.from[2] + t.to[2]) / 2);
    mesh.rotation.y = Math.atan2(-dz, dx);
    mesh.renderOrder = L.channel.order + i;
    root.add(mesh);
    disposables.push(geo, mat);
  });

  return {
    root,
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
