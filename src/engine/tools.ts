// Dev tools. Active only while the debug overlay (`~`) is open.
//   C  free camera (WASD fly, Q/E down/up, Shift fast, mouse look while pointer-locked)
//   .  frame step: pauses if playing, then advances exactly one fixed tick
//   T  teleport player to cursor (screen centre while pointer-locked)
//   R  hot-reload the current level (also automatic on file save in dev)
//   TUNING editor panel: edit any registered tunable live; "copy" dumps JSON to write back.
// Plus a jump probe that measures every airborne segment (used to measure max gaps).

import * as THREE from 'three';
import type { DebugOverlay } from './debug';
import type { GameLoop } from './loop';
import type { StateMachine } from './state';

export const TOOLS_CONFIG = {
  keys: { freeCam: 'KeyC', step: 'Period', teleport: 'KeyT', reload: 'KeyR' },
  freeCam: { speed: 15, fastMultiplier: 4, mouseSensitivity: 0.0025, pitchLimitDeg: 89 },
  probeHistory: 6,
  tuningInputStep: 0.01,
  decimals: 2,
};

const DEG2RAD = Math.PI / 180;

export interface Tunable {
  name: string;
  values: Record<string, number>;
}

export interface ToolHost {
  overlay: DebugOverlay;
  state: StateMachine;
  loop: GameLoop;
  camera: THREE.PerspectiveCamera;
  canvas: HTMLCanvasElement;
  /** Ray-pick the level from normalised device coords; returns a world point or null. */
  pick(ndc: THREE.Vector2): THREE.Vector3 | null;
  teleport(feet: THREE.Vector3): void;
  reloadLevel(): void;
  tunables: Tunable[];
}

export interface AirSegment {
  horizontal: number; // takeoff -> landing horizontal distance (m)
  peakRise: number;   // highest feet height above takeoff (m)
  dy: number;         // landing height - takeoff height (m)
  ticks: number;      // airborne ticks
}

/** Measures every airborne segment from last-grounded tick to first-grounded tick. */
export class JumpProbe {
  readonly history: AirSegment[] = [];
  private airborne = false;
  private readonly takeoff = new THREE.Vector3();
  private peakY = 0;
  private ticks = 0;

  /** Call once per fixed tick with feet position and grounded flag. */
  sample(feet: THREE.Vector3, grounded: boolean): void {
    if (grounded && !this.airborne) {
      this.takeoff.copy(feet); // keep updating: takeoff = last grounded tick
      return;
    }
    if (!grounded) {
      if (!this.airborne) {
        this.airborne = true;
        this.peakY = feet.y;
        this.ticks = 0;
      }
      this.peakY = Math.max(this.peakY, feet.y);
      this.ticks++;
      return;
    }
    this.airborne = false;
    this.history.unshift({
      horizontal: Math.hypot(feet.x - this.takeoff.x, feet.z - this.takeoff.z),
      peakRise: this.peakY - this.takeoff.y,
      dy: feet.y - this.takeoff.y,
      ticks: this.ticks,
    });
    this.history.length = Math.min(this.history.length, TOOLS_CONFIG.probeHistory);
    this.takeoff.copy(feet);
  }

  reset(): void {
    this.history.length = 0;
    this.airborne = false;
  }
}

export class DevTools {
  freeCamActive = false;
  readonly probe = new JumpProbe();
  private readonly keys = new Set<string>();
  private readonly mouse = new THREE.Vector2();
  private freeYaw = 0;
  private freePitch = 0;
  private readonly tmp = new THREE.Vector3();

  constructor(private readonly host: ToolHost) {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (!host.overlay.visible) return;
      this.onKey(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('mousemove', (e) => {
      this.mouse.set(e.clientX, e.clientY);
    });
    this.buildTuningPanel();
    host.overlay.addProvider(() => this.statusText());
  }

  private onKey(code: string): void {
    const k = TOOLS_CONFIG.keys;
    const { state, loop } = this.host;
    if (code === k.freeCam) this.toggleFreeCam();
    else if (code === k.step) {
      if (state.is('play')) state.transition('pause');
      if (state.is('pause')) loop.stepOnce();
    } else if (code === k.teleport) this.teleportToCursor();
    else if (code === k.reload) this.host.reloadLevel();
  }

  private toggleFreeCam(): void {
    this.freeCamActive = !this.freeCamActive;
    if (this.freeCamActive) {
      const e = new THREE.Euler().setFromQuaternion(this.host.camera.quaternion, 'YXZ');
      this.freeYaw = e.y;
      this.freePitch = e.x;
    }
  }

  /** Mouse look for the free camera (main routes pointer-lock movement here when active). */
  addFreeLook(dx: number, dy: number): void {
    const f = TOOLS_CONFIG.freeCam;
    this.freeYaw -= dx * f.mouseSensitivity;
    const lim = f.pitchLimitDeg * DEG2RAD;
    this.freePitch = THREE.MathUtils.clamp(this.freePitch - dy * f.mouseSensitivity, -lim, lim);
  }

  /** Per render frame (wall-clock dt): free camera keeps working while paused. */
  update(frameDt: number): void {
    if (!this.freeCamActive) return;
    const f = TOOLS_CONFIG.freeCam;
    const cam = this.host.camera;
    cam.quaternion.setFromEuler(new THREE.Euler(this.freePitch, this.freeYaw, 0, 'YXZ'));
    const move = this.tmp.set(
      (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0),
      (this.keys.has('KeyE') ? 1 : 0) - (this.keys.has('KeyQ') ? 1 : 0),
      (this.keys.has('KeyS') ? 1 : 0) - (this.keys.has('KeyW') ? 1 : 0),
    );
    if (move.lengthSq() === 0) return;
    const speed = f.speed * (this.keys.has('ShiftLeft') ? f.fastMultiplier : 1);
    move.normalize().applyQuaternion(cam.quaternion).multiplyScalar(speed * frameDt);
    cam.position.add(move);
  }

  private teleportToCursor(): void {
    const c = this.host.canvas.getBoundingClientRect();
    const ndc = document.pointerLockElement
      ? new THREE.Vector2(0, 0)
      : new THREE.Vector2(((this.mouse.x - c.left) / c.width) * 2 - 1, -((this.mouse.y - c.top) / c.height) * 2 + 1);
    const hit = this.host.pick(ndc);
    if (hit) this.host.teleport(hit);
    else console.warn('[tools] teleport: nothing under cursor');
  }

  private statusText(): string {
    const d = TOOLS_CONFIG.decimals;
    const rows = [
      `-- tools: [C] freecam ${this.freeCamActive ? 'ON' : 'off'}  [.] step  [T] teleport  [R] reload`,
      `state ${this.host.state.get()}   tick ${this.host.loop.tickCount}`,
    ];
    for (const s of this.probe.history) {
      rows.push(`air: horiz ${s.horizontal.toFixed(d)}  peak +${s.peakRise.toFixed(d)}  dy ${s.dy.toFixed(d)}  ${s.ticks}t`);
    }
    return rows.join('\n');
  }

  private buildTuningPanel(): void {
    const panel = this.host.overlay.panel;
    for (const t of this.host.tunables) {
      const box = document.createElement('details');
      const sum = document.createElement('summary');
      sum.textContent = `TUNING: ${t.name}`;
      sum.style.cursor = 'pointer';
      box.appendChild(sum);
      for (const key of Object.keys(t.values)) {
        const row = document.createElement('label');
        row.style.cssText = 'display:flex;justify-content:space-between;gap:8px;';
        row.textContent = key;
        const input = document.createElement('input');
        input.type = 'number';
        input.step = String(TOOLS_CONFIG.tuningInputStep);
        input.value = String(t.values[key]);
        input.style.width = '80px';
        input.addEventListener('keydown', (e) => e.stopPropagation()); // typing must not drive the game
        input.addEventListener('change', () => {
          const v = Number(input.value);
          if (Number.isFinite(v)) t.values[key] = v;
          else input.value = String(t.values[key]);
        });
        row.appendChild(input);
        box.appendChild(row);
      }
      const copy = document.createElement('button');
      copy.textContent = 'copy JSON';
      copy.addEventListener('click', () => {
        const json = JSON.stringify(t.values, null, 2);
        console.log(`[tools] ${t.name}\n${json}`);
        void navigator.clipboard?.writeText(json).catch((err: unknown) => console.warn('[tools] clipboard write failed (JSON is in the console)', err));
      });
      box.appendChild(copy);
      panel.appendChild(box);
    }
  }
}
