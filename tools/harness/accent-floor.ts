// D-006 evidence for B-6: the ACCENT_AREA floor, measured; and the accent candidates against the
// eight-value ramp — the background the first contact sheet did not contain.
//
//   node tools/harness/accent-floor.ts [--skip-build]
//
// 1. CURVE. kit_torii alone at the origin; the player d metres before it on the walk axis; the camera
//    at the follow rig's rest pose behind the player (CAMERA_TUNING, read from src/engine/camera.ts);
//    background paper-cream. For each d: accent share of frame, accent pixel count, and the LARGEST
//    CONNECTED accent blob (4-neighbour) — the thing a scanning eye has to find. Area is geometry, not
//    colour (D-006), so one candidate stands for all.
// 2. FLOOR. The one observed findability failure is the seed's red at 0.012% of frame (D-001/D-006).
//    At the harness's 640x360 that is 27.6 px. The floor distance is the first d at which the largest
//    blob falls below it; the floor is the curve's share there. PROVISIONAL until the H2.5 feel test
//    measures findability with a person: the curve tells it which distances to show.
// 3. SWATCHES. Every candidate (and the rejected seed_red, for contrast) against each ramp value, at
//    the canonical 6 m framing and at the floor distance, with CIEDE2000 accent-vs-background.
//
// Writes docs/build-log/accent/palette/: curve.json, swatches-near.png, swatches-floor.png (rows =
// candidates, cols = the eight ramp values light -> dark), swatches.json.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pngjs from 'pngjs';
import type { Page } from '@playwright/test';
import { VIEWPORT, type Vec3 } from './lib.ts';
import { preflight } from './preflight.ts';
import { followRig } from './accent.ts';
// @ts-expect-error — plain .mjs with no declarations; exports are used as documented in accent.mjs
import { deltaE2000, hexToLab } from '../assets/accent.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = join(ROOT, 'docs/build-log/accent/palette');
const { PNG } = pngjs;
type Png = InstanceType<typeof PNG>;

const accent = JSON.parse(readFileSync(join(ROOT, 'assets/src/accent.json'), 'utf8')) as { default: string; candidates: Record<string, string>; must_fail: Record<string, string> };
const ramp = (JSON.parse(readFileSync(join(ROOT, 'reference/palette.json'), 'utf8')) as { colors: { name: string; hex: string }[] }).colors;
const HEX: Record<string, string> = { ...accent.candidates, ...accent.must_fail };
const NAMES = [...Object.keys(accent.candidates), ...Object.keys(accent.must_fail)];
const SEED_FAIL_PCT = 0.012; // MEASUREMENTS.md: seed red, 2,205 px / 36 frames = 0.012% of frame area
const FRAME_PX = VIEWPORT.width * VIEWPORT.height;
const FAIL_PX = (SEED_FAIL_PCT / 100) * FRAME_PX;
const DISTANCES = [0, 2, 4, 6, 8, 12, 18.34, 25, 30, 40, 50, 60, 70, 80, 90, 100, 120, 140, 160, 180, 200, 250, 300];
const NEAR_M = 6;
const TOL = 6;

const rig = followRig(ROOT);
/** Camera for a player d metres before the torii (torii at the origin, walking +x). */
function framing(d: number): { cam: Vec3; target: Vec3 } {
  const p = (rig.pitchDeg * Math.PI) / 180;
  const pivot: Vec3 = [-d, rig.pivotHeight, 0];
  return { cam: [pivot[0] - rig.distance * Math.cos(p), pivot[1] + rig.distance * Math.sin(p), 0], target: pivot };
}

function measure(png: Png, hex: string): { px: number; blob: number } {
  const [r, g, b] = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16)) as [number, number, number];
  const W = png.width;
  const H = png.height;
  const hit = new Uint8Array(W * H);
  let px = 0;
  for (let i = 0; i < W * H; i++) {
    const o = i * 4;
    if (Math.abs(png.data[o]! - r) <= TOL && Math.abs(png.data[o + 1]! - g) <= TOL && Math.abs(png.data[o + 2]! - b) <= TOL) {
      hit[i] = 1;
      px++;
    }
  }
  let blob = 0;
  const stack: number[] = [];
  for (let i = 0; i < W * H; i++) {
    if (hit[i] !== 1) continue;
    let n = 0;
    hit[i] = 2;
    stack.push(i);
    while (stack.length) {
      const k = stack.pop()!;
      n++;
      const x = k % W;
      for (const j of [k - 1, k + 1, k - W, k + W]) {
        if (j < 0 || j >= W * H || hit[j] !== 1) continue;
        if ((j === k - 1 && x === 0) || (j === k + 1 && x === W - 1)) continue;
        hit[j] = 2;
        stack.push(j);
      }
    }
    blob = Math.max(blob, n);
  }
  return { px, blob };
}

async function shot(page: Page, bg: string, f: { cam: Vec3; target: Vec3 }): Promise<Buffer> {
  const r = await page.evaluate(([b, c, t]) => window.__HARNESS__!.renderTorii(b, c, t), [bg, f.cam, f.target] as const);
  if (!r.ok) throw new Error(r.error ?? 'renderTorii failed');
  return page.locator('canvas').first().screenshot();
}

async function openPage(baseUrl: string, browser: import('@playwright/test').Browser, accentName: string): Promise<Page> {
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  await page.goto(`${baseUrl}/?harness=1&level=00-gym&accent=${accentName}`);
  await page.waitForFunction(() => window.__HARNESS__?.version === 'HARNESS_API_V1', null, { timeout: 20000 });
  // The page sits in `menu`, whose HUD text is a DOM overlay the canvas screenshot captures: hide it,
  // or it lands on the torii in every frame (and undercounts accent pixels where it crosses a post).
  await page.addStyleTag({ content: '#hud { display: none !important; }' });
  return page;
}

const pf = await preflight(ROOT, { skipBuild: process.argv.includes('--skip-build') });
if (!pf.result.ok || !pf.browser) {
  console.error('preflight failed:', JSON.stringify(pf.result.checks.filter((c) => !c.ok)));
  process.exit(3);
}
mkdirSync(OUT, { recursive: true });
try {
  // ---- 1 + 2: the curve and the floor ----
  const paper = ramp[0]!.hex;
  const p0 = await openPage(pf.baseUrl, pf.browser, accent.default);
  const curve: { ahead_m: number; cam_to_torii_m: number; accent_pct: number; accent_px: number; largest_blob_px: number }[] = [];
  for (const d of DISTANCES) {
    const f = framing(d);
    const m = measure(PNG.sync.read(await shot(p0, paper, f)), HEX[accent.default]!);
    curve.push({ ahead_m: d, cam_to_torii_m: +Math.hypot(f.cam[0], f.cam[1], f.cam[2]).toFixed(2), accent_pct: +((100 * m.px) / FRAME_PX).toFixed(4), accent_px: m.px, largest_blob_px: m.blob });
  }
  await p0.close();
  const failAt = curve.find((c) => c.largest_blob_px < FAIL_PX);
  const lastOk = [...curve].reverse().find((c) => c.largest_blob_px >= FAIL_PX && (!failAt || c.ahead_m < failAt.ahead_m));
  const vanish = curve.find((c) => c.accent_px === 0);
  const floor = {
    rule: `largest connected accent blob >= ${FAIL_PX.toFixed(1)} px (= the seed red's ${SEED_FAIL_PCT}% at ${VIEWPORT.width}x${VIEWPORT.height})`,
    last_findable: lastOk ?? null,
    first_failing: failAt ?? null,
    accent_vanishes_at: vanish ?? null,
  };
  writeFileSync(join(OUT, 'curve.json'), `${JSON.stringify({ decision: 'D-006 / B-6', rig, viewport: VIEWPORT, background: `paper-cream ${paper}`, accent: accent.default, curve, floor }, null, 2)}\n`);
  console.log(`curve (player d m before the gate, follow rig, ${VIEWPORT.width}x${VIEWPORT.height}):`);
  for (const c of curve) console.log(`  ${String(c.ahead_m).padStart(6)} m  cam->gate ${String(c.cam_to_torii_m).padStart(7)} m  ${String(c.accent_pct).padStart(8)}%  ${String(c.accent_px).padStart(6)} px  largest blob ${String(c.largest_blob_px).padStart(6)} px${c === failAt ? `   <- first below ${FAIL_PX.toFixed(1)} px` : ''}`);
  console.log(`floor: last findable ${lastOk?.ahead_m} m (${lastOk?.accent_pct}%), first failing ${failAt?.ahead_m} m, accent vanishes ${vanish?.ahead_m ?? '> 300'} m`);

  // ---- 3: swatches against the ramp ----
  const floorD = lastOk?.ahead_m ?? NEAR_M;
  const W = VIEWPORT.width;
  const H = VIEWPORT.height;
  const sheets = { near: new PNG({ width: W * ramp.length, height: H * NAMES.length }), floor: new PNG({ width: W * ramp.length, height: H * NAMES.length }) };
  const table: Record<string, Record<string, { dE2000: number; near_px: number; floor_px: number }>> = {};
  for (const [row, name] of NAMES.entries()) {
    const page = await openPage(pf.baseUrl, pf.browser, name);
    table[name] = {};
    for (const [col, c] of ramp.entries()) {
      const near = PNG.sync.read(await shot(page, c.hex, framing(NEAR_M)));
      const far = PNG.sync.read(await shot(page, c.hex, framing(floorD)));
      PNG.bitblt(near, sheets.near, 0, 0, W, H, col * W, row * H);
      PNG.bitblt(far, sheets.floor, 0, 0, W, H, col * W, row * H);
      table[name][c.name] = { dE2000: +deltaE2000(hexToLab(HEX[name]!), hexToLab(c.hex)).toFixed(1), near_px: measure(near, HEX[name]!).px, floor_px: measure(far, HEX[name]!).px };
    }
    await page.close();
  }
  writeFileSync(join(OUT, 'swatches-near.png'), PNG.sync.write(sheets.near));
  writeFileSync(join(OUT, 'swatches-floor.png'), PNG.sync.write(sheets.floor));
  writeFileSync(
    join(OUT, 'swatches.json'),
    `${JSON.stringify({ decision: 'D-006: candidates against the eight-value ramp, for the H2.5 feel test — chooses nothing', rows: NAMES.map((n) => `${n} ${HEX[n]}${n in accent.must_fail ? ' (REJECTED, reference)' : ''}`), cols: ramp.map((c) => `${c.name} ${c.hex}`), near_m: NEAR_M, floor_m: floorD, table }, null, 2)}\n`,
  );
  console.log(`\nswatches (rows ${NAMES.join(', ')}; cols ${ramp.map((c) => c.name).join(', ')}) at ${NEAR_M} m and ${floorD} m`);
  console.log(`  min dE2000 vs ramp: ${NAMES.map((n) => `${n} ${Math.min(...Object.values(table[n]!).map((v) => v.dE2000))}`).join(' · ')}`);
} finally {
  await pf.browser.close().catch(() => {});
  pf.server?.kill();
}
