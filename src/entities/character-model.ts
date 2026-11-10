// The player's figure (D-020, B-33): a rigged character posed from the player's state.
//
// The twelve player states stay exactly as they are (the nav bot reads them); they MAP onto eight clips.
// The pose is a pure function of the states the player has been through and the time spent in each: no
// wall clock, no frame count. In the harness that makes a frame's pose a function of the world tick, so a
// golden cannot depend on how often a frame was drawn.
//
// Every number is in MEASUREMENTS.md "D-020 character".

import * as THREE from 'three';

import type { CharacterAsset } from '../loaders/character';
import type { PlayerState } from './player';

export type ClipName = 'idle' | 'run' | 'jump' | 'fall' | 'land' | 'dash' | 'wall' | 'climb';

export const CHARACTER = {
  asset: 'char_warrior',
  /** state -> clip, and how the clip's time runs in that state. */
  clipOf: {
    idle: 'idle',
    run: 'run',
    sprint: 'run',        // the same stride, faster: by sprintSpeed / runSpeed, so it keeps pace with the ground
    jump: 'jump',
    double_jump: 'jump',
    wall_jump: 'jump',
    fall: 'fall',
    wall_slide: 'wall',
    ledge_grab: 'climb',  // the hang: the first frame of the climb, held
    ledge_climb: 'climb',
    dash: 'dash',
    land: 'land',
  } satisfies Record<PlayerState, ClipName>,
  once: ['jump', 'land', 'climb'] as readonly ClipName[], // play through and hold the last frame
  held: ['ledge_grab'] as readonly PlayerState[],          // time does not run: the clip's first frame
  blendSec: 0.1,        // a pose change is blended over this long (6 ticks)
};

const C = CHARACTER;

export class CharacterModel {
  /** Feet at the origin. Parent it under the player's mesh, lowered by the player's feetOffset(). */
  readonly root: THREE.Group;
  readonly triangles: number;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<ClipName, THREE.AnimationAction>();
  private state: PlayerState | null = null;
  private clip: ClipName = 'idle';
  private clipTime = 0;        // seconds of the current clip already played before this state began
  private lastStateTime = 0;
  private sinceSwitch = 0;     // seconds since the clip last changed, carried across same-clip state changes
  private prevClip: ClipName | null = null;
  private prevClipAt = 0;      // the time the previous clip was frozen at

  /** sprintRate: how much faster the run clip plays in `sprint` (the player's sprint speed over its run speed). */
  constructor(asset: CharacterAsset, private readonly sprintRate: number) {
    this.root = asset.scene;
    this.triangles = asset.triangles;
    this.mixer = new THREE.AnimationMixer(this.root);
    for (const name of new Set(Object.values(C.clipOf))) {
      const clip = asset.clips.get(name);
      if (!clip) throw new Error(`[character] ${asset.name} has no "${name}" clip (it has: ${[...asset.clips.keys()].join(', ')})`);
      const a = this.mixer.clipAction(clip);
      a.setLoop(C.once.includes(name) ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      a.clampWhenFinished = true;
      a.enabled = true;
      a.setEffectiveWeight(0);
      a.play();
      this.actions.set(name, a);
    }
    this.pose('idle', 0);
  }

  private rate(state: PlayerState): number {
    return C.held.includes(state) ? 0 : state === 'sprint' ? this.sprintRate : 1;
  }

  /** Pose the figure for the player's state and the seconds spent in it. Call once per drawn or simulated frame. */
  pose(state: PlayerState, stateTime: number): void {
    const clip: ClipName = C.clipOf[state];
    if (state !== this.state || stateTime < this.lastStateTime) {
      // a new state (or the same state re-entered): bank what the old one played
      const played = this.state ? this.lastStateTime * this.rate(this.state) : 0;
      if (clip !== this.clip || this.state === null) {
        this.prevClip = this.state === null ? null : this.clip;
        this.prevClipAt = this.clipTime + played;
        this.clip = clip;
        this.clipTime = 0;
        this.sinceSwitch = 0;
      } else {
        this.clipTime += played;
        this.sinceSwitch += this.lastStateTime;
      }
      this.state = state;
    }
    this.lastStateTime = stateTime;
    const w = this.prevClip ? Math.min(1, (this.sinceSwitch + stateTime) / C.blendSec) : 1;
    for (const [name, a] of this.actions) {
      const isCur = name === this.clip, isPrev = name === this.prevClip && w < 1;
      a.setEffectiveWeight(isCur ? w : isPrev ? 1 - w : 0);
      if (isCur) a.time = this.at(a, this.clipTime + stateTime * this.rate(state));
      else if (isPrev) a.time = this.at(a, this.prevClipAt);
    }
    this.mixer.update(0); // evaluate at the times just set; the mixer's own clock never runs
  }

  /** A clip time inside the clip: wrapped for a loop, held just short of the end for a one-shot. */
  private at(a: THREE.AnimationAction, t: number): number {
    const d = a.getClip().duration;
    if (d <= 0) return 0;
    return a.loop === THREE.LoopOnce ? Math.min(t, d * (1 - 1e-6)) : t % d;
  }
}
