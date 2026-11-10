// The path's dry-brush (D-021): a faint wash of brush streaks over every walkable top of an ink level, so the
// path is brushed paper and not blank paper.
//
// It cannot be in the top's own material: that is drawn by the ink pass, which snaps every value to the
// eight-step ramp, and a texture this faint would vanish or band. So it is ONE mesh on the paint layer (unlit,
// drawn after the ink pass), a quad over each prim_box top, blended over the top the ink pass drew. The quads
// lie exactly on the tops (polygonOffset, as the landing mark does: no invented lift), and the texture is laid
// in WORLD x and z, so the strokes run along the path and carry on unbroken from one box to the next.
//
// The card is tools/art/backdrop-cards.mjs PATH_WASH; every number here is in MEASUREMENTS.md "D-021 path wash".

import * as THREE from 'three';

import { paint, paintMaterial } from '../engine/paint-layer';
import { cardTexture } from './backdrop';

/** The top of a box a player can stand on: its extent in x and z, and its height. */
export interface WalkTop {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  y: number;
}

export const PATH_WASH = {
  card: 'path_wash',
  /** u of world the card covers before it repeats: along the path (x), across it (z). 64 px a unit both ways. */
  repeat: [16, 4],
} as const;

/** The wash over these tops. Static: built once, never moved. */
export function buildPathWash(tops: WalkTop[]): { root: THREE.Mesh; dispose(): void } {
  const [ru, rv] = PATH_WASH.repeat;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  tops.forEach((t, i) => {
    // counter-clockwise seen from above, so the face looks up
    for (const [x, z] of [[t.x0, t.z1], [t.x1, t.z1], [t.x1, t.z0], [t.x0, t.z0]] as const) {
      pos.push(x, t.y, z);
      uv.push(x / ru, z / rv);
    }
    idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const map = cardTexture(PATH_WASH.card).clone(); // a copy: the cached card is clamped, this one repeats
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.needsUpdate = true;
  const mat = paintMaterial({ map, wash: true });
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -1;
  mat.polygonOffsetUnits = -1;
  const mesh = paint(new THREE.Mesh(geo, mat));
  mesh.name = 'path:wash';
  return {
    root: mesh,
    dispose() {
      geo.dispose();
      map.dispose();
      mat.dispose();
    },
  };
}
