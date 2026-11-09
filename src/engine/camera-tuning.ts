// CAMERA_TUNING — the follow rig's constants, in a module with no imports and no classes so that
// Node (tools/lint-level.mjs, via built-in type stripping) can import the real values.
//
// !! These values are read by READABLE_RISE in tools/lint-level.mjs (D-015b):
// !!   pivotHeight, distance, initialPitchDeg  ->  eye height above the feet and eye standoff
// !! Change the rig and that check moves with it. Do not copy these numbers anywhere else.

export const CAMERA_TUNING = {
  distance: 7,              // rest arm length (m)
  minDistance: 0.8,         // never closer than this, even when pushed by geometry
  pivotHeight: 1.5,         // pivot above the target point (m)
  initialPitchDeg: 18,      // elevation above the pivot at spawn
  pitchMinDeg: -25,         // looking up from below
  pitchMaxDeg: 70,          // looking down from above (must stay < 90 to avoid flip)
  mouseSensitivity: 0.0025, // radians per pixel of mouse movement
  followDamping: 12,        // pivot follow sharpness (1/s); higher = stiffer
  armReturnDamping: 4,      // arm re-extension sharpness after a collision (1/s)
  collisionPadding: 0.3,    // keep this far in front of the wall that pushed us in (m)
  lookAheadTime: 0.25,      // pivot leads the target by velocity * this (s)
  lookAheadMax: 2.0,        // cap on look-ahead offset (m)
  lookAheadDamping: 3,      // look-ahead smoothing (1/s)
};
