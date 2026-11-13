// Boot: wire engine + gameplay + content, load the gym, start the loop.
// This file is the only place the layers meet (engine never imports entities/levels).

import * as THREE from 'three';
import { StateMachine, type GameState } from './engine/state';
import { GameLoop, LOOP_CONFIG } from './engine/loop';
import { INPUT_CONFIG, InputSystem, type InputFrame } from './engine/input';
import { Physics } from './engine/physics';
import { Renderer, RENDER_CONFIG } from './engine/renderer';
import { PAINT_LAYER, PaintLayer } from './engine/paint-layer';
import { getCharacter } from './loaders/character';
import { CHARACTER } from './entities/character-model';
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
import { ramp } from './engine/palette';
import { Shell, SHELL, shellEnabled } from './ui/shell';
import { buildHowto, chaptersFrom, keyName, teachLine, type HowtoChapter } from './ui/howto';
import { TEACH, Teach, type TeachShown, type TeachView } from './systems/teach';
import { AUDIO, GameAudio } from './audio/audio';
import { SoundTap } from './audio/tap';
import { Gamepad, GAMEPAD } from './engine/gamepad';
import { SlashArc } from './entities/slash';
import { Swordsmen, type SwordsmanSnapshot } from './entities/swordsmen';
import { SWORDSMAN } from './entities/swordsman-model';
import { FIGHT, goalCounts, stepGate, windupSec, type FightEvent, type WarriorView } from './systems/fight';

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
  /** D-023: every swordsman of the level, in the level file's order: where he is and what he is doing */
  enemies: SwordsmanSnapshot[];
  /** D-023: seconds into the warrior's slash, or null; and how many slashes have started */
  slash: number | null;
  slashes: number;
  /** D-026: the level's gate, 0 shut to 1 open; null on a level with no gate */
  gate: number | null;
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
  /** D-023: the fight's one table, live, and the wind-up as it is actually run (never under its minimum). */
  fight: typeof FIGHT;
  windupSec(): number;
  /** D-023: the player's facing, degrees (teleportPlayer's second argument sets it). */
  facing(): number;
  /** D-023: the swordsman's clips (name, seconds); empty on a level with none. */
  enemyClips(): { name: string; duration: number }[];
  rendererInfo(): { calls: number; triangles: number; geometries: number; textures: number };
  /** D-018: the STYLE §6 passes the running post stack was compiled with, in order. */
  postPasses(): string[];
  /** D-020: the paint layer's state; pass false to draw the ink pass alone (the frame the D-018/D-019 gate judges). */
  paintLayer(on?: boolean): { painted: number; backdrop: number; drawn: boolean };
  /** Draw the CURRENT tick again: no simulation step, so two frames can differ only in what was drawn. */
  redraw(): void;
  /** D-018: per-pixel distance (u) from the camera of the last rendered frame, top row first (harness post stage). */
  postProbe(): { width: number; height: number; dist: number[] };
  /** D-018 (STYLE §1): every light in the scene, and every material that is not unlit. Both must be empty. */
  sceneAudit(): { lights: string[]; litMaterials: string[] };
  setCamera(pos: Vec3, target: Vec3): void;
  /** Where the follow rig would put the camera for this pivot and arm direction: the arm pulled in by the
   *  same raycast + clamp as SpringArmCamera (D-012: only frames normal camera control can reach). */
  rigCamera(pivot: Vec3, dir: Vec3): Vec3;
  releaseCamera(): void;
  /** B-18: the follow rig's real pose (after the assist and arm collision), and what the assist's probe saw. */
  cameraPose(): { pos: Vec3; forward: Vec3; fovDeg: number; viewPitchDeg: number; assistOffsetDeg: number; assistEnabled: boolean; probe: AssistProbe | null; arm: number; pivot: Vec3; yawDeg: number };
  /** CAMERA-ROOM: the mouse, as a player moves it (pixels; SpringArmCamera.addLook). The camera only: input frames are world-space. */
  look(dxPixels: number, dyPixels: number): void;
  /** CAMERA-ROOM: the warrior's box (feet to the top of the figure, the body's width) in the camera's frame: its
   *  extent in normalised device coordinates (-1..1 is on screen) and the nearest corner's distance in front of the camera (m). */
  figureFrame(): { x0: number; x1: number; y0: number; y1: number; nearM: number } | null;
  /** B-18: one physics ray against the level (the player excluded), as the camera's own probe casts them. */
  castRay(origin: Vec3, dir: Vec3, max: number): { distance: number; point: Vec3; normal: Vec3 } | null;
  /** Visible level meshes, including collider:none; excludes the player and debug overlays. */
  castRenderRay(origin: Vec3, dir: Vec3, max: number): { distance: number; point: Vec3; normal: Vec3 } | null;
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
  /** Harness-only: move the player (PR 4's hazards stage). facingDeg: also turn it (D-023's fight stage). */
  teleportPlayer(pos: Vec3, facingDeg?: number): void;
  /** D-021: show or hide every level mesh whose name starts with `prefix` (the undrawn rock, the cliff wall). Returns how many. */
  showMeshes(prefix: string, visible: boolean): number;
  /** D-023: show or hide the level's swordsmen (the post stage reads which pixels they cover). Returns how many. */
  showEnemies(visible: boolean): number;
  /** D-021: the figure's clips (name, seconds), and one shown at a time in place of the state's pose; null clears it. */
  figureClips(): { name: string; duration: number }[];
  showFigure(clip: string | null, time?: number): void;
  /** D-022: show the sword slash `time` seconds into it over whatever the figure is doing; null clears it (tools/harness/motion.ts --slash). */
  showSlash(time: number | null): void;
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
  const paintLayer = new PaintLayer(renderer.renderer, renderer.scene, renderer.camera); // D-020: drawn after the ink pass
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

  // D-022: sound, only at the front door (the same test as the shell, below). On a bare page both are null and
  // every line that names them does nothing: no context is opened and no file is fetched.
  const audio = !HARNESS_MODE && shellEnabled() ? new GameAudio() : null;
  const tap = audio ? new SoundTap(audio) : null;

  // D-022: a gamepad. It does not exist in the harness's test mode.
  const pad = HARNESS_MODE ? null : new Gamepad();
  if (pad) input.setPad({ move: () => pad.move(), held: (a) => pad.held(a) });
  // D-023: the level's swordsmen, or null on a level with none (every level but chapter 1)
  let enemies: Swordsmen | null = null;
  /** D-026: the gate of a level whose goal waits, 0 shut to 1 open. Derived every tick from who is standing. */
  let gateShare = 0;
  const NOBODY: readonly { mode: 'fallen' }[] = [];
  /** One tick of the gate: it opens while every swordsman is down and is shut the tick one is standing again. */
  const gateTick = (dt: number, snap = false): void => {
    if (!level?.doors) return;
    // a door on a level whose goal does not wait stays shut (lint DOOR_NO_CLEAR refuses that level)
    gateShare = level.data.goal.once_clear ? stepGate(gateShare, goalCounts(true, enemies?.sims ?? NOBODY), dt) : 0;
    level.setGate(gateShare, snap);
  };
  let slashArc: SlashArc | null = null;
  /** The ink stroke, made the first time it is wanted: a page that never slashes has no such mesh. */
  const strokeOf = (p: Player): SlashArc => {
    if (!slashArc) {
      slashArc = new SlashArc();
      p.mesh.add(slashArc.mesh);
      paintLayer.refresh();
    }
    return slashArc;
  };
  /**
   * The sword was pressed (a key, the mouse, the pad). D-023: the slash itself starts in the fixed tick, from the
   * input frame, so this only hands the press to the input system; the sound tap hears the slash start.
   */
  const slash = (): void => {
    if (!player || !state.is('play') || shell?.helpOpen) return;
    input.pressSlash();
  };

  const landingMark = new LandingMark(physics);
  landingMark.mesh.userData['translates'] = 'player'; // follows the player's ground point (D-010)
  renderer.scene.add(landingMark.mesh);
  const camRig = new SpringArmCamera(renderer.camera, (o, d, max) => physics.castRay(o, d, max, player?.collider)?.distance ?? null);
  // D-015d pitch assist ships ON (B-18); ?pitchassist=off is the comparison, as ?landingmark=off is.
  camRig.assistEnabled = new URLSearchParams(location.search).get('pitchassist') !== 'off';
  // CAMERA-WALL-ZOOM: the pivot is held in the open; ?pivothold=off is the comparison the camera-room stage must see fail.
  camRig.pivotHold = new URLSearchParams(location.search).get('pivothold') !== 'off';

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
      ? new THREE.Fog(data.fog.color ?? ramp('paper-cream'), data.fog.near ?? GAME_RULES.fogDefaults.near, data.fog.far ?? GAME_RULES.fogDefaults.far)
      : null;
    renderer.scene.background = new THREE.Color(level.background ?? ramp('paper-cream')); // D-018: paper, every level
    const [x, y, z] = data.spawn.pos;
    const facing = data.spawn.facing * DEG2RAD;
    if (!player) {
      player = new Player(physics, { x, y, z }, facing, getCharacter(CHARACTER.asset));
      player.mesh.userData['translates'] = 'player';
      renderer.scene.add(player.mesh);
    }
    enemies?.dispose();
    enemies = null;
    if (data.enemies?.length) {
      const figure = getCharacter(SWORDSMAN.asset);
      if (!figure) throw new Error(`[level] ${data.id} places swordsmen but "${SWORDSMAN.asset}" is not decoded: prepareLevel was skipped`);
      enemies = new Swordsmen(data, figure, [...MANIFEST.values()]); // the manifest: what stands on his ground is cut out of it by its size (B-79)
      enemies.root.userData['translates'] = 'enemy'; // NOT #18: a swordsman may translate (D-023)
      renderer.scene.add(enemies.root);
    }
    gateShare = 0;
    gateTick(0, true); // D-026: a level starts with its gate shut
    paintLayer.refresh();
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
    tap?.reset();
    teach?.setLevel(data); // D-025: this level's places; the moves made in this visit stay made
    showTeach(null);
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
  // B-78: what ended this attempt, for the one word the HUD shows. It is set by the death it describes and read
  // only while that death is on screen: it says HOW the warrior went down just now, never how often.
  let deathByCut = false;
  const die = (f: THREE.Vector3, cut = false): void => {
    deathTicksLeft = Math.round(GAME_RULES.respawnDelaySec * LOOP_CONFIG.fixedHz);
    deaths++;
    deathByCut = cut;
    lastDeath = [f.x, f.y, f.z];
    if (player) player.slashTime = null; // D-023: a slash in the air ends with the attempt (the player is not stepped again until the respawn)
    if (teach) {
      teach.died([f.x, f.y, f.z], cut, foesNow()); // D-025: a miss at the place it happened; reads, writes nothing
      showTeach(null);
    }
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
    // D-026: win is still arriving, but where the level says so the arrival waits for every swordsman to be down
    if (Math.hypot(f.x - g.pos[0], f.z - g.pos[2]) < (g.radius ?? GAME_RULES.goalRadiusDefault) && Math.abs(f.y - g.pos[1]) < GAME_RULES.goalHeightTolerance &&
        goalCounts(g.once_clear, enemies?.sims ?? NOBODY)) {
      player.slashTime = null; // D-023: nor does one hang over the results: no tick follows to finish it
      state.transition('results');
    }
  };

  // ---------- loop ----------
  /** What a swordsman is told about the warrior this tick. absent: between a death and the respawn. */
  const warriorView = (p: Player, present: boolean): WarriorView => {
    const f = p.feet(tmpFeet);
    return { present, x: f.x, y: f.y, z: f.z, facing: p.facing, cutting: present && p.cutting(), slashId: p.slashCount };
  };
  const NO_FIGHT: FightEvent[] = [];

  // ---------- the teach line (D-025): told what happened after each tick, as the sound tap is ----------
  /** Every swordsman of the level as the teach rule sees him: where he is, and whether he is down. */
  const foesNow = (): TeachView['foes'] => enemies?.snapshot().map((e) => ({ id: e.id, pos: e.pos, down: e.mode === 'fallen' })) ?? [];
  /** The drifting stone under the warrior's feet, by the stone's own box (the manifest's size), or null. */
  const ridden = (p: Player, f: THREE.Vector3): string | null => {
    if (!level || !p.grounded) return null;
    const defs = level.data.platforms ?? [];
    for (const [i, s] of level.platformPositions().entries()) {
      const a = MANIFEST.get(defs[i]?.asset ?? '');
      if (!a || a.kind !== 'primitive') continue;
      const [w, h, d] = a.size;
      if (Math.abs(f.x - s.pos[0]) <= w / 2 && Math.abs(f.z - s.pos[2]) <= d / 2 && Math.abs(f.y - (s.pos[1] + h / 2)) <= TEACH.riseM) return s.id;
    }
    return null;
  };
  /** Whose keys a teach line is written in: the pad's once a pad has been used, the keyboard's once a key has. */
  let padInHand = false;
  /** Put what the rule says on the page. The key carries whose keys it is written in, so a change of hands rebuilds it. */
  const showTeach = (shown: TeachShown | null): void => {
    shell?.showTeach(shown ? `${shown.line}|${padInHand ? 'pad' : 'keys'}` : null, shown?.line ?? null, shown?.spot ?? null);
  };

  const onFixedUpdate = (dt: number): void => {
    if (!level || !player) return;
    worldTick++; // every executed tick advances the world: play, death, or an explicit frame step
    if (state.is('death')) {
      // D-004: the world runs while you are dead. Pose it and step physics (kinematic bodies follow);
      // the player and input do not advance, and nothing is recorded, so traces stay aligned.
      level.fixedUpdate(worldTime(), dt);
      physics.step(dt);
      enemies?.fixedUpdate(dt, warriorView(player, false)); // they finish what they were doing; nobody is there to see or cut
      gateTick(dt); // D-026: an open gate stays open over a death; the respawn below shuts it
      if (--deathTicksLeft <= 0) {
        const [x, y, z] = respawn.pos;
        player.teleport({ x, y, z }, respawn.facing * DEG2RAD);
        enemies?.reset(); // D-023: a fallen swordsman comes back when the warrior does
        gateTick(dt, true); // D-026: and the gate is shut again with them
        camRig.snap(player.feet(tmpFeet), player.facing);
        state.transition('play');
        tap?.respawned(checkpointLog.length);
        teach?.moved();
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
    // D-023: the swordsmen, after the warrior has moved. A cut that lands is a death like any other (Q6: one way
    // to die, nothing else happens on contact). Only from `play`, as every rule transition is.
    const fight = enemies ? enemies.fixedUpdate(dt, warriorView(player, state.is('play'))) : NO_FIGHT;
    if (state.is('play') && fight.some((e) => e.kind === 'cut')) die(player.feet(tmpFeet), true);
    gateTick(dt); // D-026: after the fight's tick, before the goal is asked
    rulesTick();
    tap?.afterTick(player, checkpointLog.length, fight); // D-022: reads the tick, writes nothing
    // D-025: the teach line, the same way: reads the tick, writes nothing. Not on a tick that ended the attempt
    // or the chapter (die() and the results have already cleared it).
    if (teach && state.is('play')) {
      const f = player.feet(tmpFeet);
      showTeach(teach.afterTick({ feet: [f.x, f.y, f.z], grounded: player.grounded, pstate: player.state, foes: foesNow(), fell: fight.some((e) => e.kind === 'fell'), riding: ridden(player, f) }));
    }
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
    if (pad) padFrame(pad, frameDt);
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
    // D-022: the slash's ink stroke faces the camera, so it is placed once the camera is. No stroke exists until a first slash.
    if (player && player.slashTime !== null && !slashArc) strokeOf(player);
    slashArc?.update(player?.slashTime ?? null, renderer.camera);
    enemies?.render(alpha, renderer.camera); // D-023: their ink faces the camera too

    profiler.begin('render');
    if (!skipRender) {
      renderer.render();
      paintLayer.render();
    }
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

  // ---------- the shell: title screen and how-to-play page (D-022) ----------
  // Only at the game's front door (index.html decides, from the URL) and never in a harness build's test mode.
  // A bare page builds none of it: `shell` is null and every line below that names it does nothing.
  let chapters: HowtoChapter[] = [];
  /** Play: from the title's button, its keys, or a pad. */
  const startGame = (): void => {
    audio?.wake(); // the Play press is the gesture a browser needs before a page may make sound
    if (!state.is('menu')) return;
    input.holdOff('jump'); // Space and the pad's A are Play here and jump there: the press that starts the game is not a jump
    pad?.holdOff('jump');
    // D-025: Play is the first chapter, whatever chapter was played last (the chapter list is how to start another)
    void startLevel(levelId);
  };
  /**
   * D-025: a chapter chosen from the list. The same as Play in everything but which level: the press is the
   * gesture that lets the page make sound, and it is not a jump. From the title the state is `menu`; from the
   * how-to-play page in a game it is `pause` (the page paused it) or `results`: each may go to `loading`.
   */
  const startChapter = (id: string): void => {
    audio?.wake();
    if (!state.can('loading')) return;
    input.holdOff('jump');
    pad?.holdOff('jump');
    void startLevel(id);
  };
  const shell: Shell | null = !HARNESS_MODE && shellEnabled()
    ? new Shell({
        state: () => state.get(),
        start: startGame,
        chapters: () => chapters,
        startChapter,
        teachContent: (line) => teachLine(line, { bindings: INPUT_CONFIG.bindings, pad: padInHand ? GAMEPAD.labels : null }),
        pause: () => { if (state.is('play')) state.transition('pause'); },
        resume: () => { if (state.is('pause')) state.transition('play'); },
        helpContent: () => buildHowto({
          chapters,
          bindings: INPUT_CONFIG.bindings,
          keys: [
            ['Pause', GAME_RULES.keys.pause],
            ['Back to the title (while paused)', [GAME_RULES.keys.menu]],
            ['Start, and the next chapter', [GAME_RULES.keys.start]],
            ['How to play', [SHELL.keys.help]],
            ['Chapters (from the title, or this page)', [SHELL.keys.chapters]],
            ...(audio ? [['Sound on and off', [AUDIO.keys.mute]], ['Quieter, louder', [AUDIO.keys.quieter, AUDIO.keys.louder]]] as const : []),
          ],
          pad: GAMEPAD.labels,
          respawnDelaySec: GAME_RULES.respawnDelaySec,
        }),
        hint: () => `${keyName(SHELL.keys.help)}  how to play` + (audio ? `     ${keyName(AUDIO.keys.mute)}  sound: ${audio.muted ? 'off' : 'on'}` : ''),
        sound: audio
          ? { muted: () => audio.muted, setMuted: (m) => audio.setMuted(m), volume: () => audio.volume, setVolume: (v) => audio.setVolume(v) }
          : null,
      })
    : null;
  if (shell) {
    errorBanner.style.zIndex = '50'; // above the title: a level that fails to load must be seen
    void bundledLevelSources().then((s) => { chapters = chaptersFrom(s); shell.refreshHelp(); });
  }
  // D-025: the teach rule exists where the shell does and nowhere else. On a bare page it is null and every line
  // that names it does nothing, so the harness's game is the game as it was.
  const teach: Teach | null = shell
    ? new Teach({ dt: loop.dt, heightTol: GAME_RULES.goalHeightTolerance, dashJumpSec: TUNING.coyoteTimeSec + TUNING.jumpBufferSec })
    : null;

  // ---------- HUD + UI keys ----------
  const hudText = (s: GameState): string => {
    switch (s) {
      case 'boot': return 'booting…';
      case 'menu': return shell ? '' : 'WARRIOR\n\nEnter: start\nclick: mouse look   ~: debug + dev tools';
      case 'loading': return 'loading…';
      case 'play': return '';
      case 'pause': return 'PAUSED\nP / Esc: resume   M: menu';
      case 'death': return deathByCut ? 'cut down' : 'fell'; // B-78: a swordsman's blade is not a fall
      // Q4: win is *arrive*. The results state reads `complete` and nothing else — no time, score,
      // par or rank. Run time stays on the ~ debug overlay, which is dev tooling, not the game.
      case 'results': return nextId ? 'COMPLETE\nEnter: next chapter' : 'COMPLETE\nEnter: menu';
    }
  };
  state.onChange((to) => {
    hud.textContent = hudText(to);
    shell?.onState(to);
    // the music is at full in the game and quieter under the title and while paused
    audio?.setScene(to === 'play' || to === 'death' || to === 'results' ? 'game' : 'title');
    if (to === 'results') tap?.goal();
  });

  // D-014 fix 3: finishing a chapter loads the next; after the last one, back to the menu, which
  // then starts the game from the front door again.
  const afterResults = (): void => {
    if (nextId) void startLevel(nextId);
    else {
      currentId = levelId;
      state.transition('menu');
    }
  };

  // D-022: the pad's buttons that are not moves, once a render frame. The moves go through the input system.
  function padFrame(p: Gamepad, frameDt: number): void {
    p.poll();
    if (p.active()) padInHand = true; // D-025: a teach line names the pad's buttons from here on, until a key is pressed
    if (shell?.chaptersOpen) {
      // D-025: the chapter list. The stick or the D-pad moves between chapters, A (or Start) chooses the one in
      // focus, and B, Back or Y shuts the list. startChapter holds A off, as Play does: choosing is not a jump.
      const step = p.navStep();
      if (step) shell.stepChapter(step);
      if (p.pressed('start')) shell.pressChapter();
      else if (p.pressed('back') || p.pressed('chapters')) { p.holdOff('dash'); shell.closeChapters(); }
      return;
    }
    if (shell?.helpOpen) {
      // B closes the page and is also dash: the press that closes it is not a dash (as Play's A is not a jump)
      if (p.pressed('back') || p.pressed('help')) { p.holdOff('dash'); shell.closeHelp(); }
      else if (p.pressed('chapters')) shell.openChapters();
      return;
    }
    if (shell && p.pressed('help')) return shell.openHelp(); // which refuses where the page could not pause the game
    if (state.is('menu')) {
      if (shell && p.pressed('chapters')) return shell.openChapters();
      if (p.pressed('start')) startGame();
    } else if (state.is('results')) {
      if (p.pressed('start')) { p.holdOff('jump'); afterResults(); } // A is "next chapter" here and jump there
    } else if (state.is('pause')) {
      if (p.pressed('pause')) state.transition('play');
    } else if (state.is('play')) {
      if (p.pressed('pause')) return state.transition('pause');
      if (p.pressed('slash')) slash();
      const look = p.look(frameDt);
      if ((look.x || look.y) && !tools.freeCamActive) camRig.addLook(look.x, look.y);
    }
  }

  window.addEventListener('keydown', (e) => {
    const k = GAME_RULES.keys;
    padInHand = false; // D-025: a teach line names the keyboard's keys again
    if (audio) {
      audio.nudge();
      if (!e.repeat && e.code === AUDIO.keys.mute) audio.setMuted(!audio.muted);
      else if (e.code === AUDIO.keys.quieter) audio.setVolume(audio.volume - AUDIO.volumeStep);
      else if (e.code === AUDIO.keys.louder) audio.setVolume(audio.volume + AUDIO.volumeStep);
      if (e.code === AUDIO.keys.mute || e.code === AUDIO.keys.quieter || e.code === AUDIO.keys.louder) shell?.syncSound();
    }
    if (shell?.onKey(e, k.start)) return;
    if (!e.repeat && INPUT_CONFIG.bindings.slash.includes(e.code)) slash();
    if (e.code === k.start && state.is('menu')) void startLevel();
    else if (e.code === k.start && state.is('results')) afterResults();
    else if (k.pause.includes(e.code) && state.is('play')) state.transition('pause');
    else if (k.pause.includes(e.code) && state.is('pause')) state.transition('play');
    else if (e.code === k.menu && state.is('pause')) state.transition('menu');
  });

  if (audio) window.addEventListener('pointerdown', () => audio.nudge());
  // the left button is the sword once the mouse is the camera's (the click that captures it is not a slash)
  renderer.canvas.addEventListener('mousedown', (e) => {
    if (INPUT_CONFIG.bindings.slash.includes(`Mouse${e.button}`) && document.pointerLockElement === renderer.canvas) slash();
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
      enemies: enemies?.snapshot() ?? [],
      slash: player?.slashTime ?? null,
      slashes: player?.slashCount ?? 0,
      gate: level?.doors ? gateShare : null,
    });
    // Fixed simulated clock: exactly one tick per frame, frameDt is always loop.dt, alpha 0.
    // Mirrors GameLoop.frame's gate: ticks run while the world runs (play AND death, D-004), not in pause.
    // renderLast: a batch always draws its final frame, so the canvas and renderer.info a caller reads next
    // are that frame's (counters, visual, accent and post rely on it). step() passes its own `render` flag
    // instead: with n = 1 the final frame is EVERY frame, so step(frame, false) used to draw each tick and
    // the bot's renderEvery had no effect (found on PR 29: phase-sweep 70-84% of a level job, all of it drawing).
    const advance = (n: number, renderEvery = 1, renderLast = true): HarnessSnapshot => {
      for (let i = 0; i < n; i++) {
        if (state.worldRunning()) loop.stepOnce();
        skipRender = !((renderLast && i === n - 1) || (renderEvery > 0 && loop.frameCount % renderEvery === 0));
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
      advance: (n, renderEvery) => advance(n, renderEvery),
      step: (frame, render) => {
        input.setOverride(frame);
        return advance(1, render ? 1 : 0, render);
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
        enemies?.reset(); // as a real respawn does (D-023)
        gateTick(loop.dt, true); // and its gate is shut again (D-026)
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
      fight: FIGHT,
      windupSec: () => windupSec(),
      facing: () => (player ? player.facing * RAD2DEG : 0),
      enemyClips: () => enemies?.clips() ?? [],
      postPasses: () => [...renderer.post.passes],
      paintLayer: (on) => {
        if (on !== undefined) paintLayer.enabled = on;
        return paintLayer.status();
      },
      redraw: () => onRender(0, loop.dt),
      sceneAudit: () => {
        // Unlit: shading ignores every light. Anything else (Standard, Lambert, Phong, Toon, Physical...) is lit.
        const UNLIT = new Set(['MeshBasicMaterial', 'LineBasicMaterial', 'LineDashedMaterial', 'PointsMaterial', 'SpriteMaterial', 'ShaderMaterial', 'RawShaderMaterial']);
        const lights: string[] = [], lit = new Set<string>();
        renderer.scene.traverse((o) => {
          if ((o as THREE.Light).isLight) lights.push(`${o.type}${o.name ? ` "${o.name}"` : ''}`);
          const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
          for (const x of m ? (Array.isArray(m) ? m : [m]) : []) if (!UNLIT.has(x.type)) lit.add(`${x.type} on ${o.name || o.type}`);
        });
        return { lights, litMaterials: [...lit] };
      },
      postProbe: () => {
        const r = renderer.post.readDistance(renderer.camera);
        return { width: r.width, height: r.height, dist: Array.from(r.dist, (v) => Math.round(v * 1000) / 1000) };
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
          arm: camRig.arm,
          pivot: v3(camRig.pivotPoint(new THREE.Vector3())),
          yawDeg: camRig.yaw * RAD2DEG,
        };
      },
      look: (dx, dy) => camRig.addLook(dx, dy),
      figureFrame: () => {
        if (!player) return null;
        const c = renderer.camera;
        c.updateMatrixWorld(true);
        const f = player.feet(new THREE.Vector3()), r = TUNING.capsuleRadius, h = 2 * player.feetOffset();
        const fwd = c.getWorldDirection(new THREE.Vector3()), p = new THREE.Vector3();
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, nearM = Infinity;
        for (const dx of [-r, r]) for (const dy of [0, h]) for (const dz of [-r, r]) {
          p.set(f.x + dx, f.y + dy, f.z + dz);
          nearM = Math.min(nearM, p.clone().sub(c.position).dot(fwd));
          p.project(c);
          x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
        }
        return { x0, x1, y0, y1, nearM };
      },
      castRay: (origin, dir, max) => {
        const h = physics.castRay({ x: origin[0], y: origin[1], z: origin[2] }, { x: dir[0], y: dir[1], z: dir[2] }, max, player?.collider);
        return h ? { distance: h.distance, point: [h.point.x, h.point.y, h.point.z], normal: [h.normal.x, h.normal.y, h.normal.z] } : null;
      },
      castRenderRay: (origin, dir, max) => {
        if (!level) return null;
        level.root.updateMatrixWorld(true);
        const meshes: THREE.Object3D[] = [];
        // The backdrop is far field and mist, below and beyond every landing by construction (backdrop.ts):
        // it is not a sightline occluder. A painted hero mesh IS one, so the ray sees the paint layer too.
        level.root.traverseVisible(o => { if (o instanceof THREE.Mesh && !o.name.startsWith('backdrop:')) meshes.push(o); });
        const ray = new THREE.Raycaster(new THREE.Vector3(...origin), new THREE.Vector3(...dir), 0, max);
        ray.layers.enable(PAINT_LAYER);
        const h = ray.intersectObjects(meshes, false).find(h => {
          const mesh = h.object as THREE.Mesh;
          const material = Array.isArray(mesh.material) ? mesh.material[h.face?.materialIndex ?? 0] : mesh.material;
          return material?.visible && material.opacity > 0;
        });
        if (!h?.face) return null;
        const n = h.face.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(h.object.matrixWorld));
        return { distance: h.distance, point: [h.point.x, h.point.y, h.point.z], normal: [n.x, n.y, n.z] };
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
        for (const part of getLoadedAsset('kit_torii')!.drawn) scene.add(new THREE.Mesh(part.geometry, part.material)); // as a level draws it (D-020)
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
      teleportPlayer: (pos, facingDeg) => {
        player?.teleport({ x: pos[0], y: pos[1], z: pos[2] }, facingDeg === undefined ? undefined : facingDeg * DEG2RAD);
      },
      showMeshes: (prefix, visible) => {
        let n = 0;
        level?.root.traverse((o) => {
          if (o instanceof THREE.Mesh && o.name.startsWith(prefix)) { o.visible = visible; n++; }
        });
        return n;
      },
      figureClips: () => player?.figureClips() ?? [],
      showFigure: (clip, time) => player?.showFigure(clip, time),
      showSlash: (time) => {
        if (!player) return;
        player.slashTime = time;
        strokeOf(player);
      },
      showEnemies: (visible) => {
        if (enemies) enemies.root.visible = visible;
        return enemies?.count ?? 0;
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
  // D-022: the title is up and the game is ready behind it. Decode the first chapter now, so Play is short.
  if (shell) queueMicrotask(() => { if (state.is('menu')) void loadLevel(currentId).then(prepareLevel).catch(() => { /* startLevel reports it when Play is pressed */ }); });
}

boot().catch((err: unknown) => {
  const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
  console.error('[boot] FAILED', msg);
  // D-022: the title painting is in the page before this module loads and is drawn over the HUD. A boot that
  // failed has no game behind it, so take the shell off the screen and let the message be read (OQ-073). On a
  // bare page neither element exists.
  for (const id of ['title', 'help']) document.getElementById(id)?.setAttribute('hidden', '');
  const hud = document.getElementById('hud');
  if (hud) hud.textContent = `BOOT FAILED\n${msg}`;
});
