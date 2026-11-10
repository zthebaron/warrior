// post — STYLE-BIBLE §1 and §6 as a gate that fails when a pass is ABSENT, not when a golden moves (D-018).
//
// A golden only says "the picture changed". This stage says what the picture must BE. On each of the six
// visual cameras it reads two things from the same frame: the canvas, and a per-pixel distance from the
// camera (window.__HARNESS__.postProbe, the depth the post pass itself used). Then, from pixels alone:
//
//   §1  NO LIGHT          the scene holds zero lights and zero lit materials (sceneAudit)
//   §6  PASS LIST         exactly value_compression, ink_edge, paper_grain run, nothing else (no bloom,
//                         vignette, grading, motion blur or SSR can be added without turning this red)
//   §6  VALUE_COMPRESSION every non-accent pixel 25-80u away is no darker than ink-grey (mid band) and every
//                         one beyond 80u no darker than mist-pale (far band). Exercised: the stage also counts
//                         how many mid/far pixels exist, and fails if there are none to judge.
//   §6  INK_EDGE          a pixel on the NEAR side of a strong depth jump (its neighbour >= 25% farther) is ink:
//                         ink-black within 25u, ink-grey or darker 25-80u
//   §6  PAPER_GRAIN       the sky is not flat paper: it varies by at least 1 level and at most the grain
//                         amplitude, and it is identical from one frame to the next (static, never film grain)
//   §2/§6 NO HUE          outside the accent and the robe, no pixel carries more chroma than the ramp does
//   §6  NO VIGNETTE       sky in the corners is the same paper as sky in the middle, within 2 levels
//
// The expectations are written HERE, not imported from src/engine/ink-post.ts, so deleting a pass from the
// code cannot quietly delete its test. Proof that each check bites: MEASUREMENTS "D-018 post gate".

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { Stage, guard, openGame, type Ctx, type StageResult } from './lib.ts';
import { cameras } from './visual.ts';

export const POST_GATE = {
  passes: ['value_compression', 'ink_edge', 'paper_grain'],  // STYLE §6, in order
  nearM: 25, midM: 80,              // STYLE §3
  grainMax: 3,                      // levels: the grain amplitude ink-post.ts may use (< ACCENT_AREA's 6)
  tol: 4,                           // levels: grain + rounding when comparing to a ramp value
  accentChroma: 51,                 // levels (0.2): above this a pixel is the accent; the ramp's largest is 30
  robe: [0x7d, 0x85, 0x90] as const,
  jump: 1.25,                       // neighbour this much farther = a silhouette
  maxCompressionMiss: 0.002,        // fraction of judged mid/far pixels allowed off-band (band-edge rounding)
  minEdgeHit: 0.95, minMidEdgeHit: 0.9,
  minEdgePixels: 200,               // across the six cameras, or the edge check proves nothing
  vignetteMax: 2,
};

export async function post(ctx: Ctx): Promise<StageResult> {
  const st = new Stage('post');
  return guard(st, async () => {
    const G = POST_GATE;
    const pal = (JSON.parse(readFileSync(join(ctx.root, 'reference/palette.json'), 'utf8')) as { colors: { name: string; hex: string }[] }).colors;
    const val = (name: string): number => { const h = pal.find((c) => c.name === name)!.hex; return [1, 3, 5].reduce((a, i) => a + parseInt(h.slice(i, i + 2), 16), 0) / 3; };
    const chromaMax = Math.max(...pal.map((c) => { const v = [1, 3, 5].map((i) => parseInt(c.hex.slice(i, i + 2), 16)); return Math.max(...v) - Math.min(...v); }));
    const paper = [1, 3, 5].map((i) => parseInt(pal[0]!.hex.slice(i, i + 2), 16));
    const vInkGrey = val('ink-grey'), vMist = val('mist-pale'), vInkDeep = val('ink-deep');

    const g = await openGame(ctx);
    try {
      const passes = await g.page.evaluate(() => window.__HARNESS__!.postPasses());
      const extra = passes.filter((p) => !G.passes.includes(p)), missing = G.passes.filter((p) => !passes.includes(p));
      st.check('§6 passes: exactly value_compression, ink_edge, paper_grain', !extra.length && !missing.length && passes.join() === G.passes.join(),
        `running [${passes.join(', ')}]${missing.length ? `; MISSING ${missing.join(', ')}` : ''}${extra.length ? `; NOT ALLOWED ${extra.join(', ')}` : ''}`);
      const audit = await g.page.evaluate(() => window.__HARNESS__!.sceneAudit());
      st.check('§1: zero lights in the scene', audit.lights.length === 0, audit.lights.join(', ') || 'none');
      st.check('§1: zero lit materials in the scene', audit.litMaterials.length === 0, audit.litMaterials.join(', ') || 'none (every material unlit)');

      let judged = 0, miss = 0, midN = 0, farN = 0, edgeN = 0, edgeDark = 0, midEdgeN = 0, midEdgeDark = 0, hueBad = 0, total = 0;
      const sky: number[] = [], corner: number[] = [], centre: number[] = [];
      let staticDiff = 0, staticN = 0;
      const missAt: string[] = [], hueAt: string[] = [];
      for (const cam of cameras(ctx.level)) {
        await g.page.evaluate((c) => { window.__HARNESS__!.setCamera(c.pos, c.target); window.__HARNESS__!.advance(1); }, cam);
        const shot = PNG.sync.read(await g.page.locator('canvas').screenshot());
        const probe = await g.page.evaluate(() => window.__HARNESS__!.postProbe());
        if (probe.width !== shot.width || probe.height !== shot.height) { st.check(`${cam.name}: depth readback matches the frame`, false, `${probe.width}x${probe.height} vs ${shot.width}x${shot.height}`); continue; }
        await g.page.evaluate(() => window.__HARNESS__!.advance(1)); // same pose, next frame: grain must not move
        const again = PNG.sync.read(await g.page.locator('canvas').screenshot());
        const D2 = (await g.page.evaluate(() => window.__HARNESS__!.postProbe())).dist; // a crow may fly into the sky
        const { width: W, height: H } = shot, D = probe.dist, far = D.reduce((m, v) => (v > m ? v : m), 0);
        for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
          const i = y * W + x, o = i * 4, r = shot.data[o]!, gg = shot.data[o + 1]!, b = shot.data[o + 2]!, v = (r + gg + b) / 3, d = D[i]!;
          const chroma = Math.max(r, gg, b) - Math.min(r, gg, b);
          const robe = Math.abs(r - G.robe[0]) <= G.tol * 2 && Math.abs(gg - G.robe[1]) <= G.tol * 2 && Math.abs(b - G.robe[2]) <= G.tol * 2;
          const accent = chroma > G.accentChroma;
          total++;
          if (!accent && !robe && chroma > chromaMax + 1) { hueBad++; if (hueAt.length < 3) hueAt.push(`${cam.name} (${x},${y}) rgb(${r},${gg},${b})`); }
          if (d >= far * 0.999) { // sky
            sky.push(r - paper[0]!);
            if (D2[i]! >= far * 0.999) { staticN++; if (again.data[o]! !== r) staticDiff++; } // sky in both frames
            const cx = Math.min(x, W - 1 - x) / W, cy = Math.min(y, H - 1 - y) / H;
            if (cx < 0.1 && cy < 0.1) corner.push(v); else if (cx > 0.35 && cy > 0.35) centre.push(v);
          }
          if (accent || robe) continue;
          // the band of this pixel, and whether it sits on the near side of a strong depth jump
          const nb = [D[i - 1]!, D[i + 1]!, D[i - W]!, D[i + W]!];
          const silhouette = nb.some((n) => n >= d * G.jump);
          if (d < G.nearM) {
            if (silhouette) { edgeN++; if (v <= vInkDeep + G.tol) edgeDark++; }
          } else if (d < G.midM) {
            midN++; judged++;
            if (v < vInkGrey - G.tol) { miss++; if (missAt.length < 3) missAt.push(`${cam.name} (${x},${y}) mid ${d.toFixed(1)}u v=${v.toFixed(0)}`); }
            if (silhouette) { midEdgeN++; if (v <= vInkGrey + G.tol) midEdgeDark++; }
          } else if (d < far * 0.999) {
            farN++; judged++;
            if (v < vMist - G.tol) { miss++; if (missAt.length < 3) missAt.push(`${cam.name} (${x},${y}) far ${d.toFixed(1)}u v=${v.toFixed(0)}`); }
          }
        }
      }
      st.check('§6 value_compression: mid band no darker than ink-grey, far band no darker than mist-pale',
        judged > 0 && miss / judged <= G.maxCompressionMiss,
        judged ? `${miss} of ${judged} judged pixels off-band (${((miss / judged) * 100).toFixed(3)}%, allowed ${G.maxCompressionMiss * 100}%; mid ${midN}, far ${farN})${missAt.length ? `: ${missAt.join('; ')}` : ''}` : 'no mid or far pixel in any camera: nothing to judge');
      st.check('§6 ink_edge: near silhouettes are ink', edgeN >= G.minEdgePixels && edgeDark / edgeN >= G.minEdgeHit,
        `${edgeDark} of ${edgeN} near-side silhouette pixels are ink (${edgeN ? ((edgeDark / edgeN) * 100).toFixed(1) : 0}%, need ${G.minEdgeHit * 100}% of >= ${G.minEdgePixels})`);
      st.check('§6 ink_edge: mid silhouettes are ink-grey or darker (thinner, lighter with distance)', midEdgeN === 0 || midEdgeDark / midEdgeN >= G.minMidEdgeHit,
        `${midEdgeDark} of ${midEdgeN} (${midEdgeN ? ((midEdgeDark / midEdgeN) * 100).toFixed(1) : '-'}%)`);
      const mean = sky.length ? sky.reduce((a, b) => a + b, 0) / sky.length : 0;
      const sd = sky.length ? Math.sqrt(sky.reduce((a, b) => a + (b - mean) ** 2, 0) / sky.length) : 0;
      const maxDev = sky.reduce((m, s) => Math.max(m, Math.abs(s)), 0);
      st.check('§6 paper_grain: the sky carries grain, within its amplitude', sky.length > 0 && sd >= 0.5 && maxDev <= G.grainMax + 1,
        `${sky.length} sky px: sd ${sd.toFixed(2)} levels (need >= 0.5), max |dev| ${maxDev} (allowed ${G.grainMax + 1})`);
      st.check('§6 paper_grain: static (identical next frame)', staticN > 0 && staticDiff === 0, `${staticDiff} of ${staticN} sky px changed`);
      st.check('§2/§6: no hue outside the accent and the robe', hueBad === 0, `${hueBad} of ${total} px above the ramp's chroma ${chromaMax}${hueAt.length ? `: ${hueAt.join('; ')}` : ''}`);
      const avg = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length;
      st.check('§6: no vignette (corner sky = centre sky, within 2 levels)', !corner.length || !centre.length || Math.abs(avg(corner) - avg(centre)) <= G.vignetteMax,
        corner.length && centre.length ? `corner ${avg(corner).toFixed(2)} vs centre ${avg(centre).toFixed(2)}` : 'no sky in both regions: not judged');
      st.check('zero console errors', g.errors.length === 0, g.errors.slice(0, 5).join(' | ') || 'none');
    } finally {
      await g.close();
    }
  });
}
