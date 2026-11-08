// accent — ACCENT_AREA (PHASE-0-DECISIONS D-003), the sibling of ACCENT_CONTRAST (D-001).
//
// The accent's share of the frame is asserted inside a BAND at the GAMEPLAY follow framing, not as a
// global percentage: the same gate is huge at 5u and a speck at 80u, so a single number conflates
// distance with intent. Band and its basis: assets/src/accent.json `area`, MEASUREMENTS.md
// "D-003 accent area".
//
// The framing, for each kit_torii placed in the level:
//   1. project the torii onto the critical path polyline (horizontal distance)
//   2. walk back `area.ahead_m` along the path -> the player's feet P, path tangent t (horizontal)
//   3. the camera rig exactly as src/engine/camera.ts rests it: pivot = P + pivotHeight, camera on the
//      arm `distance` behind the pivot along -t at `initialPitchDeg`, looking at the pivot
// The frame is the real level (occlusion and every other torii in view count): what a player sees.
// Accent pixels = within 6/255 per channel of the active accent (unlit, tone mapping off -> exact).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pngjs from 'pngjs';
import { Stage, guard, openGame, wp, type Ctx, type StageResult, type Vec3 } from './lib.ts';

const { PNG } = pngjs;

/** The rest pose of the follow camera, READ from CAMERA_TUNING in src/engine/camera.ts (never retyped). */
export function followRig(root: string): { distance: number; pivotHeight: number; pitchDeg: number } {
  const src = readFileSync(join(root, 'src/engine/camera.ts'), 'utf8');
  const num = (key: string): number => {
    const m = src.match(new RegExp(`\\b${key}:\\s*(-?[0-9.]+)`));
    if (!m) throw new Error(`CAMERA_TUNING.${key} not found in src/engine/camera.ts`);
    return Number(m[1]);
  };
  return { distance: num('distance'), pivotHeight: num('pivotHeight'), pitchDeg: num('initialPitchDeg') };
}

export interface AreaBand {
  ahead_m: number;
  floor_pct: number;
}

/** Ceiling of the band: the least-used ramp value's share of the seed (reference/palette.json), in %. */
export function areaCeiling(root: string): { pct: number; name: string } {
  const colors = (JSON.parse(readFileSync(join(root, 'reference/palette.json'), 'utf8')) as { colors: { name: string; share: number }[] }).colors;
  const min = colors.reduce((a, c) => (c.share < a.share ? c : a));
  return { pct: +(min.share * 100).toFixed(3), name: min.name };
}

type Placement = { asset: string; pos: Vec3 };

/** Feet position `back` metres before the torii's projection on the critical path, and the path tangent there. */
export function followFraming(path: Vec3[], torii: Vec3, back: number, rig: { distance: number; pivotHeight: number; pitchDeg: number }): { feet: Vec3; cam: Vec3; target: Vec3 } {
  // arc-length param of the closest point (horizontal) on the polyline
  let best = { d: Infinity, s: 0 };
  let acc = 0;
  const segs: { a: Vec3; b: Vec3; len: number; s0: number }[] = [];
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i]!;
    const b = path[i + 1]!;
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
    segs.push({ a, b, len, s0: acc });
    if (len > 1e-6) {
      const u = Math.max(0, Math.min(1, ((torii[0] - a[0]) * (b[0] - a[0]) + (torii[2] - a[2]) * (b[2] - a[2])) / (len * len)));
      const d = Math.hypot(a[0] + u * (b[0] - a[0]) - torii[0], a[2] + u * (b[2] - a[2]) - torii[2]);
      if (d < best.d) best = { d, s: acc + u * len };
    }
    acc += len;
  }
  const s = Math.max(0, best.s - back);
  const seg = segs.find((g) => g.len > 1e-6 && s <= g.s0 + g.len) ?? segs[segs.length - 1]!;
  const u = seg.len > 1e-6 ? (s - seg.s0) / seg.len : 0;
  const feet: Vec3 = [seg.a[0] + u * (seg.b[0] - seg.a[0]), seg.a[1] + u * (seg.b[1] - seg.a[1]), seg.a[2] + u * (seg.b[2] - seg.a[2])];
  const tx = (seg.b[0] - seg.a[0]) / seg.len;
  const tz = (seg.b[2] - seg.a[2]) / seg.len;
  const pivot: Vec3 = [feet[0], feet[1] + rig.pivotHeight, feet[2]];
  const p = (rig.pitchDeg * Math.PI) / 180;
  const cam: Vec3 = [pivot[0] - tx * rig.distance * Math.cos(p), pivot[1] + rig.distance * Math.sin(p), pivot[2] - tz * rig.distance * Math.cos(p)];
  return { feet, cam, target: pivot };
}

export async function accentShare(page: import('@playwright/test').Page, cam: Vec3, target: Vec3, hex: string): Promise<number> {
  await page.evaluate(([c, t]) => {
    window.__HARNESS__!.setCamera(c, t);
    window.__HARNESS__!.advance(1);
  }, [cam, target] as const);
  const png = PNG.sync.read(await page.locator('canvas').first().screenshot());
  const [r, g, b] = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16)) as [number, number, number];
  let hits = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    if (Math.abs(png.data[i]! - r) <= 6 && Math.abs(png.data[i + 1]! - g) <= 6 && Math.abs(png.data[i + 2]! - b) <= 6) hits++;
  }
  return (100 * hits) / (png.width * png.height);
}

export function loadAccentConfig(root: string): { default: string; candidates: Record<string, string>; area: AreaBand } {
  return JSON.parse(readFileSync(join(root, 'assets/src/accent.json'), 'utf8'));
}

export async function accent(ctx: Ctx): Promise<StageResult> {
  const st = new Stage('accent');
  return guard(st, async () => {
    const acc = loadAccentConfig(ctx.root);
    const band = acc.area;
    const level = ctx.level as unknown as { geometry: Placement[]; critical_path: Parameters<typeof wp>[0][] };
    const torii = level.geometry.filter((g) => g.asset === 'kit_torii');
    if (torii.length === 0) {
      st.check('ACCENT_AREA', true, 'no kit_torii in this level — nothing to assert');
      return;
    }
    const path = level.critical_path.map((w) => wp(w).pos);
    const hex = acc.candidates[acc.default]!;
    const rig = followRig(ctx.root);
    const ceil = areaCeiling(ctx.root);
    const g = await openGame(ctx);
    try {
      const rows: { pos: Vec3; pct: number }[] = [];
      for (const t of torii) {
        const f = followFraming(path, t.pos, band.ahead_m, rig);
        const pct = await accentShare(g.page, f.cam, f.target, hex);
        rows.push({ pos: t.pos, pct });
        st.check(
          `ACCENT_AREA torii (${t.pos.join(', ')})`,
          pct >= band.floor_pct && pct <= ceil.pct,
          `${pct.toFixed(3)}% at follow framing ${band.ahead_m}m before it (band ${band.floor_pct}% floor .. ${ceil.pct}% ${ceil.name})`,
        );
      }
      st.data['accentArea'] = { band, ceiling: ceil, accent: `${acc.default} ${hex}`, rows };
      st.check('zero console errors', g.errors.length === 0, g.errors.slice(0, 5).join(' | ') || 'none');
    } finally {
      await g.close();
    }
  });
}
