// Third-person spring-arm camera.
// Spherical yaw/pitch around a pivot above the target; pitch is clamped well inside +/-90deg
// and the camera always uses world-up, so it can never gimbal-flip.

import * as THREE from 'three';

export const CAMERA_TUNING = {
  distance: 7,              // rest arm length (m)
  minDistance: 0.8,         // never closer than this, even when pushed by geometry
  pivotHeight: 1.5,         // pivot above the target point (m)
  initialPitchDeg: 18,      // elevation above the pivot at spawn
  pitchMinDeg: -25,         // looking up from below
  pitchMaxDeg: 70,          // looking down from above (must stay < 90 to avoid flip)
  mouseSensitivity: 0.0025, // radians per pixel of mouse movement
  followDamping: 12,        // pivot follow sharpness (1/s); higher = stiffer
  armReturnDamping: 4,      // arm re-extension sharpness after a collision (1/s)
  collisionPadding: 0.3,    // keep this far in front of the wall that pushed us in (m)
  lookAheadTime: 0.25,      // pivot leads the target by velocity * this (s)
  lookAheadMax: 2.0,        // cap on look-ahead offset (m)
  lookAheadDamping: 3,      // look-ahead smoothing (1/s)
};

const DEG2RAD = Math.PI / 180;

/** Returns hit distance along dir, or null. Supplied by the caller so the camera stays decoupled. */
export type CameraRaycast = (origin: THREE.Vector3, dir: THREE.Vector3, maxDistance: number) => number | null;

const damp = (k: number, dt: number): number => 1 - Math.exp(-k * dt);

/** Arm length the rig allows given a raycast hit along the arm (null = clear). Shared with the harness (D-012). */
export function allowedArm(hit: number | null): number {
  const t = CAMERA_TUNING;
  return hit === null ? t.distance : Math.max(t.minDistance, hit - t.collisionPadding);
}

export class SpringArmCamera {
  yaw = 0;
  pitch = CAMERA_TUNING.initialPitchDeg * DEG2RAD;
  private readonly pivot = new THREE.Vector3();
  private readonly lookAhead = new THREE.Vector3();
  private armLength = CAMERA_TUNING.distance;
  private readonly tmpDir = new THREE.Vector3();
  private readonly tmpTarget = new THREE.Vector3();
  private readonly tmpLead = new THREE.Vector3();

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

  snap(target: THREE.Vector3): void {
    this.pivot.copy(target).y += CAMERA_TUNING.pivotHeight;
    this.lookAhead.set(0, 0, 0);
    this.armLength = CAMERA_TUNING.distance;
    this.apply();
  }

  update(dt: number, target: THREE.Vector3, velocity: THREE.Vector3): void {
    const t = CAMERA_TUNING;
    this.pitch = THREE.MathUtils.clamp(this.pitch, t.pitchMinDeg * DEG2RAD, t.pitchMaxDeg * DEG2RAD);

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
    const cp = Math.cos(this.pitch);
    return out.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
  }

  private apply(): void {
    this.armDirection(this.tmpDir);
    this.camera.position.copy(this.pivot).addScaledVector(this.tmpDir, this.armLength);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.pivot);
  }
}
