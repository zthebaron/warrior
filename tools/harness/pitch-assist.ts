// pitch-assist (B-18, D-015d; D-016b) — the check that RUNS THE RIG. READABLE_RISE models the assisted
// pitch with arithmetic (an unobstructed arm, the depth the probe would measure). This stage asks the real
// game the same question: stand the player 2 u off each face of tools/harness/fixtures/pitch-assist.json
// (chapter-2-shaped wall and climb faces), let the real SpringArmCamera probe, pitch and collide, then cast
// one ray per screen row down the centre column from the real camera pose against the real colliders, and
// measure how many degrees of the frame are the landing's TOP surface.
//
//   1. assist ON:  every face the linter says reads must read (>= minBandDeg), and the face the linter says
//                  no pitch can read must not. Linter and game agree in both directions.
//   2. assist OFF (?pitchassist=off, the comparison): no face reads. These are the faces D-016 says the rest
//                  pose cannot present, so this is what makes the assist load-bearing, not decorative.
//   3. release: facing away, the assist lets go (offset 0, back to the player's own pitch).
// Fixture, not a level: chapter 0, not linted, not nav-tested, not in levels/.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Stage, guard, VIEWPORT, type Ctx, type StageResult, type Vec3 } from './lib.ts';
// @ts-expect-error plain .mjs, no types: the linter's own model of the assist (the camera's rule)
import { assistedPitchDeg, READABLE_RISE } from '../lint-level.mjs';

const FIXTURE = 'tools/harness/fixtures/pitch-assist.json';
const SETTLE_FRAMES = 30; // rendered ticks after placing the player, so camRig.update runs with the assist

interface Face { tag: string; face: number; z: number; rise: number; depth: number }

function facesOf(fx: { geometry: { tag?: string; pos: Vec3; scale: Vec3 }[] }): Face[] {
  return fx.geometry
    .filter((g) => g.tag && g.tag !== 'spawn')
    .map((g) => ({ tag: g.tag!, face: g.pos[0] - g.scale[0] / 2, z: g.pos[2], rise: g.pos[1] + g.scale[1] / 2, depth: g.scale[0] }));
}

interface Measured { band: number; viewPitchDeg: number; assistOffsetDeg: number; probe: unknown }

async function measure(page: import('playwright').Page, f: Face, standoff: number, facing: number): Promise<Measured> {
  return page.evaluate(
    ([f, standoff, facing, settle, rows]) => {
      const H = window.__HARNESS__!;
      H.setInput(null);
      H.respawnAt([f.face - standoff, 0, f.z], facing, 0);
      H.advance(settle, 1);
      const c = H.cameraPose();
      const [fx, fy, fz] = c.forward;
      // right = forward x worldUp, up = right x forward
      let rx = -fz, rz = fx;
      const rl = Math.hypot(rx, rz) || 1;
      rx /= rl; rz /= rl;
      const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;
      const half = (c.fovDeg / 2) * (Math.PI / 180);
      const step = (2 * half) / rows;
      let hits = 0;
      for (let k = 0; k < rows; k++) {
        const th = -half + (k + 0.5) * step;
        const d: [number, number, number] = [fx * Math.cos(th) + ux * Math.sin(th), fy * Math.cos(th) + uy * Math.sin(th), fz * Math.cos(th) + uz * Math.sin(th)];
        const h = H.castRay(c.pos, d, 200);
        if (!h) continue;
        const [px, py, pz] = h.point;
        if (h.normal[1] > 0.99 && Math.abs(py - f.rise) < 1e-3 && px >= f.face && px <= f.face + f.depth && Math.abs(pz - f.z) < 3.5) hits++;
      }
      return { band: hits * step * (180 / Math.PI), viewPitchDeg: c.viewPitchDeg, assistOffsetDeg: c.assistOffsetDeg, probe: c.probe };
    },
    [f, standoff, facing, SETTLE_FRAMES, VIEWPORT.height * 2] as const,
  );
}

export async function pitchAssist(ctx: Omit<Ctx, 'levelId' | 'level' | 'segments'>): Promise<StageResult> {
  const st = new Stage('pitch-assist');
  return guard(st, async () => {
    const text = readFileSync(join(ctx.root, FIXTURE), 'utf8');
    const faces = facesOf(JSON.parse(text));
    const standoff = READABLE_RISE.standoffM as number;
    const min = READABLE_RISE.minBandDeg as number;
    const TOWARD = -90; // facing -90 deg looks down +x (forward = (-sin, -cos)), at the faces
    for (const mode of ['on', 'off'] as const) {
      const page = await ctx.browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
      const errors: string[] = [];
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
      try {
        await page.goto(`${ctx.baseUrl}/?harness=1&level=00-gym${mode === 'off' ? '&pitchassist=off' : ''}`);
        await page.waitForFunction(() => window.__HARNESS__?.version === 'HARNESS_API_V1', null, { timeout: 20000 });
        const started = await page.evaluate((t) => window.__HARNESS__!.startJson(t), text);
        if (!st.check(`fixture loads (assist ${mode})`, started.ok, started.ok ? FIXTURE : (started.error ?? 'failed'))) return;
        for (const f of faces) {
          const want = assistedPitchDeg(f.rise, f.depth) as number | null;
          const m = await measure(page, f, standoff, TOWARD);
          const detail = `top band ${m.band.toFixed(2)}deg at view pitch ${m.viewPitchDeg.toFixed(1)}deg (assist +${m.assistOffsetDeg.toFixed(1)}); linter: ${want === null ? 'no pitch reads' : `reads at ${want}deg`}`;
          if (mode === 'off') st.check(`${f.tag}: +${f.rise} onto ${f.depth}u does NOT read at rest (assist off)`, m.band < min && m.assistOffsetDeg === 0, detail);
          else if (want !== null) st.check(`${f.tag}: +${f.rise} onto ${f.depth}u reads with the assist, as the linter says`, m.band >= min, detail);
          else st.check(`${f.tag}: +${f.rise} onto ${f.depth}u still does not read, as the linter says`, m.band < min, detail);
        }
        if (mode === 'on') {
          const f = faces[0]!;
          const m = await measure(page, f, standoff, TOWARD + 180);
          st.check('facing away releases the assist', m.assistOffsetDeg === 0 && m.probe === null, `assist +${m.assistOffsetDeg.toFixed(2)}deg, view pitch ${m.viewPitchDeg.toFixed(1)}deg`);
        }
        st.check(`zero console errors (assist ${mode})`, errors.length === 0, errors.slice(0, 5).join(' | ') || 'none');
      } finally {
        await page.close();
      }
    }
  });
}
