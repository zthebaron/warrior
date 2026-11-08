// Rapier world, stepped only from the fixed-timestep loop.
//
// !! The character-controller values below are VERIFIED (npm run check:physics) and are
// !! mirrored in the MOVE table of tools/lint-level.mjs:
// !!   kcc.maxSlopeClimbDeg   <->  MOVE.ground.slope
// !!   kcc.autostepMaxHeight  <->  MOVE.ground.autostep
// !! Change one, change both — otherwise levels lint clean and are still unplayable.

import RAPIER from '@dimforge/rapier3d-compat';

export { RAPIER };

export const PHYSICS_CONFIG = {
  gravityY: -30, // world gravity for dynamic bodies (the player integrates its own gravity)
  kcc: {
    offset: 0.01,               // skin gap the controller keeps from obstacles (m)
    autostepMaxHeight: 0.5,     // max step the controller climbs without jumping (m)
    autostepMinWidth: 0.2,      // min free width on top of a step (m)
    autostepIncludeDynamic: true,
    snapToGroundDistance: 0.5,  // glue to ground when walking down slopes/steps (m)
    maxSlopeClimbDeg: 50,       // steeper surfaces are walls
  },
};

const DEG2RAD = Math.PI / 180;

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface RayHit {
  distance: number;
  point: Vec3Like;
  normal: Vec3Like;
  collider: RAPIER.Collider;
}

export class Physics {
  private constructor(readonly world: RAPIER.World) {}

  static async create(): Promise<Physics> {
    await RAPIER.init();
    const world = new RAPIER.World({ x: 0, y: PHYSICS_CONFIG.gravityY, z: 0 });
    return new Physics(world);
  }

  /** Advance exactly one fixed tick. Called from the loop's onFixedUpdate only. */
  step(dt: number): void {
    this.world.timestep = dt;
    this.world.step();
  }

  createCharacterController(): RAPIER.KinematicCharacterController {
    const k = PHYSICS_CONFIG.kcc;
    const ctrl = this.world.createCharacterController(k.offset);
    ctrl.enableAutostep(k.autostepMaxHeight, k.autostepMinWidth, k.autostepIncludeDynamic);
    ctrl.enableSnapToGround(k.snapToGroundDistance);
    ctrl.setMaxSlopeClimbAngle(k.maxSlopeClimbDeg * DEG2RAD);
    ctrl.setApplyImpulsesToDynamicBodies(true);
    return ctrl;
  }

  /** Kinematic capsule with CCD enabled (fast movers must not tunnel). */
  createKinematicCapsule(halfHeight: number, radius: number, center: Vec3Like): { body: RAPIER.RigidBody; collider: RAPIER.Collider } {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(center.x, center.y, center.z).setCcdEnabled(true),
    );
    const collider = this.world.createCollider(RAPIER.ColliderDesc.capsule(halfHeight, radius), body);
    return { body, collider };
  }

  castRay(origin: Vec3Like, dir: Vec3Like, maxDistance: number, exclude?: RAPIER.Collider): RayHit | null {
    const ray = new RAPIER.Ray(origin, dir);
    const hit = this.world.castRayAndGetNormal(ray, maxDistance, true, undefined, undefined, exclude);
    if (!hit) return null;
    const p = ray.pointAt(hit.timeOfImpact);
    return { distance: hit.timeOfImpact, point: { x: p.x, y: p.y, z: p.z }, normal: hit.normal, collider: hit.collider };
  }

  /** Push body positions set via setTranslation to their colliders NOW (not at the next step),
   *  so queries / the character controller don't see stale collider positions after a teleport. */
  syncColliders(): void {
    this.world.propagateModifiedBodyPositionsToColliders();
  }

  removeBody(body: RAPIER.RigidBody): void {
    this.world.removeRigidBody(body);
  }

  debugLines(): { vertices: Float32Array; colors: Float32Array } {
    return this.world.debugRender();
  }
}
