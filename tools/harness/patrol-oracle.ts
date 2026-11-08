// An INDEPENDENT closed form of the patroller motion, used only as a test oracle by the `hazards`
// stage. The game's runtime is patrollerAt() in src/loaders/level.ts; this file is written separately
// on purpose. Two implementations agreeing to the last bit at every sampled t is the evidence that the
// runtime is the pure function Q6/B-12 specify (and OQ-012's ping-pong) rather than accumulated state.
//
//   u(t) = frac(phase + t * speed / (2 * pathLength))      one loop = out and back
//   distance from path[0] = 2 * pathLength * min(u, 1 - u)

export type V3 = [number, number, number];

export function oraclePatroller(path: readonly V3[], speed: number, phase: number, t: number): V3 {
  const seg = path.slice(1).map((b, i) => Math.hypot(b[0] - path[i]![0], b[1] - path[i]![1], b[2] - path[i]![2]));
  const total = seg.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return [...path[0]!];
  const raw = phase + (t * speed) / (2 * total);
  const u = raw - Math.floor(raw);
  let left = 2 * total * Math.min(u, 1 - u);
  for (let i = 0; i < seg.length; i++) {
    if (left <= seg[i]! || i === seg.length - 1) {
      const k = seg[i]! > 0 ? Math.min(1, left / seg[i]!) : 0;
      const a = path[i]!;
      const b = path[i + 1]!;
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
    }
    left -= seg[i]!;
  }
  return [...path[0]!];
}

export function oracleLoopFraction(path: readonly V3[], speed: number, phase: number, t: number): number {
  const total = path.slice(1).reduce((a, b, i) => a + Math.hypot(b[0] - path[i]![0], b[1] - path[i]![1], b[2] - path[i]![2]), 0);
  const raw = phase + (t * speed) / (2 * total);
  return raw - Math.floor(raw);
}
