// counters — Tier-1 renderer.info budgets ONLY. Headless Chromium renders on SwiftShader, so
// FRAME TIME HERE IS MEANINGLESS and is deliberately never asserted. renderer.info counters are
// valid on any backend: draw calls, triangles, geometries, textures. Peak over a full trace
// playback plus every visual camera.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Stage, guard, openGame, type Ctx, type InputFrame, type StageResult } from './lib.ts';
import { tracePath } from './replay.ts';
import { cameras } from './visual.ts';

export const TIER1 = { calls: 300, triangles: 500_000, geometries: 400, textures: 120 };
const SAMPLE_EVERY = 30;   // frames between counter samples (each sample frame is rendered)
const NO_TRACE_FRAMES = 600;

export async function counters(ctx: Ctx): Promise<StageResult> {
  const st = new Stage('counters');
  return guard(st, async () => {
    const p = tracePath(ctx.root, ctx.levelId);
    const frames: InputFrame[] = existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as { frames: InputFrame[] }).frames : [];
    const g = await openGame(ctx);
    try {
      const peak = await g.page.evaluate(
        ([fr, every, idle, cams]) => {
          const H = window.__HARNESS__!;
          const max = { calls: 0, triangles: 0, geometries: 0, textures: 0, samples: 0 };
          const take = (): void => {
            const i = H.rendererInfo();
            max.calls = Math.max(max.calls, i.calls);
            max.triangles = Math.max(max.triangles, i.triangles);
            max.geometries = Math.max(max.geometries, i.geometries);
            max.textures = Math.max(max.textures, i.textures);
            max.samples++;
          };
          H.advance(1);
          take();
          for (const c of cams) {
            H.setCamera(c.pos, c.target);
            H.advance(1);
            take();
          }
          H.releaseCamera();
          if (fr.length) H.playback(fr);
          const total = fr.length || idle;
          for (let n = 0; n < total; n += every) {
            H.advance(every, 0); // renders only the last frame of each batch
            take();
          }
          return max;
        },
        [frames, SAMPLE_EVERY, NO_TRACE_FRAMES, cameras(ctx.level)] as const,
      );
      const src = frames.length ? `trace playback (${frames.length} frames) + ${cameras(ctx.level).length} cameras` : `${NO_TRACE_FRAMES} idle frames (no trace) + cameras`;
      st.data['peak'] = peak;
      st.check(`draw calls < ${TIER1.calls}`, peak.calls < TIER1.calls, `peak ${peak.calls}`);
      // Scene ratchet (OQ-040): the level's measured peak, so a +1 cannot ride in unexplained under the
      // 300 ceiling. tools/assets/budgets.json `scenes`, reasons in MEASUREMENTS.md 'Scene budgets'.
      const scene = (JSON.parse(readFileSync(join(ctx.root, 'tools/assets/budgets.json'), 'utf8')).scenes ?? {})[ctx.levelId] as { draw_calls: number; triangles: number } | undefined;
      st.check('scene budget recorded', !!scene, scene ? `budgets.json scenes["${ctx.levelId}"]` : `no line for ${ctx.levelId}: measure it, record it in MEASUREMENTS.md 'Scene budgets', add it to budgets.json`);
      if (scene) {
        st.check(`draw calls <= ${scene.draw_calls} (scene)`, peak.calls <= scene.draw_calls, `peak ${peak.calls}`);
        st.check(`triangles <= ${scene.triangles} (scene)`, peak.triangles <= scene.triangles, `peak ${peak.triangles}`);
      }
      st.check(`triangles < ${TIER1.triangles.toLocaleString('en-US')}`, peak.triangles < TIER1.triangles, `peak ${peak.triangles.toLocaleString('en-US')}`);
      st.check(`geometries < ${TIER1.geometries}`, peak.geometries < TIER1.geometries, `peak ${peak.geometries}`);
      st.check(`textures < ${TIER1.textures}`, peak.textures < TIER1.textures, `peak ${peak.textures}`);
      st.check('zero console errors', g.errors.length === 0, g.errors.slice(0, 5).join(' | ') || `none (${peak.samples} samples over ${src})`);
    } finally {
      await g.close();
    }
  });
}
