// Landing mark (B-3, Q2b, D-007, D-010): a hard-edged flat ink disc directly beneath the player, so a
// fixed follow camera over flat fills can still read jump depth. Built default-off; the H2.5 feel
// test chose it, so it ships ON (D-010). ?landingmark=off is the in-place comparison. It is the
// documented exception in STYLE-BIBLE §9: not a shadow (no softness, no offset, no light direction).
//
// D-007's constraints, and how each is met:
//  1. No implied light. Flat, opaque, hard-edged, exactly under the capsule centre: no softness, no
//     penumbra, no offset, no opacity falloff. Palette ink-black, never the accent.
//  2. Budgets. It is ONE draw call and 32 triangles, recorded in MEASUREMENTS.md and held by the
//     gym's scene ratchet (OQ-040). Off, it is invisible and costs nothing.
//  3. It reports "how far down is the ground", not "where will I land". The feel test found that
//     sufficient, so the ballistic landing predictor D-007 reserved is DROPPED (D-010), not deferred.
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
