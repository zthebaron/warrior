// The teach prompts (D-025): which one line about a move is on screen, as PURE functions.
//
// No three.js, no DOM, no import at all, and only syntax Node strips: the game (src/main.ts) and check:teach
// (tools/check-teach.ts, under Node) run THIS code, so the rule has one definition. It is the same arrangement as
// src/systems/fight.ts and src/systems/progression.ts.
//
// Where a line shows is never typed in. A level's `critical_path` already says, step by step, which move the
// path needs (`via`) and where it is made from (the waypoint before it), and its `enemies` say where a
// swordsman stands. teachSpots() reads those and nothing else, so a level that moves its first wall moves the
// line with it.
//
// The rule (Tim's brief, PROMPT-TEACH-AND-CHAPTER-SELECT.md):
//   first use   the first time a chapter's path needs a move the player has not made in this visit, its line is
//               on screen as he comes up to the place. It goes when he makes the move.
//   stuck       a move he HAS made gets its line back at a place where he has missed twice, or has stood for
//               several seconds without making it. It then stays until he is past the place.
//   one line    at a time: how to walk first, then a swordsman close by, then a shut gate, then the earliest
//               place on the path.
//   the hang    catching a ledge is half of the climb: while he hangs, a second line says how to get up.
//   the gate    (POLISH-1, B-99) on a level whose goal waits until every swordsman is down (D-026), a line at the
//               shut gate says why it is shut. It is not a move: it shows every time he comes to the gate while a
//               swordsman of the level still stands, and goes when the last one falls. It is read from the
//               level too: the door is its `gate_door` box, and only a level with `goal.once_clear` has one.
//
// "This visit" is memory and nothing else: a reload starts with every move unmade. Nothing is stored (SPEC §7
// row 15), and nothing here is read by the simulation: it is told what happened after each tick, as the sound
// tap is, and writes nothing back. It is not built at all on a page without the title screen.
//
// Every number is in MEASUREMENTS.md "D-025 the teach prompts".

export type V3 = [number, number, number];

/** The eight moves a path can ask for (`via`), the fight, and the shut gate of a level whose goal waits (not a move: it is never made). */
export type TeachMove = 'ground' | 'jump' | 'double' | 'dash' | 'dashjump' | 'wall' | 'climb' | 'platform' | 'fight' | 'gate';
/** What a line is about: a move, or hanging from a ledge. */
export type TeachLine = TeachMove | 'hang';

export const TEACH = {
  /** m, on the ground plan: a place's line is up from this far short of where its move is made */
  approachM: 6,
  /** s he stands at a place without making its move before the line comes back */
  lingerSec: 5,
  /** misses at one place before the line comes back */
  misses: 2,
  /** m: a rise taller than this is one he cannot walk up (the measured autostep ceiling), so standing within
   *  this of the top of it is standing on it */
  riseM: 0.34,
};

/** The numbers of the game's own that the rule needs, handed in so that this file imports nothing. */
export interface TeachRules {
  /** s per fixed tick */
  dt: number;
  /** m: he is "at the height of" a place within this above or below it (GAME_RULES.goalHeightTolerance) */
  heightTol: number;
  /** s after a dash ends in which a jump is still the dash's jump (the rig's own coyote time and jump buffer) */
  dashJumpSec: number;
}

/** The level fields this file reads. A level file's own shape: nothing is assumed beyond it. */
export interface TeachLevel {
  critical_path: (V3 | { pos: V3; via?: string; platform?: string })[];
  enemies?: { id: string; pos: V3 }[];
  /** D-026: `once_clear` makes the goal wait until every swordsman is down */
  goal?: { once_clear?: boolean };
  /** D-026: the gate's door is a box tagged GATE_DOOR_TAG (src/systems/fight.ts GATE.doorTag) */
  geometry?: { pos: V3; scale?: V3 | number; tag?: string }[];
}

/** src/systems/fight.ts GATE.doorTag, which this file cannot import; check:teach holds the two the same. */
export const GATE_DOOR_TAG = 'gate_door';

/** One place a line can show. */
export interface TeachSpot {
  key: string;
  move: TeachMove;
  /** index into critical_path of the step that needs the move; -1 for a swordsman or a gate */
  step: number;
  /** where the move is made from, and where it lands. For a swordsman: his post, twice. For a gate: the foot of its door, twice. */
  from: V3;
  to: V3;
  foe?: string;
  platform?: string;
}

/** What the game shows the rule after a tick in which the player was stepped. */
export interface TeachView {
  feet: V3;
  grounded: boolean;
  /** the player's state (src/entities/player.ts PlayerState) */
  pstate: string;
  /** every swordsman of the level: where he is, and whether he is down */
  foes: readonly { id: string; pos: V3; down: boolean }[];
  /** a swordsman fell to the warrior's blade this tick */
  fell: boolean;
  /** the id of the drifting stone under his feet, or null */
  riding: string | null;
}

const MOVES: ReadonlySet<string> = new Set(['ground', 'jump', 'double', 'dash', 'dashjump', 'wall', 'climb', 'platform']);
const posOf = (w: V3 | { pos: V3 }): V3 => (Array.isArray(w) ? w : w.pos);

/** Every place of a level a line can show, in the level's own order: the path's steps, then its swordsmen. */
export function teachSpots(level: TeachLevel): TeachSpot[] {
  const path = level.critical_path;
  const out: TeachSpot[] = [];
  for (let i = 1; i < path.length; i++) {
    const w = path[i]!;
    if (Array.isArray(w) || !w.via || !MOVES.has(w.via)) continue;
    // walking is taught once, where the chapter begins: every later stretch of ground would be the same line
    if (w.via === 'ground' && i > 1) continue;
    const spot: TeachSpot = { key: `step:${i}`, move: w.via as TeachMove, step: i, from: posOf(path[i - 1]!), to: w.pos };
    if (w.platform) spot.platform = w.platform;
    out.push(spot);
  }
  for (const e of level.enemies ?? []) out.push({ key: `foe:${e.id}`, move: 'fight', step: -1, from: e.pos, to: e.pos, foe: e.id });
  if (level.goal?.once_clear) {
    (level.geometry ?? []).forEach((g, k) => {
      if (g.tag !== GATE_DOOR_TAG) return;
      const tall = typeof g.scale === 'number' ? g.scale : g.scale?.[1] ?? 1;
      const foot: V3 = [g.pos[0], g.pos[1] - tall / 2, g.pos[2]]; // a box's pos is its centre
      out.push({ key: `gate:${k}`, move: 'gate', step: -1, from: foot, to: foot });
    });
  }
  return out;
}

const hdist = (a: V3, b: V3): number => Math.hypot(a[0] - b[0], a[2] - b[2]);

/** Distance from p to the segment a..b. */
function segDist(p: V3, a: V3, b: V3): number {
  const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const l2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1] + (p[2] - a[2]) * d[2]) / l2)) : 0;
  return Math.hypot(p[0] - (a[0] + d[0] * t), p[1] - (a[1] + d[1] * t), p[2] - (a[2] + d[2] * t));
}

/** Which stretch of the path he is nearest: k means the one from critical_path[k] to [k + 1]. The later of two equally near. */
export function nearestStretch(path: readonly V3[], p: V3): number {
  let best = 0, bestD = Infinity;
  for (let k = 0; k + 1 < path.length; k++) {
    const d = segDist(p, path[k]!, path[k + 1]!);
    if (d <= bestD) { bestD = d; best = k; }
  }
  return best;
}

/** How far along the ground plan from a to b the point p is, in metres from a; and the length of a..b. */
function along(p: V3, a: V3, b: V3): { at: number; len: number } {
  const dx = b[0] - a[0], dz = b[2] - a[2];
  const len = Math.hypot(dx, dz);
  return { at: len > 0 ? ((p[0] - a[0]) * dx + (p[2] - a[2]) * dz) / len : 0, len };
}

interface SpotState {
  misses: number;
  linger: number;
  /** the line is back, and stays until he is past the place */
  stuck: boolean;
  /** he has left the ground by a move while at the place, and has not yet come down */
  leapt: boolean;
}

/** What is on screen: the line, and the place it belongs to (null for the hang away from any climb). */
export interface TeachShown { line: TeachLine; spot: string | null }

/** The player states that are a leap: leaving the ground, or the air, by a move of his own. */
const LEAPS: ReadonlySet<string> = new Set(['jump', 'double_jump', 'wall_jump', 'dash']);

export class Teach {
  /** the moves made in this visit; `pullup` is the second half of the climb */
  private readonly used = new Set<TeachMove | 'pullup'>();
  private spots: TeachSpot[] = [];
  private path: V3[] = [];
  private state = new Map<string, SpotState>();
  private before: { pstate: string; grounded: boolean } | null = null;
  /** ticks since the player was last dashing; large when he has not */
  private sinceDash = Infinity;
  private shown: TeachShown | null = null;
  private readonly rules: TeachRules;

  constructor(rules: TeachRules) {
    this.rules = rules;
  }

  /** A level has started (or started again). The moves made stay made; what was missed at its places does not. */
  setLevel(level: TeachLevel): void {
    this.spots = teachSpots(level);
    this.path = level.critical_path.map(posOf);
    this.state = new Map(this.spots.map((s) => [s.key, { misses: 0, linger: 0, stuck: false, leapt: false }]));
    this.before = null;
    this.sinceDash = Infinity;
    this.shown = null;
  }

  /** The player was put somewhere (a respawn): the tick before means nothing now. */
  moved(): void {
    this.before = null;
    this.sinceDash = Infinity;
    for (const s of this.state.values()) s.leapt = false;
  }

  /** Has this move been made in this visit? */
  has(move: TeachMove | 'pullup'): boolean {
    return this.used.has(move);
  }

  /** What is on screen now. */
  current(): TeachShown | null {
    return this.shown;
  }

  private isPast(s: TeachSpot, v: TeachView, stretch: number): boolean {
    if (s.move === 'fight') return v.foes.find((f) => f.id === s.foe)?.down ?? true;
    if (s.move === 'gate') return v.foes.every((f) => f.down); // the gate is open: there is nothing to say
    if (stretch >= s.step) return true; // nearest a stretch of the path beyond this step's own
    if (s.to[1] - s.from[1] > TEACH.riseM) return v.grounded && v.feet[1] >= s.to[1] - TEACH.riseM; // up it
    const a = along(v.feet, s.from, s.to);
    return a.len > 0 && v.grounded && a.at >= a.len; // across it
  }

  private isNear(s: TeachSpot, v: TeachView): boolean {
    const tol = this.rules.heightTol;
    if (s.move === 'fight') {
      const f = v.foes.find((e) => e.id === s.foe);
      return !!f && hdist(v.feet, f.pos) <= TEACH.approachM && Math.abs(v.feet[1] - f.pos[1]) <= tol;
    }
    return hdist(v.feet, s.from) <= TEACH.approachM
      && v.feet[1] >= Math.min(s.from[1], s.to[1]) - tol && v.feet[1] <= Math.max(s.from[1], s.to[1]) + tol;
  }

  /** Call once after each fixed tick that stepped the player. Returns what is on screen. */
  afterTick(v: TeachView): TeachShown | null {
    const was = this.before;
    const entered = (state: string): boolean => v.pstate === state && was !== null && was.pstate !== state;
    // ---- the moves made this tick
    const made = new Set<TeachMove | 'pullup'>();
    if (v.grounded && (v.pstate === 'run' || v.pstate === 'sprint')) made.add('ground');
    // The dash jump is a jump that starts as a dash ends. Off an edge the dash carries him into the air, and the
    // jump that follows is then the air jump: chapter 4's first dash jump is made that way (MEASUREMENTS "D-025
    // the moves as the rig makes them"), so either jump counts.
    const afterDash = this.sinceDash * this.rules.dt <= this.rules.dashJumpSec;
    if (entered('jump')) made.add('jump');
    if (entered('double_jump')) made.add('double');
    if ((entered('jump') || entered('double_jump')) && afterDash) made.add('dashjump');
    if (entered('wall_jump')) made.add('wall');
    if (entered('ledge_grab')) made.add('climb');
    if (entered('ledge_climb')) made.add('pullup');
    if (entered('dash')) made.add('dash');
    if (v.riding !== null) made.add('platform');
    if (v.fell) made.add('fight');
    this.sinceDash = v.pstate === 'dash' ? 0 : this.sinceDash + 1;
    for (const m of made) this.used.add(m);

    // ---- each place: is he at it, has he missed at it, has he stood at it
    const stretch = nearestStretch(this.path, v.feet);
    const leaving = was !== null && LEAPS.has(v.pstate) && was.pstate !== v.pstate;
    const landed = was !== null && v.grounded && !was.grounded;
    const at: TeachSpot[] = [];
    for (const s of this.spots) {
      const st = this.state.get(s.key)!;
      if (!this.isNear(s, v)) { st.leapt = false; st.linger = 0; continue; }
      if (this.isPast(s, v, stretch)) { st.misses = 0; st.linger = 0; st.stuck = false; st.leapt = false; continue; }
      at.push(s);
      if (s.move === 'ground' || s.move === 'gate') continue; // walking has no miss, standing still is not being stuck, and the gate is not a move
      if (leaving) st.leapt = true;
      else if (landed && st.leapt) {
        // he went up by a move and came down still short of it: a miss that costs him nothing but the try
        st.leapt = false;
        if (++st.misses >= TEACH.misses) st.stuck = true;
      }
      // standing at it: only once the move is one he has made. Until then its line is already up, and it goes
      // the moment he makes the move, however long he took to read it
      if (made.has(s.move) || !this.used.has(s.move)) st.linger = 0;
      else if ((st.linger += this.rules.dt) >= TEACH.lingerSec) st.stuck = true;
    }
    this.before = { pstate: v.pstate, grounded: v.grounded };

    // ---- the one line
    const wants = (s: TeachSpot): boolean => s.move === 'gate' || !this.used.has(s.move) || (s.move !== 'ground' && this.state.get(s.key)!.stuck);
    if (v.pstate === 'ledge_grab') {
      const climb = at.find((s) => s.move === 'climb');
      this.shown = !this.used.has('pullup') || (climb && this.state.get(climb.key)!.stuck) ? { line: 'hang', spot: climb?.key ?? null } : null;
      return this.shown;
    }
    // how to walk comes before everything (nothing else can be done without it), then a swordsman close by, then
    // the shut gate, then the path in its own order: the sort is stable, and the places are already in the level's order
    const turn = (s: TeachSpot): number => (s.move === 'ground' ? 0 : s.move === 'fight' ? 1 : s.move === 'gate' ? 2 : 3);
    const pick = at.filter(wants).sort((a, b) => turn(a) - turn(b))[0];
    this.shown = pick ? { line: pick.move, spot: pick.key } : null;
    return this.shown;
  }

  /**
   * The attempt ended (a fall, a sliding stone, a swordsman's cut). That is a miss at the place it happened:
   * the step he had left the ground of and not finished, or, cut down, the nearest swordsman on his feet.
   */
  died(feet: V3, cut: boolean, foes: readonly { id: string; pos: V3; down: boolean }[]): void {
    let hit: TeachSpot | null = null, best = Infinity;
    for (const s of this.spots) {
      if (cut !== (s.move === 'fight') || s.move === 'ground' || s.move === 'gate') continue;
      let d: number;
      if (s.move === 'fight') {
        const f = foes.find((e) => e.id === s.foe);
        if (!f || f.down) continue;
        d = hdist(feet, f.pos);
      } else {
        const a = along(feet, s.from, s.to);
        if (a.len === 0 || a.at < 0 || a.at > a.len) continue; // not between where the move is made and where it lands
        d = Math.abs((feet[0] - s.from[0]) * (s.to[2] - s.from[2]) - (feet[2] - s.from[2]) * (s.to[0] - s.from[0])) / a.len; // off its line
      }
      if (d <= TEACH.approachM && d < best) { best = d; hit = s; }
    }
    if (hit) {
      const st = this.state.get(hit.key)!;
      if (++st.misses >= TEACH.misses) st.stuck = true;
    }
    this.shown = null;
    this.moved();
  }
}
