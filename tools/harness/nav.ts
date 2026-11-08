// nav — the bot. Walks critical_path segment by segment. INPUT IS CHOSEN FROM EACH WAYPOINT'S
// "via", never inferred from geometry: the bot does not know where floors are, so a level whose
// geometry does not support its declared path fails here even when it lints clean.
//
//   ground   hold toward target
//   jump     move + jump (fires on walk-off, inside coyote time — how MOVE was measured)
//   double   move + jump + second jump near apex
//   dash     move + dash
//   dashjump dash, then jump as the dash ends
//   wall     into surface + jump, jump again on wall contact. "Into surface" comes from the
//            WAYPOINTS, not geometry: a wall jump pushes AWAY from the wall, so to land at b the
//            wall must lie beyond a on the side away from b. The bot presses along (a - b) until
//            the wall jump fires, then steers for b. Author wall segments accordingly.
//   climb    jump + grab (into the wall), jump from the hang to climb
//   platform board the named platform, wait to be carried, step off
//
// Public input API only (window.__HARNESS__.step -> InputSystem override). No teleporting.
// ASSERTS: goal within the Q3 bot budget (12s x segments), never below bounds.min.y, waypoints in order.
// The budget is derived, never authored: levels have no par_time (PHASE-0-DECISIONS Q4 amendment 2).

import { FIXED_HZ, NEUTRAL, Stage, fmt, guard, hdist, openGame, wp, type Ctx, type InputFrame, type Snapshot, type StageResult, type Vec3, type Waypoint } from './lib.ts';

export const NAV_CONFIG = {
  segmentBudgetSec: 12,      // Q3: expert bot, no deaths, <= 12s per segment. An assertion, not a tuning knob.
  stallMultiplier: 3,        // hard timeout = budget x this; past it the bot is stuck, stop driving
  segmentTimeoutSec: 20,     // no single segment may take longer (stuck detector)
  groundReach: 1.0,          // m horizontal: a ground waypoint counts as reached
  groundReachDy: 1.0,        // m vertical slack for the above
  landProgress: 0.9,         // fraction of the a->b run a ballistic landing must reach
  landDy: 0.6,               // m: landed at the target's height
  landLateral: 1.5,          // m off the a->b line still counts as on target
  landReach: 1.5,            // m: OR landed this close to b (a ledge climb ends 0.6u past the lip, short of landProgress)
  risingJumpDy: 0.3,         // b higher than a by this -> jump at the takeoff point (no edge to walk off)
  groundedPastTakeoff: 0.25, // fraction of the run past a while still grounded -> jump anyway (floor continues)
  coyoteJumpDelayTicks: 2,   // ticks after walk-off before pressing jump (inside TUNING.coyoteTimeSec)
  apexVy: 0.5,               // m/s: second jump fires once vertical speed drops to this
  boardWaitDist: 3.0,        // m before the boarding waypoint where the bot waits for its platform
  boardAlign: 0.5,           // m: platform this close to the boarding waypoint -> step on
  rideArrive: 0.5,           // m: platform this close to the ride target -> step off
  rideFeetSlack: 2.0,        // m: and the player is still with it
  renderEvery: 30,           // render a frame every N ticks (exercise the renderer; sim is unaffected)
  maxAttempts: 3,            // ballistic retries when a jump lands back short (alive)
};

const BALLISTIC = new Set(['jump', 'double', 'dash', 'dashjump', 'wall', 'climb']);

interface SegState {
  phase: 'approach' | 'air' | 'done';
  airborneSeen: boolean;
  walkOffTick: number | null;
  pressed: Set<string>;
  attempts: number;
  platDist: number | null; // last tick's platform-to-boarding-point distance (is it arriving or leaving?)
}

function newSeg(): SegState {
  return { phase: 'approach', airborneSeen: false, walkOffTick: null, pressed: new Set(), attempts: 0, platDist: null };
}

function toward(from: Vec3, to: Vec3): { x: number; y: number } {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const len = Math.hypot(dx, dz);
  return len < 1e-6 ? { x: 0, y: 0 } : { x: dx / len, y: dz / len };
}

/** Progress of p along a->b (0 at a, 1 at b) and lateral distance from the line, in XZ. */
function along(a: Vec3, b: Vec3, p: Vec3): { s: number; lateral: number } {
  const ux = b[0] - a[0];
  const uz = b[2] - a[2];
  const L2 = ux * ux + uz * uz;
  if (L2 < 1e-9) return { s: 1, lateral: hdist(a, p) };
  const px = p[0] - a[0];
  const pz = p[2] - a[2];
  const s = (px * ux + pz * uz) / L2;
  const lateral = Math.abs(px * uz - pz * ux) / Math.sqrt(L2);
  return { s, lateral };
}

export interface NavOutcome {
  reached: number[];
  ticks: number;
  frames: InputFrame[];
  final: Snapshot;
}

export async function nav(ctx: Ctx): Promise<StageResult & { outcome?: NavOutcome }> {
  const st = new Stage('nav');
  let outcome: NavOutcome | undefined;
  const res = await guard(st, async () => {
    const g = await openGame(ctx);
    try {
      outcome = await drive(ctx, g.page, st);
      st.check('zero console errors', g.errors.length === 0, g.errors.slice(0, 5).join(' | ') || 'none');
    } finally {
      await g.close();
    }
  });
  return { ...res, ...(outcome ? { outcome } : {}) };
}

export type StepFn = (f: InputFrame, render: boolean) => Promise<Snapshot>;

export interface WalkOptions {
  /** First waypoint index sought (1 = from spawn). */
  startIndex: number;
  /** Stand-in for path[startIndex - 1] as the first segment's origin (a respawn point mid-edge). */
  from?: Waypoint;
  /** Stop as soon as this checkpoint index is activated (PHASE_SWEEP). Otherwise stop at results. */
  untilCheckpoint?: number;
  /** Hard tick limit for the whole walk. */
  tickLimit: number;
  quiet?: boolean;
}

export interface WalkResult {
  failure: string | null;
  reached: number[];
  ticks: number;
  snap: Snapshot;
  i: number;
  minYSeen: number;
  movesDone: Map<string, number>;
}

/**
 * The bot's drive loop: seeks waypoints from opts.startIndex, choosing input from each `via`.
 * Shared by `nav` (spawn -> goal) and `phase-sweep` (respawn point -> next checkpoint or goal).
 */
export async function walk(ctx: Ctx, page: import('@playwright/test').Page, opts: WalkOptions): Promise<WalkResult> {
  const L = ctx.level;
  const path = L.critical_path.map(wp);
  const C = NAV_CONFIG;
  const tickLimit = opts.tickLimit;
  const minY = L.bounds.min[1];
  const step = (f: InputFrame, render: boolean): Promise<Snapshot> => page.evaluate(([fr, r]) => window.__HARNESS__!.step(fr, r), [f, render] as const);
  const log = (m: string): void => { if (!opts.quiet) ctx.log(m); };

  let snap = await page.evaluate(() => window.__HARNESS__!.snapshot());
  const t0 = snap.tick;
  let i = opts.startIndex; // waypoint index being sought
  let seg = newSeg();
  let segStartTick = t0;
  const reached: number[] = [opts.startIndex - 1];
  let minYSeen = snap.feet[1];
  let failure: string | null = null;
  const movesDone = new Map<string, number>();
  // --trace-seg=N: log every tick of segment N (debugging a move the bot cannot complete)
  const traceSeg = ctx.args['trace-seg'] !== undefined ? Number(ctx.args['trace-seg']) : -1;
  const origin = (k: number): Waypoint => (k === opts.startIndex && opts.from ? opts.from : path[k - 1]!);
  const done = (s: Snapshot): boolean => s.state === 'results' || (opts.untilCheckpoint !== undefined && s.checkpoints.includes(opts.untilCheckpoint));

  const segLabel = (k: number): string => {
    const w = path[k]!;
    return `seg ${k - 1}->${k} (via ${w.via ?? '?'}${w.platform ? ` ${w.platform}` : ''}${w.note ? `, "${w.note}"` : ''})`;
  };

  while (!done(snap)) {
    const ticks = snap.tick - t0;
    if (ticks >= tickLimit) {
      failure = `goal not reached within ${C.stallMultiplier}x the bot budget = ${(tickLimit / FIXED_HZ).toFixed(0)}s; stalled on ${segLabel(Math.min(i, path.length - 1))} at ${fmt(snap.feet)}`;
      break;
    }
    if (i < path.length && snap.tick - segStartTick > C.segmentTimeoutSec * FIXED_HZ) {
      failure = `stuck: ${segLabel(i)} not completed in ${C.segmentTimeoutSec}s, player at ${fmt(snap.feet)} state=${snap.pstate}`;
      break;
    }

    const frame = i < path.length ? control(origin(i), path[i]!, path[i + 1], snap, seg) : { ...NEUTRAL, ...toward(snap.feet, L.goal.pos) };
    const prevDeaths = snap.deaths;
    snap = await step(frame, (snap.tick - t0) % C.renderEvery === 0);
    minYSeen = Math.min(minYSeen, snap.feet[1]);
    if (traceSeg === i) {
      ctx.log(`      [seg ${i} t${snap.tick - segStartTick}] in(${frame.x.toFixed(2)},${frame.y.toFixed(2)})${frame.jump ? ' J' : ''}${frame.dash ? ' D' : ''} feet ${fmt(snap.feet)} vel ${fmt(snap.vel)} ${snap.pstate}${snap.grounded ? ' G' : ''}`);
    }

    if (snap.feet[1] < minY) {
      failure = `fell below bounds.min.y (${minY}) on ${segLabel(Math.min(i, path.length - 1))} at ${fmt(snap.feet)}`;
      break;
    }
    if (snap.deaths > prevDeaths) {
      const w = path[Math.min(i, path.length - 1)]!;
      failure = `FELL on ${segLabel(Math.min(i, path.length - 1))} — died at ${fmt(snap.lastDeath ?? snap.feet)}, target was ${fmt(w.pos)}, last reached waypoint ${reached.at(-1)}`;
      break;
    }
    if (i < path.length && arrived(origin(i), path[i]!, path[i + 1], snap, seg)) {
      reached.push(i);
      const v = path[i]!.via ?? 'ground';
      movesDone.set(v, (movesDone.get(v) ?? 0) + 1);
      log(`    reached ${String(i).padStart(2)} ${segLabel(i).padEnd(58)} t=${((snap.tick - t0) / FIXED_HZ).toFixed(2)}s at ${fmt(snap.feet)}`);
      i++;
      seg = newSeg();
      segStartTick = snap.tick;
    } else if (seg.phase === 'done') {
      // ballistic attempt landed short but alive — retry
      seg.attempts++;
      if (seg.attempts >= C.maxAttempts) {
        failure = `${segLabel(i)}: ${C.maxAttempts} attempts landed short of ${fmt(path[i]!.pos)}, last at ${fmt(snap.feet)}`;
        break;
      }
      const a = seg.attempts;
      seg = newSeg();
      seg.attempts = a;
    }
  }
  return { failure, reached, ticks: snap.tick - t0, snap, i, minYSeen, movesDone };
}

async function drive(ctx: Ctx, page: import('@playwright/test').Page, st: Stage): Promise<NavOutcome> {
  const L = ctx.level;
  const path = L.critical_path.map(wp);
  const C = NAV_CONFIG;
  const budgetSec = ctx.segments * C.segmentBudgetSec;
  const tickBudget = Math.round(budgetSec * FIXED_HZ);
  const tickLimit = Math.round(budgetSec * C.stallMultiplier * FIXED_HZ);
  const minY = L.bounds.min[1];
  const w = await walk(ctx, page, { startIndex: 1, tickLimit });
  const { failure, reached, snap, i, minYSeen, movesDone } = w;
  const t0 = snap.tick - w.ticks;
  const segLabel = (k: number): string => {
    const q = path[k]!;
    return `seg ${k - 1}->${k} (via ${q.via ?? '?'}${q.platform ? ` ${q.platform}` : ''}${q.note ? `, "${q.note}"` : ''})`;
  };

  // The goal trigger (goal.radius) can fire before the final waypoint's reach radius; the final
  // waypoint sits in the goal by lint rule PATH_END, so entering the goal reaches it.
  if (!failure && snap.state === 'results' && i === path.length - 1 && hdist(snap.feet, path[i]!.pos) <= (L.goal.radius ?? 1) + C.groundReach) {
    reached.push(i);
    const v = path[i]!.via ?? 'ground';
    movesDone.set(v, (movesDone.get(v) ?? 0) + 1);
    ctx.log(`    reached ${String(i).padStart(2)} ${segLabel(i).padEnd(58)} t=${((snap.tick - t0) / FIXED_HZ).toFixed(2)}s at ${fmt(snap.feet)} (goal)`);
  }
  const ticks = snap.tick - t0;
  const inOrder = reached.every((v, k) => v === k);
  st.check('goal reached', snap.state === 'results' && !failure, failure ?? `results at ${(ticks / FIXED_HZ).toFixed(2)}s`);
  st.check(`within ${C.segmentBudgetSec}s x ${ctx.segments} segments`, ticks <= tickBudget, `${(ticks / FIXED_HZ).toFixed(2)}s / ${(tickBudget / FIXED_HZ).toFixed(0)}s`);
  st.check('never below bounds.min.y', minYSeen >= minY, `min feet y ${minYSeen.toFixed(2)} vs ${minY}`);
  st.check('waypoints reached in order', inOrder && reached.length === path.length, `${reached.length}/${path.length}: [${reached.join(',')}]`);
  // Every move the path declares must have been completed at least once by the bot.
  const declared = new Map<string, number>();
  for (const w of path.slice(1)) declared.set(w.via ?? 'ground', (declared.get(w.via ?? 'ground') ?? 0) + 1);
  const tally = [...declared].map(([v, n]) => `${v} ${movesDone.get(v) ?? 0}/${n}`).join(', ');
  const missed = [...declared].filter(([v, n]) => (movesDone.get(v) ?? 0) < n).map(([v]) => v);
  st.check('every declared move completed', missed.length === 0, missed.length ? `NOT completed: ${missed.join(', ')} — ${tally}` : tally);
  st.data['moves'] = Object.fromEntries(movesDone);
  const frames = await page.evaluate(() => window.__HARNESS__!.record());
  st.data['ticks'] = ticks;
  st.data['reached'] = reached;
  return { reached, ticks, frames, final: snap };
}

/** Input for this tick, from the target waypoint's `via`. */
function control(a: Waypoint, b: Waypoint, next: Waypoint | undefined, s: Snapshot, seg: SegState): InputFrame {
  const C = NAV_CONFIG;
  const via = b.via ?? 'ground';
  const dir = toward(s.feet, b.pos);
  const f: InputFrame = { ...NEUTRAL, ...dir };

  if (via === 'ground') {
    // Boarding: if the NEXT segment rides a platform, wait short of this waypoint until it is here.
    if (next?.via === 'platform' && next.platform) {
      const p = s.platforms.find((q) => q.id === next.platform);
      if (!p) return { ...NEUTRAL }; // named platform does not exist — wait; the segment timeout reports it
      const d = hdist(p.pos, b.pos);
      // Arriving or dwelling, never leaving: committing on the departing half of the dwell means
      // walking boardWaitDist after a platform that is already going (found by PHASE_SWEEP, B-7:
      // gym offset 5 walked into the void). A departing platform is waited out for its next pass.
      const leaving = seg.platDist !== null && d > seg.platDist + 1e-6;
      seg.platDist = d;
      const here = d < C.boardAlign && !leaving;
      if (hdist(s.feet, b.pos) < C.boardWaitDist && !here && seg.phase === 'approach') return { ...NEUTRAL };
      // Commit only from the wait point: committing from further back means arriving after the
      // platform has left. Once committed, keep walking on even as the platform starts moving.
      if (here && hdist(s.feet, b.pos) < C.boardWaitDist + C.groundReach) seg.phase = 'air';
    }
    return f;
  }

  if (via === 'platform') {
    return { ...NEUTRAL }; // stand still; the platform carries us (Player.groundMotion)
  }

  if (!BALLISTIC.has(via)) return f;

  const { s: prog } = along(a.pos, b.pos, s.feet);
  if (!s.grounded) seg.airborneSeen = true;
  const intoWall = toward(b.pos, a.pos); // wall segments only: the surface lies along (a - b)
  // Judge the wall jump by OUTCOME (player state), not by which press we think caused it.
  if (via === 'wall' && s.pstate === 'wall_jump') seg.pressed.add('walljumped');
  const wallJumped = via === 'wall' && seg.pressed.has('walljumped');
  if (via === 'wall' && !wallJumped) {
    f.x = intoWall.x;
    f.y = intoWall.y;
  }

  if (seg.phase === 'approach') {
    // Walk-off detection: first ungrounded tick in `fall` = we left the edge; coyote is running.
    if (!s.grounded && s.pstate === 'fall' && seg.walkOffTick === null) seg.walkOffTick = s.tick;
    const rising = b.pos[1] - a.pos[1] > C.risingJumpDy;
    const fire =
      (via !== 'wall' && seg.walkOffTick !== null && s.tick - seg.walkOffTick >= C.coyoteJumpDelayTicks) ||
      (s.grounded && via === 'wall') || // jump into the surface straight away
      (s.grounded && rising && prog >= 0) ||
      (s.grounded && prog >= C.groundedPastTakeoff);
    if (fire) {
      seg.phase = 'air';
      seg.pressed.clear();
      if (via === 'dash' || via === 'dashjump') {
        f.dash = true;
        seg.pressed.add('dash');
      } else {
        f.jump = true;
        seg.pressed.add('jump1');
      }
    }
    return f;
  }

  // phase 'air'. Past the target, steer for the next waypoint as a player would — steering back
  // toward b would reverse air control and drop us on the near lip of the landing.
  if (prog >= 1 && (via !== 'wall' || wallJumped)) {
    const d = next ? toward(s.feet, next.pos) : { x: 0, y: 0 };
    f.x = d.x;
    f.y = d.y;
  }
  switch (via) {
    case 'jump':
      f.jump = true; // hold for full height (release would trigger jump-cut gravity)
      break;
    case 'double':
      if (!seg.pressed.has('release') && s.vel[1] <= C.apexVy) {
        seg.pressed.add('release'); // one tick released so the second press is an edge
      } else if (seg.pressed.has('release') && !seg.pressed.has('jump2')) {
        seg.pressed.add('jump2');
        f.jump = true;
      } else {
        f.jump = !seg.pressed.has('release') || seg.pressed.has('jump2');
      }
      break;
    case 'dash':
      break;
    case 'dashjump':
      if (s.pstate !== 'dash' && !seg.pressed.has('jump1')) seg.pressed.add('jump1');
      f.jump = seg.pressed.has('jump1');
      break;
    case 'wall':
      // into the surface; on wall contact, release one tick then jump off it
      if (s.pstate === 'wall_slide' && !seg.pressed.has('release')) seg.pressed.add('release');
      else if (seg.pressed.has('release') && !seg.pressed.has('jump2')) seg.pressed.add('jump2');
      f.jump = !seg.pressed.has('release') || seg.pressed.has('jump2');
      break;
    case 'climb':
      // into the wall; ledge grab is automatic while pressing in; jump from the hang climbs
      if (s.pstate === 'ledge_grab' && !seg.pressed.has('release')) seg.pressed.add('release');
      else if (seg.pressed.has('release') && !seg.pressed.has('jump2')) seg.pressed.add('jump2');
      f.jump = !seg.pressed.has('release') || seg.pressed.has('jump2');
      break;
  }
  if (s.grounded && seg.airborneSeen && !arrivedBallistic(a, b, s)) seg.phase = 'done'; // landed short
  return f;
}

function arrivedBallistic(a: Waypoint, b: Waypoint, s: Snapshot): boolean {
  const C = NAV_CONFIG;
  const { s: prog, lateral } = along(a.pos, b.pos, s.feet);
  const onTarget = (prog >= C.landProgress && lateral < C.landLateral) || hdist(s.feet, b.pos) < C.landReach;
  return s.grounded && onTarget && Math.abs(s.feet[1] - b.pos[1]) < C.landDy;
}

function arrived(a: Waypoint, b: Waypoint, _next: Waypoint | undefined, s: Snapshot, seg: SegState): boolean {
  const C = NAV_CONFIG;
  const via = b.via ?? 'ground';
  if (via === 'platform') {
    const p = s.platforms.find((q) => q.id === b.platform);
    return !!p && s.grounded && hdist(p.pos, b.pos) < C.rideArrive && hdist(s.feet, b.pos) < C.rideFeetSlack;
  }
  if (BALLISTIC.has(via)) return seg.airborneSeen && arrivedBallistic(a, b, s);
  // grounded: a waypoint passed mid-fall is not reached (the next move would start airborne)
  return s.grounded && hdist(s.feet, b.pos) < C.groundReach && Math.abs(s.feet[1] - b.pos[1]) < C.groundReachDy;
}
