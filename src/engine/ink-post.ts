// STYLE-BIBLE §6 as a post pass (D-018, refined by D-019). The scene renders unlit flat ramp fills (§1) into a target with a
// depth texture; one full-screen pass then applies, in order:
//
//   value_compression  §3/§6: each pixel's value step is remapped by its DEPTH BAND (distance from the
//                      camera: near < 25u, mid 25-80u, far 80u+), so a band holds its range wherever the
//                      camera walks (OQ-067 item 2 is why this cannot be baked into assets). Every non-accent,
//                      non-robe pixel is snapped to a §2 ramp step on the way: the frame stays on the palette.
//                        near: PUSHED DARK with nearness (D-019): steps 2..7 move up to +3 steps darker inside
//                              12u at most, +2 to 20u, +1 to 24.9u, 0 beyond. The seed drives its nearest cliff
//                              to ink-black as MASS; a render that keeps the near field in the middle of the
//                              ramp has no value range. Each boundary is pulled inward by three octaves of
//                              world-anchored noise, so its edge is ragged at brush scale. KNOWN LIMIT
//                              (OQ-068): the push is per pixel by distance, so on one long flat wall the
//                              bands are still camera-relative and slide as the camera moves.
//                              Paper and mist are never pushed: a path top and the cloud keep their value.
//                        mid:  i <= 2 ? i : 2 + floor(3(i-2)/5)   never darker than it was, never darker
//                              than ink-grey: ink-black -> ink-grey, ink-deep -> wash-mid, the lights stay
//                        far:  paper stays paper, everything else ONE flat mist-pale: silhouette only
//                      Atmosphere only ever LIGHTENS. §3's literal mid floor (wash-light) would turn the
//                      paper cloud sea and paper path tops grey between 25 and 80u, a dark ring the seed
//                      never shows (D-018; recorded, not quietly departed from).
//   ink_edge           §6, as ruled in D-019: "outlining everything is the same as outlining nothing". In the
//                      seed almost nothing is outlined; contour appears at a few silhouette boundaries, as a
//                      brush stroke that swells, thins and breaks. So the line is drawn ONLY on the near side
//                      of a true silhouette: two surfaces that do not meet (see silhouetteWithin). A crease,
//                      a coplanar seam and one plane at any grazing angle are not that and get NO line
//                      (D-018 inked all of them, at one weight). Near band only: distant forms carry none.
//                      Its weight is base(distance) x world-anchored noise: 0 (the brush lifts: a break) to
//                      4px, and because the noise lives on the form, the stroke does not swim when the
//                      camera moves. ONE exception to the break: where the form and what is behind it are shown
//                      at the SAME value (one platform top against the next one down), the line is the only
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
//
// TWO SIZES OF THE SAME PICTURE (INK-HIRES). Every weight above is authored on a 360-line frame.
//   reference  a drawing buffer of 360 lines or fewer (the harness's 640x360): the shader below, unchanged, one
//              sample per pixel, straight to the canvas. This is the frame the goldens and the `post` gate judge.
//   display    anything taller (a player's screen). The three passes are every one a hard per-pixel decision
//              (snap to a ramp step, ink or no ink), so on a real display each edge was a staircase, and because
//              the line's weight and its depth taps moved in whole 360p pixels (4 device px at 1440 lines), each
//              stroke changed width in 4 px blocks. Hardware MSAA cannot fix that: it would blend two ramp steps
//              BEFORE the snap, and the snap would turn the blend into a third step. So the decisions are
//              supersampled instead, and filtered after they are made:
//                1. the scene and its depth render at an INTERNAL size, the drawing buffer x a scale of 1 to
//                   INK_DISPLAY.maxScale, held under INK_DISPLAY.maxInternalPixels (the frame-rate cap);
//                2. the same value_compression, and an ink_edge with the same silhouette test, run per internal
//                   texel. The stroke's weight is no longer rounded to whole pixels: it is a real number of
//                   texels, the silhouette is located to the texel, and the last texel takes fractional coverage;
//                3. one resolve pass averages the internal texels under each canvas pixel in linear light, and
//                   lays the grain over it in 360p space, so the grain is the same paper at any size.
//              It is built on the reference shader's own source text (displayShader), so the value map, the
//              silhouette test and every constant are one copy and cannot drift apart.

import * as THREE from 'three';

import { RAMP, ROBE } from './palette';

export const SECTION6_PASSES = ['value_compression', 'ink_edge', 'paper_grain'] as const;
export type Section6Pass = (typeof SECTION6_PASSES)[number];

/** Every number here is in MEASUREMENTS.md "D-018 post constants" or "D-019 post constants", with its basis. */
export const INK_POST = {
  nearBandM: 25,            // STYLE §3 table
  midBandM: 80,             // STYLE §3 table
  // ink_edge (D-019). MEASUREMENTS "D-019 post constants".
  silhouetteGap: 0.02,      // relative gap (in 1/z) between two surfaces that do not meet = a true silhouette
  strokeBasePx: [[8, 3], [16, 2], [25, 1]] as const, // [within u, base weight px at 360p]: falls with distance
  strokeMaxPx: 4,
  strokeFreq: 0.6,          // 1/u: the stroke's weight changes over ~1.5-2u of the form
  strokeGap: 0.36,          // noise below this = the brush lifts (a break)
  strokeGain: 2.2,
  lowContrast: 0.04,        // shown values closer than this (the SAME ramp step): the stroke never breaks
  // near value push (D-019), inside value_compression
  pushSteps: [[12, 3], [20, 2], [24.9, 1]] as const,    // [within u at most, steps darker]; steps 0 and 1 never pushed
  washFreq: 0.12,           // 1/u: the lowest of three octaves (x1, x3.7, x11) that rag a wash boundary
  washJitter: 0.35,         // a boundary is pulled INWARD by up to this fraction, never outward: the push
                            // provably ends inside pushSteps' last distance, short of the 25u band edge
  grainAmp: 3 / 255,        // < ACCENT_AREA's 6/255 match tolerance, so grain never hides a gate
  grainSeed: 20261109,      // constant: grain is static and deterministic
  accentChroma: 0.2,        // max-min of sRGB channels; the ramp's largest is 0.047, every accent candidate > 0.5
  robeTol: 4 / 255,
} as const;

/** The display path's own numbers. MEASUREMENTS "INK-HIRES display constants", with the frame times behind the cap. */
export const INK_DISPLAY = {
  referenceLines: 360,              // the authored frame: at or below this the reference shader runs, unchanged
  maxScale: 2,                      // internal texels per canvas pixel, per axis, at most
  maxInternalPixels: 24_000_000,    // the internal buffer never exceeds this: the frame-rate cap
} as const;

const hex3 = (v: number): THREE.Vector3 => new THREE.Vector3(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255);

const f1 = (v: number): string => (Number.isInteger(v) ? v.toFixed(1) : String(v));
const P = INK_POST;
const DEFINES: Record<string, string> = {
  SIL_GAP: f1(P.silhouetteGap),
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
      // behind it are SHOWN at the same step (one platform top against the next one down), the line is the
      // only thing that says where the ground ends, so it always holds at least a hairline.
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
    // TRUE SILHOUETTE = a depth discontinuity: two surfaces that do not meet. Walking outward from this pixel
    // along a direction, take the boundary between sample k=r-1 (near) and k=r (far). 1/z is linear across a
    // plane in screen space, so each side can be continued exactly from two samples. If the near surface
    // continued forward is nearer than the far pixel by SIL_GAP, AND the far surface continued back is farther
    // than the near pixel by SIL_GAP, the surfaces cannot intersect between the two pixels: an occlusion edge.
    //   one plane, at ANY grazing angle: both differences are exactly 0            -> no line
    //   a crease (two planes meeting on the edge): the differences have opposite signs -> no line
    //   a step-down between two parallel tops, however small: both equal the gap   -> a line
    // The walk stops at the first sample that leaves this pixel's own plane, so a line is only ever drawn on
    // the NEAR surface of its own silhouette.
    bool silhouetteWithin(int w, out vec2 farUv) {
      vec2 o[8];
      o[0] = vec2(1.0, 0.0); o[1] = vec2(-1.0, 0.0); o[2] = vec2(0.0, 1.0); o[3] = vec2(0.0, -1.0);
      // WHOLE-pixel steps, diagonals included. The depth texture is sampled NEAREST, so a 0.7071px step lands on
      // unevenly spaced texels, the extrapolation stops being exact, and a steeply receding plane reads as a gap
      // (found by the grazing camera: a band of ink across flat ground). uPx is an integer for the same reason.
      o[4] = vec2(1.0, 1.0); o[5] = vec2(-1.0, 1.0); o[6] = vec2(1.0, -1.0); o[7] = vec2(-1.0, -1.0);
      for (int k = 0; k < 8; k++) {
        vec2 st = o[k] * uTexel * uPx;
        float prev = invZ(vUv - st), cur = iz0, nxt = invZ(vUv + st);
        for (int r = 1; r <= w; r++) {
          float nxt2 = invZ(vUv + st * float(r + 1));
          float ahead = cur + (cur - prev) - nxt;   // near surface continued to the far sample, minus the far sample
          float back = cur - (nxt - (nxt2 - nxt));  // near sample minus the far surface continued back to it
          if (min(ahead, back) > SIL_GAP * cur) { farUv = vUv + st * float(r); return true; }
          if (abs(ahead) > SIL_GAP * cur) break;    // left this pixel's plane without a silhouette: a crease, or we are the far side
          prev = cur; cur = nxt; nxt = nxt2;
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
        if (i < 2 || dist >= PUSH_D2) return i; // paper and mist (path tops, the cloud) are never pushed
        float n = 0.55 * vnoise(world * WASH_FREQ) + 0.3 * vnoise(world * (WASH_FREQ * 3.7)) + 0.15 * vnoise(world * (WASH_FREQ * 11.0));
        float dp = dist * (1.0 + WASH_JITTER * n); // >= dist: jitter only moves a boundary toward the camera
        int push = dp < PUSH_D0 ? PUSH_S0 : (dp < PUSH_D1 ? PUSH_S1 : (dp < PUSH_D2 ? PUSH_S2 : 0));
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

// ---- the display path (see the header). Everything above `void main()` in the reference shader is reused as is.
const MAIN_MARK = '\n    void main() {';

const DISPLAY_CHUNK: Record<Section6Pass, string> = {
  value_compression: CHUNK.value_compression, // the same map, per internal texel
  ink_edge: /* glsl */ `
    if (band == 0) {
      float n = vnoise(world * STROKE_FREQ);
      // the reference rounds this to whole 360p pixels; here it stays a real number, so a stroke tapers into a
      // break instead of stepping, and its base weight falls with distance along a line through the centres
      // of the reference's three distance bands instead of dropping a whole step at 8u and 16u
      float wf = min(STROKE_MAX, strokeBase(dist) * STROKE_GAIN * max(0.0, n - STROKE_GAP) / (1.0 - STROKE_GAP));
      float reach = keepHue ? wf : max(wf, 1.0); // the same-value rule looks one 360p pixel out
      vec2 farUv;
      float d = reach > 0.0 ? silhouetteDist(reach * uUnit, farUv) : NO_EDGE;
      if (d < NO_EDGE) {
        // the reference's exception, unchanged: same shown value on both sides -> never thinner than a hairline
        if (wf < 1.0 && !keepHue && d <= uUnit) {
          float fv = shownValue(farUv);
          if (fv >= 0.0 && abs(fv - (c.r + c.g + c.b) / 3.0) < LOW_CONTRAST) wf = 1.0;
        }
        ink = clamp(wf * uUnit - d + 0.5, 0.0, 1.0); // the last texel of the stroke is covered in part
      }
    }`,
  paper_grain: '', // laid over the resolved frame, in 360p space: see resolveShader
};

function displayShader(passes: readonly Section6Pass[]): string {
  const ref = fragmentShader(passes);
  const cut = ref.indexOf(MAIN_MARK);
  if (cut < 0) throw new Error('ink-post: the reference shader has no main() to build the display shader on');
  const near = INK_POST.nearBandM, [d0, d1] = [INK_POST.strokeBasePx[0][0], INK_POST.strokeBasePx[1][0]];
  return /* glsl */ `${ref.slice(0, cut)}
    uniform float uUnit;   // internal texels per 360p pixel (a real number): every stroke weight scales by it
    uniform int uStride;   // whole texels between depth taps along a direction (uUnit rounded up)
    #define NO_EDGE 1.0e6
    vec3 toLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
    // the reference's base weight is a step per distance band [0,${f1(d0)}) [${f1(d0)},${f1(d1)}) [${f1(d1)},${f1(near)}); this is the line through
    // the centre of each band, so the weight of a stroke that recedes changes along it without a notch
    float strokeBase(float dist) {
      const float m0 = ${f1(d0 / 2)}, m1 = ${f1((d0 + d1) / 2)}, m2 = ${f1((d1 + near) / 2)};
      return dist < m1 ? mix(STROKE_W0, STROKE_W1, clamp((dist - m0) / (m1 - m0), 0.0, 1.0))
                       : mix(STROKE_W1, STROKE_W2, clamp((dist - m1) / (m2 - m1), 0.0, 1.0));
    }
    // Distance, in internal texels, from this texel to the nearest true silhouette it is the NEAR side of, within
    // reach (+ half a texel); NO_EDGE if there is none. The test is silhouetteWithin's, tap for tap: whole-texel taps, evenly
    // spaced along 8 directions, each side continued from its own two samples. Two things differ. A diagonal
    // step is counted as its real length (1.414), so a stroke is as heavy across a diagonal edge as across an
    // upright one. And once a silhouette is found between two taps, the boundary is bisected down to the first
    // texel that has left this surface, so the stroke's edge is placed to the texel and not to the stride.
    float silhouetteDist(float reach, out vec2 farUv) {
      vec2 o[8]; // direction k's opposite is k ^ 1
      o[0] = vec2(1.0, 0.0); o[1] = vec2(-1.0, 0.0); o[2] = vec2(0.0, 1.0); o[3] = vec2(0.0, -1.0);
      o[4] = vec2(1.0, 1.0); o[5] = vec2(-1.0, -1.0); o[6] = vec2(-1.0, 1.0); o[7] = vec2(1.0, -1.0);
      // the first tap out along each direction is also the tap BEHIND for the opposite direction: 8 fetches, not 16
      float ring[8];
      for (int k = 0; k < 8; k++) ring[k] = invZ(vUv + o[k] * uTexel * float(uStride));
      float best = NO_EDGE;
      for (int k = 0; k < 8; k++) {
        float len = k < 4 ? 1.0 : 1.41421356;
        vec2 tx = o[k] * uTexel;          // one whole texel along this direction
        vec2 st = tx * float(uStride);
        // a boundary found in stride r is at least (r - 1) strides + half a texel out, so one further stride
        // than this could only return distances past reach + 0.5, where the stroke's coverage is already 0
        int steps = int(ceil(reach / (len * float(uStride))));
        float prev = ring[k ^ 1], cur = iz0, nxt = ring[k];
        for (int r = 1; r <= steps; r++) {
          float ahead = cur + (cur - prev) - nxt;
          if (ahead > SIL_GAP * cur) {
            // the far side's second sample is only fetched once the near side says there may be a silhouette
            float nxt2 = invZ(vUv + st * float(r + 1));
            float back = cur - (nxt - (nxt2 - nxt));
            if (back > SIL_GAP * cur) {
              int base = (r - 1) * uStride, lo = base, hi = r * uStride; // texel lo is on this surface, hi is not
              float slope = (cur - prev) / float(uStride);              // this surface's 1/z per texel: exact on a plane
              for (int b = 0; b < 8 && hi - lo > 1; b++) {
                int mid = (lo + hi) / 2;
                if (cur + slope * float(mid - base) - invZ(vUv + tx * float(mid)) > 0.5 * SIL_GAP * cur) hi = mid; else lo = mid;
              }
              float d = (float(hi) - 0.5) * len; // the boundary lies between texel hi-1 and texel hi
              if (d < best) { best = d; farUv = vUv + tx * float(hi); }
            }
            break; // a silhouette, or a crease: either way this pixel's plane ends here
          }
          if (-ahead > SIL_GAP * cur || r == steps) break; // left this plane the other way (we are the far side), or out of reach
          prev = cur; cur = nxt; nxt = invZ(vUv + st * float(r + 1));
        }
      }
      return best <= reach + 0.5 ? best : NO_EDGE; // + 0.5: the texel the stroke's edge falls inside
    }

    void main() {
      vec3 c = toSRGB(texture(tColor, vUv).rgb);
      iz0 = invZ(vUv);
      float dist = distAt(vUv);
      vec3 world = worldAt(vUv, iz0);
      int band = dist < ${INK_POST.nearBandM.toFixed(1)} ? 0 : (dist < ${INK_POST.midBandM.toFixed(1)} ? 1 : 2);
      bool keepHue = keepsHue(c);
      float ink = 0.0;
      ${passes.map((p) => `// ---- ${p}\n${DISPLAY_CHUNK[p]}`).join('\n')}
      // LINEAR light out: the internal target is sRGB-encoded by GL on write and decoded on read, so the resolve
      // pass averages light, not code values (a half-covered edge pixel is then half as bright, as it should be)
      outColor = vec4(mix(toLinear(clamp(c, 0.0, 1.0)), toLinear(uRamp[7]), ink), 1.0);
    }`;
}

// Internal texels -> canvas pixels. uTaps x uTaps bilinear taps spread over the canvas pixel's footprint: at a
// whole scale each tap sits on a texel centre (an exact box filter), at a fractional scale they overlap into a
// tent, at scale 1 the one tap is the texel itself. Then the grain, which is why it is here and not above: it
// belongs to the paper, not to the internal buffer. paper() is value noise on the 360p pixel lattice, plus
// finer octaves down to (never below) one device pixel, so the tooth is there at any size and the same lattice
// point carries the same grain whatever the resolution. Static, seeded, bounded by grainAmp as the reference's is.
function resolveShader(passes: readonly Section6Pass[]): string {
  return /* glsl */ `
    precision highp float;
    uniform sampler2D tInk;
    uniform vec2 uTexel;     // one internal texel, in uv
    uniform int uTaps;       // taps per axis: ceil(scale)
    uniform float uSpread;   // internal texels between neighbouring taps
    uniform float uUnitOut;  // canvas pixels per 360p pixel
    in vec2 vUv;
    out vec4 outColor;
    vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
    float hash21(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031 + ${(INK_POST.grainSeed % 1000).toFixed(1)} * 0.01); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
    float lattice(vec2 p) {
      vec2 q = p - 0.5, i = floor(q), f = fract(q); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    float paper(vec2 p) {
      float sum = 0.0, wsum = 0.0, w = 1.0, fq = 1.0;
      for (int o = 0; o < 5; o++) {
        if (o > 0 && fq > uUnitOut) break; // a finer octave would be finer than a device pixel
        sum += w * lattice(p * fq + float(o) * 17.0); wsum += w; w *= 0.5; fq *= 2.0;
      }
      return sum / wsum;
    }
    void main() {
      vec3 acc = vec3(0.0);
      float h = 0.5 * float(uTaps - 1);
      for (int j = 0; j < uTaps; j++) for (int i = 0; i < uTaps; i++)
        acc += texture(tInk, vUv + (vec2(float(i), float(j)) - h) * uSpread * uTexel).rgb;
      vec3 c = toSRGB(acc / float(uTaps * uTaps));
      ${passes.includes('paper_grain') ? `c += (paper(gl_FragCoord.xy / uUnitOut) - 0.5) * 2.0 * ${INK_POST.grainAmp.toFixed(6)};` : ''}
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
  // the display path (drawing buffers taller than INK_DISPLAY.referenceLines). Built on first use, so a
  // reference-size session (the harness) compiles and allocates exactly what it did before.
  private display: { target: THREE.WebGLRenderTarget; ink: THREE.ShaderMaterial; resolve: THREE.ShaderMaterial } | null = null;
  private displayOn = false;

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

  /** Internal size for a drawing buffer: the buffer itself at reference size, else supersampled under the cap. */
  static internalSize(width: number, height: number): { width: number; height: number; scale: number } {
    const D = INK_DISPLAY;
    if (height <= D.referenceLines) return { width, height, scale: 1 };
    const scale = Math.max(1, Math.min(D.maxScale, Math.sqrt(D.maxInternalPixels / (width * height))));
    return { width: Math.round(width * scale), height: Math.round(height * scale), scale };
  }

  /** width x height is the drawing buffer (the canvas), in device pixels. */
  setSize(width: number, height: number): void {
    const int = InkPost.internalSize(width, height);
    this.displayOn = height > INK_DISPLAY.referenceLines;
    this.target.setSize(int.width, int.height);
    (this.material.uniforms['uTexel']!.value as THREE.Vector2).set(1 / int.width, 1 / int.height);
    this.material.uniforms['uPx']!.value = Math.max(1, Math.round(height / 360)); // integer: see silhouetteWithin
    if (!this.displayOn) return;
    const d = (this.display ??= this.buildDisplay());
    d.target.setSize(int.width, int.height);
    const unit = int.height / INK_DISPLAY.referenceLines; // internal texels per 360p pixel
    d.ink.uniforms['uUnit']!.value = unit;
    // whole texels (see silhouetteWithin), and never shorter than a 360p pixel: the same-value rule then reaches
    // its one 360p pixel in a single stride, which is every near pixel's cheapest path
    d.ink.uniforms['uStride']!.value = Math.max(1, Math.ceil(unit - 1e-6));
    const taps = Math.ceil(int.height / height - 1e-6);
    d.resolve.uniforms['uTaps']!.value = taps;
    d.resolve.uniforms['uSpread']!.value = taps > 1 ? (int.height / height - 1) / (taps - 1) : 0;
    d.resolve.uniforms['uUnitOut']!.value = height / INK_DISPLAY.referenceLines;
  }

  private buildDisplay(): NonNullable<InkPost['display']> {
    // the inked frame at internal size. sRGB-encoded 8 bit, LINEAR filtered: GL decodes before it filters, so
    // the resolve pass's taps average light
    const target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.UnsignedByteType,
      colorSpace: THREE.SRGBColorSpace,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
    });
    const ink = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      // the reference material's own uniform objects: one camera sync and one size serve both
      uniforms: { ...this.material.uniforms, uUnit: { value: 1 }, uStride: { value: 1 } },
      vertexShader: VERT,
      fragmentShader: displayShader(this.passes),
      depthTest: false,
      depthWrite: false,
    });
    const resolve = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        tInk: { value: target.texture },
        uTexel: this.material.uniforms['uTexel']!,
        uTaps: { value: 1 },
        uSpread: { value: 0 },
        uUnitOut: { value: 1 },
      },
      vertexShader: VERT,
      fragmentShader: resolveShader(this.passes),
      depthTest: false,
      depthWrite: false,
    });
    return { target, ink, resolve };
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
    if (this.displayOn && this.display) {
      // display: the three passes per internal texel, then the resolve to the canvas
      r.setRenderTarget(this.display.target);
      this.quad.material = this.display.ink;
      r.render(this.quadScene, this.quadCam);
      r.setRenderTarget(null);
      this.quad.material = this.display.resolve;
      r.render(this.quadScene, this.quadCam);
      return;
    }
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
