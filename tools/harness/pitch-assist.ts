// pitch-assist (B-18, D-015d; D-016b) — the check that RUNS THE RIG. READABLE_RISE models the assisted
// pitch with arithmetic (an unobstructed arm, the depth the probe would measure). This stage asks the real
// game the same question: stand the player 2 u off each face of tools/harness/fixtures/pitch-assist.json
// (chapter-2-shaped wall and climb faces), let the real SpringArmCamera probe, pitch and collide, then cast
// one ray per screen row down the centre column from the real camera pose against the visible level meshes (including collider:none), and
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
//      without a case.
//   READABLE_CASE (RB-003/RB-004): every measured chapter rise is also checked at its exact
//      prescribed pose, including rest-readable faces and stand points over gaps. The actual probe
//      and arm are snapped there after query warm-up; no player fall can move the measured pose.
//      This checks the readability verdict, not pitch equality; ASSIST_CASE separately checks pitch.
//      Exact poses use the support height, before the physics controller settles above the floor.
//   5. B-23: the linter now collides the arm (geometry behind the stand point lowers the eye). On
//      fixtures/assist-cases.json (a wall clean and under an overhang) and fixtures/wall-arm.json (+3.75 and
//      +2.50, each with its wall 1u behind and with nothing behind), every rise the linter evaluates is stood
//      in the real rig, camera behind the facing, and the rig must read exactly the faces the linter accepts.
// Fixtures, not levels: not nav-tested, not in levels/.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Stage, guard, VIEWPORT, type Ctx, type StageResult, type Vec3 } from './lib.ts';
// @ts-expect-error plain .mjs, no types: the linter's own model of the assist (the camera's rule)
import { assistCases, assistedPitchDeg, riseViews, withColliders, READABLE_RISE } from '../lint-level.mjs';

// @ts-expect-error plain .mjs fixture data
import { readabilityFixtures } from '../fixtures/readability.mjs';

const FIXTURE = 'tools/harness/fixtures/pitch-assist.json';
const CASE_FIXTURE = 'tools/harness/fixtures/assist-cases.json';
const WALL_FIXTURE = 'tools/harness/fixtures/wall-arm.json';
const MANIFEST = 'assets/dist/manifest.json';
const SETTLE_FRAMES = 30; // rendered ticks after placing the player, so camRig.update runs with the assist

interface Face { tag: string; face: number; z: number; rise: number; depth: number }

function facesOf(fx: { geometry: { tag?: string; pos: Vec3; scale: Vec3 }[] }): Face[] {
  return fx.geometry
    .filter((g) => g.tag && g.tag !== 'spawn')
    .map((g) => ({ tag: g.tag!, face: g.pos[0] - g.scale[0] / 2, z: g.pos[2], rise: g.pos[1] + g.scale[1] / 2, depth: g.scale[0] }));
}

interface Measured { band: number; uncertainty: number; viewPitchDeg: number; assistOffsetDeg: number; probe: { targetDeg: number | null } | null; feet: Vec3 }
/** A landing to measure: its top height and footprint. */
interface Target { top: number; box: { x0: number; x1: number; z0: number; z1: number } }

const faceTarget = (f: Face): Target => ({ top: f.rise, box: { x0: f.face, x1: f.face + f.depth, z0: f.z - 3.5, z1: f.z + 3.5 } });

/** Measure the real camera's visible target-top band. The default lets the player and rig settle.
 *  exactPose warms the queries, then snaps the real rig at the prescribed position without advancing
 *  physics: gap-crossing stand points can be in mid-air. This is a pose check, not a nav test. */
async function measureAt(page: import('playwright').Page, tg: Target, stand: Vec3, facing: number, exactPose = false): Promise<Measured> {
  return page.evaluate(
    ([tg, stand, facing, settle, rows, exactPose, minBand]) => {
      const H = window.__HARNESS__!;
      // Query structures must exist before snapping; then freeze the prescribed pose over gaps too.
      if (exactPose) H.advance(1, 0);
      H.setInput(null);
      H.respawnAt(stand, facing, 0);
      // B-23: respawnAt moves the player only. The camera must be BEHIND the facing (where a player who
      // turns to face the landing puts it), or the centre column never crosses the landing and the arm
      // never meets what is behind the stand point. Before B-23 every case not facing spawn's yaw was
      // measured side-on (OQ-056 item 3's 0.00deg).
      H.cameraYaw(facing);
      const snap = exactPose ? H.snapshot() : H.advance(settle, 1);
      const c = H.cameraPose();
      const [fx, fy, fz] = c.forward;
      // right = forward x worldUp, up = right x forward
      let rx = -fz, rz = fx;
      const rl = Math.hypot(rx, rz) || 1;
      rx /= rl; rz /= rl;
      const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;
      const half = (c.fovDeg / 2) * (Math.PI / 180);
      const sample = (count: number) => {
        const step = (2 * half) / count;
        let hits = 0, runs = 0, previous = false;
        for (let k = 0; k < count; k++) {
          const th = -half + (k + 0.5) * step;
          const d: [number, number, number] = [fx * Math.cos(th) + ux * Math.sin(th), fy * Math.cos(th) + uy * Math.sin(th), fz * Math.cos(th) + uz * Math.sin(th)];
          const h = H.castRenderRay(c.pos, d, 200);
          const hit = !!h && h.normal[1] > 0.99 && Math.abs(h.point[1] - tg.top) < 1e-3 && h.point[0] >= tg.box.x0 && h.point[0] <= tg.box.x1 && h.point[2] >= tg.box.z0 && h.point[2] <= tg.box.z1;
          if (hit) { hits++; if (!previous) runs++; }
          previous = hit;
        }
        return { band: hits * c.fovDeg / count, uncertainty: Math.max(1, runs) * c.fovDeg / count };
      };
      let result = sample(rows);
      // Refine threshold-adjacent measurements; ambiguous refined verdicts fail READABLE_CASE.
      // This bounds sampled interval endpoints, not subpixel features missed by every ray.
      if (Math.abs(result.band - minBand) <= result.uncertainty) result = sample(rows * 10);
      return { ...result, viewPitchDeg: c.viewPitchDeg, assistOffsetDeg: c.assistOffsetDeg, probe: c.probe, feet: snap.feet };
    },
    [tg, stand, facing, SETTLE_FRAMES, VIEWPORT.height * 2, exactPose, READABLE_RISE.minBandDeg as number] as const,
  );
}

const readableVerdict = (m: Measured, min: number): boolean | null => m.band - m.uncertainty >= min ? true : m.band + m.uncertainty < min ? false : null;

const measure = (page: import('playwright').Page, f: Face, standoff: number, facing: number): Promise<Measured> => measureAt(page, faceTarget(f), [f.face - standoff, 0, f.z], facing);

interface AssistCase { index: number; via: string; rise: number; depth: number; pitchDeg: number; eyeM: number; bandDeg: number; stand: Vec3; facingDeg: number; top: number; box: Target['box'] }
interface RiseView extends AssistCase { reads: boolean }
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
    const manifest = await withColliders(JSON.parse(readFileSync(join(ctx.root, MANIFEST), 'utf8')), join(ctx.root, MANIFEST));
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
      if (level.chapter < 1) continue; // the gym remains the deliberately exempt budget rig
      const cases = assistCases(level, manifest) as AssistCase[];
      const views = riseViews(level, manifest) as RiseView[];
      const page = await ctx.browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
      try {
        await page.goto(`${ctx.baseUrl}/?harness=1&level=${encodeURIComponent(level.id)}`);
        await page.waitForFunction(() => window.__HARNESS__?.version === 'HARNESS_API_V1', null, { timeout: 20000 });
        await page.evaluate(() => window.__HARNESS__!.start());
        // Derive required coverage from authored moves independently of riseViews' model output.
        const expected = level.critical_path.flatMap((w: { via?: string; pos?: number[] } | number[], i: number) => {
          if (!i || Array.isArray(w) || !w.via || ['ground', 'platform'].includes(w.via)) return [];
          const previous = level.critical_path[i - 1];
          const a = Array.isArray(previous) ? previous : previous.pos;
          return w.pos && w.pos[1]! > a[1] ? [i] : [];
        });
        const measured: number[] = [];
        for (const v of views) {
          const m = await measureAt(page, v, v.stand, v.facingDeg, true);
          measured.push(v.index);
          st.check(`READABLE_CASE ${level.id} critical_path[${v.index}]: rig and model agree`,
            readableVerdict(m, min2) === v.reads,
            `fixed stand pose: rig ${m.band.toFixed(3)}deg at ${m.viewPitchDeg.toFixed(1)}deg; model ${v.bandDeg.toFixed(3)}deg (${v.reads ? 'reads' : 'does not read'})`);
        }
        st.check(`READABLE_CASE ${level.id}: ran every measured rise, including rest-readable faces`, JSON.stringify(measured) === JSON.stringify(expected), `measured ${measured}; authored ${expected}`);
        const results = await runAllCases(page, cases, min2);
        st.check(`ASSIST_CASE ${level.id}: ran every derived case`, results.length === cases.length, `${results.length} of ${cases.length}`);
        for (const r of results) st.check(`ASSIST_CASE ${level.id} critical_path[${r.c.index}] reads in the real rig`, r.ok, r.why);
      } finally {
        await page.close();
      }
    }

    // RB-003/RB-004: both directions on independently reproduced occlusion/OBB/height/edge cases.
    const chapter = JSON.parse(readFileSync(join(ctx.root, 'levels/02-cliff-seam.json'), 'utf8'));
    const wallFixture = JSON.parse(readFileSync(join(ctx.root, WALL_FIXTURE), 'utf8'));
    for (const fx of readabilityFixtures(chapter, wallFixture, JSON.parse(readFileSync(join(ctx.root, 'tools/fixtures/lint/01-lower-stair.pre-d015.json'), 'utf8')))) {
      const page = await ctx.browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
      try {
        await page.goto(`${ctx.baseUrl}/?harness=1&level=00-gym`);
        await page.waitForFunction(() => window.__HARNESS__?.version === 'HARNESS_API_V1');
        const loaded = await page.evaluate((t) => window.__HARNESS__!.startJson(t), JSON.stringify(fx.level));
        if (!st.check(`READABLE_CASE regression ${fx.name}: fixture loads`, loaded.ok, loaded.error ?? 'ok')) continue;
        const v = (riseViews(fx.level, manifest) as RiseView[]).find(v => v.index === fx.index);
        if (!st.check(`READABLE_CASE regression ${fx.name}: target is evaluated`, !!v, `waypoint ${fx.index}`) || !v) continue;
        const m = await measureAt(page, v, v.stand, v.facingDeg, true);
        st.check(`READABLE_CASE regression ${fx.name}: model and real rig ${fx.reads ? 'read' : 'reject'} the target`,
          v.reads === fx.reads && readableVerdict(m, min2) === fx.reads,
          `model ${v.bandDeg.toFixed(3)}deg; rig ${m.band.toFixed(3)}deg at ${m.viewPitchDeg.toFixed(1)}deg`);
      } finally { await page.close(); }
    }

    // Proof that the linter's collided arm (B-23) and the real rig agree, both ways, on what is behind the
    // stand point. Two fixtures, every rise READABLE_RISE evaluates in each (riseViews: the linter's own pose
    // and verdict), each stood in the real rig: the rig must read exactly the faces the linter accepts.
    //   assist-cases.json: the same +4.0 wall clean and under an overhang behind the approach. Before B-23 the
    //     linter certified both and only the rig caught the overhang; now the linter rejects it too.
    //   wall-arm.json: {+3.75 inside wall's D-016 band, +2.50 below it} x {its wall 1u behind the stand point,
    //     as chapter 2 builds a wall jump; nothing behind}. The walled pair must be rejected by both.
    // ASSIST_CASE's own guarantee is kept: the assisted faces the linter certifies are exactly the derived set.
    const expect: Record<string, { assisted: string[]; reject: string[]; accept: string[] }> = {
      [CASE_FIXTURE]: { assisted: ['clean'], reject: ['overhung'], accept: ['clean'] },
      [WALL_FIXTURE]: { assisted: ['band_clear'], reject: ['band_walled', 'low_walled'], accept: ['band_clear', 'low_clear'] },
    };
    for (const [file, want] of Object.entries(expect)) {
      const text = readFileSync(join(ctx.root, file), 'utf8');
      const fx = JSON.parse(text);
      const tagOf = (c: AssistCase): string => fx.geometry.find((g: { pos: Vec3; scale: Vec3; tag?: string }) => g.pos[1] + g.scale[1] / 2 === c.top && g.pos[0] - g.scale[0] / 2 === c.box.x0 && g.pos[2] - g.scale[2] / 2 === c.box.z0)?.tag ?? '?';
      const views = riseViews(fx, manifest) as RiseView[];
      const cases = assistCases(fx, manifest) as AssistCase[];
      const same = (a: string[], b: string[]): boolean => a.length === b.length && [...a].sort().every((x, k) => x === [...b].sort()[k]);
      const acc = views.filter((v) => v.reads).map(tagOf), rej = views.filter((v) => !v.reads).map(tagOf);
      st.check(`B-23 proof ${file}: the linter accepts ${want.accept.join(', ')} and rejects ${want.reject.join(', ')}`, same(acc, want.accept) && same(rej, want.reject), `accepts [${acc.join(', ')}], rejects [${rej.join(', ')}]`);
      st.check(`B-23 proof ${file}: the assist-dependent set is ${want.assisted.join(', ')}`, same(cases.map(tagOf), want.assisted), cases.map(tagOf).join(', ') || 'none');
      const page = await ctx.browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
      try {
        await page.goto(`${ctx.baseUrl}/?harness=1&level=00-gym`);
        await page.waitForFunction(() => window.__HARNESS__?.version === 'HARNESS_API_V1', null, { timeout: 20000 });
        const started = await page.evaluate((t) => window.__HARNESS__!.startJson(t), text);
        if (!st.check(`B-23 proof ${file} loads`, started.ok, started.ok ? file : (started.error ?? 'failed'))) continue;
        // Derive required coverage from authored moves independently of riseViews' model output.
        const expected = fx.critical_path.flatMap((w: { via?: string; pos?: number[] } | number[], i: number) => {
          if (!i || Array.isArray(w) || !w.via || ['ground', 'platform'].includes(w.via)) return [];
          const previous = fx.critical_path[i - 1];
          const a = Array.isArray(previous) ? previous : previous.pos;
          return w.pos && w.pos[1]! > a[1] ? [i] : [];
        });
        const measured: number[] = [];
        for (const v of views) {
          const m = await measureAt(page, { top: v.top, box: v.box }, v.stand, v.facingDeg);
          measured.push(v.index);
          const rig = m.band >= min2;
          st.check(`B-23 proof ${file} ${tagOf(v)}: the real rig ${v.reads ? 'reads it' : 'does NOT read it'}, as the linter says`, rig === v.reads,
            `rig ${m.band.toFixed(2)}deg at view pitch ${m.viewPitchDeg.toFixed(1)}deg (probe target ${m.probe?.targetDeg ?? 'none'}); linter ${v.bandDeg.toFixed(2)}deg from an eye ${v.eyeM.toFixed(2)}u above the feet at ${v.pitchDeg}deg`);
        }
        st.check(`B-23 proof ${file}: stood every rise the linter evaluated in the rig`, JSON.stringify(measured) === JSON.stringify(expected) && expected.length > 0, `measured ${measured}; authored ${expected}`);
        const results = await runAllCases(page, cases, min2);
        st.check(`ASSIST_CASE proof ${file}: ran every derived case`, results.length === cases.length, `${results.length} of ${cases.length}`);
        for (const r of results) st.check(`ASSIST_CASE proof ${file} ${tagOf(r.c)} reads in the real rig at the modelled pitch`, r.ok, r.why);
      } finally {
        await page.close();
      }
    }
  });
}
