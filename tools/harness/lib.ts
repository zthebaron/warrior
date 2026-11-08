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
  attack: boolean;
}

export const NEUTRAL: InputFrame = { x: 0, y: 0, jump: false, dash: false, sprint: false, attack: false };

export interface Snapshot {
  tick: number;
  frame: number;
  state: string;
  feet: Vec3;
  vel: Vec3;
  pstate: string;
  grounded: boolean;
  platforms: { id: string; pos: Vec3 }[];
  checkpoints: number[];
  deaths: number;
  lastDeath: Vec3 | null;
  runTime: number;
}

export interface Waypoint {
  pos: Vec3;
  via?: string;
  platform?: string;
  note?: string;
}

export interface LevelJson {
  id: string;
  spawn: { pos: Vec3; facing: number };
  goal: { pos: Vec3; radius?: number };
  bounds: { min: Vec3; max: Vec3 };
  critical_path: (Vec3 | Waypoint)[];
  checkpoints: { pos: Vec3 }[];
  platforms?: { id?: string; asset: string; path: Vec3[] }[];
  par_time: number;
}

export interface Ctx {
  browser: Browser;
  baseUrl: string;
  levelId: string;
  level: LevelJson;
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
export async function openGame(ctx: Ctx): Promise<GamePage> {
  const page = await ctx.browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
  await page.goto(`${ctx.baseUrl}/?harness=1&level=${encodeURIComponent(ctx.levelId)}`);
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
      rendererInfo(): { calls: number; triangles: number; geometries: number; textures: number };
      setCamera(pos: Vec3, target: Vec3): void;
      releaseCamera(): void;
    };
  }
}
