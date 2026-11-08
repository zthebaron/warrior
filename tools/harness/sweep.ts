// phase-sweep (B-7, Q6) — the dynamic counterpart to HAZARD_AT_CHECKPOINT.
//
// Hazards and platforms are pure functions of the world clock and never reset (Q6 part 4, D-004),
// so a player who dies comes back to a torii at an ARBITRARY phase. Two timed elements on
// incommensurate periods can make a segment impassable from some arrival phases, and that defect
// would be intermittent in the field. So: from every respawn point (spawn, then each checkpoint in
// path order), the bot must clear its segment entering at N evenly spaced phase offsets.
//
//   period P   the longest loop among timed elements: patroller 2·length/speed, platform
//              pingpong 2·duration, cycle 1·duration ('once' platforms do not repeat)
//   offset j   world tick round(j·P/N · 60) — set by respawnAt, which is exactly a respawn with
//              the arrival phase chosen instead of left to chance
//
// Per segment, two assertions:
//   1. some arrival phase clears it at all (else: impassable)
//   2. EVERY arrival phase clears within the Q3 bot budget (12 s), counting the wait. An arrival
//      that fails on departure waits at the torii for the next offset that clears; its cost is
//      that wait plus that run. Waiting at the torii is safe by HAZARD_AT_CHECKPOINT (B-8), whose
//      mirrored constants this stage checks against the running game.
//      The wait is quantised to P/N, so it is an upper bound: conservative toward failing.
//      Chapter 0 (the gym) is not a chapter (Q4) and its segments were never built to the Q3
//      budget: there, assertion 2 is "every phase clears eventually" and the worst time is printed,
//      not hidden (OQ-014).
//
// Crow cues (Q2, Q5): the bot above honours them (it holds at the torii for lift-off). For a segment
// carrying a cue, the same N arrivals are ALSO run blind (ignoreCues), report-only: how many arrival
// phases kill a player who departs without reading the crow. That is the cue's measured value and the
// teach-rate proxy until per-segment death counts exist (Q6 part 6 is not implemented).
//
// Respawn points that coincide (the gym's checkpoint 0 sits on spawn) are merged. A checkpoint must
// lie on the critical path, at a waypoint or partway along a ground edge, in path order.

import { FIXED_HZ, Stage, fmt, guard, hdist, openGame, wp, type Ctx, type StageResult, type Vec3, type Waypoint } from './lib.ts';
import { NAV_CONFIG, walk } from './nav.ts';

export const SWEEP_CONFIG = {
  offsets: 8, // Q6: "8 is a reasonable N"
};

interface RespawnPoint {
  label: string;
  pos: Vec3;
  facing: number;
  startIndex: number; // first waypoint sought from here
  from?: Waypoint;    // mid-edge origin
  untilCheckpoint?: number; // the next torii; undefined = the goal ends this segment
}

const len = (p: Vec3[]): number => p.slice(1).reduce((a, b, i) => a + Math.hypot(b[0] - p[i]![0], b[1] - p[i]![1], b[2] - p[i]![2]), 0);

export function sweepPeriod(L: Ctx['level']): number | null {
  const periods: number[] = [];
  for (const h of L.hazards ?? []) if (h.type === 'patroller' && h.path && h.speed) periods.push((2 * len(h.path)) / h.speed);
  for (const p of L.platforms ?? []) {
    const loop = p.loop ?? 'pingpong';
    if (loop === 'pingpong') periods.push(2 * p.duration);
    else if (loop === 'cycle') periods.push(p.duration);
  }
  return periods.length ? Math.max(...periods) : null;
}

/** Place spawn and every checkpoint on the critical path, in order. Throws a level finding if one is off it. */
export function respawnPoints(L: Ctx['level'], radius: number, dyTol: number): RespawnPoint[] {
  const path = L.critical_path.map(wp);
  const pts: RespawnPoint[] = [{ label: 'spawn', pos: L.spawn.pos, facing: L.spawn.facing, startIndex: 1 }];
  let cursor = 0; // path position (waypoint index) reached so far; placement must not go backwards
  let facing = L.spawn.facing;
  L.checkpoints.forEach((c, ci) => {
    facing = c.facing ?? facing;
    const near = (p: Vec3): boolean => hdist(p, c.pos) < radius && Math.abs(p[1] - c.pos[1]) < dyTol;
    let placed: RespawnPoint | null = null;
    for (let m = cursor; m < path.length && !placed; m++) {
      if (near(path[m]!.pos)) { placed = { label: `checkpoint[${ci}]`, pos: c.pos, facing, startIndex: m + 1 }; cursor = m; }
    }
    for (let k = Math.max(1, cursor + 1); k < path.length && !placed; k++) {
      const a = path[k - 1]!.pos, b = path[k]!.pos;
      const ux = b[0] - a[0], uz = b[2] - a[2], L2 = ux * ux + uz * uz;
      if (L2 < 1e-9) continue;
      const s = ((c.pos[0] - a[0]) * ux + (c.pos[2] - a[2]) * uz) / L2;
      const lateral = Math.abs((c.pos[0] - a[0]) * uz - (c.pos[2] - a[2]) * ux) / Math.sqrt(L2);
      const y = a[1] + (b[1] - a[1]) * s;
      if (s < 0 || s > 1 || lateral >= radius || Math.abs(y - c.pos[1]) >= dyTol) continue;
      const via = path[k]!.via ?? 'ground';
      if (via !== 'ground') throw new Error(`checkpoint[${ci}] ${fmt(c.pos)} lies partway along a "${via}" edge (seg ${k - 1}->${k}); a respawn point must be at a waypoint or on a ground edge`);
      placed = { label: `checkpoint[${ci}]`, pos: c.pos, facing, startIndex: k, from: { pos: c.pos, via: 'ground' } };
      cursor = k - 1;
    }
    if (!placed) throw new Error(`checkpoint[${ci}] ${fmt(c.pos)} is not on the critical path after the previous respawn point (within ${radius}u)`);
    const prev = pts.at(-1)!;
    if (hdist(prev.pos, placed.pos) < radius && Math.abs(prev.pos[1] - placed.pos[1]) < dyTol) {
      prev.label += ` = ${placed.label}`; // coincident: one respawn point, not a zero-length segment
      return;
    }
    prev.untilCheckpoint = ci;
    pts.push(placed);
  });
  return pts;
}

export async function phaseSweep(ctx: Ctx): Promise<StageResult> {
  const st = new Stage('phase-sweep');
  return guard(st, async () => {
    const g = await openGame(ctx);
    try {
      const rules = await g.page.evaluate(() => window.__HARNESS__!.rules);
      const tuning = await g.page.evaluate(() => window.__HARNESS__!.tuning);
      // HAZARD_AT_CHECKPOINT (B-8) mirrors these five numbers; the sweep's wait arithmetic relies on it.
      const game = { checkpointRadius: rules.checkpointRadius, heightTolerance: rules.goalHeightTolerance, goalRadiusDefault: rules.goalRadiusDefault, bodyRadius: tuning['capsuleRadius']!, bodyHeight: 2 * (tuning['capsuleHalfHeight']! + tuning['capsuleRadius']!) };
      const drift = (Object.keys(game) as (keyof typeof game)[]).filter((k) => Math.abs(game[k] - ctx.lintRules[k]) > 1e-9);
      st.check('linter respawn constants match the game', drift.length === 0, drift.length ? drift.map((k) => `${k}: lint ${ctx.lintRules[k]} vs game ${game[k]}`).join('; ') : JSON.stringify(game));
      let pts: RespawnPoint[];
      try {
        pts = respawnPoints(ctx.level, rules.checkpointRadius, rules.goalHeightTolerance);
      } catch (e) {
        st.check('respawn points on the critical path', false, e instanceof Error ? e.message : String(e));
        return;
      }
      const P = sweepPeriod(ctx.level);
      const N = P === null ? 1 : SWEEP_CONFIG.offsets;
      const budget = NAV_CONFIG.segmentBudgetSec;
      const tickLimit = Math.round(budget * NAV_CONFIG.stallMultiplier * FIXED_HZ);
      ctx.log(`    period ${P === null ? 'none (no timed elements: 1 arrival phase)' : `${P.toFixed(2)}s`}, ${pts.length} respawn points x ${N} offsets`);
      st.data['period'] = P;
      st.data['segments'] = [];
      for (const [r, pt] of pts.entries()) {
        const runs: { offset: number; tick: number; ok: boolean; sec: number; why: string | null }[] = [];
        for (let j = 0; j < N; j++) {
          const tick = P === null ? 0 : Math.round(((j * P) / N) * FIXED_HZ);
          await g.page.evaluate(([p, f, t]) => window.__HARNESS__!.respawnAt(p, f, t), [pt.pos, pt.facing, tick] as const);
          const w = await walk(ctx, g.page, { startIndex: pt.startIndex, ...(pt.from ? { from: pt.from } : {}), ...(pt.untilCheckpoint !== undefined ? { untilCheckpoint: pt.untilCheckpoint } : {}), tickLimit, quiet: true });
          const reachedEnd = w.snap.state === 'results' || (pt.untilCheckpoint !== undefined && w.snap.checkpoints.includes(pt.untilCheckpoint));
          runs.push({ offset: j, tick, ok: !w.failure && reachedEnd, sec: w.ticks / FIXED_HZ, why: w.failure });
        }
        const nextStart = pts[r + 1]?.startIndex ?? ctx.level.critical_path.length;
        const cued = ctx.level.critical_path.map(wp).slice(pt.startIndex, nextStart).some((w) => w.cue !== undefined);
        if (cued) {
          const blind: { offset: number; ok: boolean; why: string | null }[] = [];
          for (let j = 0; j < N; j++) {
            const tick = P === null ? 0 : Math.round(((j * P) / N) * FIXED_HZ);
            await g.page.evaluate(([p, f, t]) => window.__HARNESS__!.respawnAt(p, f, t), [pt.pos, pt.facing, tick] as const);
            const w = await walk(ctx, g.page, { startIndex: pt.startIndex, ...(pt.from ? { from: pt.from } : {}), ...(pt.untilCheckpoint !== undefined ? { untilCheckpoint: pt.untilCheckpoint } : {}), tickLimit, quiet: true, ignoreCues: true });
            const reachedEnd = w.snap.state === 'results' || (pt.untilCheckpoint !== undefined && w.snap.checkpoints.includes(pt.untilCheckpoint));
            blind.push({ offset: j, ok: !w.failure && reachedEnd, why: w.failure });
          }
          const dead = blind.filter((x) => !x.ok);
          const waits = runs.map((x) => x.sec);
          st.check(`seg ${r}: crow cue (report)`, true, `blind departures fail ${dead.length}/${N} arrival phases${dead.length ? ` (offsets ${dead.map((x) => x.offset).join(',')})` : ''}; reading the crow clears ${runs.filter((x) => x.ok).length}/${N}, ${Math.min(...waits).toFixed(2)}-${Math.max(...waits).toFixed(2)}s incl. the wait`);
          (st.data['blind'] ??= []) as unknown[];
          (st.data['blind'] as unknown[]).push({ segment: r, blind });
        }
        // cost of arriving at offset j: wait for the next offset that clears (cyclic), plus its run
        const step = P === null ? 0 : P / N;
        const cost = runs.map((_, j) => {
          for (let d = 0; d < N; d++) { const k = (j + d) % N; if (runs[k]!.ok) return d * step + runs[k]!.sec; }
          return Infinity;
        });
        const end = pt.untilCheckpoint !== undefined ? `checkpoint[${pt.untilCheckpoint}]` : 'goal';
        const name = `seg ${r} ${pt.label} -> ${end}`;
        const clears = runs.filter((x) => x.ok).length;
        const worst = Math.max(...cost);
        const firstFail = runs.find((x) => !x.ok);
        st.check(`${name}: clears from some phase`, clears > 0, clears > 0 ? `${clears}/${N} arrival phases clear on departure` : `impassable from all ${N} phases; e.g. offset ${firstFail?.offset}: ${firstFail?.why ?? 'did not arrive'}`);
        const detail = `worst arrival ${Number.isFinite(worst) ? `${worst.toFixed(2)}s` : 'never'} (wait + run)${firstFail ? `; failing departures: ${runs.filter((x) => !x.ok).map((x) => x.offset).join(',')}` : ''}`;
        if (ctx.level.chapter === 0) st.check(`${name}: every phase clears (gym: ${budget}s budget not asserted)`, Number.isFinite(worst), detail);
        else st.check(`${name}: every phase within ${budget}s`, worst <= budget, detail);
        ctx.log(`    ${name}: ${runs.map((x) => (x.ok ? x.sec.toFixed(1) : 'X')).join(' ')}`);
        (st.data['segments'] as unknown[]).push({ name, runs, worst });
      }
      st.check('zero console errors', g.errors.length === 0, g.errors.slice(0, 5).join(' | ') || 'none');
    } finally {
      await g.close();
    }
  });
}
