// shell-shots — the title screen and the how-to-play page as a player's browser draws them, at the sizes D-022
// names (a 400 px phone, a 1080p monitor, Tim's 5120x1440 ultrawide) and the two B-59 was found at (a near-square
// window, 1000x900, and a tablet held upright, 810x1010). For looking at; it judges two things only,
// because they can be measured: at every size the title painting's keep zone (the lettering, the seal and the
// boat) is wholly on screen, and no button or credit line is cut off by the edge of the screen. D-025: it also
// shoots the chapter list at every size (no button of it may be cut off), and with --teach the teach line as a
// player meets it, in the game, at the first size given.
//
//   node tools/harness/shell-shots.ts <out dir> [--build] [--size=WxH,WxH...] [--teach]
//
// Serves the PRODUCTION bundle (dist/) at the bare URL, as reachable does. One playtest or frame tool at a time.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { CHROMIUM_ARGS } from './lib.ts';
import { chaptersFit, keepZone, titleFit } from './title-fit.ts';

const ROOT = new URL('../..', import.meta.url).pathname;
const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const out = argv.find((a) => !a.startsWith('--'));
if (!out) { console.error('usage: node tools/harness/shell-shots.ts <out dir> [--build] [--size=WxH,...]'); process.exit(2); }
const SIZES = (flag('size') ?? '400x800,1920x1080,5120x1440,1000x900,810x1010').split(',').map((s) => s.split('x').map(Number) as [number, number]);
const PORT = 4319; // beside preflight's 4317 and reachable's 4318
const KEEP = keepZone(ROOT);

const run = (cmd: string, args: string[]): Promise<number> => new Promise((res) => spawn(cmd, args, { cwd: ROOT, stdio: 'inherit' }).on('exit', (c) => res(c ?? 1)));
if (argv.includes('--build') && (await run(join(ROOT, 'node_modules/.bin/vite'), ['build'])) !== 0) process.exit(2);
const server = spawn(join(ROOT, 'node_modules/.bin/vite'), ['preview', '--outDir', 'dist', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: ROOT });
await new Promise<void>((res, rej) => {
  let buf = '';
  const t = setTimeout(() => rej(new Error(`preview not ready: ${buf}`)), 20000);
  const on = (d: Buffer): void => { buf += d.toString(); if (buf.includes(String(PORT))) { clearTimeout(t); res(); } };
  server.stdout.on('data', on);
  server.stderr.on('data', on);
});

mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: CHROMIUM_ARGS });
let bad = 0;
try {
  for (const [width, height] of SIZES) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForFunction(() => document.documentElement.dataset['shell'] === 'ready', null, { timeout: 60000 });
    const m = await titleFit(page, KEEP); // waits for the painting and the fonts
    const whole = m.whole;
    const size = `${width}x${height}`;
    await page.screenshot({ path: join(out, `title-${size}.png`) });
    if (!whole) console.log(`${size}  box ${JSON.stringify(m.box)} top ${m.top} bottom ${m.bottom}`);
    console.log(`${size}  keep zone x ${m.keepLeft.toFixed(0)}..${m.keepRight.toFixed(0)} of 0..${width}, painting y ${m.top.toFixed(0)}..${m.bottom.toFixed(0)} of 0..${height}: ${whole ? 'whole' : 'CROPPED'}${m.cut.length ? `; CUT OFF: ${m.cut.join(', ')}` : ''}`);
    if (!whole || m.cut.length) bad++;

    await page.click('#title-help');
    await page.waitForFunction(() => { const i = document.querySelector<HTMLImageElement>('#help img'); return !!i && i.complete && i.naturalWidth > 0; });
    await page.screenshot({ path: join(out, `howto-${size}.png`) });
    const scroll = await page.evaluate(() => { const h = document.getElementById('help')!; return { view: h.clientHeight, all: h.scrollHeight }; });
    for (let i = 1, y = scroll.view * 0.85; y < scroll.all - 1 && i < 8; i++, y += scroll.view * 0.85) {
      await page.evaluate((top) => { document.getElementById('help')!.scrollTop = top; }, y);
      await page.screenshot({ path: join(out, `howto-${size}-${i + 1}.png`) });
    }
    // D-025: the chapter list, opened from the title (the how-to-play page is shut first: it was shot above)
    await page.click('#help-back');
    await page.click('#title-chapters');
    await page.waitForFunction(() => document.querySelectorAll('#chapters-list button').length > 0, null, { timeout: 20000 });
    const list = await chaptersFit(page);
    await page.screenshot({ path: join(out, `chapters-${size}.png`) });
    console.log(`${size}  chapter list: ${list.rows} chapters${list.cut.length ? `; CUT OFF: ${list.cut.join(', ')}` : ', every button on screen'}`);
    if (!list.rows || list.cut.length) bad++;
    if (errors.length) { bad++; console.log(`${size}  console errors: ${errors.slice(0, 3).join(' | ')}`); }
    await page.close();
  }

  // D-025, --teach: the teach line as a player meets it, at the first size given. Driven with real keys on the
  // production page, as reachable drives it: the walking line and the first swordsman's at the start of chapter 1,
  // then (through the chapter list) the ledge-grab line at chapter 2's first face and the hang's line on its ledge.
  if (argv.includes('--teach')) {
    const [width, height] = SIZES[0]!;
    const size = `${width}x${height}`;
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    const lineIs = (move: string, ms = 30000): Promise<unknown> => page.waitForFunction((m) => { const t = document.getElementById('teach'); return !!t && t.getClientRects().length > 0 && t.dataset['move'] === m; }, move, { timeout: ms });
    const said = (): Promise<string> => page.evaluate(() => document.getElementById('teach')?.textContent ?? '');
    const shot = async (name: string): Promise<void> => { await page.screenshot({ path: join(out, `${name}-${size}.png`) }); console.log(`${size}  ${name}: ${JSON.stringify(await said())}`); };
    const levelIs = (n: number): Promise<unknown> => page.waitForFunction((want) => (document.body.dataset['level'] ?? '').startsWith(want), `0${n}-`, { timeout: 60000 });
    const titleGone = (): Promise<unknown> => page.waitForFunction(() => document.getElementById('title')?.hidden === true, null, { timeout: 20000 });
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForFunction(() => document.documentElement.dataset['shell'] === 'ready', null, { timeout: 60000 });
    try {
      // chapter 1: how to move, then (a step toward him) the first swordsman
      await page.keyboard.press('Enter');
      await levelIs(1);
      await titleGone();
      await lineIs('ground');
      await shot('teach-ch1-start');
      await page.keyboard.down('KeyW');
      await lineIs('fight');
      await page.keyboard.up('KeyW');
      await page.keyboard.down('KeyD'); // a step to the side: he stands straight ahead, behind the warrior's own back
      await page.waitForTimeout(260);
      await page.keyboard.up('KeyD');
      await page.waitForTimeout(250);
      await shot('teach-ch1-first-swordsman');
      // chapter 2, by the list in the how-to-play page: the first face
      // H is refused while a fallen warrior waits to stand again (the swordsman may have cut him down by now): pressed until the page opens
      for (let i = 0, open = false; i < 10 && !open; i++) {
        await page.keyboard.press('KeyH');
        open = await page.waitForFunction(() => document.getElementById('help')?.hidden === false, null, { timeout: 1500 }).then(() => true).catch(() => false);
      }
      await page.click('#help-chapters');
      await page.click('#chapters-list [data-level^="02-"]');
      await levelIs(2);
      await page.waitForFunction(() => document.getElementById('hud')?.textContent === '', null, { timeout: 20000 });
      await page.keyboard.down('KeyW');
      await lineIs('climb');
      await page.waitForTimeout(6000); // run up to the wall and stand against it
      await shot('teach-ch2-first-face');
      for (let i = 0; i < 8; i++) {
        await page.keyboard.down('Space');
        const caught = await lineIs('hang', 4000).then(() => true).catch(() => false);
        if (caught) break;
        await page.keyboard.up('Space');
        await page.waitForTimeout(1500);
      }
      await lineIs('hang', 1000);
      await shot('teach-ch2-hang');
      await page.keyboard.up('Space');
      await page.keyboard.up('KeyW');
    } catch (e) {
      bad++;
      console.log(`${size}  teach shots FAILED: ${String(e).split('\n')[0]}; the line was ${JSON.stringify(await said())}`);
    }
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}
console.log(bad ? `${bad} problems` : `${SIZES.length} sizes: title and how-to-play written to ${out}`);
process.exit(bad ? 1 : 0);
