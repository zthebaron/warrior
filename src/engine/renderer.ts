// WebGLRenderer setup: ACES filmic tone mapping, sRGB output, resize, context loss, DPR cap.

import * as THREE from 'three';

import { RENDER_CONFIG } from './render-config';

export { RENDER_CONFIG };

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private contextLost = false;

  constructor(private readonly host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = RENDER_CONFIG.toneMappingExposure;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(RENDER_CONFIG.clearColor);
    this.scene.background = new THREE.Color(RENDER_CONFIG.clearColor);
    host.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(RENDER_CONFIG.fovDeg, 1, RENDER_CONFIG.near, RENDER_CONFIG.far);

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
  }

  render(): void {
    if (this.contextLost) return;
    this.renderer.render(this.scene, this.camera);
  }
}
