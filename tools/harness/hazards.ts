// hazards — the patroller runtime (B-12) and the world clock (D-004 / B-13) proven in the real game.
//
// Runs tools/harness/fixtures/patroller.json (one patroller across a flat pad) through the same
// validation and build path as a level in levels/, then asserts:
//   1. the runtime's patroller position (patrollerAt in src/loaders/level.ts, read back through
//      snapshot.hazards) equals an INDEPENDENT closed form (patrol-oracle.ts) at every sampled world
//      time — a pure function of the clock, no per-hazard state anywhere
//   2. touching the patroller is death (Q6: a hazard is a moving fall plane)
//   3. the world clock runs through death: the respawn lands respawnDelaySec later on the clock, so
//      at a DIFFERENT patroller phase than the death (Q6 rejected per-attempt repeatability)
//   4. pause freezes the world clock and the patroller
// Fixture, not a level: it is not linted, not nav-tested, and not in levels/.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Stage, guard, VIEWPORT, type Ctx, type StageResult, type Vec3 } from './lib.ts';
import { oracleLoopFraction, oraclePatroller } from './patrol-oracle.ts';

const FIXTURE = 'tools/harness/fixtures/patroller.json';
const d = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export async function hazards(ctx: Ctx): Promise<StageResult> {
  const st = new Stage('hazards');
  return guard(st, async () => {
    const text = readFileSync(join(ctx.root, FIXTURE), 'utf8');
    const fx = JSON.parse(text) as { hazards: { type: string; path?: Vec3[]; speed?: number; phase?: number }[] };
    const idx = fx.hazards.findIndex((h) => h.type === 'patroller');
    const def = fx.hazards[idx] as { path: Vec3[]; speed: number; phase: number };
    const at = (t: number): Vec3 => oraclePatroller(def.path, def.speed, def.phase, t);
    const frac = (t: number): number => oracleLoopFraction(def.path, def.speed, def.phase, t);
    const page = await ctx.browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
    try {
      await page.goto(`${ctx.baseUrl}/?harness=1&level=00-gym`);
      await page.waitForFunction(() => window.__HARNESS__?.version === 'HARNESS_API_V1', null, { timeout: 20000 });
      const started = await page.evaluate((t) => window.__HARNESS__!.startJson(t), text);
      if (!st.check('fixture loads', started.ok, started.ok ? FIXTURE : (started.error ?? 'failed'))) return;

      // 1. runtime == pure function, sampled over two full loops while the world runs
      const samples = await page.evaluate((i) => {
        const H = window.__HARNESS__!;
        H.setInput(null);
        const out: { t: number; pos: Vec3 }[] = [];
        for (let k = 0; k < 40; k++) {
          const s = H.advance(17, 0); // 17: coprime with the loop, so samples land all over it
          out.push({ t: s.runTime, pos: s.hazards.find((h) => h.index === i)!.pos });
        }
        return out;
      }, idx);
      const worst = Math.max(...samples.map((s) => d(s.pos, at(s.t))));
      st.check('runtime = pure function of the clock', worst < 1e-5, `${samples.length} samples over ${samples.at(-1)!.t.toFixed(2)}s, max |runtime - independent oracle| ${worst.toExponential(1)}u`);

      // 2 + 3. step onto it -> death; respawn later on the clock, at a new phase
      const r = await page.evaluate(() => {
        const H = window.__HARNESS__!;
        const before = H.snapshot();
        const c = before.hazards.find((h) => h.type === 'patroller')!.pos;
        H.teleportPlayer([c[0], 0, c[2]]); // feet on the pad, inside the volume's footprint
        let s = H.advance(1, 0);
        const died = s.deaths === before.deaths + 1 && s.state === 'death';
        const deathT = s.runTime;
        let guardN = 0;
        while (s.state === 'death' && guardN++ < 600) s = H.advance(1, 0);
        return { died, deaths: s.deaths, deathT, respawnT: s.runTime, state: s.state, rules: H.rules };
      });
      st.check('touching the patroller is death', r.died, r.died ? `death #${r.deaths} at t=${r.deathT.toFixed(4)}s` : 'player overlapped the patroller and lived');
      const span = r.respawnT - r.deathT;
      const okSpan = span >= r.rules.respawnDelaySec - 1e-9 && span <= r.rules.respawnDelaySec + r.rules.fixedDt + 1e-9;
      st.check('world clock runs through death', r.state === 'play' && okSpan, `clock ${r.deathT.toFixed(4)} -> ${r.respawnT.toFixed(4)}s (+${span.toFixed(4)}, respawn delay ${r.rules.respawnDelaySec}s)`);
      const u0 = frac(r.deathT);
      const u1 = frac(r.respawnT);
      st.check('respawn at a new phase', Math.abs(u1 - u0) > 1e-6, `patroller loop fraction ${u0.toFixed(4)} at death -> ${u1.toFixed(4)} at respawn`);

      // 4. pause: no world time passes, the patroller does not move
      await page.keyboard.press('KeyP');
      const p = await page.evaluate(() => {
        const H = window.__HARNESS__!;
        const a = H.snapshot();
        const b = H.advance(120, 0);
        const pos = (x: typeof a): Vec3 => x.hazards.find((h) => h.type === 'patroller')!.pos;
        return { state: b.state, t0: a.runTime, t1: b.runTime, p0: pos(a), p1: pos(b) };
      });
      await page.keyboard.press('KeyP');
      st.check('pause freezes the world clock', p.state === 'pause' && p.t1 === p.t0 && d(p.p0, p.p1) === 0, `state ${p.state}, clock ${p.t0.toFixed(4)} -> ${p.t1.toFixed(4)}s over 120 frames`);
      st.check('zero console errors', errors.length === 0, errors.slice(0, 5).join(' | ') || 'none');
    } finally {
      await page.close();
    }
  });
}
