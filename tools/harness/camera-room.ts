// camera-room (CAMERA-WALL-ZOOM) — along every level's recorded run, does the follow camera keep its distance
// and keep the whole warrior in the frame?
//
// Found from play (Tim, 2026-11-11): running at chapter 2's first tall wall, the camera came in to the hat.
// The pivot leads the warrior by his velocity, so it went into the wall; the arm's ray began inside rock and
// the arm dropped to its 0.8 floor (MEASUREMENTS "CAMERA-WALL-ZOOM"). Nothing looked at the arm while he
// MOVES: pitch-assist and READABLE_RISE stand him still, where the pivot is over his feet, and ask whether a
// landing's top is in view. This stage replays the level's trace (the nav bot's own green run), reads the real
// rig every tick, and asserts:
//
//   1. the arm is never under minArmShare of its rest length for longer than a moment (momentSec);
//   2. the warrior's box (feet to the top of the figure) is never outside the frame or behind the camera,
//      not for one tick;
//   3. with the fix switched off (?pivothold=off) the same run BREAKS a rule, on every level where the rig
//      as it was led the pivot into rock (CAMERA_ROOM.failsWithoutHold). This is the stage seen to fail.
//
// The camera keeps the yaw the game gave it at spawn: what the run looks like to a player who never touches
// the mouse. Turning it behind the warrior's facing is a model of a player, not the game, so that view is not
// gated; tools/harness/camera-log.ts --yaw=follow prints it (B-82 lists what it finds).
//
// A stretch that breaks a rule is named by WHAT BLOCKED THE ARM: the level box the arm's own ray meets at the
// stretch's shortest arm. CAMERA_ROOM.blocks lists the boxes known to block it for real (a lintel overhead, a
// pit wall behind him): geometry the pivot fix does not answer, each tied to a backlog item. The stage fails on
// any blocker not listed, and on any listed box that no longer blocks, so the list cannot outlive its reason.

import { existsSync, readFileSync } from 'node:fs';
import { CAMERA_TUNING } from '../../src/engine/camera-tuning.ts';
import { RENDER_CONFIG } from '../../src/engine/render-config.ts';
import { FAILURE, FIXED_HZ, Stage, fmt, guard, openGame, type Ctx, type InputFrame, type StageResult, type Vec3 } from './lib.ts';
import { tracePath, type Trace } from './replay.ts';

/** Every value is in MEASUREMENTS.md "CAMERA-WALL-ZOOM". */
export const CAMERA_ROOM = {
  restArm: CAMERA_TUNING.distance,
  minArmShare: 0.5, //   the arm's floor, as a share of its rest length
  momentSec: 0.25, //    longer than this under the floor is not a moment
  turnDegPerSec: 360, // camera-log --yaw=follow only: how fast the mouse turns the camera behind the facing
  mouseSensitivity: CAMERA_TUNING.mouseSensitivity,
  /** Level boxes (index into `geometry`) that really block the arm on the recorded run. Not fixed here: B-82. */
  blocks: {
    '00-gym': [{ geometry: 22, backlog: 'B-82', what: 'the test block: he drops down its far side and it stands 2 u behind him' }],
    '03-drifting-stones': [
      { geometry: 8, backlog: 'B-82', what: 'the first lintel, 2.0 above the floor: the arm rises into its underside' },
      { geometry: 9, backlog: 'B-82', what: 'the second lintel, the same' },
    ],
  } as Record<string, { geometry: number; backlog: string; what: string }[]>,
  /** Levels whose recorded run breaks a rule with the pivot hold off (?pivothold=off, the rig before the fix).
   *  The stage replays each with it off and must see it FAIL there: a stage that cannot fail proves nothing.
   *  Chapter 3 is not one: its run never leads the pivot into rock, only under the two lintels listed above. */
  failsWithoutHold: ['00-gym', '01-lower-stair', '02-cliff-seam', '04-summit-ridge'],
};

export interface CameraSample {
  tick: number;
  state: string;
  feet: Vec3;
  vel: Vec3;
  pstate: string;
  facingDeg: number;
  yawDeg: number;
  pitchDeg: number;
  arm: number;
  fig: { x0: number; x1: number; y0: number; y1: number; nearM: number };
  cropped: boolean;
  pivot: Vec3;
  /** what the arm's own ray meets: how far along it, where, and that surface's normal (null: nothing within the rest arm) */
  hit: { distance: number; point: Vec3; normal: Vec3 } | null;
}

/** Replay `frames` on a fresh page of ctx's level, one sample per tick. follow: the camera is turned behind the
 *  warrior's facing by the mouse (H.look), at most turnDegPerSec; otherwise it keeps its spawn yaw. */
export async function sampleRun(ctx: Ctx, frames: InputFrame[], follow: boolean, pivotHold = true): Promise<{ samples: CameraSample[]; errors: string[] }> {
  const g = await openGame(ctx, pivotHold ? {} : { query: `?harness=1&level=${encodeURIComponent(ctx.levelId)}&pivothold=off` });
  try {
    const samples = await g.page.evaluate(
      ([frames, follow, turnPerTick, sens, near, rest]) => {
        const H = window.__HARNESS__!;
        H.setInput(null);
        const out: CameraSample[] = [];
        for (const fr of frames) {
          const s = H.step(fr, false);
          const c = H.cameraPose(), f = H.figureFrame()!;
          const d: [number, number, number] = [c.pos[0] - c.pivot[0], c.pos[1] - c.pivot[1], c.pos[2] - c.pivot[2]];
          const dl = Math.hypot(d[0], d[1], d[2]) || 1;
          const hit = H.castRay(c.pivot, [d[0] / dl, d[1] / dl, d[2] / dl], rest);
          out.push({
            tick: s.tick, state: s.state, feet: s.feet, vel: s.vel, pstate: s.pstate, facingDeg: H.facing(), yawDeg: c.yawDeg, pitchDeg: c.viewPitchDeg,
            arm: c.arm, fig: f, pivot: c.pivot, hit,
            cropped: f.x0 < -1 || f.x1 > 1 || f.y0 < -1 || f.y1 > 1 || f.nearM < near,
          });
          if (s.state === 'results') break;
          if (follow) {
            const err = ((((H.facing() - c.yawDeg) % 360) + 540) % 360) - 180;
            const turn = Math.max(-turnPerTick, Math.min(turnPerTick, err));
            if (turn) H.look(-(turn * Math.PI) / 180 / sens, 0);
          }
        }
        return out;
      },
      [frames, follow, CAMERA_ROOM.turnDegPerSec / FIXED_HZ, CAMERA_ROOM.mouseSensitivity, RENDER_CONFIG.near, CAMERA_ROOM.restArm] as const,
    );
    return { samples, errors: g.errors };
  } finally {
    await g.close();
  }
}

/** A stretch of consecutive ticks on which the arm is under the floor or the warrior is cropped. */
export interface Stretch {
  from: number;
  to: number;
  /** the longest run of consecutive ticks under the floor inside it */
  closeTicks: number;
  croppedTicks: number;
  worst: CameraSample;
  /** index into level.geometry of the box the arm's ray meets at the shortest arm; -1: not an unturned box of the level */
  blocker: number;
}

interface Box { asset: string; pos: Vec3; scale?: Vec3; rot?: unknown }

/** The level box whose surface holds `p` (an unturned prim_box; anything else is -1). */
export function boxAt(geometry: Box[], p: Vec3, eps = 0.02): number {
  return geometry.findIndex((g) => g.asset === 'prim_box' && g.scale && !g.rot && [0, 1, 2].every((k) => Math.abs(p[k]! - g.pos[k]!) <= g.scale![k]! / 2 + eps));
}

export function stretchesOf(samples: CameraSample[], geometry: Box[]): Stretch[] {
  const floor = CAMERA_ROOM.minArmShare * CAMERA_ROOM.restArm;
  const out: Stretch[] = [];
  let run: CameraSample[] = [];
  const flush = (): void => {
    if (!run.length) return;
    let close = 0, longest = 0;
    for (const s of run) { close = s.arm < floor ? close + 1 : 0; longest = Math.max(longest, close); }
    const worst = run.reduce((a, b) => (b.arm < a.arm ? b : a));
    out.push({ from: run[0]!.tick, to: run.at(-1)!.tick, closeTicks: longest, croppedTicks: run.filter((s) => s.cropped).length, worst, blocker: worst.hit ? boxAt(geometry, worst.hit.point) : -1 });
    run = [];
  };
  for (const s of samples) {
    if (s.arm < floor || s.cropped) run.push(s);
    else flush();
  }
  flush();
  return out;
}

export const describe = (s: Stretch): string =>
  `t${s.from}..${s.to}: arm ${s.worst.arm.toFixed(2)} (${Math.round((s.worst.arm / CAMERA_ROOM.restArm) * 100)}% of rest) at ${fmt(s.worst.feet)} ${s.worst.pstate}, under the floor ${s.closeTicks} ticks, cropped ${s.croppedTicks}; the arm meets ${s.blocker < 0 ? 'no level box' : `geometry[${s.blocker}]`}${s.worst.hit ? ` ${s.worst.hit.distance.toFixed(2)} u from the pivot at ${fmt(s.worst.hit.point)}` : ''}`;

export async function cameraRoom(ctx: Ctx): Promise<StageResult> {
  const st = new Stage('camera-room');
  return guard(st, async () => {
    const C = CAMERA_ROOM;
    const p = tracePath(ctx.root, ctx.levelId);
    if (!existsSync(p)) {
      st.failureClass = FAILURE.SETUP;
      st.check('trace exists', false, `${p} missing — record one from a green nav run: npm run playtest -- --level=${ctx.levelId} --record`);
      return;
    }
    const trace = JSON.parse(readFileSync(p, 'utf8')) as Trace;
    const { samples, errors } = await sampleRun(ctx, trace.frames, false);
    const last = samples.at(-1);
    if (!st.check('the recorded run reaches the goal', last?.state === 'results', last ? `${samples.length} ticks, state ${last.state} at ${fmt(last.feet)}` : 'no ticks')) return;

    const floor = C.minArmShare * C.restArm, moment = Math.round(C.momentSec * FIXED_HZ);
    const geometry = (ctx.level as unknown as { geometry: Box[] }).geometry;
    const stretches = stretchesOf(samples, geometry);
    const known = C.blocks[ctx.levelId] ?? [];
    const listed = (s: Stretch): boolean => known.some((k) => k.geometry === s.blocker);
    const tooLong = stretches.filter((s) => s.closeTicks > moment), cropped = stretches.filter((s) => s.croppedTicks > 0);
    const shortest = samples.reduce((a, b) => (b.arm < a.arm ? b : a));
    const outside = samples.filter((s) => !stretches.some((x) => listed(x) && s.tick >= x.from && s.tick <= x.to));
    const shortestOutside = outside.reduce((a, b) => (b.arm < a.arm ? b : a));

    const bad = tooLong.filter((s) => !listed(s));
    st.check(`the camera is never under ${C.minArmShare * 100}% of its rest arm (${floor.toFixed(2)} of ${C.restArm} u) for more than ${C.momentSec} s`, bad.length === 0,
      bad.length ? bad.map(describe).join(' | ') : `shortest arm ${shortestOutside.arm.toFixed(2)} u (${Math.round((shortestOutside.arm / C.restArm) * 100)}%) at t${shortestOutside.tick} ${fmt(shortestOutside.feet)}${known.length ? ', outside the listed blocks' : ''}; ${samples.length} ticks`);
    const cut = cropped.filter((s) => !listed(s));
    st.check('the whole warrior is in the frame on every tick', cut.length === 0,
      cut.length ? cut.map(describe).join(' | ') : `0 cropped ticks${known.length ? ' outside the listed blocks' : ''} of ${samples.length}`);
    for (const k of known) {
      const hits = stretches.filter((s) => s.blocker === k.geometry && (s.closeTicks > moment || s.croppedTicks > 0));
      st.check(`listed block geometry[${k.geometry}] (${k.backlog}) still blocks the arm`, hits.length > 0,
        hits.length ? `${k.what}. ${hits.map(describe).join(' | ')}` : `it no longer does: take it out of CAMERA_ROOM.blocks and close its part of ${k.backlog}`);
    }
    // seen to fail: the same run on the rig as it was (?pivothold=off) must break a rule at a place that is not a listed block
    if (C.failsWithoutHold.includes(ctx.levelId)) {
      const off = await sampleRun(ctx, trace.frames, false, false);
      const broke = stretchesOf(off.samples, geometry).filter((s) => !listed(s) && (s.closeTicks > moment || s.croppedTicks > 0));
      st.check('with the pivot hold off (?pivothold=off) the same run breaks a rule', broke.length > 0,
        broke.length ? `${broke.length} stretch${broke.length > 1 ? 'es' : ''}: ${broke.map(describe).join(' | ')}` : 'it does not: this stage no longer proves the hold is what keeps the camera back');
      errors.push(...off.errors);
    }
    st.check('zero console errors', errors.length === 0, errors.slice(0, 5).join(' | ') || 'none');
    st.data['shortestArm'] = { arm: shortest.arm, tick: shortest.tick, feet: shortest.feet };
    st.data['stretches'] = stretches.map((s) => ({ from: s.from, to: s.to, arm: s.worst.arm, closeTicks: s.closeTicks, croppedTicks: s.croppedTicks, blocker: s.blocker, feet: s.worst.feet }));
  });
}
