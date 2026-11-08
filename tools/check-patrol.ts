#!/usr/bin/env node
// check:patrol — properties of the patroller runtime, run under Node with no browser (B-12, Q6, OQ-012).
// Tests the REAL function the game and PHASE_SWEEP use (src/systems/patrol.ts), not a copy. Purity is
// what lets PHASE_SWEEP choose arrival phases by choosing t; these hold for ANY t.
//
//   npm run check:patrol      exit 0 every property holds · 1 a property failed

import { patrolLength, patrolPeriod, patrolPosition, type V3 } from '../src/systems/patrol.ts';
import { oraclePatroller } from './harness/patrol-oracle.ts';

const DT = 1 / 60;
const fails: string[] = [];
let checks = 0;
const ok = (name: string, cond: boolean, detail = ''): void => {
  checks++;
  if (!cond) fails.push(`${name}${detail ? `: ${detail}` : ''}`);
};
const dist = (a: V3, b: V3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// routes: the example level's patroller, an L-shaped 3-segment route, a vertical one, a route with a
// zero-length segment (repeated point)
const ROUTES: { path: V3[]; speed: number; phase: number }[] = [
  { path: [[78, 11, -46], [78, 11, -58]], speed: 4, phase: 0 },
  { path: [[0, 0, 0], [6, 0, 0], [6, 0, 4], [6, 3, 4]], speed: 2.5, phase: 0.3 },
  { path: [[0, 0, 0], [0, 5, 0]], speed: 1, phase: 0.9 },
  { path: [[0, 1, -3], [2, 1, 0], [2, 1, 0], [0, 1, 3]], speed: 2, phase: 0.25 },
];
const TS = [0, 0.37, 5, 123.456, 1e4 + 0.1];

for (const [n, r] of ROUTES.entries()) {
  const tag = `route${n}`;
  const at = (t: number, phase = r.phase): V3 => patrolPosition(r.path, r.speed, phase, t);
  const P = patrolPeriod(r.path, r.speed)!;

  ok(`${tag} period = 2 x length / speed`, Math.abs(P - (2 * patrolLength(r.path)) / r.speed) < 1e-12);
  // pure: same t, same answer, in any call order
  const a = TS.map((t) => at(t));
  const b = [...TS].reverse().map((t) => at(t)).reverse();
  ok(`${tag} pure`, a.every((p, i) => dist(p, b[i]!) === 0));
  // periodic, and phase is a time offset
  for (const t of TS) {
    ok(`${tag} periodic t=${t}`, dist(at(t), at(t + P)) < 1e-6);
    ok(`${tag} phase=offset t=${t}`, dist(at(t), at(t + r.phase * P, 0)) < 1e-6);
  }
  // ping-pong: path[0] at loop start, far end at half a loop, never teleports — no tick moves it further
  // than speed*dt, across three loops including every wrap
  ok(`${tag} start`, dist(at(0, 0), r.path[0]!) < 1e-12);
  ok(`${tag} far end at half loop`, dist(at(P / 2, 0), r.path[r.path.length - 1]!) < 1e-6);
  let worst = 0;
  for (let k = 0; k < Math.ceil((3 * P) / DT); k++) worst = Math.max(worst, dist(at(k * DT), at((k + 1) * DT)));
  ok(`${tag} continuous`, worst <= r.speed * DT + 1e-9, `max step ${worst.toFixed(6)} > speed*dt ${(r.speed * DT).toFixed(6)}`);
  // agrees with an independently written closed form (tools/harness/patrol-oracle.ts)
  let dev = 0;
  for (let k = 0; k < 500; k++) {
    const t = k * 0.0731;
    dev = Math.max(dev, dist(at(t), oraclePatroller(r.path, r.speed, r.phase, t)));
  }
  ok(`${tag} = independent oracle`, dev < 1e-9, `max deviation ${dev.toExponential(2)}`);
}
// degenerate route: never moves, no period
ok('zero-length path is still', dist(patrolPosition([[1, 2, 3], [1, 2, 3]], 3, 0.5, 7), [1, 2, 3]) === 0 && patrolPeriod([[1, 2, 3], [1, 2, 3]], 3) === null);

console.log(`check:patrol — ${checks} properties over ${ROUTES.length} routes (src/systems/patrol.ts, the runtime itself)`);
for (const f of fails) console.log(`  ✗ ${f}`);
console.log(fails.length ? 'PATROL FAIL' : 'PATROL PASS');
process.exit(fails.length ? 1 : 0);
