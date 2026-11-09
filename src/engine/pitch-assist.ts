// PITCH ASSIST (D-015d, B-18; D-016b made it the chapter 2 blocker). A module with no imports and no
// classes, so the game (src/engine/camera.ts), READABLE_RISE (tools/lint-level.mjs) and the harness
// (tools/harness/pitch-assist.ts) evaluate the SAME rule: the linter models exactly what the camera does.
//
// The problem (D-015, D-016): at the rest pitch the eye is 3.66 u above the feet, so a landing whose top
// is near or above that height shows the player a face and no ground. The assist: when the player faces
// such a face within probeM, the camera pitches up to the LOWEST pitch at which the landing's top surface
// subtends >= READABLE_RISE.minBandDeg (the linter's own threshold), and lets go when the player turns
// away or the top already reads.
//
// Every value is in MEASUREMENTS.md "D-015d pitch assist". The rig is passed in (CAMERA_TUNING +
// RENDER_CONFIG), never retyped here.

export interface AssistRig {
  pivotHeight: number;
  distance: number;
  initialPitchDeg: number;
  pitchMaxDeg: number;
  fovDeg: number;
}

export const PITCH_ASSIST = {
  probeM: 3.0, //         D-015d "inside ~3 m of a face": the face must be this close along the player's facing
  eyeBandM: 0.5, //       D-015d "a face whose top is within 0.5 m of eye level", read as a LOWER bound: only a
  //                      top at or above (rest eye - 0.5) is assisted. Above the eye is the worst case, not exempt
  minBandDeg: 2.0, //     = READABLE_RISE.minBandDeg (D-015b); the linter asserts the two are equal
  pitchStepDeg: 1, //     the target pitch is searched in whole degrees from the current pitch upward
  depthStepM: 0.5, //     the probe measures the landing's depth by stepping down-rays this far apart
  depthMaxM: 15, //       ...up to this depth (D-016's deepest measured column); a deeper landing counts as 15
  epsM: 0.05, //          probe tolerance: the first down-ray lands this far inside the face (so it never grazes
  //                      the face plane), and a depth sample within this height of the top is the same surface
};

const DEG = 180 / Math.PI;

/** Height above the feet at which the probe casts: eyeBandM below the rest-pose eye. A face whose top is
 *  lower is never assisted (stairs, steps, the shelves D-015a cut chapter 1's faces into). */
export function probeHeight(rig: AssistRig): number {
  return rig.pivotHeight + rig.distance * Math.sin(rig.initialPitchDeg / DEG) - PITCH_ASSIST.eyeBandM;
}

/**
 * Vertical angle (deg) the landing's top surface subtends from the eye of a rig at `pitchDeg` (elevation
 * of the arm above the pivot), with the player `standoff` off the face, for a landing `rise` above the
 * feet and `depth` deep along the approach. Clipped to the vertical frustum. A top at or above the eye
 * faces away from it: 0 (OQ-046). `arm` is the arm length at that pitch: rig.distance when nothing is
 * behind the player; READABLE_RISE passes the collided length (B-23) so the eye is the one play gets.
 * The camera looks at the pivot whatever the arm length, so the view direction is -pitchDeg either way.
 */
export function topBandDeg(rig: AssistRig, pitchDeg: number, rise: number, depth: number, standoff: number, arm: number = rig.distance): number {
  const p = pitchDeg / DEG;
  const eye = rig.pivotHeight + arm * Math.sin(p);
  const behind = arm * Math.cos(p);
  const h = rise - eye;
  if (h >= 0 || !(depth > 0)) return 0;
  const lo = -pitchDeg - rig.fovDeg / 2;
  const hi = -pitchDeg + rig.fovDeg / 2;
  const clip = (v: number): number => Math.min(hi, Math.max(lo, v));
  const dEye = standoff + behind;
  return Math.abs(clip(Math.atan2(h, dEye + depth) * DEG) - clip(Math.atan2(h, dEye) * DEG));
}

/**
 * The pitch the assist drives the camera to: `basePitchDeg` itself when the top already reads, else the
 * lowest whole-degree step above it at which it reads, or null when nothing will: the face is too low for
 * the probe (which runs at probeHeight), or no pitch up to pitchMaxDeg makes it read. The assist then
 * does nothing.
 */
export function assistPitchDeg(rig: AssistRig, basePitchDeg: number, rise: number, depth: number, standoff: number): number | null {
  const d = Math.min(depth, PITCH_ASSIST.depthMaxM);
  if (topBandDeg(rig, basePitchDeg, rise, d, standoff) >= PITCH_ASSIST.minBandDeg) return basePitchDeg;
  if (rise < probeHeight(rig)) return null; // the probe ray passes over this face: no assist
  for (let p = Math.ceil(basePitchDeg / PITCH_ASSIST.pitchStepDeg) * PITCH_ASSIST.pitchStepDeg; p <= rig.pitchMaxDeg; p += PITCH_ASSIST.pitchStepDeg) {
    if (p > basePitchDeg && topBandDeg(rig, p, rise, d, standoff) >= PITCH_ASSIST.minBandDeg) return p;
  }
  return null;
}

/** The landing depth the camera's probe reports for a landing `depth` deep: the last down-ray sample still on
 *  the top (epsM + k * depthStepM), capped at depthMaxM. The linter feeds assistPitchDeg this, not the true
 *  depth, so it models what the probe measures. */
export function probedDepth(depth: number): number {
  const a = PITCH_ASSIST;
  if (!(depth > a.epsM)) return 0;
  const k = Math.floor((Math.min(depth, a.depthMaxM + a.epsM) - a.epsM) / a.depthStepM + 1e-9);
  return a.epsM + k * a.depthStepM;
}
