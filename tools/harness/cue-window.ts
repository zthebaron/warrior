// cue-window — how late may a player leave after the crow lifts off and still clear? (CHAPTER-1-MEASURED)
// For every respawn point whose segment carries a crow cue, at all N arrival phases (as PHASE_SWEEP),
// the bot holds for lift-off and then for d more ticks before departing. Reports, per segment, the
// largest d that clears at EVERY arrival phase: the reaction window a human has. Report-only, not CI.
//   node tools/harness/cue-window.ts [level] [--skip-build]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { preflight } from './preflight.ts';
import { FIXED_HZ, openGame, wp, type Ctx } from './lib.ts';
import { walk, NAV_CONFIG } from './nav.ts';
import { respawnPoints, sweepPeriod, SWEEP_CONFIG } from './sweep.ts';

const ROOT = new URL('../..', import.meta.url).pathname;
const id = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? '01-lower-stair';
const level = JSON.parse(readFileSync(join(ROOT, 'levels', `${id}.json`), 'utf8'));
const pf = await preflight(ROOT, { skipBuild: process.argv.includes('--skip-build') });
const ctx = { browser: pf.browser, baseUrl: pf.baseUrl, levelId: id, level, segments: 0, root: ROOT, args: {}, log: console.log } as unknown as Ctx;
const g = await openGame(ctx);
const rules = await g.page.evaluate(() => window.__HARNESS__!.rules);
const pts = respawnPoints(level, rules.checkpointRadius, rules.goalHeightTolerance);
const P = sweepPeriod(level)!;
const N = SWEEP_CONFIG.offsets;
const tickLimit = Math.round(NAV_CONFIG.segmentBudgetSec * NAV_CONFIG.stallMultiplier * FIXED_HZ);
const path = level.critical_path.map(wp);
for (const [r, pt] of pts.entries()) {
  const nextStart = pts[r + 1]?.startIndex ?? path.length;
  if (!path.slice(pt.startIndex, nextStart).some((w: { cue?: number }) => w.cue !== undefined)) continue;
  let lastAll = -1;
  const rows: string[] = [];
  for (let d = 0; d <= 60; d += 3) {
    let ok = 0;
    for (let j = 0; j < N; j++) {
      await g.page.evaluate(([p, f, t]) => window.__HARNESS__!.respawnAt(p, f, t), [pt.pos, pt.facing, Math.round(((j * P) / N) * FIXED_HZ)] as const);
      const w = await walk(ctx, g.page, { startIndex: pt.startIndex, ...(pt.from ? { from: pt.from } : {}), ...(pt.untilCheckpoint !== undefined ? { untilCheckpoint: pt.untilCheckpoint } : {}), tickLimit, quiet: true, cueDelayTicks: d });
      if (!w.failure && (w.snap.state === 'results' || (pt.untilCheckpoint !== undefined && w.snap.checkpoints.includes(pt.untilCheckpoint)))) ok++;
    }
    rows.push(`${(d / FIXED_HZ).toFixed(2)}s:${ok}/${N}`);
    if (ok === N && lastAll === d - 3) lastAll = d;
    else if (ok === N && d === 0) lastAll = 0;
  }
  console.log(`seg ${r} ${pt.label}: reaction delay that still clears all ${N} phases: ${lastAll < 0 ? 'none' : `<= ${(lastAll / FIXED_HZ).toFixed(2)}s`}  [${rows.join(' ')}]`);
}
await g.close();
await pf.browser?.close();
pf.server?.kill();
process.exit(0);
