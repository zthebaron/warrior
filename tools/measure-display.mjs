#!/usr/bin/env node
// measure-display: frame time and a screenshot of a level at real display sizes, on the machine's real GPU.
//
// The playtest harness runs 640x360 on SwiftShader, which says nothing about how the game looks or runs on a
// player's screen. This drives the same harness bundle in HEADED Chrome (ANGLE on the real GPU) at each size:
//
//   node tools/measure-display.mjs --label before [--level 01-lower-stair] [--sizes 1920x1080,2560x1440,5120x1440]
//                                  [--out docs/build-log/ink-hires] [--frames 360] [--views rig,cam2] [--all-shots] [--skip-build]
//
// Per size and per view (the player's rig camera at spawn, the visual stage's six fixed cameras, the post gate's
// grazing camera) it records two things, while every frame runs one fixed tick and one full render (scene +
// post), as the game's loop does:
//   frame : the interval between animation frames, Chrome as a player runs it (vsync on). It cannot go below
//           the display's refresh period, so it answers "does it hold the display's rate".
//   cost  : wall time per frame with the GPU forced to finish (a 1px readPixels after every 8 frames). This is
//           what a frame COSTS, so it shows the headroom, or the lack of it, that vsync hides.
// Output: <out>/<label>-<size>-<view>.png for the rig view, cam2 and the grazing view (--all-shots: every view),
// and <out>/<label>.json with every number.
// It refuses to report if the GL renderer is a software one: a SwiftShader number here would be a lie.

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const flag = (k) => process.argv.includes(`--${k}`);
const LABEL = arg('label', 'run');
const LEVEL = arg('level', '01-lower-stair');
const SIZES = arg('sizes', '1920x1080,2560x1440,5120x1440').split(',').map((s) => s.split('x').map(Number));
const OUT = resolve(ROOT, arg('out', 'docs/build-log/ink-hires'));
const FRAMES = Number(arg('frames', '360'));
const WARMUP = 60;
const PORT = 4391; // not the playtest's 4317: a measurement must be able to run beside one
const SHOT_VIEWS = flag('all-shots') ? null : new Set(['rig', 'cam2', 'graze']);
const ONLY = arg('views', '') ? new Set(arg('views', '').split(',')) : null;

const vite = join(ROOT, 'node_modules/.bin/vite');
const run = (cmd, args) => new Promise((res, rej) => {
  const p = spawn(cmd, args, { cwd: ROOT, stdio: 'inherit' });
  p.on('exit', (c) => (c === 0 ? res() : rej(new Error(`${cmd} ${args.join(' ')} exited ${c}`))));
});

if (!flag('skip-build')) await run(vite, ['build', '--mode', 'harness', '--outDir', 'dist-harness', '--emptyOutDir', '--logLevel', 'error']);
const server = spawn(vite, ['preview', '--outDir', 'dist-harness', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe' });
const base = `http://127.0.0.1:${PORT}`;
for (let i = 0; ; i++) {
  try { if ((await fetch(base)).ok) break; } catch { /* not up yet */ }
  if (i > 100) throw new Error('vite preview never came up');
  await new Promise((r) => setTimeout(r, 100));
}

// the visual stage's cameras, from the same level file and the same constants (tools/harness/visual.ts)
const level = JSON.parse(readFileSync(join(ROOT, 'levels', `${LEVEL}.json`), 'utf8'));
const pts = level.critical_path.map((w) => (Array.isArray(w) ? w : w.pos));
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const views = [{ name: 'rig' }, { name: 'cam0', pos: add(level.spawn.pos, [-25, 28, 34]), target: pts[Math.floor(pts.length / 3)] }];
for (let k = 1; k < 6; k++) { const t = pts[Math.round((k / 5) * (pts.length - 1))]; views.push({ name: `cam${k}`, pos: add(t, [-7, 7, 11]), target: t }); }
// the post gate's grazing pose (tools/harness/post.ts POST_GATE.graze): almost in the ground plane, looking along
// it. The gate judges it at 360 lines only; here it is a picture to check by eye that the ground carries no line.
{
  const [s0, s1] = [pts[0], pts[1]], gl = Math.hypot(s1[0] - s0[0], s1[2] - s0[2]) || 1, gd = [(s1[0] - s0[0]) / gl, (s1[2] - s0[2]) / gl];
  views.push({ name: 'graze', pos: [s0[0] + gd[0] * 1.5, s0[1] + 0.35, s0[2] + gd[1] * 1.5], target: [s0[0] + gd[0] * 14, s0[1] + 0.35, s0[2] + gd[1] * 14] });
}

const COMMON = ['--use-angle=metal', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
const BATCH = 8, BATCHES = 40;
const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
const r2 = (v) => Math.round(v * 100) / 100;

mkdirSync(OUT, { recursive: true });
const report = { label: LABEL, level: LEVEL, when: new Date().toISOString(), frames: FRAMES, gl: null, sizes: [] };
try {
  {
    for (const [w, h] of SIZES) {
      // a fresh browser per size: the window is sized to the viewport, and no state leaks between sizes
      const browser = await chromium.launch({ headless: false, channel: 'chrome', args: [...COMMON, `--window-size=${w},${h}`, '--window-position=0,0'] });
      const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto(`${base}/?harness=1&level=${LEVEL}`);
      await page.waitForFunction(() => window.__HARNESS__?.version === 'HARNESS_API_V1', null, { timeout: 20000 });
      const started = await page.evaluate(() => window.__HARNESS__.start());
      if (!started.ok) throw new Error(`level failed to start: ${started.error}`);
      const gl = await page.evaluate(() => {
        const c = document.querySelector('canvas');
        const g = c.getContext('webgl2');
        const dbg = g.getExtension('WEBGL_debug_renderer_info');
        return { renderer: String(dbg ? g.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER)), buffer: [c.width, c.height], css: [c.clientWidth, c.clientHeight], dpr: devicePixelRatio };
      });
      if (/swiftshader|llvmpipe|software/i.test(gl.renderer)) throw new Error(`software renderer (${gl.renderer}): this tool only reports a real GPU`);
      report.gl = gl.renderer;
      const entry = { size: `${w}x${h}`, buffer: gl.buffer.join('x'), dpr: gl.dpr, views: [] };
      for (const v of views) {
        if (ONLY && !ONLY.has(v.name)) continue;
        const times = await page.evaluate(async ({ v, n, warm }) => {
          const H = window.__HARNESS__;
          if (v.pos) H.setCamera(v.pos, v.target); else H.releaseCamera();
          const out = [];
          await new Promise((done) => {
            let last = 0, k = 0;
            const f = (t) => {
              H.advance(1); // one fixed tick + one full render, as the game's loop does per frame
              if (k >= warm) out.push(t - last);
              last = t;
              if (++k < n + warm) requestAnimationFrame(f); else done();
            };
            requestAnimationFrame(f);
          });
          return out;
        }, { v, n: FRAMES, warm: WARMUP });
        // cost: the GPU is made to finish, so nothing is hidden in a queue
        const costs = await page.evaluate(({ batch, batches }) => {
          const H = window.__HARNESS__;
          const g = document.querySelector('canvas').getContext('webgl2');
          const px = new Uint8Array(4);
          const out = [];
          for (let b = 0; b < batches + 5; b++) {
            const t0 = performance.now();
            for (let i = 0; i < batch; i++) H.advance(1);
            g.readPixels(0, 0, 1, 1, g.RGBA, g.UNSIGNED_BYTE, px);
            if (b >= 5) out.push((performance.now() - t0) / batch);
          }
          return out;
        }, { batch: BATCH, batches: BATCHES });
        const s = [...times].sort((a, b) => a - b);
        const c = [...costs].sort((a, b) => a - b);
        const row = { view: v.name, p50_ms: r2(pct(s, 0.5)), p95_ms: r2(pct(s, 0.95)), max_ms: r2(s[s.length - 1]), fps_p50: r2(1000 / pct(s, 0.5)), over_10ms: times.filter((x) => x > 10).length, cost_p50_ms: r2(pct(c, 0.5)), cost_p95_ms: r2(pct(c, 0.95)) };
        entry.views.push(row);
        console.log(`${LABEL} ${entry.size.padEnd(9)} ${v.name.padEnd(5)} frame p50 ${row.p50_ms.toFixed(2)} p95 ${row.p95_ms.toFixed(2)} max ${row.max_ms.toFixed(2)} ms (${row.fps_p50} fps, ${row.over_10ms} frames > 10 ms)   cost p50 ${row.cost_p50_ms.toFixed(2)} p95 ${row.cost_p95_ms.toFixed(2)} ms`);
        if (!SHOT_VIEWS || SHOT_VIEWS.has(v.name)) writeFileSync(join(OUT, `${LABEL}-${w}x${h}-${v.name}.png`), await page.locator('canvas').screenshot());
      }
      entry.worst_view_p50_ms = Math.max(...entry.views.map((x) => x.p50_ms));
      entry.worst_view_p95_ms = Math.max(...entry.views.map((x) => x.p95_ms));
      entry.worst_view_cost_p50_ms = Math.max(...entry.views.map((x) => x.cost_p50_ms));
      entry.worst_view_cost_p95_ms = Math.max(...entry.views.map((x) => x.cost_p95_ms));
      entry.errors = errors;
      report.sizes.push(entry);
      await browser.close();
    }
  }
  writeFileSync(join(OUT, `${LABEL}.json`), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`GL renderer: ${report.gl}\nwrote ${join(OUT, `${LABEL}.json`)}`);
} finally {
  server.kill();
}
