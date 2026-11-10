// The player's figure (D-020, D-021, B-45): the rigged warrior, posed from the player's state.
//
// The twelve player states stay exactly as they are (the nav bot reads them). The rig (ART-GEN's warrior_anim)
// has nine clips: idle, walk, run, jump, fall, land, dash, wall, climb. Each state shows one of them in one of
// three ways:
//
//   loop   the clip, round and round
//   once   the clip from its start, then its last frame, held
//   hold   one frame of a clip, still. Used where a clip looks wrong in motion in the game (the hat is rigid on
//          the head and the arms pass through its brim in every arms-up clip): a good frame, held, reads
//          better than a bad movement. Which frame, and why, is in MEASUREMENTS.md "D-021 character".
//
// On the ground the figure strides, walk or run by speed, and the stride keeps its place when one becomes the
// other. Every change of pose is a cross-fade: each clip has a weight, the one wanted rises and every other
// falls, at the same rate, and the weights are normalised. So a fade that is interrupted carries on from where
// it is; nothing pops, however short a state is (land lasts 0.08 s, shorter than the fade).
//
// Time comes only from the player's own state clock (seconds in the current state), never from a wall clock or
// a frame count. In the harness the pose is therefore a function of the world tick: a golden cannot depend on
// how often a frame was drawn, and drawing the same tick twice changes nothing.
//
// Every number is in MEASUREMENTS.md "D-020 character" and "D-021 character".

import * as THREE from 'three';

import type { CharacterAsset } from '../loaders/character';
import type { PlayerState } from './player';

type Clip = 'idle' | 'walk' | 'run' | 'jump' | 'fall' | 'land' | 'dash' | 'wall' | 'climb';
type Shown = { clip: Clip; play: 'loop' | 'once' } | { clip: Clip; hold: number };
type Pose = Shown | 'stride';

// Held frames, each chosen from tools/harness/motion.ts --clips. The delivered jump, fall and wall clips pitch
// the head and the rigid hat right over in every frame, so no frame of them is used.
const LEAP: Pose = { clip: 'run', hold: 0.106 };    // the run's widest airborne stride: reads as a leap
const KICK: Pose = { clip: 'run', hold: 0.422 };    // the same stride on the other leg: the second jump kicks
const BRACE: Pose = { clip: 'land', hold: 0 };      // arms out, knees bent, looking down; land then plays on from it
const HANG: Pose = { clip: 'climb', hold: 0 };      // arms up on the wall: the climb's first frame

export const CHARACTER = {
  asset: 'warrior_anim',
  /** The delivered model looks down +Z (assets/hero/HANDOFF.md); the player's forward is -Z. */
  faceTurn: Math.PI,
  poseOf: {
    idle: { clip: 'idle', play: 'loop' },
    run: 'stride',
    sprint: 'stride',
    jump: LEAP,
    double_jump: KICK,
    wall_jump: LEAP,
    fall: BRACE,
    land: { clip: 'land', play: 'once' },
    dash: { clip: 'dash', play: 'loop' },
    wall_slide: HANG,
    ledge_grab: HANG,
    ledge_climb: { clip: 'climb', play: 'once' },
  } satisfies Record<PlayerState, Pose>,
  walkBelow: 0.5,   // of the player's run speed: slower than this the figure walks
  blendSec: 0.1,    // a pose is faded in, and the others out, over this long (6 ticks)
};

const C = CHARACTER;
const keyOf = (p: Shown): string => ('hold' in p ? `${p.clip}@${p.hold}` : `${p.clip}:${p.play}`);

interface Track {
  action: THREE.AnimationAction;
  duration: number;
  /** 'stride' tracks loop; a held track never moves */
  play: 'loop' | 'once' | 'hold';
  hold: number;
  time: number;   // seconds into the clip (unwrapped)
  weight: number; // 0..1 before normalising
}

export class CharacterModel {
  /** Feet at the origin, facing -Z, `height` tall. Parent it under the player's mesh, lowered by feetOffset(). */
  readonly root = new THREE.Group();
  readonly triangles: number;
  private readonly mixer: THREE.AnimationMixer;
  private readonly tracks = new Map<string, Track>();
  private readonly asset: CharacterAsset;
  private readonly clipList: { name: string; duration: number }[];
  private key = '';
  private state: PlayerState | null = null;
  private lastStateTime = 0;
  /** Harness: a clip shown at a time, in place of the state's pose, until cleared (tools/harness/motion.ts --clips). */
  private preview: { key: string; time: number } | null = null;

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
    this.asset = asset;
    this.clipList = [...asset.clips.values()].filter((c) => c.name !== 'rest').map((c) => ({ name: c.name, duration: c.duration }));
    this.addTrack('stride:walk', 'walk', 'loop', 0);
    this.addTrack('stride:run', 'run', 'loop', 0);
    for (const p of Object.values(C.poseOf) as Pose[]) {
      if (p !== 'stride') this.addTrack(keyOf(p), p.clip, 'hold' in p ? 'hold' : p.play, 'hold' in p ? p.hold : 0);
    }
    this.pose('idle', 0, 0);
  }

  /** One action per way of showing a clip, each on its own copy, so a clip can be faded against itself. */
  private addTrack(key: string, clipName: Clip, play: Track['play'], hold: number): void {
    if (this.tracks.has(key)) return;
    const clip = this.asset.clips.get(clipName);
    if (!clip) throw new Error(`[character] ${this.asset.name} has no "${clipName}" clip (it has: ${[...this.asset.clips.keys()].join(', ')})`);
    const action = this.mixer.clipAction(clip.clone());
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.enabled = true;
    action.setEffectiveWeight(0);
    action.play();
    this.tracks.set(key, { action, duration: clip.duration, play, hold, time: 0, weight: 0 });
  }

  /** The delivered clips, by name, with their lengths in seconds. */
  clips(): { name: string; duration: number }[] {
    return [...this.clipList];
  }

  /**
   * Harness only: show one clip at one time, whatever the player is doing, until called with null. It is how
   * a held frame is chosen (tools/harness/motion.ts): the frame is looked at before a state is given it.
   */
  show(clip: string | null, time = 0): void {
    if (clip === null) { this.preview = null; return; }
    const key = `show:${clip}`;
    if (!this.tracks.has(key)) {
      const c = this.clipList.find((x) => x.name === clip);
      if (!c) throw new Error(`[character] no "${clip}" clip (it has: ${this.clipList.map((x) => x.name).join(', ')})`);
      this.addTrack(key, clip as Clip, 'hold', 0);
    }
    this.preview = { key, time };
    this.apply();
  }

  /** Pose the figure for the player's state, the seconds spent in it and its ground speed (m/s). */
  pose(state: PlayerState, stateTime: number, speed: number): void {
    const p: Pose = C.poseOf[state];
    const walking = speed < C.walkBelow * this.runSpeed;
    const key = p === 'stride' ? (walking ? 'stride:walk' : 'stride:run') : keyOf(p);
    const entered = state !== this.state;
    const dt = !entered && stateTime >= this.lastStateTime ? stateTime - this.lastStateTime : stateTime;
    this.state = state;
    this.lastStateTime = stateTime;

    const to = this.tracks.get(key)!;
    if (key !== this.key) {
      const from = this.tracks.get(this.key);
      // walk <-> run keeps its place in the stride; anything else starts its clip
      to.time = from && this.key.startsWith('stride:') && key.startsWith('stride:') ? (from.time / from.duration) * to.duration : 0;
      if (!from) to.weight = 1; // the first pose: nothing to fade from
      this.key = key;
    } else if (entered && to.play === 'once') {
      to.time = 0; // the same clip for a new state (jump, then double jump): it starts again
    }

    // every clip that is still showing keeps playing while it fades; the run keeps pace with the ground
    const step = C.blendSec > 0 ? dt / C.blendSec : 1;
    for (const [k, t] of this.tracks) {
      const wanted = k === key;
      t.weight = Math.min(1, Math.max(0, t.weight + (wanted ? step : -step)));
      if (t.weight > 0 || wanted) t.time += dt * (k === 'stride:run' ? speed / this.runSpeed : 1);
    }
    this.apply();
  }

  /** Hand the mixer every track's weight (normalised) and clip time, and evaluate. Changes no state. */
  private apply(): void {
    let sum = 0;
    for (const t of this.tracks.values()) sum += t.weight;
    for (const [k, t] of this.tracks) {
      // before the first fade step the wanted clip weighs nothing: show what was there, in full
      let w = sum > 0 ? t.weight / sum : k === this.key ? 1 : 0;
      let time = t.play === 'hold' ? t.hold : t.play === 'once' ? Math.min(t.time, t.duration) : t.duration > 0 ? t.time % t.duration : 0;
      if (this.preview) {
        w = k === this.preview.key ? 1 : 0;
        time = Math.min(this.preview.time, t.duration);
      }
      t.action.setEffectiveWeight(w);
      if (w > 0) t.action.time = time;
    }
    this.mixer.update(0); // evaluate at the times just set; the mixer's own clock never runs
  }
}
