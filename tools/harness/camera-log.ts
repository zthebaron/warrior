// camera-log — what the follow camera does along a level's recorded run, tick by tick. It judges nothing:
// it is the instrument behind the camera-room stage (tools/harness/camera-room.ts), for looking at one stretch.
// It runs whatever bundle is in dist-harness/: pass --build after a change to src/.
//
//   node tools/harness/camera-log.ts <level> [--build] [--yaw=follow|fixed] [--hold=off] [--from=tick] [--to=tick] [--every=N]
//                                   [--script=wall12|corridor] [--shot=tick --out=file.png [--size=WxH] [--gpu]]
//
//   --yaw=follow   (default) the camera is turned behind the warrior's facing, as camera-room turns it
//   --yaw=fixed    the camera keeps the yaw it spawned with (what the nav bot's run looks like)
//   --from/--to    print only these ticks (default: every tick where the arm is under the stage's floor)
//   --every=N      print every Nth tick of the range (default 1)
//   --hold=off     the rig as it was before CAMERA-WALL-ZOOM (?pivothold=off): the pivot is not held in the open
//   --script=      chapter 2 only: the recorded run up to a wall, then a PLAYER's arrival (run at it, hold into
//                  it, let go, start the move). wall12: the first climb face. corridor: the wall-jump corridor
//   --shot=tick    play to that tick and save the frame the player sees (--out, --size, default 1920x1080);
//                  --gpu draws it in headed Chrome on this machine's GPU, as tools/harness/frame.ts --gpu does
//
// One playtest, frame or log at a time: it uses the preview port.
import { readFileSync } from 'node:fs';
import { preflight } from './preflight.ts';
import { sampleRun, stretchesOf, describe, CAMERA_ROOM, type CameraSample } from './camera-room.ts';
import type { Ctx } from './lib.ts';
import type { Trace } from './replay.ts';

const ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const [lvl] = argv.filter((a) => !a.startsWith('--'));
if (!lvl) {
  console.error('usage: node tools/harness/camera-log.ts <level> [--build] [--yaw=follow|fixed] [--hold=off] [--from=tick] [--to=tick] [--every=N] [--script=wall12|corridor] [--shot=tick --out=file.png [--size=WxH] [--gpu]]');
  process.exit(2);
}
const level = JSON.parse(readFileSync(`${ROOT}/levels/${lvl}.json`, 'utf8'));
const trace = JSON.parse(readFileSync(`${ROOT}/tools/harness/traces/${lvl}.json`, 'utf8')) as Trace;
const pf = await preflight(ROOT, { skipBuild: !argv.includes('--build') });
if (!pf.browser || !pf.baseUrl) {
  for (const c of pf.result.checks) if (!c.ok) console.error(`preflight: ${c.name}: ${c.detail}`);
  process.exit(1);
}
const ctx = { browser: pf.browser, baseUrl: pf.baseUrl, levelId: lvl, level, root: ROOT, args: {}, log: console.log } as unknown as Ctx;
// --script: the recorded run up to a wall, then the arrival a PLAYER makes (the bot never stops): run at the wall,
// hold into it, let go, then start the move. Chapter 2 only; the ticks are that trace's.
const N = { x: 0, y: 0, jump: false, dash: false, sprint: false, slash: false };
const rep = (f: Partial<typeof N>, n: number): (typeof N)[] => Array.from({ length: n }, () => ({ ...N, ...f }));
const T = trace.frames as (typeof N)[];
const SCRIPTS: Record<string, () => (typeof N)[]> = {
  // the first climb face (x = 12, +4.5): the trace runs at it and jumps on tick 90, 2 u short
  wall12: () => [...T.slice(0, 90), ...rep({ x: 1 }, 150), ...rep({}, 60), ...rep({ x: 1, jump: true }, 24), ...rep({ x: 1 }, 1), ...rep({ x: 1, jump: true }, 30), ...rep({ x: 1 }, 30)],
  // the wall-jump corridor (wall at z = -3.5, shelf at z = 0): the trace starts the wall move on tick 347, 1.5 u off the wall
  corridor: () => [...T.slice(0, 347), ...rep({ y: -1 }, 90), ...rep({}, 60), ...rep({ y: -1, jump: true }, 24), ...rep({ y: -1 }, 1), ...rep({ y: -1, jump: true }, 1), ...rep({ y: 1, jump: true }, 29), ...rep({ x: 1 }, 30)],
};
const script = flag('script');
if (script && (!SCRIPTS[script] || lvl !== '02-cliff-seam')) { console.error(`--script is one of ${Object.keys(SCRIPTS).join(', ')}, on 02-cliff-seam`); process.exit(2); }
const frames = script ? SCRIPTS[script]!() : trace.frames;
// --shot=tick --out=file.png [--size=WxH] [--gpu]: play to that tick and save the frame the player sees there
if (flag('shot')) {
  const { chromium } = await import('@playwright/test');
  const [width, height] = (flag('size') ?? '1920x1080').split('x').map(Number) as [number, number];
  const GPU_ARGS = ['--use-angle=metal', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
  const real = argv.includes('--gpu') ? await chromium.launch({ headless: false, channel: 'chrome', args: [...GPU_ARGS, `--window-size=${width},${height}`, '--window-position=0,0'] }) : null;
  const page = await (real ?? pf.browser).newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto(`${pf.baseUrl}/?harness=1&level=${lvl}${flag('hold') === 'off' ? '&pivothold=off' : ''}`);
  await page.waitForFunction(() => window.__HARNESS__?.version === 'HARNESS_API_V1');
  await page.evaluate(() => window.__HARNESS__!.start());
  const pose = await page.evaluate(([fr, follow, turnPerTick, sens]) => {
    const H = window.__HARNESS__!;
    H.setInput(null);
    fr.forEach((f, i) => {
      H.step(f, i === fr.length - 1);
      if (!follow) return;
      const err = ((((H.facing() - H.cameraPose().yawDeg) % 360) + 540) % 360) - 180;
      const turn = Math.max(-turnPerTick, Math.min(turnPerTick, err));
      if (turn) H.look(-(turn * Math.PI) / 180 / sens, 0);
    });
    H.redraw();
    return { ...H.cameraPose(), feet: H.snapshot().feet };
  }, [frames.slice(0, Number(flag('shot'))), flag('yaw') !== 'fixed', CAMERA_ROOM.turnDegPerSec / 60, CAMERA_ROOM.mouseSensitivity] as const);
  const gpu = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
  });
  if (real && /swiftshader|llvmpipe|software/i.test(gpu)) { console.error(`--gpu got a software renderer (${gpu}): no frame written`); process.exit(1); }
  const { writeFileSync } = await import('node:fs');
  writeFileSync(flag('out')!, await page.locator('canvas').first().screenshot());
  console.log(`${flag('out')}  ${width}x${height}  tick ${flag('shot')}  feet ${pose.feet.map((n) => n.toFixed(2)).join(',')}  arm ${pose.arm.toFixed(2)}  view pitch ${pose.viewPitchDeg.toFixed(1)}  ${gpu}`);
  await real?.close();
  await pf.browser.close();
  pf.server?.kill();
  process.exit(0);
}
const { samples } = await sampleRun(ctx, frames, flag('yaw') !== 'fixed', flag('hold') !== 'off');
const from = flag('from') === undefined ? null : Number(flag('from')), to = Number(flag('to') ?? Infinity), every = Number(flag('every') ?? 1);
const floor = CAMERA_ROOM.minArmShare * CAMERA_ROOM.restArm;
const row = (s: CameraSample): string =>
  `t${String(s.tick).padStart(5)} feet (${s.feet.map((n) => n.toFixed(2)).join(', ')}) vel (${s.vel.map((n) => n.toFixed(1)).join(', ')}) ${s.pstate.padEnd(11)} facing ${s.facingDeg.toFixed(0).padStart(5)} yaw ${s.yawDeg.toFixed(0).padStart(5)} pitch ${s.pitchDeg.toFixed(1).padStart(5)} arm ${s.arm.toFixed(2)} (${((s.arm / CAMERA_ROOM.restArm) * 100).toFixed(0).padStart(3)}%) figure x ${s.fig.x0.toFixed(2)}..${s.fig.x1.toFixed(2)} y ${s.fig.y0.toFixed(2)}..${s.fig.y1.toFixed(2)} near ${s.fig.nearM.toFixed(2)}${s.cropped ? ' CROPPED' : ''}`;
// every stretch of consecutive ticks under the floor or cropped, at its shortest arm, and what the arm meets there
for (const x of stretchesOf(samples, level.geometry)) console.log(`STRETCH ${describe(x)}`);
let n = 0;
if (argv.includes('--ticks') || from !== null) for (const s of samples) {
  if (from === null ? !(s.arm < floor || s.cropped) : s.tick < from || s.tick > to) continue;
  if (n++ % every === 0) console.log(row(s));
}
const worst = samples.reduce((a, b) => (b.arm < a.arm ? b : a));
console.log(`\n${lvl}: ${samples.length} ticks, camera ${flag('yaw') === 'fixed' ? 'at its spawn yaw' : 'turned behind the facing'}; rest arm ${CAMERA_ROOM.restArm}, floor ${floor.toFixed(2)} (${CAMERA_ROOM.minArmShare * 100}%)`);
console.log(`under the floor on ${samples.filter((s) => s.arm < floor).length} ticks, cropped on ${samples.filter((s) => s.cropped).length}; shortest arm:`);
console.log(row(worst));
await pf.browser.close();
pf.server?.kill();
process.exit(0);
