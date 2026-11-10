// The painted cliff wall of an ink level (D-021): the near rock as large painted cards, in place of the
// kit_rock_mass slabs, which in an ink level collide and are not drawn (src/loaders/level.ts INK.collideOnly).
//
// The wall is DERIVED from the level's own rock-mass placements, so a cliff stands wherever there is rock to
// collide with and nowhere else (the rule dress-01 follows for the path: art from geometry, never a hand list).
// Three rows of cards, all parallel to the path and facing it, at three depths, so they slide against each
// other as the camera walks (Q2a: parallax is perspective, nothing translates):
//
//   front   one buttress per mass, a capsule's radius behind the most forward point of its collision: a figure
//           standing against the rock never crosses the card, and the rock is never more than that in front of
//           the painting. Narrow enough that the bays show between them.
//   bay     one per join between two masses, behind the deepest point of the pocket there. Where the masses
//           stand further apart than a bay card is wide there is no rock at the path's height (chapter 1 has
//           one such gap): no bay card stands there, and the cleft is left open to the back row.
//   back    one per second mass, taller, further out: the skyline. Beyond the camera's reach behind the wall.
//   pine    on every second front card, rooted on its face and reaching past its edge. Drawn after its row.
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
/** root: where the pine's root is in its own image; at: where that root sits on the host card (both 0..1 from the left and the foot, before mirroring) */
interface PineStyle { card: string; width: number; mirror: boolean; root: [number, number]; at: [number, number] }

export const CLIFF_WALL = {
  /** u behind the collision's most forward point: the player's capsule radius (0.35) plus 0.1 */
  frontBehind: 0.45,
  /** u below a mass's base where a front card's foot stands; the painted foot fades out under the path */
  frontFoot: 7,
  // Front cards, cycled by mass index. width, height: u (a mass is 8.6 wide, its path 2 above its base).
  // The cycle is 5 long against 3 paintings, so a painting meets itself at the same size and the same way
  // round only every 15 masses.
  front: [
    { card: 'cliff_b', width: 10.5, height: 26, mirror: false },
    { card: 'cliff_a', width: 9.5, height: 30, mirror: true },
    { card: 'cliff_c', width: 11, height: 24, mirror: false },
    { card: 'cliff_b', width: 10, height: 29, mirror: true },
    { card: 'cliff_a', width: 10.5, height: 25, mirror: false },
  ] as CardStyle[],
  /** u behind the front cards: past the deepest pocket between two masses (2.0 behind the forward point) */
  bayBehind: 2.2,
  bayFoot: 9,
  /** masses further apart than this (centre to centre, u) have no rock between them at the path's height */
  bayMaxGap: 10,
  bay: [
    { card: 'cliff_c', width: 15, height: 40, mirror: true },
    { card: 'cliff_a', width: 14, height: 46, mirror: false },
    { card: 'cliff_b', width: 16, height: 38, mirror: true },
  ] as CardStyle[],
  // Back cards, one per second mass. dx: u along the path from the mass; dz: u behind the front cards
  // (the camera's arm is 7 long, so 8 or more behind the wall is beyond it).
  backEvery: 2,
  backFoot: 12,
  back: [
    { card: 'cliff_c', width: 30, height: 60, mirror: true, dx: 5, dz: 8 },
    { card: 'cliff_a', width: 28, height: 68, mirror: false, dx: 4, dz: 11 },
    { card: 'cliff_b', width: 29, height: 58, mirror: true, dx: 5, dz: 9 },
  ] as BackStyle[],
  // Pines, on every second front card.
  pineEvery: 2,
  pines: [
    { card: 'pine_a', width: 7, mirror: false, root: [0.08, 0.1], at: [0.86, 0.5] },
    { card: 'pine_c', width: 6, mirror: true, root: [0.12, 0.86], at: [0.16, 0.62] },
    { card: 'pine_b', width: 6.5, mirror: false, root: [0.84, 0.08], at: [0.55, 0.44] },
  ] as PineStyle[],
  /** draw order: the first mesh of each row; each further mesh of the row adds one. All after the backdrop's mist sheets. */
  order: { back: 100, bay: 200, front: 300, pine: 400 },
};

const W = CLIFF_WALL;

/** The painted wall for these rock masses, which must stand on the -z side of the path. Static: built once. */
export function buildCliffWall(masses: RockMass[]): { root: THREE.Group; dispose(): void } {
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
  sorted.forEach((m, i) => {
    const frontZ = m.frontZ - W.frontBehind;
    const f = W.front[i % W.front.length]!;
    plane('front', f, m.x, m.baseY - W.frontFoot, frontZ, 0.5, 0);

    const n = sorted[i + 1];
    if (n && n.x - m.x <= W.bayMaxGap) {
      const b = W.bay[i % W.bay.length]!;
      plane('bay', b, (m.x + n.x) / 2, Math.min(m.baseY, n.baseY) - W.bayFoot, Math.min(m.frontZ, n.frontZ) - W.frontBehind - W.bayBehind, 0.5, 0);
    }
    if (i % W.backEvery === 0) {
      const b = W.back[(i / W.backEvery) % W.back.length]!;
      plane('back', b, m.x + b.dx, m.baseY - W.backFoot, frontZ - b.dz, 0.5, 0);
    }
    if (i % W.pineEvery === 0) {
      const p = W.pines[(i / W.pineEvery) % W.pines.length]!;
      const height = p.width / cardAspect(p.card);
      // the host card's point `at`, in the world; the pine's own root goes there
      const hx = m.x + (p.at[0] - 0.5) * f.width, hy = m.baseY - W.frontFoot + p.at[1] * f.height;
      const rx = p.mirror ? 1 - p.root[0] : p.root[0];
      plane('pine', { card: p.card, width: p.width, height, mirror: p.mirror }, hx, hy, frontZ, rx, p.root[1]);
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
    const mat = paintMaterial({ map: cardTexture(b.card), wash: true });
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
