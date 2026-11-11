// ambient-motion (B-15, SPEC §7 NOT row 18, Q2a): "Nothing translates except the player and hazards."
//
// Every level in levels/ is loaded and left to run with no input for 10 s of world time. Every visible
// renderable is sampled once a second (window.__HARNESS__.translators()). An object whose world position
// moves, with no `userData.translates` tag on it or an ancestor, is ambient motion: an error.
//
// Tags, and where they are set: `enemy` (the level's swordsmen, src/main.ts: D-023), `player` (the player mesh and the landing mark, src/main.ts),
// `hazard` (hazard volumes and the patroller's crow cue, src/loaders/level.ts), and `platform` (moving
// platforms, level.ts). Platforms are not in Q2a's sentence. They are allowed because `platform` is one
// of the eight moves Q2 closed, so a moving platform is the move's affordance, not ambience. That reading
// is OQ-054's, and the approver may override it.
//
// Rotation in place is allowed (Q2a: a perched crow's head-turn), so only translation is measured.
//
// Known limits:
//   - Motion done in a vertex shader or via a texture offset never moves an Object3D, so it is not seen.
//   - A tag is trusted. Tagging an ambient prop `hazard` would pass, but the tag can only come from code
//     a reviewer reads.
//   - 10 s idle at spawn: something that moves only when the player is near, or only after 10 s, is not
//     seen. The nav stages cover the route but do not sample this.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Stage, guard, openGame, type Ctx, type StageResult } from './lib.ts';

const SAMPLES = 10, TICKS_PER_SAMPLE = 60, EPS = 1e-4; // 10 s at 60 Hz; EPS: float noise in getWorldPosition, far below any visible motion

export async function ambientMotion(ctx: Omit<Ctx, 'levelId' | 'level' | 'segments'>): Promise<StageResult> {
  const st = new Stage('ambient-motion');
  return guard(st, async () => {
    const files = readdirSync(join(ctx.root, 'levels')).filter((f) => /^[0-9].*\.json$/.test(f)).sort();
    let taggedMovers = 0;
    for (const f of files) {
      const level = JSON.parse(readFileSync(join(ctx.root, 'levels', f), 'utf8'));
      const g = await openGame({ ...ctx, levelId: level.id, level, segments: (level.checkpoints?.length ?? 0) + 1 } as Ctx);
      try {
        type T = { id: string; name: string; tag: string | null; pos: [number, number, number] };
        const first = await g.page.evaluate(() => { window.__HARNESS__!.setInput(null); return window.__HARNESS__!.translators(); }) as T[];
        const max = new Map<string, number>();
        for (let k = 0; k < SAMPLES; k++) {
          const now = await g.page.evaluate((n) => { window.__HARNESS__!.advance(n, 0); return window.__HARNESS__!.translators(); }, TICKS_PER_SAMPLE) as T[];
          const by = new Map(now.map((o) => [o.id, o]));
          for (const o of first) {
            const p = by.get(o.id);
            if (!p) continue;
            const d = Math.hypot(p.pos[0] - o.pos[0], p.pos[1] - o.pos[1], p.pos[2] - o.pos[2]);
            max.set(o.id, Math.max(max.get(o.id) ?? 0, d));
          }
        }
        const moved = first.filter((o) => (max.get(o.id) ?? 0) > EPS);
        const ambient = moved.filter((o) => !o.tag);
        taggedMovers += moved.length - ambient.length;
        st.check(
          `${level.id}: nothing translates except the player, hazards and platforms`,
          ambient.length === 0,
          ambient.length
            ? ambient.slice(0, 4).map((o) => `${o.name} moved ${max.get(o.id)!.toFixed(3)} u`).join('; ')
            : `${first.length} renderables, ${moved.length} moved, all tagged (${[...new Set(moved.map((o) => o.tag))].join(', ') || 'none'})`,
        );
        st.check(`${level.id}: zero console errors`, g.errors.length === 0, g.errors.slice(0, 3).join(' | ') || 'none');
      } finally {
        await g.close();
      }
    }
    // a stage that never sees anything move proves nothing: the gym's platforms and patrollers must register
    st.check('the sampler sees motion at all (tagged movers > 0 across levels)', taggedMovers > 0, `${taggedMovers} tagged movers`);
  });
}
