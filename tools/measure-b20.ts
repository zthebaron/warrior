#!/usr/bin/env node
// measure:b20 — re-measure, with B-14's coverage protocol, the MOVE numbers that rested on one sample (B-20).
//
// B-14 showed that a single clean sample near a threshold is a guess with a decimal point: Rapier is
// deterministic, so one sample always repeats, but whether the capsule clears depends on WHERE in a tick it
// meets the geometry, on the approach angle and on absolute position. Same protocol here:
//   - 6 approaches: run (head-on), rest (from standing), sprint, 30 and 45 deg oblique, walk (half stick)
//   - N phases: the start spread across one tick of travel (v/60), or for dash, the trigger distance
//   - P placements: the whole lane set shifted to different absolute x/z
// A value is CLEAN when it has zero failures over every approach x phase x placement. The ceiling is the
// largest grid value V with every grid value <= V clean. Reported with the SPREAD (worst failures per
// approach), never as one number.
//
//   npm run measure:b20 -- --what=stair|dash|slope [--lo= --hi= --step= | --values=a,b,c] [--n=96] [--placements=3] [--skip-build=1]
//     stair  the gym's staircase shape: 8 risers of height h, 0.6 treads, 4 wide (geometry[6..13]), no jump.
//            Fail = not on the top tread within 300 ticks.
//     dash   one riser of height h, 6 deep; a grounded dash toward it, triggered at N distances spread over
//            0.3..2.9 u from the face (dash reach is 20 m/s x 0.16 s = 3.2 u), stick released after the
//            press, no jump. Fail = not standing on top 60 ticks after the dash.
//     slope  a ramp at angle theta (prim_box rotated about z), no jump. Fail = not 2 u up it within 300 ticks.
//
//   npm run measure:b20 -- --what=gap|rise --move=jump|double|dash|dashjump ...   the ballistic MOVE numbers
//     RUN speed, head-on only: the MOVE basis (MEASUREMENTS "RUN speed, not sprint"); a gap or a rise is
//     measured along the line between two waypoints, so an oblique approach is not a different gap. The
//     six "approaches" are instead six PRESS TIMINGS, the thing a player cannot place to the tick:
//     gap   flat gap of width g (edge to edge), catch floor 3 u below (a miss lands, it does not die).
//           Press k = 0..5 ticks after the walk-off tick (all inside coyoteTimeSec 0.12 s = 7 ticks; the
//           nav bot uses k = 2, "how MOVE was measured"). Fail = not standing on the far pad.
//     rise  a 6 u deep block of height r. Press when the capsule centre is d = 0.4 .. 2.4 u from the face
//           (6 steps of 0.4: from "against it" to the far end of a running takeoff). Fail = not standing
//           on top 150 ticks after the press.
//     Per move, after the press: jump holds jump (full height, as nav). double releases one tick at
//     vy <= 0.5 m/s then presses again (nav apexVy). dash presses dash only. dashjump presses dash, then
//     jump the first tick the dash has ended (nav).
//   exit 0 report printed · 3 environment · 4 fixture rejected
//
// Minutes, not seconds: not in CI. Re-run when physics, TUNING or the capsule changes.

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser, preflight } from './harness/preflight.ts';
import { VIEWPORT, type Vec3 } from './harness/lib.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sarg = (k: string, d: string): string => process.argv.find((x) => x.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const arg = (k: string, d: number): number => Number(sarg(k, String(d)));
const WHAT = sarg('what', 'stair') as 'stair' | 'dash' | 'slope' | 'gap' | 'rise';
const BALLISTIC = WHAT === 'gap' || WHAT === 'rise';
const MOVE_ARG = sarg('move', 'jump') as 'jump' | 'double' | 'dash' | 'dashjump';
if (BALLISTIC && !['jump', 'double', 'dash', 'dashjump'].includes(MOVE_ARG)) { console.log(`--move=${MOVE_ARG}: not a ballistic move this tool measures`); process.exit(3); }
const DEF = { stair: [0.3, 0.42, 0.01], dash: [0.3, 0.6, 0.02], slope: [40, 56, 1], gap: [4.0, 5.4, 0.2], rise: [1.6, 2.4, 0.1] }[WHAT];
const LO = arg('lo', DEF[0]!), HI = arg('hi', DEF[1]!), STEP = arg('step', DEF[2]!), N = arg('n', 96), P = arg('placements', 3);
const r3 = (x: number): number => Math.round(x * 1000) / 1000;
const values: number[] = [];
const LIST = sarg('values', '');
if (LIST) values.push(...LIST.split(',').map(Number));
else for (let k = 0; LO + k * STEP <= HI + 1e-9; k++) values.push(r3(LO + k * STEP));

const LANE = 14; // lane pitch along z
const ALL_PLACEMENTS: Vec3[] = [[0, 0, 0], [17.37, 0, 4.61], [-23.81, 0, 61.13], [41.29, 0, -37.7], [-9.53, 0, 120.44]];
const PLACEMENTS = ALL_PLACEMENTS.slice(0, P);
const STAIR = { risers: arg('risers', 8), tread: arg('tread', 0.6) }; // default: levels/00-gym.json geometry[6..13] as built
// Lanes are 10 wide, not the gym stair's 4: a 45 deg approach drifts 4.8 u sideways over 8 treads, and falling
// off the side is not a stall. Width does not change what one face does to the capsule.
const WIDTH = 10;
const DEG = Math.PI / 180;

function geometryFor(v: number, z: number, off: Vec3): unknown[] {
  const x = off[0];
  if (WHAT === 'stair') {
    const out: unknown[] = [];
    for (let k = 0; k < STAIR.risers; k++) {
      const top = (k + 1) * v;
      out.push({ asset: 'prim_box', pos: [x + k * STAIR.tread + STAIR.tread / 2, top / 2, z], scale: [STAIR.tread, top, WIDTH] });
    }
    const topY = STAIR.risers * v; // landing at the top, as the gym's stair has
    out.push({ asset: 'prim_box', pos: [x + STAIR.risers * STAIR.tread + 3, topY / 2, z], scale: [6, topY, WIDTH] });
    return out;
  }
  if (WHAT === 'dash' || WHAT === 'rise') return [{ asset: 'prim_box', pos: [x + 3, v / 2, z], scale: [6, v, WIDTH] }];
  if (WHAT === 'gap') {
    // launch pad ends at x; landing pad starts at x + g. Tops at y 0; the catch floor's top is at -3.
    return [
      { asset: 'prim_box', pos: [x - 7, -1.5, z], scale: [14, 3, WIDTH] },
      { asset: 'prim_box', pos: [x + v + 5, -1.5, z], scale: [10, 3, WIDTH] },
    ];
  }
  // slope: an 8 u ramp rising along +x from (x, 0), 0.5 thick, rotated v degrees about z
  const L = 8, t = 0.25, th = v * DEG;
  return [{ asset: 'prim_box', pos: [x + (L / 2) * Math.cos(th) + t * Math.sin(th), (L / 2) * Math.sin(th) - t * Math.cos(th), z], scale: [L, 2 * t, WIDTH], rot: [0, 0, v] }];
}

function fixture(off: Vec3): string {
  const span = values.length * LANE;
  const fy = WHAT === 'gap' ? -3 : 0; // gap: the base floor is the catch floor under the gaps
  const geometry: unknown[] = [{ asset: 'prim_box', pos: [off[0], fy - 0.5, off[2] + span / 2], scale: [60, 1, span + 20], tag: 'spawn' }];
  values.forEach((v, i) => geometry.push(...geometryFor(v, off[2] + i * LANE, off)));
  return JSON.stringify({
    id: 'fixture-b20',
    title: `B-20 ${WHAT}${BALLISTIC ? ` ${MOVE_ARG}` : ''} measurement`,
    chapter: 0,
    moves_allowed: ['ground', 'jump', 'double', 'dash', 'dashjump', 'wall', 'climb', 'platform'],
    palette: 'greybox',
    difficulty: 1,
    spawn: { pos: [off[0] - 12, fy, off[2] - 8], facing: -90 },
    goal: { type: 'reach', pos: [off[0] + 25, fy, off[2] - 8], radius: 1 },
    bounds: { min: [off[0] - 30, -15, off[2] - 20], max: [off[0] + 30, 20, off[2] + span + 20] },
    geometry,
    hazards: [{ type: 'fall', y: -10 }],
    checkpoints: [{ pos: [off[0] - 14, fy, off[2] - 10] }],
    critical_path: [[off[0] - 12, fy, off[2] - 8], { pos: [off[0] + 25, fy, off[2] - 8], via: 'ground' }],
  });
}

const pf = await preflight(ROOT, { skipBuild: arg('skip-build', 0) === 1 });
if (!pf.browser) {
  console.log(pf.result.checks.map((c) => `${c.ok ? 'ok ' : 'FAIL'} ${c.name} ${c.detail}`).join('\n'));
  process.exit(3);
}
const errors: string[] = [];
let page: import('@playwright/test').Page | null = null;
let browser = pf.browser;
// A fresh BROWSER per placement, not just a fresh page: under load (three of these at once) a page opened
// after a long placement could not load (goto timed out at 60 s), as B-14 also saw.
let firstBoot = true;
const boot = async (): Promise<import('@playwright/test').Page> => {
  await page?.close();
  if (!firstBoot) {
    await browser.close().catch(() => {});
    browser = await launchBrowser();
  }
  firstBoot = false;
  page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${pf.baseUrl}/?harness=1&level=00-gym`, { timeout: 60000 });
  await page.waitForFunction(() => window.__HARNESS__?.version === 'HARNESS_API_V1', null, { timeout: 60000 });
  return page;
};

// --tech: the nav bot's technique is the default and the one MOVE is set from. The alternates measure
// headroom a different technique has, for the record: double `late` presses the second jump falling at
// vy <= -6 m/s instead of at the apex; dashjump `ground` dashes ON the ground, pressed e u before the edge,
// so the jump at the dash's end is a coyote ground jump carrying the dash's exit speed.
const TECH = sarg('tech', 'nav') as 'nav' | 'late' | 'ground';
if (TECH === 'late' && MOVE_ARG !== 'double' || TECH === 'ground' && (MOVE_ARG !== 'dashjump' || WHAT !== 'gap')) { console.log(`--tech=${TECH} does not apply to ${WHAT} ${MOVE_ARG}`); process.exit(3); }
// rise: press distances from the face, per move, spanning that move's own takeoff window. Close to the
// face for a single jump; a double's second press at the face is a WALL jump (ground > wall > double),
// so its window starts where the apex falls short of the face; dashjump's dash alone covers 3.2 u.
const RISE_D = { jump: [0.4, 0.4], double: [3.5, 0.5], dash: [0.4, 0.4], dashjump: [3.0, 0.5] }[MOVE_ARG];
const cols = (p: string, lo: number, st: number): string[] => [0, 1, 2, 3, 4, 5].map((q) => `${p}${r3(lo + q * st)}`);
const MODES = WHAT === 'gap' ? (TECH === 'ground' ? cols('e', 1.6, 0.4) : cols('k', 0, 1))
  : WHAT === 'rise' ? cols('d', RISE_D[0]!, RISE_D[1]!)
  : ['run', 'rest', 'sprint', 'oblq30', 'oblq45', 'walk'];

// One (timing, value) cell of a ballistic measurement: N start phases, each a full run-up and one move.
async function ballisticCell(pg: import('@playwright/test').Page, a: { mode: string; v: number; i: number; off: Vec3 }): Promise<{ fails: number; deaths: number }> {
  return pg.evaluate(({ mode, v, i, off, LANE, N, WHAT, MOVE, TECH }) => {
    const H = window.__HARNESS__!;
    const RUN = 7; // TUNING.runSpeed: the phase spread is one tick of travel at run speed
    const laneZ = off[2] + i * LANE;
    const param = Number(mode.slice(1)); // gap: k ticks after walk-off (or e u before the edge) · rise: d u from the face
    let fails = 0;
    for (let j = 0; j < N; j++) {
      const z = laneZ + (j / N - 0.5) * 0.6;
      const x0 = off[0] - 6 - (j / N) * (RUN / 60) - (WHAT === 'rise' || TECH === 'ground' ? param : 0);
      H.setInput(null);
      H.teleportPlayer([x0, 0, z]);
      let s = H.advance(30, 0);
      const fr = (jump: boolean, dash: boolean) => ({ x: 1, y: 0, jump, dash, sprint: false });
      // run up to the press
      let walkOff: number | null = null, k = 0, pressed = false;
      while (!pressed && k++ < 400) {
        if (TECH === 'ground') {
          if (s.feet[0] >= off[0] - param) pressed = true;
        } else if (WHAT === 'gap') {
          if (walkOff === null && !s.grounded) walkOff = s.tick;
          if (walkOff !== null && s.tick - walkOff >= param) pressed = true;
        } else if (s.feet[0] >= off[0] - param) pressed = true;
        if (!pressed) s = H.step(fr(false, false), false);
      }
      const usesDash = MOVE === 'dash' || MOVE === 'dashjump';
      s = H.step(fr(!usesDash, usesDash), false); // the press
      // after the press: hold per move (as tools/harness/nav.ts does), until landed or out of time
      // Landed = 3 consecutive grounded ticks not rising. A single grounded tick is not a landing: Rapier
      // reports grounded when the capsule brushes a lip on the way UP (seen on a 1.8 rise at d 0.4).
      let released = false, second = false, dashEnded = false, landed = false, airSeen = !s.grounded, onFor = 0;
      for (let t = 0; t < 150 && !landed; t++) {
        let jump = false;
        if (MOVE === 'jump') jump = true;
        else if (MOVE === 'double') {
          if (!released && s.vel[1] <= (TECH === 'late' ? -6 : 0.5)) released = true;
          else if (released && !second) { second = true; jump = true; } else jump = !released || second;
        } else if (MOVE === 'dashjump') {
          if (s.pstate !== 'dash') dashEnded = true;
          jump = dashEnded;
        }
        s = H.step(fr(jump, false), false);
        if (!s.grounded) airSeen = true;
        onFor = s.grounded && s.vel[1] <= 0.01 ? onFor + 1 : 0;
        if (onFor >= 3 && (airSeen || t > 20)) landed = true;
      }
      // settle 20 ticks, then until grounded (<= 120 more): a lip-catch that slides off is a fail
      for (let t = 0; t < 140 && (t < 20 || !s.grounded); t++) s = H.step(fr(false, false), false);
      const ok = s.grounded && s.feet[0] > off[0] + (WHAT === 'gap' ? v : 0) && s.feet[1] > (WHAT === 'gap' ? -0.05 : v - 0.02);
      if (!ok) fails++;
    }
    return { fails, deaths: H.snapshot().deaths };
  }, { ...a, LANE, N, WHAT, MOVE: MOVE_ARG, TECH });
}
const worst: Record<string, number[]> = Object.fromEntries(MODES.map((m) => [m, values.map(() => 0)]));
const t0 = Date.now();
for (const off of PLACEMENTS) {
  const pg = await boot();
  const started = await pg.evaluate((t) => window.__HARNESS__!.startJson(t), fixture(off));
  if (!started.ok) {
    console.log(`fixture rejected: ${started.error}`);
    process.exit(4);
  }
  let deaths = 0;
  for (const name of MODES) {
    for (const [i, v] of values.entries()) {
      if (BALLISTIC) {
        const r = await ballisticCell(pg, { mode: name, v, i, off });
        worst[name]![i] = Math.max(worst[name]![i]!, r.fails);
        deaths = r.deaths;
        continue;
      }
      const r = await pg.evaluate(({ name, v, i, LANE, N, off, R, WHAT, risers, tread, DEG }) => {
        const H = window.__HARNESS__!;
        const def: Record<string, { x0: number; sprint: boolean; dz: number; mag: number; v: number }> = {
          run: { x0: -4, sprint: false, dz: 0, mag: 1, v: 7 },
          rest: { x0: -R - 0.02, sprint: false, dz: 0, mag: 1, v: 0 },
          sprint: { x0: -6, sprint: true, dz: 0, mag: 1, v: 10 },
          oblq30: { x0: -4, sprint: false, dz: Math.tan(Math.PI / 6), mag: 1, v: 7 },
          oblq45: { x0: -3, sprint: false, dz: 1, mag: 1, v: 7 },
          walk: { x0: -4, sprint: false, dz: 0, mag: 0.5, v: 3.5 },
        };
        const m = def[name]!;
        const g = m.mag / Math.hypot(1, m.dz);
        const move = { x: g, y: m.dz * g, jump: false, dash: false, sprint: m.sprint };
        const still = { x: 0, y: 0, jump: false, dash: false, sprint: false };
        const laneZ = off[2] + i * LANE;
        // the target: top of the stair, top of the riser, or 2 u up the ramp
        const goalY = WHAT === 'stair' ? risers * v - 0.02 : WHAT === 'dash' ? v - 0.02 : 2.0;
        let fails = 0;
        for (let j = 0; j < N; j++) {
          // where the path crosses the face: obliques are aimed so they stay inside the lane while climbing
          const zFace = laneZ + (m.dz ? -(WHAT === 'stair' ? (risers * tread) / 2 : 1) * m.dz : (j / N - 0.5) * 0.6);
          let x0 = m.x0;
          if (WHAT === 'dash') x0 = name === 'rest' ? -(0.3 + (j / N) * 2.6) : m.x0 - 4; // rest: dash from standing at the trigger distance
          else x0 = m.x0 - (m.v > 0 ? (j / N) * (m.v / 60) : (j / N) * 0.01);
          H.setInput(null);
          H.teleportPlayer([off[0] + x0, 0, zFace + x0 * m.dz]);
          let s = H.advance(30, 0);
          let ok = false;
          if (WHAT === 'dash') {
            // approach (unless dashing from standing), then press dash at distance d from the face
            const d = 0.3 + (j / N) * 2.6;
            let k = 0;
            if (name !== 'rest') while (s.feet[0] < off[0] - d && k++ < 600) s = H.step(move, false);
            s = H.step({ ...move, x: name === 'rest' ? 1 : move.x, y: name === 'rest' ? 0 : move.y, dash: true }, false);
            for (let k2 = 0; k2 < 12 + 60; k2++) s = H.step(still, false); // dash lasts 0.16 s (~10 ticks), then settle
            ok = s.grounded && s.feet[1] > goalY && s.feet[0] > off[0];
          } else {
            for (let k = 0; k < 300 && !ok; k++) {
              s = H.step(move, false);
              if (s.grounded && s.feet[1] > goalY) ok = true;
            }
          }
          if (!ok) fails++;
        }
        return { fails, deaths: H.snapshot().deaths };
      }, { name, v, i, LANE, N, off, R: 0.35, WHAT, risers: STAIR.risers, tread: STAIR.tread, DEG });
      worst[name]![i] = Math.max(worst[name]![i]!, r.fails);
      deaths = r.deaths;
    }
  }
  if (deaths) errors.push(`${deaths} deaths during measurement (fixture has no hazard in reach: harness bug)`);
  console.log(`placement (${off.join(', ')}) done at ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

const unit = WHAT === 'slope' ? 'deg' : 'u';
console.log(`\n${WHAT}${BALLISTIC ? ` ${MOVE_ARG} (tech ${TECH})` : ''}: worst failures of ${N} phases over ${PLACEMENTS.length} placements per approach (0 = clean)`);
console.log(`${('value ' + unit).padEnd(10)}` + MODES.map((m) => m.padStart(7)).join(''));
values.forEach((v, i) => console.log(String(v).padEnd(10) + MODES.map((m) => String(worst[m]![i]).padStart(7)).join('')));
const clean = values.map((_, i) => MODES.every((m) => worst[m]![i] === 0));
let ceil = -1;
while (ceil + 1 < values.length && clean[ceil + 1]) ceil++;
console.log(`\nceiling (largest V with every grid value <= V clean): ${ceil < 0 ? `none: ${values[0]} already fails` : `${values[ceil]} ${unit}`}`);
const first = clean.indexOf(false);
if (first >= 0) console.log(`first failure: ${values[first]} ${unit} (${MODES.filter((m) => worst[m]![first]! > 0).join(', ')})`);
console.log(`trials ${values.length * MODES.length * N * PLACEMENTS.length}, console errors ${errors.length}${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
await (page as import('@playwright/test').Page | null)?.close(); // assigned in boot(): TS cannot see it
await browser.close();
pf.server?.kill();
process.exit(errors.length ? 1 : 0);
