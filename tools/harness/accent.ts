// accent — ACCENT_AREA (D-003 as revised by D-006), the sibling of ACCENT_CONTRAST (D-001).
//
// A FLOOR at scanning distance: from where the player looks for the next torii, its accent must cover
// enough of the frame to be found. No ceiling (D-006: walking through a gate legitimately fills the
// frame). Floor and its basis: assets/src/accent.json `area`, MEASUREMENTS.md "D-006 accent floor".
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
import type { Page } from '@playwright/test';
import { Stage, guard, openGame, wp, type Ctx, type StageResult, type Vec3 } from './lib.ts';

const { PNG } = pngjs;

/** The rest pose of the follow camera, READ from CAMERA_TUNING in src/engine/camera-tuning.ts (never retyped; split out of camera.ts for D-015b). */
export function followRig(root: string): { distance: number; pivotHeight: number; pitchDeg: number; pitchMinDeg: number; pitchMaxDeg: number; fovDeg: number } {
  const read = (file: string, key: string): number => {
    const m = readFileSync(join(root, file), 'utf8').match(new RegExp(`\\b${key}:\\s*(-?[0-9.]+)`));
    if (!m) throw new Error(`${key} not found in ${file}`);
    return Number(m[1]);
  };
  const num = (key: string): number => read('src/engine/camera-tuning.ts', key);
  return { distance: num('distance'), pivotHeight: num('pivotHeight'), pitchDeg: num('initialPitchDeg'), pitchMinDeg: num('pitchMinDeg'), pitchMaxDeg: num('pitchMaxDeg'), fovDeg: read('src/engine/render-config.ts', 'fovDeg') };
}

/**
 * D-012: the pitches a player can look from, swept across the rig's own clamp [pitchMinDeg, pitchMaxDeg]
 * plus the rest pitch. Step = fovDeg / 6 (derived, not chosen): a gate visible at any pitch is then
 * within a sixth of the frame of a sampled frame's centre band, never only clipped at an edge.
 */
export function scanPitches(rig: { pitchDeg: number; pitchMinDeg: number; pitchMaxDeg: number; fovDeg: number }): number[] {
  const step = rig.fovDeg / 6;
  const out = new Set<number>([rig.pitchDeg, rig.pitchMaxDeg]);
  for (let p = rig.pitchMinDeg; p < rig.pitchMaxDeg; p += step) out.add(+p.toFixed(3));
  return [...out].sort((a, b) => a - b);
}

/** Unit arm direction (pivot -> camera) for a player at `from` facing the gate at `to`, at `pitchDeg`. */
export function scanArm(from: Vec3, to: Vec3, pitchDeg: number): Vec3 {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const dist = Math.hypot(dx, dz);
  const [tx, tz] = dist > 1e-6 ? [dx / dist, dz / dist] : [1, 0];
  const p = (pitchDeg * Math.PI) / 180;
  return [-tx * Math.cos(p), Math.sin(p), -tz * Math.cos(p)];
}

export interface AreaFloor {
  floor_pct: number;
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

/**
 * Accent share of the frame belonging to ONE placement: render with it, render without it, count the
 * accent pixels that disappear. Real occlusion is kept (a nearer gate that hides it counts against it);
 * other gates in view are not credited to it.
 */
export async function placementAccentShare(page: Page, name: string, pos: Vec3, cam: Vec3, target: Vec3, hex: string): Promise<number> {
  const grab = async (): Promise<Uint8Array> => {
    await page.evaluate(([c, t]) => {
      window.__HARNESS__!.setCamera(c, t);
      window.__HARNESS__!.advance(1);
    }, [cam, target] as const);
    const png = PNG.sync.read(await page.locator('canvas').first().screenshot());
    const [r, g, b] = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16)) as [number, number, number];
    const hit = new Uint8Array(png.width * png.height);
    for (let i = 0; i < hit.length; i++) {
      const o = i * 4;
      hit[i] = Math.abs(png.data[o]! - r) <= 6 && Math.abs(png.data[o + 1]! - g) <= 6 && Math.abs(png.data[o + 2]! - b) <= 6 ? 1 : 0;
    }
    return hit;
  };
  const withIt = await grab();
  const hidden = await page.evaluate(([n, p]) => window.__HARNESS__!.setPlacementVisible(n, p, false), [name, pos] as const);
  if (hidden === 0) throw new Error(`no ${name} placement at (${pos.join(', ')})`);
  const without = await grab();
  await page.evaluate(([n, p]) => window.__HARNESS__!.setPlacementVisible(n, p, true), [name, pos] as const);
  let own = 0;
  for (let i = 0; i < withIt.length; i++) if (withIt[i] === 1 && without[i] === 0) own++;
  return (100 * own) / withIt.length;
}

export function loadAccentConfig(root: string): { default: string; candidates: Record<string, string>; area: AreaFloor } {
  return JSON.parse(readFileSync(join(root, 'assets/src/accent.json'), 'utf8'));
}

/**
 * Scanning framing (D-006): the player stands at `from` and looks for the gate at `to` — the follow rig
 * at rest, swung to face the gate (a scanning player turns the camera toward where the next torii is).
 */
export function scanningFraming(from: Vec3, to: Vec3, rig: { distance: number; pivotHeight: number; pitchDeg: number }): { cam: Vec3; target: Vec3; dist: number } {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const dist = Math.hypot(dx, dz);
  const [tx, tz] = dist > 1e-6 ? [dx / dist, dz / dist] : [1, 0];
  const pivot: Vec3 = [from[0], from[1] + rig.pivotHeight, from[2]];
  const p = (rig.pitchDeg * Math.PI) / 180;
  return { cam: [pivot[0] - tx * rig.distance * Math.cos(p), pivot[1] + rig.distance * Math.sin(p), pivot[2] - tz * rig.distance * Math.cos(p)], target: pivot, dist };
}

/** Arc-length position of a point's closest approach to the critical path (orders torii along the route). */
function arcOf(path: Vec3[], q: Vec3): number {
  let best = { d: Infinity, s: 0 };
  let acc = 0;
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i]!;
    const b = path[i + 1]!;
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
    if (len > 1e-6) {
      const u = Math.max(0, Math.min(1, ((q[0] - a[0]) * (b[0] - a[0]) + (q[2] - a[2]) * (b[2] - a[2])) / (len * len)));
      const d = Math.hypot(a[0] + u * (b[0] - a[0]) - q[0], a[2] + u * (b[2] - a[2]) - q[2]);
      if (d < best.d) best = { d, s: acc + u * len };
    }
    acc += len;
  }
  return best.s;
}

/**
 * ACCENT_AREA (D-003, revised by D-006): a FLOOR at scanning distance, never a ceiling — walking through a
 * gate legitimately fills the frame. Each torii, in route order, is scanned for from the previous anchor
 * (the previous torii, or spawn for the first): from there its accent must cover at least floor_pct of the
 * frame, the share at which findability was measured to hold (docs/build-log/accent/palette/curve.json).
 */
export async function accent(ctx: Ctx): Promise<StageResult> {
  const st = new Stage('accent');
  return guard(st, async () => {
    const acc = loadAccentConfig(ctx.root);
    const area = acc.area;
    const level = ctx.level as unknown as { spawn: { pos: Vec3 }; geometry: Placement[]; critical_path: Parameters<typeof wp>[0][] };
    const path = level.critical_path.map((w) => wp(w).pos);
    const torii = level.geometry.filter((g) => g.asset === 'kit_torii').sort((a, b) => arcOf(path, a.pos) - arcOf(path, b.pos));
    if (torii.length === 0) {
      st.check('ACCENT_AREA', true, 'no kit_torii in this level — nothing to assert');
      return;
    }
    const hex = acc.candidates[acc.default]!;
    const rig = followRig(ctx.root);
    const g = await openGame(ctx);
    try {
      // D-012: the floor must be met in SOME frame normal camera control reaches: every pitch in the rig's
      // clamp, the arm pulled in by the rig's own collision (rigCamera). The floor itself is unchanged.
      const pitches = scanPitches(rig);
      const rows: { pos: Vec3; from: Vec3; dist: number; pct: number; pitch: number; restPct: number }[] = [];
      let from: Vec3 = level.spawn.pos;
      for (const t of torii) {
        const f = scanningFraming(from, t.pos, rig);
        let best = { pct: -1, pitch: rig.pitchDeg };
        let restPct = 0;
        for (const p of pitches) {
          const cam = await g.page.evaluate(([pv, dir]) => window.__HARNESS__!.rigCamera(pv, dir), [f.target, scanArm(from, t.pos, p)] as const);
          const pct = await placementAccentShare(g.page, 'kit_torii', t.pos, cam, f.target, hex);
          if (p === rig.pitchDeg) restPct = pct;
          if (pct > best.pct) best = { pct, pitch: p };
        }
        rows.push({ pos: t.pos, from, dist: +f.dist.toFixed(2), pct: best.pct, pitch: best.pitch, restPct });
        st.check(
          `ACCENT_AREA torii (${t.pos.join(', ')})`,
          best.pct >= area.floor_pct,
          `${best.pct.toFixed(4)}% of frame is THIS gate's accent at pitch ${best.pitch.toFixed(0)} deg (rest ${rig.pitchDeg}: ${restPct.toFixed(4)}%), best of ${pitches.length} reachable pitches, scanned from (${from.join(', ')}), ${f.dist.toFixed(1)}m away (floor ${area.floor_pct}%)`,
        );
        from = t.pos;
      }
      st.data['accentArea'] = { floor_pct: area.floor_pct, accent: `${acc.default} ${hex}`, rows };
      st.check('zero console errors', g.errors.length === 0, g.errors.slice(0, 5).join(' | ') || 'none');
    } finally {
      await g.close();
    }
  });
}
