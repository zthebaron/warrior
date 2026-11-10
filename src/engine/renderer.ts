// WebGLRenderer setup: sRGB output, the STYLE §6 post pass (D-018), resize, context loss, DPR cap.
// Tone mapping stays set for the direct asset probes; the scene itself renders into the post target, where
// three applies none, so the palette's bytes arrive exact.

import * as THREE from 'three';

import { RENDER_CONFIG } from './render-config';
import { InkPost } from './ink-post';
import { ramp } from './palette';

export { RENDER_CONFIG };

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  /** STYLE §6 (D-018): every frame goes through it. */
  readonly post: InkPost;
  private contextLost = false;

  constructor(private readonly host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = RENDER_CONFIG.toneMappingExposure;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(ramp('paper-cream')); // D-018: the paper is the sky (STYLE §2, §5)
    this.scene.background = new THREE.Color(ramp('paper-cream'));
    host.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(RENDER_CONFIG.fovDeg, 1, RENDER_CONFIG.near, RENDER_CONFIG.far);
    this.post = new InkPost(this.renderer);

    const canvas = this.renderer.domElement;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault(); // required, or the browser will never restore the context
      this.contextLost = true;
      console.error('[renderer] WebGL context LOST — rendering suspended until restored');
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false; // three re-initialises its GL state on restore
      console.warn('[renderer] WebGL context restored');
    });

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  isContextLost(): boolean {
    return this.contextLost;
  }

  resize(): void {
    const w = this.host.clientWidth || window.innerWidth;
    const h = this.host.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, RENDER_CONFIG.maxPixelRatio));
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.post.setSize(size.x, size.y);
  }

  render(): void {
    if (this.contextLost) return;
    // renderer.info for the WHOLE frame: the scene draw and the §6 pass, counted together (counters stage)
    const info = this.renderer.info;
    info.reset();
    info.autoReset = false;
    this.post.render(this.scene, this.camera);
    info.autoReset = true;
  }
}
