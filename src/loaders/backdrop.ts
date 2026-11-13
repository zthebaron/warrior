// The painted backdrop of an ink level (D-020, D-021): the far field as painted layers instead of kit geometry.
//
//   paper sky   no geometry: the paper is the sky (D-018) and stays bare
//   horizon     one ring of the seed's own far ridge (tools/art/backdrop-textures.mjs), the farthest thing drawn
//   far peaks   ART-GEN's painted peaks and wide views (tools/art/backdrop-cards.mjs), each a plane fixed in
//               the world at its own distance and bearing, facing the level: they slide against each other and
//               against the horizon as the camera walks. Parallax is perspective, nothing translates (Q2a)
//   mid cliffs  ART-GEN's painted cliff faces as standing forms beyond the ends of the rock wall and behind it,
//               laid down thinner for distance (§3: a mid form is never darker than ink-grey)
//   mist sea    BARE PAPER (Tim, gap THREE). Not a surface and not a shape: a few sheets of paper-coloured wash
//               stacked under the path, so whatever stands in the mist thins into the paper instead of ending
//               at a drawn edge. Every sheet is paper-cream; only what is behind it changes.
//   mist bands  ART-GEN's painted mist, far out on the void side and thin: streaks at the horizon, where the
//               peaks' feet are. Drawn AFTER the sheets, which would otherwise paper over them.
//
// Everything here is on the paint layer (src/engine/paint-layer.ts): unlit, drawn after the ink pass, hidden by
// any ink geometry in front of it. Nothing here writes depth, so the draw order is the order below. Every number
// is in MEASUREMENTS.md "D-020 painted backdrop" and "D-021 painted backdrop".

import * as THREE from 'three';

import { paint, paintMaterial } from '../engine/paint-layer';
import { ramp } from '../engine/palette';

type Vec3 = [number, number, number];

export const BACKDROP = {
  // The horizon: radius: u from the centre of the level's bounds (ring + the farthest camera stays inside the
  // 600u far clip); height/baseY: u; repeat: copies of the 1024x64 crop round the ring, EVEN, because alternate
  // copies are mirrored so the crop's cut right edge meets itself; turn: fraction of a full turn; ink: how much
  // of the seed's wash is laid down.
  ridges: [
    { radius: 460, height: 30, baseY: -13, repeat: 6, turn: 0.13, ink: 0.6 },
  ],
  ringSegments: 96,
  // Far peaks: card, bearing (degrees from +x, the way the path runs, toward +z, the void), radius (u from the
  // centre of the bounds), width (u), foot y, ink (farther = paler), mirrored. Each stands `peakSquash` of its
  // painting's own height: the seed's far ridges are long low humps, and the paintings are steeper than that.
  // Their feet stand just under the mist's top (y -3), so the painting's own soft foot shows; lower, the mist
  // cuts every peak off along one straight line.
  peaks: [
    ['peaks_b', 8, 400, 240, -3.5, 0.9, false],
    ['peaks_a', 62, 350, 250, -3.5, 1, true],
    ['wide_b', 118, 410, 260, -3.5, 0.8, false],
    ['peaks_a', 176, 370, 240, -3.5, 0.9, false],
    ['peaks_c', 236, 430, 230, -3.5, 0.4, true],
    ['wide_a', 312, 400, 250, -3.5, 0.75, false],
  ] as [string, number, number, number, number, number, boolean][],
  peakSquash: 0.6,
  // Mid cliffs: card, x, z (u, world), height (u; the width follows the painting), yaw (degrees), ink, mirrored.
  // 45-60u from a camera on the path: STYLE §3's mid band. The first three stand behind the rock wall and show
  // over it; the last three close the view past each end of the path. Their feet stand just under the mist's
  // top: the painting's own foot fades out above it, where the mist would otherwise cut it off straight.
  cliffs: [
    ['cliff_b', 36, -62, 70, -6, 0.5, false],
    ['cliff_a', 84, -56, 62, 10, 0.55, true],
    ['cliff_c', 128, -60, 72, -12, 0.5, false],
    ['cliff_c', -34, -30, 46, 40, 0.55, true],
    ['cliff_a', 150, -22, 44, -70, 0.6, false],
    ['cliff_b', 166, 8, 36, -95, 0.5, true],
  ] as [string, number, number, number, number, number, boolean][],
  cliffFootY: -4,
  // Mist: sheets from baseY (solid paper) up to topY, each thinner than the one below. topY is 3u under
  // chapter 1's lowest landing (y 0); baseY is above every dressed wall's foot (lowest y -8).
  mist: { radius: 520, baseY: -7, topY: -3, sheets: 6, topOpacity: 0.18 },
  mistSegments: 48,
  // Mist bands: card, bearing, radius, width, foot y, ink, mirrored. On the void side only.
  bands: [
    ['mist_b', 40, 250, 170, -5, 0.4, false],
    ['mist_a', 105, 210, 150, -6, 0.3, true],
    ['mist_b', 160, 280, 190, -5, 0.35, true],
  ] as [string, number, number, number, number, number, boolean][],
} as const;

const URLS = {
  ...import.meta.glob<string>('../../assets/backdrop/*.png', { query: '?url', import: 'default', eager: true }),
  // D-021: the painted cards (tools/art/backdrop-cards.mjs, from ART-GEN's paintings in assets/backdrop/gen)
  ...import.meta.glob<string>('../../assets/backdrop/cards/*.png', { query: '?url', import: 'default', eager: true }),
};
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

/** A decoded painted card (assets/backdrop/cards/<name>.png). */
export function cardTexture(name: string): THREE.Texture {
  return texture(name);
}

/** width / height of a card's painting. */
export function cardAspect(name: string): number {
  const img = texture(name).image as { width: number; height: number };
  return img.width / img.height;
}

/** A plane for a card, mirrored in the texture when asked (a negative scale would turn its face away). */
export function cardPlane(width: number, height: number, mirror: boolean): THREE.PlaneGeometry {
  const geo = new THREE.PlaneGeometry(width, height);
  if (mirror) {
    const uv = geo.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
  }
  return geo;
}

/**
 * The painted backdrop for a level with these bounds. Static: built once, never moved.
 * lowestLanding: the lowest y the critical path stands on. The mist is paper drawn over whatever is below it,
 * and it is on the paint layer, which the linter's sightline rules do not see: so it may never reach a landing.
 */
export function buildBackdrop(bounds: { min: Vec3; max: Vec3 }, lowestLanding: number, cliffs: readonly (typeof BACKDROP.cliffs)[number][] = BACKDROP.cliffs, mistY: { baseY: number; topY: number } = BACKDROP.mist, peakSquash: number = BACKDROP.peakSquash): { root: THREE.Group; dispose(): void } {
  if (mistY.topY >= lowestLanding) {
    throw new Error(`[backdrop] the mist tops out at y ${mistY.topY}, at or above the level's lowest landing (y ${lowestLanding}): it would cover the path`);
  }
  const root = new THREE.Group();
  root.name = 'backdrop';
  const cx = (bounds.min[0] + bounds.max[0]) / 2;
  const cz = (bounds.min[2] + bounds.max[2]) / 2;
  const materials: THREE.Material[] = [];
  const geos: THREE.BufferGeometry[] = [];
  const ringMaps: THREE.Texture[] = [];
  let order = 0;
  const add = (name: string, geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh => {
    geos.push(geo);
    materials.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name;
    mesh.renderOrder = order++;
    root.add(mesh);
    return mesh;
  };
  /** A card standing at a bearing and radius from the centre of the bounds, facing it. */
  const ringCard = (name: string, [card, bearing, radius, width, footY, ink, mirror]: (typeof BACKDROP.peaks)[number], squash: number): void => {
    const height = (width / cardAspect(card)) * squash;
    const a = (bearing * Math.PI) / 180;
    const mesh = add(name, cardPlane(width, height, mirror), paintMaterial({ map: texture(card), opacity: ink, wash: true }));
    mesh.position.set(cx + radius * Math.cos(a), footY + height / 2, cz + radius * Math.sin(a));
    mesh.rotation.y = Math.atan2(cx - mesh.position.x, cz - mesh.position.z); // its face toward the centre
  };

  for (const r of BACKDROP.ridges) {
    const map = texture('far_ridge').clone();
    map.repeat.set(r.repeat, 1);
    map.needsUpdate = true;
    ringMaps.push(map);
    const ring = add('backdrop:ridge', new THREE.CylinderGeometry(r.radius, r.radius, r.height, BACKDROP.ringSegments, 1, true), paintMaterial({ map, opacity: r.ink, wash: true, side: THREE.BackSide }));
    ring.position.set(cx, r.baseY + r.height / 2, cz);
    ring.rotation.y = r.turn * Math.PI * 2;
  }

  // farthest first, so a nearer peak is laid over a farther one
  for (const p of [...BACKDROP.peaks].sort((a, b) => b[2] - a[2])) ringCard('backdrop:peak', p, peakSquash);

  // the mid cliffs stand at chapter 1's own places: a level that is not on that mountainside passes none
  for (const [card, x, z, height, yaw, ink, mirror] of cliffs) {
    const cliff = add('backdrop:cliff', cardPlane(height * cardAspect(card), height, mirror), paintMaterial({ map: texture(card), opacity: ink, wash: true, side: THREE.DoubleSide }));
    cliff.position.set(x, BACKDROP.cliffFootY + height / 2, z);
    cliff.rotation.y = (yaw * Math.PI) / 180;
  }

  const m = { ...BACKDROP.mist, baseY: mistY.baseY, topY: mistY.topY }; // D-029: a level in the mist has its own heights
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

  for (const b of [...BACKDROP.bands].sort((a, c) => c[2] - a[2])) ringCard('backdrop:band', b, 1);

  paint(root);
  return {
    root,
    dispose() {
      sheetGeo.dispose();
      for (const g of geos) g.dispose();
      for (const x of ringMaps) x.dispose(); // clones; the decoded textures themselves stay cached
      for (const x of materials) x.dispose();
    },
  };
}
