#!/usr/bin/env node
// measure:autostep — the riser height a player walks up WITHOUT jumping, measured in the real game (B-14).
//
// Rapier's character controller is configured with autostepMaxHeight 0.5 (src/engine/physics.ts). That is
// an INPUT to the controller, not a measurement of what the capsule actually climbs. This tool builds a
// fixture of risers, walks the harness build of the game (real Rapier, real Player, fixed 60 Hz ticks)
// into each one with no jump, and counts stalls: the capsule pinned against the face for 150 ticks.
//
// Coverage, because Rapier is deterministic but the outcome depends on WHERE in a tick the capsule meets
// the face and on absolute position:
//   - 6 approaches: run (head-on), rest (standing against the face), sprint, 30 deg and 45 deg oblique,
//     walk (half stick)
//   - N start phases spread across one tick of travel (v/60), plus a lateral spread for head-on approaches
//   - P placements: the whole lane set shifted to different absolute x/z
// A height is CLEAN when it has zero stalls over every approach x phase x placement. The ceiling is the
// largest height H such that every grid height <= H is clean. Not rounded in either direction.
//
//   npm run measure:autostep -- [--lo=0.35] [--hi=0.42] [--step=0.005] [--n=96] [--placements=3]
//   exit 0 report printed · 3 environment (no browser / WebGL) · 4 fixture rejected
//
// Minutes, not seconds: run it when physics, TUNING or the capsule changes, not in CI.

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preflight } from './harness/preflight.ts';
import { VIEWPORT, type Vec3 } from './harness/lib.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k: string, d: number): number => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`));
  return a ? Number(a.split('=')[1]) : d;
};
const LO = arg('lo', 0.35), HI = arg('hi', 0.42), STEP = arg('step', 0.005), N = arg('n', 96), P = arg('placements', 3);
const r3 = (x: number): number => Math.round(x * 1000) / 1000;
const heights: number[] = [];
for (let k = 0; LO + k * STEP <= HI + 1e-9; k++) heights.push(r3(LO + k * STEP));

const LANE = 3; // lane pitch along z; each riser is 2 deep in z, so lanes never touch
// placements: whole lane set shifted in absolute x/z (fractional, non-repeating offsets)
const ALL_PLACEMENTS: Vec3[] = [[0, 0, 0], [17.37, 0, 4.61], [-23.81, 0, 61.13], [41.29, 0, -37.7], [-9.53, 0, 120.44]];
const ROT = arg('rotate', 0);
const PLACEMENTS: Vec3[] = [...ALL_PLACEMENTS.slice(ROT), ...ALL_PLACEMENTS.slice(0, ROT)].slice(0, P);

function fixture(off: Vec3): string {
  const span = heights.length * LANE;
  const geometry: unknown[] = [{ asset: 'prim_box', pos: [off[0], -0.5, off[2] + span / 2], scale: [40, 1, span + 10], tag: 'spawn' }];
  heights.forEach((h, i) => geometry.push({ asset: 'prim_box', pos: [off[0] + 3, h / 2, off[2] + i * LANE], scale: [6, h, 2] }));
  return JSON.stringify({
    id: 'fixture-autostep',
    title: 'B-14 autostep measurement',
    chapter: 0,
    moves_allowed: ['ground', 'jump', 'double', 'dash', 'dashjump', 'wall', 'climb', 'platform'],
    palette: 'greybox',
    difficulty: 1,
    spawn: { pos: [off[0] - 8, 0, off[2]], facing: -90 },
    goal: { type: 'reach', pos: [off[0] + 15, 0, off[2]], radius: 1 },
    bounds: { min: [off[0] - 25, -15, off[2] - 10], max: [off[0] + 25, 10, off[2] + span + 10] },
    geometry,
    hazards: [{ type: 'fall', y: -10 }],
    checkpoints: [{ pos: [off[0] - 12, 0, off[2] - 5] }],
    critical_path: [[off[0] - 8, 0, off[2]], { pos: [off[0] + 15, 0, off[2]], via: 'ground' }],
  });
}

const pf = await preflight(ROOT, { skipBuild: false });
if (!pf.browser) {
  console.log(pf.result.checks.map((c) => `${c.ok ? 'ok ' : 'FAIL'} ${c.name} ${c.detail}`).join('\n'));
  process.exit(3);
}
const errors: string[] = [];
// A fresh page per placement (the old one closed): each placement measures a freshly booted game, so
// placements are independent by construction. Re-using or reloading one page after a placement left it
// unable to navigate (goto timed out at 180 s) and ran later placements ~25x slower; stall counts were
// identical either way (checked: a placement gives the same counts run first or third).
let page: import('@playwright/test').Page | null = null;
const boot = async (): Promise<import('@playwright/test').Page> => {
  await page?.close();
  page = await pf.browser!.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(`${pf.baseUrl}/?harness=1&level=00-gym`, { timeout: 60000 });
  } catch (e) {
    const t = Date.now();
    const srv = await fetch(`${pf.baseUrl}/`, { signal: AbortSignal.timeout(5000) }).then((r) => `HTTP ${r.status}`, (x) => `UNREACHABLE ${x}`);
    console.log(`page load failed; server ${srv} in ${Date.now() - t}ms; server pid ${pf.server?.pid} exitCode ${pf.server?.exitCode}`);
    throw e;
  }
  await page.waitForFunction(() => window.__HARNESS__?.version === 'HARNESS_API_V1', null, { timeout: 60000 });
  return page;
};

const MODES = ['run', 'rest', 'sprint', 'oblq30', 'oblq45', 'walk'];
const worst: Record<string, number[]> = Object.fromEntries(MODES.map((m) => [m, heights.map(() => 0)]));
const t0 = Date.now();
for (const off of PLACEMENTS) {
  const page = await boot();
  const started = await page.evaluate((t) => window.__HARNESS__!.startJson(t), fixture(off));
  if (!started.ok) {
    console.log(`fixture rejected: ${started.error}`);
    process.exit(4);
  }
  // One short evaluate per (approach, height): a single multi-minute evaluate left the browser unable to
  // load the next placement's page.
  const res: { out: Record<string, number[]>; deaths: number } = { out: Object.fromEntries(MODES.map((m) => [m, [] as number[]])), deaths: 0 };
  for (const name of MODES) {
    for (const [i, h] of heights.entries()) {
      const r = await page.evaluate(({ name, h, i, LANE, N, off, R }) => {
        const H = window.__HARNESS__!;
        const def: Record<string, { x0: number; sprint: boolean; dz: number; mag: number; v: number }> = {
          run: { x0: -4, sprint: false, dz: 0, mag: 1, v: 7 },
          rest: { x0: -R - 0.02, sprint: false, dz: 0, mag: 1, v: 0 },
          sprint: { x0: -6, sprint: true, dz: 0, mag: 1, v: 10 },
          oblq30: { x0: -4, sprint: false, dz: Math.tan(Math.PI / 6), mag: 1, v: 7 },
          oblq45: { x0: -3, sprint: false, dz: 1, mag: 1, v: 7 },
          walk: { x0: -4, sprint: false, dz: 0, mag: 0.5, v: 3.5 },
        };
        const m = def[name];
        let stalls = 0;
        for (let j = 0; j < N; j++) {
          const z = off[2] + i * LANE + (m.dz ? 0 : (j / N - 0.5) * 0.6);
          // spread the start across one tick of travel (v/60): the face is met at N sub-tick phases
          const x0 = m.x0 - (m.v > 0 ? (j / N) * (m.v / 60) : (j / N) * 0.01);
          H.setInput(null);
          H.teleportPlayer([off[0] + x0, 0, z + x0 * m.dz]);
          let s = H.advance(30, 0);
          let up = false;
          const g = m.mag / Math.hypot(1, m.dz);
          for (let k = 0; k < 150 && !up; k++) {
            s = H.step({ x: g, y: m.dz * g, jump: false, dash: false, sprint: m.sprint }, false);
            if (s.grounded && s.feet[1] > h - 0.02 && s.feet[0] > off[0]) up = true;
          }
          if (!up) stalls++;
        }
        return { stalls, deaths: H.snapshot().deaths };
      }, { name, h, i, LANE, N, off, R: 0.35 });
      res.out[name].push(r.stalls);
      res.deaths = r.deaths;
    }
  }
  if (res.deaths) errors.push(`${res.deaths} deaths during measurement (fixture has no hazard in reach: harness bug)`);
  for (const m of MODES) res.out[m].forEach((v, i) => (worst[m][i] = Math.max(worst[m][i], v)));
  const tot = MODES.map((m) => `${m} ${res.out[m].reduce((a, b) => a + b, 0)}`).join(' · ');
  console.log(`placement (${off.join(', ')}) done at ${((Date.now() - t0) / 1000).toFixed(0)}s, stalls: ${tot}`);
}

console.log(`\nworst stalls of ${N} phases over ${PLACEMENTS.length} placements (0 = clean)`);
console.log('height  ' + MODES.map((m) => m.padStart(7)).join(''));
heights.forEach((h, i) => console.log(h.toFixed(3).padEnd(8) + MODES.map((m) => String(worst[m][i]).padStart(7)).join('')));
const clean = heights.map((_, i) => MODES.every((m) => worst[m][i] === 0));
let ceil = -1;
while (ceil + 1 < heights.length && clean[ceil + 1]) ceil++;
console.log(`\nceiling (largest H with every grid height <= H clean): ${ceil < 0 ? `none: ${heights[0]} already stalls` : heights[ceil].toFixed(3)}`);
const firstStall = clean.indexOf(false);
if (firstStall >= 0) console.log(`first stall: ${heights[firstStall].toFixed(3)} (${MODES.filter((m) => worst[m][firstStall] > 0).join(', ')})`);
console.log(`trials ${heights.length * MODES.length * N * PLACEMENTS.length}, console errors ${errors.length}${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
await page?.close();
await pf.browser.close();
pf.server?.kill();
process.exit(errors.length ? 1 : 0);
