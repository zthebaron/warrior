#!/usr/bin/env node
// ACCENT_CONTRAST — the navigational accent must separate from EVERY palette entry.
// PHASE-0-DECISIONS D-001: the accent is authored, not measured. Vermilion means WHERE (Q2), so the
// test is whether a player scanning the frame finds it, not whether it is under the 1% area budget.
//
//   node tools/assets/accent.mjs            check assets/src/accent.json against reference/palette.json
//   node tools/assets/accent.mjs '#e34234'  report one colour (no exit code semantics)
//
// Rule — all three must hold. Every threshold is DERIVED from reference/palette.json at run time
// (the multipliers are the policy; MEASUREMENTS.md "D-001 accent contrast" records the numbers):
//   dE2000 to the NEAREST entry >= 2 x the largest adjacent ramp step   separation (CIEDE2000, D65 sRGB)
//   C*ab                        >= 3 x the palette's largest chroma     a near-neutral never passes on dE alone
//   L*                          >= L* of wash-mid, the darkest non-ink value
//                                  §5 draws the cliff mass in the ink values; an accent at ink lightness
//                                  reads as another dark shape in the value channel the style runs on.
//                                  (#5a0000 is dE 24.5 from the ramp and still fails here — it should.)
// assets/src/accent.json `must_fail` entries are regression fixtures: they MUST be rejected.
//
// Exit: 0 every candidate passes · 1 ACCENT_CONTRAST error(s)

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export const ACCENT_POLICY = { stepMultiple: 2, chromaMultiple: 3, lightnessFloorEntry: 'wash-mid' };

/** Thresholds measured from the palette itself. */
export function accentRule(palette) {
  const labs = palette.map((p) => hexToLab(p.hex));
  const maxStep = Math.max(...labs.slice(1).map((l, i) => deltaE2000(labs[i], l)));
  const maxChroma = Math.max(...labs.map(chroma));
  const floor = palette.findIndex((p) => p.name === ACCENT_POLICY.lightnessFloorEntry);
  if (floor < 0) throw new Error(`palette.json has no "${ACCENT_POLICY.lightnessFloorEntry}"`);
  return {
    minDeltaE: ACCENT_POLICY.stepMultiple * maxStep,
    minChroma: ACCENT_POLICY.chromaMultiple * maxChroma,
    minLightness: labs[floor][0],
    basis: { maxStep, maxChroma, floorEntry: ACCENT_POLICY.lightnessFloorEntry },
  };
}

// ---- colour maths ----
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
export function hexToLab(hex) {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => lin(parseInt(h.slice(i, i + 2), 16) / 255));
  const X = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const Y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const Z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const [fx, fy, fz] = [f(X), f(Y), f(Z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
export const chroma = ([, a, b]) => Math.hypot(a, b);

/** CIEDE2000, kL = kC = kH = 1. */
export function deltaE2000(l1, l2) {
  const [L1, a1, b1] = l1;
  const [L2, a2, b2] = l2;
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const ap1 = (1 + G) * a1;
  const ap2 = (1 + G) * a2;
  const Cp1 = Math.hypot(ap1, b1);
  const Cp2 = Math.hypot(ap2, b2);
  const hp = (b, a) => (b === 0 && a === 0 ? 0 : (Math.atan2(b, a) / rad + 360) % 360);
  const hp1 = hp(b1, ap1);
  const hp2 = hp(b2, ap2);
  const dL = L2 - L1;
  const dC = Cp2 - Cp1;
  let dh = 0;
  if (Cp1 * Cp2 !== 0) dh = Math.abs(hp2 - hp1) <= 180 ? hp2 - hp1 : hp2 - hp1 > 180 ? hp2 - hp1 - 360 : hp2 - hp1 + 360;
  const dH = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin((dh * rad) / 2);
  const Lb = (L1 + L2) / 2;
  const Cpb = (Cp1 + Cp2) / 2;
  let hb = hp1 + hp2;
  if (Cp1 * Cp2 !== 0) hb = Math.abs(hp1 - hp2) <= 180 ? (hp1 + hp2) / 2 : hp1 + hp2 < 360 ? (hp1 + hp2 + 360) / 2 : (hp1 + hp2 - 360) / 2;
  const T = 1 - 0.17 * Math.cos((hb - 30) * rad) + 0.24 * Math.cos(2 * hb * rad) + 0.32 * Math.cos((3 * hb + 6) * rad) - 0.2 * Math.cos((4 * hb - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hb - 275) / 25) ** 2));
  const RC = 2 * Math.sqrt(Cpb ** 7 / (Cpb ** 7 + 25 ** 7));
  const SL = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2);
  const SC = 1 + 0.045 * Cpb;
  const SH = 1 + 0.015 * Cpb * T;
  const RT = -Math.sin(2 * dTheta * rad) * RC;
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}

export function loadPalette(root = ROOT) {
  return JSON.parse(readFileSync(join(root, 'reference/palette.json'), 'utf8')).colors.map((c) => ({ name: c.name, hex: c.hex }));
}

/** @returns {{ok, hex, L, C, nearest:{name,hex,dE}, errors:string[]}} */
export function accentContrast(hex, palette = loadPalette()) {
  const R = accentRule(palette);
  const lab = hexToLab(hex);
  const dists = palette.map((p) => ({ name: p.name, hex: p.hex, dE: deltaE2000(lab, hexToLab(p.hex)) })).sort((x, y) => x.dE - y.dE);
  const nearest = dists[0];
  const C = chroma(lab);
  const errors = [];
  if (nearest.dE < R.minDeltaE) errors.push(`ACCENT_CONTRAST ${hex}: dE2000 ${nearest.dE.toFixed(1)} to ${nearest.name} ${nearest.hex} < ${R.minDeltaE.toFixed(1)}`);
  if (C < R.minChroma) errors.push(`ACCENT_CONTRAST ${hex}: chroma C* ${C.toFixed(1)} < ${R.minChroma.toFixed(1)}`);
  if (lab[0] < R.minLightness) errors.push(`ACCENT_CONTRAST ${hex}: L* ${lab[0].toFixed(1)} < ${R.minLightness.toFixed(1)} (${R.basis.floorEntry}) — reads as another dark shape`);
  return { ok: errors.length === 0, hex, L: lab[0], C, nearest, errors };
}

export function loadAccents(root = ROOT) {
  return JSON.parse(readFileSync(join(root, 'assets/src/accent.json'), 'utf8'));
}

/** Every candidate in assets/src/accent.json must pass; `default` must name one of them. */
export function checkAccents(root = ROOT) {
  const acc = loadAccents(root);
  const palette = loadPalette(root);
  const rows = Object.entries(acc.candidates).map(([name, hex]) => ({ name, ...accentContrast(hex, palette) }));
  const errors = rows.flatMap((r) => r.errors.map((e) => `${r.name}: ${e}`));
  const fixtures = Object.entries(acc.must_fail ?? {}).map(([name, hex]) => ({ name, ...accentContrast(hex, palette) }));
  for (const f of fixtures) if (f.ok) errors.push(`ACCENT_CONTRAST: must_fail fixture ${f.name} ${f.hex} PASSED — the rule has gone soft`);
  if (!(acc.default in acc.candidates)) errors.push(`ACCENT_CONTRAST: default "${acc.default}" is not one of the candidates`);
  return { ok: errors.length === 0, rows, fixtures, errors, default: acc.default, rule: accentRule(palette) };
}

export function printAccents(res) {
  for (const r of res.rows) {
    console.log(`  ${r.ok ? '✓' : '✗'} ${r.name.padEnd(14)} ${r.hex}  L* ${r.L.toFixed(1).padStart(5)}  C* ${r.C.toFixed(1).padStart(5)}  nearest ${r.nearest.name} dE2000 ${r.nearest.dE.toFixed(1)}${r.name === res.default ? '   (default until H2.5)' : ''}`);
  }
  for (const f of res.fixtures) console.log(`  ${f.ok ? '✗' : '✓'} ${f.name.padEnd(14)} ${f.hex}  rejected as required: ${f.errors.map((e) => e.replace(/^ACCENT_CONTRAST \S+: /, '')).join('; ')}`);
  for (const e of res.errors) console.log(`  ✗ ${e}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv[2]) {
    const r = accentContrast(process.argv[2]);
    console.log(`${r.hex}  L* ${r.L.toFixed(1)}  C* ${r.C.toFixed(1)}  nearest ${r.nearest.name} ${r.nearest.hex} dE2000 ${r.nearest.dE.toFixed(1)}  ${r.ok ? 'PASS' : r.errors.join('; ')}`);
  } else {
    const res = checkAccents();
    const R = res.rule;
    console.log(`ACCENT_CONTRAST vs reference/palette.json: dE2000 >= ${R.minDeltaE.toFixed(1)} (2 x ramp step ${R.basis.maxStep.toFixed(1)}), C* >= ${R.minChroma.toFixed(1)} (3 x palette max ${R.basis.maxChroma.toFixed(1)}), L* >= ${R.minLightness.toFixed(1)} (${R.basis.floorEntry})`);
    printAccents(res);
    console.log(res.ok ? 'ACCENT PASS' : 'ACCENT FAIL');
    process.exit(res.ok ? 0 : 1);
  }
}
