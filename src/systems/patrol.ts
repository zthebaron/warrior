// Patroller motion (B-12, Q6, OQ-012): a PURE function of (path, speed, phase, t). No three.js, no DOM,
// no stored state — so the game (src/loaders/level.ts), PHASE_SWEEP (tools/harness/sweep.ts) and
// check:patrol (tools/check-patrol.ts, under Node) all evaluate the SAME code, and the loop period has
// exactly one definition.
//
// Ping-pong along the polyline at `speed` u/s. One loop (out and back) is 2·length; `phase` is the start
// offset as a fraction of that loop. Path points are the hazard volume's CENTRE (D-005 / hazardHit).
// Algorithm moved verbatim from patrollerAt in 6dcc157; only the output type changed (tuple, not Vector3).

export type V3 = [number, number, number];

/** Length of the open polyline. */
export function patrolLength(path: readonly V3[]): number {
  let n = 0;
  for (let i = 1; i < path.length; i++) n += Math.hypot(path[i]![0] - path[i - 1]![0], path[i]![1] - path[i - 1]![1], path[i]![2] - path[i - 1]![2]);
  return n;
}

/** Seconds per loop (out and back). null for a degenerate (zero-length) path, which never moves. */
export function patrolPeriod(path: readonly V3[], speed: number): number | null {
  const total = patrolLength(path);
  return total > 0 && speed > 0 ? (2 * total) / speed : null;
}

/**
 * Where the patroller is in its loop at world time t, in [0,1). THE one definition: patrolPosition and
 * the crow cue (chapter 1, crowAt in src/loaders/level.ts) both derive from it, so a crow can never lift
 * off out of step with its hazard. 0 for a zero-length path.
 */
export function patrolFraction(path: readonly V3[], speed: number, phase: number, t: number): number {
  const total = patrolLength(path);
  if (!(total > 0)) return 0;
  return (((phase + (t * speed) / (2 * total)) % 1) + 1) % 1;
}

/** Position at world time t. */
export function patrolPosition(path: readonly V3[], speed: number, phase: number, t: number): V3 {
  const lens = path.slice(1).map((b, i) => Math.hypot(b[0] - path[i]![0], b[1] - path[i]![1], b[2] - path[i]![2]));
  const total = lens.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return [...path[0]!];
  const s = patrolFraction(path, speed, phase, t); // [0,1) around the loop
  let d = s < 0.5 ? s * 2 * total : (1 - s) * 2 * total; // distance from path[0]
  for (let i = 0; i < lens.length; i++) {
    const len = lens[i]!;
    if (d <= len || i === lens.length - 1) {
      const a = path[i]!, b = path[i + 1]!;
      const u = len > 0 ? Math.min(d / len, 1) : 0;
      return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
    }
    d -= len;
  }
  return [...path[0]!];
}
