// STYLE-BIBLE §6 as a post pass (D-018). The scene renders unlit flat ramp fills (§1) into a target with a
// depth texture; one full-screen pass then applies, in order:
//
//   value_compression  §3/§6: each pixel's value step is remapped by its DEPTH BAND (distance from the
//                      camera: near < 25u, mid 25-80u, far 80u+), so a band holds its range wherever the
//                      camera walks (OQ-067 item 2 is why this cannot be baked into assets). Every non-accent,
//                      non-robe pixel is snapped to a §2 ramp step on the way: the frame stays on the palette.
//                        near: unchanged (full ramp)
//                        mid:  i <= 2 ? i : 2 + floor(3(i-2)/5)   never darker than it was, never darker
//                              than ink-grey: ink-black -> ink-grey, ink-deep -> wash-mid, the lights stay
//                        far:  paper stays paper, everything else ONE flat mist-pale: silhouette only
//                      Atmosphere only ever LIGHTENS. §3's literal mid floor (wash-light) would turn the
//                      paper cloud sea and paper path tops grey between 25 and 80u, a dark ring the seed
//                      never shows (D-018; recorded, not quietly departed from).
//   ink_edge           §6: a dark outline on depth AND normal discontinuity, from ONE signal: the screen-space
//                      Laplacian of 1/z. 1/z is linear across a plane in screen space, so its Laplacian is
//                      zero on every face and non-zero only at a silhouette or a crease; the negative lobe is
//                      the NEARER/convex side, so the line sits on the form, never on the sky behind it.
//                      Weight scales DOWN with distance (§3): near 2px ink-black, mid 1px ink-grey, far none.
//   paper_grain        §6: static grain over the whole frame, hashed from the pixel coordinate and a constant
//                      seed. It never scrolls or animates (that is film grain, §9 item 7), so goldens hold.
//
// Forbidden here (§6), and absent: bloom, vignette, hue grading, motion blur, screen-space reflection. The
// harness `post` stage asserts both: that exactly these three passes run, and, from the pixels, that each one
// did its job (tools/harness/post.ts). Remove one from SECTION6_PASSES and that stage goes red.
//
// Accent pixels (chroma above INK_POST.accentChroma: only the torii carry chroma) and the robe (§2's one other
// named colour) are not value-remapped: the accent's hue is not the post pass's to change. Grain and the ink
// edge still cover them.

import * as THREE from 'three';

import { RAMP, ROBE } from './palette';

export const SECTION6_PASSES = ['value_compression', 'ink_edge', 'paper_grain'] as const;
export type Section6Pass = (typeof SECTION6_PASSES)[number];

/** Every number here is in MEASUREMENTS.md "D-018 post constants", with its basis. */
export const INK_POST = {
  nearBandM: 25,            // STYLE §3 table
  midBandM: 80,             // STYLE §3 table
  edgeLaplacian: 0.002,     // |lap(1/z)| / (1/z) above which a pixel is a silhouette/crease
  nearEdgePx: 2,
  midEdgePx: 1,
  grainAmp: 3 / 255,        // < ACCENT_AREA's 6/255 match tolerance, so grain never hides a gate
  grainSeed: 20261109,      // constant: grain is static and deterministic
  accentChroma: 0.2,        // max-min of sRGB channels; the ramp's largest is 0.047, every accent candidate > 0.5
  robeTol: 4 / 255,
} as const;

const hex3 = (v: number): THREE.Vector3 => new THREE.Vector3(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255);

const CHUNK: Record<Section6Pass, string> = {
  value_compression: /* glsl */ `
    if (!keepHue) {
      int i = nearestStep(c);
      int j = band == 0 ? i : (band == 1 ? (i <= 2 ? i : 2 + (3 * (i - 2)) / 5) : (i == 0 ? 0 : 1));
      c = uRamp[j];
    }`,
  ink_edge: /* glsl */ `
    if (band < 2) {
      bool e = edgeAt(1.0) || (band == 0 && edgeAt(${INK_POST.nearEdgePx.toFixed(1)}));
      if (e) c = band == 0 ? uRamp[7] : uRamp[5];
    }`,
  paper_grain: /* glsl */ `
    c += (hash(floor(gl_FragCoord.xy)) - 0.5) * 2.0 * ${INK_POST.grainAmp.toFixed(6)};`,
};

function fragmentShader(passes: readonly Section6Pass[]): string {
  return /* glsl */ `
    precision highp float;
    uniform sampler2D tColor;
    uniform sampler2D tDepth;
    uniform float uNear;
    uniform float uFar;
    uniform vec2 uTexel;
    uniform vec2 uProj;      // (tan(fov/2) * aspect, tan(fov/2)): ndc -> view ray
    uniform vec3 uRamp[8];   // sRGB, lightest first
    uniform vec3 uRobe;
    in vec2 vUv;
    out vec4 outColor;

    vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
    float invZ(vec2 uv) { float d = texture(tDepth, uv).x; return (uFar - d * (uFar - uNear)) / (uNear * uFar); }
    float distAt(vec2 uv) { vec2 ndc = uv * 2.0 - 1.0; return length(vec3(ndc * uProj, 1.0)) / invZ(uv); }
    int nearestStep(vec3 c) {
      float v = (c.r + c.g + c.b) / 3.0; int best = 0; float bd = 9.0;
      for (int k = 0; k < 8; k++) { vec3 r = uRamp[k]; float d = abs((r.r + r.g + r.b) / 3.0 - v); if (d < bd) { bd = d; best = k; } }
      return best;
    }
    float iz0;
    bool edgeAt(float px) {
      vec2 o[4]; o[0] = vec2(uTexel.x, 0.0); o[1] = vec2(0.0, uTexel.y); o[2] = uTexel; o[3] = vec2(uTexel.x, -uTexel.y);
      for (int k = 0; k < 4; k++) {
        float lap = (invZ(vUv + o[k] * px) + invZ(vUv - o[k] * px) - 2.0 * iz0) / iz0;
        if (lap < -${INK_POST.edgeLaplacian.toFixed(6)}) return true;
      }
      return false;
    }
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + ${INK_POST.grainSeed.toFixed(1)}) * 43758.5453); }

    void main() {
      vec3 c = toSRGB(texture(tColor, vUv).rgb);
      iz0 = invZ(vUv);
      float dist = distAt(vUv);
      int band = dist < ${INK_POST.nearBandM.toFixed(1)} ? 0 : (dist < ${INK_POST.midBandM.toFixed(1)} ? 1 : 2);
      float chroma = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
      bool keepHue = chroma > ${INK_POST.accentChroma.toFixed(4)} || all(lessThan(abs(c - uRobe), vec3(${INK_POST.robeTol.toFixed(6)})));
      ${passes.map((p) => `// ---- ${p}\n${CHUNK[p]}`).join('\n')}
      outColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`;
}

const VERT = /* glsl */ `out vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// harness only: distance from the camera per pixel, packed 24-bit fixed point of dist / far into RGB
const DIST_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D tDepth; uniform float uNear; uniform float uFar; uniform vec2 uProj; in vec2 vUv; out vec4 outColor;
  void main() {
    float d = texture(tDepth, vUv).x;
    float iz = (uFar - d * (uFar - uNear)) / (uNear * uFar);
    vec2 ndc = vUv * 2.0 - 1.0;
    float x = floor(clamp(length(vec3(ndc * uProj, 1.0)) / iz / uFar, 0.0, 1.0) * 16777215.0);
    outColor = vec4(floor(x / 65536.0), mod(floor(x / 256.0), 256.0), mod(x, 256.0), 255.0) / 255.0;
  }`;

export class InkPost {
  readonly passes: readonly Section6Pass[];
  private readonly target: THREE.WebGLRenderTarget;
  private readonly quadScene = new THREE.Scene();
  private readonly quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material: THREE.ShaderMaterial;
  private readonly distMaterial: THREE.ShaderMaterial;
  private readonly quad: THREE.Mesh;

  constructor(private readonly renderer: THREE.WebGLRenderer, passes: readonly Section6Pass[] = SECTION6_PASSES) {
    this.passes = passes;
    const depth = new THREE.DepthTexture(1, 1, THREE.FloatType);
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.UnsignedByteType,
      colorSpace: THREE.SRGBColorSpace, // the target stores the palette's own sRGB bytes
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthTexture: depth,
      depthBuffer: true,
    });
    const common = {
      tDepth: { value: depth },
      uNear: { value: 0.1 },
      uFar: { value: 1 },
      uProj: { value: new THREE.Vector2(1, 1) },
    };
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        ...common,
        tColor: { value: this.target.texture },
        uTexel: { value: new THREE.Vector2(1, 1) },
        uRamp: { value: RAMP.map((r) => hex3(r.value)) },
        uRobe: { value: hex3(ROBE) },
      },
      vertexShader: VERT,
      fragmentShader: fragmentShader(passes),
      depthTest: false,
      depthWrite: false,
    });
    this.distMaterial = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: common, vertexShader: VERT, fragmentShader: DIST_FRAG, depthTest: false, depthWrite: false });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  setSize(width: number, height: number): void {
    this.target.setSize(width, height);
    (this.material.uniforms['uTexel']!.value as THREE.Vector2).set(1 / width, 1 / height);
  }

  private syncCamera(camera: THREE.PerspectiveCamera): void {
    const t = Math.tan((camera.fov * Math.PI) / 360);
    for (const m of [this.material, this.distMaterial]) {
      m.uniforms['uNear']!.value = camera.near;
      m.uniforms['uFar']!.value = camera.far;
      (m.uniforms['uProj']!.value as THREE.Vector2).set(t * camera.aspect, t);
    }
  }

  /** Scene -> target, then the §6 pass to the canvas. renderer.info counts BOTH (the caller resets it). */
  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    this.syncCamera(camera);
    const r = this.renderer;
    r.setRenderTarget(this.target);
    r.render(scene, camera);
    r.setRenderTarget(null);
    this.quad.material = this.material;
    r.render(this.quadScene, this.quadCam);
  }

  /** Harness only: per-pixel distance (u) of the LAST rendered frame, top row first, as a Float32Array. */
  readDistance(camera: THREE.PerspectiveCamera): { width: number; height: number; dist: Float32Array } {
    const { width, height } = this.target;
    const rt = new THREE.WebGLRenderTarget(width, height, { type: THREE.UnsignedByteType, depthBuffer: false });
    this.syncCamera(camera);
    this.quad.material = this.distMaterial;
    const r = this.renderer;
    const autoReset = r.info.autoReset;
    r.info.autoReset = false; // a harness readback must not disturb the frame's renderer.info
    r.setRenderTarget(rt);
    r.render(this.quadScene, this.quadCam);
    const px = new Uint8Array(width * height * 4);
    r.readRenderTargetPixels(rt, 0, 0, width, height, px);
    r.setRenderTarget(null);
    r.info.autoReset = autoReset;
    this.quad.material = this.material;
    rt.dispose();
    const dist = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = ((height - 1 - y) * width + x) * 4; // GL rows are bottom-up
        dist[y * width + x] = ((px[i]! * 65536 + px[i + 1]! * 256 + px[i + 2]!) / 16777215) * camera.far;
      }
    }
    return { width, height, dist };
  }
}
