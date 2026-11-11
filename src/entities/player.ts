// Player: kinematic capsule driven by Rapier's KinematicCharacterController.
// States: idle, run, sprint, jump, double_jump, fall, wall_slide, wall_jump,
//         ledge_grab, ledge_climb, dash, land.
// Every gameplay number lives in TUNING. Positions in/out of this class are FEET positions.

import * as THREE from 'three';
import { ROBE, ramp } from '../engine/palette';
import type { InputFrame } from '../engine/input';
import { NEUTRAL_FRAME } from '../engine/input';
import type { Collider, KinematicCharacterController, RigidBody } from '@dimforge/rapier3d-compat';
import type { Physics, Vec3Like } from '../engine/physics';
import type { CharacterAsset } from '../loaders/character';
import { CharacterModel } from './character-model';
import { FIGHT } from '../systems/fight';

export const TUNING = {
  // --- presentation (feel test) ---
  landingMark: 1,             // 1 = ink disc under the player. ON: the H2.5 feel test chose it (D-010, closing Q2b).
                              // ?landingmark=off is the in-place comparison switch; the ~ panel flips it live.

  // --- body ---
  capsuleHalfHeight: 0.6,     // m, cylinder half-height (total height = 2*(halfHeight+radius) = 1.9m). Respawn to apply.
  capsuleRadius: 0.35,        // m. Respawn to apply.

  // --- ground movement ---
  runSpeed: 7.0,              // m/s top speed while running
  sprintSpeed: 10.0,          // m/s top speed while sprint is held (sprint latches on the ground; keeps in air)
  groundAccel: 70,            // m/s^2 toward target speed with input
  groundDecel: 55,            // m/s^2 toward zero without input
  inputDeadzone: 0.15,        // input magnitude below this is ignored
  idleSpeedThreshold: 0.3,    // m/s below which a grounded player reads as idle

  // --- air ---
  airAccel: 28,               // m/s^2 air control with input
  airDecel: 6,                // m/s^2 horizontal drag in air without input
  gravity: 32,                // m/s^2 while rising
  fallGravityMult: 1.5,       // gravity multiplier while falling (snappier arcs)
  jumpCutGravityMult: 2.5,    // gravity multiplier while rising with jump released (variable jump height)
  maxFallSpeed: 35,           // m/s terminal velocity
  groundStickSpeed: 0,        // m/s downward bias while grounded. MUST stay 0: any downward push into a trimesh floor
                              // makes the KCC intermittently return zero movement (2 m/s -> ~2.5% of ground ticks froze,
                              // the "landing slowdown"). snapToGround(0.5) already keeps the capsule glued. H2b.

  // --- jumping ---
  jumpVelocity: 12.5,         // m/s initial upward velocity (peak ~ v^2/2g = 2.44m with jump held)
  doubleJumpVelocity: 11.0,   // m/s, replaces vertical velocity on the air jump
  coyoteTimeSec: 0.12,        // s after leaving ground during which a jump still counts as grounded
  jumpBufferSec: 0.1,         // s a jump press is remembered before landing

  // --- dash ---
  dashSpeed: 20,              // m/s during dash (gravity suspended)
  dashDurationSec: 0.16,      // s
  dashCooldownSec: 0.35,      // s between dashes
  airDashes: 1,               // dashes allowed per airtime
  dashExitSpeedFactor: 0.5,   // fraction of dash speed kept when the dash ends

  // --- surfaces ---
  groundNormalMinY: 0.7,      // contact normal.y at/above this counts as floor
  wallNormalMaxY: 0.3,        // |normal.y| at/below this counts as wall
  groundProbeExtra: 0.15,     // m below the feet to look for the collider we stand on (moving platforms)

  // --- wall slide / wall jump ---
  wallStickSec: 0.1,          // s a wall contact is remembered (wall-jump forgiveness)
  wallPressMinDot: 0.3,       // input . (into wall) needed to wall-slide / ledge-grab
  wallSlideMaxFallSpeed: 3.5, // m/s fall speed cap while wall sliding
  wallJumpUpVelocity: 11.5,   // m/s
  wallJumpAwayVelocity: 8.0,  // m/s pushed away from the wall
  wallJumpControlLockSec: 0.18, // s of no air control after a wall jump (prevents instant re-stick)

  // --- ledge grab / climb ---
  ledgeProbeForward: 0.55,    // m into the wall from the capsule centre to probe for a ledge top
  ledgeProbeTopAboveFeet: 2.3, // m above feet where the downward ledge probe starts
  ledgeProbeLength: 0.9,      // m probe length (grab window: ledge top 1.4..2.3m above feet)
  ledgeMinProbeClearance: 0.02, // m; probe starting inside geometry means wall too tall -> no ledge
  ledgeHangFeetBelowTop: 1.6, // m feet hang below the ledge top
  ledgeClimbSec: 0.35,        // s to climb up and over
  ledgeClimbUpFraction: 0.6,  // fraction of the climb spent rising before moving forward
  ledgeClimbForward: 0.6,     // m moved onto the ledge
  ledgeClimbSkin: 0.05,       // m above the ledge top the climb ends at
  ledgeDropDot: 0.5,          // input . (away from wall) that drops off the ledge
  ledgeRegrabDelaySec: 0.3,   // s after dropping before another grab is allowed

  // --- landing / facing ---
  landDurationSec: 0.08,      // s spent in `land` after a hard landing
  landMinImpactSpeed: 8,      // m/s downward speed for a landing to count as hard
  turnRateRadPerSec: 14,      // visual facing turn rate
};

export type PlayerState =
  | 'idle' | 'run' | 'sprint' | 'jump' | 'double_jump' | 'fall'
  | 'wall_slide' | 'wall_jump' | 'ledge_grab' | 'ledge_climb' | 'dash' | 'land';

const VISUAL = {
  capSegments: 6,
  radialSegments: 12,
  noseSize: [0.18, 0.18, 0.3] as const,
  noseForwardFactor: 1.0, // nose sits at capsuleRadius * this in front of the centre
  noseHeightFactor: 0.5,  // nose height = capsuleHalfHeight * this
  // D-018 (STYLE §1, §2, §9 item 3): unlit flat fills. The robe is the Bible's desaturated blue-grey; the
  // facing nose is brush black. The greybox per-state colours (saturated, off the ramp) are no longer drawn:
  // a state you can only read by hue is §9 item 3. B-33 replaces the capsule with the §7 figure.
  robeColor: ROBE,
  noseColor: ramp('ink-black'),
};

const DOWN = { x: 0, y: -1, z: 0 };

/** Returns the per-tick displacement of the collider the player stands on (moving platform), or null. */
export type GroundMotion = (collider: Collider) => Vec3Like | null;

function smoothstep(x: number): number {
  const c = THREE.MathUtils.clamp(x, 0, 1);
  return c * c * (3 - 2 * c);
}

export class Player {
  readonly mesh = new THREE.Group();
  readonly body: RigidBody;
  readonly collider: Collider;
  state: PlayerState = 'idle';
  stateTime = 0;
  grounded = false;
  facing = 0; // yaw radians; forward = (-sin, -cos) in XZ — same convention as the camera
  readonly vel = new THREE.Vector3();
  readonly center = new THREE.Vector3();
  groundMotion: GroundMotion = () => null;
  /**
   * Seconds into a sword slash, or null (D-022). Since D-023 it is simulated: it starts on a press and advances
   * in fixedUpdate, and src/systems/fight.ts reads it for the cut. It is NOT one of the twelve states and it
   * never touches velocity, a timer or a state: every move is exactly what it was.
   */
  slashTime: number | null = null;
  /** How many slashes have started: names the slash, so one slash lands on a swordsman once. */
  slashCount = 0;

  private readonly ctrl: KinematicCharacterController;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly model: CharacterModel | null = null;
  private readonly prevCenter = new THREE.Vector3();
  private prevInput: InputFrame = { ...NEUTRAL_FRAME };
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private dashTimer = 0;
  private dashCooldownTimer = 0;
  private controlLockTimer = 0;
  private wallStickTimer = 0;
  private regrabTimer = 0;
  private sprinting = false; // latched from input.sprint while grounded; held through the air
  private doubleAvailable = true;
  private airDashesLeft = TUNING.airDashes;
  private groundCollider: Collider | null = null;
  private readonly wallNormal = new THREE.Vector3();
  private readonly dashDir = new THREE.Vector3();
  private readonly climbFrom = new THREE.Vector3();
  private readonly climbTo = new THREE.Vector3();
  private ledgeTopY = 0;

  /** figure: the rigged character to draw (D-020). Without one the player is drawn as the capsule it collides as. */
  constructor(private readonly physics: Physics, feet: Vec3Like, facing: number, figure?: CharacterAsset) {
    const t = TUNING;
    this.center.set(feet.x, feet.y + this.feetOffset(), feet.z);
    const { body, collider } = physics.createKinematicCapsule(t.capsuleHalfHeight, t.capsuleRadius, this.center);
    this.body = body;
    this.collider = collider;
    this.ctrl = physics.createCharacterController();

    this.material = new THREE.MeshBasicMaterial({ color: VISUAL.robeColor });
    if (figure) {
      // The figure's feet are its origin; this.mesh's origin is the capsule's centre (the landing mark and
      // the camera read it there). The capsule stays the collider: the figure is drawn, never collided with.
      this.model = new CharacterModel(figure, 2 * this.feetOffset(), t.runSpeed);
      this.model.root.position.y = -this.feetOffset();
      this.mesh.add(this.model.root);
    } else {
      const capsule = new THREE.Mesh(
        new THREE.CapsuleGeometry(t.capsuleRadius, t.capsuleHalfHeight * 2, VISUAL.capSegments, VISUAL.radialSegments),
        this.material,
      );
      const nose = new THREE.Mesh(new THREE.BoxGeometry(...VISUAL.noseSize), new THREE.MeshBasicMaterial({ color: VISUAL.noseColor }));
      nose.position.set(0, t.capsuleHalfHeight * VISUAL.noseHeightFactor, -t.capsuleRadius * VISUAL.noseForwardFactor);
      this.mesh.add(capsule, nose);
    }
    this.teleport(feet, facing);
  }

  feetOffset(): number {
    return TUNING.capsuleHalfHeight + TUNING.capsuleRadius;
  }

  feet(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(this.center.x, this.center.y - this.feetOffset(), this.center.z);
  }

  teleport(feet: Vec3Like, facing = this.facing): void {
    this.center.set(feet.x, feet.y + this.feetOffset(), feet.z);
    this.prevCenter.copy(this.center);
    this.body.setTranslation(this.center, true);
    this.body.setNextKinematicTranslation(this.center);
    this.physics.syncColliders();
    this.vel.set(0, 0, 0);
    this.facing = facing;
    this.grounded = false;
    this.groundCollider = null;
    this.coyoteTimer = this.jumpBufferTimer = this.dashTimer = this.dashCooldownTimer = 0;
    this.controlLockTimer = this.wallStickTimer = this.regrabTimer = 0;
    this.sprinting = false;
    this.doubleAvailable = true;
    this.airDashesLeft = TUNING.airDashes;
    this.prevInput = { ...NEUTRAL_FRAME };
    this.slashTime = null; // a slash does not outlast being put somewhere else
    this.setState('fall');
  }

  private setState(s: PlayerState): void {
    if (s === this.state) return;
    this.state = s;
    this.stateTime = 0;
  }

  fixedUpdate(dt: number, input: InputFrame): void {
    const t = TUNING;
    const jumpPressed = input.jump && !this.prevInput.jump;
    const dashPressed = input.dash && !this.prevInput.dash;
    const slashPressed = input.slash && !this.prevInput.slash;
    this.prevInput = { ...input };
    this.prevCenter.copy(this.center);
    this.stateTime += dt;
    this.coyoteTimer -= dt;
    this.jumpBufferTimer -= dt;
    this.dashCooldownTimer -= dt;
    this.controlLockTimer -= dt;
    this.wallStickTimer -= dt;
    this.regrabTimer -= dt;
    if (jumpPressed) this.jumpBufferTimer = t.jumpBufferSec;
    this.updateSlash(dt, slashPressed);

    if (this.state === 'ledge_climb') return this.updateClimb();
    if (this.state === 'ledge_grab') return this.updateHang(input, jumpPressed);

    let mx = input.x;
    let mz = input.y;
    const mag = Math.hypot(mx, mz);
    const hasInput = mag > t.inputDeadzone;
    if (!hasInput) mx = mz = 0;
    else if (mag > 1) {
      mx /= mag;
      mz /= mag;
    }

    if (this.grounded) {
      this.coyoteTimer = t.coyoteTimeSec;
      this.doubleAvailable = true;
      this.airDashesLeft = t.airDashes;
    }

    // --- dash start ---
    if (dashPressed && this.dashCooldownTimer <= 0 && this.state !== 'dash' && (this.grounded || this.airDashesLeft > 0)) {
      if (hasInput) this.dashDir.set(mx, 0, mz).normalize();
      else this.dashDir.set(-Math.sin(this.facing), 0, -Math.cos(this.facing));
      this.dashTimer = t.dashDurationSec;
      this.dashCooldownTimer = t.dashCooldownSec;
      if (!this.grounded) this.airDashesLeft--;
      this.setState('dash');
    }

    if (this.state === 'dash') {
      this.vel.set(this.dashDir.x * t.dashSpeed, 0, this.dashDir.z * t.dashSpeed);
      this.dashTimer -= dt;
      if (this.dashTimer <= 0) {
        this.vel.x *= t.dashExitSpeedFactor;
        this.vel.z *= t.dashExitSpeedFactor;
        this.setState(this.grounded ? 'run' : 'fall');
      }
    } else {
      // --- horizontal ---
      if (this.grounded) this.sprinting = input.sprint && hasInput;
      if (this.controlLockTimer <= 0) {
        const speed = this.sprinting ? t.sprintSpeed : t.runSpeed;
        const accel = this.grounded ? (hasInput ? t.groundAccel : t.groundDecel) : hasInput ? t.airAccel : t.airDecel;
        const dx = mx * speed - this.vel.x;
        const dz = mz * speed - this.vel.z;
        const dl = Math.hypot(dx, dz);
        const step = accel * dt;
        if (dl <= step) {
          this.vel.x += dx;
          this.vel.z += dz;
        } else {
          this.vel.x += (dx / dl) * step;
          this.vel.z += (dz / dl) * step;
        }
      }

      // --- jumps: ground (incl. coyote) > wall > double ---
      if (this.jumpBufferTimer > 0) {
        if (this.grounded || this.coyoteTimer > 0) {
          this.vel.y = t.jumpVelocity;
          this.consumeJump();
          this.setState('jump');
        } else if (this.wallStickTimer > 0) {
          this.vel.set(this.wallNormal.x * t.wallJumpAwayVelocity, t.wallJumpUpVelocity, this.wallNormal.z * t.wallJumpAwayVelocity);
          this.controlLockTimer = t.wallJumpControlLockSec;
          this.wallStickTimer = 0;
          this.doubleAvailable = true;
          this.consumeJump();
          this.setState('wall_jump');
        } else if (this.doubleAvailable) {
          this.vel.y = t.doubleJumpVelocity;
          this.doubleAvailable = false;
          this.consumeJump();
          this.setState('double_jump');
        }
      }

      // --- gravity (variable jump height via jump-cut gravity) ---
      if (!this.grounded || this.vel.y > 0) {
        let g = t.gravity;
        if (this.vel.y < 0) g *= t.fallGravityMult;
        else if (!input.jump && (this.state === 'jump' || this.state === 'double_jump' || this.state === 'wall_jump')) g *= t.jumpCutGravityMult;
        this.vel.y = Math.max(this.vel.y - g * dt, -t.maxFallSpeed);
      } else {
        this.vel.y = -t.groundStickSpeed;
      }

      // --- wall slide (uses last tick's wall contact) ---
      if (!this.grounded && this.vel.y < 0 && this.wallStickTimer > 0 && this.pressingIntoWall(mx, mz)) {
        this.vel.y = Math.max(this.vel.y, -t.wallSlideMaxFallSpeed);
        this.setState('wall_slide');
      }
    }

    // --- integrate through the character controller ---
    const carry = this.groundCollider ? this.groundMotion(this.groundCollider) : null;
    const desired = {
      x: this.vel.x * dt + (carry?.x ?? 0),
      y: this.vel.y * dt + (carry?.y ?? 0),
      z: this.vel.z * dt + (carry?.z ?? 0),
    };
    this.ctrl.computeColliderMovement(this.collider, desired);
    const mv = this.ctrl.computedMovement();
    this.center.set(this.center.x + mv.x, this.center.y + mv.y, this.center.z + mv.z);
    this.body.setNextKinematicTranslation(this.center);

    const wasGrounded = this.grounded;
    const vyBefore = this.vel.y;
    this.grounded = this.ctrl.computedGrounded();

    let wallThisTick = false;
    // Autostep: the controller lifted us onto a step this tick. The riser still reports a
    // wall-like normal, but it is a STEP — cancelling into-wall velocity here killed the climb
    // (snap-to-ground pulled us back down next tick), so 0.4u stairs were unwalkable. Found by
    // the H3 nav bot on the gym staircase. Airborne contacts are untouched (wall slide/jump).
    const steppedUp = this.grounded && mv.y > 1e-4 && desired.y <= 0;
    for (let i = 0; i < this.ctrl.numComputedCollisions(); i++) {
      const c = this.ctrl.computedCollision(i);
      if (!c) continue;
      const n = c.normal1; // outward normal on the obstacle
      if (Math.abs(n.y) <= t.wallNormalMaxY) {
        if (steppedUp) continue; // a stair riser: neither a wall contact nor a velocity stop
        wallThisTick = true;
        this.wallNormal.set(n.x, 0, n.z).normalize();
        this.wallStickTimer = t.wallStickSec;
        const into = this.vel.x * this.wallNormal.x + this.vel.z * this.wallNormal.z;
        if (into < 0) {
          this.vel.x -= this.wallNormal.x * into;
          this.vel.z -= this.wallNormal.z * into;
        }
      } else if (n.y <= -t.groundNormalMinY && this.vel.y > 0) {
        this.vel.y = 0; // head bonk
      }
    }

    // collider underfoot (for moving-platform carry)
    this.groundCollider = null;
    if (this.grounded) {
      const hit = this.physics.castRay(this.center, DOWN, this.feetOffset() + t.groundProbeExtra, this.collider);
      if (hit && hit.normal.y >= t.groundNormalMinY) this.groundCollider = hit.collider;
    }

    // --- landing ---
    if (this.grounded && this.vel.y <= 0) {
      if (!wasGrounded && this.state !== 'dash') {
        this.setState(-vyBefore >= t.landMinImpactSpeed ? 'land' : 'idle');
      }
      this.vel.y = 0;
    }

    // --- ledge grab ---
    if (!this.grounded && this.vel.y < 0 && wallThisTick && this.regrabTimer <= 0 && this.state !== 'dash' && this.pressingIntoWall(mx, mz)) {
      this.tryLedgeGrab();
    }

    this.resolveState(mx, mz);

    // --- facing --- (state may have changed inside tryLedgeGrab/resolveState; re-read it)
    const now = this.currentState();
    if (hasInput && now !== 'wall_slide' && now !== 'ledge_grab') {
      const target = Math.atan2(-mx, -mz);
      let d = target - this.facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const maxTurn = t.turnRateRadPerSec * dt;
      this.facing += THREE.MathUtils.clamp(d, -maxTurn, maxTurn);
    }
  }

  /** D-023: the slash's own clock. Before every early return in fixedUpdate, so it runs on a ledge too. */
  private updateSlash(dt: number, pressed: boolean): void {
    const W = FIGHT.warrior;
    if (this.slashTime !== null) {
      this.slashTime += dt;
      if (this.slashTime >= W.slashSec) this.slashTime = null;
    }
    // a press too soon after the last is dropped, as it always was: a slash is not cut short while it is young
    if (pressed && (this.slashTime === null || this.slashTime >= W.againSec)) {
      this.slashTime = 0;
      this.slashCount++;
    }
  }

  /** Is the blade cutting this tick? (src/systems/fight.ts WarriorView.cutting) */
  cutting(): boolean {
    return this.slashTime !== null && this.slashTime >= FIGHT.warrior.cutFrom - 1e-9 && this.slashTime <= FIGHT.warrior.cutTo + 1e-9;
  }

  private currentState(): PlayerState {
    return this.state;
  }

  private consumeJump(): void {
    this.jumpBufferTimer = 0;
    this.coyoteTimer = 0;
    this.grounded = false;
  }

  private pressingIntoWall(mx: number, mz: number): boolean {
    return -(mx * this.wallNormal.x + mz * this.wallNormal.z) >= TUNING.wallPressMinDot;
  }

  private resolveState(mx: number, mz: number): void {
    const t = TUNING;
    if (this.state === 'dash' || this.state === 'ledge_grab') return;
    if (this.grounded) {
      if (this.state === 'land' && this.stateTime < t.landDurationSec) return;
      const speed = Math.hypot(this.vel.x, this.vel.z);
      this.setState(speed < t.idleSpeedThreshold ? 'idle' : this.sprinting ? 'sprint' : 'run');
      return;
    }
    if (this.state === 'wall_slide') {
      if (!(this.wallStickTimer > 0 && this.pressingIntoWall(mx, mz))) this.setState('fall');
      return;
    }
    if (this.vel.y <= 0) this.setState('fall');
  }

  private tryLedgeGrab(): void {
    const t = TUNING;
    const feetY = this.center.y - this.feetOffset();
    const origin = {
      x: this.center.x - this.wallNormal.x * t.ledgeProbeForward,
      y: feetY + t.ledgeProbeTopAboveFeet,
      z: this.center.z - this.wallNormal.z * t.ledgeProbeForward,
    };
    const hit = this.physics.castRay(origin, DOWN, t.ledgeProbeLength, this.collider);
    if (!hit || hit.distance <= t.ledgeMinProbeClearance || hit.normal.y < t.groundNormalMinY) return;
    this.ledgeTopY = hit.point.y;
    this.center.y = this.ledgeTopY - t.ledgeHangFeetBelowTop + this.feetOffset();
    this.body.setNextKinematicTranslation(this.center);
    this.vel.set(0, 0, 0);
    this.facing = Math.atan2(this.wallNormal.x, this.wallNormal.z);
    this.setState('ledge_grab');
  }

  private updateHang(input: InputFrame, jumpPressed: boolean): void {
    const t = TUNING;
    this.vel.set(0, 0, 0);
    if (jumpPressed) {
      this.jumpBufferTimer = 0;
      this.climbFrom.copy(this.center);
      this.climbTo.set(
        this.center.x - this.wallNormal.x * t.ledgeClimbForward,
        this.ledgeTopY + this.feetOffset() + t.ledgeClimbSkin,
        this.center.z - this.wallNormal.z * t.ledgeClimbForward,
      );
      this.setState('ledge_climb');
    } else if (input.x * this.wallNormal.x + input.y * this.wallNormal.z >= t.ledgeDropDot) {
      this.regrabTimer = t.ledgeRegrabDelaySec;
      this.setState('fall');
    }
    this.body.setNextKinematicTranslation(this.center);
  }

  private updateClimb(): void {
    const t = TUNING;
    const p = Math.min(1, this.stateTime / t.ledgeClimbSec);
    const up = smoothstep(p / t.ledgeClimbUpFraction);
    const fwd = smoothstep((p - t.ledgeClimbUpFraction) / (1 - t.ledgeClimbUpFraction));
    this.center.set(
      THREE.MathUtils.lerp(this.climbFrom.x, this.climbTo.x, fwd),
      THREE.MathUtils.lerp(this.climbFrom.y, this.climbTo.y, up),
      THREE.MathUtils.lerp(this.climbFrom.z, this.climbTo.z, fwd),
    );
    this.body.setNextKinematicTranslation(this.center);
    if (p >= 1) {
      this.vel.set(0, 0, 0);
      this.grounded = true;
      this.setState('idle');
    }
  }

  /** Harness only: the figure's clips, and one of them shown at a time in place of the state's pose (null: back to the state). */
  figureClips(): { name: string; duration: number }[] {
    return this.model?.clips() ?? [];
  }
  showFigure(clip: string | null, time = 0): void {
    this.model?.show(clip, time);
  }

  /** Interpolate the visual between the last two physics states. */
  render(alpha: number): void {
    this.mesh.position.lerpVectors(this.prevCenter, this.center, alpha);
    this.mesh.rotation.y = this.facing;
    this.model?.slash(this.slashTime);
    this.model?.pose(this.state, this.stateTime, Math.hypot(this.vel.x, this.vel.z));
  }
}

