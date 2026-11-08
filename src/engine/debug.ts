// Debug overlay (toggle with `~`): fps, per-system frame times vs budget, renderer counters,
// texture memory, player pos/vel, Rapier collider wireframes.
// Knows nothing about the game: callers register text providers.

import * as THREE from 'three';
import type { Physics } from './physics';

export const DEBUG_CONFIG = {
  toggleKey: 'Backquote',
  budgetsMs: { gameplay: 2.0, physics: 2.0, animation: 2.0, render: 8.0, audio: 0.6 },
  timingSmoothing: 0.1,  // EMA factor for per-system times
  refreshEveryFrames: 10, // overlay text refresh cadence
  bytesPerTexel: 4,
  mipmapFactor: 4 / 3,    // full mip chain adds ~1/3
  bytesPerMB: 1024 * 1024,
  decimals: 2,
};

export type SystemName = keyof typeof DEBUG_CONFIG.budgetsMs;
const SYSTEMS = Object.keys(DEBUG_CONFIG.budgetsMs) as SystemName[];

/** Per-system frame timer. Accumulates within a frame, smooths across frames. */
export class Profiler {
  private readonly frameMs: Record<SystemName, number> = { gameplay: 0, physics: 0, animation: 0, render: 0, audio: 0 };
  readonly avgMs: Record<SystemName, number> = { gameplay: 0, physics: 0, animation: 0, render: 0, audio: 0 };
  private readonly starts: Partial<Record<SystemName, number>> = {};
  /** Systems that do not exist yet are reported as such, not as a fake 0. */
  readonly absent = new Set<SystemName>();

  begin(s: SystemName): void {
    this.starts[s] = performance.now();
  }

  end(s: SystemName): void {
    const t0 = this.starts[s];
    if (t0 !== undefined) this.frameMs[s] += performance.now() - t0;
  }

  endFrame(): void {
    for (const s of SYSTEMS) {
      this.avgMs[s] += (this.frameMs[s] - this.avgMs[s]) * DEBUG_CONFIG.timingSmoothing;
      this.frameMs[s] = 0;
    }
  }
}

export type DebugTextProvider = () => string;

export class DebugOverlay {
  visible = false;
  private readonly el: HTMLDivElement;
  private readonly text: HTMLPreElement;
  readonly panel: HTMLDivElement; // tools mount their UI here
  private readonly providers: DebugTextProvider[] = [];
  private readonly lines: THREE.LineSegments;
  private frames = 0;
  private fpsFrames = 0;
  private fpsTime = 0;
  private fps = 0;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly physics: Physics,
    readonly profiler: Profiler,
  ) {
    this.el = document.createElement('div');
    this.el.style.cssText =
      'position:fixed;top:8px;left:8px;z-index:10;display:none;max-height:calc(100vh - 16px);overflow:auto;' +
      'background:rgba(0,0,0,.72);color:#cfe;font:12px/1.35 ui-monospace,monospace;padding:8px 10px;border-radius:4px;';
    this.text = document.createElement('pre');
    this.text.style.margin = '0';
    this.panel = document.createElement('div');
    this.el.append(this.text, this.panel);
    document.body.appendChild(this.el);

    const geom = new THREE.BufferGeometry();
    this.lines = new THREE.LineSegments(geom, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false }));
    this.lines.frustumCulled = false;
    this.lines.visible = false;
    this.lines.renderOrder = Number.MAX_SAFE_INTEGER;
    scene.add(this.lines);

    window.addEventListener('keydown', (e) => {
      if (e.code === DEBUG_CONFIG.toggleKey) this.toggle();
    });
  }

  addProvider(p: DebugTextProvider): void {
    this.providers.push(p);
  }

  toggle(): void {
    this.visible = !this.visible;
    this.el.style.display = this.visible ? 'block' : 'none';
    this.lines.visible = this.visible;
    if (this.visible && document.pointerLockElement) document.exitPointerLock();
  }

  /** Call once per render frame, after rendering. */
  update(frameDt: number): void {
    this.fpsFrames++;
    this.fpsTime += frameDt;
    if (this.fpsTime >= 1) {
      this.fps = this.fpsFrames / this.fpsTime;
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }
    if (!this.visible) return;

    const { vertices, colors } = this.physics.debugLines();
    const g = this.lines.geometry;
    g.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 4));

    if (this.frames++ % DEBUG_CONFIG.refreshEveryFrames !== 0) return;
    const d = DEBUG_CONFIG.decimals;
    const info = this.renderer.info;
    const rows: string[] = [`fps            ${this.fps.toFixed(1)}`, 'system      ms / budget'];
    for (const s of SYSTEMS) {
      const budget = DEBUG_CONFIG.budgetsMs[s];
      if (this.profiler.absent.has(s)) {
        rows.push(`${s.padEnd(10)} n/a (no system yet) / ${budget}`);
        continue;
      }
      const ms = this.profiler.avgMs[s];
      rows.push(`${s.padEnd(10)} ${ms.toFixed(d).padStart(6)} / ${budget}${ms > budget ? '  OVER' : ''}`);
    }
    rows.push(
      `draw calls     ${info.render.calls}`,
      `triangles      ${info.render.triangles}`,
      `geometries     ${info.memory.geometries}`,
      `textures       ${info.memory.textures}  (~${this.textureMB().toFixed(d)} MB)`,
    );
    for (const p of this.providers) rows.push(p());
    this.text.textContent = rows.join('\n');
  }

  private textureMB(): number {
    const seen = new Set<THREE.Texture>();
    let bytes = 0;
    this.scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const mats: THREE.Material[] = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        for (const v of Object.values(m)) {
          if (!(v instanceof THREE.Texture) || seen.has(v)) continue;
          seen.add(v);
          const img: unknown = v.image;
          if (img && typeof img === 'object' && 'width' in img && 'height' in img) {
            const w = Number(img.width);
            const h = Number(img.height);
            const mip = v.generateMipmaps ? DEBUG_CONFIG.mipmapFactor : 1;
            bytes += w * h * DEBUG_CONFIG.bytesPerTexel * mip;
          }
        }
      }
    });
    return bytes / DEBUG_CONFIG.bytesPerMB;
  }
}
