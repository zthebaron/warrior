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

interface BoxTop { x0: number; x1: number; z0: number; z1: number; top: number; bot: number; /** what it is, for a message */ what?: string }

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

type Placement = NonNullable<FightLevel['geometry']>[number];

/** A placement boxTops reads as ground: a collision box, with three scales, that is not turned. */
const isBoxTop = (g: Placement): boolean =>
  g.asset === 'prim_box' && Array.isArray(g.pos) && Array.isArray(g.scale) && !(Array.isArray(g.rot) && g.rot.some((v) => v !== 0)) && g.collider !== 'none';

/** The level's unturned collision boxes, as tools/lint-level.mjs boxesOf reads them. */
export function boxTops(level: FightLevel): BoxTop[] {
  const out: BoxTop[] = [];
  for (const g of level.geometry ?? []) {
    if (!isBoxTop(g)) continue;
    const s = g.scale as V3;
    out.push({ x0: g.pos[0] - s[0] / 2, x1: g.pos[0] + s[0] / 2, z0: g.pos[2] - s[2] / 2, z1: g.pos[2] + s[2] / 2, top: g.pos[1] + s[1] / 2, bot: g.pos[1] - s[1] / 2 });
  }
  return out;
}

/** What this file reads of an asset in assets/dist/manifest.json. */
export interface FightAsset {
  name: string;
  kind?: string;
  collider?: string;
  /** a primitive's size at scale 1 */
  size?: number[];
  /** a mesh's bounding box at scale 1 */
  bbox?: { min: number[]; max: number[] };
}

/**
 * B-79. Every collider of the level that boxTops does NOT return, as the box that bounds it where it stands:
 * a mesh (rock, a torii) by its bounding box in the manifest, a turned box by the box around its eight corners.
 * groundRect cuts these out of a swordsman's ground exactly as it cuts an unturned box that rises from it.
 *
 * The bounding box is larger than the collider: a torii's spans its whole gate, a rock's its widest point, a
 * turned box's its corners. So what is cut away is more than the collider's footprint and never less; he does
 * not walk through a torii's gate, and he keeps further from a rock than its face.
 *
 * A placement is read as tools/lint-level.mjs obstaclesOf reads it: collider `none` (the placement's, else the
 * asset's) is dressing and is skipped; a scale is one number or three; a rotation is three.js Euler XYZ, degrees.
 * A moving platform is not a placement and is not here.
 */
export function risers(level: FightLevel, assets: readonly FightAsset[]): BoxTop[] {
  const byName = new Map(assets.map((a) => [a.name, a]));
  const out: BoxTop[] = [];
  (level.geometry ?? []).forEach((g, gi) => {
    const a = byName.get(g.asset);
    if (!a || !Array.isArray(g.pos) || isBoxTop(g) || (g.collider ?? a.collider) === 'none') return;
    const sc: number[] = typeof g.scale === 'number' ? [g.scale, g.scale, g.scale] : Array.isArray(g.scale) ? g.scale : [1, 1, 1];
    let lo: number[], hi: number[];
    if (a.kind === 'primitive' && Array.isArray(a.size)) { hi = a.size.map((v, k) => (v * sc[k]!) / 2); lo = hi.map((v) => -v); }
    else if (a.bbox) { lo = a.bbox.min.map((v, k) => v * sc[k]!); hi = a.bbox.max.map((v, k) => v * sc[k]!); }
    else return; // no size to place: the linter's UNKNOWN_ASSET or the manifest schema reports it
    const turned = Array.isArray(g.rot) && g.rot.some((v) => v !== 0);
    let R: number[][] | null = null;
    if (turned) { // R = Rx * Ry * Rz
      const [rx, ry, rz] = (g.rot as V3).map((v) => (v * Math.PI) / 180) as V3;
      const ca = Math.cos(rx), sa = Math.sin(rx), cb = Math.cos(ry), sb = Math.sin(ry), cc = Math.cos(rz), sn = Math.sin(rz);
      R = [[cb * cc, -cb * sn, sb], [ca * sn + sa * sb * cc, ca * cc - sa * sb * sn, -sa * cb], [sa * sn - ca * sb * cc, sa * cc + ca * sb * sn, ca * cb]];
    }
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let m = 0; m < 8; m++) {
      const p = [m & 1 ? hi[0]! : lo[0]!, m & 2 ? hi[1]! : lo[1]!, m & 4 ? hi[2]! : lo[2]!];
      const q = R ? R.map((r) => r[0]! * p[0]! + r[1]! * p[1]! + r[2]! * p[2]!) : p;
      for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k]!, q[k]! + g.pos[k]!); mx[k] = Math.max(mx[k]!, q[k]! + g.pos[k]!); }
    }
    out.push({ x0: mn[0]!, x1: mx[0]!, z0: mn[2]!, z1: mx[2]!, bot: mn[1]!, top: mx[1]!, what: `geometry[${gi}] ${g.asset}${turned ? ', turned' : ''}` });
  });
  return out;
}

/** His ground at `pos`, or why he has none there. */
function place(boxes: readonly BoxTop[], pos: V3, standing: readonly BoxTop[]): { rect: Rect } | { why: string } {
  const P = FIGHT.placing, m = FIGHT.swordsman.edgeMargin;
  const [x, y, z] = pos;
  const inside = (b: BoxTop): boolean => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1;
  const support = boxes.find((b) => inside(b) && Math.abs(b.top - y) <= P.onGround);
  if (!support) return { why: `there is no unturned collision box whose top is within ${P.onGround}u of his feet (a turned box is not ground)` };
  const r = { x0: support.x0, x1: support.x1, z0: support.z0, z1: support.z1, y: support.top };
  // the boxes first and in the level's order, then whatever else stands there: the order decides which side a
  // cut takes, and a level that places nothing but boxes on his ground is cut exactly as it was before B-79
  for (const b of [...boxes, ...standing]) {
    if (b === support || b.top <= y + P.stepOver || b.bot >= y + P.bodyHeight) continue;
    if (b.x1 <= r.x0 || b.x0 >= r.x1 || b.z1 <= r.z0 || b.z0 >= r.z1) continue; // not over this ground
    if (inside(b)) return { why: `he is inside ${b.what ? `the box around ${b.what}` : 'a box'} that stands on his ground (x ${b.x0.toFixed(2)}..${b.x1.toFixed(2)}, z ${b.z0.toFixed(2)}..${b.z1.toFixed(2)})` };
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
  if (out.x0 > out.x1 || out.z0 > out.z1 || x < out.x0 || x > out.x1 || z < out.z0 || z > out.z1)
    return { why: `he is within ${m}u of the edge of his ground or of something standing on it (clear of both it is x ${out.x0.toFixed(2)}..${out.x1.toFixed(2)}, z ${out.z0.toFixed(2)}..${out.z1.toFixed(2)})` };
  return { rect: out };
}

/**
 * The ground segment under `pos`: the top of the one box he stands on, cut back from anything else standing
 * on it, and drawn in by the edge margin. null if `pos` is not on a box top, or is inside the margin.
 * `standing` is risers(): what stands on the level that is not an unturned box (B-79). Whatever rises from his
 * ground is cut away along whichever side loses the least ground, so the result is always a rectangle: smaller
 * than the truth where an obstacle stands mid-floor, never larger.
 */
export function groundRect(boxes: readonly BoxTop[], pos: V3, standing: readonly BoxTop[] = []): Rect | null {
  const g = place(boxes, pos, standing);
  return 'rect' in g ? g.rect : null;
}

/** Why groundRect gives no ground at `pos`, in words for a level's author. '' if it gives one. */
export function noGroundWhy(boxes: readonly BoxTop[], pos: V3, standing: readonly BoxTop[] = []): string {
  const g = place(boxes, pos, standing);
  return 'why' in g ? g.why : '';
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

// ---------- the goal that waits (D-026) ----------

/**
 * Is the level clear: has it swordsmen, and is every one of them down? A level with none is never clear, so a
 * level that asks for a clear goal and places nobody can never be finished: the linter refuses that level
 * (CLEAR_NO_ENEMY) and the schema does too.
 */
export function allFallen(list: readonly { mode: SwordsmanMode }[]): boolean {
  return list.length > 0 && list.every((s) => s.mode === 'fallen');
}

/**
 * Does arriving at the goal count on this tick? (D-026.) Win is still arriving (Q4): a level whose goal carries
 * `once_clear` holds the arrival back while a swordsman of the level stands. It is asked afresh every tick and
 * keeps nothing, so a respawn, which stands every swordsman up again, shuts the goal again with no state to undo.
 */
export function goalCounts(onceClear: boolean | undefined, list: readonly { mode: SwordsmanMode }[]): boolean {
  return !onceClear || allFallen(list);
}

/** The gate of a goal that waits (D-026). Recorded in MEASUREMENTS.md "D-026 the gate". */
export const GATE = {
  /** s the leaves take to swing from shut to open once the last swordsman is down */
  openSec: 1.2,
  /** the tag of a level placement that is one of the gate's doors: it collides while the gate is shut */
  doorTag: 'gate_door',
};

/**
 * The gate, one fixed tick: how far open it is, 0 shut to 1 open. It swings open over GATE.openSec while the
 * level is clear and is shut at once when it is not (a respawn: nobody is in the gateway to be caught by it).
 */
export function stepGate(share: number, clear: boolean, dt: number): number {
  if (!clear) return 0;
  const next = share + dt / GATE.openSec;
  return next >= 1 - EPS ? 1 : next; // ticks of 1/60 s do not sum to exactly 1: open on the tick openSec is up
}

/** Is `b` within `reach` of `a` and inside the arc `arcDeg` wide centred on `facing`? XZ only. */
export function inArc(ax: number, az: number, facing: number, bx: number, bz: number, reach: number, arcDeg: number): boolean {
  const dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz);
  if (d > reach) return false;
  if (d < 1e-6) return true;
  return (dx * -Math.sin(facing) + dz * -Math.cos(facing)) / d >= Math.cos((arcDeg / 2) * DEG) - EPS;
}

/**
 * The warrior's slash clock, one fixed tick (src/entities/player.ts runs it; check:fight runs the same function).
 * time: seconds into the slash, or null. pressed: the sword's rising edge this tick.
 */
export function stepSlash(time: number | null, pressed: boolean, dt: number): { time: number | null; started: boolean } {
  const W = FIGHT.warrior;
  let t = time;
  if (t !== null) {
    t += dt;
    if (t >= W.slashSec) t = null;
  }
  // a press too soon after the last is dropped, as it always was: a slash is not cut short while it is young
  if (pressed && (t === null || t >= W.againSec)) return { time: 0, started: true };
  return { time: t, started: false };
}

/** Is the warrior's blade cutting, this far into the slash? (WarriorView.cutting) */
export const slashCutting = (time: number | null): boolean =>
  time !== null && time >= FIGHT.warrior.cutFrom - EPS && time <= FIGHT.warrior.cutTo + EPS;

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
