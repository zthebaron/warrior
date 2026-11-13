// The swordsmen of a level (D-023): the fight's pure state machine (src/systems/fight.ts) joined to the figures
// that show it (swordsman-model.ts). A level with no `enemies` builds none of this.
//
// One instance belongs to one installed level. Each fixed tick it steps every swordsman from what the warrior
// did that tick, and hands back what happened; src/main.ts turns a `cut` into the same death a hazard is, and
// the sound tap reads the rest. Between a death and the respawn the swordsmen are stepped with the warrior
// absent (they finish what they were doing and see nobody); at the respawn every one is put back on his post,
// on his feet. That is the whole of a swordsman's memory: nothing here outlasts an attempt.

import * as THREE from 'three';

import type { CharacterAsset } from '../loaders/character';
import { allFallen, boxTops, groundRect, inRect, makeSwordsman, noGroundWhy, resetSwordsman, risers, stepSwordsman, type EnemyDef, type FightAsset, type FightEvent, type FightLevel, type Swordsman, type SwordsmanMode, type WarriorView } from '../systems/fight';
import { SWORDSMAN, SwordsmanModel } from './swordsman-model';

export interface SwordsmanSnapshot {
  id: string;
  mode: SwordsmanMode;
  /** seconds in the mode */
  modeTime: number;
  pos: [number, number, number];
  /** degrees, as the level file's `facing` */
  facing: number;
  hits: number;
}

interface Entry {
  sim: Swordsman;
  model: SwordsmanModel;
  prev: THREE.Vector3;
  curr: THREE.Vector3;
  prevFacing: number;
}

const RAD2DEG = 180 / Math.PI;
const NO_EVENTS: FightEvent[] = [];

/**
 * The ground under each of a level's swordsmen. Throws, naming him, if one is not on a box top with his whole route.
 * `assets` is the manifest's list: whatever stands on his ground that is not a box (rock, a torii) is cut out of
 * it by the size the manifest gives it (B-79), which is what the level linter placed him by.
 */
export function swordsmanGrounds(level: FightLevel & { id?: string }, assets: readonly FightAsset[]): Map<string, NonNullable<ReturnType<typeof groundRect>>> {
  const boxes = boxTops(level), standing = risers(level, assets), out = new Map<string, NonNullable<ReturnType<typeof groundRect>>>();
  for (const def of level.enemies ?? []) {
    const ground = groundRect(boxes, def.pos, standing);
    if (!ground) throw new Error(`[swordsman] ${level.id ?? 'level'}: "${def.id}" at ${JSON.stringify(def.pos)} has no ground: ${noGroundWhy(boxes, def.pos, standing)} (npm run lint:levels)`);
    const off = (def.patrol ?? []).find((p) => !inRect(ground, p));
    if (off) throw new Error(`[swordsman] ${level.id ?? 'level'}: "${def.id}" patrols to ${JSON.stringify(off)}, which is off the ground he stands on`);
    out.set(def.id, ground);
  }
  return out;
}

export class Swordsmen {
  readonly root = new THREE.Group();
  private readonly all: Entry[];
  /** the same swordsmen as `all`, as the rules see them (D-026: what the goal and the gate are asked of) */
  readonly sims: readonly Swordsman[];

  constructor(level: FightLevel & { id?: string }, asset: CharacterAsset, assets: readonly FightAsset[]) {
    this.root.name = 'swordsmen';
    const grounds = swordsmanGrounds(level, assets);
    this.all = (level.enemies ?? []).map((def: EnemyDef, i) => {
      const sim = makeSwordsman(def, grounds.get(def.id)!);
      const model = new SwordsmanModel(asset, i * SWORDSMAN.inkTurn); // each one's ink is turned from the last one's
      model.root.name = `swordsman:${def.id}`;
      this.root.add(model.root);
      const at = new THREE.Vector3(sim.x, sim.ground.y, sim.z);
      return { sim, model, prev: at.clone(), curr: at, prevFacing: sim.facing };
    });
    this.sims = this.all.map((e) => e.sim);
    this.render(0, null);
  }

  get count(): number {
    return this.all.length;
  }

  /** D-026: every swordsman of the level is down. Asked each tick; false again once a respawn has stood them up. */
  allDown(): boolean {
    return allFallen(this.sims);
  }

  /** Every swordsman back on his post, on his feet: a level's start and every respawn. */
  reset(): void {
    for (const e of this.all) {
      resetSwordsman(e.sim);
      e.model.reset();
      e.curr.set(e.sim.x, e.sim.ground.y, e.sim.z);
      e.prev.copy(e.curr);
      e.prevFacing = e.sim.facing;
    }
  }

  /** One fixed tick. Call after the warrior has moved. Returns what happened, in the level's own order. */
  fixedUpdate(dt: number, warrior: WarriorView): FightEvent[] {
    let events = NO_EVENTS;
    for (const e of this.all) {
      e.prev.copy(e.curr);
      e.prevFacing = e.sim.facing;
      const ev = stepSwordsman(e.sim, warrior, dt);
      if (ev.length) events = events === NO_EVENTS ? ev : events.concat(ev);
      e.curr.set(e.sim.x, e.sim.ground.y, e.sim.z);
      e.model.tick({ mode: e.sim.mode, modeTime: e.sim.modeTime, speed: e.prev.distanceTo(e.curr) / dt, hits: e.sim.hits }, dt);
    }
    return events;
  }

  /** Place every figure between its last two ticks and draw it as the last tick left it. camera: null draws no ink that faces one. */
  render(alpha: number, camera: THREE.Camera | null): void {
    for (const e of this.all) {
      e.model.root.position.lerpVectors(e.prev, e.curr, alpha);
      let d = e.sim.facing - e.prevFacing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      e.model.root.rotation.y = e.prevFacing + d * alpha;
      if (camera) e.model.render(camera);
    }
  }

  snapshot(): SwordsmanSnapshot[] {
    return this.all.map(({ sim }) => ({
      id: sim.def.id, mode: sim.mode, modeTime: sim.modeTime, pos: [sim.x, sim.ground.y, sim.z], facing: sim.facing * RAD2DEG, hits: sim.hits,
    }));
  }

  /** Harness: the figure's clips. */
  clips(): { name: string; duration: number }[] {
    return this.all[0]?.model.clips() ?? [];
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const e of this.all) e.model.dispose();
  }
}
