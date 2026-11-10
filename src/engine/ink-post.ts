// STYLE-BIBLE §6 as a post pass (D-018, refined by D-019). The scene renders unlit flat ramp fills (§1) into a target with a
// depth texture; one full-screen pass then applies, in order:
//
//   value_compression  §3/§6: each pixel's value step is remapped by its DEPTH BAND (distance from the
//                      camera: near < 25u, mid 25-80u, far 80u+), so a band holds its range wherever the
//                      camera walks (OQ-067 item 2 is why this cannot be baked into assets). Every non-accent,
//                      non-robe pixel is snapped to a §2 ramp step on the way: the frame stays on the palette.
//                        near: PUSHED DARK with nearness (D-019): every step but paper moves up to +3 steps
//                              darker inside ~7u, +2 to ~13u, +1 to ~19u, 0 beyond. The seed drives its
//                              nearest cliff to ink-black as MASS; a render that keeps the near field in the
//                              middle of the ramp has no value range. The three boundaries are ragged by
//                              world-anchored noise, so they read as wash edges, not rings round the camera.
//                              Paper is never touched: the path top is bare paper at any distance.
//                        mid:  i <= 2 ? i : 2 + floor(3(i-2)/5)   never darker than it was, never darker
//                              than ink-grey: ink-black -> ink-grey, ink-deep -> wash-mid, the lights stay
//                        far:  paper stays paper, everything else ONE flat mist-pale: silhouette only
//                      Atmosphere only ever LIGHTENS. §3's literal mid floor (wash-light) would turn the
//                      paper cloud sea and paper path tops grey between 25 and 80u, a dark ring the seed
//                      never shows (D-018; recorded, not quietly departed from).
//   ink_edge           §6, as ruled in D-019: "outlining everything is the same as outlining nothing". In the
//                      seed almost nothing is outlined; contour appears at a few silhouette boundaries, as a
//                      brush stroke that swells, thins and breaks. So the line is drawn ONLY on the near side
//                      of a real depth jump (a neighbour >= 1.2x farther: a true silhouette). A crease, a
//                      coplanar seam and a detail floating a hair off its face have no jump and get NO line
//                      (D-018 inked all of them, at one weight). Near band only: distant forms carry none.
//                      Its weight is base(distance) x world-anchored noise: 0 (the brush lifts: a break) to
//                      4px, and because the noise lives on the form, the stroke does not swim when the
//                      camera moves. ONE exception to the break: where the form and what is behind it are shown
//                      at the same or an adjacent value (a paper top against paper sky), the line is the only
//                      thing marking where the ground ends, so it never lifts below a hairline.
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

/** Every number here is in MEASUREMENTS.md "D-018 post constants" or "D-019 post constants", with its basis. */
export const INK_POST = {
  nearBandM: 25,            // STYLE §3 table
  midBandM: 80,             // STYLE §3 table
  // ink_edge (D-019). MEASUREMENTS "D-019 post constants".
  silhouetteRatio: 1.2,     // a neighbour this many times farther = a true silhouette (a crease has no jump)
  strokeBasePx: [[8, 3], [16, 2], [25, 1]] as const, // [within u, base weight px at 360p]: falls with distance
  strokeMaxPx: 4,
  strokeFreq: 0.6,          // 1/u: the stroke's weight changes over ~1.5-2u of the form
  strokeGap: 0.36,          // noise below this = the brush lifts (a break)
  strokeGain: 2.2,
  lowContrast: 0.1,         // shown values closer than this (same or adjacent ramp step): the stroke never breaks
  // near value push (D-019), inside value_compression
  pushSteps: [[10, 3], [17, 2], [23, 1]] as const,    // [within u (before jitter), steps darker]
  washFreq: 0.12,           // 1/u: the ragged edge of a wash
  washJitter: 0.3,          // +-30% on the distance a boundary sits at
  grainAmp: 3 / 255,        // < ACCENT_AREA's 6/255 match tolerance, so grain never hides a gate
  grainSeed: 20261109,      // constant: grain is static and deterministic
  accentChroma: 0.2,        // max-min of sRGB channels; the ramp's largest is 0.047, every accent candidate > 0.5
  robeTol: 4 / 255,
} as const;

const hex3 = (v: number): THREE.Vector3 => new THREE.Vector3(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255);

const f1 = (v: number): string => (Number.isInteger(v) ? v.toFixed(1) : String(v));
const P = INK_POST;
const DEFINES: Record<string, string> = {
  SIL_RATIO: f1(P.silhouetteRatio),
  STROKE_D0: f1(P.strokeBasePx[0][0]), STROKE_W0: f1(P.strokeBasePx[0][1]),
  STROKE_D1: f1(P.strokeBasePx[1][0]), STROKE_W1: f1(P.strokeBasePx[1][1]),
  STROKE_W2: f1(P.strokeBasePx[2][1]),
  LOW_CONTRAST: f1(P.lowContrast),
  STROKE_MAX: f1(P.strokeMaxPx), STROKE_FREQ: f1(P.strokeFreq), STROKE_GAP: f1(P.strokeGap), STROKE_GAIN: f1(P.strokeGain),
  PUSH_D0: f1(P.pushSteps[0][0]), PUSH_S0: String(P.pushSteps[0][1]),
  PUSH_D1: f1(P.pushSteps[1][0]), PUSH_S1: String(P.pushSteps[1][1]),
  PUSH_D2: f1(P.pushSteps[2][0]), PUSH_S2: String(P.pushSteps[2][1]),
  WASH_FREQ: f1(P.washFreq), WASH_JITTER: f1(P.washJitter),
};

const CHUNK: Record<Section6Pass, string> = {
  value_compression: /* glsl */ `
    if (!keepHue) c = uRamp[mapStep(nearestStep(c), dist, world)];`,
  ink_edge: /* glsl */ `
    if (band == 0) {
      float base = dist < STROKE_D0 ? STROKE_W0 : (dist < STROKE_D1 ? STROKE_W1 : STROKE_W2);
      float n = vnoise(world * STROKE_FREQ);
      int w = int(min(STROKE_MAX, floor(base * STROKE_GAIN * max(0.0, n - STROKE_GAP) / (1.0 - STROKE_GAP) + 0.5)));
      vec2 farUv;
      // The brush may lift ONLY where value already separates the two forms. Where this form and what is
      // behind it are SHOWN at the same or an adjacent step (a paper platform top against paper sky), the line
      // is the only thing that says where the ground ends, so it always holds at least a hairline.
      if (w == 0 && !keepHue && silhouetteWithin(1, farUv)) {
        float fv = shownValue(farUv);
        if (fv >= 0.0 && abs(fv - (c.r + c.g + c.b) / 3.0) < LOW_CONTRAST) w = 1;
      }
      if (w > 0 && silhouetteWithin(w, farUv)) c = uRamp[7];
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
    uniform mat4 uCamWorld;  // camera.matrixWorld: view -> world, so noise can live on the form
    uniform float uPx;       // device px per 360p px: stroke weights are authored at 360p
    in vec2 vUv;
    out vec4 outColor;
${Object.entries(DEFINES).map(([k, v]) => `    #define ${k} ${v}`).join('\n')}

    vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
    float invZ(vec2 uv) { float d = texture(tDepth, uv).x; return (uFar - d * (uFar - uNear)) / (uNear * uFar); }
    float distAt(vec2 uv) { vec2 ndc = uv * 2.0 - 1.0; return length(vec3(ndc * uProj, 1.0)) / invZ(uv); }
    int nearestStep(vec3 c) {
      float v = (c.r + c.g + c.b) / 3.0; int best = 0; float bd = 9.0;
      for (int k = 0; k < 8; k++) { vec3 r = uRamp[k]; float d = abs((r.r + r.g + r.b) / 3.0 - v); if (d < bd) { bd = d; best = k; } }
      return best;
    }
    float iz0;
    // true silhouette: within w px (8 directions) there is a pixel at least SIL_RATIO times farther. This pixel
    // is on the NEAR side by construction, so the line sits on the form, never on what is behind it.
    bool silhouetteWithin(int w, out vec2 farUv) {
      vec2 o[8];
      o[0] = vec2(1.0, 0.0); o[1] = vec2(-1.0, 0.0); o[2] = vec2(0.0, 1.0); o[3] = vec2(0.0, -1.0);
      o[4] = vec2(0.7071, 0.7071); o[5] = vec2(-0.7071, 0.7071); o[6] = vec2(0.7071, -0.7071); o[7] = vec2(-0.7071, -0.7071);
      float limit = iz0 / SIL_RATIO;
      for (int r = 1; r <= w; r++) {
        for (int k = 0; k < 8; k++) {
          farUv = vUv + o[k] * uTexel * (float(r) * uPx);
          if (invZ(farUv) < limit) return true;
        }
      }
      return false;
    }
    // value noise on a 3D lattice, in WORLD space: static, seeded by the lattice, no time anywhere
    float hash31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
    float vnoise(vec3 p) {
      vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(hash31(i), hash31(i + vec3(1, 0, 0)), f.x), mix(hash31(i + vec3(0, 1, 0)), hash31(i + vec3(1, 1, 0)), f.x), f.y),
                 mix(mix(hash31(i + vec3(0, 0, 1)), hash31(i + vec3(1, 0, 1)), f.x), mix(hash31(i + vec3(0, 1, 1)), hash31(i + vec3(1, 1, 1)), f.x), f.y), f.z);
    }
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + ${INK_POST.grainSeed.toFixed(1)}) * 43758.5453); }
    vec3 worldAt(vec2 uv, float iz) { return (uCamWorld * vec4(vec3((uv * 2.0 - 1.0) * uProj, -1.0) / iz, 1.0)).xyz; }
    bool keepsHue(vec3 c) {
      float chroma = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
      return chroma > ${INK_POST.accentChroma.toFixed(4)} || all(lessThan(abs(c - uRobe), vec3(${INK_POST.robeTol.toFixed(6)})));
    }
    // value_compression's map: the step a pixel is SHOWN at, from its own step, its distance and where it is
    int mapStep(int i, float dist, vec3 world) {
      if (dist < ${INK_POST.nearBandM.toFixed(1)}) {
        float dp = dist * (1.0 - WASH_JITTER + 2.0 * WASH_JITTER * vnoise(world * WASH_FREQ));
        int push = i == 0 ? 0 : (dp < PUSH_D0 ? PUSH_S0 : (dp < PUSH_D1 ? PUSH_S1 : (dp < PUSH_D2 ? PUSH_S2 : 0)));
        return min(7, i + push);
      }
      if (dist < ${INK_POST.midBandM.toFixed(1)}) return i <= 2 ? i : 2 + (3 * (i - 2)) / 5;
      return i == 0 ? 0 : 1;
    }
    // the value another pixel is shown at (before any line), or -1 for the accent / the robe
    float shownValue(vec2 uv) {
      vec3 c = toSRGB(texture(tColor, uv).rgb);
      if (keepsHue(c)) return -1.0;
      float iz = invZ(uv);
      vec3 r = uRamp[mapStep(nearestStep(c), length(vec3((uv * 2.0 - 1.0) * uProj, 1.0)) / iz, worldAt(uv, iz))];
      return (r.r + r.g + r.b) / 3.0;
    }

    void main() {
      vec3 c = toSRGB(texture(tColor, vUv).rgb);
      iz0 = invZ(vUv);
      float dist = distAt(vUv);
      vec3 world = worldAt(vUv, iz0);
      int band = dist < ${INK_POST.nearBandM.toFixed(1)} ? 0 : (dist < ${INK_POST.midBandM.toFixed(1)} ? 1 : 2);
      bool keepHue = keepsHue(c);
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
        uCamWorld: { value: new THREE.Matrix4() },
        uPx: { value: 1 },
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
    this.material.uniforms['uPx']!.value = Math.max(1, height / 360);
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
    const r = this.renderer;
    r.setRenderTarget(this.target);
    r.render(scene, camera);
    r.setRenderTarget(null);
    this.syncCamera(camera); // after the scene render: camera.matrixWorld is this frame's
    (this.material.uniforms['uCamWorld']!.value as THREE.Matrix4).copy(camera.matrixWorld);
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
