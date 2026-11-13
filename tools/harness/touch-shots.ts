// touch-shots (D-027) — the phone layout, for Tim to look at before it is deployed. Judges nothing; the touch
// stage judges. For each landscape size: play with the controls idle, the stick pushed with Jump held, the pause
// card, the results card, and the how-to-play page as a finger sees it; and one phone held upright (the title,
// and the notice a game waits under).
//
//   node tools/harness/touch-shots.ts <out dir> [--build] [--size=WxH,WxH]
//
// Serves the HARNESS bundle (dist-harness/) at the game's front door with ?touchprobe=1, as the touch stage does:
// the page is the real game with its own frame loop, driven by real touch events. One playtest or frame tool at a time.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { TOUCH_STAGE, fell, hands, openTouch, titleReady } from './touch.ts';

const ROOT = new URL('../..', import.meta.url).pathname;
const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const out = argv.find((a) => !a.startsWith('--'));
if (!out) { console.error('usage: node tools/harness/touch-shots.ts <out dir> [--build] [--size=WxH,...]'); process.exit(2); }
const SIZES = (flag('size') ?? TOUCH_STAGE.phones.map((p) => p.join('x')).join(',')).split(',').map((s) => s.split('x').map(Number) as [number, number]);
const PORT = 4334;

const run = (cmd: string, args: string[]): Promise<number> => new Promise((res) => spawn(cmd, args, { cwd: ROOT, stdio: 'inherit' }).on('exit', (c) => res(c ?? 1)));
if (argv.includes('--build') && (await run(join(ROOT, 'node_modules/.bin/vite'), ['build', '--mode', 'harness', '--outDir', 'dist-harness', '--emptyOutDir', '--logLevel', 'error'])) !== 0) process.exit(2);
const server = spawn(join(ROOT, 'node_modules/.bin/vite'), ['preview', '--outDir', 'dist-harness', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: ROOT });
await new Promise<void>((res, rej) => {
  let buf = '';
  const t = setTimeout(() => rej(new Error(`preview not ready: ${buf}`)), 20000);
  const on = (d: Buffer): void => { buf += d.toString(); if (buf.includes(String(PORT))) { clearTimeout(t); res(); } };
  server.stdout.on('data', on);
  server.stderr.on('data', on);
});
mkdirSync(out, { recursive: true });
const base = `http://127.0.0.1:${PORT}`;
let bad = 0;
try {
  for (const size of SIZES) {
    const tag = size.join('x');
    const t = await openTouch(base, { size });
    try {
      await titleReady(t);
      await t.tapOn('#title-play');
      await t.until((s) => s.state === 'play', 60000);
      await t.ticks(30);
      await t.page.screenshot({ path: join(out, `play-${tag}.png`) });
      const h = await hands(t);
      await h.stick('down', 0.55);
      await h.press('jump');
      await t.ticks(14);
      await t.page.screenshot({ path: join(out, `stick-jump-${tag}.png`) });
      await h.lift();
      await h.stickOff();
      await t.until((s) => s.state === 'play' && s.grounded, 15000);
      await t.tapOn('#touch-pause');
      await t.until((s) => s.state === 'pause', 8000);
      await t.page.waitForTimeout(300);
      await t.page.screenshot({ path: join(out, `pause-${tag}.png`) });
      const help = await t.page.evaluate(() => { const b = [...document.querySelectorAll<HTMLElement>('#touch-card button')].find((e) => e.textContent === 'How to play')!.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
      await t.thumbs.tap(help.x, help.y);
      await t.page.waitForFunction(() => { const i = document.querySelector<HTMLImageElement>('#help img'); return !document.getElementById('help')!.hidden && !!i && i.complete; }, null, { timeout: 15000 });
      await t.page.screenshot({ path: join(out, `howto-${tag}.png`) });
      // the controls' part of the page, scrolled to
      await t.page.evaluate(() => { const h2 = [...document.querySelectorAll('#help h2')].find((e) => e.textContent === 'Controls'); h2?.scrollIntoView({ block: 'start' }); });
      await t.page.waitForTimeout(200);
      await t.page.screenshot({ path: join(out, `howto-${tag}-controls.png`) });
      await t.tapOn('#help-back');
      const resume = await t.page.evaluate(() => { const b = [...document.querySelectorAll<HTMLElement>('#touch-card button')].find((e) => e.textContent === 'Resume')!.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
      await t.thumbs.tap(resume.x, resume.y);
      await t.until((s) => s.state === 'play', 8000);
      await t.page.evaluate((p) => window.__TOUCH_PROBE__!.place(p, -90), TOUCH_STAGE.goalStart);
      await t.ticks(8);
      const guard = (await t.snap()).enemies.at(-1);
      if (guard) await fell(t, guard.id, 'up');
      await h.stick('up', 0.55);
      const won = await t.until((s) => s.state === 'results', 30000);
      await h.stickOff();
      await t.page.waitForTimeout(300);
      await t.page.screenshot({ path: join(out, `results-${tag}.png`) });
      console.log(`${tag}: play, stick and jump, pause, how to play (2), ${won ? 'results' : 'NO RESULTS'}`);
      if (!won) bad++;
      if (t.errors.length) { bad++; console.log(`${tag}: page errors: ${t.errors.slice(0, 3).join(' | ')}`); }
    } finally {
      await t.close();
    }
  }
  // one phone held upright: the title as it always was, and a game waiting under the notice
  const [w, hgt] = SIZES[0]!;
  const up = await openTouch(base, { size: [hgt, w], dsf: 1 });
  try {
    await titleReady(up);
    await up.page.waitForTimeout(500);
    await up.page.screenshot({ path: join(out, `title-${hgt}x${w}.png`) });
    await up.tapOn('#title-play');
    await up.until((s) => s.state === 'pause', 60000);
    await up.page.waitForTimeout(300);
    await up.page.screenshot({ path: join(out, `upright-${hgt}x${w}.png`) });
    console.log(`${hgt}x${w}: title, and the turn-your-phone notice`);
  } finally {
    await up.close();
  }
} finally {
  server.kill();
}
process.exit(bad ? 1 : 0);
