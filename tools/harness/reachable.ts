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
//      Sound is held here too, by what the page DOES (nobody running this can hear it): no audio context and
//      no audio file before the Play press; after it a context that runs, the music started as a loop, and a
//      jump that starts the jump's sound; the mute key writes the one cookie; a hidden tab suspends the
//      context; and a bare page never opens a context or fetches a sound.
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
import type { Page } from '@playwright/test';

const PROD_PORT = 4318; // beside preflight's 4317 (dist-harness)

/** Runs in the page before any of its scripts: counts audio contexts opened, sounds decoded and buffer sources started. */
const AUDIO_PROBE = `(() => {
  const probe = (window.__audioProbe = { contexts: 0, ctx: null, decoded: [], starts: [] });
  const Real = window.AudioContext;
  if (!Real) return;
  window.AudioContext = class extends Real { constructor(...a) { super(...a); probe.contexts++; probe.ctx = this; } };
  const decode = BaseAudioContext.prototype.decodeAudioData;
  BaseAudioContext.prototype.decodeAudioData = function (...a) {
    const p = decode.apply(this, a);
    p.then((b) => probe.decoded.push(Math.round(b.duration * 100) / 100), () => {});
    return p;
  };
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...a) {
    probe.starts.push({ seconds: this.buffer ? Math.round(this.buffer.duration * 100) / 100 : -1, loop: this.loop, rate: this.playbackRate.value });
    return start.apply(this, a);
  };
})()`;
interface AudioProbe { contexts: number; ctx: AudioContext | null; decoded: number[]; starts: { seconds: number; loop: boolean; rate: number }[] }
declare global { interface Window { __audioProbe?: AudioProbe; __pad?: { on: boolean; down: number[] }; __lock?: { exits: number; held: boolean } } }

/** Runs in the page before any of its scripts: a standard-layout gamepad the test holds buttons down on. No real pad is involved (B-57). */
const PAD_FAKE = `(() => {
  const pad = (window.__pad = { on: false, down: [] });
  const buttons = Array.from({ length: 17 }, (_, i) => ({ get pressed() { return pad.down.includes(i); }, get value() { return pad.down.includes(i) ? 1 : 0; } }));
  navigator.getGamepads = () => (pad.on ? [{ connected: true, mapping: 'standard', id: 'faked', index: 0, axes: [0, 0, 0, 0], buttons }] : []);
})()`;

/** Runs in the page before any of its scripts: no WebGL, so the game's boot fails where a player's old machine would fail it. */
const NO_WEBGL = `(() => {
  const real = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return /webgl/i.test(String(type)) ? null : real.call(this, type, ...rest); };
})()`;

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
      await page.addInitScript(AUDIO_PROBE);
      const sounds: string[] = [];
      page.on('request', (r) => { if (/\.(mp3|m4a|ogg|wav)(\?|$)/.test(r.url())) sounds.push(r.url().split('/').pop() ?? ''); });
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
      const quiet = await page.evaluate(() => window.__audioProbe?.contexts ?? -1);
      st.check('before Play: no audio context, no sound fetched', quiet === 0 && sounds.length === 0, `${quiet} contexts, ${sounds.length} sound files requested`);
      const pressed = Date.now();
      await page.keyboard.press('Enter');
      const got = await page.waitForFunction(() => document.body.dataset['level'] ?? null, null, { timeout: 20000 }).then((h) => h.jsonValue()).catch(() => null);
      const took = `${((Date.now() - pressed) / 1000).toFixed(1)}s after Enter`;
      const shown = got ? '' : `; page shows: ${JSON.stringify((await page.evaluate(() => document.body.innerText).catch(() => '')).slice(0, 160))}`;
      const after = await page.waitForFunction(() => document.getElementById('title')?.hidden === true, null, { timeout: 5000 }).then(() => 'gone').catch(() => 'STILL SHOWN');
      st.check('the title screen leaves when the level starts', after === 'gone', after);
      st.check('bare URL reaches the entry chapter (production bundle)', got === want!.id, `loaded "${got ?? '(nothing)'}", expected "${want!.id}", ${took}${shown}${errors.length ? `; page errors: ${errors.slice(0, 3).join(' | ')}` : ''}`);
      // sound, by what the page does. The music is the one looping source; a jump starts the jump's buffer.
      const want9 = JSON.parse(readFileSync(join(ctx.root, 'assets/audio/audio.json'), 'utf8')) as { music: { file: string; loopSeconds: number }; effects: Record<string, { file: string; seconds: number }> };
      const music = await page.waitForFunction(() => window.__audioProbe?.starts.find((s) => s.loop) ?? null, null, { timeout: 20000 }).then((h) => h.jsonValue()).catch(() => null);
      const ctxState = await page.evaluate(() => `${window.__audioProbe?.contexts} context(s), ${window.__audioProbe?.ctx?.state ?? 'none'}`);
      st.check('after Play: one audio context, running', ctxState === '1 context(s), running', ctxState);
      // decoded, not requested: the bundler inlines a file under 4 KB (the wall grab), which is then never a request
      const lengths = [...Object.values(want9.effects).map((e) => e.seconds), Math.round((want9.music.loopSeconds + 1) * 100) / 100].sort((a, b) => a - b);
      const decoded = await page.evaluate(() => [...(window.__audioProbe?.decoded ?? [])].sort((a, b) => a - b));
      // an MP3 decodes a few hundredths of a second long or short of what was encoded
      st.check('after Play: every sound in audio.json is decoded, and nothing else', decoded.length === lengths.length && decoded.every((d, i) => Math.abs(d - lengths[i]!) < 0.08) && sounds.length <= lengths.length, `decoded ${decoded.length} of ${lengths.length} (${decoded.join(', ')} s); ${sounds.length} requested`);
      st.check('the music starts as a loop', !!music && Math.abs(music.seconds - want9.music.loopSeconds) < 2, music ? `a looping source of ${music.seconds} s (the loop is ${want9.music.loopSeconds} s)` : 'no looping source was started in 20 s');
      // A move key is SAMPLED once a fixed tick, so a tap shorter than a frame is never seen: on a CI runner a
      // frame of SwiftShader is tens of milliseconds, and the first cut of this check (a bare press) failed
      // there. The key is held for several frames, and pressed again until the sound starts or 15 s pass (the
      // player may still be in the air from the level's start on the first press).
      const soundAfter = async (code: string, seconds: number): Promise<{ seconds: number; loop: boolean; rate: number } | null> => {
        const from = await page.evaluate(() => window.__audioProbe?.starts.length ?? 0);
        for (let i = 0; i < 20; i++) {
          await page.keyboard.down(code);
          await page.waitForTimeout(350);
          await page.keyboard.up(code);
          await page.waitForTimeout(400);
          const hit = await page.evaluate(([n, sec]) => window.__audioProbe?.starts.slice(n).find((x) => !x.loop && x.seconds === sec) ?? null, [from, seconds] as const);
          if (hit) return hit;
        }
        return null;
      };
      const jump = await soundAfter('Space', want9.effects['jump']!.seconds);
      st.check('a jump starts the jump sound', !!jump, jump ? `a ${jump.seconds} s source at rate ${jump.rate} (jump.mp3 is ${want9.effects['jump']!.seconds} s)` : 'Space, held and repeated for 15 s, started no jump sound');
      const cut = await soundAfter('KeyJ', want9.effects['slash']!.seconds);
      st.check('the slash key starts the slash sound', !!cut, cut ? `a ${cut.seconds} s source (slash.mp3 is ${want9.effects['slash']!.seconds} s)` : 'J, held and repeated for 15 s, started no slash sound');
      await page.keyboard.press('KeyN');
      const muted = await page.evaluate(() => `${document.cookie} | ${document.getElementById('hint')?.textContent ?? ''}`);
      st.check('the mute key is remembered in one cookie and shown in the hint', /^karasu_sound=1\.\d+ \| .*sound: off/.test(muted), muted);
      const hidden = await page.evaluate(async () => {
        Object.defineProperty(document, 'hidden', { value: true, configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
        await new Promise((r) => setTimeout(r, 300));
        return window.__audioProbe?.ctx?.state ?? 'none';
      });
      st.check('a hidden tab suspends the sound', hidden === 'suspended', `context ${hidden}`);
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

      // ---- OQ-073: five things the review of D-022 found that a player hits, one check each. Every page here is
      // its own, so the cookie, the probe's counts and the warrior's place in the checks above are untouched.
      const fresh = async (...scripts: string[]): Promise<Page> => {
        const p = await ctx.browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
        for (const s of scripts) await p.addInitScript(s);
        await p.goto(`${prod.url}/`);
        return p;
      };
      const shellReady = (p: Page): Promise<boolean> => p.waitForFunction(() => document.documentElement.dataset['shell'] === 'ready', null, { timeout: 20000 }).then(() => true).catch(() => false);
      const levelOf = (p: Page, ms: number): Promise<string | null> => p.waitForFunction(() => document.body.dataset['level'] ?? null, null, { timeout: ms }).then((h) => h.jsonValue()).catch(() => null);
      /** What is on screen: the two shell layers, and the HUD's text (which names the state: PAUSED, fell, COMPLETE, BOOT FAILED). */
      const screen = (p: Page): Promise<{ title: boolean; help: boolean; hudShown: boolean; hud: string }> => p.evaluate(() => {
        const on = (id: string): boolean => (document.getElementById(id)?.getClientRects().length ?? 0) > 0;
        return { title: on('title'), help: on('help'), hudShown: on('hud'), hud: document.getElementById('hud')?.textContent ?? '' };
      });

      // 1. a boot that fails says so on screen (the title painting used to cover the message, with Play dead)
      const broken = await fresh(NO_WEBGL);
      const failed = await broken.waitForFunction(() => /^BOOT FAILED/.test(document.getElementById('hud')?.textContent ?? ''), null, { timeout: 20000 }).then(() => true).catch(() => false);
      const wreck = await screen(broken);
      st.check('a boot failure is on screen, not under the title painting (WebGL refused)', failed && wreck.hudShown && !wreck.title && !wreck.help, failed ? `message ${wreck.hudShown ? 'shown' : 'NOT shown'}; title ${wreck.title ? 'STILL OVER IT' : 'gone'}; how-to-play ${wreck.help ? 'STILL OVER IT' : 'gone'}` : `the boot did not fail in 20 s: HUD ${JSON.stringify(wreck.hud.slice(0, 60))}`);
      await broken.close();

      // 2. Enter held on another of the title's buttons is not Play (the key's repeats started the game past the
      //    Play press, so with no sound for the whole visit)
      const heldPage = await fresh(AUDIO_PROBE);
      const heldReady = await shellReady(heldPage);
      await heldPage.focus('#title-sound');
      for (let i = 0; i < 4; i++) {
        await heldPage.keyboard.down('Enter'); // a key already down goes down again as a repeat
        await heldPage.waitForTimeout(120);
      }
      const startedByRepeat = await heldPage.waitForFunction(() => (document.body.dataset['level'] || (document.getElementById('title-play') as HTMLButtonElement | null)?.disabled ? 'started' : null), null, { timeout: 3000 }).then(() => true).catch(() => false);
      await heldPage.keyboard.up('Enter');
      const heldSeen = await screen(heldPage);
      st.check('Enter held on the title\'s Sound button does not start the game', heldReady && !startedByRepeat && heldSeen.title, heldReady ? `${startedByRepeat ? 'the game STARTED' : 'no start in 3 s'}; title ${heldSeen.title ? 'shown' : 'gone'}` : 'the game never marked the shell ready (20 s)');
      await heldPage.close();

      // 3. the how-to-play page never sits over a game that is running. Death and loading are the two states it
      //    could be opened in without pausing; both are refused by the one guard. Loading is the one a test can
      //    hold open: the level's meshes are kept back until How to play has been clicked.
      const under = await ctx.browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
      let letMeshesThrough!: () => void;
      const meshGate = new Promise<void>((r) => { letMeshesThrough = r; });
      await under.route(/\.glb(\?|$)/, async (route) => { await meshGate; await route.continue().catch(() => {}); });
      await under.goto(`${prod.url}/`);
      const underReady = await shellReady(under);
      await under.keyboard.press('Enter');
      const wasLoading = await under.waitForFunction(() => (document.getElementById('title-play') as HTMLButtonElement | null)?.disabled === true && !document.body.dataset['level'], null, { timeout: 5000 }).then(() => true).catch(() => false);
      await under.click('#title-help', { timeout: 5000 }).catch(() => {});
      const openedWhileLoading = (await screen(under)).help;
      letMeshesThrough();
      const underLevel = await levelOf(under, 20000);
      await under.waitForFunction(() => document.getElementById('title')?.hidden === true, null, { timeout: 5000 }).catch(() => null);
      const over = await screen(under);
      st.check('How to play clicked while the level loads is not left over a running game', underReady && wasLoading && underLevel !== null && (!over.help || /^PAUSED/.test(over.hud)), `${wasLoading ? 'clicked during loading' : 'the click was NOT during loading'}; the page ${openedWhileLoading ? 'opened' : 'stayed shut'}; then level ${underLevel ?? 'NOT LOADED'}, how-to-play ${over.help ? 'shown' : 'not shown'}, HUD ${JSON.stringify(over.hud.slice(0, 20))}`);
      await under.close();

      // 4 and 5 share a page in the game: the mouse, then a pad
      const inGame = await fresh(AUDIO_PROBE, PAD_FAKE);
      await shellReady(inGame);
      await inGame.keyboard.press('Enter');
      const inLevel = await levelOf(inGame, 20000);
      await inGame.waitForFunction(() => document.getElementById('title')?.hidden === true, null, { timeout: 5000 }).catch(() => null);
      // every sound decoded first (a slow runner decodes for seconds, and check 5 listens for the dash), then
      // let the warrior land and every sound of the start finish starting: nothing new for a second
      await inGame.waitForFunction((n) => (window.__audioProbe?.decoded.length ?? 0) >= n, Object.keys(want9.effects).length + 1, { timeout: 20000 }).catch(() => null);
      for (let i = 0, n = -1; i < 10; i++) {
        const now = await inGame.evaluate(() => window.__audioProbe?.starts.length ?? 0);
        if (now === n) break;
        n = now;
        await inGame.waitForTimeout(1000);
      }
      // 4. opening How to play gives the mouse back. Headless Chromium grants no real pointer lock, so the lock is
      //    faked the way the hidden tab is above: the page is told the canvas holds it, and its release is counted.
      await inGame.evaluate(() => {
        const lock: { exits: number; held: boolean } = (window.__lock = { exits: 0, held: true });
        const canvas = document.querySelector('canvas');
        Object.defineProperty(document, 'pointerLockElement', { get: () => (lock.held ? canvas : null), configurable: true });
        document.exitPointerLock = () => { lock.exits++; lock.held = false; document.dispatchEvent(new Event('pointerlockchange')); };
      });
      await inGame.keyboard.press('KeyH');
      await inGame.waitForTimeout(300);
      const lock = await inGame.evaluate(() => ({ ...window.__lock! }));
      const lockSeen = await screen(inGame);
      st.check('opening How to play in the game releases the mouse (a faked pointer lock)', inLevel !== null && lockSeen.help && /^PAUSED/.test(lockSeen.hud) && lock.exits === 1 && !lock.held, `level ${inLevel ?? 'NOT LOADED'}; how-to-play ${lockSeen.help ? 'shown' : 'NOT shown'}, HUD ${JSON.stringify(lockSeen.hud.slice(0, 6))}; the lock was released ${lock.exits} time(s) and is ${lock.held ? 'STILL HELD' : 'free'}`);
      await inGame.evaluate(() => { window.__lock!.held = false; });
      // 5. B closes the page on a pad and is also dash: the press that closes it must not be a dash. Then B again,
      //    in the game, must be one, or the first half proves nothing.
      const dashSec = want9.effects['dash']!.seconds;
      const startsFrom = (n: number): Promise<number[]> => inGame.evaluate((k) => (window.__audioProbe?.starts ?? []).slice(k).filter((s) => !s.loop).map((s) => s.seconds), n);
      const count = (): Promise<number> => inGame.evaluate(() => window.__audioProbe?.starts.length ?? 0);
      await inGame.evaluate(() => { window.__pad!.on = true; });
      await inGame.waitForTimeout(200);
      const beforeClose = await count();
      await inGame.evaluate(() => { window.__pad!.down = [1]; });
      const padClosed = await inGame.waitForFunction(() => document.getElementById('help')?.hidden === true, null, { timeout: 5000 }).then(() => true).catch(() => false);
      await inGame.waitForTimeout(800); // B is still down: many ticks in which a held dash would be read
      const leaked = await startsFrom(beforeClose);
      await inGame.evaluate(() => { window.__pad!.down = []; });
      await inGame.waitForTimeout(400);
      const beforeDash = await count();
      await inGame.evaluate(() => { window.__pad!.down = [1]; });
      await inGame.waitForTimeout(600);
      await inGame.evaluate(() => { window.__pad!.down = []; });
      await inGame.waitForTimeout(300);
      const control = await startsFrom(beforeDash);
      const dashed = control.some((s) => Math.abs(s - dashSec) < 0.05);
      st.check('B on a pad closes How to play and is not also a dash (a faked pad)', padClosed && leaked.length === 0 && dashed, `the page ${padClosed ? 'closed' : 'did NOT close'}; with B still held ${leaked.length ? `sounds STARTED (${leaked.join(', ')} s)` : 'no sound started'}; B pressed again ${dashed ? `started the dash sound (${control.join(', ')} s; dash.mp3 is ${dashSec} s)` : `started NO dash sound (${control.join(', ') || 'nothing'})`}`);
      await inGame.close();

      // with a test or tool parameter the page is bare: no title screen, no how-to-play page, no sound
      for (const q of TITLE.bare.map((p) => `?${p}`)) {
        const bare = await ctx.browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
        await bare.addInitScript(AUDIO_PROBE);
        const bareSounds: string[] = [];
        bare.on('request', (r) => { if (/\.(mp3|m4a|ogg|wav)(\?|$)/.test(r.url())) bareSounds.push(r.url()); });
        await bare.goto(`${prod.url}/${q}`);
        await bare.waitForFunction(() => /Enter: start/.test(document.body.innerText), null, { timeout: 20000 }).catch(() => null);
        const dom = await bare.evaluate(() => ({
          cls: document.documentElement.className,
          ids: [...document.querySelectorAll('[id]')].map((e) => e.id).sort().join(' '),
          media: document.querySelectorAll('audio, video, img, picture, template').length,
          text: document.body.innerText,
        }));
        await bare.keyboard.press('Enter'); // start the level as that page's player would, then jump
        await bare.waitForFunction(() => document.body.dataset['level'] ?? null, null, { timeout: 20000 }).catch(() => null);
        await bare.waitForTimeout(600);
        await bare.keyboard.down('Space');
        await bare.waitForTimeout(500);
        await bare.keyboard.up('Space');
        await bare.waitForTimeout(300);
        const bareAudio = await bare.evaluate(() => `${window.__audioProbe?.contexts ?? -1} contexts, ${window.__audioProbe?.starts.length ?? -1} sources started`);
        st.check(`${q}: a bare page (no title, no how-to-play, the old menu text)`, dom.cls === 'bare' && dom.ids === 'app hud' && dom.media === 0 && /Enter: start/.test(dom.text), `class ${dom.cls}; ids: ${dom.ids}; media elements ${dom.media}; text ${JSON.stringify(dom.text.slice(0, 60))}`);
        st.check(`${q}: no sound (in the level, after a jump)`, bareAudio === '0 contexts, 0 sources started' && bareSounds.length === 0, `${bareAudio}, ${bareSounds.length} sound files requested`);
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
