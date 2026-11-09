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
//   4. ASSIST_CASE (OQ-052 item 7): every critical_path waypoint in levels/ that passes READABLE_RISE only
//      because of the assist (lint-level.mjs assistCases, the same test that certified it) is run here in
//      its REAL level: real arm collision, real probe. It must read, and the real probe must settle at the
//      pitch the linter modelled. The stage asserts it ran exactly the derived set, so no waypoint can go
//      without a case. Proven on fixtures/assist-cases.json: the same 4.0 wall twice, once clean (must
//      read) and once under an overhang behind the approach, which the linter passes and the rig must FAIL.
// Fixtures, not levels: not nav-tested, not in levels/.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Stage, guard, VIEWPORT, type Ctx, type StageResult, type Vec3 } from './lib.ts';
// @ts-expect-error plain .mjs, no types: the linter's own model of the assist (the camera's rule)
import { assistCases, assistedPitchDeg, READABLE_RISE } from '../lint-level.mjs';

const FIXTURE = 'tools/harness/fixtures/pitch-assist.json';
const CASE_FIXTURE = 'tools/harness/fixtures/assist-cases.json';
const SETTLE_FRAMES = 30; // rendered ticks after placing the player, so camRig.update runs with the assist

interface Face { tag: string; face: number; z: number; rise: number; depth: number }

function facesOf(fx: { geometry: { tag?: string; pos: Vec3; scale: Vec3 }[] }): Face[] {
  return fx.geometry
    .filter((g) => g.tag && g.tag !== 'spawn')
    .map((g) => ({ tag: g.tag!, face: g.pos[0] - g.scale[0] / 2, z: g.pos[2], rise: g.pos[1] + g.scale[1] / 2, depth: g.scale[0] }));
}

interface Measured { band: number; viewPitchDeg: number; assistOffsetDeg: number; probe: { targetDeg: number | null } | null; feet: Vec3 }
/** A landing to measure: its top height and footprint. */
interface Target { top: number; box: { x0: number; x1: number; z0: number; z1: number } }

const faceTarget = (f: Face): Target => ({ top: f.rise, box: { x0: f.face, x1: f.face + f.depth, z0: f.z - 3.5, z1: f.z + 3.5 } });

/** Stand the player at `stand` facing `facing`, let the real rig settle, and measure the degrees of the
 *  frame's centre column that are the landing's top surface (one ray per row from the real camera pose). */
async function measureAt(page: import('playwright').Page, tg: Target, stand: Vec3, facing: number): Promise<Measured> {
  return page.evaluate(
    ([tg, stand, facing, settle, rows]) => {
      const H = window.__HARNESS__!;
      H.setInput(null);
      H.respawnAt(stand, facing, 0);
      const snap = H.advance(settle, 1);
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
        if (h.normal[1] > 0.99 && Math.abs(py - tg.top) < 1e-3 && px >= tg.box.x0 && px <= tg.box.x1 && pz >= tg.box.z0 && pz <= tg.box.z1) hits++;
      }
      return { band: hits * step * (180 / Math.PI), viewPitchDeg: c.viewPitchDeg, assistOffsetDeg: c.assistOffsetDeg, probe: c.probe, feet: snap.feet };
    },
    [tg, stand, facing, SETTLE_FRAMES, VIEWPORT.height * 2] as const,
  );
}

const measure = (page: import('playwright').Page, f: Face, standoff: number, facing: number): Promise<Measured> => measureAt(page, faceTarget(f), [f.face - standoff, 0, f.z], facing);

interface AssistCase { index: number; via: string; rise: number; depth: number; pitchDeg: number; stand: Vec3; facingDeg: number; top: number; box: Target['box'] }
interface CaseResult { c: AssistCase; ok: boolean; why: string }

/** ASSIST_CASE: run one derived case in the real rig. It must read, and the real probe must settle at the
 *  pitch the linter modelled. Anything else, including a probe that never engaged, is a failure. */
async function runCase(page: import('playwright').Page, c: AssistCase, min: number): Promise<CaseResult> {
  const m = await measureAt(page, { top: c.top, box: c.box }, c.stand, c.facingDeg);
  const got = m.probe?.targetDeg ?? null;
  const why = `critical_path[${c.index}] ${c.via} +${c.rise.toFixed(2)} onto ${c.depth.toFixed(2)}u: real rig reads ${m.band.toFixed(2)}deg at view pitch ${m.viewPitchDeg.toFixed(1)}deg (probe target ${got ?? 'none'}); linter modelled ${c.pitchDeg}deg, needs >= ${min}deg`;
  return { c, ok: m.band >= min && got === c.pitchDeg, why };
}

/** Run every derived case. Returns one result per case it ran; the caller asserts that is ALL of them. */
async function runAllCases(page: import('playwright').Page, cases: AssistCase[], min: number): Promise<CaseResult[]> {
  const out: CaseResult[] = [];
  for (const c of cases) out.push(await runCase(page, c, min));
  return out;
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

    // 4. ASSIST_CASE: every assist-dependent waypoint in levels/, in its real level.
    const min2 = READABLE_RISE.minBandDeg as number;
    const files = readdirSync(join(ctx.root, 'levels')).filter((f) => /^[0-9].*\.json$/.test(f));
    for (const file of files) {
      const level = JSON.parse(readFileSync(join(ctx.root, 'levels', file), 'utf8'));
      const cases = assistCases(level) as AssistCase[];
      if (!cases.length) {
        st.check(`ASSIST_CASE ${level.id}: no waypoint depends on the assist`, true, `0 of ${level.critical_path.length} critical_path waypoints`);
        continue;
      }
      const page = await ctx.browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
      try {
        await page.goto(`${ctx.baseUrl}/?harness=1&level=${encodeURIComponent(level.id)}`);
        await page.waitForFunction(() => window.__HARNESS__?.version === 'HARNESS_API_V1', null, { timeout: 20000 });
        await page.evaluate(() => window.__HARNESS__!.start());
        const results = await runAllCases(page, cases, min2);
        st.check(`ASSIST_CASE ${level.id}: ran every derived case`, results.length === cases.length, `${results.length} of ${cases.length}`);
        for (const r of results) st.check(`ASSIST_CASE ${level.id} critical_path[${r.c.index}] reads in the real rig`, r.ok, r.why);
      } finally {
        await page.close();
      }
    }

    // Proof that ASSIST_CASE fails: the same wall clean and under an overhang. The linter certifies both.
    {
      const text = readFileSync(join(ctx.root, CASE_FIXTURE), 'utf8');
      const fx = JSON.parse(text);
      const cases = assistCases(fx) as AssistCase[];
      const tagOf = (c: AssistCase): string => fx.geometry.find((g: { pos: Vec3; scale: Vec3; tag?: string }) => g.pos[1] + g.scale[1] / 2 === c.top && g.pos[0] - g.scale[0] / 2 === c.box.x0 && g.pos[2] - g.scale[2] / 2 === c.box.z0)?.tag ?? '?';
      st.check('ASSIST_CASE proof: the linter certifies both walls (2 assist-dependent waypoints)', cases.length === 2, `${cases.length}: ${cases.map(tagOf).join(', ')}`);
      const page = await ctx.browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
      try {
        await page.goto(`${ctx.baseUrl}/?harness=1&level=00-gym`);
        await page.waitForFunction(() => window.__HARNESS__?.version === 'HARNESS_API_V1', null, { timeout: 20000 });
        const started = await page.evaluate((t) => window.__HARNESS__!.startJson(t), text);
        if (st.check('ASSIST_CASE proof fixture loads', started.ok, started.ok ? CASE_FIXTURE : (started.error ?? 'failed'))) {
          const results = await runAllCases(page, cases, min2);
          st.check('ASSIST_CASE proof: ran every derived case (a waypoint without one fails here)', results.length === cases.length, `${results.length} of ${cases.length}`);
          for (const r of results) {
            const c = r.c;
            const tag = tagOf(c);
            if (tag === 'overhung') st.check('ASSIST_CASE proof: the overhung wall FAILS in the real rig (the linter passed it)', !r.ok, r.why);
            else st.check(`ASSIST_CASE proof: the ${tag} wall passes`, r.ok, r.why);
          }
        }
      } finally {
        await page.close();
      }
    }
  });
}
