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
//   3. PROGRESS (D-014 fix 3): at results, press Enter as a player would. It must load the next chapter
//      (src/systems/progression.ts: lowest chapter above this one), which the bot then plays too, and so
//      on down the chain; after the last chapter Enter must return to the menu. And every chapter >= 1
//      level in levels/ must be on that chain, or a chapter shipped that no player can reach.

import { spawn, type ChildProcess } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIXED_HZ, Stage, VIEWPORT, guard, openGame, type Ctx, type StageResult } from './lib.ts';
import { chapterChain, entryLevel as entryOf, type LevelRef } from '../../src/systems/progression.ts';
import { NAV_CONFIG, walk } from './nav.ts';

const PROD_PORT = 4318; // beside preflight's 4317 (dist-harness)

function levelRefs(root: string): LevelRef[] {
  return readdirSync(join(root, 'levels'))
    .filter((f) => /^[0-9].*\.json$/.test(f))
    .map((f) => JSON.parse(readFileSync(join(root, 'levels', f), 'utf8')) as LevelRef)
    .map((l) => ({ id: l.id, chapter: l.chapter }));
}

/** The level a player must meet first: the lowest chapter >= 1 among levels/*.json (progression.ts). */
export function entryLevel(root: string): LevelRef | null {
  return entryOf(levelRefs(root));
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
      // The pinned harness viewport, as every other stage's page. A level load is ~25 async hops and each one
      // queues behind a rendered frame, so on SwiftShader the load time is 25 x the frame time: at Playwright's
      // default 1280x720 that overran this wait on a CI runner (MEASUREMENTS "D-020 production load").
      const page = await ctx.browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); }); // showError logs, it does not throw
      await page.goto(`${prod.url}/`);
      await page.waitForFunction(() => /Enter: start/.test(document.body.innerText), null, { timeout: 20000 });
      const pressed = Date.now();
      await page.keyboard.press('Enter');
      const got = await page.waitForFunction(() => document.body.dataset['level'] ?? null, null, { timeout: 20000 }).then((h) => h.jsonValue()).catch(() => null);
      const took = `${((Date.now() - pressed) / 1000).toFixed(1)}s after Enter`;
      const shown = got ? '' : `; page shows: ${JSON.stringify((await page.evaluate(() => document.body.innerText).catch(() => '')).slice(0, 160))}`;
      st.check('bare URL reaches the entry chapter (production bundle)', got === want!.id, `loaded "${got ?? '(nothing)'}", expected "${want!.id}", ${took}${shown}${errors.length ? `; page errors: ${errors.slice(0, 3).join(' | ')}` : ''}`);
      await page.close();
    } finally {
      prod.proc.kill();
    }

    // 2 + 3. finish it, with the level chosen by the game's default (no level param), then Enter at
    // results and follow the chain the way a player would
    const refs = levelRefs(ctx.root);
    const chain = chapterChain(refs);
    const orphans = refs.filter((l) => l.chapter >= 1 && !chain.some((c) => c.id === l.id));
    st.check('every chapter is on the progression chain', orphans.length === 0, orphans.length ? `unreachable by finishing the chapter before: ${orphans.map((l) => `${l.id} (chapter ${l.chapter})`).join(', ')}` : chain.map((l) => l.id).join(' > '));
    const g = await openGame({ ...ctx, levelId: want!.id } as Ctx, { query: '?harness=1' });
    try {
      const loaded = await g.page.evaluate(() => window.__HARNESS__!.level()?.id ?? null);
      st.check('default level (no ?level=) is the entry chapter', loaded === want!.id, `game default loaded "${loaded}"`);
      for (const [i, ref] of chain.entries()) {
        const level = JSON.parse(readFileSync(join(ctx.root, 'levels', `${ref.id}.json`), 'utf8'));
        const lctx = { ...ctx, levelId: ref.id, level, segments: (level.checkpoints?.length ?? 0) + 1 } as Ctx;
        const tickLimit = Math.round(lctx.segments * NAV_CONFIG.segmentBudgetSec * NAV_CONFIG.stallMultiplier * FIXED_HZ);
        const w = await walk(lctx, g.page, { startIndex: 1, tickLimit, quiet: true });
        if (!st.check(`a player can finish ${ref.id} (bot plays it to results)`, !w.failure && w.snap.state === 'results', w.failure ?? `results after ${(w.ticks / FIXED_HZ).toFixed(2)}s`)) break;
        const next = chain[i + 1] ?? null;
        await g.page.keyboard.press('Enter');
        if (next) {
          const got = await g.page
            .waitForFunction((id) => window.__HARNESS__!.level()?.id === id && window.__HARNESS__!.snapshot().state === 'play' ? id : null, next.id, { timeout: 20000 })
            .then((h) => h.jsonValue())
            .catch(async () => g.page.evaluate(() => `${window.__HARNESS__!.level()?.id ?? '(none)'} in ${window.__HARNESS__!.snapshot().state}`));
          if (!st.check(`Enter at results of ${ref.id} loads the next chapter`, got === next.id, `got ${got}, expected ${next.id} (chapter ${next.chapter})`)) break;
        } else {
          const s = await g.page
            .waitForFunction(() => (window.__HARNESS__!.snapshot().state === 'menu' ? 'menu' : null), null, { timeout: 20000 })
            .then((h) => h.jsonValue())
            .catch(async () => g.page.evaluate(() => window.__HARNESS__!.snapshot().state));
          st.check(`Enter at results of the last chapter (${ref.id}) returns to the menu`, s === 'menu', `state ${s}`);
        }
      }
      st.check('zero console errors', g.errors.length === 0, g.errors.slice(0, 5).join(' | ') || 'none');
    } finally {
      await g.close();
    }
  });
}
