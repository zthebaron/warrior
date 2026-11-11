// reachable (D-014) — the only stage that runs as a PLAYER rather than as the harness.
//
// Every other stage opens /?harness=1&level=<id>, so it can reach any level whatever the game's own
// front door does. That is how chapter 1 merged reachable by the bot and by nobody else: ?level= was
// honoured only in harness mode and the default was the gym. This stage asks the missing question,
// "can a person who loads the game with no query string reach the first chapter and finish it?"
//
//   1. PRODUCTION bundle (dist/, its own preview server), the bare URL, no query string at all:
//      the title screen (D-022) -> Enter -> which level loaded (body[data-level], set on install, never rendered).
//      It must be the entry chapter: the lowest-numbered chapter >= 1 in levels/ (a chapter, never the gym).
//      D-022 put the title screen at this door, so this step is also where it is held to its brief: the
//      painting, the two buttons and the two credit lines are shown, nothing sets the name again in HTML,
//      Enter passes it, a press made before the game is ready is not lost, and a page with a test or tool
//      parameter has none of it. The wait is on <html data-shell="ready">, which the game sets when the
//      title can start it: the painting is in the page long before that, so its being there proves nothing.
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

/** D-022: what the title screen must show (the brief's own words), and the parameters that must leave a page bare. */
const TITLE = {
  name: 'Karasu: Flight of the Exile',
  buttons: ['Play', 'How to play'],
  credits: ['Designed by Tim de Vallée', 'Dedicated to Remi'],
  bare: ['harness=1', 'playtest=1', 'replay=1', 'instrument=on', 'level=01-lower-stair'],
};

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
      const ready = await page.waitForFunction(() => document.documentElement.dataset['shell'] === 'ready', null, { timeout: 20000 }).then(() => true).catch(() => false);
      const seen = await page.evaluate(() => {
        const t = document.getElementById('title');
        const art = t?.querySelector('img');
        const shown = (e: Element | null | undefined): boolean => !!e && (e as HTMLElement).getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
        return {
          title: document.title,
          description: document.querySelector('meta[name="description"]')?.getAttribute('content') ?? null,
          shown: shown(t),
          art: art ? `${art.naturalWidth}x${art.naturalHeight} ${art.currentSrc.split('/').pop() ?? ''}` : 'no image',
          buttons: [...(t?.querySelectorAll('button') ?? [])].filter((b) => shown(b)).map((b) => b.textContent ?? ''),
          credits: [...(t?.querySelectorAll('.credits span') ?? [])].filter((c) => shown(c)).map((c) => c.textContent ?? ''),
          headings: [...(t?.querySelectorAll('h1, h2, h3') ?? [])].length,
          text: (t as HTMLElement | null)?.innerText ?? '',
        };
      }).catch(() => null);
      st.check('bare URL shows the title screen, and the game is ready behind it', ready && !!seen?.shown, ready ? `title ${seen?.shown ? 'shown' : 'NOT shown'}; art ${seen?.art}` : 'the game never marked the shell ready (20 s)');
      st.check('page title and description are the game\'s name', seen?.title === TITLE.name && seen?.description === TITLE.name, `title ${JSON.stringify(seen?.title)}, description ${JSON.stringify(seen?.description)}`);
      st.check('the title painting is drawn (1376x768)', /^1376x768 /.test(seen?.art ?? ''), seen?.art ?? 'no page');
      st.check('the title has Play and How to play', TITLE.buttons.every((b) => seen?.buttons.includes(b)), `buttons: ${JSON.stringify(seen?.buttons ?? [])}`);
      st.check('the two credit lines, exactly', JSON.stringify(seen?.credits) === JSON.stringify(TITLE.credits), JSON.stringify(seen?.credits ?? []));
      st.check('the name is not set again in HTML over the painting', seen?.headings === 0 && !/karasu|exile/i.test(seen?.text ?? 'karasu'), `headings ${seen?.headings}; text ${JSON.stringify((seen?.text ?? '').slice(0, 120))}`);
      const pressed = Date.now();
      await page.keyboard.press('Enter');
      const got = await page.waitForFunction(() => document.body.dataset['level'] ?? null, null, { timeout: 20000 }).then((h) => h.jsonValue()).catch(() => null);
      const took = `${((Date.now() - pressed) / 1000).toFixed(1)}s after Enter`;
      const shown = got ? '' : `; page shows: ${JSON.stringify((await page.evaluate(() => document.body.innerText).catch(() => '')).slice(0, 160))}`;
      const after = await page.waitForFunction(() => document.getElementById('title')?.hidden === true, null, { timeout: 5000 }).then(() => 'gone').catch(() => 'STILL SHOWN');
      st.check('the title screen leaves when the level starts', after === 'gone', after);
      st.check('bare URL reaches the entry chapter (production bundle)', got === want!.id, `loaded "${got ?? '(nothing)'}", expected "${want!.id}", ${took}${shown}${errors.length ? `; page errors: ${errors.slice(0, 3).join(' | ')}` : ''}`);
      await page.close();

      // a press made the moment the title is in the page, before the game has loaded, must not be lost
      const early = await ctx.browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
      await early.goto(`${prod.url}/`, { waitUntil: 'commit' });
      await early.waitForFunction(() => !!document.getElementById('title-play'), null, { timeout: 20000 });
      const wasReady = await early.evaluate(() => document.documentElement.dataset['shell'] === 'ready');
      await early.keyboard.press('Enter');
      const earlyGot = await early.waitForFunction(() => document.body.dataset['level'] ?? null, null, { timeout: 20000 }).then((h) => h.jsonValue()).catch(() => null);
      st.check('Enter pressed as soon as the title is in the page still starts the game', earlyGot === want!.id, `loaded "${earlyGot ?? '(nothing)'}"; the game was ${wasReady ? 'already ready' : 'not yet ready'} at the press`);
      await early.close();

      // with a test or tool parameter the page is bare: no title screen, no how-to-play page, no sound
      for (const q of TITLE.bare.map((p) => `?${p}`)) {
        const bare = await ctx.browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
        await bare.goto(`${prod.url}/${q}`);
        await bare.waitForFunction(() => /Enter: start/.test(document.body.innerText), null, { timeout: 20000 }).catch(() => null);
        const dom = await bare.evaluate(() => ({
          cls: document.documentElement.className,
          ids: [...document.querySelectorAll('[id]')].map((e) => e.id).sort().join(' '),
          media: document.querySelectorAll('audio, video, img, picture, template').length,
          text: document.body.innerText,
        }));
        st.check(`${q}: a bare page (no title, no how-to-play, the old menu text)`, dom.cls === 'bare' && dom.ids === 'app hud' && dom.media === 0 && /Enter: start/.test(dom.text), `class ${dom.cls}; ids: ${dom.ids}; media elements ${dom.media}; text ${JSON.stringify(dom.text.slice(0, 60))}`);
        await bare.close();
      }
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
      const harnessIds = await g.page.evaluate(() => `${document.documentElement.className}: ${[...document.querySelectorAll('[id]')].map((e) => e.id).sort().join(' ')}`);
      st.check('the harness page is bare (D-022: it sees no title, no how-to-play, no sound)', harnessIds === 'bare: app hud', harnessIds);
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
