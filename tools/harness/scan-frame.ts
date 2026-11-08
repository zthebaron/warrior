// scan-frame — render the ACCENT_AREA scan (D-006, D-012) for any two points and SEE why a torii is or
// is not found. Sweeps the same reachable pitches as the `accent` stage (the rig's clamp, the arm pulled
// in by its own collision), prints this gate's accent share at each, and writes the BEST frame.
// Written while authoring chapter 1: ACCENT_AREA said 0.0000% and only the render showed the cause.
//   node tools/harness/scan-frame.ts <level> fx fy fz tx ty tz out.png   (needs a built dist-harness/)
import { writeFileSync } from 'node:fs';
import { preflight } from './preflight.ts';
import { followRig, loadAccentConfig, placementAccentShare, scanArm, scanPitches, scanningFraming } from './accent.ts';
import type { Vec3 } from './lib.ts';

const ROOT = new URL('../..', import.meta.url).pathname;
const [lvl, fx, fy, fz, tx, ty, tz, out] = process.argv.slice(2);
const from: Vec3 = [+fx!, +fy!, +fz!];
const to: Vec3 = [+tx!, +ty!, +tz!];
const rig = followRig(ROOT);
const acc = loadAccentConfig(ROOT);
const hex = acc.candidates[acc.default]!;
const pf = await preflight(ROOT, { skipBuild: true });
const page = await pf.browser!.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
await page.goto(`${pf.baseUrl}/?harness=1&level=${lvl}`);
await page.waitForFunction(() => !!window.__HARNESS__);
await page.evaluate(() => window.__HARNESS__!.start());
const f = scanningFraming(from, to, rig);
let best = { pct: -1, pitch: rig.pitchDeg, cam: f.cam };
for (const p of scanPitches(rig)) {
  const cam = await page.evaluate(([pv, dir]) => window.__HARNESS__!.rigCamera(pv, dir), [f.target, scanArm(from, to, p)] as const);
  const pct = await placementAccentShare(page, 'kit_torii', to, cam, f.target, hex);
  console.log(`pitch ${p.toFixed(1).padStart(6)} deg  ${pct.toFixed(4)}%${p === rig.pitchDeg ? '  (rest)' : ''}`);
  if (pct > best.pct) best = { pct, pitch: p, cam };
}
await page.evaluate(([c, t]) => { window.__HARNESS__!.setCamera(c, t); window.__HARNESS__!.advance(1); }, [best.cam, f.target] as const);
writeFileSync(out!, await page.locator('canvas').first().screenshot());
console.log(`best: pitch ${best.pitch.toFixed(1)} deg, ${best.pct.toFixed(4)}% (floor ${acc.area.floor_pct}%), ${f.dist.toFixed(1)} m -> ${out}`);
await pf.browser!.close();
pf.server?.kill();
process.exit(0);
