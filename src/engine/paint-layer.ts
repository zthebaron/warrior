// The paint layer (D-020): painted things are drawn AFTER the §6 ink pass, straight to the canvas, so their
// texture is not snapped to the eight-step ramp. The ink pass (src/engine/ink-post.ts) is untouched and still
// draws everything else; this file does not import the renderer and edits neither of those two files.
//
// A painted mesh sits on three.js layer PAINT_LAYER, in the SAME scene graph as the level (so it is audited,
// disposed and culled with it). The ink pass's camera sees layer 0 only, so it never draws one. Then, per frame:
//
//   1. the canvas depth buffer is cleared and the ink geometry is drawn into it, depth only, so that
//   2. the painted meshes, drawn with the depth test on, are hidden wherever ink geometry is nearer.
//
// Nothing here moves: painted planes are fixed in the world, and parallax between them is perspective (Q2a).
// "Light ink post" lives in the painted material itself: it is unlit (§1) and carries the same static, seeded
// paper grain as the ink pass (§6), hashed from the pixel, so paper under a wash and paper beside it match.
//
// A level with nothing painted pays nothing: render() returns before touching the GL state.

import * as THREE from 'three';

import { INK_POST } from './ink-post';

/** three.js layer index of painted meshes. An index, not a tunable: layer 0 is the ink pass. */
export const PAINT_LAYER = 1;

const GRAIN_FN = /* glsl */ `
float paintGrain(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + ${INK_POST.grainSeed.toFixed(1)}) * 43758.5453); }
void main() {`;
// After three's own colour-space conversion, so the grain is added in the same sRGB byte space as the ink pass.
const GRAIN_APPLY = /* glsl */ `#include <colorspace_fragment>
  gl_FragColor.rgb += (paintGrain(floor(gl_FragCoord.xy)) - 0.5) * 2.0 * ${INK_POST.grainAmp.toFixed(6)};`;

export interface PaintMaterialOptions {
  map?: THREE.Texture;
  color?: number;
  opacity?: number;
  /** ink laid over paper: blended, never written to depth (a wash has no surface) */
  wash?: boolean;
  side?: THREE.Side;
}

/** An unlit material for a painted mesh. Use it for everything on PAINT_LAYER. */
export function paintMaterial(o: PaintMaterialOptions): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({
    map: o.map ?? null,
    color: o.color ?? 0xffffff,
    opacity: o.opacity ?? 1,
    transparent: !!o.wash,
    depthWrite: !o.wash,
    side: o.side ?? THREE.FrontSide,
    toneMapped: false, // the canvas is tone mapped (renderer.ts); painted values must arrive as authored
  });
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('void main() {', GRAIN_FN).replace('#include <colorspace_fragment>', GRAIN_APPLY);
  };
  m.customProgramCacheKey = () => 'paint';
  return m;
}

/**
 * D-021: nothing painted may hide the player. A painted card has no surface a player can touch, so the figure
 * can stand where a card is between it and the camera (the rock of an ink level collides and is not drawn, and
 * its ledges can be climbed). The figure is therefore drawn LAST on the paint layer, after every card: still
 * solid, still writing depth, and still hidden by ink geometry in front of it (the depth test is against the
 * ink pass's depth, which cards do not write). It is the draw order of a transparent thing with no blending.
 */
export function paintLast(mesh: THREE.Mesh): void {
  const m = mesh.material as THREE.Material;
  m.transparent = true;            // sorts it after the opaque painted things, with the cards
  m.blending = THREE.NoBlending;   // and draws it solid: its texture's alpha is not a cut
  m.depthWrite = true;
  mesh.renderOrder = PAINT_LAST;
}
/** renderOrder of what is drawn last on the paint layer. An order, not a tunable: above every card's. */
export const PAINT_LAST = 1e9;

/** Put a mesh (and its children) on the paint layer. */
export function paint<T extends THREE.Object3D>(o: T): T {
  o.traverse((c) => c.layers.set(PAINT_LAYER));
  return o;
}

export class PaintLayer {
  /** Harness: false draws the ink pass alone, which is the frame the D-018/D-019 gate judges. */
  enabled = true;
  private painted = 0;
  private backdrop = 0;
  private readonly depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false });

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
  ) {}

  /** Count the painted meshes in the scene. Call when the scene's contents change (a level is installed). */
  refresh(): number {
    let n = 0, b = 0;
    this.scene.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh || !o.layers.isEnabled(PAINT_LAYER)) return;
      n++;
      if (o.name.startsWith('backdrop:')) b++;
    });
    this.painted = n;
    this.backdrop = b;
    return n;
  }

  /** Painted meshes in the scene at the last refresh() (backdrop: how many of them are the far field), and whether they are being drawn. */
  status(): { painted: number; backdrop: number; drawn: boolean } {
    return { painted: this.painted, backdrop: this.backdrop, drawn: this.enabled && this.painted > 0 };
  }

  /** Call right after the ink pass has drawn the frame to the canvas. */
  render(): void {
    if (!this.enabled || this.painted === 0) return;
    const r = this.renderer;
    const info = r.info;
    const autoReset = info.autoReset;
    const autoClear = r.autoClear;
    const background = this.scene.background;
    info.autoReset = false; // the frame's counters keep the ink pass and gain these two draws (counters stage)
    r.autoClear = false;    // the canvas holds the ink pass: keep it
    this.scene.background = null; // a Color background forces a clear even with autoClear off
    r.setRenderTarget(null);
    r.clearDepth();

    this.scene.overrideMaterial = this.depthOnly;
    r.render(this.scene, this.camera); // layer 0: the ink geometry, depth only
    this.scene.overrideMaterial = null;

    this.camera.layers.set(PAINT_LAYER);
    r.render(this.scene, this.camera);
    this.camera.layers.set(0);

    this.scene.background = background;
    r.autoClear = autoClear;
    info.autoReset = autoReset;
  }
}
