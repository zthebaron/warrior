// Boot: wire engine + gameplay + content, load the gym, start the loop.
// This file is the only place the layers meet (engine never imports entities/levels).

import * as THREE from 'three';
import { StateMachine, type GameState } from './engine/state';
import { GameLoop, LOOP_CONFIG } from './engine/loop';
import { InputSystem, type InputFrame } from './engine/input';
import { Physics } from './engine/physics';
import { Renderer, RENDER_CONFIG } from './engine/renderer';
import { SpringArmCamera, CAMERA_TUNING, allowedArm, type AssistProbe } from './engine/camera';
import { DebugOverlay, Profiler } from './engine/debug';
import { DevTools, type AirSegment } from './engine/tools';
import { Player, TUNING } from './entities/player';
import { LandingMark } from './entities/landing-mark';
import { Instrument, type InstrumentReport } from './systems/instrument';
import { nextLevel } from './systems/progression';
import { buildLevel, bundledLevelSources, fetchLevelFresh, levelIndex, loadLevel, parseLevel, prepareLevel, MANIFEST, type LevelData, type LevelInstance, type PreparedLevel, type Vec3 } from './loaders/level';
import { ACCENT_CANDIDATES, ACCENT_HEX, configureAssetLoaders, getAccent, getKtx2Support, getLoadedAsset, preloadAssets, setAccent, switchAccent, type Ktx2Support } from './loaders/assets';
import paletteJson from '../reference/palette.json';

export const GAME_RULES = {
  startLevel: '01-lower-stair', // D-014: a player meets chapter 1; the gym is a test fixture (?level=00-gym)
  respawnDelaySec: 0.8,     // time spent in `death` before respawning
  checkpointRadius: 2.0,    // m (horizontal) to activate a checkpoint
  goalHeightTolerance: 2.0, // m vertical slack when testing the goal radius
  goalRadiusDefault: 1.0,   // m, when the level's goal sets no radius (was an inline `?? 1`)
  teleportLift: 0.05,       // m above the picked surface
  fogDefaults: { near: 40, far: 250 },
  decimals: 2,
  keys: { start: 'Enter', pause: ['KeyP', 'Escape'], menu: 'KeyM' },
};

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const ZERO = new THREE.Vector3();

interface DevHook {
  state: StateMachine;
  loop: GameLoop;
  input: InputSystem;
  tuning: typeof TUNING;
  /** Rule constants, live (e.g. __DEV__.rules.respawnDelaySec = 0.5 between deaths). */
  rules: typeof GAME_RULES;
  /** Get, or switch live, the accent candidate: __DEV__.accent('vermilion_b'). */
  accent: (name?: string) => string;
  probe: () => AirSegment[];
  player: () => { feet: Vec3; vel: Vec3; state: string; grounded: boolean } | null;
  teleport: (x: number, y: number, z: number, facingDeg?: number) => void;
  stepTicks: (n: number) => void;
  record: () => InputFrame[];
  playback: (frames: InputFrame[]) => void;
  /** Physics-side positions, to check they agree with the player's tracked centre. */
  bodies: () => { center: Vec3; body: Vec3; collider: Vec3 } | null;
  platforms: () => { id: string; pos: Vec3 }[];
}

/** Playtest API (tools/harness). Exists only in `--mode harness` builds AND with ?harness=1. */
export interface HarnessSnapshot {
  tick: number;
  frame: number;
  state: GameState;
  feet: Vec3;
  vel: Vec3;
  pstate: string;
  grounded: boolean;
  platforms: { id: string; pos: Vec3 }[];
  hazards: { index: number; type: string; pos: Vec3 }[];
  /** Crow cues by hazard index: the bot holds at a torii for a perched -> airborne edge (Q2, Q5). */
  crows: { index: number; airborne: boolean; pos: Vec3 }[];
  /** fixed ticks that consumed an input frame (every executed tick except `death` ticks) */
  inputTicks: number;
  checkpoints: number[];
  deaths: number;
  lastDeath: Vec3 | null;
  runTime: number;
}

interface HarnessApi {
  version: string;
  seed: number;
  start(): Promise<{ ok: boolean; error: string | null }>;
  /** n deterministic frames: one fixed tick each (only while simulating) + one render pass. */
  advance(n: number, renderEvery?: number): HarnessSnapshot;
  /** setInput(frame) then advance(1) — one round trip per tick for the bot. */
  step(frame: InputFrame | null, render: boolean): HarnessSnapshot;
  setInput(frame: InputFrame | null): void;
  playback(frames: InputFrame[]): void;
  isPlayingBack(): boolean;
  record(): InputFrame[];
  snapshot(): HarnessSnapshot;
  level(): LevelData | null;
  /** B-17: the instrument's report so far (null unless ?instrument=on). */
  instrument(): InstrumentReport | null;
  tuning: typeof TUNING;
  /** Rule constants the harness must agree with (checkpoint activation radius, height slack). */
  rules: { checkpointRadius: number; goalHeightTolerance: number; goalRadiusDefault: number; respawnDelaySec: number; fixedDt: number };
  rendererInfo(): { calls: number; triangles: number; geometries: number; textures: number };
  setCamera(pos: Vec3, target: Vec3): void;
  /** Where the follow rig would put the camera for this pivot and arm direction: the arm pulled in by the
   *  same raycast + clamp as SpringArmCamera (D-012: only frames normal camera control can reach). */
  rigCamera(pivot: Vec3, dir: Vec3): Vec3;
  releaseCamera(): void;
  /** B-18: the follow rig's real pose (after the assist and arm collision), and what the assist's probe saw. */
  cameraPose(): { pos: Vec3; forward: Vec3; fovDeg: number; viewPitchDeg: number; assistOffsetDeg: number; assistEnabled: boolean; probe: AssistProbe | null };
  /** B-18: one physics ray against the level (the player excluded), as the camera's own probe casts them. */
  castRay(origin: Vec3, dir: Vec3, max: number): { distance: number; point: Vec3; normal: Vec3 } | null;
  /** B-23: put the follow camera behind a facing (degrees, as respawnAt takes it), as a player who turns to
   *  face something mouses it there. respawnAt moves the player only; the yaw stays wherever it was. */
  cameraYaw(facingDeg: number): void;
  /**
   * PHASE_SWEEP (B-7): respawn at `pos` with the world clock set to `tick`. This is what a real
   * respawn does (teleport, reset the player, world keeps its clock), except that the arrival phase
   * is chosen instead of being wherever the death left it. Clears the checkpoint log, so the caller
   * can see which torii the run then activates.
   */
  respawnAt(pos: Vec3, facing: number, tick: number): HarnessSnapshot;
  assetProbe(name: string): Promise<AssetProbe>;
  /**
   * D-006: render kit_torii ALONE at the origin (its own scene: no level, lights, player, fog) against a
   * solid `bg` colour, from `cam` looking at `target`, with the game camera's fov and aspect. The caller
   * screenshots the canvas. Used for the accent-vs-ramp swatches and the area-vs-distance curve.
   */
  renderTorii(bg: string, cam: Vec3, target: Vec3): Promise<{ ok: boolean; error: string | null }>;
  /** Show/hide the level's placements of mesh asset `name` at `pos` (harness: isolate one torii's pixels). */
  setPlacementVisible(name: string, pos: Vec3, visible: boolean): number;
  /** Start a test level from JSON text (tools/harness/fixtures/): same validation AND decode as levels/. */
  startJson(text: string): Promise<{ ok: boolean; error: string | null }>;
  /** B-24: the level files' text as bundled, keyed by file name; preflight compares it with levels/ on disk. */
  levelSources(): Promise<Record<string, string>>;
  /** Harness-only: move the player (PR 4's hazards stage). */
  teleportPlayer(pos: Vec3): void;
  /**
   * Every visible renderable in the scene with its world position and the nearest `userData.translates`
   * tag on it or an ancestor (player, platform, hazard), or null. B-15 / NOT #18 (Q2a): nothing
   * translates except the player and hazards, so an untagged object that moves is ambient motion.
   */
  translators(): { id: string; name: string; tag: string | null; pos: Vec3 }[];
}

/** One mesh asset rendered ALONE (own scene: no level, player, lights, HUD or debug lines). */
export interface AssetProbe {
  ok: boolean;
  error: string | null;
  calls: number;
  triangles: number;
  maps: { width: number; height: number; compressed: boolean; format: number; mipmaps: number; colorSpace: string }[];
  materials: string[];
  /** Most frequent rendered colours on the asset, '#rrggbb:count'. */
  top: string[];
  ktx2: Ktx2Support | null;
  /** Pixels sampled on the asset (non-background) and how many sit within 6/255 of a source texel. */
  pixels: { covered: number; nearPalette: number; maxError: number };
}

declare global {
  interface Window {
    __DEV__?: DevHook;
    __HARNESS__?: HarnessApi;
  }
}

/** mulberry32 — the harness replaces Math.random with this so any noise is reproducible. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HARNESS_SEED = 0x5eed1234;
const HARNESS_MODE = __HARNESS__ && new URLSearchParams(location.search).get('harness') === '1';
// B-17: ?instrument=on records per-segment play numbers (dev only, never drawn: NOT-list #20).
const INSTRUMENT = new URLSearchParams(location.search).get('instrument') === 'on';
// Feel-test flags follow the accent's ?accent=<name> precedent (D-007). Defaults are unchanged; each is
// also live in the ~ panel's "feel test" group (FEELTEST-SWITCHES).
{
  // D-010: the mark ships ON. ?landingmark=off keeps the A/B available in place (and =on still works).
  const lm = new URLSearchParams(location.search).get('landingmark');
  if (lm === 'off') TUNING.landingMark = 0;
  else if (lm === 'on') TUNING.landingMark = 1;
}
{
  // ?respawn=<seconds>: D-004 wants a 0.5 s target against the 1.2 s CI ceiling; the default stays 0.8.
  const r = Number(new URLSearchParams(location.search).get('respawn') ?? NaN);
  if (Number.isFinite(r) && r >= 0) GAME_RULES.respawnDelaySec = r;
}
if (HARNESS_MODE) Math.random = seededRandom(HARNESS_SEED);

function el(id: string): HTMLElement {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} missing from index.html`);
  return e;
}

async function boot(): Promise<void> {
  const hud = el('hud');
  const errorBanner = document.createElement('pre');
  errorBanner.style.cssText =
    'position:fixed;left:8px;right:8px;bottom:8px;z-index:20;margin:0;display:none;background:#400;color:#fcc;' +
    'font:12px/1.4 ui-monospace,monospace;padding:8px;white-space:pre-wrap;';
  document.body.appendChild(errorBanner);

  const state = new StateMachine();
  const renderer = new Renderer(el('app'));
  configureAssetLoaders(renderer.renderer);
  // D-001 feel-test switch: ?accent=<candidate> (assets/src/accent.json). Default = accent.json `default`.
  const accentParam = new URLSearchParams(location.search).get('accent');
  if (accentParam) setAccent(accentParam);
  const physics = await Physics.create();
  const input = new InputSystem(window);
  const profiler = new Profiler();
  profiler.absent.add('audio');
  const overlay = new DebugOverlay(renderer.renderer, renderer.scene, physics, profiler);

  let level: LevelInstance | null = null;
  let player: Player | null = null;
  let respawn: { pos: Vec3; facing: number } = { pos: [0, 0, 0], facing: 0 };
  // The world clock (D-004, B-13): fixed ticks executed while the world runs. Everything that moves
  // is a pure function of it (B-12). Reset only by install(), i.e. a level (re)load, never by death.
  let worldTick = 0;
  let deathTicksLeft = 0;
  // Ticks that consumed an input frame. Since D-004 the world also ticks in `death` without reading
  // input, so world ticks != input frames; the harness (chaos) needs this count to stay aligned.
  let inputTicks = 0;
  const worldTime = (): number => worldTick * loop.dt;
  const tmpFeet = new THREE.Vector3();
  // D-014: ?level=<id> is honoured in normal play too (a dev affordance: no default, golden or CI changes).
  // Only a level-file-shaped id is accepted, so the param can never point the fetch anywhere but levels/.
  const levelParam = new URLSearchParams(location.search).get('level');
  const levelId = (levelParam && /^[0-9a-z-]+$/.test(levelParam) ? levelParam : null) || GAME_RULES.startLevel;
  // D-014 fix 3: the level the menu starts, and the one finishing it leads to (null after the last
  // chapter). Derived from the levels' own `chapter` field (src/systems/progression.ts).
  let currentId = levelId;
  let nextId: string | null = null;
  // Rule log for the playtest harness (cheap; kept in all builds).
  let checkpointLog: number[] = [];
  let deaths = 0;
  let instrument: Instrument | null = null;
  let instrumentEmitted = false;
  let lastDeath: Vec3 | null = null;
  // Harness-only render controls (inert unless the harness API sets them).
  let cameraOverride: { pos: Vec3; target: Vec3 } | null = null;
  let skipRender = false;

  const landingMark = new LandingMark(physics);
  landingMark.mesh.userData['translates'] = 'player'; // follows the player's ground point (D-010)
  renderer.scene.add(landingMark.mesh);
  const camRig = new SpringArmCamera(renderer.camera, (o, d, max) => physics.castRay(o, d, max, player?.collider)?.distance ?? null);
  // D-015d pitch assist ships ON (B-18); ?pitchassist=off is the comparison, as ?landingmark=off is.
  camRig.assistEnabled = new URLSearchParams(location.search).get('pitchassist') !== 'off';

  const showError = (err: unknown): void => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(msg);
    errorBanner.textContent = msg;
    errorBanner.style.display = 'block';
  };
  const clearError = (): void => {
    errorBanner.style.display = 'none';
  };

  // ---------- level lifecycle ----------
  const install = (data: PreparedLevel): void => {
    level?.dispose();
    level = buildLevel(data, physics);
    document.body.dataset['level'] = data.id; // D-014: which level a PLAYER reached (read by REACHABLE; never rendered)
    renderer.scene.add(level.root, level.debugRoot);
    renderer.scene.fog = data.fog
      ? new THREE.Fog(data.fog.color ?? RENDER_CONFIG.clearColor, data.fog.near ?? GAME_RULES.fogDefaults.near, data.fog.far ?? GAME_RULES.fogDefaults.far)
      : null;
    const [x, y, z] = data.spawn.pos;
    const facing = data.spawn.facing * DEG2RAD;
    if (!player) {
      player = new Player(physics, { x, y, z }, facing);
      player.mesh.userData['translates'] = 'player';
      renderer.scene.add(player.mesh);
    }
    const lvl = level;
    player.groundMotion = (c) => lvl.platformDelta(c);
    player.teleport({ x, y, z }, facing);
    respawn = { pos: data.spawn.pos, facing: data.spawn.facing };
    camRig.setYaw(facing);
    camRig.snap(player.feet(tmpFeet), player.facing);
    input.resetRecording();
    tools.probe.reset();
    worldTick = 0;
    deathTicksLeft = 0;
    checkpointLog = [];
    deaths = 0;
    instrument = INSTRUMENT ? new Instrument(data, GAME_RULES.checkpointRadius) : null;
    instrumentEmitted = false;
    lastDeath = null;
    clearError();
  };

  const startLevel = async (id: string = currentId): Promise<void> => {
    state.transition('loading');
    try {
      const data = await prepareLevel(await loadLevel(id)); // decode mesh assets, then the sync build
      nextId = nextLevel(await levelIndex(), { id: data.id, chapter: data.chapter })?.id ?? null;
      currentId = id;
      install(data);
      state.transition('play');
    } catch (err) {
      showError(err);
      state.transition('menu');
    }
  };

  /** Validate FIRST; an invalid edit never replaces the running level. */
  const hotReload = (data: PreparedLevel): void => {
    if (!state.can('loading')) return;
    const wasPaused = state.is('pause');
    state.transition('loading');
    install(data);
    state.transition('play');
    if (wasPaused) state.transition('pause');
    console.info(`[level] hot-reloaded ${data.id}`);
  };

  const reloadFromDisk = async (): Promise<void> => {
    const id = level?.data.id ?? levelId;
    try {
      hotReload(await prepareLevel(import.meta.env.DEV ? await fetchLevelFresh(id) : await loadLevel(id)));
    } catch (err) {
      showError(err);
    }
  };

  if (import.meta.hot) {
    import.meta.hot.on('level:changed', (msg: { id: string; text: string }) => {
      if (msg.id !== level?.data.id) return;
      try {
        prepareLevel(parseLevel(msg.text, `levels/${msg.id}.json`)).then(hotReload, showError);
      } catch (err) {
        showError(err);
      }
    });
  }

  // ---------- rules (checkpoints, goal, death) — run inside the fixed tick ----------
  // Q6 part 1: one way to die. Falling below the fall plane and touching a hazard volume both enter
  // `death`; nothing else happens on contact (no damage, no knockback).
  const die = (f: THREE.Vector3): void => {
    deathTicksLeft = Math.round(GAME_RULES.respawnDelaySec * LOOP_CONFIG.fixedHz);
    deaths++;
    lastDeath = [f.x, f.y, f.z];
    state.transition('death');
  };
  const rulesTick = (): void => {
    if (!level || !player) return;
    // Frame-stepping while paused runs ticks too; rule transitions only fire from `play`
    // (a stepped fall is picked up on the first real tick after resuming).
    if (!state.is('play')) return;
    const f = player.feet(tmpFeet);
    if (level.killPlaneY !== null && f.y < level.killPlaneY) return die(f);
    if (level.hazardHit(f, TUNING.capsuleRadius, 2 * (TUNING.capsuleHalfHeight + TUNING.capsuleRadius)) >= 0) return die(f);
    level.data.checkpoints.forEach((c, i) => {
      if (Math.hypot(f.x - c.pos[0], f.z - c.pos[2]) < GAME_RULES.checkpointRadius && Math.abs(f.y - c.pos[1]) < GAME_RULES.goalHeightTolerance) {
        // Q6 part 3 (B-9): respawn at the FURTHEST torii reached, never an earlier one. The furthest
        // index is derived from the append-only checkpointLog, so walking back through an earlier
        // torii logs nothing new and moves nothing. No new state.
        const furthest = checkpointLog.length ? Math.max(...checkpointLog) : -1;
        if (i >= furthest) respawn = { pos: c.pos, facing: c.facing ?? respawn.facing };
        if (!checkpointLog.includes(i)) checkpointLog.push(i);
      }
    });
    const g = level.data.goal;
    if (Math.hypot(f.x - g.pos[0], f.z - g.pos[2]) < (g.radius ?? GAME_RULES.goalRadiusDefault) && Math.abs(f.y - g.pos[1]) < GAME_RULES.goalHeightTolerance) {
      state.transition('results');
    }
  };

  // ---------- loop ----------
  const onFixedUpdate = (dt: number): void => {
    if (!level || !player) return;
    worldTick++; // every executed tick advances the world: play, death, or an explicit frame step
    if (state.is('death')) {
      // D-004: the world runs while you are dead. Pose it and step physics (kinematic bodies follow);
      // the player and input do not advance, and nothing is recorded, so traces stay aligned.
      level.fixedUpdate(worldTime(), dt);
      physics.step(dt);
      if (--deathTicksLeft <= 0) {
        const [x, y, z] = respawn.pos;
        player.teleport({ x, y, z }, respawn.facing * DEG2RAD);
        camRig.snap(player.feet(tmpFeet), player.facing);
        state.transition('play');
      }
      instrumentTick();
      return;
    }
    profiler.begin('gameplay');
    const frame = input.sample(camRig.yaw, !tools.freeCamActive);
    inputTicks++;
    level.fixedUpdate(worldTime(), dt);
    player.fixedUpdate(dt, frame);
    profiler.end('gameplay');
    profiler.begin('physics');
    physics.step(dt);
    profiler.end('physics');
    tools.probe.sample(player.feet(tmpFeet), player.grounded);
    rulesTick();
    instrumentTick();
  };

  // B-17: one sample per fixed tick from state the rules already keep. Output only at run end, only
  // to the console and a download: nothing is rendered in game (NOT-list #20).
  function instrumentTick(): void {
    if (!instrument || !level || !player) return;
    const f = player.feet(tmpFeet);
    instrument.tick({ t: worldTime(), state: state.get(), feet: [f.x, f.y, f.z], checkpoints: checkpointLog, deaths, crows: level.crows() });
    if (!instrumentEmitted && state.is('results')) {
      instrumentEmitted = true;
      const rep = instrument.report();
      console.info(`[instrument] ${rep.level}: ${rep.total_s}s (world clock)`);
      console.table(instrument.table());
      if (!HARNESS_MODE) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(rep, null, 2)], { type: 'application/json' }));
        a.download = `instrument-${rep.level}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
      }
    }
  }

  const onRender = (alpha: number, frameDt: number): void => {
    profiler.begin('animation');
    level?.render(alpha);
    player?.render(alpha);
    if (player && level) landingMark.update(player, level.data.bounds.min[1]);
    profiler.end('animation');

    if (cameraOverride) {
      renderer.camera.position.set(...cameraOverride.pos);
      renderer.camera.lookAt(...cameraOverride.target);
    } else if (player && !tools.freeCamActive) {
      tmpFeet.copy(player.mesh.position);
      tmpFeet.y -= player.feetOffset();
      camRig.update(frameDt, tmpFeet, state.simulating() ? player.vel : ZERO, player.facing);
    }
    tools.update(frameDt);
    if (level) level.debugRoot.visible = overlay.visible;

    profiler.begin('render');
    if (!skipRender) renderer.render();
    profiler.end('render');
    overlay.update(frameDt);
    profiler.endFrame();
  };

  const loop = new GameLoop({ onFixedUpdate, onRender, shouldSimulate: () => state.worldRunning() });

  const raycaster = new THREE.Raycaster();
  // The H2.5 feel test's three switches, live in the ~ panel (numbers only, so accent is an index into
  // the ACCENT_CONTRAST-validated candidates: 0 vermilion_a, 1 vermilion_b, 2 vermilion_c).
  // respawnDelaySec is read at each death, so a change applies from the next one.
  const FEEL_TEST = {
    get respawnDelaySec(): number { return GAME_RULES.respawnDelaySec; },
    set respawnDelaySec(v: number) {
      if (v < 0) return;
      if (v > 1.2) console.warn(`[feel test] respawnDelaySec ${v} is above the 1.2 s CI ceiling (Q6)`);
      GAME_RULES.respawnDelaySec = v;
    },
    get landingMark(): number { return TUNING.landingMark; },
    set landingMark(v: number) { TUNING.landingMark = v ? 1 : 0; },
    get accent(): number { return Math.max(0, ACCENT_CANDIDATES.indexOf(getAccent())); },
    set accent(v: number) {
      const name = ACCENT_CANDIDATES[Math.round(v)];
      if (name) switchAccent(name);
    },
  };

  const tools = new DevTools({
    overlay,
    state,
    loop,
    camera: renderer.camera,
    canvas: renderer.canvas,
    pick: (ndc) => {
      if (!level) return null;
      raycaster.setFromCamera(ndc, renderer.camera);
      return raycaster.intersectObjects(level.pickables, false)[0]?.point ?? null;
    },
    teleport: (p) => player?.teleport({ x: p.x, y: p.y + GAME_RULES.teleportLift, z: p.z }),
    reloadLevel: () => void reloadFromDisk(),
    tunables: [
      { name: 'player', values: TUNING },
      { name: 'camera', values: CAMERA_TUNING },
      { name: 'feel test', values: FEEL_TEST },
    ],
  });

  overlay.addProvider(() => {
    if (!player) return '-- player: none';
    const d = GAME_RULES.decimals;
    const p = player.feet(new THREE.Vector3());
    const v = player.vel;
    return [
      `-- player ${player.state}${player.grounded ? ' (grounded)' : ''}`,
      `pos  ${p.x.toFixed(d)} ${p.y.toFixed(d)} ${p.z.toFixed(d)}`,
      `vel  ${v.x.toFixed(d)} ${v.y.toFixed(d)} ${v.z.toFixed(d)}  |h| ${Math.hypot(v.x, v.z).toFixed(d)}`,
      `world ${worldTime().toFixed(d)}s (tick ${worldTick})   recorded ${input.record().length} frames${input.isPlayingBack() ? '  [PLAYBACK]' : ''}`,
    ].join('\n');
  });

  // ---------- HUD + UI keys ----------
  const hudText = (s: GameState): string => {
    switch (s) {
      case 'boot': return 'booting…';
      case 'menu': return 'WARRIOR\n\nEnter: start\nclick: mouse look   ~: debug + dev tools';
      case 'loading': return 'loading…';
      case 'play': return '';
      case 'pause': return 'PAUSED\nP / Esc: resume   M: menu';
      case 'death': return 'fell';
      // Q4: win is *arrive*. The results state reads `complete` and nothing else — no time, score,
      // par or rank. Run time stays on the ~ debug overlay, which is dev tooling, not the game.
      case 'results': return nextId ? 'COMPLETE\nEnter: next chapter' : 'COMPLETE\nEnter: menu';
    }
  };
  state.onChange((to) => {
    hud.textContent = hudText(to);
  });

  window.addEventListener('keydown', (e) => {
    const k = GAME_RULES.keys;
    if (e.code === k.start && state.is('menu')) void startLevel();
    else if (e.code === k.start && state.is('results')) {
      // D-014 fix 3: finishing a chapter loads the next; after the last one, back to the menu, which
      // then starts the game from the front door again.
      if (nextId) void startLevel(nextId);
      else {
        currentId = levelId;
        state.transition('menu');
      }
    }
    else if (k.pause.includes(e.code) && state.is('play')) state.transition('pause');
    else if (k.pause.includes(e.code) && state.is('pause')) state.transition('play');
    else if (e.code === k.menu && state.is('pause')) state.transition('menu');
  });

  renderer.canvas.addEventListener('click', () => {
    if (state.is('play') && !overlay.visible) void renderer.canvas.requestPointerLock();
  });
  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== renderer.canvas) return;
    if (tools.freeCamActive) tools.addFreeLook(e.movementX, e.movementY);
    else camRig.addLook(e.movementX, e.movementY);
  });
  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && state.is('play') && !overlay.visible) state.transition('pause');
  });

  // ---------- dev hook (stripped from production builds) ----------
  if (import.meta.env.DEV) {
    const v3 = (v: THREE.Vector3): Vec3 => [v.x, v.y, v.z];
    window.__DEV__ = {
      state,
      loop,
      input,
      tuning: TUNING,
      rules: GAME_RULES,
      accent: (name) => (name ? switchAccent(name) : getAccent()),
      probe: () => tools.probe.history.map((s) => ({ ...s })),
      player: () => (player ? { feet: v3(player.feet()), vel: v3(player.vel), state: player.state, grounded: player.grounded } : null),
      teleport: (x, y, z, facingDeg) => player?.teleport({ x, y, z }, facingDeg === undefined ? undefined : facingDeg * DEG2RAD),
      stepTicks: (n) => {
        for (let i = 0; i < n; i++) loop.stepOnce();
      },
      record: () => input.record(),
      playback: (frames) => input.playback(frames),
      platforms: () => level?.platformPositions() ?? [],
      bodies: () => {
        if (!player) return null;
        const b = player.body.translation();
        const c = player.collider.translation();
        return { center: v3(player.center), body: [b.x, b.y, b.z], collider: [c.x, c.y, c.z] };
      },
    };
  }

  // ---------- playtest harness API (dead code outside `--mode harness` builds) ----------
  if (__HARNESS__ && HARNESS_MODE) {
    const v3 = (v: THREE.Vector3): Vec3 => [v.x, v.y, v.z];
    const snapshot = (): HarnessSnapshot => ({
      tick: loop.tickCount,
      frame: loop.frameCount,
      state: state.get(),
      feet: player ? v3(player.feet(new THREE.Vector3())) : [0, 0, 0],
      vel: player ? v3(player.vel) : [0, 0, 0],
      pstate: player?.state ?? 'none',
      grounded: player?.grounded ?? false,
      platforms: level?.platformPositions() ?? [],
      hazards: level?.hazardPositions() ?? [],
      crows: level?.crows() ?? [],
      checkpoints: [...checkpointLog],
      deaths,
      lastDeath,
      runTime: worldTime(),
      inputTicks,
    });
    // Fixed simulated clock: exactly one tick per frame, frameDt is always loop.dt, alpha 0.
    // Mirrors GameLoop.frame's gate: ticks run while the world runs (play AND death, D-004), not in pause.
    const advance = (n: number, renderEvery = 1): HarnessSnapshot => {
      for (let i = 0; i < n; i++) {
        if (state.worldRunning()) loop.stepOnce();
        skipRender = !(i === n - 1 || (renderEvery > 0 && loop.frameCount % renderEvery === 0));
        onRender(0, loop.dt);
        loop.frameCount++;
      }
      skipRender = false;
      return snapshot();
    };
    window.__HARNESS__ = {
      version: 'HARNESS_API_V1',
      seed: HARNESS_SEED,
      start: async () => {
        await startLevel();
        return { ok: state.is('play'), error: errorBanner.style.display === 'block' ? errorBanner.textContent : null };
      },
      advance,
      step: (frame, render) => {
        input.setOverride(frame);
        return advance(1, render ? 1 : 0);
      },
      setInput: (frame) => input.setOverride(frame),
      respawnAt: (pos, facing, tick) => {
        if (!level || !player) return snapshot();
        if (state.is('results') || state.is('menu')) state.transition('loading');
        if (state.is('loading') || state.is('death') || state.is('pause')) state.transition('play');
        worldTick = tick;
        deathTicksLeft = 0;
        level.snapTo(worldTime(), loop.dt);
        player.teleport({ x: pos[0], y: pos[1], z: pos[2] }, facing * DEG2RAD);
        respawn = { pos, facing };
        camRig.snap(player.feet(tmpFeet), player.facing);
        checkpointLog = [];
        input.setOverride(null);
        return snapshot();
      },
      playback: (frames) => input.playback(frames),
      isPlayingBack: () => input.isPlayingBack(),
      record: () => input.record(),
      snapshot,
      level: () => level?.data ?? null,
      instrument: () => instrument?.report() ?? null,
      tuning: TUNING,
      // one rules object: B-8's respawn-safety constants + PR 4's respawn timing. respawnDelaySec is a getter
      // because the feel-test switches change it live; a value captured once would go stale.
      rules: {
        checkpointRadius: GAME_RULES.checkpointRadius,
        goalHeightTolerance: GAME_RULES.goalHeightTolerance,
        goalRadiusDefault: GAME_RULES.goalRadiusDefault,
        get respawnDelaySec() { return GAME_RULES.respawnDelaySec; },
        fixedDt: loop.dt,
      },
      rendererInfo: () => {
        const info = renderer.renderer.info;
        return { calls: info.render.calls, triangles: info.render.triangles, geometries: info.memory.geometries, textures: info.memory.textures };
      },
      setCamera: (pos, target) => {
        cameraOverride = { pos, target };
      },
      rigCamera: (pivot, dir) => {
        const o = new THREE.Vector3(...pivot);
        const d = new THREE.Vector3(...dir).normalize();
        const arm = allowedArm(physics.castRay(o, d, CAMERA_TUNING.distance, player?.collider)?.distance ?? null);
        return [o.x + d.x * arm, o.y + d.y * arm, o.z + d.z * arm];
      },
      releaseCamera: () => {
        cameraOverride = null;
      },
      cameraYaw: (facingDeg) => {
        camRig.setYaw(facingDeg * DEG2RAD);
        if (player) camRig.snap(player.feet(tmpFeet), player.facing);
      },
      cameraPose: () => {
        const c = renderer.camera;
        const f = c.getWorldDirection(new THREE.Vector3());
        return {
          pos: [c.position.x, c.position.y, c.position.z],
          forward: [f.x, f.y, f.z],
          fovDeg: c.fov,
          viewPitchDeg: camRig.viewPitch() * RAD2DEG,
          assistOffsetDeg: camRig.assistOffset * RAD2DEG,
          assistEnabled: camRig.assistEnabled,
          probe: camRig.lastProbe,
        };
      },
      castRay: (origin, dir, max) => {
        const h = physics.castRay({ x: origin[0], y: origin[1], z: origin[2] }, { x: dir[0], y: dir[1], z: dir[2] }, max, player?.collider);
        return h ? { distance: h.distance, point: [h.point.x, h.point.y, h.point.z], normal: [h.normal.x, h.normal.y, h.normal.z] } : null;
      },
      setPlacementVisible: (name, pos, visible) => {
        let n = 0;
        level?.root.traverse((o) => {
          if (o instanceof THREE.Mesh && o.name === name && o.position.distanceTo(new THREE.Vector3(...pos)) < 1e-3) {
            o.visible = visible;
            n++;
          }
        });
        return n;
      },
      renderTorii: async (bg, cam, target) => {
        const a = MANIFEST.get('kit_torii');
        if (!a || a.kind !== 'mesh') return { ok: false, error: 'kit_torii is not a mesh asset in the manifest' };
        try {
          await preloadAssets([{ name: a.name, file: a.file }]);
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(bg);
        for (const part of getLoadedAsset('kit_torii')!.parts) scene.add(new THREE.Mesh(part.geometry, part.material));
        const c = renderer.camera;
        const view = new THREE.PerspectiveCamera(c.fov, c.aspect, c.near, c.far);
        view.position.set(...cam);
        view.lookAt(...target);
        renderer.renderer.setRenderTarget(null);
        renderer.renderer.render(scene, view);
        return { ok: true, error: null };
      },
      levelSources: () => bundledLevelSources(),
      startJson: async (text) => {
        // B-16: a test level goes through the same prepareLevel (mesh decode) as startLevel — the type
        // of install() makes skipping it a compile error.
        state.transition('loading');
        try {
          install(await prepareLevel(parseLevel(text, 'harness test level')));
          state.transition('play');
        } catch (err) {
          showError(err);
          state.transition('menu');
        }
        return { ok: state.is('play'), error: errorBanner.style.display === 'block' ? errorBanner.textContent : null };
      },
      assetProbe: async (name) => {
        const fail = (error: string): AssetProbe => ({ ok: false, error, calls: 0, triangles: 0, maps: [], materials: [], top: [], ktx2: getKtx2Support(), pixels: { covered: 0, nearPalette: 0, maxError: 0 } });
        const a = MANIFEST.get(name);
        if (!a || a.kind !== 'mesh') return fail(`"${name}" is not a mesh asset in the manifest`);
        try {
          await preloadAssets([{ name: a.name, file: a.file }]);
        } catch (err) {
          return fail(err instanceof Error ? err.message : String(err));
        }
        const loaded = getLoadedAsset(name)!;
        const scene = new THREE.Scene();
        const BG = 0xff00ff; // off-palette magenta: anything not magenta is the asset
        scene.background = new THREE.Color(BG);
        for (const part of loaded.parts) scene.add(new THREE.Mesh(part.geometry, part.material));
        const [lo, hi] = [new THREE.Vector3(...a.bbox.min), new THREE.Vector3(...a.bbox.max)];
        const c = lo.clone().add(hi).multiplyScalar(0.5);
        const r = hi.clone().sub(lo).length() / 2;
        const cam = new THREE.PerspectiveCamera(40, renderer.renderer.domElement.width / renderer.renderer.domElement.height, 0.1, r * 10);
        cam.position.set(c.x + r * 1.6, c.y + r * 0.6, c.z + r * 2.2);
        cam.lookAt(c);
        const r3 = renderer.renderer;
        r3.setRenderTarget(null);
        r3.render(scene, cam);
        const info = { calls: r3.info.render.calls, triangles: r3.info.render.triangles };
        // read back in the same task as the render (no preserveDrawingBuffer needed)
        const gl = r3.getContext();
        const w = gl.drawingBufferWidth;
        const h = gl.drawingBufferHeight;
        const px = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        // source texels: the palette as authored (sRGB bytes). Shipped colours must land on them.
        // source texels: the ramp + the accent actually in use (palette.json, accent.json — the same data lib.py reads)
        const hexes = [...paletteJson.colors.map((c) => c.hex), ACCENT_HEX[getAccent()]!];
        const texels = hexes.map((h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16)) as [number, number, number]);
        let covered = 0;
        let near = 0;
        let maxError = 0;
        const hist = new Map<number, number>();
        for (let i = 0; i < px.length; i += 4) {
          const [R, G, B] = [px[i]!, px[i + 1]!, px[i + 2]!];
          if (R > 240 && G < 15 && B > 240) continue; // background
          covered++;
          const key = (R << 16) | (G << 8) | B;
          hist.set(key, (hist.get(key) ?? 0) + 1);
          let best = 255;
          for (const t of texels) best = Math.min(best, Math.max(Math.abs(R - t[0]), Math.abs(G - t[1]), Math.abs(B - t[2])));
          if (best <= 6) near++;
          maxError = Math.max(maxError, best);
        }
        const mats = loaded.parts.map((p) => p.material);
        const maps = mats.flatMap((m) => {
          const t = (m as THREE.MeshBasicMaterial).map;
          if (!t) return [];
          const img = t.image as { width: number; height: number };
          return [{ width: img.width, height: img.height, compressed: (t as THREE.CompressedTexture).isCompressedTexture === true, format: t.format as number, mipmaps: t.mipmaps?.length ?? 0, colorSpace: t.colorSpace }];
        });
        const top = [...hist.entries()].sort((x, y) => y[1] - x[1]).slice(0, 6).map(([k, n]) => `#${k.toString(16).padStart(6, '0')}:${n}`);
        return { ok: true, error: null, ...info, maps, materials: mats.map((m) => m.type), top, ktx2: getKtx2Support(), pixels: { covered, nearPalette: near, maxError } };
      },
      teleportPlayer: (pos) => {
        player?.teleport({ x: pos[0], y: pos[1], z: pos[2] });
      },
      translators: () => {
        const out: { id: string; name: string; tag: string | null; pos: Vec3 }[] = [];
        const w = new THREE.Vector3();
        const walk = (o: THREE.Object3D, tag: string | null, path: string): void => {
          if (!o.visible) return;
          const t = (o.userData['translates'] as string | undefined) ?? tag;
          const p = `${path}/${o.name || o.type}`;
          const r = o as THREE.Mesh & { isLine?: boolean; isPoints?: boolean; isSprite?: boolean };
          if (r.isMesh || r.isLine || r.isPoints || r.isSprite) {
            o.getWorldPosition(w);
            out.push({ id: o.uuid, name: p, tag: t, pos: [w.x, w.y, w.z] });
          }
          for (const c of o.children) walk(c, t, p);
        };
        walk(renderer.scene, null, '');
        return out;
      },
    };
    state.transition('menu');
    return; // deterministic mode: the harness drives every frame; the rAF loop never starts
  }

  state.transition('menu');
  loop.start();
}

boot().catch((err: unknown) => {
  const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
  console.error('[boot] FAILED', msg);
  const hud = document.getElementById('hud');
  if (hud) hud.textContent = `BOOT FAILED\n${msg}`;
});
