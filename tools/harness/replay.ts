// replay — plays back a recorded InputFrame trace and ASSERTS ON OUTCOME WITHIN TOLERANCE, not on
// exact positions: goal reached, checkpoints in order, final position within 0.5u, frame count to
// the goal within 5%. Traces are recorded from a green nav run (`npm run playtest -- --record`)
// and committed under tools/harness/traces/<level>.json.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { FAILURE, FIXED_HZ, Stage, fmt, guard, openGame, type Ctx, type InputFrame, type StageResult, type Vec3 } from './lib.ts';

export const REPLAY_CONFIG = {
  positionTolerance: 0.5, // m, final feet position vs recorded
  frameTolerance: 0.05,   // fraction, ticks-to-goal vs recorded
  extraTicks: 120,        // run past the end of the trace this long before giving up on the goal
};

export interface Trace {
  level: string;
  recordedAt: string;
  source: string;
  frames: InputFrame[];
  expect: { ticks: number; final: Vec3; checkpoints: number[] };
}

export const tracePath = (root: string, level: string): string => join(root, 'tools/harness/traces', `${level}.json`);

export function writeTrace(root: string, t: Trace): string {
  const p = tracePath(root, t.level);
  mkdirSync(dirname(p), { recursive: true });
  // one frame per line: diffable, and a 5k-frame trace stays readable
  const frames = t.frames.map((f) => JSON.stringify(f)).join(',\n    ');
  const { frames: _f, ...head } = t;
  const json = JSON.stringify(head, null, 2).replace(/\n}$/, `,\n  "frames": [\n    ${frames}\n  ]\n}\n`);
  writeFileSync(p, json);
  return p;
}

export async function replay(ctx: Ctx): Promise<StageResult> {
  const st = new Stage('replay');
  return guard(st, async () => {
    const p = tracePath(ctx.root, ctx.levelId);
    if (!existsSync(p)) {
      st.failureClass = FAILURE.SETUP;
      st.check('trace exists', false, `${p} missing — record one from a green nav run: npm run playtest -- --level=${ctx.levelId} --record`);
      return;
    }
    const trace = JSON.parse(readFileSync(p, 'utf8')) as Trace;
    const C = REPLAY_CONFIG;
    const g = await openGame(ctx);
    try {
      const out = await g.page.evaluate(
        ([frames, maxTicks]) => {
          const H = window.__HARNESS__!;
          H.setInput(null);
          H.playback(frames);
          const t0 = H.snapshot().tick;
          let s = H.snapshot();
          // render every 60th frame; the sim does not depend on rendering
          while (s.state !== 'results' && s.tick - t0 < maxTicks) s = H.advance(1, 60);
          return { snap: s, ticks: s.tick - t0 };
        },
        [trace.frames, trace.frames.length + C.extraTicks] as const,
      );
      const s = out.snap;
      const e = trace.expect;
      const dPos = Math.hypot(s.feet[0] - e.final[0], s.feet[1] - e.final[1], s.feet[2] - e.final[2]);
      const dFrames = Math.abs(out.ticks - e.ticks) / e.ticks;
      st.check('goal reached', s.state === 'results', s.state === 'results' ? `results after ${out.ticks} ticks` : `state=${s.state} after ${out.ticks} ticks (trace has ${trace.frames.length}); player at ${fmt(s.feet)}, deaths=${s.deaths}${s.lastDeath ? ` (last at ${fmt(s.lastDeath)})` : ''}`);
      st.check('checkpoints in order', JSON.stringify(s.checkpoints) === JSON.stringify(e.checkpoints), `got [${s.checkpoints.join(',')}], expected [${e.checkpoints.join(',')}]`);
      st.check(`position within ${C.positionTolerance}u`, dPos <= C.positionTolerance, `final ${fmt(s.feet)} vs ${fmt(e.final)}: ${dPos.toFixed(3)}u`);
      st.check(`frames within ${C.frameTolerance * 100}%`, s.state === 'results' && dFrames <= C.frameTolerance, `${out.ticks} vs ${e.ticks} ticks (${(dFrames * 100).toFixed(2)}%, ${(out.ticks / FIXED_HZ).toFixed(2)}s)`);
      st.check('zero console errors', g.errors.length === 0, g.errors.slice(0, 5).join(' | ') || 'none');
      st.data['trace'] = p.replace(`${ctx.root}/`, '');
    } finally {
      await g.close();
    }
  });
}
