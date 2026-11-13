#!/usr/bin/env node
// check:teach — the teach prompts' rule (D-025), run under Node with no browser.
// Tests the REAL rule the game runs (src/systems/teach.ts) and the REAL lines it shows (src/ui/howto.ts), on
// levels/ itself: where the lines show is read from each level's critical_path and enemies, so this is also
// the check that a level which moves its first wall moves the line with it.
//
//   npm run check:teach      exit 0 every property holds · 1 a property failed
//   --self-test              break the rule four ways and show that this check then fails
//   --list                   print every place of every chapter (MEASUREMENTS "D-025 the teach prompts")

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GATE_DOOR_TAG, TEACH, Teach, nearestStretch, teachSpots, type TeachLevel, type TeachRules, type TeachShown, type TeachView, type V3 } from '../src/systems/teach.ts';
import { hasLine, lineText } from '../src/ui/howto.ts';
import { GATE } from '../src/systems/fight.ts';

// the linter is plain .mjs with no types: loaded by a path the typechecker does not follow, and typed here
const { MOVE, RESPAWN_RULES } = (await import('./lint-level.mjs' as string)) as { MOVE: { ground: { autostep: number } }; RESPAWN_RULES: { heightTolerance: number } };

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DT = 1 / 60;
// The rig's two timers the dash jump is told by, read from the player's own table (it imports three.js, so Node
// reads the text): src/main.ts hands the rule TUNING.coyoteTimeSec + TUNING.jumpBufferSec.
const PLAYER = readFileSync(join(ROOT, 'src/entities/player.ts'), 'utf8');
const tuning = (name: string): number => {
  const m = PLAYER.match(new RegExp(`\\b${name}:\\s*([0-9.]+)`));
  if (!m) throw new Error(`src/entities/player.ts has no TUNING.${name}`);
  return Number(m[1]);
};
const RULES: TeachRules = { dt: DT, heightTol: RESPAWN_RULES.heightTolerance, dashJumpSec: tuning('coyoteTimeSec') + tuning('jumpBufferSec') };

interface Level extends TeachLevel { id: string; chapter: number; title: string; moves_allowed: string[]; spawn: { pos: V3 }; checkpoints: { pos: V3 }[] }
const levels: Level[] = readdirSync(join(ROOT, 'levels'))
  .filter((f) => /^[0-9].*\.json$/.test(f))
  .map((f) => JSON.parse(readFileSync(join(ROOT, 'levels', f), 'utf8')) as Level)
  .filter((l) => l.chapter >= 1)
  .sort((a, b) => a.chapter - b.chapter);
const byChapter = (n: number): Level => levels.find((l) => l.chapter === n)!;
const pos = (w: TeachLevel['critical_path'][number]): V3 => (Array.isArray(w) ? w : w.pos);

/** A player as the rule sees one, driven by hand: put him somewhere in a state and tick. */
class Sim {
  readonly teach: Teach;
  private view: TeachView;
  constructor(level: Level, teach?: Teach) {
    this.teach = teach ?? new Teach(RULES);
    this.teach.setLevel(level);
    this.view = { feet: [...level.spawn.pos] as V3, grounded: true, pstate: 'idle', foes: (level.enemies ?? []).map((e) => ({ id: e.id, pos: e.pos, down: false })), fell: false, riding: null };
  }
  /** One tick with these changes to what the rule sees. */
  tick(change: Partial<TeachView> = {}, ticks = 1): TeachShown | null {
    let shown: TeachShown | null = null;
    for (let i = 0; i < ticks; i++) {
      this.view = { ...this.view, fell: false, ...change };
      shown = this.teach.afterTick(this.view);
    }
    return shown;
  }
  at(feet: V3, pstate = 'idle', grounded = true): TeachShown | null { return this.tick({ feet, pstate, grounded }); }
  seconds(s: number, change: Partial<TeachView> = {}): TeachShown | null { return this.tick(change, Math.round(s / DT)); }
  /** Leave the ground by a jump and come down where he stood: a miss that costs nothing. */
  hop(): TeachShown | null {
    const feet = this.view.feet;
    this.tick({ pstate: 'jump', grounded: false, feet: [feet[0], feet[1] + 1, feet[2]] });
    this.tick({ pstate: 'fall', grounded: false });
    return this.tick({ pstate: 'idle', grounded: true, feet });
  }
  fell(id: string): TeachShown | null {
    return this.tick({ fell: true, foes: this.view.foes.map((f) => (f.id === id ? { ...f, down: true } : f)) });
  }
  die(feet: V3, cut = false): void { this.teach.died(feet, cut, this.view.foes); }
  respawn(feet: V3): TeachShown | null { this.teach.moved(); return this.tick({ feet, pstate: 'fall', grounded: false }); }
  foesUp(): void { this.view = { ...this.view, foes: this.view.foes.map((f) => ({ ...f, down: false })) }; }
}

const line = (s: TeachShown | null): string => s?.line ?? 'none';

/** Every property, against whatever rule is loaded. Returns the failures. */
function run(): { checks: number; fails: string[] } {
  const fails: string[] = [];
  let checks = 0;
  const ok = (name: string, cond: boolean, detail = ''): void => {
    checks++;
    if (!cond) fails.push(`${name}${detail ? `: ${detail}` : ''}`);
  };

  // ---- the places come from the level files
  for (const l of levels) {
    const spots = teachSpots(l);
    const steps = l.critical_path.flatMap((w, i) => (i > 0 && !Array.isArray(w) && w.via && (w.via !== 'ground' || i === 1) ? [i] : []));
    ok(`${l.id}: a place for every step of the path that needs a move`, JSON.stringify(spots.filter((s) => s.step > 0).map((s) => s.step)) === JSON.stringify(steps), `${spots.filter((s) => s.step > 0).length} places for ${steps.length} steps`);
    ok(`${l.id}: each place is where its step is made from and lands`, spots.filter((s) => s.step > 0).every((s) => s.from === pos(l.critical_path[s.step - 1]!) && s.to === pos(l.critical_path[s.step]!)));
    ok(`${l.id}: a place for every swordsman`, spots.filter((s) => s.move === 'fight').length === (l.enemies ?? []).length);
    // POLISH-1 (B-99): the gate's line is only where a goal waits, at each of its doors; nowhere else is there a place more
    const doors = l.goal?.once_clear ? (l.geometry ?? []).filter((g) => g.tag === GATE.doorTag).length : 0;
    ok(`${l.id}: a gate place for each door of a goal that waits, and nothing else beyond the steps and the swordsmen`, spots.filter((s) => s.move === 'gate').length === doors && spots.length === steps.length + (l.enemies ?? []).length + doors, `${spots.filter((s) => s.move === 'gate').length} gate places for ${doors} doors; ${spots.length} places in all`);
    ok(`${l.id}: every move the chapter allows has a line`, l.moves_allowed.every(hasLine), l.moves_allowed.filter((m) => !hasLine(m)).join(', '));
    ok(`${l.id}: every place shows a line that exists`, spots.every((s) => hasLine(s.move)));
  }
  ok('the hang, the fight and the gate have lines', hasLine('hang') && hasLine('fight') && hasLine('gate'));
  ok('the gate\'s door is found by the tag the game opens (GATE.doorTag)', GATE_DOOR_TAG === GATE.doorTag, `${GATE_DOOR_TAG} vs ${GATE.doorTag}`);
  ok('chapters 1 to 4 have no gate place: their goals do not wait', levels.filter((l) => l.chapter <= 4).every((l) => !l.goal?.once_clear && teachSpots(l).every((s) => s.move !== 'gate')));
  const gateLine = lineText('gate');
  ok('the gate line: it opens when every swordsman is down, and the sword\'s control, read from the tables', /gate opens when every swordsman is down/i.test(gateLine) && /\{slash\}/.test(gateLine), gateLine);
  ok('a line that does not exist is not claimed', !hasLine('glide'));
  // the lines say what the brief asks of them (the words, not the keys: the keys are read from the binding tables)
  const climb = lineText('climb');
  ok('the ledge-grab line: jump at the wall, hold for full height, keep pushing in, catch the edge, press again to pull up',
    /jump at the wall/i.test(climb) && /hold \{jump\}/i.test(climb) && /full height/i.test(climb) && /pushing into the wall/i.test(climb) && /catch the edge/i.test(climb) && /press \{jump\} again to pull up/i.test(climb), climb);
  const fightLine = lineText('fight');
  ok('the fight line: the slash key, two cuts fell him, his cut sends you back', /\{slash\}/.test(fightLine) && /two cuts fell/i.test(fightLine) && /sends you back/i.test(fightLine), fightLine);
  ok('no line types a key in: every key is a {name} the binding tables fill', ['ground', 'jump', 'wall', 'double', 'climb', 'hang', 'platform', 'dash', 'dashjump', 'fight', 'gate'].every((m) => !/\b(Space|Shift|Enter|WASD|[JK]\b|Left click)/.test(lineText(m))));

  // ---- the numbers this rule shares with the rest of the game are the same numbers
  ok('TEACH.riseM is the measured autostep ceiling (lint-level MOVE.ground.autostep)', TEACH.riseM === MOVE.ground.autostep, `${TEACH.riseM} vs ${MOVE.ground.autostep}`);

  // ---- chapter 2's first face: the wall this was built for
  {
    const l = byChapter(2);
    const i = l.critical_path.findIndex((w) => !Array.isArray(w) && w.via === 'climb');
    const foot = pos(l.critical_path[i - 1]!), top = pos(l.critical_path[i]!);
    const wall: V3 = [foot[0] + 1.64, foot[1], foot[2]]; // where the feet stop against the face (MEASUREMENTS "D-025 the wall")
    const s = new Sim(l);
    ok('ch2: at the spawn the line is how to move', line(s.tick()) === 'ground', line(s.teach.current()));
    ok('ch2: it goes when he runs', line(s.at([1, 0, 0], 'run')) === 'none', line(s.teach.current()));
    ok('ch2: nothing while the face is far off', line(s.at([foot[0] - TEACH.approachM - 0.5, 0, 0], 'run')) === 'none', line(s.teach.current()));
    const near = s.at([foot[0] - TEACH.approachM + 0.5, 0, 0], 'run');
    ok('ch2: the ledge-grab line is up as he comes to the first face', line(near) === 'climb' && near?.spot === `step:${i}`, `${line(near)} at ${near?.spot}`);
    ok('ch2: it stays while he stands at the wall', line(s.seconds(8, { feet: wall, pstate: 'idle' })) === 'climb', line(s.teach.current()));
    ok('ch2: it stays through a jump that falls back (a tap)', line(s.hop()) === 'climb', line(s.teach.current()));
    ok('ch2: and through a slide down the wall', line(s.tick({ pstate: 'wall_slide', grounded: false })) === 'climb' && line(s.tick({ pstate: 'idle', grounded: true })) === 'climb', line(s.teach.current()));
    s.tick({ pstate: 'jump', grounded: false, feet: [wall[0], 2.3, wall[2]] });
    const caught = s.tick({ pstate: 'ledge_grab', grounded: false, feet: [wall[0], top[1] - 1.6, wall[2]] });
    ok('ch2: it goes when the ledge is caught, and the hang\'s line takes its place', line(caught) === 'hang' && s.teach.has('climb'), line(caught));
    ok('ch2: the hang\'s line stays while he hangs', line(s.seconds(3)) === 'hang', line(s.teach.current()));
    ok('ch2: it goes when he pulls up', line(s.tick({ pstate: 'ledge_climb' })) === 'none', line(s.teach.current()));
    const up = s.at([wall[0] + 0.6, top[1] + 0.05, wall[2]], 'idle');
    ok('ch2: nothing on top of the face', line(up) === 'none' && line(s.seconds(8)) === 'none', line(s.teach.current()));
    // back down: he has made the move, so no line at once...
    ok('ch2: back at the foot, the move made: no line at once', line(s.at(wall, 'idle')) === 'none', line(s.teach.current()));
    ok('ch2: one jump that falls back: still none', line(s.hop()) === 'none', line(s.teach.current()));
    ok(`ch2: ${TEACH.misses} that fall back: the line is back`, line(s.hop()) === 'climb', line(s.teach.current()));
    s.tick({ pstate: 'jump', grounded: false, feet: [wall[0], 2.3, wall[2]] });
    ok('ch2: back for a miss, it stays past the catch (the hang\'s line shows while hanging)', line(s.tick({ pstate: 'ledge_grab', grounded: false, feet: [wall[0], top[1] - 1.6, wall[2]] })) === 'hang', line(s.teach.current()));
    ok('ch2: and it is the ledge-grab line again if he drops', line(s.tick({ pstate: 'fall', grounded: false })) === 'climb' && line(s.tick({ pstate: 'idle', grounded: true, feet: wall })) === 'climb', line(s.teach.current()));
    s.tick({ pstate: 'ledge_grab', grounded: false, feet: [wall[0], top[1] - 1.6, wall[2]] });
    s.tick({ pstate: 'ledge_climb' });
    ok('ch2: up it at last: nothing, and the place forgets the misses', line(s.at([wall[0] + 0.6, top[1] + 0.05, wall[2]], 'idle')) === 'none' && line(s.at(wall, 'idle')) === 'none' && line(s.hop()) === 'none', line(s.teach.current()));
    // standing at it
    // (the seconds are the brief's "several", typed here and not read from the rule: a rule that waits four
    // times as long must fail this)
    const t = new Sim(l, s.teach);
    t.at(wall, 'idle');
    ok('ch2: standing at the foot 3 s, the move made: no line', line(t.seconds(3)) === 'none', line(t.teach.current()));
    ok('ch2: 6 s: the line is back', line(t.seconds(3)) === 'climb', line(t.teach.current()));
    ok('ch2: walking away takes it down', line(t.at([foot[0] - TEACH.approachM - 1, 0, 0], 'run')) === 'none', line(t.teach.current()));
    ok('ch2: coming back brings it up again', line(t.at(wall, 'idle')) === 'climb', line(t.teach.current()));
  }

  // ---- chapter 5 (D-026), chosen from the list: the first swordsman of the visit is one of the courtyard's three
  {
    const l = byChapter(5);
    const first = l.enemies![0]!;
    const s = new Sim(l);
    ok('ch5: at the spawn the line is how to move', line(s.tick()) === 'ground', line(s.teach.current()));
    ok('ch5: he runs: no line on the terrace, the three are far off', line(s.at([0.5, 0, 0], 'run')) === 'none', line(s.teach.current()));
    const near = s.at([15, 0, 0], 'run');
    ok('ch5: past the torii, the fight\'s line, for the nearest of the three', line(near) === 'fight' && near?.spot === `foe:${first.id}`, `${line(near)} at ${near?.spot}`);
    ok('ch5: it goes when the first of the three falls, with two still standing', line(s.fell(first.id)) === 'none' && s.teach.has('fight'), line(s.teach.current()));
    // POLISH-1 (B-99): the shut gate. Two still stand: he runs past them to the door
    const door = l.geometry!.find((g) => g.tag === GATE.doorTag)!;
    const gk = `gate:${l.geometry!.indexOf(door)}`;
    const foot: V3 = [door.pos[0] - 1.2, 0, door.pos[2]]; // stopped against the shut door
    ok('ch5: nothing while the gate is far off', line(s.at([door.pos[0] - TEACH.approachM - 0.5, 0, 0], 'run')) === 'none', line(s.teach.current()));
    const atGate = s.at([door.pos[0] - TEACH.approachM + 0.5, 0, 0], 'run');
    ok('ch5: two still standing, the gate\'s line is up as he comes to it', line(atGate) === 'gate' && atGate?.spot === gk, `${line(atGate)} at ${atGate?.spot}`);
    ok('ch5: it stays while he stands at the shut door', line(s.seconds(8, { feet: foot, pstate: 'idle' })) === 'gate', line(s.teach.current()));
    ok('ch5: and through a jump at it', line(s.hop()) === 'gate', line(s.teach.current()));
    ok('ch5: one more falls, one stands: it stays', line(s.fell(l.enemies![1]!.id)) === 'gate', line(s.teach.current()));
    ok('ch5: it goes when the last falls', line(s.fell(l.enemies![2]!.id)) === 'none' && line(s.seconds(3)) === 'none', line(s.teach.current()));
    ok('ch5: and on the far side of the gate, nothing', line(s.at([door.pos[0] + 1.5, 0, 0], 'run')) === 'none', line(s.teach.current()));
    // cut down at the gate: every swordsman stands again, and it is back the next time he comes to it
    s.die(foot, true);
    s.foesUp();
    s.respawn(l.checkpoints[0]?.pos ?? l.spawn.pos);
    ok('ch5: after a respawn, away from the gate: no gate line', line(s.teach.current()) !== 'gate', line(s.teach.current()));
    ok('ch5: all three up again, back at the gate: the line is back', line(s.at(foot, 'idle')) === 'gate', line(s.teach.current()));
    ok('ch5: walking away takes it down', line(s.at([door.pos[0] - TEACH.approachM - 1, 0, 0], 'run')) === 'none', line(s.teach.current()));
    // a first visit straight to the courtyard: a swordsman close by at the gate is the fight's line first
    const f = new Sim(l);
    f.at([0.5, 0, 0], 'run');
    const beside = f.tick({ feet: foot, pstate: 'idle', foes: l.enemies!.map((e, k) => ({ id: e.id, pos: k === 0 ? [foot[0] - 1.5, 0, foot[2]] : e.pos, down: false })) });
    ok('ch5: the sword never used, a swordsman beside him at the gate: the fight\'s line comes before the gate\'s', line(beside) === 'fight', line(beside));
  }

  // ---- chapter 1: walking, the first swordsman, the first jump, in that order
  {
    const l = byChapter(1);
    const guard = l.enemies![0]!;
    const s = new Sim(l);
    ok('ch1: at the spawn the line is how to move', line(s.tick()) === 'ground', line(s.teach.current()));
    ok('ch1: standing still for 20 s leaves it up and brings no other', line(s.seconds(20)) === 'ground', line(s.teach.current()));
    const run = s.at([0.5, 0, 0], 'run');
    ok('ch1: he runs: the fight\'s line, for the swordsman a few metres on', line(run) === 'fight' && run?.spot === `foe:${guard.id}`, `${line(run)} at ${run?.spot}`);
    ok('ch1: a jump on the way does not take the fight\'s line down', line(s.hop()) === 'fight', line(s.teach.current()));
    ok('ch1: it goes when he fells the swordsman', line(s.fell(guard.id)) === 'none' && s.teach.has('fight'), line(s.teach.current()));
    ok('ch1: no jump line: he has jumped in this visit already', line(s.at([3, 0, 0], 'run')) === 'none', line(s.teach.current()));
    // a second player who has not jumped
    const p = new Sim(l);
    p.at([0.5, 0, 0], 'run');
    const j = p.fell(guard.id);
    const jumpStep = l.critical_path.findIndex((w) => !Array.isArray(w) && w.via === 'jump');
    ok('ch1: the swordsman down, the jump\'s line for the first step up', line(j) === 'jump' && j?.spot === `step:${jumpStep}`, `${line(j)} at ${j?.spot}`);
    ok('ch1: it goes when he jumps', line(p.tick({ pstate: 'jump', grounded: false })) === 'none', line(p.teach.current()));
    // cut down twice at the same swordsman
    const c = new Sim(l, s.teach);
    c.at([guard.pos[0] - 2, 0, 0], 'run');
    ok('ch1: the fight learned, a swordsman on his feet shows no line', line(c.teach.current()) === 'none', line(c.teach.current()));
    c.die([guard.pos[0] - 1.5, 0, 0], true);
    ok('ch1: cut down once: no line on the way back', line(c.respawn(l.spawn.pos)) === 'none' && line(c.at([guard.pos[0] - 2, 0, 0], 'run')) === 'none', line(c.teach.current()));
    c.die([guard.pos[0] - 1.5, 0, 0], true);
    c.respawn(l.spawn.pos);
    ok(`ch1: cut down ${TEACH.misses} times by the same swordsman: the fight's line is back`, line(c.at([guard.pos[0] - 2, 0, 0], 'run')) === 'fight', line(c.teach.current()));
    ok('ch1: and it goes when he is felled', line(c.fell(guard.id)) === 'none', line(c.teach.current()));
    // a fall into a gap, twice
    const gap = l.critical_path.findIndex((w, i) => i > jumpStep && !Array.isArray(w) && w.via === 'jump' && pos(w)[1] === pos(l.critical_path[i - 1]!)[1]);
    const a = pos(l.critical_path[gap - 1]!), b = pos(l.critical_path[gap]!);
    const mid: V3 = [(a[0] + b[0]) / 2, a[1] - 6, (a[2] + b[2]) / 2];
    const g = new Sim(l, s.teach);
    g.at([a[0] - 1, a[1], a[2]], 'run');
    ok('ch1: at a gap, the jump made before: no line', line(g.teach.current()) === 'none', line(g.teach.current()));
    g.die(mid);
    g.respawn(l.spawn.pos);
    ok('ch1: fell in once: no line', line(g.at([a[0] - 1, a[1], a[2]], 'run')) === 'none', line(g.teach.current()));
    g.die(mid);
    g.respawn(l.spawn.pos);
    const back = g.at([a[0] - 1, a[1], a[2]], 'run');
    ok(`ch1: fell in ${TEACH.misses} times at the same gap: the jump's line is back, at that gap`, line(back) === 'jump' && back?.spot === `step:${gap}`, `${line(back)} at ${back?.spot}`);
    ok('ch1: it stays while he jumps', line(g.tick({ pstate: 'jump', grounded: false })) === 'jump', line(g.teach.current()));
    ok('ch1: and goes once he is across', line(g.at([b[0] + 0.5, b[1], b[2]], 'run')) === 'none', line(g.teach.current()));
    // a death somewhere else is not a miss at the gap
    const e = new Sim(l, new Teach(RULES));
    for (const m of ['run', 'jump'] as const) e.tick({ pstate: m, grounded: m === 'run' });
    e.die([a[0] - 8, a[1], a[2]]);
    e.die([a[0] - 8, a[1], a[2]]);
    e.respawn(l.spawn.pos);
    ok('ch1: two falls that were not at the gap bring no line to it', line(e.at([a[0] - 1, a[1], a[2]], 'run')) === 'none', line(e.teach.current()));
  }

  // ---- the moves made stay made across chapters, in one visit; a new visit starts with none
  {
    const t = new Teach(RULES);
    const one = new Sim(byChapter(1), t);
    one.at([0.5, 0, 0], 'run');
    one.tick({ pstate: 'jump', grounded: false });
    const two = new Sim(byChapter(2), t);
    ok('ch1 then ch2: no walking line at chapter 2\'s spawn (he has run in this visit)', line(two.tick()) === 'none', line(two.teach.current()));
    const fresh = new Sim(byChapter(2));
    ok('a new visit: the walking line again', line(fresh.tick()) === 'ground', line(fresh.teach.current()));
  }

  // ---- every move's line shows at the first step of its chapter that needs it, and goes when the move is made
  const MADE: Record<string, Partial<TeachView>[]> = {
    jump: [{ pstate: 'jump', grounded: false }],
    double: [{ pstate: 'jump', grounded: false }, { pstate: 'double_jump', grounded: false }],
    wall: [{ pstate: 'jump', grounded: false }, { pstate: 'wall_jump', grounded: false }],
    climb: [{ pstate: 'jump', grounded: false }, { pstate: 'ledge_grab', grounded: false }, { pstate: 'ledge_climb', grounded: false }],
    dash: [{ pstate: 'dash' }],
    dashjump: [{ pstate: 'dash' }, { pstate: 'run' }, { pstate: 'jump', grounded: false }],
  };
  for (const l of levels) {
    const firsts = new Map<string, number>();
    l.critical_path.forEach((w, i) => { if (i > 0 && !Array.isArray(w) && w.via && w.via !== 'ground' && !firsts.has(w.via)) firsts.set(w.via, i); });
    for (const [via, i] of firsts) {
      const s = new Sim(l);
      s.at([0.5, 0, 0], 'run');
      for (const f of l.enemies ?? []) s.fell(f.id); // the swordsmen are not this check's
      const from = pos(l.critical_path[i - 1]!);
      const there = s.at(from, 'idle');
      ok(`${l.id}: the ${via} line is up at step ${i}, the first that needs it`, line(there) === via && there?.spot === `step:${i}`, `${line(there)} at ${there?.spot}`);
      if (via === 'platform') {
        const id = (l.critical_path[i] as { platform?: string }).platform ?? null;
        ok(`${l.id}: the platform line goes when he stands on the stone`, line(s.tick({ riding: id })) === 'none', line(s.teach.current()));
        continue;
      }
      let last: TeachShown | null = there;
      for (const step of MADE[via] ?? []) last = s.tick(step);
      ok(`${l.id}: the ${via} line goes when the move is made`, line(last) === 'none', line(last));
    }
  }
  // a dash and a jump far apart are not a dash jump
  {
    const l = byChapter(4);
    const i = l.critical_path.findIndex((w) => !Array.isArray(w) && w.via === 'dashjump');
    const s = new Sim(l);
    s.at([0.5, 0, 0], 'run');
    for (const f of l.enemies ?? []) s.fell(f.id);
    s.at(pos(l.critical_path[i - 1]!), 'idle');
    s.tick({ pstate: 'dash' });
    s.seconds(1, { pstate: 'run' });
    ok('ch4: a dash, then a jump a second later, is not the dash jump', line(s.tick({ pstate: 'jump', grounded: false })) === 'dashjump', line(s.teach.current()));
    // as the rig makes it there: the dash carries him off the lip, so the jump as it ends is the air jump
    const air = new Sim(l);
    air.at([0.5, 0, 0], 'run');
    for (const f of l.enemies ?? []) air.fell(f.id);
    air.at(pos(l.critical_path[i - 1]!), 'run');
    air.tick({ pstate: 'dash' });
    air.tick({ pstate: 'fall', grounded: false });
    ok('ch4: a dash off the lip, then the air jump as it ends, is the dash jump', line(air.tick({ pstate: 'double_jump', grounded: false })) === 'none' && air.teach.has('dashjump'), line(air.teach.current()));
  }

  // ---- where he is on the path
  {
    const l = byChapter(2);
    const path = l.critical_path.map(pos);
    ok('nearestStretch: at the spawn, the first', nearestStretch(path, path[0]!) === 0);
    ok('nearestStretch: at a waypoint, the stretch that leaves it', nearestStretch(path, path[3]!) === 3, String(nearestStretch(path, path[3]!)));
    ok('nearestStretch: at the goal, the last', nearestStretch(path, path[path.length - 1]!) === path.length - 2);
  }
  return { checks, fails };
}

if (process.argv.includes('--list')) {
  for (const l of levels) {
    console.log(`\n${l.id}  (chapter ${l.chapter}, ${l.title})`);
    for (const s of teachSpots(l)) console.log(`  ${s.key.padEnd(18)} ${s.move.padEnd(9)} from (${s.from.join(', ')})${s.step > 0 ? ` to (${s.to.join(', ')})` : ''}`);
  }
  process.exit(0);
}

if (process.argv.includes('--self-test')) {
  // Each mutation breaks the rule one way; the check must then fail. A mutation that passes means a property is missing.
  const real = { approachM: TEACH.approachM, lingerSec: TEACH.lingerSec, misses: TEACH.misses, riseM: TEACH.riseM };
  const mutations: [string, () => void][] = [
    ['the line never comes up (approach 0 m)', () => { TEACH.approachM = 0; }],
    ['the line comes back at the first miss', () => { TEACH.misses = 1; }],
    ['the line comes back for standing four times too late', () => { TEACH.lingerSec *= 4; }],
    ['standing on top of a face still counts as at its foot (rise 99 m)', () => { TEACH.riseM = 99; }],
    ['the courtyard\'s goal does not wait: no gate line (POLISH-1)', () => { delete byChapter(5).goal!.once_clear; }],
    ['chapter 1\'s goal waits at a door: a gate line where none was', () => { const l = byChapter(1); l.goal = { ...l.goal, once_clear: true }; l.geometry = [...(l.geometry ?? []), { pos: [90, 2.4, 0], scale: [1, 4.8, 4], tag: GATE.doorTag }]; }],
  ];
  const keep = levels.map((l) => ({ l, goal: l.goal, geometry: l.geometry }));
  let bad = 0;
  for (const [name, mutate] of mutations) {
    for (const k of keep) { k.l.goal = k.goal && { ...k.goal }; k.l.geometry = k.geometry; }
    mutate();
    const r = run();
    Object.assign(TEACH, real);
    for (const k of keep) { k.l.goal = k.goal; k.l.geometry = k.geometry; }
    console.log(`  ${r.fails.length ? 'caught' : 'MISSED'}  ${name}${r.fails.length ? `  (${r.fails.length} properties fail, first: ${r.fails[0]!.slice(0, 90)})` : ''}`);
    if (!r.fails.length) bad++;
  }
  const clean = run();
  if (clean.fails.length) { console.log(`  the unmutated rule FAILS: ${clean.fails[0]}`); bad++; }
  console.log(bad ? `TEACH SELF-TEST FAIL  ${bad}` : `TEACH SELF-TEST PASS  ${mutations.length}/${mutations.length} mutations caught`);
  process.exit(bad ? 1 : 0);
}

const r = run();
if (r.fails.length) {
  for (const f of r.fails) console.log(`FAIL  ${f}`);
  console.log(`TEACH FAIL  ${r.fails.length}/${r.checks}`);
  process.exit(1);
}
console.log(`TEACH PASS  ${r.checks}/${r.checks}  (${levels.length} chapters, ${levels.reduce((n, l) => n + teachSpots(l).length, 0)} places)`);
