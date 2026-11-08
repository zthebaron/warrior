// Patroller runtime (B-12, Q6): a patroller's position is a PURE FUNCTION of the world clock.
//
//   u(t)   = frac(phase + t * speed / loopLength)        fraction of one loop
//   s(u)   = u * loopLength                               arc length along the loop
//   pos(t) = the path point at s, walking out then back   (ping-pong: one loop = out-and-back)
//
// No per-hazard mutable state exists anywhere: nothing is integrated tick to tick, nothing resets
// on death. Same t in, same position out — in the game, the linter, the harness and PHASE_SWEEP.
// `t` is the world clock (main.ts runTimeSec), which runs during `play` and `death` and stops only
// in `pause` (D-004). Path points are the BASE centre of the hazard volume (feet convention).
//
// Pure TS, no three.js, no DOM: tools/check-patrol.ts imports it directly under Node.

export type V3 = [number, number, number];

export interface PatrolDef {
  path: V3[];
  speed: number; // u/s along the path
  phase: number; // [0, 1): start offset as a fraction of one loop
  size: V3; // hazard volume (x, y, z); y extends UP from the path point
}

/** Length of the open polyline. */
export function pathLength(path: readonly V3[]): number {
  let n = 0;
  for (let i = 0; i + 1 < path.length; i++) n += Math.hypot(path[i + 1]![0] - path[i]![0], path[i + 1]![1] - path[i]![1], path[i + 1]![2] - path[i]![2]);
  return n;
}

/** One loop = out along the path and back: 2 x its length. */
export function loopLength(path: readonly V3[]): number {
  return 2 * pathLength(path);
}

/** Fraction of one loop at world time t, in [0, 1). */
export function loopFraction(def: Pick<PatrolDef, 'path' | 'speed' | 'phase'>, t: number): number {
  const L = loopLength(def.path);
  if (!(L > 0)) return 0;
  const u = def.phase + (t * def.speed) / L;
  return u - Math.floor(u);
}

/** Point at arc length s along the open polyline (clamped to its ends). */
export function pointAt(path: readonly V3[], s: number): V3 {
  let left = Math.max(0, s);
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i]!;
    const b = path[i + 1]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    if (left <= len || i + 2 === path.length) {
      const k = len > 0 ? Math.min(1, left / len) : 0;
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
    }
    left -= len;
  }
  return [...path[0]!];
}

/** Base-centre position of the patroller at world time t. */
export function patrolPosition(def: Pick<PatrolDef, 'path' | 'speed' | 'phase'>, t: number): V3 {
  const len = pathLength(def.path);
  const s = loopFraction(def, t) * 2 * len;
  return pointAt(def.path, s <= len ? s : 2 * len - s);
}

/**
 * Does a vertical capsule (feet point, radius, total height) touch the patroller's box at time t?
 * The box is widened by the capsule radius in x/z (a square-cornered approximation of the swept
 * sphere, conservative at the four corners) and must overlap the capsule's vertical span.
 */
export function capsuleTouches(def: PatrolDef, t: number, feet: V3, radius: number, height: number): boolean {
  const p = patrolPosition(def, t);
  const hx = def.size[0] / 2 + radius;
  const hz = def.size[2] / 2 + radius;
  if (Math.abs(feet[0] - p[0]) > hx || Math.abs(feet[2] - p[2]) > hz) return false;
  return feet[1] < p[1] + def.size[1] && feet[1] + height > p[1];
}
