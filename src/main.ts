// Boot: wire engine + gameplay + content, load the gym, start the loop.
// This file is the only place the layers meet (engine never imports entities/levels).

import * as THREE from 'three';
import { StateMachine, type GameState } from './engine/state';
import { GameLoop } from './engine/loop';
import { InputSystem, type InputFrame } from './engine/input';
import { Physics } from './engine/physics';
import { Renderer, RENDER_CONFIG } from './engine/renderer';
import { SpringArmCamera, CAMERA_TUNING } from './engine/camera';
import { DebugOverlay, Profiler } from './engine/debug';
import { DevTools, type AirSegment } from './engine/tools';
import { Player, TUNING } from './entities/player';
import { capsuleTouches, patrolPosition } from './systems/patrol';
import { buildLevel, fetchLevelFresh, loadLevel, parseLevel, type LevelData, type LevelInstance, type Vec3 } from './loaders/level';

export const GAME_RULES = {
  startLevel: '00-gym',
  respawnDelaySec: 0.8,     // time spent in `death` before respawning
  checkpointRadius: 2.0,    // m (horizontal) to activate a checkpoint
  goalHeightTolerance: 2.0, // m vertical slack when testing the goal radius
  teleportLift: 0.05,       // m above the picked surface
  fogDefaults: { near: 40, far: 250 },
  decimals: 2,
  keys: { start: 'Enter', pause: ['KeyP', 'Escape'], menu: 'KeyM' },
};

const DEG2RAD = Math.PI / 180;
const ZERO = new THREE.Vector3();

interface DevHook {
  state: StateMachine;
  loop: GameLoop;
  input: InputSystem;
  tuning: typeof TUNING;
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
  checkpoints: number[];
  deaths: number;
  lastDeath: Vec3 | null;
  runTime: number;
  /** fixed ticks that consumed an input frame — every tick except those spent in `death` */
  inputTicks: number;
}

interface HarnessApi {
  version: string;
  seed: number;
  start(): Promise<{ ok: boolean; error: string | null }>;
  /** n deterministic frames: one fixed tick each (while the world runs: play, death) + one render pass. */
  advance(n: number, renderEvery?: number): HarnessSnapshot;
  /** setInput(frame) then advance(1) — one round trip per tick for the bot. */
  step(frame: InputFrame | null, render: boolean): HarnessSnapshot;
  setInput(frame: InputFrame | null): void;
  playback(frames: InputFrame[]): void;
  isPlayingBack(): boolean;
  record(): InputFrame[];
  snapshot(): HarnessSnapshot;
  level(): LevelData | null;
  tuning: typeof TUNING;
  rendererInfo(): { calls: number; triangles: number; geometries: number; textures: number };
  setCamera(pos: Vec3, target: Vec3): void;
  releaseCamera(): void;
  rules: { respawnDelaySec: number; fixedDt: number };
  /** Start a fixture level from JSON text (tools/harness/fixtures/), same validation as levels/. */
  startJson(text: string): Promise<{ ok: boolean; error: string | null }>;
  teleportPlayer(pos: Vec3): void;
  /** Patroller base positions at world time t — the runtime's own pure function, for the harness. */
  patrollers(t: number): Vec3[];
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
  const physics = await Physics.create();
  const input = new InputSystem(window);
  const profiler = new Profiler();
  profiler.absent.add('audio');
  const overlay = new DebugOverlay(renderer.renderer, renderer.scene, physics, profiler);

  let level: LevelInstance | null = null;
  let player: Player | null = null;
  let respawn: { pos: Vec3; facing: number } = { pos: [0, 0, 0], facing: 0 };
  let deathTimer = 0;
  let runTimeSec = 0;
  let inputTicks = 0; // fixed ticks that consumed an input frame (all but `death` ticks) — harness bookkeeping
  const tmpFeet = new THREE.Vector3();
  const levelId = (HARNESS_MODE && new URLSearchParams(location.search).get('level')) || GAME_RULES.startLevel;
  // Rule log for the playtest harness (cheap; kept in all builds).
  let checkpointLog: number[] = [];
  let deaths = 0;
  let lastDeath: Vec3 | null = null;
  // Harness-only render controls (inert unless the harness API sets them).
  let cameraOverride: { pos: Vec3; target: Vec3 } | null = null;
  let skipRender = false;

  const camRig = new SpringArmCamera(renderer.camera, (o, d, max) => physics.castRay(o, d, max, player?.collider)?.distance ?? null);

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
  const install = (data: LevelData): void => {
    level?.dispose();
    level = buildLevel(data, physics);
    renderer.scene.add(level.root, level.debugRoot);
    renderer.scene.fog = data.fog
      ? new THREE.Fog(data.fog.color ?? RENDER_CONFIG.clearColor, data.fog.near ?? GAME_RULES.fogDefaults.near, data.fog.far ?? GAME_RULES.fogDefaults.far)
      : null;
    const [x, y, z] = data.spawn.pos;
    const facing = data.spawn.facing * DEG2RAD;
    if (!player) {
      player = new Player(physics, { x, y, z }, facing);
      renderer.scene.add(player.mesh);
    }
    const lvl = level;
    player.groundMotion = (c) => lvl.platformDelta(c);
    player.teleport({ x, y, z }, facing);
    respawn = { pos: data.spawn.pos, facing: data.spawn.facing };
    camRig.setYaw(facing);
    camRig.snap(player.feet(tmpFeet));
    input.resetRecording();
    tools.probe.reset();
    runTimeSec = 0;
    checkpointLog = [];
    deaths = 0;
    lastDeath = null;
    clearError();
  };

  const startLevel = async (): Promise<void> => {
    state.transition('loading');
    try {
      install(await loadLevel(levelId));
      state.transition('play');
    } catch (err) {
      showError(err);
      state.transition('menu');
    }
  };

  /** Validate FIRST; an invalid edit never replaces the running level. */
  const hotReload = (data: LevelData): void => {
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
      hotReload(import.meta.env.DEV ? await fetchLevelFresh(id) : await loadLevel(id));
    } catch (err) {
      showError(err);
    }
  };

  if (import.meta.hot) {
    import.meta.hot.on('level:changed', (msg: { id: string; text: string }) => {
      if (msg.id !== level?.data.id) return;
      try {
        hotReload(parseLevel(msg.text, `levels/${msg.id}.json`));
      } catch (err) {
        showError(err);
      }
    });
  }

  // ---------- rules (checkpoints, goal, fall) — run inside the fixed tick ----------
  const die = (f: THREE.Vector3): void => {
    deathTimer = 0;
    deaths++;
    lastDeath = [f.x, f.y, f.z];
    state.transition('death');
  };
  const rulesTick = (dt: number): void => {
    if (!level || !player) return;
    // The world clock (D-004): advances in `play` AND `death`, never in `pause` — frame-stepping
    // while paused runs ticks for debugging but must not move the world's time.
    if (!state.worldRunning()) return;
    runTimeSec += dt;
    if (state.is('death')) {
      // respawn on the fixed tick (was: on the render frame), so the death interval is exact ticks
      deathTimer += dt;
      if (deathTimer >= GAME_RULES.respawnDelaySec) {
        const [x, y, z] = respawn.pos;
        player.teleport({ x, y, z }, respawn.facing * DEG2RAD);
        camRig.snap(player.feet(tmpFeet));
        state.transition('play');
      }
      return;
    }
    const f = player.feet(tmpFeet);
    if (level.fallY !== null && f.y < level.fallY) {
      die(f);
      return;
    }
    // Patrollers (B-12): a hazard is a moving fall plane (Q6) — touching one is death, nothing else.
    // Position is a pure function of the world clock; nothing per-hazard is stored or reset.
    const feet: [number, number, number] = [f.x, f.y, f.z];
    const height = 2 * (TUNING.capsuleHalfHeight + TUNING.capsuleRadius);
    if (level.patrollers.some((p) => capsuleTouches(p, runTimeSec, feet, TUNING.capsuleRadius, height))) {
      die(f);
      return;
    }
    level.data.checkpoints.forEach((c, i) => {
      if (Math.hypot(f.x - c.pos[0], f.z - c.pos[2]) < GAME_RULES.checkpointRadius && Math.abs(f.y - c.pos[1]) < GAME_RULES.goalHeightTolerance) {
        respawn = { pos: c.pos, facing: c.facing ?? respawn.facing };
        if (!checkpointLog.includes(i)) checkpointLog.push(i);
      }
    });
    const g = level.data.goal;
    if (Math.hypot(f.x - g.pos[0], f.z - g.pos[2]) < (g.radius ?? 1) && Math.abs(f.y - g.pos[1]) < GAME_RULES.goalHeightTolerance) {
      state.transition('results');
    }
  };

  // ---------- loop ----------
  const onFixedUpdate = (dt: number): void => {
    if (!level || !player) return;
    profiler.begin('gameplay');
    level.fixedUpdate(dt);
    // The player (and its input stream) only advances in `play`; during `death` the world ticks on
    // without it (D-004). Input is not sampled while dead, so recordings/playback stay aligned.
    if (!state.is('death')) {
      player.fixedUpdate(dt, input.sample(camRig.yaw, !tools.freeCamActive));
      inputTicks++;
    }
    profiler.end('gameplay');
    profiler.begin('physics');
    physics.step(dt);
    profiler.end('physics');
    tools.probe.sample(player.feet(tmpFeet), player.grounded);
    rulesTick(dt);
  };

  const onRender = (alpha: number, frameDt: number): void => {
    profiler.begin('animation');
    // world time for interpolation: between the previous tick (runTimeSec - dt) and the current one
    level?.render(alpha, state.worldRunning() ? runTimeSec - loop.dt + alpha * loop.dt : runTimeSec);
    player?.render(alpha);
    profiler.end('animation');

    if (cameraOverride) {
      renderer.camera.position.set(...cameraOverride.pos);
      renderer.camera.lookAt(...cameraOverride.target);
    } else if (player && !tools.freeCamActive) {
      tmpFeet.copy(player.mesh.position);
      tmpFeet.y -= player.feetOffset();
      camRig.update(frameDt, tmpFeet, state.simulating() ? player.vel : ZERO);
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
      `run time ${runTimeSec.toFixed(d)}s   recorded ${input.record().length} frames${input.isPlayingBack() ? '  [PLAYBACK]' : ''}`,
    ].join('\n');
  });

  // ---------- HUD + UI keys ----------
  const hudText = (s: GameState): string => {
    switch (s) {
      case 'boot': return 'booting…';
      case 'menu': return 'WARRIOR — H2 gym\n\nEnter: start\nclick: mouse look   ~: debug + dev tools';
      case 'loading': return 'loading…';
      case 'play': return '';
      case 'pause': return 'PAUSED\nP / Esc: resume   M: menu';
      case 'death': return 'fell';
      // Q4: win is *arrive*. The results state reads `complete` and nothing else — no time, score,
      // par or rank. Run time stays on the ~ debug overlay, which is dev tooling, not the game.
      case 'results': return 'COMPLETE\nEnter: menu';
    }
  };
  state.onChange((to) => {
    hud.textContent = hudText(to);
  });

  window.addEventListener('keydown', (e) => {
    const k = GAME_RULES.keys;
    if (e.code === k.start && state.is('menu')) void startLevel();
    else if (e.code === k.start && state.is('results')) state.transition('menu');
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
      checkpoints: [...checkpointLog],
      deaths,
      lastDeath,
      runTime: runTimeSec,
      inputTicks,
    });
    // Fixed simulated clock: exactly one tick per frame, frameDt is always loop.dt, alpha 0.
    // Mirrors GameLoop.frame's gate — ticks while the world runs (play, death: D-004), none in pause/menu.
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
      playback: (frames) => input.playback(frames),
      isPlayingBack: () => input.isPlayingBack(),
      record: () => input.record(),
      snapshot,
      level: () => level?.data ?? null,
      tuning: TUNING,
      rules: { respawnDelaySec: GAME_RULES.respawnDelaySec, fixedDt: loop.dt },
      startJson: async (text) => {
        // Harness-only: run a FIXTURE level (tools/harness/fixtures/) that is not in levels/.
        // Same validation and preload path as startLevel; only the source differs.
        state.transition('loading');
        try {
          install(parseLevel(text, 'harness fixture'));
          state.transition('play');
        } catch (err) {
          showError(err);
          state.transition('menu');
        }
        return { ok: state.is('play'), error: errorBanner.style.display === 'block' ? errorBanner.textContent : null };
      },
      teleportPlayer: (pos) => {
        player?.teleport({ x: pos[0], y: pos[1], z: pos[2] });
      },
      patrollers: (t) => (level?.patrollers ?? []).map((p) => patrolPosition(p, t)),
      rendererInfo: () => {
        const info = renderer.renderer.info;
        return { calls: info.render.calls, triangles: info.render.triangles, geometries: info.memory.geometries, textures: info.memory.textures };
      },
      setCamera: (pos, target) => {
        cameraOverride = { pos, target };
      },
      releaseCamera: () => {
        cameraOverride = null;
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
