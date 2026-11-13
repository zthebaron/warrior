// frame — one frame of a level at any size, from a fixed camera or from the follow rig behind the player.
// For looking at the art (build-log sheets, display-size screenshots); it judges nothing.
//
//   node tools/harness/frame.ts <level> <out.png> [--size=WxH] [--cam=x,y,z --target=x,y,z] [--at=x,y,z --yaw=deg]
//                               [--paint=off] [--settle=N] [--build] [--gpu]
//
//   --cam/--target   a fixed camera (the six visual cameras are printed by --list)
//   --at/--yaw       put the player's FEET at a point, turn the follow rig to face yaw degrees, let it settle.
//                    With --cam/--target as well: the player is put there and the frame is taken from that camera
//   --paint=off      the ink pass alone (D-020)
//   --build          rebuild the bundles first; otherwise dist-harness/ must already match the source
//   --list           print the level's visual cameras and critical path, then exit
//   --gpu            draw it in HEADED Chrome on this machine's real GPU, launched as tools/measure-display.mjs
//                    launches it. For display sizes: at 5120x1440 SwiftShader draws the whole ink pass black
//                    (seen on chapter 2 and chapter 1 alike, D-023), so a frame that size needs this. It refuses
//                    a software renderer. Opens a window.
//
// Without --gpu it runs in the harness's own Chromium (SwiftShader), so a frame here is what the goldens are made of.
// One playtest or frame at a time: it uses the preview port.
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { preflight } from './preflight.ts';
import { cameras } from './visual.ts';
import type { Vec3 } from './lib.ts';

const ROOT = new URL('../..', import.meta.url).pathname;
const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const has = (name: string): boolean => argv.includes(`--${name}`);
const [lvl, out] = argv.filter((a) => !a.startsWith('--'));
const vec = (s: string | undefined): Vec3 | null => (s ? (s.split(',').map(Number) as Vec3) : null);
if (!lvl || (!out && !has('list'))) {
  console.error('usage: node tools/harness/frame.ts <level> <out.png> [--size=WxH] [--cam=x,y,z --target=x,y,z] [--at=x,y,z --yaw=deg] [--paint=off] [--settle=N] [--build] [--list]');
  process.exit(2);
}
const level = JSON.parse(readFileSync(`${ROOT}levels/${lvl}.json`, 'utf8'));
if (has('list')) {
  for (const c of cameras(level)) console.log(`${c.name}: --cam=${c.pos.join(',')} --target=${c.target.join(',')}`);
  level.critical_path.forEach((w: Vec3 | { pos: Vec3 }, i: number) => console.log(`path[${i}]: ${(Array.isArray(w) ? w : w.pos).join(',')}`));
  process.exit(0);
}
const [width, height] = (flag('size') ?? '640x360').split('x').map(Number) as [number, number];
const cam = vec(flag('cam')), target = vec(flag('target')), at = vec(flag('at'));
const yaw = Number(flag('yaw') ?? 0), settle = Number(flag('settle') ?? 90);

const pf = await preflight(ROOT, { skipBuild: !has('build') });
if (!pf.browser || !pf.baseUrl) {
  for (const c of pf.result.checks) if (!c.ok) console.error(`preflight: ${c.name}: ${c.detail}`);
  process.exit(1);
}
// --gpu: the same launch as tools/measure-display.mjs (ANGLE on Metal, a window the size of the frame)
const GPU_ARGS = ['--use-angle=metal', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
const real = has('gpu') ? await chromium.launch({ headless: false, channel: 'chrome', args: [...GPU_ARGS, `--window-size=${width},${height}`, '--window-position=0,0'] }) : null;
const page = await (real ?? pf.browser).newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
const errors: string[] = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
await page.goto(`${pf.baseUrl}/?harness=1&level=${lvl}`);
await page.waitForFunction(() => window.__HARNESS__?.version === 'HARNESS_API_V1');
const started = await page.evaluate(() => window.__HARNESS__!.start());
if (!started.ok) { console.error(`level failed to load: ${started.error}`); process.exit(1); }
if (flag('paint') === 'off') await page.evaluate(() => window.__HARNESS__!.paintLayer(false));
if (at) {
  await page.evaluate(([p, y, n]) => {
    const H = window.__HARNESS__!;
    H.releaseCamera();
    H.teleportPlayer(p);
    H.cameraYaw(y);
    H.advance(n, 0); // let the player land and the spring arm come to rest; draws the last frame
  }, [at, yaw, settle] as const);
  if (cam && target) await page.evaluate((v) => { window.__HARNESS__!.setCamera(v.pos, v.target); window.__HARNESS__!.advance(1); }, { pos: cam, target });
} else {
  const c = cam && target ? { pos: cam, target } : cameras(level)[2]!;
  await page.evaluate((v) => { window.__HARNESS__!.setCamera(v.pos, v.target); window.__HARNESS__!.advance(1); }, c);
}
const pose = await page.evaluate(() => window.__HARNESS__!.cameraPose());
const gpu = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const ext = gl?.getExtension('WEBGL_debug_renderer_info');
  return gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
});
if (real && /swiftshader|llvmpipe|software/i.test(gpu)) { console.error(`--gpu got a software renderer (${gpu}): no frame written`); await real.close(); await pf.browser.close(); pf.server?.kill(); process.exit(1); }
writeFileSync(out!, await page.locator('canvas').first().screenshot());
console.log(`${out}  ${width}x${height}  camera ${pose.pos.map((n) => n.toFixed(2)).join(',')}  paint ${flag('paint') === 'off' ? 'off' : 'on'}  ${gpu}`);
if (errors.length) console.error(`console errors: ${errors.slice(0, 5).join(' | ')}`);
await real?.close();
await pf.browser.close();
pf.server?.kill();
process.exit(errors.length ? 1 : 0);
