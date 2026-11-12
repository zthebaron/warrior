#!/usr/bin/env node
// check:fight — the four rules of the fight the brief names (D-023), run under Node with no browser.
// It steps the REAL functions the game steps (src/systems/fight.ts: stepSwordsman for the swordsman,
// stepSlash and slashCutting for the warrior's blade), not a copy, at the game's own fixed tick.
//
//   1. two hits      a swordsman falls on the SECOND hit and not the first; one slash lands once however long
//                    its blade is inside him; a slash out of reach or facing away lands on nothing
//   2. his cut       a warrior who stands in front of him is noticed, closed on and cut, once a slash; a warrior
//                    above the blade, out of its reach, or not in the world is not. (That a cut is a death and
//                    the death a respawn at the checkpoint is the game's wiring: the `fight` playtest stage.)
//   3. the replay    the same fight stepped twice is the same, tick for tick and bit for bit, and one swordsman
//                    is not changed by another being stepped beside him; the module reads no clock and no
//                    random number, and imports nothing
//   4. the wind-up   measured in ticks from the stepped fight, never from the table: whatever windupSec is set
//                    to, the time from the start of the wind-up to his blade is never under windupMinSec
//
//   npm run check:fight       --self-test first (each rule is run against a broken fight and must FAIL),
//                             then the rules against the fight as shipped. exit 0 pass · 1 fail
//
// Every distance below is a share of a number in FIGHT, so retuning the table does not make this check lie.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  FIGHT, boxTops, groundRect, makeSwordsman, resetSwordsman, risers, slashCutting, stepSlash, stepSwordsman,
  type EnemyDef, type FightAsset, type FightEvent, type FightLevel, type Rect, type Swordsman, type V3, type WarriorView,
} from '../src/systems/fight.ts';
// @ts-expect-error the linter is plain JavaScript: obstaclesOf and withColliders are documented where they are defined
import { obstaclesOf, withColliders } from './lint-level.mjs';

const DT = 1 / 60;
const F = FIGHT.swordsman, W = FIGHT.warrior;
type Step = typeof stepSwordsman;

/** A flat floor, far larger than any reach: the ground never decides a result here. */
const FLOOR: Rect = { x0: -20, x1: 20, z0: -20, z1: 20, y: 0 };
/** He stands at the origin looking down -X (facing 90, as a level file writes it). */
const GUARD: EnemyDef = { id: 'guard', type: 'swordsman', pos: [0, 0, 0], facing: 90 };
const WALKER: EnemyDef = { id: 'walker', type: 'swordsman', pos: [4, 0, -3], facing: 180, patrol: [[4, 0, 3]] };
/** Ground no wider than his post: a swordsman on it cannot close in, so a distance in a test stays what it was set to. */
const POST: Rect = { x0: 0, x1: 0, z0: 0, z1: 0, y: 0 };
/** The table as shipped, read before any mutation: what a scenario is built from. */
const SHIPPED = { reachHeight: F.reachHeight, reach: F.reach, keepRange: F.keepRange };
/** The warrior looking down +X, at the guard. */
const FACING_HIM = -Math.PI / 2;
/** Inside both blades: the warrior's reach and the range a swordsman starts his wind-up from. */
const near = (): number => Math.min(W.reach, F.engageRange) * 0.8;

interface Duel {
  s: Swordsman;
  step: Step;
  /** the warrior's slash clock and how many slashes have started, as the player keeps them */
  time: number | null;
  slashes: number;
  tick: number;
  events: { tick: number; kind: FightEvent['kind'] }[];
  /** one line a tick: everything a swordsman is */
  log: string[];
}

const duel = (def: EnemyDef, step: Step = stepSwordsman, ground: Rect = FLOOR): Duel => ({ s: makeSwordsman(def, ground), step, time: null, slashes: 0, tick: 0, events: [], log: [] });

interface Warrior { x: number; z: number; y?: number; facing?: number; present?: boolean; press?: boolean }

/** One fixed tick: the warrior's slash clock first (the player moves before the swordsmen are stepped), then him. */
function tick(d: Duel, w: Warrior): FightEvent[] {
  const sl = stepSlash(d.time, !!w.press, DT);
  d.time = sl.time;
  if (sl.started) d.slashes++;
  const present = w.present ?? true;
  const view: WarriorView = { present, x: w.x, y: w.y ?? 0, z: w.z, facing: w.facing ?? FACING_HIM, cutting: present && slashCutting(d.time), slashId: d.slashes };
  const ev = d.step(d.s, view, DT);
  d.tick++;
  for (const e of ev) d.events.push({ tick: d.tick, kind: e.kind });
  const s = d.s;
  d.log.push(`${d.tick} ${s.mode} ${s.modeTime} ${s.x} ${s.z} ${s.facing} ${s.hits} ${s.leg} ${s.unseen}`);
  return ev;
}

const count = (d: Duel, kind: FightEvent['kind']): number => d.events.filter((e) => e.kind === kind).length;
const first = (d: Duel, kind: FightEvent['kind'], from = 0): number => d.events.find((e) => e.kind === kind && e.tick > from)?.tick ?? -1;
const sec = (ticks: number): string => `${(ticks * DT).toFixed(3)} s (${ticks} ticks)`;

// ---------- 1. a swordsman falls to two hits and not one ----------
function twoHits(step: Step): string[] {
  const bad: string[] = [];
  const x = -near();
  // one press, then ten seconds of standing there: he is hit once and never falls
  const a = duel(GUARD, step);
  tick(a, { x, z: 0, press: true });
  for (let k = 0; k < 600; k++) tick(a, { x, z: 0 });
  if (count(a, 'hit') + count(a, 'fell') !== 1) bad.push(`one slash landed ${count(a, 'hit') + count(a, 'fell')} times (its blade is inside him for several ticks and must land once)`);
  if (count(a, 'fell') !== 0 || a.s.mode === 'fallen') bad.push(`ONE hit felled him (hits ${a.s.hits}, mode ${a.s.mode})`);
  if (a.s.hits !== 1) bad.push(`after one slash he has taken ${a.s.hits} hits, not 1`);
  if (first(a, 'hit') > 0 && a.log[first(a, 'hit') - 1]!.split(' ')[1] !== 'stagger') bad.push('the first hit did not stagger him');

  // a second press: now he falls, and stays down
  const b = duel(GUARD, step);
  tick(b, { x, z: 0, press: true });
  const again = Math.ceil(W.slashSec / DT) + 1; // the first slash is over
  for (let k = 0; k < again; k++) tick(b, { x, z: 0 });
  if (b.s.mode === 'fallen') bad.push('he was down before the second slash');
  tick(b, { x, z: 0, press: true });
  for (let k = 0; k < 600; k++) tick(b, { x, z: 0 });
  if (count(b, 'fell') !== 1 || b.s.mode !== 'fallen' || b.s.hits !== 2) bad.push(`TWO hits did not fell him (hits ${b.s.hits}, mode ${b.s.mode}, fell ${count(b, 'fell')} times)`);
  const down = first(b, 'fell');
  if (down > 0 && b.events.some((e) => e.tick > down)) bad.push(`a fallen swordsman did something: ${b.events.filter((e) => e.tick > down).map((e) => e.kind).join(', ')}`);

  // a blade that cannot reach him, and one swung the other way, land on nothing
  for (const [name, w] of [['out of reach', { x: -(W.reach + 0.2), z: 0 }], ['facing away', { x, z: 0, facing: -FACING_HIM }]] as const) {
    const c = duel(GUARD, step, POST); // he cannot walk into the blade
    tick(c, { ...w, press: true });
    for (let k = 0; k < again; k++) tick(c, w);
    if (c.s.hits !== 0) bad.push(`a slash ${name} hit him`);
  }
  return bad;
}

// ---------- 2. his slash reaches a warrior who stands there, and only one who does ----------
function hisCut(step: Step): string[] {
  const bad: string[] = [];
  const x = -near();
  const a = duel(GUARD, step);
  for (let k = 0; k < 600; k++) tick(a, { x, z: 0 });
  const order = a.events.slice(0, 3).map((e) => e.kind).join(' > ');
  if (order !== 'notice > windup > cut') bad.push(`a warrior standing in front of him: the fight opened "${order}", not "notice > windup > cut"`);
  // one cut a slash: wind-up, cut, wind-up, cut, and never two cuts from one wind-up
  const beats = a.events.filter((e) => e.kind === 'windup' || e.kind === 'cut').map((e) => e.kind);
  const twice = beats.findIndex((k, i) => k === (i % 2 ? 'windup' : 'cut'));
  if (twice >= 0) bad.push(`his slashes did not go wind-up, cut, wind-up, cut: ${beats.slice(0, twice + 1).join(' > ')} (a slash must land once, and only after its wind-up)`);
  if (count(a, 'cut') < 2) bad.push(`over ten seconds he cut ${count(a, 'cut')} times: after his recovery he must come again`);

  const never: [string, Warrior][] = [
    ['a warrior out of his reach', { x: -(SHIPPED.reach + 0.2), z: 0 }],
    ['a warrior who is not in the world (between a death and the respawn)', { x, z: 0, present: false }],
  ];
  for (const [name, w] of never) {
    const c = duel(GUARD, step, POST); // kept on his post, so the distance is the one set
    for (let k = 0; k < 600; k++) tick(c, w);
    if (count(c, 'cut') !== 0) bad.push(`${name} was cut`);
  }
  // a warrior who is in the air when the blade comes is not cut: a jump clears it
  const j = duel(GUARD, step);
  let tj = 0;
  while (first(j, 'windup') < 0 && tj++ < 600) tick(j, { x, z: 0 });
  for (let k = 0; k < 120; k++) tick(j, { x, z: 0, y: SHIPPED.reachHeight + 0.1 });
  if (count(j, 'cut') !== 0) bad.push('a warrior above his blade was cut (a jump must clear it)');
  // a warrior who steps out during the wind-up is not cut: the wind-up is there to be read
  const d = duel(GUARD, step);
  let t = 0;
  while (first(d, 'windup') < 0 && t++ < 600) tick(d, { x, z: 0 });
  for (let k = 0; k < 600; k++) tick(d, { x: -(SHIPPED.keepRange + 1), z: 0 });
  if (count(d, 'cut') !== 0) bad.push('a warrior who left during the wind-up was cut all the same');
  return bad;
}

// ---------- 3. a fight replays the same ----------
/** A scripted fight that visits every mode: an approach, hits, a death, a respawn, a patrol, a long walk away. */
function scripted(def: EnemyDef, step: Step): Duel {
  const d = duel(def, step);
  for (let k = 0; k < 1500; k++) {
    if (k === 700) { // the warrior respawns: he is put back on his post
      resetSwordsman(d.s);
      d.time = null;
    }
    const gone = k >= 640 && k < 700;                                // dead
    const r = k < 240 ? 9 - k * 0.032 : k < 900 ? 1.3 + 0.4 * Math.sin(k / 23) : 1.3 + (k - 900) * 0.02;
    const a = k / 61;                                                 // he is circled, slowly, wherever he has walked to
    const w: Warrior = { x: d.s.x - r * Math.cos(a), z: d.s.z + r * Math.sin(a), present: !gone, press: k < 400 && k % 97 === 40 };
    w.facing = Math.atan2(-(d.s.x - w.x), -(d.s.z - w.z));            // the warrior faces him
    tick(d, w);
  }
  return d;
}

function replays(step: Step): string[] {
  const bad: string[] = [];
  for (const def of [GUARD, WALKER]) {
    const a = scripted(def, step), b = scripted(def, step);
    const at = a.log.findIndex((line, i) => line !== b.log[i]);
    if (at >= 0) bad.push(`${def.id}: the same fight run twice differs from tick ${at + 1}: "${a.log[at]}" vs "${b.log[at]}"`);
    const modes = new Set(a.log.map((l) => l.split(' ')[1]));
    const want = def.patrol ? ['patrol', 'close', 'windup', 'slash', 'recover', 'stagger', 'return', 'fallen'] : ['guard', 'close', 'windup', 'slash', 'recover', 'stagger', 'return', 'fallen'];
    const missed = want.filter((m) => !modes.has(m));
    if (missed.length) bad.push(`${def.id}: the scripted fight never reached ${missed.join(', ')}, so its replay proves nothing about them`);
  }
  // a swordsman's fight is the same after another swordsman's whole fight has been stepped: nothing is shared
  const alone = scripted(GUARD, step);
  scripted(WALKER, step);
  const after = scripted(GUARD, step);
  const at = alone.log.findIndex((line, i) => line !== after.log[i]);
  if (at >= 0) bad.push(`a swordsman's fight changed after another was stepped: tick ${at + 1}`);

  // the rules read no clock and no random number, and import nothing (Node runs this file as it is)
  const src = readFileSync(fileURLToPath(new URL('../src/systems/fight.ts', import.meta.url)), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  for (const [name, re] of [['Math.random', /Math\.random/], ['Date', /\bDate\b/], ['performance', /\bperformance\b/], ['an import', /^\s*import\s/m]] as const) {
    if (re.test(src)) bad.push(`src/systems/fight.ts uses ${name}: a fight would not replay`);
  }
  return bad;
}

// ---------- 4. the wind-up is never shorter than the configured minimum ----------
function windupFloor(step: Step): string[] {
  const bad: string[] = [];
  const shipped = F.windupSec;
  const x = -near();
  try {
    for (const set of [0, 0.05, F.windupMinSec / 2, F.windupMinSec - DT / 2, F.windupMinSec, shipped, F.windupMinSec * 3]) {
      F.windupSec = set;
      const d = duel(GUARD, step);
      for (let k = 0; k < 900; k++) tick(d, { x, z: 0 });
      const ups = d.events.filter((e) => e.kind === 'windup');
      if (ups.length < 2) { bad.push(`windupSec ${set}: only ${ups.length} wind-ups in 15 s, nothing to measure`); continue; }
      for (const u of ups) {
        // from the tick the wind-up starts to the first tick his blade is out, and to the cut itself
        const blade = d.log.findIndex((l, i) => i >= u.tick && l.split(' ')[1] === 'slash') + 1;
        const cut = first(d, 'cut', u.tick);
        if (blade <= 0) continue; // the run ended inside this wind-up
        const floor = Math.ceil(F.windupMinSec / DT - 1e-9);
        if (blade - u.tick < floor) bad.push(`windupSec ${set}: his blade was out ${sec(blade - u.tick)} after the wind-up began, under the ${F.windupMinSec} s minimum`);
        if (cut > 0 && cut - u.tick < floor) bad.push(`windupSec ${set}: he cut ${sec(cut - u.tick)} after the wind-up began, under the ${F.windupMinSec} s minimum`);
        const want = Math.ceil(Math.max(set, F.windupMinSec) / DT - 1e-9);
        if (blade - u.tick !== want) bad.push(`windupSec ${set}: the wind-up ran ${sec(blade - u.tick)}, not the ${sec(want)} the table asks for`);
      }
    }
  } finally {
    F.windupSec = shipped;
  }
  return bad;
}

// ---------- 5. his ground stops at whatever stands on it (B-79) ----------
// The oracle is NOT the ground code: it is the collider. Every obstacle of the fixture is read the way the
// linter's camera arm reads it (obstaclesOf: a mesh as the triangles Rapier is handed, a box as its corners),
// and on every tick his centre is tested against those triangles: is it INSIDE the solid (a ray's crossings
// are odd), and how near is it to the part of the surface that stands in his own height band.

/** The ground a swordsman is given at `pos`: what the game clamps him to and the linter places him by. */
type Ground = (level: FightLevel, assets: readonly FightAsset[], pos: V3) => Rect | null;
const shippedGround: Ground = (level, assets, pos) => groundRect(boxTops(level), pos, risers(level, assets));
/** The ground as it was before B-79: unturned boxes only. A rock or a turned box standing on it is not seen. */
const boxesOnlyGround: Ground = (level, _assets, pos) => groundRect(boxTops(level), pos);

interface Solid { what: string; tris: number[][] }
interface Obstacle { gi: number; corners: number[][]; tris: { W: Float64Array; ix: number[] } | null }
/** a box's six faces, as indices into obstaclesOf's corners (bit 0 is x, bit 1 y, bit 2 z) */
const FACES = [[0, 2, 6, 4], [1, 3, 7, 5], [0, 1, 5, 4], [2, 3, 7, 6], [0, 1, 3, 2], [4, 5, 7, 6]];

function solidsOf(level: FightLevel, manifest: unknown): Solid[] {
  return (obstaclesOf(level, manifest) as Obstacle[]).map((o) => {
    const tris: number[][] = [];
    if (o.tris) {
      const { W, ix } = o.tris;
      for (let t = 0; t + 2 < ix.length; t += 3) tris.push([0, 1, 2].flatMap((k) => { const i = ix[t + k]! * 3; return [W[i]!, W[i + 1]!, W[i + 2]!]; }));
    } else {
      for (const [a, b, c, d] of FACES) for (const f of [[a, b, c], [a, c, d]]) tris.push(f.flatMap((m) => o.corners[m!]!));
    }
    const g = level.geometry![o.gi]!;
    return { what: `geometry[${o.gi}] ${g.asset}`, tris };
  });
}

const cross = (a: number[], b: number[]): number[] => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
const dot = (a: number[], b: number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
/** A ray that lies in no face of an axis-aligned box and along no edge of the kit's meshes. */
const RAY = [1, 0.0137, 0.0071];

/** Is `p` inside the closed solid: does a ray from it cross the surface an odd number of times. */
function insideSolid(solid: Solid, p: number[]): boolean {
  let n = 0;
  for (const t of solid.tris) {
    const e1 = [t[3]! - t[0]!, t[4]! - t[1]!, t[5]! - t[2]!], e2 = [t[6]! - t[0]!, t[7]! - t[1]!, t[8]! - t[2]!];
    const h = cross(RAY, e2), a = dot(e1, h);
    if (Math.abs(a) < 1e-12) continue;
    const s = [p[0]! - t[0]!, p[1]! - t[1]!, p[2]! - t[2]!], u = dot(s, h) / a;
    if (u < 0 || u > 1) continue;
    const q = cross(s, e1), v = dot(RAY, q) / a;
    if (v < 0 || u + v > 1) continue;
    if (dot(e2, q) / a > 0) n++;
  }
  return n % 2 === 1;
}

/** The part of a polygon on one side of the plane y = at (keep +1: above it, -1: below it). */
function clipY(poly: number[][], at: number, keep: 1 | -1): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
    const ina = (a[1]! - at) * keep >= 0, inb = (b[1]! - at) * keep >= 0;
    if (ina) out.push(a);
    if (ina !== inb) { const k = (at - a[1]!) / (b[1]! - a[1]!); out.push([a[0]! + (b[0]! - a[0]!) * k, at, a[2]! + (b[2]! - a[2]!) * k]); }
  }
  return out;
}

/** Metres on the ground plan from (x, z) to the part of the solid's surface between heights lo and hi. 0: he is under or over it. */
function clearance(solid: Solid, x: number, z: number, lo: number, hi: number): number {
  let best = Infinity;
  for (const t of solid.tris) {
    const poly = clipY(clipY([[t[0]!, t[1]!, t[2]!], [t[3]!, t[4]!, t[5]!], [t[6]!, t[7]!, t[8]!]], lo, 1), hi, -1);
    if (poly.length < 3) continue;
    let side = 0, covers = true, area = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
      const ex = b[0]! - a[0]!, ez = b[2]! - a[2]!, px = x - a[0]!, pz = z - a[2]!;
      area += a[0]! * b[2]! - b[0]! * a[2]!;
      const turn = Math.sign(ex * pz - ez * px);
      if (turn !== 0) { if (side === 0) side = turn; else if (turn !== side) covers = false; }
      const len = ex * ex + ez * ez, k = len > 0 ? Math.max(0, Math.min(1, (px * ex + pz * ez) / len)) : 0;
      best = Math.min(best, Math.hypot(px - ex * k, pz - ez * k));
    }
    if (covers && Math.abs(area) > 1e-9) return 0;
  }
  return best;
}

/** tools/fixtures/fight/risers.json: a level's geometry and enemies, and where the warrior stands for each. */
interface RiserFixture extends FightLevel { enemies: EnemyDef[]; warriors: Record<string, V3> }
const MANIFEST_PATH = fileURLToPath(new URL('../assets/dist/manifest.json', import.meta.url));
const RISERS = {
  level: JSON.parse(readFileSync(new URL('./fixtures/fight/risers.json', import.meta.url), 'utf8')) as RiserFixture,
  manifest: await withColliders(JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')), MANIFEST_PATH) as { assets: FightAsset[] },
};
const RISER_SOLIDS = solidsOf(RISERS.level, RISERS.manifest);
/** how long he is given to walk into something: several times what the walk takes */
const GROUND_TICKS = 600;

interface GroundRun {
  rect: Rect | null;
  /** tick he noticed the warrior on, -1 never */
  notice: number;
  /** ticks his centre spent inside a collider, the first of them, and which collider */
  insideTicks: number; firstInside: number; into: string;
  /** the nearest he came to a collider's surface in his height band, and which, on which tick */
  minClear: number; nearest: string; nearestTick: number;
  /** how far he walked from his post */
  walked: number;
}

/** One of the fixture's swordsmen, given his ground by `ground`, with the warrior stood across the collider from him. */
function groundRun(def: EnemyDef, step: Step, ground: Ground): GroundRun {
  const P = FIGHT.placing;
  const out: GroundRun = { rect: ground(RISERS.level, RISERS.manifest.assets, def.pos), notice: -1, insideTicks: 0, firstInside: -1, into: '', minClear: Infinity, nearest: '', nearestTick: -1, walked: 0 };
  if (!out.rect) return out;
  const d = duel(def, step, out.rect), w = RISERS.level.warriors[def.id]!;
  for (let k = 0; k < GROUND_TICKS; k++) {
    tick(d, { x: w[0], y: w[1], z: w[2] });
    const { x, z } = d.s, y = out.rect.y;
    out.walked = Math.max(out.walked, Math.hypot(x - def.pos[0], z - def.pos[2]));
    for (const solid of RISER_SOLIDS) {
      if (insideSolid(solid, [x, y + P.bodyHeight / 2, z])) {
        if (!out.insideTicks) { out.firstInside = d.tick; out.into = solid.what; }
        out.insideTicks++;
      }
      const c = clearance(solid, x, z, y + P.stepOver, y + P.bodyHeight);
      if (c < out.minClear) { out.minClear = c; out.nearest = solid.what; out.nearestTick = d.tick; }
    }
  }
  out.notice = first(d, 'notice');
  return out;
}

function hisGround(step: Step, ground: Ground = shippedGround): string[] {
  const bad: string[] = [];
  for (const def of RISERS.level.enemies) {
    const r = groundRun(def, step, ground);
    if (!r.rect) { bad.push(`${def.id}: no ground at his post ${JSON.stringify(def.pos)}: the fixture stands him clear of the collider`); continue; }
    if (r.notice < 0 || r.walked < F.edgeMargin) bad.push(`${def.id}: he ${r.notice < 0 ? 'never noticed the warrior' : `walked only ${r.walked.toFixed(2)} m`}: the fixture tests nothing`);
    if (r.insideTicks) bad.push(`${def.id}: he walked INTO ${r.into}: inside its collision triangles for ${r.insideTicks} of ${GROUND_TICKS} ticks, from tick ${r.firstInside}`);
    else if (r.minClear < F.edgeMargin - 1e-9) bad.push(`${def.id}: he came within ${r.minClear.toFixed(3)} m of ${r.nearest} (tick ${r.nearestTick}); he keeps edgeMargin ${F.edgeMargin} m from anything standing on his ground`);
  }
  return bad;
}

const RULES: [string, (step: Step) => string[]][] = [
  ['a swordsman falls to two hits and not one', twoHits],
  ['his slash reaches a warrior who stands in front of him, and only one who does', hisCut],
  ['a fight replays the same, run to run', replays],
  ['the wind-up is never shorter than the configured minimum', windupFloor],
  ['his ground stops at whatever stands on it: rock, a turned box', hisGround],
];

// ---------- the self-test: each rule against a fight broken in the way it exists to catch ----------
/** Run `rule` with the table changed, and put the table back. */
function withTable<K extends keyof typeof F>(key: K, value: (typeof F)[K], rule: (step: Step) => string[]): string[] {
  const was = F[key];
  F[key] = value;
  try {
    return rule(stepSwordsman);
  } finally {
    F[key] = was;
  }
}

let drift = 0;
const MUTATIONS: [string, number, () => string[]][] = [
  ['hitsToFall 1: the first hit fells him', 0, () => withTable('hitsToFall', 1, twoHits)],
  ['hitsToFall 3: two hits do not fell him', 0, () => withTable('hitsToFall', 3, twoHits)],
  ['a slash that lands on every tick its blade is inside him', 0, () => twoHits((s, w, dt) => { s.lastCutBy = -1; return stepSwordsman(s, w, dt); })],
  ['his blade reaches nothing (reach 0.1)', 1, () => withTable('reach', 0.1, hisCut)],
  ['his blade ignores height (reachHeight 99)', 1, () => withTable('reachHeight', 99, hisCut)],
  ['a cut that lands on every tick of his slash', 1, () => hisCut((s, w, dt) => { s.landed = false; return stepSwordsman(s, w, dt); })],
  ['a step that keeps state outside the swordsman (a counter that never resets)', 2, () => replays((s, w, dt) => { s.x += 1e-9 * (drift++ % 7); return stepSwordsman(s, w, dt); })],
  ['a wind-up that runs twice as fast as its clock', 3, () => windupFloor((s, w, dt) => { if (s.mode === 'windup') s.modeTime += dt; return stepSwordsman(s, w, dt); })],
  ['his ground as it was before B-79: unturned boxes only, a rock or a turned box on it unseen', 4, () => hisGround(stepSwordsman, boxesOnlyGround)],
  ['a swordsman who is not held to his ground', 4, () => hisGround((s, w, dt) => { const g = s.ground; s.ground = FLOOR; try { return stepSwordsman(s, w, dt); } finally { s.ground = g; } })],
  ['a wind-up cut to a third whenever the warrior is close', 3, () => windupFloor((s, w, dt) => { if (s.mode === 'windup' && s.modeTime < dt * 1.5) s.modeTime += F.windupMinSec * 0.67; return stepSwordsman(s, w, dt); })],
];

function selfTest(): number {
  let bad = 0;
  for (const [name, rule, run] of MUTATIONS) {
    const fails = run();
    const ok = fails.length > 0;
    if (!ok) bad++;
    console.log(`  ${ok ? '✓' : '✗'} ${name}: rule ${rule + 1} ${ok ? `FAILS, as it must (${fails[0]})` : 'PASSED. The rule does not catch this.'}`);
  }
  // and every rule must have been broken by something
  for (let r = 0; r < RULES.length; r++) {
    if (!MUTATIONS.some(([, rule]) => rule === r)) { bad++; console.log(`  ✗ rule ${r + 1} has no mutation`); }
  }
  console.log(bad ? `self-test FAILED: ${bad}` : `self-test passed: ${MUTATIONS.length}/${MUTATIONS.length} broken fights caught`);
  return bad ? 1 : 0;
}

if (process.argv.includes('--self-test')) process.exit(selfTest());

let failed = 0;
console.log(`check:fight: the fight as shipped (hitsToFall ${F.hitsToFall}, windupSec ${F.windupSec}, windupMinSec ${F.windupMinSec}, his reach ${F.reach} m, the warrior's ${W.reach} m)`);
for (const [name, rule] of RULES) {
  const fails = rule(stepSwordsman);
  if (fails.length) failed++;
  console.log(`  ${fails.length ? '✗' : '✓'} ${name}${fails.length ? `\n      ${fails.join('\n      ')}` : ''}`);
}
// the measured wind-up, for MEASUREMENTS "D-023 the fight"
{
  const d = duel(GUARD);
  for (let k = 0; k < 300; k++) tick(d, { x: -near(), z: 0 });
  const up = first(d, 'windup'), cut = first(d, 'cut', up);
  console.log(`  measured: wind-up to his cut ${sec(cut - up)}; noticed at tick ${first(d, 'notice')}, wind-up from tick ${up}`);
  // how many ticks he spends in each mode, counted from the log (the first unbroken run of each)
  const run = (dl: Duel, mode: string): number => {
    const at = dl.log.findIndex((l) => l.split(' ')[1] === mode);
    let n = 0;
    while (at >= 0 && dl.log[at + n]?.split(' ')[1] === mode) n++;
    return n;
  };
  const h = duel(GUARD);
  tick(h, { x: -near(), z: 0, press: true });
  for (let k = 0; k < 120; k++) tick(h, { x: -near(), z: 0 });
  console.log(`  measured: his modes, in ticks: wind-up ${run(d, 'windup')}, blade out ${run(d, 'slash')}, recovery ${run(d, 'recover')}, stagger ${run(h, 'stagger')}`);
  // the warrior's slash clock: tick 0 is the press
  let t: number | null = stepSlash(null, true, DT).time;
  const cutting: number[] = [];
  let ends = -1;
  for (let k = 1; k <= 60 && ends < 0; k++) {
    t = stepSlash(t, false, DT).time;
    if (slashCutting(t)) cutting.push(k);
    if (t === null) ends = k;
  }
  let again = -1;
  for (let k = 1; k <= 60 && again < 0; k++) {
    let u: number | null = stepSlash(null, true, DT).time;
    for (let j = 1; j < k; j++) u = stepSlash(u, false, DT).time;
    if (stepSlash(u, true, DT).started) again = k;
  }
  console.log(`  measured: the warrior's slash, in ticks after the press: cutting on ${cutting[0]} to ${cutting.at(-1)} (${cutting.length} ticks), over on ${ends}, a second press taken from ${again}`);
}
console.log(failed ? `CHECK-FIGHT FAIL (${failed} of ${RULES.length} rules)` : `CHECK-FIGHT PASS (${RULES.length} rules)`);
process.exit(failed ? 1 : 0);
