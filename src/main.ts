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

declare global {
  interface Window {
    __DEV__?: DevHook;
  }
}

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
  const tmpFeet = new THREE.Vector3();

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
    clearError();
  };

  const startLevel = async (): Promise<void> => {
    state.transition('loading');
    try {
      install(await loadLevel(GAME_RULES.startLevel));
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
    const id = level?.data.id ?? GAME_RULES.startLevel;
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
  const rulesTick = (dt: number): void => {
    if (!level || !player) return;
    // Frame-stepping while paused runs ticks too; rule transitions only fire from `play`
    // (a stepped fall is picked up on the first real tick after resuming).
    if (!state.is('play')) return;
    runTimeSec += dt;
    const f = player.feet(tmpFeet);
    if (level.fallY !== null && f.y < level.fallY) {
      deathTimer = 0;
      state.transition('death');
      return;
    }
    for (const c of level.data.checkpoints) {
      if (Math.hypot(f.x - c.pos[0], f.z - c.pos[2]) < GAME_RULES.checkpointRadius && Math.abs(f.y - c.pos[1]) < GAME_RULES.goalHeightTolerance) {
        respawn = { pos: c.pos, facing: c.facing ?? respawn.facing };
      }
    }
    const g = level.data.goal;
    if (Math.hypot(f.x - g.pos[0], f.z - g.pos[2]) < (g.radius ?? 1) && Math.abs(f.y - g.pos[1]) < GAME_RULES.goalHeightTolerance) {
      state.transition('results');
    }
  };

  // ---------- loop ----------
  const onFixedUpdate = (dt: number): void => {
    if (!level || !player) return;
    profiler.begin('gameplay');
    const frame = input.sample(camRig.yaw, !tools.freeCamActive);
    level.fixedUpdate(dt);
    player.fixedUpdate(dt, frame);
    profiler.end('gameplay');
    profiler.begin('physics');
    physics.step(dt);
    profiler.end('physics');
    tools.probe.sample(player.feet(tmpFeet), player.grounded);
    rulesTick(dt);
  };

  const onRender = (alpha: number, frameDt: number): void => {
    if (state.is('death') && player) {
      deathTimer += frameDt;
      if (deathTimer >= GAME_RULES.respawnDelaySec) {
        const [x, y, z] = respawn.pos;
        player.teleport({ x, y, z }, respawn.facing * DEG2RAD);
        camRig.snap(player.feet(tmpFeet));
        state.transition('play');
      }
    }
    profiler.begin('animation');
    level?.render(alpha);
    player?.render(alpha);
    profiler.end('animation');

    if (player && !tools.freeCamActive) {
      tmpFeet.copy(player.mesh.position);
      tmpFeet.y -= player.feetOffset();
      camRig.update(frameDt, tmpFeet, state.simulating() ? player.vel : ZERO);
    }
    tools.update(frameDt);
    if (level) level.debugRoot.visible = overlay.visible;

    profiler.begin('render');
    renderer.render();
    profiler.end('render');
    overlay.update(frameDt);
    profiler.endFrame();
  };

  const loop = new GameLoop({ onFixedUpdate, onRender, shouldSimulate: () => state.simulating() });

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
      case 'results': return `GOAL — ${runTimeSec.toFixed(GAME_RULES.decimals)}s (par ${level?.data.par_time ?? '?'}s)\nEnter: menu`;
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

  state.transition('menu');
  loop.start();
}

boot().catch((err: unknown) => {
  const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
  console.error('[boot] FAILED', msg);
  const hud = document.getElementById('hud');
  if (hud) hud.textContent = `BOOT FAILED\n${msg}`;
});
