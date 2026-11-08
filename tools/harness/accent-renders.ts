// D-001 evidence for the H2.5 feel test: every accent candidate (and the rejected seed red, for
// contrast) rendered on the gym torii from fixed cameras, with the accent's share of each frame
// measured (--area-curve: the D-003 distance curve). It renders; it does not choose.
//
//   node tools/harness/accent-renders.ts [--skip-build]
//
// Writes docs/build-log/accent/<candidate>-<shot>.png, a contact sheet (rows = candidates,
// cols = shots) at docs/build-log/accent/contact-sheet.png, and accent-renders.json with the
// measured areas. Same pinned SwiftShader Chromium as the harness, so the frames are reproducible.
//
// CAVEAT, stated in the output too: the gym is grey-box (lit primitives, blue sky), not the
// STYLE-BIBLE ink-wash render. Judge separation from the torii's neighbours, not the gym's look.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pngjs from 'pngjs';
import { VIEWPORT, type Vec3 } from './lib.ts';
import { preflight } from './preflight.ts';
import { cameras } from './visual.ts';
import { accentShare, followFraming, followRig } from './accent.ts';
import { wp } from './lib.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = join(ROOT, 'docs/build-log/accent');
const { PNG } = pngjs;

const accent = JSON.parse(readFileSync(join(ROOT, 'assets/src/accent.json'), 'utf8')) as { default: string; candidates: Record<string, string>; must_fail: Record<string, string> };
const level = JSON.parse(readFileSync(join(ROOT, 'levels/00-gym.json'), 'utf8'));
const SHOTS: { name: string; pos: Vec3; target: Vec3; note: string }[] = [
  { name: 'follow', pos: [37, 3.4, 0], target: [44, 1.6, 0], note: 'gameplay framing: CAMERA_TUNING.distance 7m behind a player at x=44, torii at x=50 ahead' },
  { name: 'approach', pos: [34, 3.5, 3], target: [50, 2.6, -1], note: 'torii at x=50 seen on approach, rock mass (dark wall) behind-left' },
  { name: 'goal', pos: [74, 6.5, 4], target: [88, 5.5, 0], note: 'goal-pad torii at x=88 against the open sky (bright void)' },
  { name: 'scan', pos: cameras(level)[0]!.pos, target: cameras(level)[0]!.target, note: 'whole-gym overview (harness cam0): small torii, a scanning read' },
];
const NAMES = [...Object.keys(accent.candidates), ...Object.keys(accent.must_fail)];
const HEX: Record<string, string> = { ...accent.candidates, ...accent.must_fail };
const TOL = 6; // /255, per channel: the accent renders exactly (unlit, tone mapping off); the slack covers MSAA

const args = new Set(process.argv.slice(2));
const pf = await preflight(ROOT, { skipBuild: args.has('--skip-build') });
if (!pf.result.ok || !pf.browser) {
  console.error('preflight failed:', JSON.stringify(pf.result.checks.filter((c) => !c.ok)));
  process.exit(3);
}

// --area-curve: D-003 measurement. The x=50 torii framed by the real follow rig with the player d metres
// before it along the critical path; accent share of frame for each d. Writes accent-area-curve.json.
if (args.has('--area-curve')) {
  const rig = followRig(ROOT);
  const path = level.critical_path.map((w: Parameters<typeof wp>[0]) => wp(w).pos);
  const torii: Vec3 = [50, 0, 0];
  const page = await pf.browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  await page.goto(`${pf.baseUrl}/?harness=1&level=00-gym`);
  await page.waitForFunction(() => window.__HARNESS__?.version === 'HARNESS_API_V1', null, { timeout: 20000 });
  await page.evaluate(() => window.__HARNESS__!.start());
  const rows = [];
  // <= 40 m: the gym's critical path runs straight along +x from x=10 to the x=50 torii; further back it
  // turns into the spawn zig-zag and the framing would no longer face the gate.
  for (const d of [0, 2, 4, 6, 8, 12, 18.34, 25, 30, 40]) {
    const f = followFraming(path, torii, d, rig);
    const camDist = Math.hypot(torii[0] - f.cam[0], torii[1] - f.cam[1], torii[2] - f.cam[2]);
    rows.push({ ahead_m: d, cam_to_torii_m: +camDist.toFixed(2), accent_pct: +(await accentShare(page, f.cam, f.target, HEX[accent.default]!)).toFixed(3) });
  }
  await page.close();
  await pf.browser.close().catch(() => {});
  pf.server?.kill();
  writeFileSync(join(OUT, 'accent-area-curve.json'), `${JSON.stringify({ rig, torii, accent: accent.default, rows }, null, 2)}\n`);
  for (const r of rows) console.log(`  ahead ${String(r.ahead_m).padStart(6)} m · camera->torii ${String(r.cam_to_torii_m).padStart(6)} m · accent ${r.accent_pct}%`);
  process.exit(0);
}
mkdirSync(OUT, { recursive: true });
const results: Record<string, Record<string, { file: string; accentPct: number }>> = {};
const frames: Record<string, Record<string, Buffer>> = {};
try {
  for (const name of NAMES) {
    const page = await pf.browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${pf.baseUrl}/?harness=1&level=00-gym&accent=${name}`);
    await page.waitForFunction(() => window.__HARNESS__?.version === 'HARNESS_API_V1', null, { timeout: 20000 });
    const started = await page.evaluate(() => window.__HARNESS__!.start());
    if (!started.ok || errors.length) throw new Error(`${name}: ${started.error ?? errors.join(' | ')}`);
    const [r, g, b] = [1, 3, 5].map((k) => parseInt(HEX[name]!.slice(k, k + 2), 16));
    results[name] = {};
    frames[name] = {};
    for (const shot of SHOTS) {
      await page.evaluate(([p, t]) => {
        window.__HARNESS__!.setCamera(p, t);
        window.__HARNESS__!.advance(1);
      }, [shot.pos, shot.target] as const);
      const buf = await page.locator('canvas').first().screenshot();
      const png = PNG.sync.read(buf);
      let hits = 0;
      for (let i = 0; i < png.data.length; i += 4) {
        if (Math.abs(png.data[i]! - r!) <= TOL && Math.abs(png.data[i + 1]! - g!) <= TOL && Math.abs(png.data[i + 2]! - b!) <= TOL) hits++;
      }
      const file = `${name}-${shot.name}.png`;
      writeFileSync(join(OUT, file), buf);
      frames[name]![shot.name] = buf;
      results[name]![shot.name] = { file, accentPct: +((100 * hits) / (png.width * png.height)).toFixed(3) };
    }
    await page.close();
  }
} finally {
  await pf.browser.close().catch(() => {});
  pf.server?.kill();
}

// contact sheet: one row per candidate, one column per shot
const W = VIEWPORT.width;
const H = VIEWPORT.height;
const sheet = new PNG({ width: W * SHOTS.length, height: H * NAMES.length });
NAMES.forEach((name, row) =>
  SHOTS.forEach((shot, col) => {
    const src = PNG.sync.read(frames[name]![shot.name]!);
    PNG.bitblt(src, sheet, 0, 0, W, H, col * W, row * H);
  }),
);
writeFileSync(join(OUT, 'contact-sheet.png'), PNG.sync.write(sheet));

const report = {
  decision: 'PHASE-0-DECISIONS D-001 — candidates for the H2.5 feel test; this file chooses nothing',
  default: accent.default,
  budget: 'ACCENT_AREA band at the follow framing (D-003; assets/src/accent.json area) — the 1% ceiling is withdrawn',
  caveat: 'grey-box gym (lit primitives, blue sky), not the STYLE-BIBLE render',
  contactSheet: { file: 'contact-sheet.png', rows: NAMES, cols: SHOTS.map((s) => s.name) },
  shots: SHOTS,
  candidates: Object.fromEntries(NAMES.map((n) => [n, { hex: HEX[n], rejected: n in accent.must_fail, frames: results[n] }])),
};
writeFileSync(join(OUT, 'accent-renders.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`accent renders -> ${OUT.replace(`${ROOT}/`, '')}  (rows ${NAMES.join(', ')} · cols ${SHOTS.map((s) => s.name).join(', ')})`);
for (const n of NAMES) {
  console.log(`  ${n.padEnd(12)} ${HEX[n]}${n in accent.must_fail ? ' (REJECTED, comparison only)' : n === accent.default ? ' (default)' : ''}  accent area: ${SHOTS.map((s) => `${s.name} ${results[n]![s.name]!.accentPct}%`).join(' · ')}`);
}
