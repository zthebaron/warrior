// Shared harness plumbing: pinned Chromium args, failure classes, stage results, game pages.
// Stages are plain TS run by Node's built-in type stripping (no build step): erasable syntax only.

import type { Browser, Page } from '@playwright/test';

/** VERIFIED 2026-11-07. Headless Chromium has WebGL2 only on SwiftShader with these. Do not edit casually. */
export const CHROMIUM_ARGS = [
  '--enable-unsafe-swiftshader',
  '--use-gl=swiftshader',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
];

export const VIEWPORT = { width: 640, height: 360 };
export const FIXED_HZ = 60;

/**
 * Failure classes. ENVIRONMENT means the machine could not run the game at all (no server, no
 * browser, no WebGL, no harness API) — it says NOTHING about the level. Never report it as one.
 */
export const FAILURE = {
  ENVIRONMENT: 'HARNESS_ENVIRONMENT_FAILURE',
  SETUP: 'HARNESS_SETUP_FAILURE', // harness inputs missing (trace, goldens) — fix the harness, not the level
  BUILD: 'BUILD_FAILURE',
  LEVEL: 'LEVEL_FAILURE',
} as const;
export type FailureClass = (typeof FAILURE)[keyof typeof FAILURE];

export const EXIT_CODE: Record<FailureClass | 'PASS', number> = {
  PASS: 0,
  LEVEL_FAILURE: 1,
  BUILD_FAILURE: 2,
  HARNESS_ENVIRONMENT_FAILURE: 3,
  HARNESS_SETUP_FAILURE: 4,
};

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

export interface StageResult {
  stage: string;
  ok: boolean;
  /** Set when !ok. */
  failureClass?: FailureClass;
  checks: Check[];
  ms: number;
  data?: Record<string, unknown>;
}

export class Stage {
  readonly checks: Check[] = [];
  readonly data: Record<string, unknown> = {};
  failureClass: FailureClass = FAILURE.LEVEL;
  private readonly t0 = Date.now();
  readonly name: string;
  constructor(name: string) {
    this.name = name;
  }

  check(name: string, ok: boolean, detail = ''): boolean {
    this.checks.push({ name, ok, detail });
    return ok;
  }

  result(): StageResult {
    const ok = this.checks.length > 0 && this.checks.every((c) => c.ok);
    return { stage: this.name, ok, ...(ok ? {} : { failureClass: this.failureClass }), checks: this.checks, ms: Date.now() - this.t0, data: this.data };
  }
}

export type Vec3 = [number, number, number];

export interface InputFrame {
  x: number;
  y: number;
  jump: boolean;
  dash: boolean;
  sprint: boolean;
}

export const NEUTRAL: InputFrame = { x: 0, y: 0, jump: false, dash: false, sprint: false };

export interface Snapshot {
  tick: number;
  frame: number;
  state: string;
  feet: Vec3;
  vel: Vec3;
  pstate: string;
  grounded: boolean;
  platforms: { id: string; pos: Vec3 }[];
  hazards: { index: number; type: string; pos: Vec3 }[];
  crows: { index: number; airborne: boolean; pos: Vec3 }[];
  checkpoints: number[];
  deaths: number;
  lastDeath: Vec3 | null;
  runTime: number;
  inputTicks: number;
}

export interface Waypoint {
  pos: Vec3;
  via?: string;
  platform?: string;
  note?: string;
  /** hazard index whose crow cues this segment: hold at the previous waypoint (a torii) until lift-off */
  cue?: number;
}

export interface LevelJson {
  id: string;
  chapter: number;
  spawn: { pos: Vec3; facing: number };
  goal: { pos: Vec3; radius?: number };
  bounds: { min: Vec3; max: Vec3 };
  critical_path: (Vec3 | Waypoint)[];
  checkpoints: { pos: Vec3; facing?: number }[];
  platforms?: { id?: string; asset: string; path: Vec3[]; duration: number; loop?: 'pingpong' | 'cycle' | 'once' }[];
  hazards?: { type: string; path?: Vec3[]; speed?: number; phase?: number }[];
}

export interface Ctx {
  browser: Browser;
  baseUrl: string;
  levelId: string;
  level: LevelJson;
  /** segmentsOf(level) from tools/lint-level.mjs — the one segment definition. */
  segments: number;
  /** RESPAWN_RULES from tools/lint-level.mjs, asserted equal to the running game's (B-8). */
  lintRules: { checkpointRadius: number; heightTolerance: number; goalRadiusDefault: number; bodyRadius: number; bodyHeight: number };
  root: string;
  args: Record<string, string | boolean>;
  log: (msg: string) => void;
}

export const wp = (w: Vec3 | Waypoint): Waypoint => (Array.isArray(w) ? { pos: w } : w);

export interface GamePage {
  page: Page;
  errors: string[];
  close(): Promise<void>;
}

/**
 * Fresh page, harness mode, level loaded and in `play`. Every console error and page error is
 * captured from the first byte. Throws EnvironmentError if the harness API never appears.
 */
/** opts.query replaces the whole query string (REACHABLE loads ?harness=1 with no level, as a player's default would). */
export async function openGame(ctx: Ctx, opts: { query?: string } = {}): Promise<GamePage> {
  const page = await ctx.browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
  try {
    // --landingmark=off|on: run the stage with the landing mark forced (it ships on, D-010)
    const lm = ctx.args['landingmark'];
    const flags = (lm === 'off' || lm === 'on' ? `&landingmark=${lm}` : '') + (ctx.args['instrument'] === 'on' ? '&instrument=on' : '');
    await page.goto(`${ctx.baseUrl}/${opts.query ?? `?harness=1&level=${encodeURIComponent(ctx.levelId)}${flags}`}`);
  } catch (err) {
    // The page never loaded: nothing about the level was observed. Environment, with evidence.
    const why = (err instanceof Error ? err.message : String(err)).split('\n')[0];
    await page.close().catch(() => {});
    const diag = await diagnose(ctx);
    throw new EnvironmentError(`game page did not load: ${why} | ${diag}${errors.length ? ` | page errors: ${errors.slice(0, 3).join(' | ')}` : ''}`);
  }
  try {
    await page.waitForFunction(() => window.__HARNESS__?.version === 'HARNESS_API_V1', null, { timeout: 20000 });
  } catch {
    const hud = await page.locator('#hud').textContent().catch(() => '');
    await page.close();
    throw new EnvironmentError(`harness API never appeared (bundle not built with --mode harness, or boot crashed). HUD: ${hud ?? ''} errors: ${errors.join(' | ')}`);
  }
  const started = await page.evaluate(() => window.__HARNESS__!.start());
  if (!started.ok) {
    await page.close();
    throw new LevelLoadError(`level "${ctx.levelId}" failed to load: ${started.error ?? 'unknown'}`);
  }
  return { page, errors, close: () => page.close() };
}

/**
 * Why could a page not load? Distinguishes a dead/hung preview server from a wedged browser or
 * GPU process, and spots leaked pages. Each probe is time-boxed so diagnosis cannot itself hang.
 */
export async function diagnose(ctx: Ctx): Promise<string> {
  const parts: string[] = [];
  const t0 = Date.now();
  try {
    const r = await fetch(`${ctx.baseUrl}/`, { signal: AbortSignal.timeout(5000) });
    parts.push(`server: HTTP ${r.status} in ${Date.now() - t0}ms`);
  } catch (e) {
    parts.push(`server: UNREACHABLE (${e instanceof Error ? e.message : String(e)})`);
  }
  parts.push(`open pages: ${ctx.browser.contexts().reduce((n, c) => n + c.pages().length, 0)}`);
  const t1 = Date.now();
  try {
    const probe = (async () => {
      const p = await ctx.browser.newPage();
      try {
        return await p.evaluate(() => !!document.createElement('canvas').getContext('webgl2'));
      } finally {
        await p.close();
      }
    })();
    const gl = await Promise.race([probe, new Promise<string>((r) => setTimeout(() => r('TIMEOUT 10s'), 10000))]);
    parts.push(`fresh about:blank webgl2: ${String(gl)} in ${Date.now() - t1}ms`);
  } catch (e) {
    parts.push(`fresh about:blank: FAILED (${(e instanceof Error ? e.message : String(e)).split('\n')[0]})`);
  }
  return parts.join(' · ');
}

export class EnvironmentError extends Error {}
export class LevelLoadError extends Error {}

/** Runs a stage body; converts thrown errors into a classified failed check. */
export async function guard(stage: Stage, body: () => Promise<void>): Promise<StageResult> {
  try {
    await body();
  } catch (err) {
    if (err instanceof EnvironmentError) stage.failureClass = FAILURE.ENVIRONMENT;
    stage.check('stage completed', false, err instanceof Error ? err.message : String(err));
  }
  return stage.result();
}

export const fmt = (v: Vec3): string => `(${v.map((n) => n.toFixed(2)).join(', ')})`;
export const hdist = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[2] - b[2]);

declare global {
  interface Window {
    __HARNESS__?: {
      version: string;
      start(): Promise<{ ok: boolean; error: string | null }>;
      advance(n: number, renderEvery?: number): Snapshot;
      step(frame: InputFrame | null, render: boolean): Snapshot;
      setInput(frame: InputFrame | null): void;
      playback(frames: InputFrame[]): void;
      isPlayingBack(): boolean;
      record(): InputFrame[];
      snapshot(): Snapshot;
      tuning: Record<string, number>;
      rules: { checkpointRadius: number; goalHeightTolerance: number; goalRadiusDefault: number; respawnDelaySec: number; fixedDt: number };
      rendererInfo(): { calls: number; triangles: number; geometries: number; textures: number };
      level(): { id: string } | null;
      setCamera(pos: Vec3, target: Vec3): void;
      rigCamera(pivot: Vec3, dir: Vec3): Vec3;
      instrument(): { level: string; total_s: number | null; finished: boolean; segments: { segment: number; from: string; to: string; crow: number | null; segment_time_s: number | null; deaths: number; first_clear_attempt: number | null; retry_times_s: number[]; attempts: { player_depart_t: number | null; crow_lift_t: number | null; since_last_lift_s: number | null; cleared: boolean }[]; lift_timing: { attempts_n: number; loop_s: number | null; since_last_lift_s: number[]; spread_s: number | null; spread_of_loop: number | null } | null }[] } | null;
      releaseCamera(): void;
      cameraPose(): { pos: Vec3; forward: Vec3; fovDeg: number; viewPitchDeg: number; assistOffsetDeg: number; assistEnabled: boolean; probe: { standoff: number; rise: number; depth: number; targetDeg: number | null } | null };
      castRay(origin: Vec3, dir: Vec3, max: number): { distance: number; point: Vec3; normal: Vec3 } | null;
      respawnAt(pos: Vec3, facing: number, tick: number): Snapshot;
      setPlacementVisible(name: string, pos: Vec3, visible: boolean): number;
      renderTorii(bg: string, cam: Vec3, target: Vec3): Promise<{ ok: boolean; error: string | null }>;
      startJson(text: string): Promise<{ ok: boolean; error: string | null }>;
      assetProbe(name: string): Promise<{
        ok: boolean;
        error: string | null;
        calls: number;
        triangles: number;
        maps: { width: number; height: number; compressed: boolean; format: number; mipmaps: number; colorSpace: string }[];
        materials: string[];
        top: string[];
        ktx2: Record<string, boolean> | null;
        pixels: { covered: number; nearPalette: number; maxError: number };
      }>;
      teleportPlayer(pos: Vec3): void;
      translators(): { id: string; name: string; tag: string | null; pos: Vec3 }[];
    };
  }
}
