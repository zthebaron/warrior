// The sword slash (D-022): a draw-cut from over the right shoulder, down across the body to the left.
//
// It is something the figure is SEEN to do and nothing else. It has no collider, reaches nothing, and is not a
// player state: the twelve states, the input frame, the traces and every MOVE number are as they were. The press
// is not part of the simulation's input (src/main.ts takes it from the keyboard, the mouse and the pad and
// starts this clock); the clock runs on render time while the game is in `play`. Decision Q7 stands: there is
// nothing to cut. NOT row 2's words are still refused in src/, so this is a "slash" and never the other word.
//
// Three parts, each built the first time a slash is asked for, so a page that never slashes (every harness
// page) builds none of them and draws exactly what it drew before:
//
//   SlashClock   seconds into the slash, or idle
//   slashClip    the upper body's pose through the slash, as an animation clip made in code against the rig's
//                bone names (the way src/loaders/character.ts makes `rest`). The rig has no clip for it and
//                could not be given one: OQ-072 says why. CharacterModel lays it over whatever the legs are
//                doing, so it works on the ground and in the air.
//   SlashArc     one ink stroke along the path the blade's tip takes, on the paint layer
//
// Known limit, recorded in D-022: the rig's sword is part of the body mesh and has no bone, so it stays on the
// figure's back. The hand goes to the hilt and cuts; the stroke is what reads as the blade.
//
// Every number is in MEASUREMENTS.md "D-022 slash".

import * as THREE from 'three';

import { paint, paintMaterial, PAINT_LAST } from '../engine/paint-layer';
import { ramp } from '../engine/palette';
import type { CharacterAsset } from '../loaders/character';
import { FIGHT } from '../systems/fight';

type V3 = readonly [number, number, number];

export const SLASH = {
  // D-023: these four are the rule now (the cut is a hit volume in the fixed tick), so they are read from the
  // fight's one table and the drawing follows it.
  /** the whole slash, s */
  seconds: FIGHT.warrior.slashSec,
  /** the hand is at the hilt until here; the cut runs from here ... */
  windupEnd: FIGHT.warrior.cutFrom,
  /** ... to here; then the arm is held out */
  cutEnd: FIGHT.warrior.cutTo,
  /** a second press is ignored before this, and starts the slash again after it */
  again: FIGHT.warrior.againSec,
  /** the slash's hold on the upper body rises over this long and lets go over this long */
  fadeIn: 0.05,
  fadeOut: 0.11,
  /** at its fullest the slash is this share of the upper body's pose; the rest is what the body was doing */
  share: 0.97,
  /** the clip is never evaluated AT its end, which a looping action reads as its start: this far short of it */
  lastFrameShy: 1e-4,
  // The pose. Directions are in the model's own frame as delivered: x its LEFT, y up, z the way it faces.
  chest: {
    windup: { twistDeg: -34, leanDeg: -5 },  // turned toward the sword hand, a little back
    cut: { twistDeg: 36, leanDeg: 14 },      // turned through the cut, leaning into it
    neckShare: 0.3,                          // how much of the chest's turn the head takes: it keeps looking ahead
  },
  swordArm: {
    windup: { upper: [-0.4, 0.82, -0.4], fore: [0.3, 0.7, -0.65] },   // elbow up and back, hand at the hilt behind the shoulder
    mid: { upper: [-0.3, 0.5, 0.81], fore: [-0.12, 0.42, 0.9] },      // arm out in front, high
    cut: { upper: [0.5, -0.42, 0.76], fore: [0.66, -0.52, 0.54] },    // across the body, low on the other side
  } satisfies Record<string, { upper: V3; fore: V3 }>,
  offArm: { upper: [0.42, -0.86, -0.28], fore: [0.3, -0.8, 0.52] } as { upper: V3; fore: V3 }, // low, elbow back: out of the blade's way
  arc: {
    radius: 1.4,       // m: the tip's distance from the chest
    centreY: 0.3,      // m above the capsule's centre: the shoulder line
    width: 0.2,        // m: the stroke at its widest
    fullAt: 0.75,      // under 1, the stroke is at its widest before the middle of its path: it lands, then trails
    taper: 0.8,        // how sharply it thins toward its two ends
    // the tip's path, as directions from the chest in the PLAYER's frame (x right, y up, -z ahead)
    from: [0.66, 0.72, 0.22], through: [0.1, 0.34, -0.93], to: [-0.8, -0.5, -0.33],
    segments: 28,
    opacity: 0.92,
    tailLag: 0.85,     // while it is drawn the stroke's tail follows its head by this share of the path: most of it is on the paper at once
    order: 500,        // drawn after every card (their orders are 100 to 400) and before the figure
    streaks: 9,        // dry-brush: this many bristle tracks across the stroke
    bristleMin: 0.6,   // the lightest bristle's ink, against the darkest's 1
    dryFrom: 0.7,      // no bristle runs dry before this far along the stroke
    dryOver: 0.3,      // one that does thins to nothing over this much of the path
    seed: 7,
  },
};

const S = SLASH;
const DEG = Math.PI / 180;

/** How much of the upper body the slash holds at `time`, 0..SLASH.share. */
export function slashShare(time: number): number {
  const up = Math.min(1, time / S.fadeIn), down = Math.min(1, (S.seconds - time) / S.fadeOut);
  const k = Math.max(0, Math.min(up, down));
  return S.share * k * k * (3 - 2 * k);
}

// ---------- the clip ----------
const UPPER = ['Spine02', 'Spine01', 'Spine', 'neck', 'RightArm', 'RightForeArm', 'LeftArm', 'LeftForeArm'] as const;
const NEEDED = ['Hips', ...UPPER, 'RightShoulder', 'LeftShoulder', 'RightHand', 'LeftHand'] as const;

/**
 * The slash as a clip: rotations for the spine, the neck and both arms, nothing for the hips or legs. Built
 * from the rig's rest pose (the `rest` clip the loader made), so it holds whatever pose the rig was delivered
 * in. Does not touch the scene: the bones are left exactly as they are.
 */
export function slashClip(asset: CharacterAsset): THREE.AnimationClip {
  const bones = new Map<string, THREE.Object3D>();
  for (const name of NEEDED) {
    const b = asset.scene.getObjectByName(name);
    if (!b) throw new Error(`[slash] ${asset.name} has no "${name}" bone`);
    bones.set(name, b);
  }
  const rest = asset.clips.get('rest');
  if (!rest) throw new Error(`[slash] ${asset.name} has no rest pose`);
  const restLocal = (name: string): THREE.Quaternion => {
    const t = rest.tracks.find((k) => k.name === `${name}.quaternion`);
    if (!t) throw new Error(`[slash] the rest pose has no "${name}"`);
    return new THREE.Quaternion().fromArray(t.values as unknown as number[]);
  };

  // The rest pose in the model's own frame. The scene is posed by the mixer right now, so the rest pose is
  // worked out on a copy of the bone chain's matrices, never by moving a bone.
  const model = new Map<THREE.Object3D, THREE.Matrix4>();
  const local = (o: THREE.Object3D): THREE.Matrix4 => {
    const isBone = (o as THREE.Bone).isBone;
    const p = rest.tracks.find((k) => k.name === `${o.name}.position`), s = rest.tracks.find((k) => k.name === `${o.name}.scale`);
    return new THREE.Matrix4().compose(
      isBone && p ? new THREE.Vector3().fromArray(p.values as unknown as number[]) : o.position,
      isBone ? restLocal(o.name) : o.quaternion,
      isBone && s ? new THREE.Vector3().fromArray(s.values as unknown as number[]) : o.scale,
    );
  };
  const inModel = (o: THREE.Object3D): THREE.Matrix4 => {
    if (o === asset.scene) return new THREE.Matrix4();
    let m = model.get(o);
    if (!m) {
      m = inModel(o.parent!).clone().multiply(local(o));
      model.set(o, m);
    }
    return m;
  };
  const restWorld = (name: string): THREE.Quaternion => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(inModel(bones.get(name)!)));
  const at = (name: string): THREE.Vector3 => new THREE.Vector3().setFromMatrixPosition(inModel(bones.get(name)!));
  const dir = (from: string, to: string): THREE.Vector3 => at(to).sub(at(from)).normalize();

  const chestTurn = (c: { twistDeg: number; leanDeg: number }): THREE.Quaternion =>
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.twistDeg * DEG)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), c.leanDeg * DEG));
  const part = (q: THREE.Quaternion, share: number): THREE.Quaternion => new THREE.Quaternion().slerp(q, share);
  const aim = (bone: string, child: string, to: V3): THREE.Quaternion =>
    new THREE.Quaternion().setFromUnitVectors(dir(bone, child), new THREE.Vector3(...to).normalize()).multiply(restWorld(bone));
  const under = (parentWorld: THREE.Quaternion, world: THREE.Quaternion): THREE.Quaternion => parentWorld.clone().invert().multiply(world);

  /** Every upper bone's LOCAL rotation for one pose. */
  const pose = (chest: { twistDeg: number; leanDeg: number }, arm: { upper: V3; fore: V3 }): Map<string, THREE.Quaternion> => {
    const turn = chestTurn(chest);
    const w = new Map<string, THREE.Quaternion>();
    w.set('Hips', restWorld('Hips'));
    w.set('Spine02', part(turn, 1 / 3).multiply(restWorld('Spine02')));
    w.set('Spine01', part(turn, 2 / 3).multiply(restWorld('Spine01')));
    w.set('Spine', turn.clone().multiply(restWorld('Spine')));
    w.set('neck', part(turn, S.chest.neckShare).multiply(restWorld('neck')));
    w.set('RightShoulder', turn.clone().multiply(restWorld('RightShoulder')));
    w.set('LeftShoulder', turn.clone().multiply(restWorld('LeftShoulder')));
    w.set('RightArm', aim('RightArm', 'RightForeArm', arm.upper));
    w.set('RightForeArm', aim('RightForeArm', 'RightHand', arm.fore));
    w.set('LeftArm', aim('LeftArm', 'LeftForeArm', S.offArm.upper));
    w.set('LeftForeArm', aim('LeftForeArm', 'LeftHand', S.offArm.fore));
    const parent: Record<(typeof UPPER)[number], string> = {
      Spine02: 'Hips', Spine01: 'Spine02', Spine: 'Spine01', neck: 'Spine',
      RightArm: 'RightShoulder', RightForeArm: 'RightArm', LeftArm: 'LeftShoulder', LeftForeArm: 'LeftArm',
    };
    return new Map(UPPER.map((name) => [name, under(w.get(parent[name])!, w.get(name)!)]));
  };

  const mid = (S.windupEnd + S.cutEnd) / 2;
  const half = { twistDeg: (S.chest.windup.twistDeg + S.chest.cut.twistDeg) / 2, leanDeg: (S.chest.windup.leanDeg + S.chest.cut.leanDeg) / 2 };
  const keys: [number, Map<string, THREE.Quaternion>][] = [
    [0, pose(S.chest.windup, S.swordArm.windup)],
    [S.windupEnd, pose(S.chest.windup, S.swordArm.windup)],
    [mid, pose(half, S.swordArm.mid)],
    [S.cutEnd, pose(S.chest.cut, S.swordArm.cut)],
    [S.seconds, pose(S.chest.cut, S.swordArm.cut)],
  ];
  const tracks = UPPER.map((name) => {
    const values: number[] = [];
    let last: THREE.Quaternion | null = null;
    for (const [, p] of keys) {
      const q = p.get(name)!.clone();
      if (last && last.dot(q) < 0) q.set(-q.x, -q.y, -q.z, -q.w); // the short way round between keys
      values.push(q.x, q.y, q.z, q.w);
      last = q;
    }
    return new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, keys.map(([t]) => t), values);
  });
  return new THREE.AnimationClip('slash', S.seconds, tracks);
}

// ---------- the stroke ----------
/** mulberry32: the dry-brush is the same every time, not a noise that shimmers. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One ink stroke where the blade's tip passes. A child of the player's mesh: it turns and moves with the player.
 * The stroke is a ribbon along the tip's path, turned to face the camera every frame it is shown (a flat ribbon
 * in the blade's own plane is edge-on from behind the player, which is where the camera is).
 */
export class SlashArc {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.MeshBasicMaterial;
  /** the tip's path: a point and the path's direction there, per rib */
  private readonly path: { at: THREE.Vector3; along: THREE.Vector3; half: number }[] = [];
  private readonly positions: THREE.BufferAttribute;
  private readonly eye = new THREE.Vector3();
  private readonly across = new THREE.Vector3();

  constructor() {
    const A = S.arc;
    const from = new THREE.Vector3(...A.from).normalize(), through = new THREE.Vector3(...A.through).normalize(), to = new THREE.Vector3(...A.to).normalize();
    const turn = (u: THREE.Vector3, v: THREE.Vector3, t: number): THREE.Vector3 => {
      const q = new THREE.Quaternion().setFromUnitVectors(u, v);
      return u.clone().applyQuaternion(new THREE.Quaternion().slerp(q, t));
    };
    const tip = (t: number): THREE.Vector3 => {
      const d = t < 0.5 ? turn(from, through, t * 2) : turn(through, to, (t - 0.5) * 2);
      return new THREE.Vector3(d.x * A.radius, A.centreY + d.y * A.radius, d.z * A.radius);
    };
    const uv: number[] = [], index: number[] = [];
    for (let i = 0; i <= A.segments; i++) {
      const t = i / A.segments, e = 0.5 / A.segments;
      this.path.push({
        at: tip(t),
        along: tip(Math.min(1, t + e)).sub(tip(Math.max(0, t - e))).normalize(),
        // a brush stroke: it lands thin, is full soon after, and is drawn out to a point where it lifts
        half: (A.width / 2) * Math.pow(Math.sin(Math.PI * Math.pow(t, A.fullAt)), A.taper),
      });
      uv.push(t, 1, t, 0);
      if (i < A.segments) {
        const k = i * 2;
        index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    this.positions = new THREE.Float32BufferAttribute(new Float32Array((A.segments + 1) * 6), 3);
    g.setAttribute('position', this.positions);
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(index);

    // dry-brush: bristle tracks along the stroke, some of them running dry before its end
    const W = 64, H = 32, rand = seeded(A.seed);
    const data = new Uint8Array(W * H * 4);
    const dryFrom = Array.from({ length: A.streaks }, () => A.dryFrom + (1 - A.dryFrom) * rand());
    const weight = Array.from({ length: A.streaks }, () => A.bristleMin + (1 - A.bristleMin) * rand());
    for (let y = 0; y < H; y++) {
      const track = Math.min(A.streaks - 1, Math.floor((y / H) * A.streaks));
      for (let x = 0; x < W; x++) {
        const t = x / (W - 1);
        const dry = t > dryFrom[track]! ? Math.max(0, 1 - (t - dryFrom[track]!) / A.dryOver) : 1;
        const i = (y * W + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = 255;
        data[i + 3] = Math.round(255 * Math.min(1, weight[track]! * dry));
      }
    }
    const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
    tex.magFilter = tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;

    this.material = paintMaterial({ map: tex, color: ramp('ink-black'), opacity: A.opacity, wash: true, side: THREE.DoubleSide });
    this.mesh = paint(new THREE.Mesh(g, this.material));
    this.mesh.name = 'slash-arc';
    this.mesh.renderOrder = Math.min(A.order, PAINT_LAST - 1);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /** Show the stroke as it stands `time` seconds into the slash, facing `camera`; null hides it. */
  update(time: number | null, camera: THREE.Camera): void {
    if (time === null || time < S.windupEnd) {
      this.mesh.visible = false;
      return;
    }
    const A = S.arc, n = A.segments;
    const drawn = Math.min(1, (time - S.windupEnd) / (S.cutEnd - S.windupEnd)); // the head of the stroke along its path
    const after = Math.max(0, (time - S.cutEnd) / (S.seconds - S.cutEnd));      // 0..1 once the cut is done
    const tail = Math.max(0, drawn - A.tailLag) + after * A.tailLag;            // the tail follows the head, then runs out to it
    const first = Math.min(n, Math.floor(Math.min(1, tail) * n)), last = Math.max(first, Math.ceil(drawn * n));
    this.mesh.geometry.setDrawRange(first * 6, (last - first) * 6);
    this.material.opacity = A.opacity * (1 - after * after); // it stays, then goes
    this.mesh.visible = last > first && after < 1;
    if (!this.mesh.visible) return;
    // turn each rib across the line of sight
    this.mesh.updateWorldMatrix(true, false);
    this.mesh.worldToLocal(this.eye.copy(camera.position));
    for (let i = 0; i <= n; i++) {
      const r = this.path[i]!;
      this.across.copy(this.eye).sub(r.at).cross(r.along);
      if (this.across.lengthSq() < 1e-12) this.across.set(0, 1, 0); // looking straight down the stroke: any side will do
      this.across.setLength(r.half);
      this.positions.setXYZ(i * 2, r.at.x + this.across.x, r.at.y + this.across.y, r.at.z + this.across.z);
      this.positions.setXYZ(i * 2 + 1, r.at.x - this.across.x, r.at.y - this.across.y, r.at.z - this.across.z);
    }
    this.positions.needsUpdate = true;
  }
}
