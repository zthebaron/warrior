// scan-frame — render the ACCENT_AREA scanning frame (D-006) for any two points, to SEE why a torii is
// or is not found. Written while authoring chapter 1: ACCENT_AREA reported 0.0000% and only the render
// showed the cause (the previous torii's crossbeams plus a ledge lip hiding the next gate).
//   node tools/harness/scan-frame.ts <level> fx fy fz tx ty tz out.png   (needs a built dist-harness/)
import { writeFileSync } from 'node:fs';
import { preflight } from './preflight.ts';
import { followRig, scanningFraming } from './accent.ts';
const ROOT = new URL('../..', import.meta.url).pathname;
const [lvl, fx, fy, fz, tx, ty, tz, out] = process.argv.slice(2);
const pf = await preflight(ROOT, { skipBuild: true });
const page = await pf.browser!.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
await page.goto(`${pf.baseUrl}/?harness=1&level=${lvl}`);
await page.waitForFunction(() => !!window.__HARNESS__);
await page.evaluate(() => window.__HARNESS__!.start());
const f = scanningFraming([+fx!, +fy!, +fz!], [+tx!, +ty!, +tz!], followRig(ROOT));
await page.evaluate(([c, t]) => { window.__HARNESS__!.setCamera(c, t); window.__HARNESS__!.advance(1); }, [f.cam, f.target] as const);
writeFileSync(out!, await page.locator('canvas').first().screenshot());
console.log('cam', f.cam.map((v) => v.toFixed(2)).join(','), 'dist', f.dist.toFixed(1));
await pf.browser!.close(); pf.server?.kill(); process.exit(0);
