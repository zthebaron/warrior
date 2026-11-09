// Third-person spring-arm camera.
// Spherical yaw/pitch around a pivot above the target; pitch is clamped well inside +/-90deg
// and the camera always uses world-up, so it can never gimbal-flip.

import * as THREE from 'three';

import { CAMERA_TUNING } from './camera-tuning';
import { PITCH_ASSIST, assistPitchDeg, probeHeight, type AssistRig } from './pitch-assist';
import { RENDER_CONFIG } from './render-config';

export { CAMERA_TUNING };

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/** Returns hit distance along dir, or null. Supplied by the caller so the camera stays decoupled. */
export type CameraRaycast = (origin: THREE.Vector3, dir: THREE.Vector3, maxDistance: number) => number | null;

const damp = (k: number, dt: number): number => 1 - Math.exp(-k * dt);

const RIG: AssistRig = { pivotHeight: CAMERA_TUNING.pivotHeight, distance: CAMERA_TUNING.distance, initialPitchDeg: CAMERA_TUNING.initialPitchDeg, pitchMaxDeg: CAMERA_TUNING.pitchMaxDeg, fovDeg: RENDER_CONFIG.fovDeg };
const DOWN = new THREE.Vector3(0, -1, 0);

/** What the pitch assist's probe last found (D-015d). Read by the harness and the ~ overlay; never drawn. */
export interface AssistProbe {
  standoff: number; // feet to face, along the player's facing (m)
  rise: number; // face top above the feet (m)
  depth: number; // landing depth measured by the probe (m), capped at PITCH_ASSIST.depthMaxM
  targetDeg: number | null; // assistPitchDeg's answer; null = no pitch makes it read
}

/** Arm length the rig allows given a raycast hit along the arm (null = clear). Shared with the harness (D-012). */
export function allowedArm(hit: number | null): number {
  const t = CAMERA_TUNING;
  return hit === null ? t.distance : Math.max(t.minDistance, hit - t.collisionPadding);
}

export class SpringArmCamera {
  yaw = 0;
  /** The player's pitch (mouse). The view uses pitch + the assist's offset, which never writes this. */
  pitch = CAMERA_TUNING.initialPitchDeg * DEG2RAD;
  /** D-015d pitch assist; `?pitchassist=off` clears it (the comparison, as ?landingmark=off is). */
  assistEnabled = true;
  /** Radians currently added to `pitch` by the assist (blended; 0 when released). */
  assistOffset = 0;
  lastProbe: AssistProbe | null = null;
  private readonly pivot = new THREE.Vector3();
  private readonly lookAhead = new THREE.Vector3();
  private armLength = CAMERA_TUNING.distance;
  private readonly tmpDir = new THREE.Vector3();
  private readonly tmpTarget = new THREE.Vector3();
  private readonly tmpLead = new THREE.Vector3();
  private readonly tmpO = new THREE.Vector3();
  private readonly tmpF = new THREE.Vector3();

  constructor(private readonly camera: THREE.PerspectiveCamera, private readonly raycast: CameraRaycast) {}

  addLook(dxPixels: number, dyPixels: number): void {
    const t = CAMERA_TUNING;
    this.yaw -= dxPixels * t.mouseSensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dyPixels * t.mouseSensitivity, t.pitchMinDeg * DEG2RAD, t.pitchMaxDeg * DEG2RAD);
  }

  /** Point the camera behind a facing angle (radians, 0 = looking down -Z). */
  setYaw(yaw: number): void {
    this.yaw = yaw;
  }

  /** Jump straight to the final pose: no follow lag, and the assist at its target, not blending to it. */
  snap(target: THREE.Vector3, facing?: number): void {
    this.pivot.copy(target).y += CAMERA_TUNING.pivotHeight;
    this.lookAhead.set(0, 0, 0);
    this.assistOffset = facing === undefined ? 0 : this.assistWant(target, facing);
    const hit = this.raycast(this.pivot, this.armDirection(this.tmpDir), CAMERA_TUNING.distance);
    this.armLength = allowedArm(hit);
    this.apply();
  }

  /**
   * D-015d. The pitch offset (radians, >= 0) the assist wants: probe along the player's facing at
   * probeHeight (0.5 below the rest eye) for a face within probeM; find its top with a down-ray just inside it, and the landing's depth
   * with down-rays stepped along the facing; then assistPitchDeg (the same function READABLE_RISE models).
   * 0 when nothing is faced, the top already reads, or no pitch can make it read.
   */
  assistWant(feet: THREE.Vector3, facing: number): number {
    this.lastProbe = null;
    if (!this.assistEnabled) return 0;
    const a = PITCH_ASSIST, t = CAMERA_TUNING;
    const fwd = this.tmpF.set(-Math.sin(facing), 0, -Math.cos(facing));
    const o = this.tmpO.copy(feet);
    o.y += probeHeight(RIG);
    const standoff = this.raycast(o, fwd, a.probeM);
    if (standoff === null) return 0;
    // Down-rays start at the highest the eye can ever be (pivot + full arm): nothing above it is seen from above.
    const top = feet.y + t.pivotHeight + t.distance;
    const heightAt = (along: number): number | null => {
      o.set(feet.x + fwd.x * along, top, feet.z + fwd.z * along);
      const d = this.raycast(o, DOWN, t.pivotHeight + t.distance);
      return d === null ? null : top - d;
    };
    const lip = heightAt(standoff + a.epsM);
    if (lip === null) return 0;
    let depth = a.epsM;
    for (let s = a.depthStepM; s <= a.depthMaxM; s += a.depthStepM) {
      const y = heightAt(standoff + a.epsM + s);
      if (y === null || Math.abs(y - lip) > a.epsM) break;
      depth = a.epsM + s;
    }
    const rise = lip - feet.y;
    const base = this.pitch * RAD2DEG;
    const targetDeg = assistPitchDeg(RIG, base, rise, depth, standoff);
    this.lastProbe = { standoff, rise, depth, targetDeg };
    return targetDeg === null ? 0 : Math.max(0, (targetDeg - base) * DEG2RAD);
  }

  /** The pitch the view actually uses: the player's plus the assist's offset, clamped to the rig's range. */
  viewPitch(): number {
    const t = CAMERA_TUNING;
    return THREE.MathUtils.clamp(this.pitch + this.assistOffset, t.pitchMinDeg * DEG2RAD, t.pitchMaxDeg * DEG2RAD);
  }

  update(dt: number, target: THREE.Vector3, velocity: THREE.Vector3, facing?: number): void {
    const t = CAMERA_TUNING;
    this.pitch = THREE.MathUtils.clamp(this.pitch, t.pitchMinDeg * DEG2RAD, t.pitchMaxDeg * DEG2RAD);

    // D-015d: blend toward the assist's offset at the follow rig's own sharpness, and back to 0 on release
    const want = facing === undefined ? 0 : this.assistWant(target, facing);
    this.assistOffset += (want - this.assistOffset) * damp(t.followDamping, dt);

    // velocity look-ahead (horizontal only), damped
    this.tmpLead.set(velocity.x, 0, velocity.z).multiplyScalar(t.lookAheadTime);
    if (this.tmpLead.length() > t.lookAheadMax) this.tmpLead.setLength(t.lookAheadMax);
    this.lookAhead.lerp(this.tmpLead, damp(t.lookAheadDamping, dt));

    this.tmpTarget.copy(target).add(this.lookAhead);
    this.tmpTarget.y += t.pivotHeight;
    this.pivot.lerp(this.tmpTarget, damp(t.followDamping, dt));

    // raycast pushback: snap IN immediately (never clip), ease back OUT
    this.armDirection(this.tmpDir);
    const hit = this.raycast(this.pivot, this.tmpDir, t.distance);
    const allowed = allowedArm(hit);
    this.armLength = allowed < this.armLength ? allowed : this.armLength + (allowed - this.armLength) * damp(t.armReturnDamping, dt);
    this.apply();
  }

  private armDirection(out: THREE.Vector3): THREE.Vector3 {
    const p = this.viewPitch();
    const cp = Math.cos(p);
    return out.set(Math.sin(this.yaw) * cp, Math.sin(p), Math.cos(this.yaw) * cp);
  }

  private apply(): void {
    this.armDirection(this.tmpDir);
    this.camera.position.copy(this.pivot).addScaledVector(this.tmpDir, this.armLength);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.pivot);
  }
}
