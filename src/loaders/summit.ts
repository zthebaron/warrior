// The summit ridge (D-030): what an ink level whose ambience zone is `summit` is drawn as. Chapter 4.
//
// The last climb, the highest ground: a crest of rock in thin air, the far peaks BELOW him now. It is drawn from
// the level's own boxes by the drift's method and the drift's code (drift.ts buildDrift, D-029), with a look of
// its own:
//
//   the edge        B-120, decided by the reviewer: ground he looks down on takes the dark band (the drift's
//                   brink); a top he catches from below takes the seam's paper lip; where one top is both, the
//                   dark band wins. On this ridge the follow camera stands 3.67 u over his feet and the tallest
//                   rise on the path is 1.75 u: he is never under a top he is going to. Every top takes the brink.
//   rock that hangs a box whose foot stands above the mist's top hangs in the air (the ridge's last three): it is
//                   drawn with its underside and a root of rock under it, narrowing down into the mist.
//   what moves      a stone that slides across the path (a patroller) is the kit's dark stone, in the ink pass.
//                   Under its whole sweep lies its LANE: dry-brush laid across the path, fixed in the world, where
//                   every other stroke on the ground runs along it. The stone is a thing on a track, and the track
//                   is there to be read before he steps onto it, wherever the stone happens to be.
//   the far field   nothing stands over him but the rock that is really there. The painted wall keeps its front
//                   rows and loses the tall row behind; no card of it stands taller than `wall.cap`. No towers.
//                   The far peaks are small and near, at their paintings' own proportion, standing in the mist as
//                   islands in a sea of cloud: their heads reach the height of his eye at the start of the chapter
//                   and are under it from there on. The horizon ring stands lower by the same measure.
//
// Reused whole: the seam's two face cards, the wall's cliff paintings and pines, the far peaks' and the mist's
// paintings, the path's dry-brush card (the lane is that card, laid the other way). Nothing was bought.
//
// RENDER ONLY. Not one collider is made or changed here. Every number is in MEASUREMENTS.md "D-030 the summit's look".

import * as THREE from 'three';

import { paint, paintMaterial } from '../engine/paint-layer';
import { ramp, type RampName } from '../engine/palette';
import { cardAspect, cardTexture, type BACKDROP, type FarField } from './backdrop';
import { DRIFT, buildDrift, type RockLook } from './drift';
import { Quads, type SeamBox, type SeamRock } from './seam';

type Vec3 = [number, number, number];

export const SUMMIT = {
  /** `lighting.ambienceZone` of a level drawn this way */
  zone: 'summit',
  // The rock: the drift's values, the drift's brink on every top (B-120), the drift's tiles of the seam's cards.
  look: {
    top: DRIFT.top, face: DRIFT.face, brink: DRIFT.brink, minSlab: DRIFT.minSlab, under: DRIFT.under,
    tile: DRIFT.tile, cycle: DRIFT.cycle, ink: DRIFT.ink, order: DRIFT.order, ledge: DRIFT.ledge,
    channel: DRIFT.channel, adriftOrder: DRIFT.adriftOrder,
    // Islands in the cloud, on the void side (the drift's `adrift` columns: card, x, foot y, z, height, yaw, ink,
    // mirrored): cliff paintings standing deep in the mist, so only a head of rock shows over it, and two low
    // peaks. No head stands above y 3.5: under his eye (3.67) where the chapter starts, and further under it
    // with every rise. Each is turned to face the way he comes, 22 u and more from the path's edge.
    adrift: [
      ['cliff_b', 36, -13.5, 30, 17, 232, 0.6, false],
      ['peaks_a', 60, -2.2, 64, 5.7, 205, 0.75, true],
      ['cliff_a', 80, -15.5, 27, 19, 236, 0.6, true],
      ['cliff_c', 106, -14.5, 42, 18, 228, 0.55, false],
      ['peaks_c', 124, -2.2, 78, 5.7, 210, 0.7, false],
      ['cliff_b', 140, -15.5, 26, 19, 232, 0.6, true],
      ['cliff_a', 170, -17.5, 36, 21, 240, 0.55, false],
    ],
    /** the mist's heights: as the drift's, 1.5 u under the lowest landing (y 0) */
    mist: { baseY: -5.5, topY: -1.5 },
    /** a box that hangs: its root starts this far inside its underside; the root's two values */
    hang: { inset: 0.35, steps: ['ink-deep', 'ink-black'] },
  } as RockLook,
  /** the mid cliffs (backdrop.ts BACKDROP.cliffs): none. No tower stands over the summit */
  cliffs: [] as (typeof BACKDROP.cliffs)[number][],
  /** the painted wall (cliff-wall.ts): without its tall back row, and no card taller than `cap` u (a mass is 12 u) */
  wall: { back: false, cap: 18 },
  // The far field. ridgeDrop: the horizon ring stands this much lower: its crest at y 3, under his eye (3.67 at
  // the start). peaks (card, bearing, radius, width, foot y, ink, mirrored): small and near, each at its
  // painting's proportion, 5.1 to 5.6 u tall on a foot just under the mist's top (heads at 3.1 to 3.62): islands in the cloud, on the
  // void side and ahead. bands: mist lying low across the islands' feet.
  far: {
    ridgeDrop: 14,
    peaks: [
      ['peaks_c', 3, 330, 19, -2, 0.6, false],
      ['peaks_a', 20, 240, 24, -2, 0.8, false],
      ['peaks_c', 48, 150, 18, -2, 0.9, true],
      ['wide_b', 75, 200, 29, -2, 0.7, false],
      ['peaks_b', 100, 120, 27, -2, 0.9, true],
      ['peaks_a', 128, 180, 23, -2, 0.8, true],
      ['wide_a', 155, 260, 28, -2, 0.7, false],
    ],
    bands: [
      ['mist_b', 30, 210, 70, -8, 0.3, true],
      ['mist_b', 62, 135, 60, -7, 0.35, false],
      ['mist_a', 115, 150, 46, -8, 0.3, true],
    ],
  } as FarField,
  // The lane under a sliding stone's sweep, as long as the sweep plus the stone, cropped to the top it lies on.
  // track: in the INK PASS, a band the stone's own width in `step` (one step off the ground's paper, at any
  // distance, as the drift's stone top is), drawn with polygon offset `lift` so it wins the tie with the top it
  // lies in and with the path's dry-brush (offset -1). Over it, on the paint layer: the path's dry-brush card laid
  // ACROSS the path at its own proportion, cropped and never scaled (offset `washLift`); ink: how much is laid.
  lane: { card: 'path_wash', ink: 0.95, order: 50, step: 'mist-pale', lift: -2, washLift: -3 },
} as const;

/** A sliding stone's sweep: the two ends of its path (its centre) and its size. */
export interface SummitSweep { from: Vec3; to: Vec3; size: Vec3 }

const S = SUMMIT;
const EPS = 0.01; // u: a top "under" a stone is the one whose height is the stone's foot, within this

/**
 * Dress a summit level. `boxes`: every unturned box of the level; `rocks`: the rock masses it collides with and
 * does not draw; `sweeps`: its sliding stones' paths. Static: built once, never moved.
 */
export function buildSummit(boxes: SeamBox[], rocks: SeamRock[], sweeps: SummitSweep[]): { root: THREE.Group; dispose(): void } {
  const rock = buildDrift(boxes, rocks, [], S.look);
  const root = rock.root;
  root.name = 'summit';
  const disposables: { dispose(): void }[] = [];

  // the lanes: one mesh of brushwork and one of track, every lane's quads in them
  const lanes = new Quads(), tracks = new Quads();
  const cTrack = new THREE.Color(ramp(S.lane.step as RampName));
  const aspect = cardAspect(S.lane.card);
  for (const s of sweeps) {
    const dx = s.to[0] - s.from[0], dz = s.to[2] - s.from[2];
    const alongZ = Math.abs(dz) >= Math.abs(dx); // an axis-aligned sweep: its longer way
    const run = alongZ ? Math.abs(dz) : Math.abs(dx);
    if (run === 0) continue;
    const size = alongZ ? s.size[2] : s.size[0];
    const length = run + size, width = length / aspect; // the whole card, at its own proportion
    const mid = alongZ ? (s.from[2] + s.to[2]) / 2 : (s.from[0] + s.to[0]) / 2; // along the sweep
    const at = alongZ ? s.from[0] : s.from[2];                                    // across it
    const a0 = mid - length / 2, c0 = at - width / 2;
    const footY = s.from[1] - s.size[1] / 2;
    for (const b of boxes) {
      if (Math.abs(b.y1 - footY) > EPS) continue; // not the ground it slides on
      // the lane, cropped to this top
      const lo = Math.max(a0, alongZ ? b.z0 : b.x0), hi = Math.min(a0 + length, alongZ ? b.z1 : b.x1);
      const cl = Math.max(c0, alongZ ? b.x0 : b.z0), ch = Math.min(c0 + width, alongZ ? b.x1 : b.z1);
      if (hi - lo <= 0 || ch - cl <= 0) continue;
      const p = (a: number, c: number): Vec3 => (alongZ ? [c, b.y1, a] : [a, b.y1, c]);
      const uv = (q: Vec3): [number, number] => [((alongZ ? q[2] : q[0]) - a0) / length, ((alongZ ? q[0] : q[2]) - c0) / width];
      // counter-clockwise seen from above
      if (alongZ) lanes.wash(p(hi, cl), p(hi, ch), p(lo, ch), p(lo, cl), uv);
      else lanes.wash(p(lo, ch), p(hi, ch), p(hi, cl), p(lo, cl), uv);
      // the track: the stone's own width, centred on its sweep
      const half = (alongZ ? s.size[0] : s.size[2]) / 2, tl = Math.max(at - half, alongZ ? b.x0 : b.z0), th = Math.min(at + half, alongZ ? b.x1 : b.z1);
      if (th - tl <= 0) continue;
      if (alongZ) tracks.flat(p(hi, tl), p(hi, th), p(lo, th), p(lo, tl), cTrack);
      else tracks.flat(p(lo, th), p(hi, th), p(hi, tl), p(lo, tl), cTrack);
    }
  }
  if (lanes.idx.length) {
    const geo = lanes.geometry();
    const mat = paintMaterial({ map: cardTexture(S.lane.card), opacity: S.lane.ink, wash: true });
    mat.polygonOffset = true; // it lies exactly on the top the ink pass drew (as the path's dry-brush does)
    mat.polygonOffsetFactor = S.lane.washLift;
    mat.polygonOffsetUnits = S.lane.washLift;
    const mesh = paint(new THREE.Mesh(geo, mat));
    mesh.name = 'summit:lane';
    mesh.renderOrder = S.lane.order;
    root.add(mesh);
    disposables.push(geo, mat); // the decoded texture stays cached
  }

  if (tracks.idx.length) {
    const geo = tracks.geometry();
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: S.lane.lift, polygonOffsetUnits: S.lane.lift }); // D-018: unlit, flat, a ramp step
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'summit:track';
    root.add(mesh);
    disposables.push(geo, mat);
  }

  return {
    root,
    dispose() {
      rock.dispose();
      for (const d of disposables) d.dispose();
    },
  };
}
