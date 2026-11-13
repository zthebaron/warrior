// The cliff seam (D-028): what an ink level whose ambience zone is `seam` is drawn as. Chapter 2.
//
// Chapter 1's ground is kit ledges laid over its boxes, and its rock is a wall beside the path, seen along its
// length. Chapter 2 is a climb: its boxes ARE the rock, tall blocks whose faces stand across the path and are
// seen head on, from below. So its boxes are drawn here, straight from the level's own placements, and nothing
// is placed over them:
//
//   the ink pass     every box as flat fills: the top is paper (STYLE §4 Paths: lighter than the cliff beside
//                    it), every face is rock, and the top `lip` of every face is the top's own paper again, with
//                    one dark band under it: the edge of a slab of ground, seen from the side. That band of
//                    paper over rock is how a top is read from below: wherever it stands within reach, there is
//                    ground up there to catch. It is in the ink pass, not painted on, so it has a surface and a
//                    depth, hides what is behind it, and takes the ink pass's own edge against the void.
//   the paint layer  the rock's brushwork: a cliff painting's strokes laid flat on every face under its lip
//                    (tools/art/seam-cards.mjs), one card for the faces that stand ACROSS the path (the ones he
//                    climbs), one for those that run ALONG it. Laid in world coordinates, so the strokes carry
//                    on from one box to the next, and under the lip only: nothing is painted on a hold.
//
// The painted cliff wall, the path's dry-brush and the far field are chapter 1's own (cliff-wall.ts, path-wash.ts,
// backdrop.ts), built from this level's rock and tops by the same code.
//
// RENDER ONLY. Not one collider is made or changed here: every box collides exactly as src/loaders/level.ts
// built it and is simply drawn as what it is. Nothing here moves.
// Every number is in MEASUREMENTS.md "D-028 the seam's look".

import * as THREE from 'three';

import { paint, paintMaterial } from '../engine/paint-layer';
import { ramp, type RampName } from '../engine/palette';
import { cardAspect, cardTexture } from './backdrop';

type Vec3 = [number, number, number];

export const SEAM = {
  /** `lighting.ambienceZone` of a level drawn this way */
  zone: 'seam',
  // ramp steps (STYLE §2)
  top: 'paper-cream',
  face: 'mist-pale',
  /** the edge of the slab of ground at the top of every face: its depth (u), and the dark band under it */
  lip: { depth: 0.3, step: 'paper-cream', under: 0.12, underStep: 'ink-grey' },
  /** a box lower than this (u) is a stone, not ground with an edge: no lip, no brushwork (the crows' perches) */
  minSlab: 1,
  // ---- the paint layer (cards from tools/art/seam-cards.mjs, in assets/seam) ----
  // Faces across the path (their normal along x). metres: u of face the card covers, along the face and down it;
  // ink: how much of its ink is laid. Along a face the card repeats as it is: its cut edge falls among upright
  // strokes and is one more fracture. Down a face it is laid from the face's own top and repeats mirrored, so
  // the top of every face is the top of the card and the mirror line is 9 u down, in or near the mist.
  across: { card: 'seam_face_a', metres: [7, 9], ink: 0.9 },
  /** faces along the path (their normal along z) */
  along: { card: 'seam_face_b', metres: [9, 9], ink: 0.8 },
  /** draw order on the paint layer: before the far field's mist sheets (0 up), which are paper over whatever stands in them */
  order: -20,
  // The rock wall beside the path collides and is not drawn (D-021); a painted wall stands there. Its slabs
  // have ledges a player can stand on. Those within `reach` u of a mass's base (the two lowest: 1.2 and 3.8 u
  // over the path) are drawn, in the ink pass, as what they are: level ground in the top's own paper.
  ledge: { reach: 6, up: 0.9, step: 'paper-cream' },
  // A pine under the void-side corner of every top that is caught from below: a box at the path's void edge whose
  // face rises `rise` u or more over the ground before it. inset: u past the face; the card stands ACROSS the
  // path, facing the way he comes, and grows out of the rock face over the void (root: where the pine roots in
  // its own image, 0..1 from its left and its foot, before mirroring). Its crown stops `below` u under the top:
  // a painted thing may not come between a camera and a torii (D-020), and every torii stands on a top. Standing
  // on the corner instead, the first cut hid 529 accent pixels from the overview camera.
  pine: {
    rise: 2.5, inset: 0.5, below: 0.3, order: 400,
    cards: [
      { card: 'pine_a', width: 5.5, mirror: false, root: [0.08, 0.1] },
      { card: 'pine_c', width: 5, mirror: false, root: [0.12, 0.86] },
      { card: 'pine_b', width: 5.5, mirror: true, root: [0.84, 0.08] },
      { card: 'pine_a', width: 6, mirror: false, root: [0.08, 0.1] },
    ] as { card: string; width: number; mirror: boolean; root: [number, number] }[],
  },
  // The seam's own far field, in place of chapter 1's mid cliffs (src/loaders/backdrop.ts BACKDROP.cliffs, the
  // same columns: card, x, z, height, yaw, ink, mirrored). The path climbs 15.5 u, so the towers behind the wall
  // stand taller toward its end; three stand out in the void, 40 to 60 u off the path and thinner (STYLE §3:
  // mid band), and two close the view past each end.
  cliffs: [
    ['cliff_a', 22, -58, 66, 8, 0.5, true],
    ['cliff_c', 72, -62, 84, -6, 0.5, false],
    ['cliff_b', 120, -58, 98, 10, 0.55, true],
    ['cliff_b', 60, 46, 60, 172, 0.4, false],
    ['cliff_c', 112, 62, 84, 195, 0.36, true],
    ['cliff_a', 166, 30, 70, -120, 0.42, false],
    ['cliff_c', -34, -30, 46, 40, 0.55, true],
    ['cliff_a', 172, -16, 62, -80, 0.55, true],
  ] as [string, number, number, number, number, number, boolean][],
} as const;

/** A collision box of the level, by its corners. */
export interface SeamBox { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }
/** A rock mass the level collides with and does not draw: its collision triangles and where they stand. */
export interface SeamRock { positions: ArrayLike<number>; indices: ArrayLike<number>; matrix: THREE.Matrix4 }

const URLS = import.meta.glob<string>('../../assets/seam/*.png', { query: '?url', import: 'default', eager: true });
const textures = new Map<string, THREE.Texture>();

/** Decode the seam's cards. Awaited by prepareLevel for a seam level only: no other level loads them. */
export async function preloadSeam(): Promise<void> {
  const loader = new THREE.TextureLoader();
  await Promise.all(Object.entries(URLS).map(async ([file, url]) => {
    const name = file.slice(file.lastIndexOf('/') + 1, -'.png'.length);
    if (textures.has(name)) return;
    const t = await loader.loadAsync(url);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;         // along a face: the crop's cut edge is one more upright fracture
    t.wrapT = THREE.MirroredRepeatWrapping; // down a face: mirrored, so it has no cut edge
    textures.set(name, t);
  }));
}
function texture(name: string): THREE.Texture {
  const t = textures.get(name);
  if (!t) throw new Error(`[seam] "${name}" was not preloaded: prepareLevel must await preloadSeam()`);
  return t;
}

const col = (name: RampName): THREE.Color => new THREE.Color(ramp(name));

/** Quads with one flat colour each (the ink pass), or with a texture coordinate at each corner (a wash). */
class Quads {
  readonly pos: number[] = [];
  readonly rgb: number[] = [];
  readonly uv: number[] = [];
  readonly idx: number[] = [];
  /** a-b-c-d counter-clockwise seen from its front */
  flat(a: Vec3, b: Vec3, c: Vec3, d: Vec3, c0: THREE.Color): void {
    this.corners(a, b, c, d);
    for (let k = 0; k < 4; k++) this.rgb.push(c0.r, c0.g, c0.b);
  }
  wash(a: Vec3, b: Vec3, c: Vec3, d: Vec3, uv: (p: Vec3) => [number, number]): void {
    this.corners(a, b, c, d);
    for (const p of [a, b, c, d]) this.uv.push(...uv(p));
  }
  /** a-b-c counter-clockwise seen from its front */
  tri(a: Vec3, b: Vec3, c: Vec3, c0: THREE.Color): void {
    const i = this.pos.length / 3;
    this.pos.push(...a, ...b, ...c);
    this.idx.push(i, i + 1, i + 2);
    for (let k = 0; k < 3; k++) this.rgb.push(c0.r, c0.g, c0.b);
  }
  private corners(a: Vec3, b: Vec3, c: Vec3, d: Vec3): void {
    const i = this.pos.length / 3;
    this.pos.push(...a, ...b, ...c, ...d);
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
  geometry(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    if (this.rgb.length) geo.setAttribute('color', new THREE.Float32BufferAttribute(this.rgb, 3));
    if (this.uv.length) geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    geo.setIndex(this.idx);
    geo.computeVertexNormals();
    return geo;
  }
}

/**
 * Dress a seam level. `boxes`: every unturned collision box of the level; `rocks`: the rock masses it collides
 * with and does not draw. Static: built once, never moved.
 */
export function buildSeam(boxes: SeamBox[], rocks: SeamRock[]): { root: THREE.Group; dispose(): void } {
  const S = SEAM;
  const root = new THREE.Group();
  root.name = 'seam';
  const ink = new Quads(), across = new Quads(), along = new Quads();
  const cTop = col(S.top), cFace = col(S.face), cLip = col(S.lip.step), cUnder = col(S.lip.underStep);

  for (const b of boxes) {
    const { x0, x1, y0, y1, z0, z1 } = b;
    ink.flat([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], cTop);
    const slab = y1 - y0 >= S.minSlab;
    const yLip = slab ? y1 - S.lip.depth : y1, yUnder = slab ? yLip - S.lip.under : y1;
    // the four faces, each as its two lower corners, left then right as seen from outside
    const faces: { a: [number, number]; b: [number, number]; wash: Quads; u: (p: Vec3) => number; metres: readonly [number, number] }[] = [
      // across the path the card is laid from the box's own edge; along it, in world x, so the strokes carry on
      // from one box to the next
      { a: [x1, z1], b: [x1, z0], wash: across, u: (p) => p[2] - z0, metres: S.across.metres }, // +x
      { a: [x0, z0], b: [x0, z1], wash: across, u: (p) => p[2] - z0, metres: S.across.metres }, // -x
      { a: [x0, z1], b: [x1, z1], wash: along, u: (p) => p[0], metres: S.along.metres },   // +z
      { a: [x1, z0], b: [x0, z0], wash: along, u: (p) => p[0], metres: S.along.metres },   // -z
    ];
    for (const f of faces) {
      const band = (lo: number, hi: number): [Vec3, Vec3, Vec3, Vec3] => [[f.a[0], lo, f.a[1]], [f.b[0], lo, f.b[1]], [f.b[0], hi, f.b[1]], [f.a[0], hi, f.a[1]]];
      ink.flat(...band(y0, yUnder), cFace);
      if (!slab) continue;
      ink.flat(...band(yUnder, yLip), cUnder);
      ink.flat(...band(yLip, y1), cLip);
      f.wash.wash(...band(y0, yUnder), (p) => [f.u(p) / f.metres[0], 1 - (yUnder - p[1]) / f.metres[1]]);
    }
  }

  // the rock wall's reachable ledges, as level ground
  const cLedge = col(S.ledge.step);
  const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3(), n = new THREE.Vector3();
  for (const r of rocks) {
    let base = Infinity;
    for (let j = 1; j < r.positions.length; j += 3) base = Math.min(base, va.set(r.positions[j - 1]!, r.positions[j]!, r.positions[j + 1]!).applyMatrix4(r.matrix).y);
    const at = (i: number, out: THREE.Vector3): THREE.Vector3 => out.set(r.positions[i * 3]!, r.positions[i * 3 + 1]!, r.positions[i * 3 + 2]!).applyMatrix4(r.matrix);
    for (let t = 0; t < r.indices.length; t += 3) {
      at(r.indices[t]!, va); at(r.indices[t + 1]!, vb); at(r.indices[t + 2]!, vc);
      n.subVectors(vb, va).cross(vc.clone().sub(va));
      if (n.y / n.length() < S.ledge.up || Math.max(va.y, vb.y, vc.y) > base + S.ledge.reach) continue;
      ink.tri(va.toArray() as Vec3, vb.toArray() as Vec3, vc.toArray() as Vec3, cLedge);
    }
  }

  // a pine under the void-side corner of every top caught from below
  const slabs = boxes.filter((b) => b.y1 - b.y0 >= S.minSlab).sort((a, b) => a.x0 - b.x0);
  const zVoid = Math.max(...slabs.map((b) => b.z1)), EPS = 1e-6;
  interface Pine { card: string; pos: number[]; uv: number[] }
  const pines: Pine[] = [];
  for (const b of slabs) {
    if (b.z1 < zVoid - EPS) continue;
    const before = slabs.filter((o) => Math.abs(o.x1 - b.x0) < EPS && o.z1 > b.z0 + EPS && o.z0 < b.z1 - EPS);
    if (!before.length || b.y1 - Math.max(...before.map((o) => o.y1)) < S.pine.rise) continue; // out of the mist, or a step
    const p = S.pine.cards[pines.length % S.pine.cards.length]!;
    const h = p.width / cardAspect(p.card), ru = p.mirror ? 1 - p.root[0] : p.root[0];
    const x = b.x0 + S.pine.inset, zl = b.z1 - ru * p.width, zr = zl + p.width, yt = b.y1 - S.pine.below, yb = yt - h;
    const u0 = p.mirror ? 1 : 0, u1 = 1 - u0;
    pines.push({ card: p.card, pos: [x, yb, zl, x, yb, zr, x, yt, zr, x, yt, zl], uv: [u0, 0, u1, 0, u1, 1, u0, 1] });
  }

  const disposables: { dispose(): void }[] = [];
  const inkGeo = ink.geometry();
  const inkMat = new THREE.MeshBasicMaterial({ vertexColors: true }); // D-018: unlit, flat, ramp steps only
  const rock = new THREE.Mesh(inkGeo, inkMat);
  rock.name = 'seam:rock';
  root.add(rock);
  disposables.push(inkGeo, inkMat);

  for (const [name, q, style] of [['seam:across', across, S.across], ['seam:along', along, S.along]] as const) {
    if (!q.idx.length) continue;
    const geo = q.geometry();
    const mat = paintMaterial({ map: texture(style.card), opacity: style.ink, wash: true });
    mat.polygonOffset = true; // the wash lies exactly on the face the ink pass drew (as the path's dry-brush does)
    mat.polygonOffsetFactor = -1;
    mat.polygonOffsetUnits = -1;
    const mesh = paint(new THREE.Mesh(geo, mat));
    mesh.name = name;
    mesh.renderOrder = S.order;
    root.add(mesh);
    disposables.push(geo, mat); // the decoded textures stay cached
  }

  pines.forEach((p, i) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(p.pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(p.uv, 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.computeVertexNormals();
    const mat = paintMaterial({ map: cardTexture(p.card), wash: true, side: THREE.DoubleSide }); // seen from both ways along the path
    const mesh = paint(new THREE.Mesh(geo, mat));
    mesh.name = 'seam:pine';
    mesh.renderOrder = S.pine.order + i;
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
