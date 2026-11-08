// Landing mark (B-3, Q2b, D-007): a hard-edged flat ink disc directly beneath the player, so a
// fixed follow camera over flat fills can still read jump depth. Behind a flag, default OFF;
// the H2.5 feel test decides whether it ships.
//
// D-007's constraints, and how each is met:
//  1. No implied light. Flat, opaque, hard-edged, exactly under the capsule centre: no softness, no
//     penumbra, no offset, no opacity falloff. Palette ink-black, never the accent.
//  2. Budgets. When off, the mesh is invisible: three.js does not draw it or upload its geometry,
//     so renderer.info and the goldens are byte-identical. When on it is ONE draw call against a
//     Tier-1 ceiling of 300 (the gym peaks near 30): no exemption needed (OQ-029).
//  3. It reports "how far down is the ground", not "where will I land". If the feel test still
//     cannot judge depth, the next move is a ballistic landing PREDICTOR, not a bigger dot.
//
// Render-only: it reads physics (castRay) and never writes it, so the simulation and replays are
// unaffected. No new numbers: radius is the capsule radius, shrinking with height over the body
// height, r = capsuleRadius * bodyHeight / (bodyHeight + d).

import * as THREE from 'three';
import type { Physics } from '../engine/physics';
import { TUNING, type Player } from './player';

/** palette.json `ink-black`. */
const INK_BLACK = 0x20201e;
const DOWN = { x: 0, y: -1, z: 0 };

export class LandingMark {
  readonly mesh: THREE.Mesh;

  constructor(private readonly physics: Physics) {
    this.mesh = new THREE.Mesh(
      new THREE.CircleGeometry(1, 32),
      // polygonOffset keeps the disc above the floor it lies on without inventing a lift distance
      new THREE.MeshBasicMaterial({ color: INK_BLACK, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, fog: false }),
    );
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.visible = false;
    this.mesh.name = 'landing-mark';
  }

  /** Call each render frame after the player's visual has been interpolated. */
  update(player: Player, floorY: number): void {
    if (!TUNING.landingMark) {
      this.mesh.visible = false;
      return;
    }
    const c = player.mesh.position; // interpolated capsule centre: the mark tracks what is drawn
    const centreToFeet = player.feetOffset();
    const hit = this.physics.castRay(c, DOWN, Math.max(0, c.y - floorY), player.collider);
    if (!hit) {
      this.mesh.visible = false; // over the void there is no ground to report
      return;
    }
    const d = Math.max(0, hit.distance - centreToFeet); // feet-to-ground distance
    const body = 2 * (TUNING.capsuleHalfHeight + TUNING.capsuleRadius);
    const r = (TUNING.capsuleRadius * body) / (body + d);
    this.mesh.position.set(c.x, hit.point.y, c.z);
    this.mesh.scale.set(r, r, 1);
    this.mesh.visible = true;
  }
}
