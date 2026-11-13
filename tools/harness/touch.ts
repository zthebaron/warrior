// touch (D-027) — the game played by a thumb, on the REAL page.
//
// Every other stage but reachable opens /?harness=1, whose page has no frame loop and is driven by the override.
// A thumb reaches the simulation through neither: it is a live input source, read when the game's own loop
// samples input. So this stage opens the game's front door (the title, the sound, the teach line, the real
// requestAnimationFrame loop) in a phone-sized landscape viewport with touch on, and plays it with REAL touch
// events: Chromium's own input pipeline (CDP Input.dispatchTouchEvent), trusted, several fingers at once, each
// with its own identifier. Nothing here calls setInput, playback or the override.
//
// What it reads is the touch probe (src/main.ts `__TOUCH_PROBE__`): a harness build's page opened with
// ?touchprobe=1 and WITHOUT ?harness=1. The probe reads the game (the state, the warrior, the camera, and the
// frame input.sample returned on every played tick) and does two things a player cannot:
//   place(pos, facing)   put the warrior somewhere (and make it where a fall returns him), facing up the path with
//                        the camera behind him. Used for three things, none of them a check:
//                        - the goal: no chapter that has a next chapter has its goal nearer than 101 m of
//                          platforming, and a scripted thumb on a page that draws eight frames a second is not a
//                          bot. He is placed short of chapter 1's goal; the fight with the swordsman there, the
//                          walk in and the tap on Next chapter are the thumb's.
//                        - home, between the checks on chapter 1's first flat (POLISH-1: a walk back by the stick
//                          never settled, and cost 18 s a call).
//                        - the takeoffs of chapter 2's first wall jump and double jump and chapter 4's first dash
//                          jump (POLISH-1, B-107): he is put where the level's path makes each from; the move
//                          is the thumb's.
//   breakControl(name)   break one control from OUTSIDE the controls, so each check below is seen to fail with
//                        its control broken. A control that is a real button (Play, pause, the cards, a
//                        chapter's row) is broken by taking the pointer from the element instead.
// The production bundle has no probe: preflight refuses a dist/ that carries its marker.
//
// The page draws slowly on SwiftShader and its loop then runs up to five ticks a frame, so the simulation runs
// slower than the wall clock and in bursts. Every hold here is counted in played ticks read from the probe,
// never in milliseconds.
//
// The stage's own numbers are in MEASUREMENTS.md "D-027 the touch stage".

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Browser, CDPSession, Page } from '@playwright/test';
import { EnvironmentError, FAILURE, Stage, guard, type Ctx, type Foe, type StageResult, type Vec3 } from './lib.ts';
import { launchBrowser } from './preflight.ts';
import { TOUCH } from '../../src/engine/touch.ts';
import { CAMERA_TUNING } from '../../src/engine/camera-tuning.ts';

export const TOUCH_STAGE = {
  /** the phone-sized landscape viewports (CSS pixels): the brief's two */
  phones: [[844, 390], [932, 430]] as const,
  /** a finger's smallest target (CSS pixels) */
  minTarget: 44,
  /** MEASUREMENTS "Measured": a single jump held to its full height rises this far (m) */
  fullRise: 2.34,
  /** and the catch at chapter 2's first face needs Jump down at least this many ticks ("D-025 the wall") */
  catchTicks: 18,
  /** a held jump is judged within this of the full rise (m); a tap must stay this far under it */
  riseTol: 0.1,
  tapUnder: 0.4,
  /** a top speed is judged within this of TUNING's (m/s) */
  speedTol: 0.3,
  /** a turn is judged within this of what the drag asks for (degrees) */
  turnTol: 0.6,
  /** how far the stick is pushed, as a share of its radius: inside the dead zone, mid ring, outer ring */
  share: { dead: 0.15, mid: 0.55, outer: 1.0 },
  /** the warrior is placed here for the goal: on chapter 1's last flat, short of its swordsman and its goal */
  goalStart: [95.2, 9.05, 0] as Vec3,
  /** the scripted fight: walk until he is this near (inside FIGHT.swordsman.sightRange 4.5), cut when he is this near (inside FIGHT.warrior.reach 1.9), and not again for this many ticks (over FIGHT.warrior.againSec 0.24 s) */
  fight: { approach: 3.9, cutAt: 1.85, againTicks: 16 },
  /**
   * where the warrior is put back between checks (by the probe's place, facing up the path): on chapter 1's first
   * flat (x -6 to 6), 7.5 m from the edge he can fall from and 4.5 m from the step that stops him. It is where the
   * old walk back by the stick always ended (x 1.56, its twelfth try), so every check runs over the same ground as
   * before; at x 0 a 'down' hold of the nothing-sticks checks carries him over the edge.
   */
  home: [1.5, 0.05, 0] as Vec3,
  /** ticks a release is given to show in the frames, and how many frames at the end must be neutral */
  settleTicks: 8,
  neutralTicks: 3,
  /** a wait for n played ticks gives up after this many ms a tick, plus the fixed part (a CI runner draws about 4 frames a second) */
  msPerTick: 120,
  waitMs: 20000,
  /** POLISH-1 (B-107): a hard move by thumb gives up after this many played ticks at each step of it */
  moveTicks: 150,
  /** Jump (the double) or Dash (the dash jump) is sent this far (m) short of the takeoff the level names: a touch lands a frame (5 ticks, 0.6 m at a run) after the probe last showed him, so up to 1.2 m later */
  pressShort: { double: 1.5, dash: 1.2 },
  /** attempts at a hard move before it counts as not made */
  tries: 3,
  /** chapter 2's first face: played ticks after Jump goes down within which the catch must come (it comes within about 40) */
  catchWithin: 150,
  /** the wall jump and the double jump by thumb: frames Jump is held (with the stick pushed in, for the wall jump), then frames it (and that stick) is let go, before Jump goes down again (MEASUREMENTS "POLISH-1 the hard moves by thumb") */
  again: { holdFrames: 2, letGoFrames: 1 },
};

// ---------- what the probe gives (src/main.ts TouchProbeSnapshot, TouchProbeTick) ----------
export interface Snap {
  tick: number;
  state: string;
  level: string | null;
  feet: Vec3;
  vel: Vec3;
  pstate: string;
  grounded: boolean;
  yawDeg: number;
  pitchDeg: number;
  slashes: number;
  enemies: Foe[];
  deaths: number;
  hands: string;
  touch: boolean;
  pixelRatio: number;
  figure: { left: number; right: number; top: number; bottom: number } | null;
}
export interface Tick { tick: number; x: number; y: number; jump: boolean; dash: boolean; sprint: boolean; slash: boolean; pstate: string; feetY: number; speed: number }
declare global {
  interface Window {
    __TOUCH_PROBE__?: { version: string; snapshot(): Snap; log(since: number): Tick[]; place(pos: Vec3, facingDeg: number): void; breakControl(name: string | null): void };
    __touchAudio?: { contexts: number; ctx: AudioContext | null };
    __canvasClicks?: number;
    __tapSeen?: { type: string; tick: number }[];
  }
}

/**
 * Runs in the page before any of its scripts: the played tick at which each touchstart and touchend reached the
 * page, before the game's own listeners (window, capture, passive: it reads, and stops and prevents nothing). It is
 * how the stage knows a tap's down and up really met the page with no tick between them, which `Thumbs.tap` asks
 * for and cannot force: on CI run 43485459420 a frame of 5 ticks came between the two.
 */
const TAP_SEEN = `(() => {
  const seen = (window.__tapSeen = []);
  for (const type of ['touchstart', 'touchend']) window.addEventListener(type, () => { const p = window.__TOUCH_PROBE__; seen.push({ type, tick: p ? p.snapshot().tick : -1 }); }, { capture: true, passive: true });
})()`;

/** Runs in the page before any of its scripts: counts the audio contexts opened and keeps the last. */
const AUDIO_COUNT = `(() => {
  const probe = (window.__touchAudio = { contexts: 0, ctx: null });
  const Real = window.AudioContext;
  if (!Real) return;
  window.AudioContext = class extends Real { constructor(...a) { super(...a); probe.contexts++; probe.ctx = this; } };
})()`;
/** Runs in the page before any of its scripts: this device's main pointer is NOT a finger (a laptop with a touch screen). */
const FINE_POINTER = `(() => {
  const real = window.matchMedia.bind(window);
  window.matchMedia = (q) => (/pointer:\\s*coarse/.test(q) ? { matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false } : real(q));
})()`;

/** Real fingers: each call is one Input.dispatchTouchEvent, and every finger still down is listed with it. */
export class Thumbs {
  private readonly points = new Map<number, { x: number; y: number }>();
  private readonly cdp: CDPSession;
  constructor(cdp: CDPSession) {
    this.cdp = cdp;
  }
  private list(): { id: number; x: number; y: number }[] {
    return [...this.points].map(([id, p]) => ({ id, x: p.x, y: p.y }));
  }
  async down(id: number, x: number, y: number): Promise<void> {
    this.points.set(id, { x, y });
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: this.list() });
  }
  async move(id: number, x: number, y: number): Promise<void> {
    this.points.set(id, { x, y });
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: this.list() });
  }
  /** Lift one finger: a touchEnd names the points that end, and the rest stay down. */
  async up(id: number): Promise<void> {
    const p = this.points.get(id);
    if (!p) return;
    this.points.delete(id);
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ id, x: p.x, y: p.y }] });
  }
  /** The system takes every finger away (a call comes in, a gesture is claimed). */
  async cancel(): Promise<void> {
    this.points.clear();
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  }
  async upAll(): Promise<void> {
    for (const id of [...this.points.keys()]) await this.up(id);
  }
  /**
   * Down and up with nothing between. Both are sent before either is answered, so the page meets them one after
   * the other with no frame between: a press shorter than a tick. (Awaiting the first lets the page draw a frame,
   * and so play several ticks, before the second arrives.)
   */
  async tap(x: number, y: number, id = 9): Promise<void> {
    const down = this.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [...this.list(), { id, x, y }] });
    const up = this.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ id, x, y }] });
    await Promise.all([down, up]);
  }
}

export interface TouchPage {
  page: Page;
  thumbs: Thumbs;
  errors: string[];
  snap(): Promise<Snap>;
  log(since: number): Promise<Tick[]>;
  /** the centre of an element, in CSS pixels */
  at(selector: string): Promise<{ x: number; y: number }>;
  tapOn(selector: string): Promise<void>;
  /** poll the probe until `ok`, or give up after `ms` and return null */
  until(ok: (s: Snap) => boolean, ms?: number): Promise<Snap | null>;
  /** wait until `n` more ticks have been played, and return the snapshot then (or the last one seen, if the game stopped) */
  ticks(n: number): Promise<Snap>;
  close(): Promise<void>;
}

/** A fresh browser and one page of the game. Every page gets its own Chromium, as the fight stage's do (SwiftShader's GPU process wedges). */
export async function openTouch(baseUrl: string, o: { size: readonly [number, number]; query?: string; touch?: boolean; dsf?: number; init?: string[] }): Promise<TouchPage> {
  const browser: Browser = await launchBrowser();
  const touch = o.touch ?? true;
  const context = await browser.newContext({ viewport: { width: o.size[0], height: o.size[1] }, deviceScaleFactor: o.dsf ?? 1, hasTouch: touch, isMobile: touch });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
  for (const s of [AUDIO_COUNT, TAP_SEEN, ...(o.init ?? [])]) await page.addInitScript(s);
  try {
    await page.goto(`${baseUrl}/${o.query ?? '?touchprobe=1'}`);
  } catch (err) {
    await browser.close().catch(() => {});
    throw new EnvironmentError(`the game's page did not load: ${(err instanceof Error ? err.message : String(err)).split('\n')[0]}`);
  }
  const thumbs = new Thumbs(await context.newCDPSession(page));
  const snap = (): Promise<Snap> => page.evaluate(() => window.__TOUCH_PROBE__!.snapshot());
  const until = async (ok: (s: Snap) => boolean, ms = TOUCH_STAGE.waitMs): Promise<Snap | null> => {
    const end = Date.now() + ms;
    for (;;) {
      const s = await snap();
      if (ok(s)) return s;
      if (Date.now() > end) return null;
      await page.waitForTimeout(25);
    }
  };
  const at = (selector: string): Promise<{ x: number; y: number }> => page.evaluate((sel) => {
    const r = document.querySelector(sel)?.getBoundingClientRect();
    if (!r) throw new Error(`no element ${sel}`);
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, selector);
  return {
    page, thumbs, errors, snap, until, at,
    log: (since) => page.evaluate((t) => window.__TOUCH_PROBE__!.log(t), since),
    tapOn: async (selector) => { const c = await at(selector); await thumbs.tap(c.x, c.y); },
    ticks: async (n) => {
      const from = (await snap()).tick;
      return (await until((s) => s.tick >= from + n, TOUCH_STAGE.waitMs + n * TOUCH_STAGE.msPerTick)) ?? (await snap());
    },
    close: () => browser.close().catch(() => {}),
  };
}

/** Wait for the title to be able to start the game. */
export async function titleReady(t: TouchPage): Promise<boolean> {
  return t.page.waitForFunction(() => document.documentElement.dataset['shell'] === 'ready', null, { timeout: 60000 }).then(() => true).catch(() => false);
}

interface Box { name: string; left: number; top: number; right: number; bottom: number; shown: boolean }
/** Where the controls, the teach line and the warrior are on the page, in CSS pixels. */
async function boxes(t: TouchPage): Promise<{ controls: Box[]; teach: Box; hint: boolean; figure: Snap['figure']; view: [number, number] }> {
  const dom = await t.page.evaluate(() => {
    const box = (name: string, sel: string): { name: string; left: number; top: number; right: number; bottom: number; shown: boolean } => {
      const e = document.querySelector(sel);
      const r = e?.getBoundingClientRect();
      return { name, left: r?.left ?? 0, top: r?.top ?? 0, right: r?.right ?? 0, bottom: r?.bottom ?? 0, shown: !!e && e.getClientRects().length > 0 };
    };
    const hint = document.getElementById('hint');
    return {
      controls: [box('the stick', '#touch .stick'), box('Jump', '#touch .tb.jump'), box('Sword', '#touch .tb.slash'), box('Dash', '#touch .tb.dash'), box('the pause button', '#touch-pause')],
      teach: box('the teach line', '#teach'),
      hint: !!hint && hint.getClientRects().length > 0,
      view: [window.innerWidth, window.innerHeight] as [number, number],
    };
  });
  return { ...dom, figure: (await t.snap()).figure };
}
const meets = (a: { left: number; top: number; right: number; bottom: number }, b: { left: number; top: number; right: number; bottom: number }): boolean =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/** What is wrong with the phone layout while playing: empty when nothing is. */
export async function layoutFaults(t: TouchPage): Promise<string[]> {
  const b = await boxes(t);
  const out: string[] = [];
  for (const c of b.controls) {
    if (!c.shown) { out.push(`${c.name} is not shown`); continue; }
    if (c.left < 0 || c.top < 0 || c.right > b.view[0] || c.bottom > b.view[1]) out.push(`${c.name} is cut off by the screen (${c.left.toFixed(0)},${c.top.toFixed(0)} to ${c.right.toFixed(0)},${c.bottom.toFixed(0)} of ${b.view.join('x')})`);
    if (c.right - c.left < TOUCH_STAGE.minTarget || c.bottom - c.top < TOUCH_STAGE.minTarget) out.push(`${c.name} is ${(c.right - c.left).toFixed(0)}x${(c.bottom - c.top).toFixed(0)} px, under ${TOUCH_STAGE.minTarget}`);
    if (b.figure && meets(c, b.figure)) out.push(`${c.name} covers the warrior`);
    if (b.teach.shown && meets(c, b.teach)) out.push(`${c.name} covers the teach line`);
    for (const d of b.controls) if (d !== c && d.shown && c.name < d.name && meets(c, d)) out.push(`${c.name} and ${d.name} overlap`);
  }
  if (b.teach.shown && b.figure && meets(b.teach, b.figure)) out.push('the teach line covers the warrior');
  if (b.teach.shown && (b.teach.left < 0 || b.teach.right > b.view[0] || b.teach.top < 0)) out.push('the teach line is cut off by the screen');
  if (b.hint) out.push("the hint's line (which names keys) is shown");
  return out;
}

/** Buttons under `selector` that a finger cannot press: too small, or cut off by the screen. */
async function buttonFaults(t: TouchPage, selector: string): Promise<{ n: number; faults: string[] }> {
  return t.page.evaluate(({ sel, min }) => {
    const faults: string[] = [];
    const all = [...document.querySelectorAll<HTMLElement>(sel)].filter((e) => e.getClientRects().length > 0);
    for (const e of all) {
      const r = e.getBoundingClientRect();
      const name = (e.textContent ?? '').trim() || e.id;
      if (r.width < min || r.height < min) faults.push(`"${name}" is ${r.width.toFixed(0)}x${r.height.toFixed(0)} px`);
      if (r.left < 0 || r.top < 0 || r.right > window.innerWidth || r.bottom > window.innerHeight) faults.push(`"${name}" is cut off by the screen`);
    }
    return { n: all.length, faults };
  }, { sel: selector, min: TOUCH_STAGE.minTarget });
}

const neutral = (f: Tick): boolean => f.x === 0 && f.y === 0 && !f.jump && !f.dash && !f.sprint && !f.slash;
const show = (f: Tick | undefined): string => (f ? `tick ${f.tick}: move (${f.x.toFixed(2)}, ${f.y.toFixed(2)})${f.jump ? ' jump' : ''}${f.dash ? ' dash' : ''}${f.sprint ? ' sprint' : ''}${f.slash ? ' slash' : ''}` : 'no tick played');

/** The stick and the buttons of one page: where they are, and a thumb on each. Finger 1 is the stick's, 2 a button's, 3 the camera's. */
export async function hands(t: TouchPage): Promise<{
  stick(dir: 'up' | 'down' | 'left' | 'right', share: number): Promise<void>;
  stickOff(): Promise<void>;
  press(b: 'jump' | 'slash' | 'dash', id?: number): Promise<void>;
  lift(id?: number): Promise<void>;
  tapButton(b: 'jump' | 'slash' | 'dash'): Promise<void>;
  centre(b: 'jump' | 'slash' | 'dash'): { x: number; y: number };
}> {
  const stick = await t.at('#touch .stick');
  const centres = { jump: await t.at('#touch .tb.jump'), slash: await t.at('#touch .tb.slash'), dash: await t.at('#touch .tb.dash') };
  const R = TOUCH.stick.radius;
  const DIR = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] } as const;
  let stickDown = false;
  return {
    stick: async (dir, share) => {
      const x = stick.x + DIR[dir][0] * R * share, y = stick.y + DIR[dir][1] * R * share;
      if (stickDown) await t.thumbs.move(1, x, y);
      else await t.thumbs.down(1, x, y);
      stickDown = true;
    },
    stickOff: async () => { await t.thumbs.up(1); stickDown = false; },
    press: (b, id = 2) => t.thumbs.down(id, centres[b].x, centres[b].y),
    lift: (id = 2) => t.thumbs.up(id),
    tapButton: (b) => t.thumbs.tap(centres[b].x, centres[b].y, 8),
    centre: (b) => centres[b],
  };
}

/** Walk up to a swordsman with the stick and fell him with the Sword button. `toward`: which way on the stick he is. */
export async function fell(t: TouchPage, id: string, toward: 'up' | 'down', tries = 4): Promise<{ down: boolean; presses: number; deaths: number; note: string }> {
  const h = await hands(t);
  const start = await t.snap();
  let presses = 0, last = -99, pushing = false, deathsSeen = start.deaths;
  const end = Date.now() + 90000;
  try {
    for (;;) {
      const s = await t.snap();
      const foe = s.enemies.find((e) => e.id === id);
      if (!foe) return { down: false, presses, deaths: s.deaths - start.deaths, note: `no swordsman "${id}" on ${s.level}` };
      if (foe.mode === 'fallen') return { down: true, presses, deaths: s.deaths - start.deaths, note: `${presses} presses of Sword, ${s.deaths - start.deaths} deaths on the way` };
      if (Date.now() > end || s.deaths - start.deaths >= tries) return { down: false, presses, deaths: s.deaths - start.deaths, note: `he is "${foe.mode}" after ${presses} presses and ${s.deaths - start.deaths} deaths` };
      if (s.state !== 'play') {
        // cut down: let go, and begin again when he stands at the torii (the fingers are nothing after a death's cards)
        if (pushing) { await h.stickOff(); pushing = false; }
        await t.until((x) => x.state === 'play', 15000);
        deathsSeen = s.deaths;
        continue;
      }
      if (s.deaths !== deathsSeen) { deathsSeen = s.deaths; if (pushing) { await h.stickOff(); pushing = false; } }
      // Step into his sight facing him, then stand: he walks up to his own standoff, inside the warrior's reach and
      // in front of him. Walking on into him would pass through him (he has no body) and leave him behind the cut.
      const d = Math.hypot(foe.pos[0] - s.feet[0], foe.pos[2] - s.feet[2]);
      if (d > TOUCH_STAGE.fight.approach && !pushing) { await h.stick(toward, TOUCH_STAGE.share.mid); pushing = true; }
      else if (d <= TOUCH_STAGE.fight.approach && pushing) { await h.stickOff(); pushing = false; }
      if (d <= TOUCH_STAGE.fight.cutAt && s.tick - last >= TOUCH_STAGE.fight.againTicks) { await h.tapButton('slash'); presses++; last = s.tick; }
      await t.page.waitForTimeout(20);
    }
  } finally {
    if (pushing) await h.stickOff();
  }
}

export interface Level { id: string; chapter: number; goal: { pos: Vec3 }; enemies?: { id: string; pos: Vec3 }[]; critical_path: (Vec3 | { pos: Vec3; via?: string })[] }
/** The first step of a level's path made by `via`: its index, where it is made from (a) and where it lands (b). */
export function firstVia(l: Level, via: string): { i: number; a: Vec3; b: Vec3 } {
  const at = (w: Level['critical_path'][number]): Vec3 => (Array.isArray(w) ? w : w.pos);
  const i = l.critical_path.findIndex((w) => !Array.isArray(w) && w.via === via);
  if (i < 1) throw new Error(`${l.id} has no step by ${via}`);
  return { i, a: at(l.critical_path[i - 1]!), b: at(l.critical_path[i]!) };
}

/** What a move by thumb came to, read from the probe. */
export interface Move { landed: boolean; made: string[]; both: number; jumpAfterDash: number | null; deaths: number; note: string }
/**
 * One move by thumb: place him at `from`, let him stand, play `fingers` (which lifts nothing), then wait until he
 * is down again (or dead, or out of time) and let every finger go. Landed is teach-probe's `landedOn`: on his feet
 * with no death on the way, within 0.3 m of the height of `to` (each of the three steps is a rise).
 */
export async function thumbMove(t: TouchPage, h: Awaited<ReturnType<typeof hands>>, from: Vec3, to: Vec3, fingers: (base: Snap) => Promise<void>): Promise<Move> {
  const S = TOUCH_STAGE;
  await t.until((s) => s.state === 'play', 15000);
  await t.page.evaluate((p) => window.__TOUCH_PROBE__!.place(p, -90), from);
  await t.until((s) => s.state === 'play' && s.grounded && Math.hypot(s.vel[0], s.vel[2]) < 0.05, 15000);
  await t.ticks(S.settleTicks);
  const start = await t.snap();
  await fingers(start);
  // down again: on the ground after having left it, hanging from a ledge (not a landing), dead, or out of time
  const end = (await t.until((s) => s.state !== 'play' || s.deaths !== start.deaths || s.pstate === 'ledge_grab' || s.tick > start.tick + 2 * S.moveTicks
    || (s.grounded && s.tick > start.tick + 6 && s.pstate !== 'jump' && Math.abs(s.vel[1]) < 0.05), S.waitMs + 2 * S.moveTicks * S.msPerTick)) ?? (await t.snap());
  await h.lift();
  await h.stickOff();
  const log = await t.log(start.tick);
  const made = [...new Set(log.map((f) => f.pstate))];
  const dashAt = log.findIndex((f) => f.pstate === 'dash');
  const jumpAt = dashAt < 0 ? -1 : log.findIndex((f, k) => k > dashAt && f.jump);
  const deaths = end.deaths - start.deaths;
  // teach-probe's landedOn: up a rise its height says it; across a gap, past half of it
  const landed = deaths === 0 && end.state === 'play' && end.grounded && Math.abs(end.feet[1] - to[1]) < 0.3
    && (to[1] - from[1] > 0.3 || Math.hypot(end.feet[0] - from[0], end.feet[2] - from[2]) > 0.5 * Math.hypot(to[0] - from[0], to[2] - from[2]));
  // after a death he stands at the place again (place made it his respawn), and the game plays on
  if (deaths > 0 || end.state !== 'play') await t.until((s) => s.state === 'play' && s.grounded, 15000);
  const both = log.filter((f) => (f.jump || f.dash) && (f.x || f.y)).length;
  // the ticks Jump was read as down, counted from the first tick he left the ground: how the presses landed
  const off = log.findIndex((f) => f.pstate !== 'idle' && f.pstate !== 'run' && f.pstate !== 'sprint');
  const runs: string[] = [];
  log.forEach((f, k) => { const prev = log[k - 1]; if (f.jump && !prev?.jump) runs.push(`${k - off}`); else if (!f.jump && prev?.jump) runs[runs.length - 1] += `..${k - 1 - off}`; });
  return {
    landed, made, deaths, both, jumpAfterDash: jumpAt < 0 ? null : jumpAt - dashAt,
    note: `from (${from.map((v) => v.toFixed(1)).join(', ')}): ${landed ? 'LANDED' : 'did not land'} at (${end.feet.map((v) => v.toFixed(2)).join(', ')}), aiming at (${to.join(', ')}); ${deaths} death(s); states ${made.join(' > ')}${jumpAt >= 0 ? `; Jump down ${jumpAt - dashAt} ticks after the dash began` : ''}; Jump read down on ticks ${runs.join(', ') || 'none'} (from the first in the air); a button and the stick read together on ${both} ticks`,
  };
}
/**
 * Two presses of Jump by thumb: `first` sent, TOUCH_STAGE.again.holdFrames frames, `letGo` sent, letGoFrames frames,
 * then `second`. Paced by the page's frames (5 played ticks each here, on any runner: the loop's cap binds), not by
 * each touch being taken: a touch is taken about 3 frames after it is sent on darwin and later on CI, so a wait for
 * it puts the second press wherever the runner's speed puts it.
 */
export async function pressTwice(t: TouchPage, first: Promise<void>[], letGo: () => Promise<void>[], second: () => Promise<void>): Promise<void> {
  const sent = [...first];
  for (let f = 0; f < TOUCH_STAGE.again.holdFrames; f++) await nextFrame(t);
  sent.push(...letGo());
  for (let f = 0; f < TOUCH_STAGE.again.letGoFrames; f++) await nextFrame(t);
  await second();
  await Promise.all(sent);
}

/**
 * Resolves on the page's next animation frame, after the game's own loop has played that frame's ticks (its
 * callback was asked for first). A wait of one frame without a poll of the probe: each poll costs a frame of its
 * own on a page that draws a few frames a second, and a hard move has no frames to spare.
 */
export async function nextFrame(t: TouchPage): Promise<void> {
  await t.page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => r())));
}

/** A move by thumb on a page that draws a few frames a second: up to TOUCH_STAGE.tries attempts, as reachable's ledge catch is pressed again. The note says which try it was. */
export async function tries(move: () => Promise<Move>): Promise<Move> {
  let m = await move(), k = 1;
  const missed: string[] = [];
  for (; k < TOUCH_STAGE.tries && !m.landed; k++) { missed.push(m.note); m = await move(); }
  return { ...m, note: `${m.note} (try ${k} of up to ${TOUCH_STAGE.tries}${missed.length ? `; the tries before: ${missed.map((n, i) => `[${i + 1}] ${n}`).join(' ')}` : ''})` };
}

function tuning(root: string): { runSpeed: number; sprintSpeed: number } {
  const text = readFileSync(join(root, 'src/entities/player.ts'), 'utf8');
  const num = (name: string): number => Number(new RegExp(`\\b${name}:\\s*([0-9.]+)`).exec(text)?.[1] ?? NaN);
  return { runSpeed: num('runSpeed'), sprintSpeed: num('sprintSpeed') };
}

/**
 * POLISH-1 (B-108): the stage is three once-stages, each its own CI job, run side by side. Each part is a visit of
 * its own to the phone page, started by a tap on Play; each check is in exactly one part, as it was, and each part
 * also checks that its own page logged no error.
 *   'touch'           (controls)  section 1: the title, Play, the sound, the layout, the Sword, the stick, Jump,
 *                                 Dash, the camera, three fingers, a tap on the game. On chapter 1's first flat.
 *   'touch-release'   (release)   sections 2 and 3: nothing sticks, however a finger leaves; pause, how to play and
 *                                 resume by tap. On chapter 1's first flat (its first swordsman felled by thumb first).
 *   'touch-chapters'  (chapters)  sections 4 to 9: a goal and the next chapter, chapter 2's face and its wall jump
 *                                 and double jump, the chapter list and chapter 4's dash jump, the menu; then the
 *                                 second phone size, upright, and the pages that must have no touch controls.
 */
export type TouchPart = 'controls' | 'release' | 'chapters';

export async function touch(ctx: Omit<Ctx, 'levelId' | 'level' | 'segments'>, part: TouchPart = 'controls'): Promise<StageResult> {
  const st = new Stage(part === 'controls' ? 'touch' : `touch-${part}`);
  const S = TOUCH_STAGE;
  // POLISH-1: each check's own time (ms since the check before it), kept in the report so a CI run shows where its
  // time goes (MEASUREMENTS "POLISH-1 the touch job on CI"). It changes no check.
  const checkMs: number[] = [];
  st.data['checkMs'] = checkMs;
  {
    const check = st.check.bind(st);
    let last = Date.now();
    st.check = (name: string, ok: boolean, detail = ''): boolean => { const now = Date.now(); checkMs.push(now - last); last = now; return check(name, ok, detail); };
  }
  const open: TouchPage[] = [];
  const page = async (o: Parameters<typeof openTouch>[1]): Promise<TouchPage> => {
    const t = await openTouch(ctx.baseUrl, o);
    open.push(t);
    return t;
  };
  return guard(st, async () => {
    try {
      const T = tuning(ctx.root);
      const levels = (id: string): Level => JSON.parse(readFileSync(join(ctx.root, 'levels', `${id}.json`), 'utf8'));
      const ch1 = levels('01-lower-stair'), ch2 = levels('02-cliff-seam'), ch4 = levels('04-summit-ridge');

      // ================= 1. the phone, landscape, the whole game by thumb =================
      const t = await page({ size: S.phones[0] });
      if (!st.check('the title is ready on a phone', await titleReady(t), `${S.phones[0].join('x')}, touch on`)) return;
      const probe = await t.page.evaluate(() => window.__TOUCH_PROBE__?.version ?? null);
      if (probe !== 'TOUCH_PROBE_V1') {
        st.failureClass = FAILURE.ENVIRONMENT;
        st.check('the touch probe is on the page', false, `__TOUCH_PROBE__ is ${probe}: the bundle was not built with --mode harness`);
        return;
      }
      const W_ = TOUCH.words;
      const tapText = async (scope: string, text: string): Promise<boolean> => {
        const c = await t.page.evaluate(({ scope, text }) => {
          const b = [...document.querySelectorAll<HTMLElement>(`${scope} button`)].find((e) => (e.textContent ?? '').trim() === text);
          const r = b?.getBoundingClientRect();
          return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
        }, { scope, text });
        if (!c) return false;
        await t.thumbs.tap(c.x, c.y);
        return true;
      };

      if (part === 'controls') {
        const atTitle = await t.page.evaluate(() => ({ cls: document.documentElement.className, layer: !!document.getElementById('touch'), layerShown: (document.getElementById('touch')?.getClientRects().length ?? 0) > 0, audio: window.__touchAudio?.contexts ?? -1 }));
        st.check('on a touch device the controls are in the document, and not shown over the title', atTitle.layer && !atTitle.layerShown && /\btouch\b/.test(atTitle.cls), `<html class="${atTitle.cls}">, #touch ${atTitle.layer ? (atTitle.layerShown ? 'SHOWN over the title' : 'present, hidden') : 'MISSING'}`);
        const titleButtons = await buttonFaults(t, '#title button');
        st.check(`every button on the title can be pressed by a finger (${S.minTarget} px, on screen)`, titleButtons.n >= 4 && titleButtons.faults.length === 0, titleButtons.faults.join('; ') || `${titleButtons.n} buttons`);

        // --- start from the title by tap; the tap wakes the sound and is not a jump
        await t.page.evaluate(() => { (document.getElementById('title-play') as HTMLElement).style.pointerEvents = 'none'; });
        await t.tapOn('#title-play');
        await t.page.waitForTimeout(600);
        const deadPlay = await t.snap();
        st.check('seen to fail: with Play out of reach the same tap starts nothing', deadPlay.state === 'menu', `state ${deadPlay.state}`);
        await t.page.evaluate(() => { (document.getElementById('title-play') as HTMLElement).style.pointerEvents = ''; });
        await t.tapOn('#title-play');
        const started = await t.until((s) => s.state === 'play', 60000);
        if (!st.check('a tap on Play starts the first chapter', started?.level === ch1.id, started ? `playing ${started.level}` : `state ${(await t.snap()).state} after 60 s`)) return;
        const sound = await t.page.waitForFunction(() => window.__touchAudio?.ctx?.state === 'running', null, { timeout: 8000 }).then(() => true).catch(() => false);
        const audio = await t.page.evaluate(() => ({ n: window.__touchAudio?.contexts ?? -1, state: window.__touchAudio?.ctx?.state ?? 'none' }));
        st.check('sound starts on that first touch: none before it, one running context after', atTitle.audio === 0 && audio.n === 1 && sound, `${atTitle.audio} contexts before the tap; after: ${audio.n}, ${audio.state}`);
        await t.ticks(10);
        const first = await t.log(0);
        st.check('the tap that starts the game is not a jump', first.length > 0 && first.every(neutral), first.find((f) => !neutral(f)) ? show(first.find((f) => !neutral(f))) : `${first.length} ticks, every frame neutral`);

        // --- the layout: nothing covers the warrior or the teach line, everything is a finger's size and on screen
        const lay = await layoutFaults(t);
        st.check(`the controls at ${S.phones[0].join('x')}: on screen, a finger's size, clear of the warrior and the teach line`, lay.length === 0, lay.join('; ') || 'the stick, Jump, Sword, Dash and the pause button');
        const teach = await t.page.evaluate(() => { const e = document.getElementById('teach'); return { shown: !!e && e.getClientRects().length > 0, text: e?.textContent ?? '', kbd: e?.querySelectorAll('kbd').length ?? 0 }; });
        st.check('the teach line names the touch controls, not keys', teach.shown && teach.text.includes(TOUCH.labels['move']!) && teach.kbd === 0, `"${teach.text}" (${teach.kbd} key caps)`);
      } else {
        // parts 'release' and 'chapters': a visit of their own, started by a tap on Play (its checks are part 'controls')
        await t.tapOn('#title-play');
        const begun = await t.until((s) => s.state === 'play', 60000);
        if (!st.check('a tap on Play starts the first chapter', begun?.level === ch1.id, begun ? `playing ${begun.level}` : `state ${(await t.snap()).state} after 60 s`)) return;
      }

      const h = await hands(t);
      /** Push the stick one way for `ticks` played ticks, then let it go: the frames of those ticks, and where he was before and after. */
      const walk = async (dir: 'up' | 'down', share: number, ticks: number): Promise<{ log: Tick[]; from: Snap; to: Snap }> => {
        const from = await t.snap();
        await h.stick(dir, share);
        const to = (await t.until((s) => s.tick - from.tick >= ticks || s.state !== 'play', S.waitMs + ticks * S.msPerTick)) ?? (await t.snap());
        const log = await t.log(from.tick);
        await h.stickOff();
        return { log, from, to };
      };
      /**
       * Put the warrior back on the middle of the first flat, facing up the path with the camera behind him (so up
       * the screen is +X and right is +Z). Every check that moves him starts from here, so none walks him off the
       * edge. If a fall has stood the first swordsman up again, he is felled again first, by the thumb.
       * By the probe's place, not by the stick (POLISH-1): the walk back never settled. The thumb lets go a frame
       * late and he overshoots by about 2 m either way against a 1.2 m mark, so every call ran out its 12 tries,
       * about 18 s a call and 324 s of the stage's 537 (MEASUREMENTS "POLISH-1 the touch stage"); and the walk was
       * never one of the checks. Placing also puts the camera back behind him, which the walk did not.
       */
      const home = async (): Promise<void> => {
        for (let i = 0; i < 3; i++) {
          const s = (await t.until((v) => v.state === 'play', 15000)) ?? (await t.snap());
          if (s.enemies[0] && s.enemies[0].mode !== 'fallen') { await fell(t, s.enemies[0].id, 'up'); continue; }
          break;
        }
        await t.page.evaluate((p) => window.__TOUCH_PROBE__!.place(p, -90), S.home);
        await t.ticks(S.settleTicks);
      };
      const fastest = (log: Tick[]): number => Math.max(0, ...log.map((f) => f.speed));
      const unit = (log: Tick[]): boolean => log.filter((f) => f.x || f.y).every((f) => Math.abs(Math.hypot(f.x, f.y) - 1) < 1e-9);

      if (part === 'controls') {
        // --- a swordsman felled with the Sword button (chapter 1's first, up the path from the spawn)
        const fight = await fell(t, ch1.enemies![0]!.id, 'up');
        st.check('a swordsman is felled with the stick and the Sword button', fight.down, fight.note);
        await t.until((s) => s.state === 'play' && s.grounded, 15000);

        // --- the Sword: a tap shorter than a tick still slashes; broken, it does not
        await t.page.evaluate(() => window.__TOUCH_PROBE__!.breakControl('slash'));
        let before = await t.ticks(20); // clear of the last slash (FIGHT.warrior.againSec)
        await h.tapButton('slash');
        let after = await t.ticks(12);
        st.check('seen to fail: with the Sword broken a tap starts no slash', after.slashes === before.slashes, `${after.slashes - before.slashes} slashes`);
        await t.page.evaluate(() => window.__TOUCH_PROBE__!.breakControl(null));
        before = await t.snap();
        await h.tapButton('slash');
        after = await t.ticks(12);
        const slashTicks = (await t.log(before.tick)).filter((f) => f.slash).length;
        st.check('a tap on Sword, down and up with no frame between, starts one slash', after.slashes === before.slashes + 1 && slashTicks === 1, `${after.slashes - before.slashes} slashes; the sword read as held on ${slashTicks} tick`);

        // --- the stick: the dead zone, the mid ring (run), the outer ring (sprint), and release
        await home();
        const dead = await walk('up', S.share.dead, 12);
        st.check('inside the dead zone the stick says nothing', dead.log.length >= 10 && dead.log.every(neutral), `${S.share.dead} of the radius for ${dead.log.length} ticks: ${dead.log.find((f) => !neutral(f)) ? show(dead.log.find((f) => !neutral(f))) : 'every frame neutral'}`);

        await t.page.evaluate(() => window.__TOUCH_PROBE__!.breakControl('stick'));
        const noStick = await walk('up', S.share.mid, 15);
        st.check('seen to fail: with the stick broken a push moves nothing', noStick.log.every(neutral) && Math.abs(noStick.to.feet[0] - noStick.from.feet[0]) < 0.05, `${noStick.log.length} ticks, moved ${(noStick.to.feet[0] - noStick.from.feet[0]).toFixed(2)} m`);
        await t.page.evaluate(() => window.__TOUCH_PROBE__!.breakControl(null));

        // up the screen is up the path (world +X while the camera looks up it): toward the step that stops him, away from the edge
        const run = await walk('up', S.share.mid, 30);
        const runMoved = run.to.feet[0] - run.from.feet[0];
        const runFrames = run.log.filter((f) => f.x || f.y);
        st.check('the stick at mid ring walks the warrior: full deflection, run speed, no sprint',
          runFrames.length >= 15 && unit(run.log) && runFrames.every((f) => !f.sprint && f.x > 0.99) && runMoved > 1 && Math.abs(fastest(run.log) - T.runSpeed) <= S.speedTol,
          `${S.share.mid} of the radius: ${runFrames.length} ticks of move, every one of length 1 toward +X: ${unit(run.log)}; sprint on ${runFrames.filter((f) => f.sprint).length}; top speed ${fastest(run.log).toFixed(2)} (run ${T.runSpeed}); moved ${runMoved.toFixed(2)} m`);

        await home();
        await t.page.evaluate(() => window.__TOUCH_PROBE__!.breakControl('sprint'));
        const noSprint = await walk('up', S.share.outer, 12);
        st.check('seen to fail: with the outer ring broken the stick at its edge does not sprint', noSprint.log.every((f) => !f.sprint), `${noSprint.log.filter((f) => f.sprint).length} sprint ticks`);
        await t.page.evaluate(() => window.__TOUCH_PROBE__!.breakControl(null));
        await home();
        const sprint = await walk('up', S.share.outer, 22);
        const sprintFrames = sprint.log.filter((f) => f.x || f.y);
        st.check('the stick at its outer ring is sprint: full deflection, sprint speed',
          sprintFrames.length >= 12 && unit(sprint.log) && sprintFrames.every((f) => f.sprint && f.x > 0.99) && Math.abs(fastest(sprint.log) - T.sprintSpeed) <= S.speedTol,
          `${S.share.outer} of the radius: ${sprintFrames.length} ticks, sprint on ${sprintFrames.filter((f) => f.sprint).length}; top speed ${fastest(sprint.log).toFixed(2)} (sprint ${T.sprintSpeed}, run ${T.runSpeed})`);
        const still = await t.ticks(S.settleTicks + 20);
        const afterStick = (await t.log(still.tick - S.neutralTicks));
        st.check('the stick let go: the frame is neutral', afterStick.length >= S.neutralTicks && afterStick.every(neutral), show(afterStick.find((f) => !neutral(f)) ?? afterStick.at(-1)));

        // --- Jump: held is the full height, a tap is a low hop, broken is nothing
        const jump = async (hold: boolean): Promise<{ rise: number; held: number }> => {
          const base = await t.until((s) => s.state === 'play' && s.grounded && Math.hypot(s.vel[0], s.vel[2]) < 0.05, 15000) ?? (await t.snap());
          if (hold) await h.press('jump'); else await h.tapButton('jump');
          // up and down again: a full jump is about 47 ticks in the air
          await t.until((s) => s.tick - base.tick >= 60, S.waitMs + 60 * S.msPerTick);
          if (hold) await h.lift();
          const log = await t.log(base.tick);
          return { rise: Math.max(...log.map((f) => f.feetY)) - base.feet[1], held: log.filter((f) => f.jump).length };
        };
        await home();
        await t.page.evaluate(() => window.__TOUCH_PROBE__!.breakControl('jump'));
        const noJump = await jump(true);
        st.check('seen to fail: with Jump broken a held press does not leave the ground', noJump.rise < 0.05, `rose ${noJump.rise.toFixed(2)} m`);
        await t.page.evaluate(() => window.__TOUCH_PROBE__!.breakControl(null));
        await t.ticks(S.settleTicks);
        const full = await jump(true);
        st.check('a held Jump reaches full height', Math.abs(full.rise - S.fullRise) <= S.riseTol && full.held >= S.catchTicks, `rose ${full.rise.toFixed(2)} m (measured full rise ${S.fullRise}); Jump read as held for ${full.held} ticks`);
        await t.ticks(S.settleTicks);
        // The tap's down and up must meet the page with no tick between them, or this is a short hold and not the
        // tap the check names. Thumbs.tap sends them together but cannot force it: on a runner a frame can come
        // between (CI run 43485459420: 5 ticks, 1.43 m). Whether it did is read from the page (TAP_SEEN), apart from
        // the hop: a tap that met the page within one tick is judged at once, pass or fail; only one a frame split
        // is sent again, up to S.tries; if every try was split the check fails.
        const tapAt = async (): Promise<{ hop: { rise: number; held: number }; down: number; up: number }> => {
          await t.page.evaluate(() => { window.__tapSeen!.length = 0; });
          const hop = await jump(false);
          const seen = await t.page.evaluate(() => window.__tapSeen!.slice());
          const down = seen.find((e) => e.type === 'touchstart')?.tick ?? NaN;
          const up = seen.find((e) => e.type === 'touchend')?.tick ?? NaN;
          return { hop, down, up };
        };
        const split: string[] = [];
        let tap = await tapAt();
        while (tap.down !== tap.up && split.length + 1 < S.tries) {
          split.push(`[${split.length + 1}] down on tick ${tap.down}, up on tick ${tap.up}: held ${tap.hop.held}, rose ${tap.hop.rise.toFixed(2)} m`);
          await t.ticks(S.settleTicks);
          tap = await tapAt();
        }
        const hop = tap.hop;
        const whole = tap.down === tap.up;
        st.check('a tap on Jump, down and up with no frame between, is still a jump, and a low one', whole && hop.held === 1 && hop.rise > 0.5 && hop.rise <= full.rise - S.tapUnder,
          `rose ${hop.rise.toFixed(2)} m; Jump read as held for ${hop.held} tick(s); ${whole ? `down and up both met the page at tick ${tap.down}` : `down on tick ${tap.down}, up on tick ${tap.up}: a frame came between on every try, so no tap was ever made`} (try ${split.length + 1} of up to ${S.tries}${split.length ? `; the tries a frame split: ${split.join(' ')}` : ''})`);

        // --- Dash, with the stick held: two controls at once. Down the screen again, away from the step.
        const dash = async (): Promise<{ dashed: number; both: number; moved: number }> => {
          await home();
          const base = await t.snap();
          await h.stick('up', S.share.mid);
          await h.tapButton('dash');
          await h.stickOff();
          const end = await t.ticks(24);
          const log = await t.log(base.tick);
          return { dashed: log.filter((f) => f.pstate === 'dash').length, both: log.filter((f) => f.dash && (f.x || f.y)).length, moved: end.feet[0] - base.feet[0] };
        };
        await t.page.evaluate(() => window.__TOUCH_PROBE__!.breakControl('dash'));
        const noDash = await dash();
        st.check('seen to fail: with Dash broken the same press is no dash', noDash.dashed === 0, `${noDash.dashed} ticks in the dash`);
        await t.page.evaluate(() => window.__TOUCH_PROBE__!.breakControl(null));
        await t.ticks(30); // the dash's own wait between two (TUNING.dashCooldownSec)
        const dashed = await dash();
        st.check('Dash dashes, tapped while the stick is held', dashed.dashed >= 5 && dashed.both >= 1, `${dashed.dashed} ticks in the dash; the stick and Dash read together on ${dashed.both} tick(s); moved ${dashed.moved.toFixed(2)} m`);

        // --- the camera: a drag anywhere that is not a control, through the mouse's own call
        const [W, H] = S.phones[0];
        const drag = async (dx: number, dy: number): Promise<void> => {
          await t.thumbs.down(3, W / 2, H * 0.3);
          for (let i = 1; i <= 4; i++) await t.thumbs.move(3, W / 2 + (dx * i) / 4, H * 0.3 + (dy * i) / 4);
          await t.thumbs.up(3);
          await t.page.waitForTimeout(150);
        };
        const turnOf = (px: number): number => (-px * TOUCH.lookScale * CAMERA_TUNING.mouseSensitivity * 180) / Math.PI;
        await home();
        const cam0 = await t.snap();
        await t.page.evaluate(() => window.__TOUCH_PROBE__!.breakControl('look'));
        await drag(120, 0);
        const camDead = await t.snap();
        st.check('seen to fail: with the look broken a drag turns nothing', Math.abs(camDead.yawDeg - cam0.yawDeg) < 1e-6, `yaw moved ${(camDead.yawDeg - cam0.yawDeg).toFixed(2)} deg`);
        await t.page.evaluate(() => window.__TOUCH_PROBE__!.breakControl(null));
        await drag(120, 0);
        const cam1 = await t.snap();
        st.check('a drag off the controls turns the camera, as a mouse would', Math.abs(cam1.yawDeg - cam0.yawDeg - turnOf(120)) <= S.turnTol, `120 px across: yaw ${(cam1.yawDeg - cam0.yawDeg).toFixed(2)} deg (a mouse moved ${120 * TOUCH.lookScale} px: ${turnOf(120).toFixed(2)})`);
        await drag(0, 40);
        const cam2 = await t.snap();
        st.check('and a drag down the screen tilts it', cam2.pitchDeg > cam1.pitchDeg + 2, `40 px down: pitch ${cam1.pitchDeg.toFixed(1)} to ${cam2.pitchDeg.toFixed(1)} deg`);
        // three fingers at once: the stick, Jump, and a drag. Each keeps its own.
        // (home puts the camera back behind him first, so up the screen is up the path again)
        await home();
        const tri0 = await t.snap();
        await h.stick('up', S.share.mid);
        await h.press('jump');
        await t.thumbs.down(3, W / 2, H * 0.3);
        await t.thumbs.move(3, W / 2 - 120, H * 0.3 - 40);
        await h.stickOff();
        const tri1 = await t.snap();
        await t.thumbs.up(3);
        await h.lift();
        const triLog = await t.log(tri0.tick);
        st.check('three fingers at once: the stick, Jump and a camera drag each keep their own touch',
          triLog.some((f) => f.jump && (f.x || f.y)) && Math.abs(tri1.yawDeg - tri0.yawDeg - turnOf(-120)) <= S.turnTol,
          `the stick and Jump read together on ${triLog.filter((f) => f.jump && (f.x || f.y)).length} ticks; the drag turned the camera ${(tri1.yawDeg - tri0.yawDeg).toFixed(2)} deg (asked ${turnOf(-120).toFixed(2)})`);
        await home();

        // --- a tap on the game itself: no click, no pointer lock, no pause
        await t.page.evaluate(() => { window.__canvasClicks = 0; document.querySelector('canvas')!.addEventListener('click', () => { window.__canvasClicks = (window.__canvasClicks ?? 0) + 1; }); });
        await t.thumbs.tap(W / 2, H * 0.3);
        await t.page.waitForTimeout(500);
        const tapped = await t.page.evaluate(() => ({ clicks: window.__canvasClicks ?? -1, lock: document.pointerLockElement !== null }));
        const stillPlay = await t.snap();
        st.check('a tap on the game is not a click: no pointer lock is asked for, and nothing pauses', tapped.clicks === 0 && !tapped.lock && stillPlay.state === 'play', `${tapped.clicks} clicks reached the canvas; pointer lock ${tapped.lock ? 'HELD' : 'none'}; state ${stillPlay.state}`);
        st.check('the phone page logged no error', t.errors.length === 0, t.errors.slice(0, 3).join(' | '));
        await t.close();
        return;
      }

      if (part === 'release') {
        // ================= 2. nothing sticks: after every way a finger can leave, the live frame is neutral =================
        // Each: the stick pushed and Jump held (two fingers), seen in the frames; then the release; then the last
        // frames of the ticks that follow must be neutral. The direction alternates so the warrior stays on the flat.
        let flip = false;
        const held = async (): Promise<Snap> => {
          await home();
          flip = !flip;
          const from = await t.snap();
          await h.stick(flip ? 'up' : 'down', S.share.mid);
          await h.press('jump');
          await t.until((s) => s.tick > from.tick + 2, 8000);
          return from;
        };
        const settled = async (name: string, from: Snap, fingersStillDown = false): Promise<void> => {
          const end = await t.ticks(S.settleTicks);
          const log = await t.log(from.tick);
          const tail = log.filter((f) => f.tick > end.tick - S.neutralTicks);
          const wasHeld = log.some((f) => f.jump && (f.x || f.y));
          st.check(`nothing sticks: ${name}`, wasHeld && tail.length >= S.neutralTicks && tail.every(neutral),
            `${wasHeld ? 'the stick and Jump were read as held' : 'THE HOLD WAS NEVER READ'}; ${fingersStillDown ? 'with the fingers still down, ' : ''}the last frames: ${show(tail.find((f) => !neutral(f)) ?? tail.at(-1))}`);
        };

        let from = await held();
        await t.page.evaluate(() => window.__TOUCH_PROBE__!.breakControl('stuck'));
        await h.lift();
        await h.stickOff();
        {
          const end = await t.ticks(S.settleTicks);
          const tail = (await t.log(from.tick)).filter((f) => f.tick > end.tick - S.neutralTicks);
          st.check('seen to fail: with the releases broken the frame stays held after both fingers lift', tail.length > 0 && tail.some((f) => !neutral(f)), show(tail.find((f) => !neutral(f)) ?? tail.at(-1)));
        }
        await t.page.evaluate(() => window.__TOUCH_PROBE__!.breakControl(null));

        from = await held();
        await h.lift();
        await h.stickOff();
        await settled('both fingers lifted', from);

        from = await held();
        await t.thumbs.cancel();
        await h.stickOff(); // the driver's own book-keeping: the page was already told by the cancel
        await settled('touchcancel takes both fingers', from);

        // a finger sliding off Jump lets Jump go; the stick, under another finger, is still held
        from = await held();
        const j = h.centre('jump');
        await t.thumbs.move(2, j.x - (TOUCH.buttons.jump.radius + TOUCH.slideOff + 12), j.y - 30);
        {
          const end = await t.ticks(S.settleTicks);
          const tail = (await t.log(from.tick)).filter((f) => f.tick > end.tick - S.neutralTicks);
          st.check('a finger that slides off Jump lets it go, and the stick under the other finger is still held', tail.length >= S.neutralTicks && tail.every((f) => !f.jump && (f.x !== 0 || f.y !== 0)), show(tail.at(-1)));
        }
        await h.lift();
        await h.stickOff();
        await settled('the slid-off finger and the stick lifted', from);

        // a second finger on Jump is swallowed: lifting the first lets go, whatever the second does
        from = await held();
        await t.thumbs.down(4, j.x + 6, j.y + 4);
        await t.ticks(3);
        await h.lift(); // the first finger
        await h.stickOff();
        await settled('a second finger on Jump, the first one lifted', from, true);
        await t.thumbs.up(4);

        // the window loses focus, and the tab is hidden, with both fingers still on the glass
        from = await held();
        await t.page.evaluate(() => window.dispatchEvent(new Event('blur')));
        await settled('the window loses focus', from, true);
        await h.lift();
        await h.stickOff();
        from = await held();
        await t.page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
        await settled('the tab is hidden', from, true);
        await t.page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
        await h.lift();
        await h.stickOff();

        // ================= 3. everything the keyboard can leave, a finger can leave =================
        // --- pause and resume by tap, with the stick still held under another finger
        await home();
        await t.page.evaluate(() => { (document.getElementById('touch-pause') as HTMLElement).style.pointerEvents = 'none'; });
        await t.tapOn('#touch-pause');
        await t.page.waitForTimeout(500);
        st.check('seen to fail: with the pause button out of reach the same tap pauses nothing', (await t.snap()).state === 'play', `state ${(await t.snap()).state}`);
        await t.page.evaluate(() => { (document.getElementById('touch-pause') as HTMLElement).style.pointerEvents = ''; });
        await h.stick('up', S.share.mid);
        await t.tapOn('#touch-pause');
        const paused = await t.until((s) => s.state === 'pause', 8000);
        const card = await t.page.evaluate(() => ({ shown: (document.getElementById('touch-card')?.getClientRects().length ?? 0) > 0, title: document.querySelector('#touch-card h1')?.textContent ?? '', buttons: [...document.querySelectorAll('#touch-card button')].map((b) => b.textContent ?? ''), hud: document.getElementById('hud')?.textContent ?? '', controls: (document.getElementById('touch')?.getClientRects().length ?? 0) > 0 }));
        const cardButtons = await buttonFaults(t, '#touch-card button');
        st.check('a tap on the pause button pauses, under a card that offers resume, how to play, the chapters and the menu',
          !!paused && card.shown && card.title === W_.paused && [W_.resume, W_.help, W_.chapters, W_.menu].every((b) => card.buttons.includes(b)) && cardButtons.faults.length === 0 && card.hud === '' && !card.controls,
          `state ${paused?.state ?? (await t.snap()).state}; card "${card.title}": ${card.buttons.join(', ')}${cardButtons.faults.length ? `; ${cardButtons.faults.join('; ')}` : ''}; the HUD's line: "${card.hud}"; the controls ${card.controls ? 'STILL SHOWN' : 'hidden'}`);

        // --- how to play, from the card: the page names the touch controls
        await tapText('#touch-card', W_.help);
        await t.page.waitForFunction(() => !document.getElementById('help')?.hidden, null, { timeout: 8000 }).catch(() => null);
        const help = await t.page.evaluate(() => {
          const e = document.getElementById('help-content');
          return { open: !document.getElementById('help')?.hidden, text: e?.textContent ?? '', heads: [...(e?.querySelectorAll('th') ?? [])].map((x) => x.textContent ?? ''), cells: [...(e?.querySelectorAll('td') ?? [])].map((x) => x.textContent ?? ''), kbd: e?.querySelectorAll('kbd').length ?? 0 };
        });
        const L = TOUCH.labels;
        const named = [L['jump']!, L['dash']!, L['slash']!].every((n) => help.cells.includes(n)) && help.cells.some((c) => c.toLowerCase() === L['move']!.toLowerCase());
        st.check('the how-to-play page, opened by tap from the pause card, names the stick, Jump, Sword and Dash, and no key',
          help.open && help.heads.includes('Touch') && !help.heads.includes('Keyboard') && named && help.kbd === 0 && !/needs a keyboard/i.test(help.text) && help.text.includes(`Move with ${L['move']}`),
          `${help.open ? 'open' : 'NOT open'}; columns: ${help.heads.join(' | ')}; ${help.kbd} key caps; ${/needs a keyboard/i.test(help.text) ? 'STILL says it needs a keyboard' : 'no "needs a keyboard" line'}`);
        const helpButtons = await buttonFaults(t, '#help .foot button');
        st.check('its Back and Chapters buttons can be pressed by a finger', helpButtons.n >= 2 && helpButtons.faults.length === 0, helpButtons.faults.join('; ') || `${helpButtons.n} buttons`);
        await t.tapOn('#help-back');
        await t.page.waitForFunction(() => document.getElementById('help')?.hidden, null, { timeout: 8000 }).catch(() => null);
        const backAtCard = await t.page.evaluate(() => (document.getElementById('touch-card')?.getClientRects().length ?? 0) > 0);

        // --- resume by tap: the finger that was on the stick all along is nothing until it is lifted
        const pausedAt = await t.snap();
        await tapText('#touch-card', W_.resume);
        const resumed = await t.until((s) => s.state === 'play', 8000);
        const afterResume = await t.ticks(S.settleTicks);
        const resumeLog = await t.log(pausedAt.tick);
        st.check('a tap on Resume resumes; the tap is not a jump, and the stick held through the pause is let go',
          backAtCard && !!resumed && resumeLog.length >= S.neutralTicks && resumeLog.every(neutral) && afterResume.state === 'play',
          `${backAtCard ? 'Back returned to the card' : 'BACK DID NOT RETURN TO THE CARD'}; state ${resumed?.state ?? 'never play'}; ${resumeLog.length} ticks since: ${show(resumeLog.find((f) => !neutral(f)) ?? resumeLog.at(-1))}`);
        await h.stickOff();
        st.check('the phone page logged no error', t.errors.length === 0, t.errors.slice(0, 3).join(' | '));
        await t.close();
        return;
      }

      // ================= 4. a goal reached, and the next chapter taken by tap =================
      // The stage's one shortcut (see the header): the warrior is placed on chapter 1's last flat.
      const goal = ch1.goal.pos, guard = ch1.enemies!.at(-1)!;
      await t.page.evaluate((p) => window.__TOUCH_PROBE__!.place(p, -90), S.goalStart);
      await t.ticks(S.settleTicks);
      const last = await fell(t, guard.id, 'up');
      await t.until((s) => s.state === 'play' && s.grounded, 15000);
      await h.stick('up', S.share.mid);
      const won = await t.until((s) => s.state === 'results' || s.feet[0] > goal[0] + 4, 30000);
      await h.stickOff();
      const done = await t.page.evaluate(() => ({ shown: (document.getElementById('touch-card')?.getClientRects().length ?? 0) > 0, title: document.querySelector('#touch-card h1')?.textContent ?? '', buttons: [...document.querySelectorAll('#touch-card button')].map((b) => b.textContent ?? ''), hud: document.getElementById('hud')?.textContent ?? '' }));
      const doneButtons = await buttonFaults(t, '#touch-card button');
      st.check(`a goal is reached by the stick and the Sword (the warrior was placed ${(goal[0] - S.goalStart[0]).toFixed(1)} m short of chapter 1's by the test)`,
        last.down && won?.state === 'results' && done.shown && done.title === W_.complete && done.buttons.join() === W_.next && doneButtons.faults.length === 0 && done.hud === '',
        `the swordsman at the goal: ${last.note}; state ${won?.state ?? (await t.snap()).state}; card "${done.title}": ${done.buttons.join(', ')}${doneButtons.faults.join('; ')}`);
      await t.page.evaluate(() => { (document.querySelector('#touch-card button') as HTMLElement).style.pointerEvents = 'none'; });
      const nextAt = await t.at('#touch-card button');
      await t.thumbs.tap(nextAt.x, nextAt.y);
      await t.page.waitForTimeout(600);
      st.check('seen to fail: with Next chapter out of reach the same tap takes nothing', (await t.snap()).state === 'results', `state ${(await t.snap()).state}`);
      await t.page.evaluate(() => { (document.querySelector('#touch-card button') as HTMLElement).style.pointerEvents = ''; });
      // the button stands where a camera drag would begin: the tap must be neither a drag nor a jump in the chapter it starts
      await t.thumbs.tap(nextAt.x, nextAt.y);
      const next = await t.until((s) => s.state === 'play' && s.level === ch2.id, 60000);
      const nextTicks = await t.ticks(S.settleTicks);
      const nextLog = await t.log(0);
      const sinceNext = nextLog.filter((f) => f.tick > nextTicks.tick - S.settleTicks);
      st.check('a tap on Next chapter starts the next chapter, and is not a jump or a camera drag in it', !!next && sinceNext.every(neutral) && Math.abs(nextTicks.yawDeg + 90) < 1e-6, `${next ? `playing ${next.level}` : `state ${(await t.snap()).state}, level ${(await t.snap()).level}`}; yaw ${nextTicks.yawDeg.toFixed(2)}; ${show(sinceNext.find((f) => !neutral(f)) ?? sinceNext.at(-1))}`);
      if (!next) return;

      // ================= 5. chapter 2's first face: hold Jump while pushing in, then Jump again =================
      const h2 = await hands(t);
      const climb = async (): Promise<{ caught: boolean; top: number; both: number; grabY: number }> => {
        const base = await t.snap();
        await h2.stick('up', S.share.mid);
        // run at the face; from about three metres out Jump goes down and stays down, the stick still pushed in
        const atFace = (await t.until((s) => s.feet[0] >= 9.2 || s.state !== 'play', 30000)) ?? base;
        await h2.press('jump');
        // a catch comes within about 40 ticks of the press; the wait is bounded from the press, not from the start
        // of the run, so a face never caught (Jump broken) costs S.catchWithin ticks and not 400 (POLISH-1)
        const grab = await t.until((s) => s.pstate === 'ledge_grab' || s.tick - atFace.tick > S.catchWithin || s.state !== 'play', 40000);
        const caught = grab?.pstate === 'ledge_grab';
        await h2.lift();
        let top = grab?.feet[1] ?? 0;
        if (caught) {
          await t.ticks(4);
          await h2.press('jump'); // the second press pulls up
          const up = await t.until((s) => s.grounded && s.feet[1] > 4.3, 15000);
          await h2.lift();
          top = up?.feet[1] ?? (await t.snap()).feet[1];
        }
        await h2.stickOff();
        const log = await t.log(base.tick);
        return { caught, top, both: log.filter((f) => f.jump && f.x > 0.99).length, grabY: grab?.feet[1] ?? 0 };
      };
      await t.page.evaluate(() => window.__TOUCH_PROBE__!.breakControl('jump'));
      const noClimb = await climb();
      st.check('seen to fail: with Jump broken the face is never caught', !noClimb.caught && noClimb.top < 1, `feet at y ${noClimb.top.toFixed(2)}`);
      await t.page.evaluate(() => window.__TOUCH_PROBE__!.breakControl(null));
      await t.ticks(S.settleTicks);
      const climbed = await climb(); // from the foot of the face now: Jump held 18 ticks or more catches from there too
      st.check("chapter 2's first face is caught and climbed: Jump held while the stick pushes in, then Jump again", climbed.caught && climbed.top > 4.3 && climbed.both >= S.catchTicks,
        `${climbed.caught ? `caught the edge at y ${climbed.grabY.toFixed(2)}` : 'NEVER CAUGHT'}; feet on top at y ${climbed.top.toFixed(2)} (the face is 4.5 m); the stick and Jump read together on ${climbed.both} ticks`);

      // ================= 5b. chapter 2's wall jump and double jump, by thumb (POLISH-1, B-107) =================
      // Each at the step of its chapter that first asks for it (read from critical_path, as check:teach reads it).
      // He is placed where the step is made from (the probe's place, which also makes it where a fall returns
      // him); the move itself is the thumb's, and what is judged is read from the probe's log of the played ticks.
      const wall = firstVia(ch2, 'wall'), dbl = firstVia(ch2, 'double');
      // the wall jump: the wall stands beyond the takeoff on the side away from the shelf, as the bot takes it.
      // Jump at it pushing in, let go of the stick and Jump as he touches it, press Jump again, steer away onto the
      // shelf. Letting go matters on a phone: a finger's press lands about three frames after it is sent, and a
      // warrior who is still pushing into this wall as he comes down catches the edge of its top (B-92) before a
      // second press can arrive. The kick needs no stick ("D-025 the moves as the rig makes them"); the catch does.
      // Each step waits whole frames of the page (a frame is 5 played ticks here: the loop's cap binds on SwiftShader).
      const kickIn = wall.a[2] > wall.b[2] ? 'right' : 'left', kickOut = kickIn === 'left' ? 'right' : 'left';
      const kick = (): Promise<Move> => thumbMove(t, h2, [wall.a[0], wall.a[1] + 0.05, wall.a[2]], wall.b, async () => {
        await pressTwice(t, [h2.stick(kickIn, S.share.mid), h2.press('jump')], () => [h2.stickOff(), h2.lift()], () => h2.press('jump'));
        await h2.stick(kickOut, S.share.mid);
      });
      await t.page.evaluate(() => window.__TOUCH_PROBE__!.breakControl('jump'));
      const noKick = await kick();
      st.check("seen to fail: with Jump broken the wall jump onto chapter 2's first shelf is not made", !noKick.landed && !noKick.made.includes('wall_jump'), noKick.note);
      await t.page.evaluate(() => window.__TOUCH_PROBE__!.breakControl(null));
      const kicked = await tries(kick);
      st.check(`chapter 2's first wall jump by thumb (step ${wall.i}): Jump at the wall pushing in, Jump again as he touches it, the stick steering away, onto the shelf`,
        kicked.landed && kicked.made.includes('wall_jump') && kicked.both >= 1, kicked.note);
      // the double jump: run at it, a held Jump at the takeoff, Jump again near the peak, paced as the wall jump's
      // presses are. Jump goes down short of the takeoff (TOUCH_STAGE.pressShort): both presses must come before the
      // face that stands 2 m short of the landing ("4u short of the face", the level's own note; at the face a
      // second press is a wall jump, B-90). Paced by each press being taken, the second came at the face on CI.
      const twice = (): Promise<Move> => thumbMove(t, h2, [dbl.a[0] - 2, dbl.a[1] + 0.05, dbl.a[2]], dbl.b, async (base) => {
        await h2.stick('up', S.share.mid);
        await t.until((s) => s.state !== 'play' || s.feet[0] >= dbl.a[0] - S.pressShort.double || s.tick > base.tick + S.moveTicks, S.waitMs + S.moveTicks * S.msPerTick);
        await pressTwice(t, [h2.press('jump')], () => [h2.lift()], () => h2.press('jump'));
      });
      await t.page.evaluate(() => window.__TOUCH_PROBE__!.breakControl('jump'));
      const noTwice = await twice();
      st.check("seen to fail: with Jump broken chapter 2's first double jump is not made", !noTwice.landed && !noTwice.made.includes('double_jump'), noTwice.note);
      await t.page.evaluate(() => window.__TOUCH_PROBE__!.breakControl(null));
      const twiced = await tries(twice);
      st.check(`chapter 2's first double jump by thumb (step ${dbl.i}): a held Jump at the takeoff, Jump again at the peak, up onto the next floor`,
        twiced.landed && twiced.made.includes('double_jump') && twiced.both >= 1, twiced.note);

      // ================= 6. a chapter chosen from the Chapters list by tap, and the menu =================
      await t.until((s) => s.state === 'play', 15000);
      await t.tapOn('#touch-pause');
      await t.until((s) => s.state === 'pause', 8000);
      await tapText('#touch-card', W_.chapters);
      const listOpen = await t.page.waitForFunction(() => !document.getElementById('chapters')?.hidden && document.querySelectorAll('#chapters-list button').length > 0, null, { timeout: 8000 }).then(() => true).catch(() => false);
      const rows = await buttonFaults(t, '#chapters button');
      const atList = await t.snap();
      const rowSel = `#chapters-list button[data-level="${ch4.id}"]`;
      await t.page.evaluate((sel) => { (document.querySelector(sel) as HTMLElement).style.pointerEvents = 'none'; }, rowSel).catch(() => null);
      const rowAt = await t.at(rowSel).catch(() => null);
      if (rowAt) await t.thumbs.tap(rowAt.x, rowAt.y);
      await t.page.waitForTimeout(600);
      st.check("seen to fail: with a chapter's row out of reach the same tap chooses nothing", (await t.snap()).level === ch2.id && (await t.snap()).state === 'pause', `with the list open: state ${atList.state}; after the tap: state ${(await t.snap()).state}, level ${(await t.snap()).level}`);
      await t.page.evaluate((sel) => { (document.querySelector(sel) as HTMLElement).style.pointerEvents = ''; }, rowSel).catch(() => null);
      if (rowAt) await t.thumbs.tap(rowAt.x, rowAt.y);
      const chosen = await t.until((s) => s.state === 'play' && s.level === ch4.id, 60000);
      const chosenTicks = await t.ticks(S.settleTicks);
      const chosenLog = (await t.log(0)).filter((f) => f.tick > chosenTicks.tick - S.settleTicks);
      st.check('a chapter is chosen from the Chapters list by tap, from the pause card; every row is a finger\'s size; the tap is not a jump',
        listOpen && rows.faults.length === 0 && !!chosen && chosenLog.every(neutral),
        `the list ${listOpen ? `opened: ${rows.n} buttons` : 'DID NOT OPEN'}${rows.faults.length ? `; ${rows.faults.join('; ')}` : ''}; ${chosen ? `playing ${chosen.level}` : `state ${(await t.snap()).state}, level ${(await t.snap()).level}`}`);
      // ================= 6b. chapter 4's first dash jump, by thumb (POLISH-1, B-107) =================
      // Run at the lip, tap Dash, and press Jump as the dash ends ("D-025 the moves as the rig makes them": the
      // jump down 4 to 22 ticks after the dash clears it). Jump is sent as soon as the tap on Dash is taken, with no
      // poll between: that is at least a frame (5 ticks here), and the check reads how many ticks it came to. A frame
      // more put it at 18 on darwin and 20 on CI, near the window's end.
      // A held jump alone carries 5 m and the gap is wider: broken Dash, no way over.
      const dj = firstVia(ch4, 'dashjump');
      const dashJump = (): Promise<Move> => thumbMove(t, h2, [dj.a[0] - 4, dj.a[1] + 0.05, dj.a[2]], dj.b, async (base) => {
        await h2.stick('up', S.share.mid);
        await t.until((s) => s.state !== 'play' || s.feet[0] >= dj.a[0] - S.pressShort.dash || s.tick > base.tick + S.moveTicks, S.waitMs + S.moveTicks * S.msPerTick);
        await h2.tapButton('dash');
        await h2.press('jump');
      });
      await t.page.evaluate(() => window.__TOUCH_PROBE__!.breakControl('dash'));
      const noDj = await dashJump();
      st.check("seen to fail: with Dash broken chapter 4's first dash jump does not cross", !noDj.landed && !noDj.made.includes('dash'), noDj.note);
      await t.page.evaluate(() => window.__TOUCH_PROBE__!.breakControl(null));
      const djd = await tries(dashJump);
      st.check(`chapter 4's first dash jump by thumb (step ${dj.i}): the stick held, Dash at the lip, Jump as the dash ends, over the gap`,
        djd.landed && djd.made.includes('dash') && djd.jumpAfterDash !== null && djd.both >= 1, djd.note);

      await t.tapOn('#touch-pause');
      await t.until((s) => s.state === 'pause', 8000);
      await tapText('#touch-card', W_.menu);
      const menu = await t.until((s) => s.state === 'menu', 8000);
      const titleBack = await t.page.evaluate(() => ({ title: (document.getElementById('title')?.getClientRects().length ?? 0) > 0, controls: (document.getElementById('touch')?.getClientRects().length ?? 0) > 0, card: (document.getElementById('touch-card')?.getClientRects().length ?? 0) > 0 }));
      st.check('a tap on Menu, on the pause card, is back at the title with no control left on it', !!menu && titleBack.title && !titleBack.controls && !titleBack.card, `state ${menu?.state ?? (await t.snap()).state}; title ${titleBack.title ? 'shown' : 'NOT shown'}; controls ${titleBack.controls ? 'STILL SHOWN' : 'hidden'}`);
      st.check('the phone page logged no error', t.errors.length === 0, t.errors.slice(0, 3).join(' | '));
      await t.close();

      // ================= 7. the second phone size: the layout =================
      const big = await page({ size: S.phones[1] });
      await titleReady(big);
      await big.tapOn('#title-play');
      const bigPlay = await big.until((s) => s.state === 'play', 60000);
      await big.ticks(6);
      const bigLay = bigPlay ? await layoutFaults(big) : ['the game never started'];
      st.check(`the controls at ${S.phones[1].join('x')}: on screen, a finger's size, clear of the warrior and the teach line`, bigLay.length === 0, bigLay.join('; ') || 'the stick, Jump, Sword, Dash and the pause button');
      await big.close();

      // ================= 8. portrait: play waits under a plain notice; the phone's pixel ratio is capped =================
      const tall = await page({ size: [S.phones[0][1], S.phones[0][0]], dsf: 3 });
      await titleReady(tall);
      const tallTitle = await tall.page.evaluate(() => ({ title: (document.getElementById('title')?.getClientRects().length ?? 0) > 0, turn: (document.getElementById('touch-turn')?.getClientRects().length ?? 0) > 0 }));
      const ratio = (await tall.snap()).pixelRatio;
      st.check('a phone draws at the touch cap, not at the desktop one', ratio === TOUCH.maxPixelRatio, `device pixel ratio 3: the canvas draws at ${ratio} (TOUCH.maxPixelRatio ${TOUCH.maxPixelRatio})`);
      await tall.tapOn('#title-play');
      const waiting = await tall.until((s) => s.state === 'pause', 60000);
      const notice = await tall.page.evaluate(() => ({ turn: (document.getElementById('touch-turn')?.getClientRects().length ?? 0) > 0, text: document.getElementById('touch-turn')?.textContent ?? '', card: (document.getElementById('touch-card')?.getClientRects().length ?? 0) > 0, controls: (document.getElementById('touch')?.getClientRects().length ?? 0) > 0 }));
      st.check('upright, the title is as it was, and a game that starts is paused under the turn-your-phone notice', tallTitle.title && !tallTitle.turn && !!waiting && notice.turn && notice.text === TOUCH.words.turn && !notice.card && !notice.controls,
        `title ${tallTitle.title ? 'shown' : 'NOT shown'} with ${tallTitle.turn ? 'THE NOTICE OVER IT' : 'no notice'}; after Play: state ${waiting?.state ?? (await tall.snap()).state}, notice ${notice.turn ? `"${notice.text}"` : 'NOT shown'}`);
      await tall.page.setViewportSize({ width: S.phones[0][0], height: S.phones[0][1] });
      const turned = await tall.until((s) => s.state === 'play', 15000);
      const turnedDom = await tall.page.evaluate(() => ({ turn: (document.getElementById('touch-turn')?.getClientRects().length ?? 0) > 0, controls: (document.getElementById('touch')?.getClientRects().length ?? 0) > 0 }));
      st.check('turned on its side, the notice goes and the game plays', !!turned && !turnedDom.turn && turnedDom.controls, `state ${turned?.state ?? (await tall.snap()).state}; notice ${turnedDom.turn ? 'STILL SHOWN' : 'gone'}; controls ${turnedDom.controls ? 'shown' : 'NOT shown'}`);
      await tall.page.setViewportSize({ width: S.phones[0][1], height: S.phones[0][0] });
      const again = await tall.until((s) => s.state === 'pause', 15000);
      st.check('and turned upright again in play, it is paused under the notice again', !!again, `state ${again?.state ?? (await tall.snap()).state}`);
      st.check('the upright page logged no error', tall.errors.length === 0, tall.errors.slice(0, 3).join(' | '));
      await tall.close();

      // ================= 9. a page with a mouse has none of it; a bare page has none unless a test asks =================
      const none = (p: Page): Promise<{ cls: string; n: number; ids: string[] }> => p.evaluate(() => ({
        cls: document.documentElement.className,
        n: document.querySelectorAll('[id^="touch"], .stick, .knob, .tb').length,
        ids: [...document.querySelectorAll('[id]')].map((e) => e.id).filter((id) => /touch/.test(id)),
      }));
      const desk = await page({ size: [640, 360], touch: false });
      await titleReady(desk);
      await desk.page.keyboard.press('Enter');
      const deskPlay = await desk.until((s) => s.state === 'play', 60000);
      await desk.page.keyboard.press('KeyP');
      await desk.until((s) => s.state === 'pause', 8000);
      const deskDom = await none(desk.page);
      const deskSnap = await desk.snap();
      const deskHud = await desk.page.evaluate(() => document.getElementById('hud')?.textContent ?? '');
      st.check('a page with a mouse and no touch has no touch control in its document, playing or paused', !!deskPlay && deskDom.n === 0 && !/\btouch\b/.test(deskDom.cls) && !deskSnap.touch && /P \/ Esc/.test(deskHud) && deskSnap.pixelRatio === 1,
        `<html class="${deskDom.cls}">, ${deskDom.n} touch elements${deskDom.ids.length ? ` (${deskDom.ids.join(', ')})` : ''}; paused HUD: "${deskHud.replace(/\n/g, ' / ')}"`);
      await desk.close();

      const bare = await page({ size: S.phones[0], query: `?level=${ch1.id}` });
      await bare.page.waitForFunction(() => /Enter: start/.test(document.getElementById('hud')?.textContent ?? ''), null, { timeout: 60000 }).catch(() => null);
      const bareDom = await none(bare.page);
      st.check('a bare page has none either, even on a touch device', bareDom.cls === 'bare' && bareDom.n === 0, `<html class="${bareDom.cls}">, ${bareDom.n} touch elements`);
      await bare.close();
      const asked = await page({ size: S.phones[0], query: `?level=${ch1.id}&touch=on` });
      await asked.page.waitForFunction(() => /Enter: start/.test(document.getElementById('hud')?.textContent ?? ''), null, { timeout: 60000 }).catch(() => null);
      const askedDom = await none(asked.page);
      st.check('unless the URL asks for them (?touch=on)', askedDom.n > 0 && /\bbare\b/.test(askedDom.cls), `<html class="${askedDom.cls}">, ${askedDom.n} touch elements`);
      await asked.close();

      // a laptop whose screen can be touched: nothing until the first touch, and no phone's cap on its canvas
      // the desktop harness's own window at a pixel ratio of 2: what is checked is the pointer and the ratio, not the
      // size, and at 1280x720 this one page took 38 s of CI's 387 (POLISH-1)
      const laptop = await page({ size: [640, 360], dsf: 2, init: [FINE_POINTER] });
      await titleReady(laptop);
      const lapBefore = await none(laptop.page);
      await laptop.thumbs.tap(6, 6);
      await laptop.page.waitForTimeout(300);
      const lapAfter = await none(laptop.page);
      const lapRatio = (await laptop.snap()).pixelRatio;
      st.check('where the main pointer is not a finger the controls come on the first touch, and the canvas keeps its pixel ratio', lapBefore.n === 0 && lapAfter.n > 0 && /\btouch\b/.test(lapAfter.cls) && lapRatio === 2,
        `before the touch: ${lapBefore.n} touch elements; after: ${lapAfter.n}, <html class="${lapAfter.cls}">; pixel ratio ${lapRatio} of 2`);
      await laptop.close();
    } finally {
      for (const p of open) await p.close();
    }
  });
}
