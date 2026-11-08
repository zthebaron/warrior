#!/usr/bin/env node
// check:patrol — properties of the patroller runtime (src/systems/patrol.ts, B-12), run under Node.
// The runtime must be a pure function of (def, t): these checks hold for ANY t, which is what lets
// PHASE_SWEEP (B-7) reason about arrival phases without simulating.
//
//   npm run check:patrol      exit 0 all properties hold · 1 a property failed

import { capsuleTouches, loopLength, patrolPosition, pathLength, type PatrolDef, type V3 } from '../src/systems/patrol.ts';

const DT = 1 / 60;
const EPS = 1e-9;
const fails: string[] = [];
let checks = 0;
const ok = (name: string, cond: boolean, detail = ''): void => {
  checks++;
  if (!cond) fails.push(`${name}${detail ? `: ${detail}` : ''}`);
};
const dist = (a: V3, b: V3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// fixtures: the example level's patroller, an L-shaped multi-segment route, a vertical one
const DEFS: PatrolDef[] = [
  { path: [[78, 11, -46], [78, 11, -58]], speed: 4, phase: 0, size: [1.5, 2, 1.5] },
  { path: [[0, 0, 0], [6, 0, 0], [6, 0, 4], [6, 3, 4]], speed: 2.5, phase: 0.3, size: [1, 1, 1] },
  { path: [[0, 0, 0], [0, 5, 0]], speed: 1, phase: 0.9, size: [2, 1, 2] },
];

for (const [n, d] of DEFS.entries()) {
  const L = loopLength(d.path);
  const period = L / d.speed;
  const tag = `def${n}`;

  // 1. purity: same t, same answer, in any call order
  const ts = [0, 0.37, 5, 123.456, 1e4 + 0.1];
  const first = ts.map((t) => patrolPosition(d, t));
  const again = [...ts].reverse().map((t) => patrolPosition(d, t)).reverse();
  ok(`${tag} pure`, first.every((p, i) => dist(p, again[i]!) < EPS));

  // 2. periodic: one loop later it is in the same place
  for (const t of ts) ok(`${tag} periodic t=${t}`, dist(patrolPosition(d, t), patrolPosition(d, t + period)) < 1e-6);

  // 3. phase is a time offset: phase p at t equals phase 0 at t + p * period
  const p0 = { ...d, phase: 0 };
  for (const t of ts) ok(`${tag} phase=offset t=${t}`, dist(patrolPosition(d, t), patrolPosition(p0, t + d.phase * period)) < 1e-6);

  // 4. ping-pong: starts at path[0], reaches the far end at half a loop, never teleports —
  //    no single tick moves it further than speed * dt, across several full loops incl. the wrap
  ok(`${tag} start`, dist(patrolPosition(p0, 0), d.path[0]!) < EPS);
  ok(`${tag} far end at half loop`, dist(patrolPosition(p0, period / 2), d.path[d.path.length - 1]!) < 1e-6);
  let worst = 0;
  for (let k = 0; k < Math.ceil((3 * period) / DT); k++) worst = Math.max(worst, dist(patrolPosition(d, k * DT), patrolPosition(d, (k + 1) * DT)));
  ok(`${tag} continuous`, worst <= d.speed * DT + 1e-9, `max step ${worst.toFixed(6)} > speed*dt ${(d.speed * DT).toFixed(6)}`);

  // 5. stays on the route
  ok(`${tag} loop = 2 x path`, Math.abs(L - 2 * pathLength(d.path)) < EPS);
}

// 6. contact: capsule at the patroller's position touches; one radius + half size clear does not
const d0 = DEFS[0]!;
const t0 = 1.75;
const at = patrolPosition(d0, t0);
ok('touch: inside', capsuleTouches(d0, t0, at, 0.35, 1.9));
ok('touch: beside, clear', !capsuleTouches(d0, t0, [at[0] + d0.size[0] / 2 + 0.35 + 0.01, at[1], at[2]], 0.35, 1.9));
ok('touch: just within reach', capsuleTouches(d0, t0, [at[0] + d0.size[0] / 2 + 0.35 - 0.01, at[1], at[2]], 0.35, 1.9));
ok('touch: above, clear', !capsuleTouches(d0, t0, [at[0], at[1] + d0.size[1] + 0.01, at[2]], 0.35, 1.9));
ok('touch: below, clear', !capsuleTouches(d0, t0, [at[0], at[1] - 1.9 - 0.01, at[2]], 0.35, 1.9));
ok('touch: depends on t', capsuleTouches(d0, t0, at, 0.35, 1.9) && !capsuleTouches(d0, t0 + loopLength(d0.path) / d0.speed / 2, at, 0.35, 1.9));

console.log(`check:patrol — ${checks} properties over ${DEFS.length} patrol routes`);
for (const f of fails) console.log(`  ✗ ${f}`);
console.log(fails.length ? 'PATROL FAIL' : 'PATROL PASS');
process.exit(fails.length ? 1 : 0);
