// B-17, the play instrument (Q6 part 6; PROMPT-B17-INSTRUMENT). A DEV instrument, not a feature:
// behind ?instrument=on, it renders NOTHING in game (NOT-list #20 bans any run metric shown to the
// player). It records per-segment numbers from the same state the rules already keep, and hands them
// over at run end as a console table plus a JSON download, so a human never has to count while playing.
//
// Clock: the WORLD clock (D-004), i.e. play + death time, frozen in pause. Deterministic, so a bot run
// and a human run produce comparable numbers, and a paused game does not inflate a segment (OQ-048).
//
// Segments are torii to torii, exactly as the rules define them: segment s runs from torii s-1 (spawn
// for s = 0) to checkpoint s, and the last one to the goal. The current segment is one past the
// furthest checkpoint reached, the same furthest-index rule respawn uses (B-9).
//
// An ATTEMPT starts when a segment is entered and again at every respawn; it ends in death or a clear.
// player_depart_t is the first tick of the attempt at which the feet leave the starting torii's
// activation radius: the moment the player committed to the segment. For a crow-gated segment,
// crow_lift_t is that crow's most recent lift-off at or before departure, and since_last_lift_s the
// difference.
//
// since_last_lift_s IS NOT EVIDENCE OF READING THE CROW (OQ-048 ruling). Every departure has one, read or
// not: it always lands somewhere in [0, one crow loop). The blind bot scores 0.48 s and 0.97 s by chance.
// So the instrument never reports one as a figure. The segment carries `lift_timing` instead: the
// attempt count, the spread, and the loop it must be read against. Read against the loop, a spread much
// smaller than the loop, clustered near 0, is the signal; one attempt (spread null) says nothing.

import type { LevelData, Vec3 } from '../loaders/level';
import { waypointPos } from '../loaders/level';
import { patrolPeriod } from './patrol';

export interface InstrumentTick {
  t: number;
  state: string;
  feet: Vec3;
  checkpoints: readonly number[];
  deaths: number;
  crows: readonly { index: number; airborne: boolean }[];
}

export interface Attempt {
  start_t: number;
  player_depart_t: number | null;
  end_t: number | null;
  cleared: boolean;
  crow_lift_t: number | null;
  /** Departure minus the latest lift-off. NOT evidence of reading: see lift_timing and the header. */
  since_last_lift_s: number | null;
}

/** OQ-048 ruling: the only crow-timing summary the instrument emits. No single attempt is a figure. */
export interface LiftTiming {
  attempts_n: number; // attempts that departed after a lift-off was seen
  loop_s: number | null; // the crow's loop period: every since_last_lift_s lies in [0, loop_s)
  since_last_lift_s: number[]; // every attempt's value, in order: the distribution, never one of them
  spread_s: number | null; // max - min; null under 2 attempts (one attempt says nothing)
  spread_of_loop: number | null; // spread_s / loop_s: near 1 is what departing blind looks like
}

export interface SegmentRecord {
  segment: number;
  from: string;
  to: string;
  crow: number | null; // hazard index of the crow that gates this segment, if any
  segment_time_s: number | null; // entered -> first cleared, deaths and retries included
  deaths: number;
  first_clear_attempt: number | null; // 1-based
  retry_times_s: number[]; // duration of every finished attempt, in order
  attempts: Attempt[];
  lift_timing: LiftTiming | null; // crow-gated segments only
}

export interface InstrumentReport {
  level: string;
  clock: 'world';
  finished: boolean;
  total_s: number | null;
  segments: SegmentRecord[];
}

const r3 = (x: number): number => Math.round(x * 1000) / 1000;

export class Instrument {
  private readonly torii: Vec3[]; // index s = where segment s starts (spawn, then checkpoints)
  private readonly segs: SegmentRecord[];
  private readonly entered: (number | null)[];
  private readonly lastLift = new Map<number, number>();
  private readonly crowWas = new Map<number, boolean>();
  private current = 0;
  private lastDeaths = 0;
  private lastState = '';
  private startT: number | null = null;
  private finishedT: number | null = null;
  private readonly loopOf: (crow: number) => number | null;

  constructor(private readonly level: LevelData, private readonly radius: number) {
    const cps = level.checkpoints;
    this.torii = [level.spawn.pos, ...cps.map((c) => c.pos)];
    const n = cps.length + 1;
    // A crow gates segment s when a cued waypoint waits at torii s (lint CUE_NOT_AT_TORII guarantees the wait is at one).
    const crowOf: (number | null)[] = Array.from({ length: n }, () => null);
    level.critical_path.forEach((w, i) => {
      if (Array.isArray(w) || w.cue === undefined || i === 0) return;
      const wait = waypointPos(level.critical_path[i - 1]!);
      const s = this.torii.findIndex((p) => Math.hypot(p[0] - wait[0], p[2] - wait[2]) < radius && Math.abs(p[1] - wait[1]) < radius);
      if (s >= 0) crowOf[s] = w.cue;
    });
    this.segs = Array.from({ length: n }, (_, s) => ({
      segment: s,
      from: s === 0 ? 'spawn' : `checkpoint[${s - 1}]`,
      to: s === n - 1 ? 'goal' : `checkpoint[${s}]`,
      crow: crowOf[s] ?? null,
      segment_time_s: null,
      deaths: 0,
      first_clear_attempt: null,
      retry_times_s: [],
      attempts: [],
      lift_timing: null,
    }));
    this.loopOf = (crow) => {
      const h = level.hazards?.[crow] as { path?: Vec3[]; speed?: number } | undefined;
      return h?.path && h.speed !== undefined ? patrolPeriod(h.path, h.speed) : null;
    };
    this.entered = Array.from({ length: n }, () => null);
  }

  tick(x: InstrumentTick): void {
    for (const c of x.crows) {
      if (this.crowWas.get(c.index) === false && c.airborne) this.lastLift.set(c.index, x.t);
      this.crowWas.set(c.index, c.airborne);
    }
    if (this.finishedT !== null) return;
    if (this.startT === null && x.state === 'play') {
      this.startT = x.t;
      this.enter(0, x.t);
    }
    if (this.startT === null) return;
    const seg = this.segs[this.current]!;
    const att = seg.attempts.at(-1);
    // departure: feet leave the starting torii's activation disc
    if (att && att.player_depart_t === null && x.state === 'play') {
      const p = this.torii[this.current]!;
      if (Math.hypot(x.feet[0] - p[0], x.feet[2] - p[2]) > this.radius) {
        att.player_depart_t = r3(x.t);
        if (seg.crow !== null) {
          const lift = this.lastLift.get(seg.crow);
          if (lift !== undefined) {
            att.crow_lift_t = r3(lift);
            att.since_last_lift_s = r3(x.t - lift);
          }
        }
      }
    }
    if (x.deaths > this.lastDeaths) {
      seg.deaths += x.deaths - this.lastDeaths;
      this.endAttempt(x.t, false);
    }
    this.lastDeaths = x.deaths;
    if (this.lastState === 'death' && x.state === 'play') this.newAttempt(x.t); // respawned: a retry
    this.lastState = x.state;
    // clears: reaching checkpoint `current`, or the goal on the last segment
    const last = this.segs.length - 1;
    if (this.current < last && x.checkpoints.includes(this.current)) {
      this.clear(x.t);
      this.enter(this.current + 1, x.t);
    } else if (this.current === last && x.state === 'results') {
      this.clear(x.t);
      this.finishedT = x.t;
    }
  }

  private enter(s: number, t: number): void {
    this.current = s;
    this.entered[s] = t;
    this.newAttempt(t);
  }

  private newAttempt(t: number): void {
    this.segs[this.current]!.attempts.push({ start_t: r3(t), player_depart_t: null, end_t: null, cleared: false, crow_lift_t: null, since_last_lift_s: null });
  }

  private endAttempt(t: number, cleared: boolean): void {
    const seg = this.segs[this.current]!;
    const att = seg.attempts.at(-1);
    if (!att || att.end_t !== null) return;
    att.end_t = r3(t);
    att.cleared = cleared;
    seg.retry_times_s.push(r3(t - att.start_t));
    if (cleared && seg.first_clear_attempt === null) {
      seg.first_clear_attempt = seg.attempts.length;
      seg.segment_time_s = r3(t - this.entered[this.current]!);
    }
  }

  private clear(t: number): void {
    this.endAttempt(t, true);
  }

  report(): InstrumentReport {
    return {
      level: this.level.id,
      clock: 'world',
      finished: this.finishedT !== null,
      total_s: this.finishedT !== null && this.startT !== null ? r3(this.finishedT - this.startT) : null,
      segments: this.segs.map((s) => ({ ...s, lift_timing: this.liftTiming(s) })),
    };
  }

  private liftTiming(s: SegmentRecord): LiftTiming | null {
    if (s.crow === null) return null;
    const v = s.attempts.map((a) => a.since_last_lift_s).filter((x): x is number => x !== null);
    const loop = this.loopOf(s.crow);
    const spread = v.length >= 2 ? r3(Math.max(...v) - Math.min(...v)) : null;
    return { attempts_n: v.length, loop_s: loop === null ? null : r3(loop), since_last_lift_s: v, spread_s: spread, spread_of_loop: spread !== null && loop ? r3(spread / loop) : null };
  }

  /** The compact console table (dev only; never drawn in game). */
  table(): Record<string, unknown>[] {
    return this.segs.map((s) => ({
      segment: `${s.segment} ${s.from} -> ${s.to}`,
      time_s: s.segment_time_s,
      deaths: s.deaths,
      first_clear_attempt: s.first_clear_attempt,
      retries_s: s.retry_times_s.join(' '),
      lift_timing: s.crow === null ? '' : liftLine(this.liftTiming(s)!),
    }));
  }
}

/** One table cell for a crow segment: the count and the spread against the loop, never a lone value. */
function liftLine(l: LiftTiming): string {
  if (l.attempts_n < 2) return `n=${l.attempts_n}: too few to read (any departure is 0..${l.loop_s ?? '?'}s after a lift)`;
  return `n=${l.attempts_n}, spread ${l.spread_s}s of a ${l.loop_s ?? '?'}s loop (${l.spread_of_loop ?? '?'})`;
}
