// visual — 6 fixed cameras, pixelmatch against committed goldens, fail over 0.5% drift.
// The measured noise floor is 0.000% (deterministic mode), so the gate is set just above zero:
// a broken shader on one object must not hide under it.
// Cameras are derived from critical_path (not geometry), so deleting or moving geometry changes
// the picture but never the viewpoint. Deterministic mode makes every frame reproducible: the
// player is at spawn and platforms are at tick 1 when each golden is taken.
// Goldens: tools/harness/golden/<platform>/<level>/camN.png, platform = process.platform — macOS
// and Linux SwiftShader need not agree pixel-for-pixel, so each keeps its own set.
// Regenerate: --update-goldens. On failure or a missing golden: camN.actual.png (+ diff) beside
// them (gitignored; uploaded by CI — a new platform's first CI artifact IS its golden set).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { FAILURE, Stage, guard, openGame, wp, type Ctx, type LevelJson, type StageResult, type Vec3 } from './lib.ts';

export const VISUAL_CONFIG = {
  cameraCount: 6,
  maxDriftFraction: 0.005,
  pixelThreshold: 0.1,           // pixelmatch per-pixel colour threshold (0..1)
  offset: [-7, 7, 11] as Vec3,   // camera position relative to its target
  overviewOffset: [-25, 28, 34] as Vec3,
};

/** 6 viewpoints: an overview from spawn, then targets spread evenly along the critical path. */
export function cameras(level: LevelJson): { name: string; pos: Vec3; target: Vec3 }[] {
  const C = VISUAL_CONFIG;
  const pts = level.critical_path.map((w) => wp(w).pos);
  const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const out = [{ name: 'cam0', pos: add(level.spawn.pos, C.overviewOffset), target: pts[Math.floor(pts.length / 3)]! }];
  for (let k = 1; k < C.cameraCount; k++) {
    const t = pts[Math.round((k / (C.cameraCount - 1)) * (pts.length - 1))]!;
    out.push({ name: `cam${k}`, pos: add(t, C.offset), target: t });
  }
  return out;
}

export async function visual(ctx: Ctx): Promise<StageResult> {
  const st = new Stage('visual');
  return guard(st, async () => {
    const C = VISUAL_CONFIG;
    const dir = join(ctx.root, 'tools/harness/golden', process.platform, ctx.levelId);
    const update = ctx.args['update-goldens'] === true;
    mkdirSync(dir, { recursive: true });
    st.data['goldens'] = dir.replace(`${ctx.root}/`, '');
    const g = await openGame(ctx);
    try {
      for (const cam of cameras(ctx.level)) {
        await g.page.evaluate((c) => {
          window.__HARNESS__!.setCamera(c.pos, c.target);
          window.__HARNESS__!.advance(1);
        }, cam);
        const shot = PNG.sync.read(await g.page.locator('canvas').screenshot());
        const golden = join(dir, `${cam.name}.png`);
        if (update) {
          writeFileSync(golden, PNG.sync.write(shot));
          st.check(`${cam.name} golden written`, true, golden.replace(`${ctx.root}/`, ''));
          continue;
        }
        if (!existsSync(golden)) {
          st.failureClass = FAILURE.SETUP;
          writeFileSync(join(dir, `${cam.name}.actual.png`), PNG.sync.write(shot));
          st.check(`${cam.name} drift <= ${C.maxDriftFraction * 100}%`, false, `golden missing: ${golden.replace(`${ctx.root}/`, '')} — wrote ${cam.name}.actual.png; review it, rename to ${cam.name}.png (or run --update-goldens on this platform)`);
          continue;
        }
        const ref = PNG.sync.read(readFileSync(golden));
        if (ref.width !== shot.width || ref.height !== shot.height) {
          st.check(`${cam.name} drift <= ${C.maxDriftFraction * 100}%`, false, `size ${shot.width}x${shot.height} vs golden ${ref.width}x${ref.height}`);
          continue;
        }
        const diff = new PNG({ width: ref.width, height: ref.height });
        const bad = pixelmatch(ref.data, shot.data, diff.data, ref.width, ref.height, { threshold: C.pixelThreshold });
        const frac = bad / (ref.width * ref.height);
        const ok = frac <= C.maxDriftFraction;
        if (!ok) {
          writeFileSync(join(dir, `${cam.name}.actual.png`), PNG.sync.write(shot));
          writeFileSync(join(dir, `${cam.name}.diff.actual.png`), PNG.sync.write(diff));
        }
        st.check(`${cam.name} drift <= ${C.maxDriftFraction * 100}%`, ok, `${(frac * 100).toFixed(3)}% (${bad} px)${ok ? '' : ` -> ${cam.name}.actual.png, ${cam.name}.diff.actual.png`}`);
      }
      st.check('zero console errors', g.errors.length === 0, g.errors.slice(0, 5).join(' | ') || 'none');
    } finally {
      await g.close();
    }
  });
}
