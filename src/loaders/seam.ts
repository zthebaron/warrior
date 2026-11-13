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
  /** faces across the path (their normal along x): the card covers this many u before it repeats, mirrored; how much of its ink is laid */
  across: { card: 'seam_face_a', metres: 7, ink: 0.9 },
  /** faces along the path (their normal along z) */
  along: { card: 'seam_face_b', metres: 9, ink: 0.8 },
  /** draw order on the paint layer: before the far field's mist sheets (0 up), which are paper over whatever stands in them */
  order: -20,
} as const;

/** A collision box of the level, by its corners. */
export interface SeamBox { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }

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
    t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping; // a crop of a painting: mirrored, it has no cut edge
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

/** Dress a seam level's boxes: every unturned collision box of the level. Static: built once, never moved. */
export function buildSeam(boxes: SeamBox[]): { root: THREE.Group; dispose(): void } {
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
    const faces: { a: [number, number]; b: [number, number]; wash: Quads; u: (p: Vec3) => number; metres: number }[] = [
      // across the path the card is laid from the box's own edge: laid in world z, a face that straddles z 0 shows
      // the card and its mirror image either side of its middle
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
      f.wash.wash(...band(y0, yUnder), (p) => [f.u(p) / f.metres, p[1] / f.metres]);
    }
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

  return {
    root,
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
