// The player's figure (D-020, B-33): the rigged warrior, posed from the player's state.
//
// The twelve player states stay exactly as they are (the nav bot reads them). The delivered rig has two clips,
// `walk` and `run`. On the ground the figure strides, walk or run by speed. Everything else HOLDS a frame until
// its own clip exists: idle and land the rest pose, the airborne states a frame of the run, the wall and the
// ledge a frame of the walk.
//
// Time comes only from the player's own state clock (seconds in the current state), never from a wall clock or
// a frame count. In the harness the pose is therefore a function of the world tick, so a golden cannot depend
// on how often a frame was drawn.
//
// Every number is in MEASUREMENTS.md "D-020 character".

import * as THREE from 'three';

import type { CharacterAsset } from '../loaders/character';
import type { PlayerState } from './player';

type Pose = { clip: 'rest' | 'walk' | 'run'; hold: number } | 'stride';

const AIR_UP: Pose = { clip: 'run', hold: 0.17 };   // the trailing leg kicked up: reads as leaving the ground
const LEDGE: Pose = { clip: 'walk', hold: 0.53 };   // one leg forward and up: reads as stepping over
const REST: Pose = { clip: 'rest', hold: 0 };

export const CHARACTER = {
  asset: 'warrior_rigged',
  /** The delivered model looks down +Z (assets/hero/HANDOFF.md); the player's forward is -Z. */
  faceTurn: Math.PI,
  poseOf: {
    idle: REST,
    land: REST,
    run: 'stride',
    sprint: 'stride',
    jump: AIR_UP,
    double_jump: AIR_UP,
    wall_jump: AIR_UP,
    fall: { clip: 'run', hold: 0.5 },        // the widest split, arms out
    dash: { clip: 'run', hold: 0.33 },       // the lunge
    wall_slide: { clip: 'walk', hold: 0 },   // upright, feet together
    ledge_grab: LEDGE,
    ledge_climb: LEDGE,
  } satisfies Record<PlayerState, Pose>,
  walkBelow: 0.5,   // of the player's run speed: slower than this the figure walks
  blendSec: 0.1,    // a pose change is blended over this long (6 ticks)
};

const C = CHARACTER;

export class CharacterModel {
  /** Feet at the origin, facing -Z, `height` tall. Parent it under the player's mesh, lowered by feetOffset(). */
  readonly root = new THREE.Group();
  readonly triangles: number;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private key = '';
  private time = 0;          // seconds into the current pose's clip
  private state: PlayerState | null = null;
  private lastStateTime = 0;
  private since = 0;         // seconds since the pose last changed
  private prevKey: string | null = null;
  private prevAt = 0;

  /** height: how tall the figure stands (the player's capsule). runSpeed: the player's run speed, m/s. */
  constructor(asset: CharacterAsset, height: number, private readonly runSpeed: number) {
    this.triangles = asset.triangles;
    const size = asset.bounds.getSize(new THREE.Vector3());
    const k = height / size.y; // the delivered scale is whatever the generator used; the capsule decides
    asset.scene.scale.multiplyScalar(k);
    asset.scene.position.y -= asset.bounds.min.y * k; // feet on the ground
    this.root.rotation.y = C.faceTurn;
    this.root.add(asset.scene);
    this.mixer = new THREE.AnimationMixer(asset.scene);
    const add = (key: string, clipName: string): void => {
      if (this.actions.has(key)) return;
      const clip = asset.clips.get(clipName);
      if (!clip) throw new Error(`[character] ${asset.name} has no "${clipName}" clip (it has: ${[...asset.clips.keys()].join(', ')})`);
      // one action per pose, so two held frames of the same clip can be blended: each needs its own copy
      const a = this.mixer.clipAction(clip.clone());
      a.setLoop(THREE.LoopRepeat, Infinity);
      a.enabled = true;
      a.setEffectiveWeight(0);
      a.play();
      this.actions.set(key, a);
    };
    add('stride:walk', 'walk');
    add('stride:run', 'run');
    for (const p of Object.values(C.poseOf)) if (p !== 'stride') add(`${p.clip}@${p.hold}`, p.clip);
    this.pose('idle', 0, 0);
  }

  /** Pose the figure for the player's state, the seconds spent in it and its ground speed (m/s). */
  pose(state: PlayerState, stateTime: number, speed: number): void {
    const p: Pose = C.poseOf[state];
    const walking = speed < C.walkBelow * this.runSpeed;
    const key = p === 'stride' ? (walking ? 'stride:walk' : 'stride:run') : `${p.clip}@${p.hold}`;
    const dt = state === this.state && stateTime >= this.lastStateTime ? stateTime - this.lastStateTime : stateTime;
    this.state = state;
    this.lastStateTime = stateTime;
    if (key !== this.key) {
      const from = this.actions.get(this.key), to = this.actions.get(key)!;
      this.prevKey = this.key || null;
      this.prevAt = this.time;
      // walk <-> run keeps its place in the stride; anything else starts its clip
      this.time = from && this.key.startsWith('stride:') && key.startsWith('stride:') ? (this.time / from.getClip().duration) * to.getClip().duration : 0;
      this.key = key;
      this.since = 0;
    } else {
      // the run keeps pace with the ground (a sprint strides faster); the walk plays as delivered
      this.time += dt * (key === 'stride:run' ? speed / this.runSpeed : 1);
      this.since += dt;
    }
    const w = this.prevKey ? Math.min(1, this.since / C.blendSec) : 1;
    for (const [k, a] of this.actions) {
      const cur = k === this.key, prev = k === this.prevKey && w < 1;
      a.setEffectiveWeight(cur ? w : prev ? 1 - w : 0);
      if (cur) a.time = this.at(k, a, this.time);
      else if (prev) a.time = this.at(k, a, this.prevAt);
    }
    this.mixer.update(0); // evaluate at the times just set; the mixer's own clock never runs
  }

  /** The clip time a pose is shown at: its held frame, or the stride's time wrapped into the clip. */
  private at(key: string, a: THREE.AnimationAction, t: number): number {
    if (!key.startsWith('stride:')) return Number(key.slice(key.indexOf('@') + 1));
    const d = a.getClip().duration;
    return d > 0 ? t % d : 0;
  }
}
