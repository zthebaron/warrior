// The painted backdrop of an ink level (D-020): the far field as painted layers, cut from the seed
// (tools/art/backdrop-textures.mjs -> assets/backdrop/*.png), instead of kit geometry.
//
//   paper sky   no geometry: the paper is the sky (D-018) and stays bare
//   far ridges  three rings of the seed's far ridge, each fixed in the world at its own distance, so they
//               slide against each other as the camera walks: parallax is perspective, nothing translates (Q2a)
//   mid cliffs  the seed's own cliff brushwork as standing forms behind the rock wall and past the goal, each a
//               plane fixed in the world, lightened for distance, its foot fading out into the mist
//   mist sea    BARE PAPER (Tim, gap THREE). Not a surface and not a shape: a few sheets of paper-coloured wash
//               stacked under the path, so whatever stands in the mist thins into the paper instead of ending
//               at a drawn edge. Every sheet is paper-cream; only what is behind it changes.
//
// Everything here is on the paint layer (src/engine/paint-layer.ts): unlit, drawn after the ink pass, hidden by
// any ink geometry in front of it. Every number is in MEASUREMENTS.md "D-020 painted backdrop".

import * as THREE from 'three';

import { paint, paintMaterial } from '../engine/paint-layer';
import { ramp } from '../engine/palette';

type Vec3 = [number, number, number];

export const BACKDROP = {
  // Far ridges, farthest first. radius: u from the centre of the level's bounds (ring + the farthest camera
  // stays inside the 600u far clip); height/baseY: u; repeat: copies of the 1024x64 crop round the ring, EVEN,
  // because alternate copies are mirrored so the crop's cut right edge meets itself; turn: fraction of a full
  // turn, so the three rings do not line up; ink: how much of the seed's wash is laid down (farther = paler).
  ridges: [
    { radius: 460, height: 30, baseY: -13, repeat: 6, turn: 0.13, ink: 0.6 },
    { radius: 380, height: 24, baseY: -12, repeat: 6, turn: 0.47, ink: 0.8 },
    { radius: 300, height: 18, baseY: -11, repeat: 6, turn: 0.81, ink: 1.0 },
  ],
  ringSegments: 96,
  // Mid cliffs, farthest from the path first: texture, x, z (u, world), width, height (u), yaw (degrees).
  // z -50..-64 puts them 45-60u from a camera on the path: STYLE §3's mid band. The last one closes the
  // view past the goal (x 101). All stand on cliffFootY; the texture's own foot fades out above it.
  cliffs: [
    ['mid_cliff_b', 130, -64, 58, 72, -12],
    ['mid_cliff_b', 36, -60, 54, 66, -6],
    ['mid_cliff_a', 84, -52, 44, 52, 10],
    ['mid_cliff_a', -8, -50, 46, 54, 8],
    ['mid_cliff_a', 158, -14, 50, 62, -80],
  ],
  cliffFootY: -14,
  // Mist: sheets from baseY (solid paper) up to topY, each thinner than the one below. topY is 3u under
  // chapter 1's lowest landing (y 0); baseY is above every dressed wall's foot (lowest y -8).
  mist: { radius: 520, baseY: -7, topY: -3, sheets: 6, topOpacity: 0.18 },
  mistSegments: 48,
} as const;

const URLS = import.meta.glob<string>('../../assets/backdrop/*.png', { query: '?url', import: 'default', eager: true });
const textures = new Map<string, THREE.Texture>();

/** Decode the backdrop textures. Awaited by prepareLevel, so the first drawn frame already has them (B-16). */
export async function preloadBackdrop(): Promise<void> {
  const loader = new THREE.TextureLoader();
  await Promise.all(
    Object.entries(URLS).map(async ([path, url]) => {
      const name = path.slice(path.lastIndexOf('/') + 1, -'.png'.length);
      if (textures.has(name)) return;
      const t = await loader.loadAsync(url);
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = name === 'far_ridge' ? THREE.MirroredRepeatWrapping : THREE.ClampToEdgeWrapping; // only the ridge runs round a ring
      t.wrapT = THREE.ClampToEdgeWrapping;
      textures.set(name, t);
    }),
  );
}

function texture(name: string): THREE.Texture {
  const t = textures.get(name);
  if (!t) throw new Error(`[backdrop] "${name}" was not preloaded: prepareLevel must await preloadBackdrop()`);
  return t;
}

/** The painted backdrop for a level with these bounds. Static: built once, never moved. */
export function buildBackdrop(bounds: { min: Vec3; max: Vec3 }): { root: THREE.Group; dispose(): void } {
  const root = new THREE.Group();
  root.name = 'backdrop';
  const cx = (bounds.min[0] + bounds.max[0]) / 2;
  const cz = (bounds.min[2] + bounds.max[2]) / 2;
  const materials: THREE.Material[] = [];
  const ringMaps: THREE.Texture[] = [];
  let order = 0;

  for (const r of BACKDROP.ridges) {
    const map = texture('far_ridge').clone();
    map.repeat.set(r.repeat, 1);
    map.needsUpdate = true;
    ringMaps.push(map);
    const mat = paintMaterial({ map, opacity: r.ink, wash: true, side: THREE.BackSide });
    materials.push(mat);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(r.radius, r.radius, r.height, BACKDROP.ringSegments, 1, true), mat);
    ring.name = 'backdrop:ridge';
    ring.position.set(cx, r.baseY + r.height / 2, cz);
    ring.rotation.y = r.turn * Math.PI * 2;
    ring.renderOrder = order++;
    root.add(ring);
  }

  for (const [name, x, z, width, height, yaw] of BACKDROP.cliffs) {
    const mat = paintMaterial({ map: texture(name), wash: true, side: THREE.DoubleSide });
    materials.push(mat);
    const cliff = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
    cliff.name = 'backdrop:cliff';
    cliff.position.set(x, BACKDROP.cliffFootY + height / 2, z);
    cliff.rotation.y = (yaw * Math.PI) / 180;
    cliff.renderOrder = order++;
    root.add(cliff);
  }

  const m = BACKDROP.mist;
  const sheetGeo = new THREE.CircleGeometry(m.radius, BACKDROP.mistSegments);
  for (let i = 0; i < m.sheets; i++) {
    const f = i / (m.sheets - 1); // 0 at the base, 1 at the top
    const mat = paintMaterial({ color: ramp('paper-cream'), opacity: 1 + f * (m.topOpacity - 1), wash: i > 0 });
    materials.push(mat);
    const sheet = new THREE.Mesh(sheetGeo, mat);
    sheet.name = 'backdrop:mist';
    sheet.rotation.x = -Math.PI / 2;
    sheet.position.set(cx, m.baseY + f * (m.topY - m.baseY), cz);
    sheet.renderOrder = order++;
    sheet.userData['sharedAsset'] = true; // one geometry for all sheets: disposed below, once
    root.add(sheet);
  }

  paint(root);
  return {
    root,
    dispose() {
      sheetGeo.dispose();
      for (const x of ringMaps) x.dispose(); // clones; the decoded textures themselves stay cached
      for (const x of materials) x.dispose();
    },
  };
}
