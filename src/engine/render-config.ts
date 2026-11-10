// RENDER_CONFIG — renderer constants, in a module with no imports and no classes so that Node
// (tools/lint-level.mjs, via built-in type stripping) can import the real values.
//
// !! fovDeg is read by READABLE_RISE in tools/lint-level.mjs (D-015b): a landing whose top surface
// !! lies outside the vertical frustum at the rig's rest pose is not readable.
// !! Change it here and that check moves with it. Do not copy it anywhere else.

export const RENDER_CONFIG = {
  maxPixelRatio: 2,
  toneMappingExposure: 1.0,
  fovDeg: 60,
  near: 0.1,
  far: 600,
};
