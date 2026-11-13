// The painted cliff wall of an ink level (D-021): the near rock as large painted cards, in place of the
// kit_rock_mass slabs, which in an ink level collide and are not drawn (src/loaders/level.ts INK.collideOnly).
//
// The wall is DERIVED from the level's own rock-mass placements, so a cliff stands wherever there is rock to
// collide with and nowhere else (the rule dress-01 follows for the path: art from geometry, never a hand list).
// Three rows of cards, all parallel to the path and facing it, at three depths, so they slide against each
// other as the camera walks (Q2a: parallax is perspective, nothing translates):
//
//   front   three small buttresses per mass, just behind the most forward point of its collision: the rock is
//           never in front of the painting. Small and uneven in height: from the player's camera, which looks ALONG the
//           wall, a card is seen at a grazing angle, so a large one is a few strokes blown up into a smear and a
//           tall one has no top in the frame. These have a crest the camera can see. They overlap by more than
//           half, so the row is closed at the path's height: a hazard that slides into a pocket of the rock
//           (chapter 1's sliding stones turn inside it) goes behind the painting, as it went behind the slab.
//   bay     one per join between two masses, behind the deepest point of the pocket there, rising over the
//           front row. Where the masses stand further apart than a bay card is wide there is no rock at the
//           path's height (chapter 1 has one such gap): no bay card stands there, and no front card reaches
//           into it, so the gap is an open cleft and not a painted cliff a player can walk through.
//   back    one per second mass, the tallest, furthest out: the skyline. Beyond the camera's reach behind the wall.
//   pine    on every second mass, rooted on a ledge of its tallest front card, a few u above the path.
//
// Each row further back is laid down a little thinner (§3: nearer is darker), which is what tells the rows
// apart, and the wall's two ends stand lower, so it falls away to the path instead of stopping at a cut.
//
// Every card is a plane on the paint layer (unlit, drawn after the ink pass). Cards are blended and write no
// depth, so the draw order is explicit and fixed: back row, bay row, front row, pines, all after the mist
// (src/loaders/backdrop.ts), which would otherwise paper over them. All the cards of one painting in one row
// are ONE mesh (one draw call: 12 for the wall, not one a card); within a row the meshes are drawn farthest
// first. A fixed order is right from anywhere on the path, because the cards of a mesh stand at one depth.
// Cards are FRONT faces only: the camera's arm is a single ray and can thread a gap in the rock; from behind
// the wall it then sees through the cards to the path, not the back of a painting.
//
// Every number is in MEASUREMENTS.md "D-021 cliff wall".

import * as THREE from 'three';

import { paint, paintMaterial } from '../engine/paint-layer';
import { cardAspect, cardTexture } from './backdrop';

/** A rock mass the level collides with and does not draw: where it stands and how far its collision reaches. */
export interface RockMass {
  x: number;
  baseY: number;
  topY: number;
  /** the collision's most forward z (toward the path) and its extent along the path */
  frontZ: number;
  minX: number;
  maxX: number;
}

interface CardStyle { card: string; width: number; height: number; mirror: boolean }
interface BackStyle extends CardStyle { dx: number; dz: number }
/** root: where the pine's root is in its own image (0..1 from the left and the foot, before mirroring) */
interface PineStyle { card: string; width: number; mirror: boolean; root: [number, number] }

export const CLIFF_WALL = {
  // u behind the collision's most forward point (z -3.58 in chapter 1). Between two things: a torii's post
  // stands with its outer face 0.02 behind that point, and a card level with it bleeds into the post's edge
  // (the paint gate's accent check went red at 0.05); a sliding stone turns inside the rock with its front
  // face 0.42 behind it, and must go behind the painting as it went behind the slab. A figure pressed into
  // the rock can cross a card this close; it is drawn over every card (paint-layer.ts paintLast).
  frontBehind: 0.2,
  /** u below a mass's base where a front card's foot stands; the painted foot fades out under the path */
  frontFoot: 5,
  /** u along the path from a mass's centre where its three front cards stand (a mass is 8.6 wide, the next 8.5 to 9 on) */
  frontAt: [-2.9, 0, 2.9],
  // Front cards, cycled card by card. width, height: u (the path is 2 above a mass's base, so these stand 6 to
  // 14 above it). The cycle is 7 long against 3 paintings and 3 cards a mass: no two neighbours are the same
  // painting at the same size the same way round.
  front: [
    { card: 'cliff_b', width: 7, height: 15, mirror: false },
    { card: 'cliff_a', width: 6.5, height: 19, mirror: true },
    { card: 'cliff_c', width: 8, height: 14, mirror: false },
    { card: 'cliff_a', width: 7, height: 21, mirror: false },
    { card: 'cliff_b', width: 7.5, height: 17, mirror: true },
    { card: 'cliff_c', width: 7.5, height: 20, mirror: true },
    { card: 'cliff_b', width: 6.5, height: 13, mirror: false },
  ] as CardStyle[],
  /** u behind the front cards: well past the deepest pocket between two masses (2.0 behind the forward point),
   *  far enough that the bay row slides visibly against the front row from the player's camera */
  bayBehind: 5,
  bayFoot: 9,
  /** masses further apart than this (centre to centre, u) have no rock between them at the path's height */
  bayMaxGap: 10,
  // Bay cards. Uneven on purpose: the low ones stand 9 to 13 above the path, so from the player's camera the
  // wall has a top, and paper shows over it between the tall ones.
  bay: [
    { card: 'cliff_c', width: 12, height: 24, mirror: true },
    { card: 'cliff_a', width: 14, height: 40, mirror: false },
    { card: 'cliff_b', width: 10, height: 20, mirror: true },
    { card: 'cliff_a', width: 12, height: 32, mirror: true },
  ] as CardStyle[],
  // Back cards, one per second mass: towers with paper between their tops, the skyline. dx: u along the path
  // from the mass; dz: u behind the front cards (the camera's arm is 7 long, so 10 or more is beyond it).
  backEvery: 2,
  backFoot: 12,
  back: [
    { card: 'cliff_c', width: 26, height: 56, mirror: true, dx: 5, dz: 11 },
    { card: 'cliff_a', width: 20, height: 46, mirror: false, dx: 4, dz: 14 },
    { card: 'cliff_b', width: 28, height: 64, mirror: true, dx: 5, dz: 12 },
  ] as BackStyle[],
  /** how much of the painting's ink each row lays down: the front in full, each row behind it thinner */
  ink: { front: 1, bay: 0.88, back: 0.72, pine: 1 },
  // The height of the cards on the wall's first and last masses, from the end inward, as a share of their own:
  // the rows behind fall away to the path; the front row hardly, or the thinner rows behind show over it.
  taper: { front: [0.85, 0.95], bay: [0.55, 0.75, 0.9], back: [0.5, 0.7, 0.88] },
  // Where a pine roots on each cliff painting: a ledge of that painting (0..1 from its left and its foot),
  // mirrored with the card. On the mass's tallest front card this is 1 to 7 above the path.
  ledge: { cliff_a: [0.2, 0.58], cliff_b: [0.7, 0.65], cliff_c: [0.4, 0.46] } as Record<string, [number, number]>,
  // Pines, on every second mass from the second (the first stands beside the spawn camera, where a card is
  // seen so nearly edge-on that a pine on it is a smear), rooted on the ledge of its tallest front card.
  pineEvery: 2,
  pineFrom: 1,
  pines: [
    { card: 'pine_a', width: 7, mirror: false, root: [0.08, 0.1] },
    { card: 'pine_b', width: 6.5, mirror: false, root: [0.84, 0.08] },
    { card: 'pine_c', width: 6, mirror: true, root: [0.12, 0.86] },
    { card: 'pine_a', width: 7.5, mirror: true, root: [0.08, 0.1] },
  ] as PineStyle[],
  /** draw order: the first mesh of each row; each further mesh of the row adds one. All after the backdrop's mist sheets. */
  order: { back: 100, bay: 200, front: 300, pine: 400 },
};

const W = CLIFF_WALL;

/** The painted wall for these rock masses, which must stand on the -z side of the path. Static: built once. */
/**
 * `proportion` (D-029): every cliff card is drawn at its painting's own proportion. Its height is the row's (the
 * skyline and what the wall covers do not change); its width is that height times the painting's width / height,
 * not the row's `width`, which lays cliff_a and cliff_c up to a third too narrow. Without it: chapters 1 and 2,
 * exactly as they were built.
 */
/**
 * `shape` (D-030, the summit): back: false leaves out the tall row behind; cap: no card stands taller than this
 * (u), so nothing painted towers over him but the rock that is really there (a mass is 12 u tall). Without it:
 * the wall as chapters 1, 2 and 3 have it.
 */
export function buildCliffWall(masses: RockMass[], proportion = false, shape?: { back: boolean; cap: number }): { root: THREE.Group; dispose(): void } {
  const true0 = <T extends { card: string; width: number; height: number }>(s: T): T => (proportion ? { ...s, width: s.height * cardAspect(s.card) } : s);
  const root = new THREE.Group();
  root.name = 'cliff-wall';
  type Row = keyof typeof W.order;
  /** every card of one painting in one row: the quads of one mesh */
  interface Batch { row: Row; card: string; pos: number[]; uv: number[]; idx: number[]; z: number; n: number }
  const batches = new Map<string, Batch>();
  /** A card facing +z whose point (ax, ay) (0..1 from its left and its foot, as seen from the path) is at (x, y, z). */
  const plane = (row: Row, s: { card: string; width: number; height: number; mirror: boolean }, x: number, y: number, z: number, ax: number, ay: number): void => {
    const key = `${row}:${s.card}`;
    let b = batches.get(key);
    if (!b) batches.set(key, (b = { row, card: s.card, pos: [], uv: [], idx: [], z: 0, n: 0 }));
    const x0 = x - ax * s.width, y0 = y - ay * s.height, x1 = x0 + s.width, y1 = y0 + s.height;
    const u0 = s.mirror ? 1 : 0, u1 = 1 - u0; // mirrored in the texture: a negative scale would turn the face away
    const v = b.pos.length / 3;
    b.pos.push(x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z); // counter-clockwise seen from +z: the face looks at the path
    b.uv.push(u0, 0, u1, 0, u1, 1, u0, 1);
    b.idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
    b.z += z;
    b.n++;
  };

  const sorted = [...masses].sort((a, b) => a.x - b.x);
  let fi = 0; // front cards placed so far: the front cycle runs card by card
  sorted.forEach((m, i) => {
    const frontZ = m.frontZ - W.frontBehind;
    const end = Math.min(i, sorted.length - 1 - i); // how far this mass is from the nearer end of the wall
    const tall = <T extends { card: string; width: number; height: number }>(s: T, row: keyof typeof W.taper, from = end): T => true0({ ...s, height: Math.min(s.height * (W.taper[row][from] ?? 1), shape?.cap ?? Infinity) });

    // Where no rock stands beside this mass (the wall's end, or a gap wider than a bay card: chapter 1 has one,
    // x 36 to 40.5, with nothing to collide with at the path's height), no front card may reach past the rock's
    // own extent: a painted cliff there would be one a player walks through and falls.
    const p = sorted[i - 1], n = sorted[i + 1];
    const openLeft = !p || m.x - p.x > W.bayMaxGap, openRight = !n || n.x - m.x > W.bayMaxGap;
    let host: { x: number; s: CardStyle } | null = null;
    for (const dx of W.frontAt) {
      const f = tall(W.front[fi++ % W.front.length]!, 'front');
      let x = m.x + dx;
      if (openLeft) x = Math.max(x, m.minX + f.width / 2);
      if (openRight) x = Math.min(x, m.maxX - f.width / 2);
      plane('front', f, x, m.baseY - W.frontFoot, frontZ, 0.5, 0);
      if (!host || f.height > host.s.height) host = { x, s: f };
    }

    if (n && n.x - m.x <= W.bayMaxGap) {
      // a bay card belongs to a join, and there is one join fewer than masses: its own distance from the nearer end
      const b = tall(W.bay[i % W.bay.length]!, 'bay', Math.min(i, sorted.length - 2 - i));
      plane('bay', b, (m.x + n.x) / 2, Math.min(m.baseY, n.baseY) - W.bayFoot, Math.min(m.frontZ, n.frontZ) - W.frontBehind - W.bayBehind, 0.5, 0);
    }
    if (i % W.backEvery === 0 && shape?.back !== false) {
      const b = tall(W.back[(i / W.backEvery) % W.back.length]!, 'back');
      plane('back', b, m.x + b.dx, m.baseY - W.backFoot, frontZ - b.dz, 0.5, 0);
    }
    if (i >= W.pineFrom && (i - W.pineFrom) % W.pineEvery === 0 && host) {
      const pine = W.pines[((i - W.pineFrom) / W.pineEvery) % W.pines.length]!;
      const height = pine.width / cardAspect(pine.card);
      // the host painting's ledge, in the world (mirrored with the card); the pine's own root goes there
      const ledge = W.ledge[host.s.card];
      if (!ledge) throw new Error(`[cliff-wall] no ledge recorded for "${host.s.card}": a pine cannot root on it`);
      const [lu, lv] = ledge;
      const hx = host.x + ((host.s.mirror ? 1 - lu : lu) - 0.5) * host.s.width, hy = m.baseY - W.frontFoot + lv * host.s.height;
      const rx = pine.mirror ? 1 - pine.root[0] : pine.root[0];
      plane('pine', { card: pine.card, width: pine.width, height, mirror: pine.mirror }, hx, hy, frontZ, rx, pine.root[1]);
    }
  });

  const disposables: { dispose(): void }[] = [];
  const next = { ...W.order };
  // within a row, the mesh standing farthest from the path is drawn first
  for (const b of [...batches.values()].sort((a, c) => a.z / a.n - c.z / c.n)) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    geo.setIndex(b.idx);
    geo.computeVertexNormals();
    const mat = paintMaterial({ map: cardTexture(b.card), opacity: W.ink[b.row], wash: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `cliff:${b.row}`;
    mesh.renderOrder = next[b.row]++;
    root.add(mesh);
    disposables.push(geo, mat); // the decoded textures stay cached (backdrop.ts)
  }

  paint(root);
  return {
    root,
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
