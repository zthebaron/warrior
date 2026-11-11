// The fight (D-023): the swordsman and the rules between him and the warrior, as PURE functions.
//
// No three.js, no DOM, no import at all, and only syntax Node strips: the game (src/entities/swordsmen.ts),
// the level linter (tools/lint-level.mjs), check:fight (tools/check-fight.ts, under Node) and the harness all
// run THIS code, so the rules have one definition. It is the same arrangement as src/systems/patrol.ts.
//
// Everything here advances on the fixed tick and nothing else: no wall clock, no frame count, no random
// number. A swordsman is a small state machine stepped once a tick from what the warrior is doing that tick,
// so a recorded run replays to the same fight, tick for tick (Q1's reason for refusing a pursuer was that it
// would not; this one has no route to choose: he walks straight at the warrior, on one flat rectangle).
//
// A swordsman has no physics body. His ground is one axis-aligned box top, found once from the level's own
// boxes (groundRect), and he is clamped to it: he cannot fall, climb, jump, or be pushed. The warrior does not
// collide with him. So nothing here can change a number the movement budgets were measured with.
//
// FIGHT is the one table to tune by feel. Every number in it is recorded in MEASUREMENTS.md "D-023 the fight".

export type V3 = [number, number, number];

export const FIGHT = {
  warrior: {
    /** the whole slash, s (the figure's clip and the ink stroke are drawn to these same four times) */
    slashSec: 0.36,
    /** the blade cuts from here ... */
    cutFrom: 0.07,
    /** ... to here: a swordsman inside the reach during it is hit, once a slash */
    cutTo: 0.19,
    /** a second press is ignored before this, and starts the slash again after it */
    againSec: 0.24,
    /** m, the warrior's centre to the swordsman's centre: as far as the blade reaches */
    reach: 1.9,
    /** the cut covers this many degrees in front of the warrior, half to each side */
    arcDeg: 150,
    /** m: the two must stand within this of the same height */
    reachHeight: 1.5,
  },
  swordsman: {
    /** he falls on this hit; every earlier one staggers him */
    hitsToFall: 2,
    /** m: he notices the warrior inside this ... */
    sightRange: 4.5,
    /** ... and within this of his own ground's height (a warrior on a ledge above or below is not seen) */
    sightHeight: 1.0,
    /** once he has noticed: m he keeps the warrior in view out to, and the height band (a jump does not lose him) */
    keepRange: 7,
    keepHeight: 3,
    /** s without seeing the warrior before he gives up and walks back to his post */
    forgetSec: 1.5,
    /** m/s on patrol and walking back to his post */
    patrolSpeed: 1.5,
    /** m/s closing in */
    closeSpeed: 2.8,
    /** rad/s he turns */
    turnRate: 7,
    /** s he stands at each end of a patrol */
    patrolPauseSec: 1.2,
    /** m: he stops closing in this far from the warrior */
    standoff: 1.4,
    /** m: with the warrior this close, and in front of him, he starts the wind-up */
    engageRange: 1.7,
    /** deg: "in front of him" for starting a wind-up, half to each side */
    engageArcDeg: 50,
    /** s from the start of the wind-up to the cut. THE number to judge by hand. */
    windupSec: 0.6,
    /** the wind-up is never shorter than this, whatever windupSec is set to */
    windupMinSec: 0.5,
    /** he keeps turning to face the warrior for this much of the wind-up, then commits to where he faces */
    windupTrackShare: 0.6,
    /** s the cut lasts: the warrior inside the reach during it is sent back */
    slashSec: 0.12,
    /** m, his centre to the warrior's centre: a short reach */
    reach: 1.8,
    /** the cut covers this many degrees in front of him, half to each side */
    arcDeg: 110,
    /** m: the two must stand within this of the same height (a jump clears the blade) */
    reachHeight: 1.2,
    /** s after the cut in which he does nothing: he is open */
    recoverSec: 0.9,
    /** s a hit that does not fell him leaves him reeling: he is open */
    staggerSec: 0.7,
    /** m he keeps from the edge of his ground, and from anything standing on it */
    edgeMargin: 0.5,
  },
  /** what the level linter holds a placement to (tools/lint-level.mjs) */
  placing: {
    /** m: a swordsman's post or patrol point is at least this far from where a required jump lands */
    landClear: 3,
    /** m: and at least this far beyond the radius of the spawn, a checkpoint or the goal */
    standClear: 0.5,
    /** m: his feet are on a box top to within this */
    onGround: 0.01,
    /** m: something standing on his ground taller than this is an obstacle he is kept away from */
    stepOver: 0.05,
    /** m: and only if it is lower than his own height above the ground */
    bodyHeight: 1.9,
  },
};

// ---------- the ground a swordsman keeps to ----------

/** An axis-aligned box top: the only ground a swordsman stands on. */
export interface Rect { x0: number; x1: number; z0: number; z1: number; y: number }

interface BoxTop { x0: number; x1: number; z0: number; z1: number; top: number; bot: number }

/** The level fields this file reads. A level file's own shape: nothing is assumed beyond it. */
export interface FightLevel {
  geometry?: { asset: string; pos: V3; rot?: V3; scale?: number | V3; collider?: string }[];
  enemies?: EnemyDef[];
}

export interface EnemyDef {
  id: string;
  type: 'swordsman';
  pos: V3;
  /** degrees, as spawn.facing: 0 looks down -Z, -90 down +X */
  facing: number;
  /** points he walks to in turn from `pos`, and back again. None: he stands guard at `pos`. */
  patrol?: V3[];
}

/** The level's unturned collision boxes, as tools/lint-level.mjs boxesOf reads them. */
export function boxTops(level: FightLevel): BoxTop[] {
  const out: BoxTop[] = [];
  for (const g of level.geometry ?? []) {
    if (g.asset !== 'prim_box' || !Array.isArray(g.pos) || !Array.isArray(g.scale)) continue;
    if (Array.isArray(g.rot) && g.rot.some((v) => v !== 0)) continue;
    if (g.collider === 'none') continue;
    const s = g.scale;
    out.push({ x0: g.pos[0] - s[0] / 2, x1: g.pos[0] + s[0] / 2, z0: g.pos[2] - s[2] / 2, z1: g.pos[2] + s[2] / 2, top: g.pos[1] + s[1] / 2, bot: g.pos[1] - s[1] / 2 });
  }
  return out;
}

/**
 * The ground segment under `pos`: the top of the one box he stands on, cut back from anything else standing
 * on it, and drawn in by the edge margin. null if `pos` is not on a box top, or is inside the margin.
 * A box that rises from his ground is cut away along whichever side loses the least ground, so the result is
 * always a rectangle: smaller than the truth where an obstacle stands mid-floor, never larger.
 */
export function groundRect(boxes: readonly BoxTop[], pos: V3): Rect | null {
  const P = FIGHT.placing, m = FIGHT.swordsman.edgeMargin;
  const [x, y, z] = pos;
  const inside = (b: BoxTop): boolean => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1;
  const support = boxes.find((b) => inside(b) && Math.abs(b.top - y) <= P.onGround);
  if (!support) return null;
  const r = { x0: support.x0, x1: support.x1, z0: support.z0, z1: support.z1, y: support.top };
  for (const b of boxes) {
    if (b === support || b.top <= y + P.stepOver || b.bot >= y + P.bodyHeight) continue;
    if (b.x1 <= r.x0 || b.x0 >= r.x1 || b.z1 <= r.z0 || b.z0 >= r.z1) continue; // not over this ground
    if (inside(b)) return null; // he is inside it
    const cuts: { area: number; apply: () => void }[] = [];
    const area = (x0: number, x1: number, z0: number, z1: number): number => Math.max(0, x1 - x0) * Math.max(0, z1 - z0);
    if (b.x0 >= x) cuts.push({ area: area(r.x0, b.x0, r.z0, r.z1), apply: () => { r.x1 = b.x0; } });
    if (b.x1 <= x) cuts.push({ area: area(b.x1, r.x1, r.z0, r.z1), apply: () => { r.x0 = b.x1; } });
    if (b.z0 >= z) cuts.push({ area: area(r.x0, r.x1, r.z0, b.z0), apply: () => { r.z1 = b.z0; } });
    if (b.z1 <= z) cuts.push({ area: area(r.x0, r.x1, b.z1, r.z1), apply: () => { r.z0 = b.z1; } });
    cuts.sort((p, q) => q.area - p.area);
    cuts[0]!.apply();
  }
  const out = { x0: r.x0 + m, x1: r.x1 - m, z0: r.z0 + m, z1: r.z1 - m, y: r.y };
  if (out.x0 > out.x1 || out.z0 > out.z1) return null;
  if (x < out.x0 || x > out.x1 || z < out.z0 || z > out.z1) return null;
  return out;
}

export const inRect = (r: Rect, p: V3): boolean =>
  p[0] >= r.x0 && p[0] <= r.x1 && p[2] >= r.z0 && p[2] <= r.z1 && Math.abs(p[1] - r.y) <= FIGHT.placing.onGround;

// ---------- the swordsman ----------

export type SwordsmanMode = 'guard' | 'patrol' | 'close' | 'windup' | 'slash' | 'recover' | 'stagger' | 'return' | 'fallen';

/** What happened this tick, for the rules (`cut`) and for sound. Nothing reads these but src/main.ts. */
export type FightEvent =
  | { kind: 'notice'; id: string }   // he has seen the warrior
  | { kind: 'windup'; id: string }   // he draws back to cut
  | { kind: 'hit'; id: string }      // the warrior's blade lands and he reels
  | { kind: 'fell'; id: string }     // the warrior's blade lands and he falls
  | { kind: 'cut'; id: string };     // his blade lands: the warrior is sent back

export interface Swordsman {
  readonly def: EnemyDef;
  readonly ground: Rect;
  /** where he walks: his post, then each patrol point */
  readonly route: readonly V3[];
  x: number;
  z: number;
  /** yaw, radians: forward is (-sin, -cos) in XZ, as the player's */
  facing: number;
  mode: SwordsmanMode;
  /** seconds in this mode */
  modeTime: number;
  hits: number;
  /** the warrior's slash that last hit him: one slash lands once */
  lastCutBy: number;
  /** the route point he is walking to, and which way along the route */
  leg: number;
  legStep: 1 | -1;
  /** seconds since he last saw the warrior */
  unseen: number;
  /** his own cut has landed already */
  landed: boolean;
}

/** What a swordsman is told about the warrior, once a tick. */
export interface WarriorView {
  /** false while the warrior is not in the world to be seen or cut (between a death and the respawn) */
  present: boolean;
  /** feet */
  x: number;
  y: number;
  z: number;
  facing: number;
  /** the warrior's blade is cutting this tick */
  cutting: boolean;
  /** which slash it is: counts up by one at each */
  slashId: number;
}

const DEG = Math.PI / 180;
const EPS = 1e-9;

export function makeSwordsman(def: EnemyDef, ground: Rect): Swordsman {
  const s: Swordsman = {
    def, ground, route: [def.pos, ...(def.patrol ?? [])],
    x: 0, z: 0, facing: 0, mode: 'guard', modeTime: 0, hits: 0, lastCutBy: -1, leg: 0, legStep: 1, unseen: 0, landed: false,
  };
  resetSwordsman(s);
  return s;
}

/** Back on his post, on his feet, as the level placed him: at a level's start and at every respawn. */
export function resetSwordsman(s: Swordsman): void {
  s.x = s.def.pos[0];
  s.z = s.def.pos[2];
  s.facing = s.def.facing * DEG;
  s.mode = s.route.length > 1 ? 'patrol' : 'guard';
  s.modeTime = 0;
  s.hits = 0;
  s.lastCutBy = -1;
  s.leg = s.route.length > 1 ? 1 : 0;
  s.legStep = 1;
  s.unseen = 0;
  s.landed = false;
}

/** Is `b` within `reach` of `a` and inside the arc `arcDeg` wide centred on `facing`? XZ only. */
export function inArc(ax: number, az: number, facing: number, bx: number, bz: number, reach: number, arcDeg: number): boolean {
  const dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz);
  if (d > reach) return false;
  if (d < 1e-6) return true;
  return (dx * -Math.sin(facing) + dz * -Math.cos(facing)) / d >= Math.cos((arcDeg / 2) * DEG) - EPS;
}

/** The wind-up as it is actually run: the table's value, never under the minimum. */
export const windupSec = (): number => Math.max(FIGHT.swordsman.windupSec, FIGHT.swordsman.windupMinSec);

function setMode(s: Swordsman, mode: SwordsmanMode): void {
  s.mode = mode;
  s.modeTime = 0;
}

function turnToward(s: Swordsman, target: number, dt: number): void {
  let d = target - s.facing;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  const max = FIGHT.swordsman.turnRate * dt;
  s.facing += Math.max(-max, Math.min(max, d));
}

/**
 * Walk toward (tx, tz) at `speed`, never off his ground, stopping `stopAt` short of it. True once there.
 * `face`: turn the way he walks (a patrol). Closing in, he faces the warrior instead, and the caller turns him.
 */
function walkTo(s: Swordsman, tx: number, tz: number, speed: number, dt: number, stopAt = 0, face = true): boolean {
  const g = s.ground;
  const cx = Math.max(g.x0, Math.min(g.x1, tx)), cz = Math.max(g.z0, Math.min(g.z1, tz));
  const dx = cx - s.x, dz = cz - s.z, d = Math.hypot(dx, dz);
  if (face && d > 1e-6) turnToward(s, Math.atan2(-dx, -dz), dt);
  const want = Math.max(0, Math.hypot(tx - s.x, tz - s.z) - stopAt); // how much nearer the real target he should get
  const step = Math.min(speed * dt, d, want);
  if (step > 0 && d > 1e-6) {
    s.x += (dx / d) * step;
    s.z += (dz / d) * step;
  }
  return d - step <= 1e-6;
}

/**
 * One fixed tick of one swordsman. Call after the warrior has moved this tick. Returns what happened.
 * The order inside is the rule: a hit on him is settled first (it interrupts whatever he was doing), then
 * what he sees, then what he does.
 */
export function stepSwordsman(s: Swordsman, w: WarriorView, dt: number): FightEvent[] {
  const F = FIGHT.swordsman, W = FIGHT.warrior, id = s.def.id;
  const ev: FightEvent[] = [];
  s.modeTime += dt;
  if (s.mode === 'fallen') return ev;

  const y = s.ground.y;
  // --- the warrior's blade ---
  if (w.present && w.cutting && w.slashId !== s.lastCutBy && Math.abs(w.y - y) <= W.reachHeight && inArc(w.x, w.z, w.facing, s.x, s.z, W.reach, W.arcDeg)) {
    s.lastCutBy = w.slashId;
    s.hits++;
    s.unseen = 0;
    if (s.hits >= F.hitsToFall) {
      setMode(s, 'fallen');
      ev.push({ kind: 'fell', id });
    } else {
      setMode(s, 'stagger');
      ev.push({ kind: 'hit', id });
    }
    return ev;
  }

  // --- what he sees ---
  const d = Math.hypot(w.x - s.x, w.z - s.z), dy = Math.abs(w.y - y);
  const roused = s.mode !== 'guard' && s.mode !== 'patrol' && s.mode !== 'return';
  const sees = w.present && (roused ? d <= F.keepRange && dy <= F.keepHeight : d <= F.sightRange && dy <= F.sightHeight);
  s.unseen = sees ? 0 : s.unseen + dt;
  const toWarrior = Math.atan2(-(w.x - s.x), -(w.z - s.z));

  switch (s.mode) {
    case 'guard':
      if (sees) { setMode(s, 'close'); ev.push({ kind: 'notice', id }); }
      else turnToward(s, s.def.facing * DEG, dt);
      break;
    case 'patrol': {
      if (sees) { setMode(s, 'close'); ev.push({ kind: 'notice', id }); break; }
      const p = s.route[s.leg]!;
      if (walkTo(s, p[0], p[2], F.patrolSpeed, dt)) {
        // at an end of the route he stands a moment, then turns back
        if (s.modeTime >= F.patrolPauseSec - EPS) {
          if (s.leg + s.legStep < 0 || s.leg + s.legStep >= s.route.length) s.legStep = s.legStep === 1 ? -1 : 1;
          s.leg += s.legStep;
          s.modeTime = 0;
        }
      } else s.modeTime = 0; // the pause is counted from his arrival
      break;
    }
    case 'return': {
      if (sees) { setMode(s, 'close'); ev.push({ kind: 'notice', id }); break; }
      const p = s.route[s.route.length > 1 ? s.leg : 0]!;
      if (walkTo(s, p[0], p[2], F.patrolSpeed, dt)) setMode(s, s.route.length > 1 ? 'patrol' : 'guard');
      break;
    }
    case 'close':
      if (s.unseen >= F.forgetSec - EPS) { setMode(s, 'return'); break; }
      if (!sees) break; // he waits where he is for the warrior to come back into view
      walkTo(s, w.x, w.z, F.closeSpeed, dt, F.standoff, false);
      turnToward(s, toWarrior, dt);
      if (d <= F.engageRange && dy <= F.reachHeight && inArc(s.x, s.z, s.facing, w.x, w.z, F.engageRange, F.engageArcDeg)) {
        setMode(s, 'windup');
        ev.push({ kind: 'windup', id });
      }
      break;
    case 'windup':
      if (sees && s.modeTime <= windupSec() * F.windupTrackShare) turnToward(s, toWarrior, dt);
      if (s.modeTime >= windupSec() - EPS) { setMode(s, 'slash'); s.landed = false; }
      break;
    case 'slash':
      if (!s.landed && w.present && dy <= F.reachHeight && inArc(s.x, s.z, s.facing, w.x, w.z, F.reach, F.arcDeg)) {
        s.landed = true;
        ev.push({ kind: 'cut', id });
      }
      if (s.modeTime >= F.slashSec - EPS) setMode(s, 'recover');
      break;
    case 'recover':
      if (s.modeTime >= F.recoverSec - EPS) setMode(s, 'close');
      break;
    case 'stagger':
      if (s.modeTime >= F.staggerSec - EPS) setMode(s, 'close');
      break;
  }
  return ev;
}
