// reachable (D-014) — the only stage that runs as a PLAYER rather than as the harness.
//
// Every other stage opens /?harness=1&level=<id>, so it can reach any level whatever the game's own
// front door does. That is how chapter 1 merged reachable by the bot and by nobody else: ?level= was
// honoured only in harness mode and the default was the gym. This stage asks the missing question,
// "can a person who loads the game with no query string reach the first chapter and finish it?"
//
//   1. PRODUCTION bundle (dist/, its own preview server), the bare URL, no query string at all:
//      menu -> Enter -> which level loaded (body[data-level], set on install, never rendered).
//      It must be the entry chapter: the lowest-numbered chapter >= 1 in levels/ (a chapter, never the gym).
//   2. FINISH it: the harness bundle with ?harness=1 and NO level param, so the game picks the level by
//      its own default exactly as for a player; the nav bot plays it; the run must end in `results` on
//      that same level.

import { spawn, type ChildProcess } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIXED_HZ, Stage, guard, openGame, type Ctx, type StageResult } from './lib.ts';
import { NAV_CONFIG, walk } from './nav.ts';

const PROD_PORT = 4318; // beside preflight's 4317 (dist-harness)

/** The level a player must meet first: the lowest chapter >= 1 among levels/*.json. */
export function entryLevel(root: string): { id: string; chapter: number } | null {
  const lv = readdirSync(join(root, 'levels'))
    .filter((f) => /^[0-9].*\.json$/.test(f))
    .map((f) => JSON.parse(readFileSync(join(root, 'levels', f), 'utf8')) as { id: string; chapter: number })
    .filter((l) => l.chapter >= 1)
    .sort((a, b) => a.chapter - b.chapter);
  return lv[0] ?? null;
}

function serveProduction(root: string): Promise<{ url: string; proc: ChildProcess }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(join(root, 'node_modules/.bin/vite'), ['preview', '--outDir', 'dist', '--host', '127.0.0.1', '--port', String(PROD_PORT), '--strictPort'], { cwd: root });
    let buf = '';
    const t = setTimeout(() => reject(new Error(`production preview not ready after 20s: ${buf}`)), 20000);
    const on = (d: Buffer): void => {
      buf += d.toString();
      if (buf.includes(String(PROD_PORT))) {
        clearTimeout(t);
        resolve({ url: `http://127.0.0.1:${PROD_PORT}`, proc });
      }
    };
    proc.stdout.on('data', on);
    proc.stderr.on('data', on);
    proc.on('exit', (c) => reject(new Error(`production preview exited (${c}): ${buf}`)));
  });
}

export async function reachable(ctx: Omit<Ctx, 'levelId' | 'level' | 'segments'>): Promise<StageResult> {
  const st = new Stage('reachable');
  return guard(st, async () => {
    const want = entryLevel(ctx.root);
    if (!st.check('an entry chapter exists', !!want, want ? `${want.id} (chapter ${want.chapter})` : 'no level with chapter >= 1 in levels/')) return;

    // 1. as a player: production bundle, bare URL
    const prod = await serveProduction(ctx.root);
    try {
      const page = await ctx.browser.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`${prod.url}/`);
      await page.waitForFunction(() => /Enter: start/.test(document.body.innerText), null, { timeout: 20000 });
      await page.keyboard.press('Enter');
      const got = await page.waitForFunction(() => document.body.dataset['level'] ?? null, null, { timeout: 20000 }).then((h) => h.jsonValue()).catch(() => null);
      st.check('bare URL reaches the entry chapter (production bundle)', got === want!.id, `loaded "${got ?? '(nothing)'}", expected "${want!.id}"${errors.length ? `; page errors: ${errors.slice(0, 3).join(' | ')}` : ''}`);
      await page.close();
    } finally {
      prod.proc.kill();
    }

    // 2. finish it, with the level chosen by the game's default (no level param)
    const level = JSON.parse(readFileSync(join(ctx.root, 'levels', `${want!.id}.json`), 'utf8'));
    const lctx = { ...ctx, levelId: want!.id, level, segments: (level.checkpoints?.length ?? 0) + 1 } as Ctx;
    const g = await openGame(lctx, { query: '?harness=1' });
    try {
      const loaded = await g.page.evaluate(() => window.__HARNESS__!.level()?.id ?? null);
      st.check('default level (no ?level=) is the entry chapter', loaded === want!.id, `game default loaded "${loaded}"`);
      const tickLimit = Math.round(lctx.segments * NAV_CONFIG.segmentBudgetSec * NAV_CONFIG.stallMultiplier * FIXED_HZ);
      const w = await walk(lctx, g.page, { startIndex: 1, tickLimit, quiet: true });
      st.check('a player can finish it (bot plays the default level to results)', !w.failure && w.snap.state === 'results', w.failure ?? `results after ${(w.ticks / FIXED_HZ).toFixed(2)}s`);
      st.check('zero console errors', g.errors.length === 0, g.errors.slice(0, 5).join(' | ') || 'none');
    } finally {
      await g.close();
    }
  });
}
