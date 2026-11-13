// fight — the four rules of the fight the brief names (D-023), proven in the REAL game: the built bundle, the
// real input path, the real death and respawn. check:fight (tools/check-fight.ts) proves the same rules on the
// pure state machine under Node; this stage proves the wiring round it (src/main.ts, src/entities/player.ts).
//
// Runs tools/harness/fixtures/swordsman.json (one swordsman on a flat pad, one torii between him and the
// spawn) through the same validation and build path as a level in levels/. One bot plays one attempt, by
// input frames only:
//
//   A  it walks through the torii and up to him, and stands there. He winds up and cuts.
//        2. his slash sends the warrior to the checkpoint: a death, then the respawn AT THE TORII (not the
//           spawn), with him back on his post and unhurt
//        4. the wind-up, measured in ticks from the first tick he is seen winding up to the tick the warrior
//           dies, is never under windupMinSec: as shipped, and again with windupSec set far below it
//   B  it walks up again and presses the sword once, then once more.
//        1. after ONE slash he has taken one hit and is on his feet; after the second he is down, stays down
//           while the attempt lasts, and is back on his post when the warrior next respawns (it steps off the pad)
//   C  the recorded input of that whole attempt is played back in two fresh pages.
//        3. every tick of both replays is identical to the live run and to each other: the warrior, the
//           swordsman, the deaths, the checkpoints
//
//   D  (D-026) on tools/harness/fixtures/clear-goal.json: one swordsman, a door across the path, the goal behind
//      it. The bot walks round the door and stands ON the goal with him standing; pushes at the shut door; fells
//      him and watches the gate swing; steps off the pad, so a respawn stands him up; fells him again and walks
//      to the goal THROUGH the gateway.
//        5. arriving does not count while a swordsman stands, and counts once every one is down; the gate is
//           shut until then, stands open GATE.openSec after the last falls, and is shut again by a respawn
//
// Then each rule is run against a fight broken in the way the rule exists to catch (the harness exposes the
// live table; rule 5 is run on the same fixture with `once_clear` taken out), and must FAIL: a stage that only
// ever passes proves nothing. MEASUREMENTS "D-023 the checks", "D-026 the checks".
// Fixture, not a level: it is not nav-tested and not in levels/.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { EnvironmentError, FIXED_HZ, Stage, diagnose, guard, hdist, VIEWPORT, type Ctx, type Foe, type InputFrame, type StageResult, type Vec3 } from './lib.ts';
import { launchBrowser } from './preflight.ts';
import { NAV_CONFIG } from './nav.ts';
import { GATE } from '../../src/systems/fight.ts';

const FIXTURE = 'tools/harness/fixtures/swordsman.json';
const GATE_FIXTURE = 'tools/harness/fixtures/clear-goal.json';

export const FIGHT_STAGE = {
  standShare: 0.8,       // of the nearer of the two reaches: where the bot stops to be cut
  holdTicks: 300,        // 5 s: how long a fallen swordsman is watched staying down
  waitTicks: 900,        // 15 s: the longest any one wait may take before the scenario is called failed
  lowWindupSec: 0.05,    // windupSec set far under the minimum: the wind-up must not follow it down
  // D: the goal that waits (D-026)
  gateLane: 1.5,         // m beyond the door's end: the lane the bot walks round it in, out of his sight
  gateStandTicks: 60,    // 1 s: how long it stands on the goal with him standing
  gatePushTicks: 90,     // 1.5 s: how long it pushes at the shut door
  // the broken fights each rule must fail on
  broken: { hitsToFall: 1, reach: 0.1, closeSpeedTimes: 1.01, windupMinSec: 0.1 },
};

interface Attempt {
  ok: boolean;
  /** why the scenario stopped early, if it did */
  stopped: string | null;
  log: string[];
  frames: InputFrame[];
  /** A: the tick he was first seen winding up before the cut, and the tick the warrior died */
  windupTick: number | null;
  deathTick: number | null;
  afterCut: { feet: Vec3; checkpoints: number[]; deaths: number; foe: Foe } | null;
  /** B */
  afterOne: Foe | null;
  afterTwo: Foe | null;
  afterHold: { foe: Foe; deaths: number; state: string } | null;
  afterFall: { foe: Foe; deaths: number } | null;
  /** B-78: what the page shows the player (document.body.innerText) at his cut, and at the fall in B */
  hudAtCut: string | null;
  hudAtFall: string | null;
}

/** One attempt, driven in the page a tick at a time through the public input path. onlyCut: stop after A. */
function attempt(page: Page, a: { stand: number; press: number; hold: number; wait: number; onlyCut: boolean }): Promise<Attempt> {
  return page.evaluate((a) => {
    const H = window.__HARNESS__!;
    const N: InputFrame = { x: 0, y: 0, jump: false, dash: false, sprint: false, slash: false };
    const out: Attempt = { ok: false, stopped: null, log: [], frames: [], windupTick: null, deathTick: null, afterCut: null, afterOne: null, afterTwo: null, afterHold: null, afterFall: null, hudAtCut: null, hudAtFall: null };
    H.setInput(null);
    let s = H.snapshot();
    const t0 = s.tick;
    let was = s.enemies[0]!.mode, lastWindup: number | null = null;
    const step = (f: InputFrame): void => {
      s = H.step(f, false);
      const mode = s.enemies[0]!.mode;
      if (mode === 'windup' && was !== 'windup') lastWindup = s.tick - t0;
      was = mode;
      out.log.push(JSON.stringify([s.tick - t0, s.state, s.feet, s.deaths, s.checkpoints, s.slash, s.slashes, s.enemies]));
    };
    const foe = (): Foe => s.enemies[0]!;
    const dist = (): number => Math.hypot(s.feet[0] - foe().pos[0], s.feet[2] - foe().pos[2]);
    const toward = (): InputFrame => {
      const dx = foe().pos[0] - s.feet[0], dz = foe().pos[2] - s.feet[2], l = Math.hypot(dx, dz) || 1;
      return { ...N, x: dx / l, y: dz / l };
    };
    const until = (cond: () => boolean, frame: () => InputFrame): boolean => {
      for (let n = 0; !cond() && n < a.wait; n++) step(frame());
      return cond();
    };
    const done = (why: string | null): Attempt => {
      out.stopped = why;
      out.ok = why === null;
      out.frames = H.record();
      return out;
    };

    // --- A: up to him, and stand ---
    if (!until(() => dist() <= a.stand, toward)) return done('A: never got near him');
    if (!until(() => s.state === 'death', () => N)) return done('A: stood in front of him and was never cut');
    out.windupTick = lastWindup;
    out.deathTick = s.tick - t0;
    out.hudAtCut = document.body.innerText.trim();
    if (!until(() => s.state === 'play', () => N)) return done('A: never respawned');
    out.afterCut = { feet: s.feet, checkpoints: s.checkpoints, deaths: s.deaths, foe: foe() };
    if (a.onlyCut) return done(null);

    // --- B: one slash, then one more ---
    if (!until(() => dist() <= a.press, toward)) return done('B: never got near him again');
    step({ ...N, slash: true });
    if (!until(() => s.slash === null, () => N)) return done('B: the first slash never ended');
    out.afterOne = foe();
    step({ ...N, slash: true });
    if (!until(() => s.slash === null, () => N)) return done('B: the second slash never ended');
    out.afterTwo = foe();
    for (let n = 0; n < a.hold; n++) step(N);
    out.afterHold = { foe: foe(), deaths: s.deaths, state: s.state };
    // off the side of the pad: a fall, a respawn, and he is back
    const deaths = s.deaths;
    if (!until(() => s.deaths > deaths, () => ({ ...N, y: 1 }))) return done('B: never fell off the pad');
    out.hudAtFall = document.body.innerText.trim();
    if (!until(() => s.state === 'play', () => N)) return done('B: never respawned after the fall');
    out.afterFall = { foe: foe(), deaths: s.deaths };
    return done(null);
  }, a);
}

/** D: what the bot saw of a goal that waits (D-026). */
interface GateRun {
  stopped: string | null;
  /** standing on the goal with him standing, after standTicks there */
  atGoal: { state: string; gate: number | null; standing: number; fromGoal: number } | null;
  /** how far toward the gateway (x) it got pushing at the shut door */
  pushedTo: number | null;
  fellTick: number | null;
  openTick: number | null;
  rose: boolean;
  afterRespawn: { gate: number | null; foe: Foe; deaths: number } | null;
  /** the second time: the state it ended in, and how near the middle of the gateway (|z|) it crossed the door's x */
  through: { state: string; crossedAtZ: number | null } | null;
}

function gateAttempt(page: Page, a: { goal: Vec3; doorX: number; lane: number; press: number; wait: number; standTicks: number; pushTicks: number }): Promise<GateRun> {
  return page.evaluate((a) => {
    const H = window.__HARNESS__!;
    const N: InputFrame = { x: 0, y: 0, jump: false, dash: false, sprint: false, slash: false };
    const out: GateRun = { stopped: null, atGoal: null, pushedTo: null, fellTick: null, openTick: null, rose: true, afterRespawn: null, through: null };
    H.setInput(null);
    let s = H.snapshot();
    const step = (f: InputFrame): void => { s = H.step(f, false); };
    const foe = (): Foe => s.enemies[0]!;
    const to = (x: number, z: number): InputFrame => {
      const dx = x - s.feet[0], dz = z - s.feet[2], l = Math.hypot(dx, dz) || 1;
      return { ...N, x: dx / l, y: dz / l };
    };
    const far = (x: number, z: number): number => Math.hypot(x - s.feet[0], z - s.feet[2]);
    const until = (cond: () => boolean, frame: () => InputFrame): boolean => {
      for (let n = 0; !cond() && n < a.wait; n++) step(frame());
      return cond();
    };
    const goTo = (x: number, z: number): boolean => until(() => far(x, z) <= 0.3 || s.state !== 'play', () => to(x, z)) && s.state === 'play';
    const done = (why: string | null): GateRun => { out.stopped = why; return out; };
    const fell = (): string | null => {
      if (!until(() => far(foe().pos[0], foe().pos[2]) <= a.press, () => to(foe().pos[0], foe().pos[2]))) return 'never got near him';
      for (let k = 0; k < 4 && foe().mode !== 'fallen'; k++) {
        step({ ...N, slash: true });
        if (!until(() => s.slash === null || foe().mode === 'fallen', () => N)) return 'a slash never ended';
        // he reels back out of reach on a hit that does not fell him: close again
        if (foe().mode !== 'fallen' && !until(() => far(foe().pos[0], foe().pos[2]) <= a.press, () => to(foe().pos[0], foe().pos[2]))) return 'never got near him again';
      }
      return foe().mode === 'fallen' ? null : 'he did not fall';
    };

    // --- round the door, out of his sight, and onto the goal while he stands ---
    const [gx, , gz] = a.goal;
    if (!goTo(s.feet[0] + 4, a.lane) || !goTo(gx, a.lane)) return done(`never got round the door: state ${s.state} at (${s.feet.map((v) => v.toFixed(2)).join(', ')})`);
    until(() => far(gx, gz) <= 0.3 || s.state !== 'play', () => to(gx, gz));
    for (let n = 0; n < a.standTicks && s.state === 'play'; n++) step(N);
    out.atGoal = { state: s.state, gate: s.gate, standing: s.enemies.filter((e) => e.mode !== 'fallen').length, fromGoal: far(gx, gz) };
    if (s.state !== 'play') return done('the arrival counted with him standing');
    // --- at the shut door, from the goal's side ---
    for (let n = 0; n < a.pushTicks; n++) step({ ...N, x: -1 });
    out.pushedTo = s.feet[0];
    // --- back round, fell him, watch the gate ---
    if (!goTo(gx, a.lane) || !goTo(a.doorX - 4, a.lane)) return done('never got back round the door');
    let why = fell();
    if (why) return done(`first time: ${why}`);
    out.fellTick = s.tick;
    let last = s.gate ?? 0;
    for (let n = 0; n < a.wait && s.gate !== 1; n++) { step(N); if ((s.gate ?? 0) < last) out.rose = false; last = s.gate ?? 0; }
    if (s.gate !== 1) return done(`the gate never stood open: ${s.gate}`);
    out.openTick = s.tick;
    // --- off the side of the pad: a respawn stands him up ---
    const deaths = s.deaths;
    if (!until(() => s.deaths > deaths, () => ({ ...N, y: 1 }))) return done('never fell off the pad');
    if (!until(() => s.state === 'play', () => N)) return done('never respawned');
    out.afterRespawn = { gate: s.gate, foe: foe(), deaths: s.deaths };
    // --- fell him again, and through the gateway to the goal ---
    why = fell();
    if (why) return done(`second time: ${why}`);
    if (!until(() => s.gate === 1, () => N)) return done('the gate never stood open the second time');
    if (!goTo(a.doorX - 3, gz)) return done('never got in front of the gateway');
    let crossedAtZ: number | null = null;
    for (let n = 0; n < a.wait && s.state === 'play'; n++) {
      const before = s.feet[0];
      step(to(gx, gz));
      if (before < a.doorX && s.feet[0] >= a.doorX) crossedAtZ = Math.abs(s.feet[2] - gz);
    }
    out.through = { state: s.state, crossedAtZ };
    return done(null);
  }, a);
}

/** Play `frames` back in the page for `ticks` ticks and return the same log an attempt writes. */
function replayOf(page: Page, frames: InputFrame[], ticks: number): Promise<string[]> {
  return page.evaluate(([fr, n]) => {
    const H = window.__HARNESS__!;
    H.setInput(null);
    H.playback(fr);
    const log: string[] = [];
    const t0 = H.snapshot().tick;
    for (let k = 0; k < n; k++) {
      const s = H.advance(1, 0);
      log.push(JSON.stringify([s.tick - t0, s.state, s.feet, s.deaths, s.checkpoints, s.slash, s.slashes, s.enemies]));
    }
    return log;
  }, [frames, ticks] as const);
}

export async function fight(ctx: Omit<Ctx, 'levelId' | 'level' | 'segments'>): Promise<StageResult> {
  const st = new Stage('fight');
  return guard(st, async () => {
    const C = FIGHT_STAGE;
    const text = readFileSync(join(ctx.root, FIXTURE), 'utf8');
    const fx = JSON.parse(text) as { spawn: { pos: Vec3 }; checkpoints: { pos: Vec3 }[]; enemies: { pos: Vec3 }[] };
    const torii = fx.checkpoints[0]!.pos, post = fx.enemies[0]!.pos;
    const errors: string[] = [];
    /**
     * A fresh page with the fixture running; `set` and `times` change the swordsman's live table before anything
     * is stepped. Every page gets a freshly launched Chromium, closed with it (shut): on Linux CI the second page
     * opened in one browser never loaded (run 42958599423: page.goto timed out after the first attempt had passed).
     * run.mjs gives every stage its own browser for the same reason, SwiftShader's GPU process wedging; this stage
     * is seven short stages in a row, so it does the same. ctx.browser is not used.
     */
    const browsers: import('@playwright/test').Browser[] = [];
    const shut = async (page: Page): Promise<void> => { await page.context().browser()?.close().catch(() => {}); };
    const open = async (set: Record<string, number> = {}, times: Record<string, number> = {}, json: string = text): Promise<Page> => {
      const browser = await launchBrowser();
      browsers.push(browser);
      const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
      try {
        await page.goto(`${ctx.baseUrl}/?harness=1&level=00-gym`);
        await page.waitForFunction(() => window.__HARNESS__?.version === 'HARNESS_API_V1', null, { timeout: 20000 });
      } catch (err) {
        // the page never came up: nothing about the fight was observed. Environment, with evidence (as openGame)
        const why = (err instanceof Error ? err.message : String(err)).split('\n')[0];
        throw new EnvironmentError(`fixture page ${browsers.length} did not load: ${why} | ${await diagnose({ ...ctx, browser } as Ctx)}`);
      }
      const started = await page.evaluate((t) => window.__HARNESS__!.startJson(t), json);
      if (!started.ok) throw new Error(`fixture did not load: ${started.error ?? 'unknown'}`);
      await page.evaluate(([set, times]) => {
        const t = window.__HARNESS__!.fight.swordsman;
        for (const [k, v] of Object.entries(set)) t[k] = v;
        for (const [k, v] of Object.entries(times)) t[k] = t[k]! * v;
      }, [set, times] as const);
      return page;
    };
    const live = await open();
    const shipped = await live.evaluate(() => ({ F: { ...window.__HARNESS__!.fight.swordsman }, W: { ...window.__HARNESS__!.fight.warrior }, windup: window.__HARNESS__!.windupSec() }));
    const F = shipped.F, W = shipped.W;
    const args = (onlyCut: boolean) => ({ stand: Math.min(W['reach']!, F['engageRange']!) * C.standShare, press: W['reach']! * NAV_CONFIG.slashShare, hold: C.holdTicks, wait: C.waitTicks, onlyCut });
    const floorTicks = Math.ceil(F['windupMinSec']! * FIXED_HZ - 1e-9);
    const secs = (ticks: number): string => `${(ticks / FIXED_HZ).toFixed(3)} s (${ticks} ticks)`;
    const onPost = (f: Foe): boolean => f.hits === 0 && f.mode === 'guard' && f.pos[0] === post[0] && f.pos[2] === post[2];

    // the four rules as functions of an attempt, so the same test is put to the broken fights below
    const cutSendsBack = (r: Attempt): string | null => {
      if (!r.afterCut) return r.stopped ?? 'no cut';
      const c = r.afterCut;
      if (c.deaths !== 1) return `deaths ${c.deaths}, not 1`;
      if (hdist(c.feet, torii) > 0.5 || hdist(c.feet, fx.spawn.pos) < 1) return `respawned at (${c.feet.map((v) => v.toFixed(2)).join(', ')}), not at the torii (${torii.join(', ')})`;
      if (c.checkpoints.join() !== '0') return `checkpoints [${c.checkpoints.join(',')}], not [0]`;
      if (!onPost(c.foe)) return `the swordsman was not put back on his post: ${JSON.stringify(c.foe)}`;
      return null;
    };
    const windupHolds = (r: Attempt): string | null => {
      if (r.windupTick === null || r.deathTick === null) return r.stopped ?? 'no wind-up was seen before the cut';
      const ticks = r.deathTick - r.windupTick;
      return ticks >= floorTicks ? null : `he cut ${secs(ticks)} after the wind-up began, under the ${F['windupMinSec']} s minimum`;
    };
    const twoHits = (r: Attempt): string | null => {
      if (!r.afterOne || !r.afterTwo || !r.afterHold || !r.afterFall) return r.stopped ?? 'the attempt did not get that far';
      if (r.afterOne.hits !== 1 || r.afterOne.mode === 'fallen') return `after ONE slash: hits ${r.afterOne.hits}, mode ${r.afterOne.mode} (he must be hit once and on his feet)`;
      if (r.afterTwo.hits !== 2 || r.afterTwo.mode !== 'fallen') return `after TWO slashes: hits ${r.afterTwo.hits}, mode ${r.afterTwo.mode} (he must be down)`;
      if (r.afterHold.foe.mode !== 'fallen' || r.afterHold.deaths !== 1 || r.afterHold.state !== 'play') return `he did not stay down: ${r.afterHold.foe.mode}, deaths ${r.afterHold.deaths}, state ${r.afterHold.state}`;
      if (!onPost(r.afterFall.foe) || r.afterFall.deaths !== 2) return `after the warrior's respawn he is not back on his post: ${JSON.stringify(r.afterFall.foe)}`;
      return null;
    };
    const sameLog = (a: string[], b: string[]): string | null => {
      if (a.length !== b.length) return `${a.length} ticks vs ${b.length}`;
      const at = a.findIndex((line, i) => line !== b[i]);
      return at < 0 ? null : `differs from tick ${at + 1}: ${a[at]!.slice(0, 140)} vs ${b[at]!.slice(0, 140)}`;
    };

    try {
      // ---------- the fight as shipped ----------
      const run = await attempt(live, args(false));
      await shut(live);
      if (!st.check('the attempt was played to its end', run.ok, run.stopped ?? `${run.log.length} ticks, ${run.frames.length} input frames`)) return;
      const cutTicks = run.deathTick! - run.windupTick!;
      st.check('2. his slash sends the warrior to the checkpoint', cutSendsBack(run) === null,
        cutSendsBack(run) ?? `cut at tick ${run.deathTick}; respawned at the torii (${run.afterCut!.feet.map((v) => v.toFixed(2)).join(', ')}), not the spawn; he is back on his post, unhurt`);
      // B-78: the HUD's one word names what ended the attempt. Each is read off the page on the tick of that death.
      const shown = (t: string | null): string => (t ?? '').split('\n').map((l) => l.trim()).filter(Boolean).join(' / ');
      st.check('the HUD says he was cut down at his cut, and that he fell at a fall (B-78)',
        shown(run.hudAtCut) === 'cut down' && shown(run.hudAtFall) === 'fell',
        `at his cut: "${shown(run.hudAtCut)}"; off the side of the pad: "${shown(run.hudAtFall)}"`);
      st.check('4. the wind-up is never shorter than the configured minimum (as shipped)', windupHolds(run) === null,
        windupHolds(run) ?? `${secs(cutTicks)} from the wind-up to the cut; minimum ${F['windupMinSec']} s (${floorTicks} ticks); windupSec ${F['windupSec']}`);
      st.check('1. a swordsman falls to two hits and not one', twoHits(run) === null,
        twoHits(run) ?? `one slash: ${run.afterOne!.hits} hit, ${run.afterOne!.mode}; two: ${run.afterTwo!.mode}; still down ${(C.holdTicks / FIXED_HZ).toFixed(0)} s later; on his post again after the warrior's respawn`);

      const pageA = await open(), logA = await replayOf(pageA, run.frames, run.log.length);
      await shut(pageA);
      const pageB = await open(), logB = await replayOf(pageB, run.frames, run.log.length);
      await shut(pageB);
      const d1 = sameLog(run.log, logA), d2 = sameLog(logA, logB);
      st.check('3. a replay of the fight is identical to the live run', d1 === null, d1 ?? `${run.log.length} ticks: the warrior, the swordsman, both deaths and the checkpoint, bit for bit`);
      st.check('3. a replay of the fight is identical run to run', d2 === null, d2 ?? `${logA.length} ticks, two fresh pages`);

      // the wind-up with the table asking for far less than the minimum
      const low = await open({ windupSec: C.lowWindupSec });
      const lowRun = await attempt(low, args(true));
      const lowAsk = await low.evaluate(() => window.__HARNESS__!.fight.swordsman['windupSec']);
      await shut(low);
      st.check(`4. the wind-up is never shorter than the minimum (windupSec set to ${C.lowWindupSec})`, lowAsk === C.lowWindupSec && windupHolds(lowRun) === null,
        windupHolds(lowRun) ?? `${secs(lowRun.deathTick! - lowRun.windupTick!)} from the wind-up to the cut with the table asking for ${lowAsk} s`);

      // ---------- each rule against a broken fight: it must fail ----------
      const B = C.broken;
      const one = await open({ hitsToFall: B.hitsToFall });
      const oneRun = await attempt(one, args(false));
      await shut(one);
      st.check(`seen to fail: rule 1 with hitsToFall ${B.hitsToFall}`, twoHits(oneRun) !== null, twoHits(oneRun) ?? 'PASSED: the rule does not catch a swordsman who falls to one hit');

      const blunt = await open({ reach: B.reach });
      const bluntRun = await attempt(blunt, { ...args(true), wait: C.holdTicks });
      await shut(blunt);
      st.check(`seen to fail: rule 2 with his reach ${B.reach} m`, cutSendsBack(bluntRun) !== null, cutSendsBack(bluntRun) ?? 'PASSED: the rule does not catch a blade that reaches nothing');

      const drift = await open({}, { closeSpeed: B.closeSpeedTimes });
      const driftLog = await replayOf(drift, run.frames, run.log.length);
      await shut(drift);
      st.check(`seen to fail: rule 3 with his closing speed x${B.closeSpeedTimes}`, sameLog(run.log, driftLog) !== null, sameLog(run.log, driftLog) ?? 'PASSED: the rule does not catch a fight that changed');

      const quick = await open({ windupMinSec: B.windupMinSec, windupSec: B.windupMinSec });
      const quickRun = await attempt(quick, args(true));
      await shut(quick);
      st.check(`seen to fail: rule 4 with the wind-up run at ${B.windupMinSec} s`, windupHolds(quickRun) !== null, windupHolds(quickRun) ?? 'PASSED: the rule does not measure the wind-up');

      // ---------- D: the goal that waits (D-026) ----------
      const gateText = readFileSync(join(ctx.root, GATE_FIXTURE), 'utf8');
      const gfx = JSON.parse(gateText) as { goal: { pos: Vec3; once_clear?: boolean }; enemies: { pos: Vec3 }[]; geometry: { pos: Vec3; scale: Vec3; tag?: string }[] };
      const door = gfx.geometry.find((g) => g.tag === GATE.doorTag)!;
      const gateArgs = { goal: gfx.goal.pos, doorX: door.pos[0], lane: door.scale[2] / 2 + C.gateLane, press: W['reach']! * NAV_CONFIG.slashShare, wait: C.waitTicks, standTicks: C.gateStandTicks, pushTicks: C.gatePushTicks };
      const openTicks = Math.ceil(GATE.openSec * FIXED_HZ - 1e-9);
      const gatePost = gfx.enemies[0]!.pos;
      /** rule 5 as a function of a run, so the same test is put to the level with the flag taken out */
      const goalWaits = (r: GateRun): string | null => {
        if (!r.atGoal) return r.stopped ?? 'never reached the goal';
        if (r.atGoal.state !== 'play') return `standing on the goal (${r.atGoal.fromGoal.toFixed(2)} m from it) with ${r.atGoal.standing} swordsman standing, the state is ${r.atGoal.state}: the arrival counted`;
        if (r.atGoal.standing !== 1 || r.atGoal.gate !== 0) return `on the goal: ${r.atGoal.standing} standing, gate ${r.atGoal.gate} (he must be standing and the gate shut)`;
        if (r.stopped) return r.stopped;
        if (r.pushedTo === null || r.pushedTo < door.pos[0] + door.scale[0] / 2) return `pushing at the shut door it got to x ${r.pushedTo?.toFixed(2)}, past the door's face at ${door.pos[0] + door.scale[0] / 2}`;
        if (r.fellTick === null || r.openTick === null || !r.rose) return 'the gate did not swing open after he fell';
        if (r.openTick - r.fellTick + 1 !== openTicks) return `the gate stood open ${secs(r.openTick - r.fellTick + 1)} after he fell, not GATE.openSec ${GATE.openSec} s (${openTicks} ticks)`;
        const a = r.afterRespawn;
        if (!a || a.gate !== 0 || a.foe.hits !== 0 || a.foe.mode !== 'guard' || a.foe.pos[0] !== gatePost[0] || a.foe.pos[2] !== gatePost[2]) return `after a respawn: gate ${a?.gate}, he ${JSON.stringify(a?.foe)} (the gate must be shut and he back on his post)`;
        if (!r.through || r.through.state !== 'results') return `with him down again it walked at the goal and ended in ${r.through?.state}, not results`;
        if (r.through.crossedAtZ === null || r.through.crossedAtZ > door.scale[2] / 2) return `it did not go through the gateway: crossed the door's x at |z| ${r.through.crossedAtZ}`;
        return null;
      };
      const gatePage = await open({}, {}, gateText);
      const gateRun = await gateAttempt(gatePage, gateArgs);
      await shut(gatePage);
      st.check('5. arriving does not count while a swordsman stands; the gate opens when the last one falls and a respawn shuts it (D-026)', goalWaits(gateRun) === null,
        goalWaits(gateRun) ?? `on the goal with him standing: still play, gate 0; the shut door held at x ${gateRun.pushedTo!.toFixed(2)}; open ${secs(openTicks)} after he fell; shut and he on his post after a respawn; then results through the gateway (|z| ${gateRun.through!.crossedAtZ!.toFixed(2)})`);
      const plain = JSON.parse(gateText) as { goal: { once_clear?: boolean } };
      delete plain.goal.once_clear;
      const plainPage = await open({}, {}, JSON.stringify(plain));
      const plainRun = await gateAttempt(plainPage, gateArgs);
      await shut(plainPage);
      st.check('seen to fail: rule 5 on the same level with once_clear taken out', goalWaits(plainRun) !== null, goalWaits(plainRun) ?? 'PASSED: the rule does not catch a goal that does not wait');

      st.check('zero console errors', errors.length === 0, errors.slice(0, 3).join(' | ') || 'none');
      st.data['fight'] = { ticks: run.log.length, frames: run.frames.length, windupToCutTicks: cutTicks, windupSec: shipped.windup };
    } finally {
      for (const b of browsers) await b.close().catch(() => {});
    }
  });
}
