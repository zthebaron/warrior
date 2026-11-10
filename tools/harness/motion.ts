// motion — the figure in motion in the game, as strips of frames (D-021, B-45). It judges nothing: it is how
// a clip is LOOKED AT before it is given to a player state, and how a held frame is chosen.
//
//   node tools/harness/motion.ts <out dir> [--only=name,name] [--cell=WxH] [--build]
//   node tools/harness/motion.ts <out dir> --clips[=name,name] [--frames=N]     every clip, N frames evenly through it
//
// Each scene teleports the player, plays scripted input through the real player (the same step() the nav bot
// uses), and shoots a close camera every few ticks. One PNG per scene, eight frames a row, in tick order; the
// tick and the player's state of every frame are printed. The camera is fixed in the world relative to the
// player's feet at each shot, so the figure stays in frame and the ground is seen moving under it.
//
// Runs in the harness's own Chromium (SwiftShader). One playtest, frame or motion run at a time (the port).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { preflight } from './preflight.ts';
import type { Vec3 } from './lib.ts';

const ROOT = new URL('../..', import.meta.url).pathname;
const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const outDir = argv.find((a) => !a.startsWith('--'));
if (!outDir) {
  console.error('usage: node tools/harness/motion.ts <out dir> [--only=name,name] [--cell=WxH] [--build]');
  process.exit(2);
}
const [cw, ch] = (flag('cell') ?? '240x300').split('x').map(Number) as [number, number];
const only = flag('only')?.split(',');
const COLS = 8;

interface Input { x: number; y: number; jump: boolean; dash: boolean; sprint: boolean }
const N: Input = { x: 0, y: 0, jump: false, dash: false, sprint: false };
/** [ticks, input]: hold that input for that many ticks */
type Script = [number, Partial<Input>][];
interface Scene { name: string; level: string; at: Vec3; yaw: number; cam: Vec3; every: number; settle: number; script: Script }

// cam: where the camera stands from the player's feet (u, world axes); it looks at the figure's middle.
const SCENES: Scene[] = [
  { name: 'idle', level: '01-lower-stair', at: [2, 0, 0], yaw: -90, cam: [0.9, 1.1, 2.5], every: 20, settle: 30, script: [[160, {}]] },
  { name: 'walk', level: '01-lower-stair', at: [44, 5.5, 0], yaw: -90, cam: [0.9, 1.1, 2.5], every: 4, settle: 30, script: [[64, { x: 0.4 }]] },
  { name: 'run', level: '01-lower-stair', at: [44, 5.5, 0], yaw: -90, cam: [0.9, 1.1, 2.5], every: 3, settle: 30, script: [[48, { x: 1 }]] },
  { name: 'jump', level: '01-lower-stair', at: [44, 5.5, 0], yaw: -90, cam: [0.9, 1.2, 2.7], every: 3, settle: 30, script: [[12, { x: 1 }], [30, { x: 1, jump: true }], [30, { x: 1 }]] },
  { name: 'double', level: '01-lower-stair', at: [44, 5.5, 0], yaw: -90, cam: [0.9, 1.3, 2.9], every: 3, settle: 30, script: [[6, { x: 1 }], [16, { x: 1, jump: true }], [3, { x: 1 }], [22, { x: 1, jump: true }], [40, { x: 1 }]] },
  { name: 'drop', level: '01-lower-stair', at: [48, 12, 0], yaw: -90, cam: [0.9, 1.1, 2.6], every: 3, settle: 0, script: [[72, {}]] },
  { name: 'dash', level: '01-lower-stair', at: [44, 5.5, 0], yaw: -90, cam: [0.9, 1.1, 2.5], every: 2, settle: 30, script: [[10, { x: 1 }], [4, { x: 1, dash: true }], [34, { x: 1 }]] },
  { name: 'wall', level: '01-lower-stair', at: [54, 5.5, -2.4], yaw: -90, cam: [2.4, 1.2, 1.4], every: 3, settle: 30, script: [[26, { y: -1, jump: true }], [30, { y: -1 }], [3, { y: -1, jump: true }], [36, {}]] },
  { name: 'ledge', level: '00-gym', at: [-5, 0, 3.6], yaw: 180, cam: [2.5, 1.3, -1.0], every: 3, settle: 30, script: [[30, { y: 1, jump: true }], [24, { y: 1 }], [3, { jump: true }], [45, {}]] },
];

const clipsArg = argv.find((a) => a === '--clips' || a.startsWith('--clips='));
const pf = await preflight(ROOT, { skipBuild: !argv.includes('--build') });
if (!pf.browser || !pf.baseUrl) {
  for (const c of pf.result.checks) if (!c.ok) console.error(`preflight: ${c.name}: ${c.detail}`);
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
const errors: string[] = [];
let loaded = '';
let page = await pf.browser.newPage({ viewport: { width: cw, height: ch }, deviceScaleFactor: 1 });

if (clipsArg) {
  // every clip at N times evenly through it, on the still figure: one row a clip. The times are printed.
  const frames = Number(flag('frames') ?? COLS);
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${pf.baseUrl}/?harness=1&level=01-lower-stair`);
  await page.waitForFunction(() => window.__HARNESS__?.version === 'HARNESS_API_V1');
  await page.evaluate(() => window.__HARNESS__!.start());
  const all = await page.evaluate(() => {
    const H = window.__HARNESS__!;
    H.teleportPlayer([64, 5.5, 1.5]);
    H.advance(30, 0);
    const f = H.snapshot().feet;
    H.setCamera([f[0] + 2.6, f[1] + 1.2, f[2] + 1.6], [f[0], f[1] + 1, f[2]]); // three-quarter view, the void behind
    return H.figureClips();
  });
  const want = clipsArg.includes('=') ? clipsArg.split('=')[1]!.split(',') : all.map((c) => c.name);
  const rows = all.filter((c) => want.includes(c.name));
  const sheet = new PNG({ width: frames * cw, height: rows.length * ch });
  for (const [r, c] of rows.entries()) {
    const times: string[] = [];
    for (let k = 0; k < frames; k++) {
      const t = frames > 1 ? (c.duration * k) / (frames - 1) : 0;
      await page.evaluate(([name, time]) => { window.__HARNESS__!.showFigure(name, time); window.__HARNESS__!.redraw(); }, [c.name, t] as const);
      const img = PNG.sync.read(await page.locator('canvas').first().screenshot());
      PNG.bitblt(img, sheet, 0, 0, Math.min(cw, img.width), Math.min(ch, img.height), k * cw, r * ch);
      times.push(t.toFixed(3));
    }
    console.log(`row ${r}  ${c.name.padEnd(6)} ${c.duration.toFixed(3)} s   ${times.join('  ')}`);
  }
  await page.evaluate(() => window.__HARNESS__!.showFigure(null));
  const file = join(outDir, 'clips.png');
  writeFileSync(file, PNG.sync.write(sheet));
  console.log(file);
  await pf.browser.close();
  pf.server?.kill();
  process.exit(errors.length ? 1 : 0);
}

for (const s of SCENES) {
  if (only && !only.includes(s.name)) continue;
  if (loaded !== s.level) {
    await page.close();
    page = await pf.browser.newPage({ viewport: { width: cw, height: ch }, deviceScaleFactor: 1 });
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
    await page.goto(`${pf.baseUrl}/?harness=1&level=${s.level}`);
    await page.waitForFunction(() => window.__HARNESS__?.version === 'HARNESS_API_V1');
    const started = await page.evaluate(() => window.__HARNESS__!.start());
    if (!started.ok) { console.error(`${s.level} failed to load: ${started.error}`); process.exit(1); }
    loaded = s.level;
  }
  await page.evaluate(([p, yaw, n]) => {
    const H = window.__HARNESS__!;
    H.releaseCamera();
    H.setInput(null);
    H.teleportPlayer(p);
    H.cameraYaw(yaw);
    if (n > 0) H.advance(n, 0);
  }, [s.at, s.yaw, s.settle] as const);
  const shots: Buffer[] = [];
  const log: string[] = [];
  let tick = 0;
  for (const [n, part] of s.script) {
    const input = { ...N, ...part };
    for (let i = 0; i < n; i++, tick++) {
      const shoot = tick % s.every === 0;
      const snap = await page.evaluate(([inp, cam, draw]) => {
        const H = window.__HARNESS__!;
        const f = H.snapshot().feet;
        if (draw) H.setCamera([f[0] + cam[0], f[1] + cam[1], f[2] + cam[2]], [f[0], f[1] + 1, f[2]]);
        return H.step(inp, draw);
      }, [input, s.cam, shoot] as const);
      if (shoot) {
        // the step drew the tick BEFORE it moved the camera's target: draw this tick again, aimed at where the figure now is
        await page.evaluate((cam) => {
          const H = window.__HARNESS__!;
          const f = H.snapshot().feet;
          H.setCamera([f[0] + cam[0], f[1] + cam[1], f[2] + cam[2]], [f[0], f[1] + 1, f[2]]);
          H.redraw();
        }, s.cam);
        shots.push(await page.locator('canvas').first().screenshot());
        log.push(`${String(shots.length - 1).padStart(2)}:t${tick}:${snap.pstate}`);
      }
    }
  }
  await page.evaluate(() => window.__HARNESS__!.setInput(null));
  const rows = Math.ceil(shots.length / COLS);
  const sheet = new PNG({ width: COLS * cw, height: rows * ch });
  sheet.data.fill(255);
  shots.forEach((b, k) => {
    const img = PNG.sync.read(b);
    PNG.bitblt(img, sheet, 0, 0, Math.min(cw, img.width), Math.min(ch, img.height), (k % COLS) * cw, Math.floor(k / COLS) * ch);
  });
  const file = join(outDir, `motion-${s.name}.png`);
  writeFileSync(file, PNG.sync.write(sheet));
  console.log(`${file}  ${shots.length} frames, every ${s.every} ticks\n  ${log.join('  ')}`);
}
if (errors.length) console.error(`console errors: ${errors.slice(0, 5).join(' | ')}`);
await pf.browser.close();
pf.server?.kill();
process.exit(errors.length ? 1 : 0);
