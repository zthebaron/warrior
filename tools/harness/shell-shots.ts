// shell-shots — the title screen and the how-to-play page as a player's browser draws them, at the sizes D-022
// names (a 400 px phone, a 1080p monitor, Tim's 5120x1440 ultrawide). For looking at; it judges two things only,
// because they can be measured: at every size the title painting's keep zone (the lettering, the seal and the
// boat) is wholly on screen, and no button or credit line is cut off by the edge of the screen.
//
//   node tools/harness/shell-shots.ts <out dir> [--build] [--size=WxH,WxH...]
//
// Serves the PRODUCTION bundle (dist/) at the bare URL, as reachable does. One playtest or frame tool at a time.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { CHROMIUM_ARGS } from './lib.ts';

const ROOT = new URL('../..', import.meta.url).pathname;
const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const out = argv.find((a) => !a.startsWith('--'));
if (!out) { console.error('usage: node tools/harness/shell-shots.ts <out dir> [--build] [--size=WxH,...]'); process.exit(2); }
const SIZES = (flag('size') ?? '400x800,1920x1080,5120x1440').split(',').map((s) => s.split('x').map(Number) as [number, number]);
const PORT = 4319; // beside preflight's 4317 and reachable's 4318
const KEEP = (JSON.parse(readFileSync(join(ROOT, 'assets/ui/art.json'), 'utf8')) as { keep: { x0: number; x1: number } }).keep;

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
    await page.waitForFunction(() => { const i = document.querySelector<HTMLImageElement>('#title img'); return !!i && i.complete && i.naturalWidth > 0; });
    await page.evaluate(() => document.fonts.ready);
    const size = `${width}x${height}`;
    await page.screenshot({ path: join(out, `title-${size}.png`) });

    // the keep zone, in screen pixels: where the painting's x0..x1 lands once object-fit has placed it
    const m = await page.evaluate((keep) => {
      const img = document.querySelector<HTMLImageElement>('#title img')!;
      const box = img.getBoundingClientRect();
      const scale = Math.max(box.width / img.naturalWidth, box.height / img.naturalHeight); // object-fit: cover
      const drawnW = img.naturalWidth * scale, drawnH = img.naturalHeight * scale;
      const [px, py] = getComputedStyle(img).objectPosition.split(' ').map((v) => parseFloat(v) / 100) as [number, number];
      const left = box.left + (box.width - drawnW) * px, top = box.top + (box.height - drawnH) * py;
      const cut = [...document.querySelectorAll<HTMLElement>('#title button, #title .credits span')]
        .filter((e) => e.getClientRects().length > 0)
        .map((e) => ({ what: (e.textContent ?? '').trim(), r: e.getBoundingClientRect() }))
        .filter(({ r }) => r.left < 0 || r.top < 0 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5)
        .map(({ what }) => what);
      return {
        keepLeft: left + keep.x0 * drawnW, keepRight: left + keep.x1 * drawnW, top, bottom: top + drawnH,
        box: { left: box.left, right: box.right, top: box.top, bottom: box.bottom }, cut,
      };
    }, KEEP);
    const e = 0.5;
    const whole = m.keepLeft >= m.box.left - e && m.keepRight <= m.box.right + e && m.top >= m.box.top - e && m.bottom <= m.box.bottom + e
      && m.box.left >= -e && m.box.right <= width + e && m.box.top >= -e && m.box.bottom <= height + e;
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
    if (errors.length) { bad++; console.log(`${size}  console errors: ${errors.slice(0, 3).join(' | ')}`); }
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}
console.log(bad ? `${bad} problems` : `${SIZES.length} sizes: title and how-to-play written to ${out}`);
process.exit(bad ? 1 : 0);
