// post — STYLE-BIBLE §1 and §6 as a gate that fails when a pass is ABSENT or WRONG, not when a golden moves
// (D-018, D-019).
//
// A golden only says "the picture changed". This stage says what the picture must BE. On each of the six
// visual cameras it reads two things from the same frame: the canvas, and a per-pixel distance from the
// camera (window.__HARNESS__.postProbe, the depth the post pass itself used). Then, from pixels alone:
//
//   §1  NO LIGHT          the scene holds zero lights and zero lit materials (sceneAudit)
//   §6  PASS LIST         exactly value_compression, ink_edge, paper_grain run, nothing else (no bloom,
//                         vignette, grading, motion blur or SSR can be added without turning this red)
//   §6  VALUE_COMPRESSION every non-accent pixel 25-80u away is no darker than ink-grey (mid band) and every
//                         one beyond 80u no darker than mist-pale (far band)
//   D-019 VALUE RANGE     the near field reaches the dark end of the ramp as MASS: a share of near pixels that
//                         are not on a silhouette sit at ink-deep or darker, and so do their neighbours
//   D-019 INK_EDGE        "outlining everything is outlining nothing". The line belongs to true silhouettes:
//                           - a near pixel on the near side of a strong depth jump, where the form and what is
//                             behind it differ in value, is inked OFTEN BUT NOT ALWAYS: the stroke breaks (a
//                             floor AND a ceiling: no line fails, a uniform outline fails)
//                           - where they do NOT differ (a paper platform top against paper sky) the line is
//                             the only thing marking the edge of the ground, and it never breaks
//                           - where the form behind the line is light enough to measure it, the stroke's
//                             WEIGHT varies: a 1px hairline and heavier widths each carry a real share
//                           - interior creases (a convex fold with no depth jump: box edges, tile seams)
//                             are not systematically inked
//                           - distant forms (25u+) carry no drawn line: a mid silhouette pixel is not
//                             systematically darker than the form just inside it
//   §6  PAPER_GRAIN       the sky is not flat paper: it varies by at least 1 level and at most the grain
//                         amplitude, and it is identical from one frame to the next (static, never film grain)
//   §2/§6 NO HUE          outside the accent and the robe, no pixel carries more chroma than the ramp does
//   §6  NO VIGNETTE       sky in the corners is the same paper as sky in the middle, within 2 levels
//
// D-021: in an ink level the near rock collides and is NOT drawn; painted cards stand there. The checks above
// test the ink PASS (where it lays a line, how it pushes the near field dark), so they go on judging it on the
// level's whole geometry: the undrawn rock is shown for that frame only, as the grazing camera is a pose only
// this stage takes. What the PLAYER sees is judged by the paint checks at the end, on the painted frame.
//
// The expectations are written HERE, not imported from src/engine/ink-post.ts, so deleting a pass from the
// code cannot quietly delete its test. Proof that each check bites: MEASUREMENTS "D-018 post gate" and
// "D-019 ink edge and value range".

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { RENDER_CONFIG } from '../../src/engine/render-config.ts';
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
  smooth: 1.1,                      // every neighbour within this ratio = no depth jump here (crease candidates)
  creaseLap: 0.004,                 // relative Laplacian of 1/z below -this, with no jump = a convex crease
  maxCompressionMiss: 0.002,        // fraction of judged mid/far pixels allowed off-band (band-edge rounding)
  minEdgePixels: 200,               // across the six cameras, or an edge check proves nothing
  minClass: { crease: 500, mid: 300, flat: 50, weight: 200, plane: 2000 }, // a check on an empty class proves nothing
  stepGap: 0.02,                    // relative gap in 1/z between two surfaces that do not meet (= ink-post's silhouetteGap)
  planeLap: 0.0005,                 // |relative Laplacian of 1/z| under this = one flat plane (float noise ~4e-5)
  grazeSlope: 0.01,                 // 1/z changing more than 1% per row = a plane within ~100 rows of its vanishing line
  maxPlaneInk: 0.01,                // grazing camera: px deep inside a receding ground plane that are ink
  graze: { start: 1.5, ahead: 14, eye: 0.35 }, // u: the grazing camera sits this far PAST spawn along the path (the player
                                    // and its ink landing mark, which lies flat on the ground, stay behind it), this high over the ground
  minNearBlack: 0.002,              // dressed levels: near px that are ink-BLACK mass (STYLE §3: ink-black present as mass)
  // D-019 thresholds: each sits between the measured uniform-outline value and the measured shipped value
  // (MEASUREMENTS "D-019 ink edge and value range").
  sameValue: 14, clearValue: 40,    // levels between the form and what is behind it: same step / two steps apart
  edgeHit: [0.35, 0.92] as const,   // near silhouette pixels inked where VALUE separates the forms: a line that
                                    // exists AND breaks
  minFlatEdgeHit: 0.95,             // ... and where value does NOT separate them, the line never breaks (shipped 97.4-99.4%;
                                    // without the rule it falls to the break rate, ~65-70%)
  maxCreaseInk: 0.45,               // convex creases with no depth jump that are a LINE (ink, lighter both sides):
                                    // D-018 56-70%, shipped 5-31% (chapter 1's 31% is the kit's own lip bands)
  maxMidLine: 0.35,                 // mid silhouette pixels darker than the form 3px inside them
  minWeightShare: 0.1,              // a 1px hairline and the 2px+ widths must each carry at least this share. The
                                    // uniform D-018 line measured 0.0% at 1px (2-3px only: its width along an axis
                                    // just follows its slope)
  minNearDark: 0.1,                 // near non-silhouette px that are dark MASS (ink-grey or darker): 1.0% with the
                                    // push removed, 23-46% shipped
  vignetteMax: 2,
};

// D-020, the paint layer (src/engine/paint-layer.ts). Every check above this line in the stage judges the INK
// PASS ALONE, with the paint layer switched off: POST_GATE is untouched by D-020. These judge the frame the
// player sees. MEASUREMENTS "D-020 paint gate" has each number's wrong value and shipped value.
export const PAINT_GATE = {
  changed: 8,            // levels (2 x tol): a pixel this far from the ink-only frame is one the paint layer drew
  minPaintedShare: 0.03, // of the six cameras' pixels: 0% with the layer off, 6.9% shipped (chapter 1)
  minPaperShare: 0.41,   // of the six cameras' pixels: 17.2% with the mist drawn mist-pale, 35.3% on D-019
                         // (cloud-band strips, no mist), 46.9% shipped. D-021: where the near rock is painted, judged
                         // with the rock itself drawn in place of the painted wall: the frame this floor was measured
                         // on. The wall is rock; this check is about the void
  // D-021, a level whose near rock is painted (MEASUREMENTS "D-021 paint gate"). The wrong value of both is
  // measured on every run, from the same frame with the wall lifted away.
  rock: 'kit_rock_mass', // the asset a dressed level collides with and does not draw (src/loaders/level.ts INK.collideOnly)
  undrawn: 'undrawn:',   // name prefix of the hidden mesh an undrawn collider keeps (src/loaders/level.ts UNDRAWN)
  wall: 'cliff:',        // name prefix of the painted wall's cards (src/loaders/cliff-wall.ts)
  minDarkShare: 0.04,    // of the pixels where the undrawn rock would be seen, dark MASS in the player's frame:
                         // 0.1% with the wall lifted away, 8.6% shipped
  minRockCovered: 0.9,   // of the pixels where the undrawn rock would be seen, drawn over by something: 11.8%
                         // with the wall lifted away (the mid cliffs behind it), 99.9% shipped
};

// D-029 (B-110), a moving stone in an ink level. An ink level draws no box, and a moving platform is a box: it
// can be left as the greybox slab, drawn paper on paper, or not drawn at all, and no check above this line
// would say so (they judge six fixed cameras, wherever the stone happens to be). This one looks at each stone
// from where he stands before it, with the follow rig's own offset, at EACH end of its travel, in the frame the
// player sees: the pixels where the stone is nearer than what is behind it (its mesh shown against hidden) must
// be there at all, must be OFF THE PAPER'S VALUE (docked, he looks down on its top, and a paper top in a paper
// level is an outline and nothing else; what happens to lie behind it does not come into this: the first cut of
// this check compared the frame with the one without the stone, and a paper stone passed it at 83%, because the
// mist under it is grey), and must hold a light top (ground: paper or mist-pale, never pushed dark).
// MEASUREMENTS "D-029 the stone check" has each number's wrong values.
export const STONE_GATE = {
  mesh: 'platform:',  // name prefix of a moving platform's mesh (src/loaders/level.ts PLATFORM_MESH)
  stand: 5.2,         // u before the stone's centre at the start of its path, along its travel: where he stands to look
  back: 6.66,         // the follow rig, settled: u behind his feet,
  up: 3.67,           // and u above them (tools/harness/frame.ts --at prints it)
  arrive: 0.05,       // u: the stone is "at" an end of its path within this
  minPx: 500,         // px of the 640 x 360 frame: 0 with the stone not drawn; 1,332 shipped at the least (the far end)
  minOff: 0.6,        // of those px, further than PAINT_GATE.changed from the paper's value: 4.8% as the greybox slab
                      // an ink level drew before D-029 and 3.7% paper on paper (both docked, seen from above); 100% shipped
  minTop: 0.15,       // of those px, mist-pale or lighter: 0.0% with a stone dark all over; 29.2% shipped at the least
                      // (the far end, where its side faces him)
};

export async function post(ctx: Ctx): Promise<StageResult> {
  const st = new Stage('post');
  return guard(st, async () => {
    const G = POST_GATE;
    const pal = (JSON.parse(readFileSync(join(ctx.root, 'reference/palette.json'), 'utf8')) as { colors: { name: string; hex: string }[] }).colors;
    const val = (name: string): number => { const h = pal.find((c) => c.name === name)!.hex; return [1, 3, 5].reduce((a, i) => a + parseInt(h.slice(i, i + 2), 16), 0) / 3; };
    const chromaMax = Math.max(...pal.map((c) => { const v = [1, 3, 5].map((i) => parseInt(c.hex.slice(i, i + 2), 16)); return Math.max(...v) - Math.min(...v); }));
    const paper = [1, 3, 5].map((i) => parseInt(pal[0]!.hex.slice(i, i + 2), 16));
    const vInkBlack = val('ink-black'), vInkGrey = val('ink-grey'), vMist = val('mist-pale'), vInkDeep = val('ink-deep'), vWashLight = val('wash-light'), vPaper = val('paper-cream');

    const dressed = (ctx.level as { palette?: string }).palette === 'ink';
    const g = await openGame(ctx);
    try {
      // D-020: from here to the paint-layer checks, the frame judged is the ink pass alone
      const shipped = await g.page.evaluate(() => window.__HARNESS__!.paintLayer()); // as the game starts, before this stage switches anything
      // D-021: as the game starts, how much of the level's rock is drawn (the stage shows it itself, further down)
      const rockPlaced = (ctx.level as unknown as { geometry: { asset: string }[] }).geometry.filter((p) => p.asset === PAINT_GATE.rock).length;
      const rockDrawn = (await g.page.evaluate(() => window.__HARNESS__!.translators())).filter((t) => t.name.endsWith(`/${PAINT_GATE.rock}`)).length; // every VISIBLE renderable, by its path
      const paintStatus = await g.page.evaluate(() => window.__HARNESS__!.paintLayer(false));
      // D-021: the rock this level collides with and does not draw is drawn for the ink-only frame
      const undrawn = await g.page.evaluate((p) => window.__HARNESS__!.showMeshes(p, true), PAINT_GATE.undrawn);
      let compN = 0, compPaper = 0, compChanged = 0, compHue = 0, compStill = 0, compMoved = 0, accentLost = 0;
      // D-023: how many swordsmen the level has, and the pixels they cover (summed over the cameras)
      const foes = await g.page.evaluate(() => window.__HARNESS__!.showEnemies(true));
      let foePx = 0, accentBehindFoe = 0;
      let voidN = 0, voidPaper = 0, compDark = 0, voidDark = 0, rockN = 0, rockCovered = 0, rockBare = 0, bareChanged = 0;
      const compHueAt: string[] = [];
      const passes = await g.page.evaluate(() => window.__HARNESS__!.postPasses());
      const extra = passes.filter((p) => !G.passes.includes(p)), missing = G.passes.filter((p) => !passes.includes(p));
      st.check('§6 passes: exactly value_compression, ink_edge, paper_grain', !extra.length && !missing.length && passes.join() === G.passes.join(),
        `running [${passes.join(', ')}]${missing.length ? `; MISSING ${missing.join(', ')}` : ''}${extra.length ? `; NOT ALLOWED ${extra.join(', ')}` : ''}`);
      const audit = await g.page.evaluate(() => window.__HARNESS__!.sceneAudit());
      st.check('§1: zero lights in the scene', audit.lights.length === 0, audit.lights.join(', ') || 'none');
      st.check('§1: zero lit materials in the scene', audit.litMaterials.length === 0, audit.litMaterials.join(', ') || 'none (every material unlit)');

      let judged = 0, miss = 0, midN = 0, farN = 0, hueBad = 0, total = 0, paperN = 0;
      let planeN = 0, planeInk = 0, nearBlack = 0, flatN = 0, flatInk = 0, silN = 0, silInk = 0, creaseN = 0, creaseInk = 0, midSilN = 0, midLine = 0, nearN = 0, nearDark = 0;
      const weight = new Array<number>(7).fill(0); // stroke width in px, measured where the form behind is light
      const sky: number[] = [], corner: number[] = [], centre: number[] = [];
      let staticDiff = 0, staticN = 0;
      const missAt: string[] = [], hueAt: string[] = [];
      const ty = Math.tan((RENDER_CONFIG.fovDeg * Math.PI) / 360);
      // a pose the six visual cameras never take: almost IN the ground plane, looking along it. A flat top seen
      // like this has a huge depth ratio between neighbouring pixels and is still one plane, not a silhouette.
      const cp = ctx.level.critical_path.map((w) => (Array.isArray(w) ? w : w.pos)) as [number, number, number][];
      const s0 = cp[0]!, s1 = cp[1]!, gl = Math.hypot(s1[0] - s0[0], s1[2] - s0[2]) || 1, gd = [(s1[0] - s0[0]) / gl, (s1[2] - s0[2]) / gl];
      const grazeCam = { name: 'graze', pos: [s0[0] + gd[0]! * G.graze.start, s0[1] + G.graze.eye, s0[2] + gd[1]! * G.graze.start] as [number, number, number],
        target: [s0[0] + gd[0]! * G.graze.ahead, s0[1] + G.graze.eye, s0[2] + gd[1]! * G.graze.ahead] as [number, number, number] };
      // Judged on DRESSED levels only: their ground is clean paper. An undressed level can have dark material
      // lying flat on the ground (a hazard pad), which this cannot tell from a line drawn on a plane: reported.
      for (const cam of [...cameras(ctx.level), grazeCam]) {
        const grazing = cam.name === 'graze';
        await g.page.evaluate((c) => { window.__HARNESS__!.setCamera(c.pos, c.target); window.__HARNESS__!.advance(1); }, cam);
        const shot = PNG.sync.read(await g.page.locator('canvas').screenshot());
        if (process.env['POST_DEBUG_DIR']) writeFileSync(join(process.env['POST_DEBUG_DIR'], `${ctx.levelId}-${cam.name}.png`), PNG.sync.write(shot));
        const probe = await g.page.evaluate(() => window.__HARNESS__!.postProbe());
        if (probe.width !== shot.width || probe.height !== shot.height) { st.check(`${cam.name}: depth readback matches the frame`, false, `${probe.width}x${probe.height} vs ${shot.width}x${shot.height}`); continue; }
        await g.page.evaluate(() => window.__HARNESS__!.advance(1)); // same pose, next frame: grain must not move
        const again = PNG.sync.read(await g.page.locator('canvas').screenshot());
        const D2 = (await g.page.evaluate(() => window.__HARNESS__!.postProbe())).dist; // a crow may fly into the sky
        const { width: W, height: H } = shot, D = probe.dist, far = D.reduce((m, v) => (v > m ? v : m), 0);
        if (paintStatus.painted > 0 && !grazing) { // the same pose with the paint layer on: the player's frame
          // the ink pass as the game ships it (the undrawn rock hidden again), at the SAME world tick as `again`
          let ink = again, Dink = D2;
          if (undrawn > 0) {
            await g.page.evaluate((p) => { window.__HARNESS__!.showMeshes(p, false); window.__HARNESS__!.redraw(); }, PAINT_GATE.undrawn);
            ink = PNG.sync.read(await g.page.locator('canvas').screenshot());
            Dink = (await g.page.evaluate(() => window.__HARNESS__!.postProbe())).dist;
          }
          // drawn at the same tick again, so the two frames differ only where the paint layer drew
          await g.page.evaluate(() => { window.__HARNESS__!.paintLayer(true); window.__HARNESS__!.redraw(); });
          const comp = PNG.sync.read(await g.page.locator('canvas').screenshot());
          if (process.env['POST_DEBUG_DIR']) writeFileSync(join(process.env['POST_DEBUG_DIR'], `${ctx.levelId}-${cam.name}-painted.png`), PNG.sync.write(comp));
          // D-023: the same frame without the swordsmen. They are painted FIGURES: they move, and one may stand
          // in front of a gate. `static` and `hides no accent pixel` judge the painted SCENERY, so the pixels a
          // swordsman covers (where this frame differs from `comp`) are left out of those two and counted.
          let compNoFoe = comp;
          if (foes > 0) {
            await g.page.evaluate(() => { window.__HARNESS__!.showEnemies(false); window.__HARNESS__!.redraw(); });
            compNoFoe = PNG.sync.read(await g.page.locator('canvas').screenshot());
            await g.page.evaluate(() => { window.__HARNESS__!.showEnemies(true); window.__HARNESS__!.redraw(); });
          }
          // D-021: the player's frame with the painted wall lifted away. `bare`: nothing in its place, which is
          // the wrong value of the two checks that need the wall. `voided`: the rock itself drawn in its place,
          // which is the frame the void's paper share was measured on before the wall was painted (the rock is
          // not void, and must not count as paper).
          let bare = comp, voided = comp;
          if (undrawn > 0) {
            await g.page.evaluate((p) => { window.__HARNESS__!.showMeshes(p, false); window.__HARNESS__!.redraw(); }, PAINT_GATE.wall);
            bare = PNG.sync.read(await g.page.locator('canvas').screenshot());
            await g.page.evaluate((p) => { window.__HARNESS__!.showMeshes(p, true); window.__HARNESS__!.redraw(); }, PAINT_GATE.undrawn);
            voided = PNG.sync.read(await g.page.locator('canvas').screenshot());
            await g.page.evaluate(([w, u]) => { window.__HARNESS__!.showMeshes(w, true); window.__HARNESS__!.showMeshes(u, false); }, [PAINT_GATE.wall, PAINT_GATE.undrawn] as const);
          }
          await g.page.evaluate(() => window.__HARNESS__!.advance(1));
          const comp2 = PNG.sync.read(await g.page.locator('canvas').screenshot());
          const D3 = (await g.page.evaluate(() => window.__HARNESS__!.postProbe())).dist; // the ink depth under comp2
          let foe: Uint8Array | null = null; // 1 where a swordsman is drawn, in this frame or the next
          if (foes > 0) {
            await g.page.evaluate(() => { window.__HARNESS__!.showEnemies(false); window.__HARNESS__!.redraw(); });
            const comp2NoFoe = PNG.sync.read(await g.page.locator('canvas').screenshot());
            await g.page.evaluate(() => { window.__HARNESS__!.showEnemies(true); });
            foe = new Uint8Array(shot.width * shot.height);
            const differs = (a: PNG, b: PNG, o: number): boolean => a.data[o] !== b.data[o] || a.data[o + 1] !== b.data[o + 1] || a.data[o + 2] !== b.data[o + 2];
            for (let i = 0; i < foe.length; i++) if (differs(comp, compNoFoe, i * 4) || differs(comp2, comp2NoFoe, i * 4)) { foe[i] = 1; foePx++; }
          }
          await g.page.evaluate((p) => { window.__HARNESS__!.paintLayer(false); window.__HARNESS__!.showMeshes(p, true); }, PAINT_GATE.undrawn);
          const cv = (img: PNG, k: number): number => (img.data[k * 4]! + img.data[k * 4 + 1]! + img.data[k * 4 + 2]!) / 3;
          const Wc = shot.width, Hc = shot.height;
          // dark MASS, as the ink check defines it: ink-grey or darker here and 3px away on every side
          const mass = (img: PNG, k: number): boolean => {
            const x = k % Wc, y = (k - x) / Wc;
            if (x < 3 || y < 3 || x >= Wc - 3 || y >= Hc - 3) return false;
            const dk = (j: number): boolean => cv(img, j) <= vInkGrey + G.tol;
            return dk(k) && dk(k - 3) && dk(k + 3) && dk(k - 3 * Wc) && dk(k + 3 * Wc);
          };
          for (let i = 0; i < shot.width * shot.height; i++) {
            const o = i * 4, r = comp.data[o]!, gg = comp.data[o + 1]!, b = comp.data[o + 2]!, v = (r + gg + b) / 3;
            const chroma = Math.max(r, gg, b) - Math.min(r, gg, b), accent = chroma > G.accentChroma;
            const robe = Math.abs(r - G.robe[0]) <= G.tol * 2 && Math.abs(gg - G.robe[1]) <= G.tol * 2 && Math.abs(b - G.robe[2]) <= G.tol * 2;
            const ir = ink.data[o]!, ig = ink.data[o + 1]!, ib = ink.data[o + 2]!, inkChroma = Math.max(ir, ig, ib) - Math.min(ir, ig, ib);
            compN++;
            if (Math.abs(v - vPaper) <= G.tol && !accent) compPaper++;
            {
              const br = voided.data[o]!, bg = voided.data[o + 1]!, bb = voided.data[o + 2]!;
              voidN++;
              if (Math.abs((br + bg + bb) / 3 - vPaper) <= G.tol && Math.max(br, bg, bb) - Math.min(br, bg, bb) <= G.accentChroma) voidPaper++;
            }
            // where the undrawn rock WOULD be seen: nearer, with it shown (D2), than the ink pass has without it
            if (undrawn > 0 && D2[i]! < Dink[i]! * 0.999) {
              rockN++;
              if (Math.abs(v - vPaper) > G.tol) rockCovered++;
              if (Math.abs(cv(bare, i) - vPaper) > G.tol) rockBare++;
              if (mass(comp, i)) compDark++;
              if (mass(bare, i)) voidDark++;
            }
            if (!accent && !robe && chroma > chromaMax + 1) { compHue++; if (compHueAt.length < 3) compHueAt.push(`${cam.name} (${i % shot.width},${Math.floor(i / shot.width)}) rgb(${r},${gg},${b})`); }
            if (inkChroma > G.accentChroma && !accent) { if (foe?.[i]) accentBehindFoe++; else accentLost++; }
            // D-021: what the paint layer drew with the wall lifted away (the far field, the figure, the path's wash).
            // The wall alone covers far more than the floor below, so it must not be what satisfies it.
            if (Math.abs(cv(bare, i) - (ir + ig + ib) / 3) > PAINT_GATE.changed) bareChanged++;
            if (Math.abs(v - (ir + ig + ib) / 3) > PAINT_GATE.changed) {
              compChanged++;
              // judged where nothing in the ink pass can have moved: paint over the sky, one tick later
              // sky here AND all round it, in both frames: the canvas is multisampled, so a moving ink edge one pixel
              // away blends into this one
              const xx = i % shot.width, yy = (i - xx) / shot.width;
              let clear = xx > 0 && yy > 0 && xx < shot.width - 1 && yy < shot.height - 1;
              for (let dy = -1; clear && dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                const j = i + dy * shot.width + dx;
                if (Dink[j]! < far * 0.999 || D3[j]! < far * 0.999 || foe?.[j]) { clear = false; break; }
              }
              if (clear) { compStill++; if (comp2.data[o]! !== r) compMoved++; }
            }
          }
        }
        const tx = ty * (W / H);
        // 1/viewZ per pixel: linear across any plane in screen space, so its Laplacian is 0 on a face
        const IZ = new Float64Array(W * H);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const nx = (((x + 0.5) / W) * 2 - 1) * tx, ny = (1 - ((y + 0.5) / H) * 2) * ty;
          IZ[y * W + x] = Math.sqrt(nx * nx + ny * ny + 1) / D[y * W + x]!;
        }
        const V = (i: number): number => (shot.data[i * 4]! + shot.data[i * 4 + 1]! + shot.data[i * 4 + 2]!) / 3;
        const M = 8; // margin: the inward walks below reach 7px
        for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
          const i = y * W + x, o = i * 4, r = shot.data[o]!, gg = shot.data[o + 1]!, b = shot.data[o + 2]!, v = (r + gg + b) / 3, d = D[i]!;
          const chroma = Math.max(r, gg, b) - Math.min(r, gg, b);
          const robe = Math.abs(r - G.robe[0]) <= G.tol * 2 && Math.abs(gg - G.robe[1]) <= G.tol * 2 && Math.abs(b - G.robe[2]) <= G.tol * 2;
          const accent = chroma > G.accentChroma;
          total++;
          if (Math.abs(v - vPaper) <= G.tol && !accent) paperN++;
          if (!accent && !robe && chroma > chromaMax + 1) { hueBad++; if (hueAt.length < 3) hueAt.push(`${cam.name} (${x},${y}) rgb(${r},${gg},${b})`); }
          if (d >= far * 0.999) { // sky
            sky.push(r - paper[0]!);
            if (D2[i]! >= far * 0.999) { staticN++; if (again.data[o]! !== r) staticDiff++; } // sky in both frames
            const cx = Math.min(x, W - 1 - x) / W, cy = Math.min(y, H - 1 - y) / H;
            if (cx < 0.1 && cy < 0.1) corner.push(v); else if (cx > 0.35 && cy > 0.35) centre.push(v);
          }
          if (accent || robe) continue;
          if (grazing) { // only the plane check reads this pose
            if (d < G.nearM && x >= M && x < W - M && y >= M && y < H - M) { // M = 8 covers the 6px reach below
              // DEEP INSIDE a ground plane that recedes steeply (1/z changes > grazeSlope per row, hardly at all
              // along a row), and planar for 6px every way, so no real edge's stroke (<= 4px) can reach it.
              // GROUND: nearer toward the foot of the frame (1/z rises down the rows). D-028: the slope is signed,
              // because a plane that comes nearer toward the TOP of the frame is the underside of something
              // overhead, seen from below (chapter 2: the rock's overhanging slab, a dark mass and not a line).
              // Nothing there is a silhouette: any ink is the line drawing a plane against itself.
              const iz = IZ[i]!, R = 6;
              const flat = (st: number): boolean => Math.abs(IZ[i - st * R]! + IZ[i + st * R]! - 2 * iz) / iz < G.planeLap * R * R;
              if ((IZ[i + W]! - IZ[i - W]!) / (2 * iz) > G.grazeSlope && Math.abs(IZ[i + 1]! - IZ[i - 1]!) / (2 * iz) < G.grazeSlope / 10 && flat(1) && flat(W)) {
                planeN++;
                if (v <= vInkDeep + G.tol) planeInk++;
              }
            }
            continue;
          }
          // the 4 neighbours: which one (if any) is a strong jump AWAY, and is the surface smooth here
          const step = [-1, 1, -W, W];
          let away = 0, smooth = true;
          for (const s of step) { const n = D[i + s]!; if (n >= d * G.jump) away = s; if (n > d * G.smooth || d > n * G.smooth) smooth = false; }
          const silhouette = away !== 0;
          const inner = x >= M && x < W - M && y >= M && y < H - M;
          if (d < G.nearM) {
            if (silhouette) {
              const ink = v <= vInkDeep + G.tol;
              // contrast ACROSS the boundary, as shown: the form 5px inside (same surface) vs what is behind
              const in5 = i - away * 5;
              const sameSurface = inner && D[in5]! < d * G.smooth && d < D[in5]! * G.smooth;
              const contrast = sameSurface ? Math.abs(V(in5) - V(i + away)) : -1;
              if (contrast >= 0 && contrast <= G.sameValue) { flatN++; if (ink) flatInk++; }
              else if (contrast >= G.clearValue) { silN++; if (ink) silInk++; }
              // stroke weight: only where the form 7px inside the boundary is the same surface and LIGHT, so a
              // dark run is the line and not the form (a dark face would read as an infinitely thick stroke)
              if (ink && inner && contrast > G.sameValue) { // not the forced hairline of a same-value edge
                const back = i - away * 7;
                if (D[back]! < d * G.smooth && d < D[back]! * G.smooth && V(back) >= vWashLight - G.tol) {
                  let wpx = 0;
                  while (wpx < 6 && V(i - away * wpx) <= vInkDeep + G.tol) wpx++;
                  weight[wpx]!++;
                }
              }
            } else {
              // MASS, not line: a dark pixel whose neighbours 3px away in all four directions are dark too. A
              // stroke, a lip or an outline is thinner than that and does not count.
              nearN++;
              const dark = (k: number): boolean => V(k) <= vInkGrey + G.tol; // the dark half of the ramp's lower end
              if (inner && dark(i) && dark(i - 3) && dark(i + 3) && dark(i - 3 * W) && dark(i + 3 * W)) nearDark++;
              const black = (k: number): boolean => V(k) <= vInkBlack + G.tol;
              if (inner && black(i) && black(i - 3) && black(i + 3) && black(i - 3 * W) && black(i + 3 * W)) nearBlack++;
              if (smooth) {
                const iz = IZ[i]!, lap = Math.min(IZ[i - 1]! + IZ[i + 1]! - 2 * iz, IZ[i - W]! + IZ[i + W]! - 2 * iz) / iz;
                // OUTLINED = a line, not a mass: ink here, and the form 3px to both sides (along x or along y)
                // clearly lighter. A crease lying on a dark wash is just the wash.
                const lineLike = (a: number, b2: number): boolean => V(a) > v + 12 && V(b2) > v + 12;
                // a small step-down between two surfaces is a real silhouette, not a crease: the two surfaces,
                // each continued from its own two samples, do not meet between the pixels (the shader's own
                // definition, re-derived here from the depth readback)
                const gap = (st: number): boolean => { const a = 2 * iz - IZ[i - st]! - IZ[i + st]!, b3 = iz - (2 * IZ[i + st]! - IZ[i + 2 * st]!); return Math.min(a, b3) > G.stepGap * iz; };
                const step = gap(1) || gap(-1) || gap(W) || gap(-W);
                if (lap < -G.creaseLap && inner && !step) { creaseN++; if (v <= vInkDeep + G.tol && (lineLike(i - 3, i + 3) || lineLike(i - 3 * W, i + 3 * W))) creaseInk++; }
              }
            }
          } else if (d < G.midM) {
            midN++; judged++;
            if (v < vInkGrey - G.tol) { miss++; if (missAt.length < 3) missAt.push(`${cam.name} (${x},${y}) mid ${d.toFixed(1)}u v=${v.toFixed(0)}`); }
            if (silhouette && inner) {
              const back = i - away * 3;
              if (D[back]! < d * G.smooth && d < D[back]! * G.smooth) { midSilN++; if (v < V(back) - 12) midLine++; }
            }
          } else if (d < far * 0.999) {
            farN++; judged++;
            if (v < vMist - G.tol) { miss++; if (missAt.length < 3) missAt.push(`${cam.name} (${x},${y}) far ${d.toFixed(1)}u v=${v.toFixed(0)}`); }
          }
        }
      }
      const pc = (a: number, b: number): string => (b ? ((a / b) * 100).toFixed(1) : '-') + '%';
      st.check('§6 value_compression: mid band no darker than ink-grey, far band no darker than mist-pale',
        judged > 0 && miss / judged <= G.maxCompressionMiss,
        judged ? `${miss} of ${judged} judged pixels off-band (${((miss / judged) * 100).toFixed(3)}%, allowed ${G.maxCompressionMiss * 100}%; mid ${midN}, far ${farN})${missAt.length ? `: ${missAt.join('; ')}` : ''}` : 'no mid or far pixel in any camera: nothing to judge');
      st.check('D-019 value range: ink-black is present as mass in a dressed near field', !dressed || nearBlack / (nearN || 1) >= G.minNearBlack,
        `${pc(nearBlack, nearN)} of near non-silhouette px are ink-BLACK mass${dressed ? ` (need >= ${G.minNearBlack * 100}%)` : ' (undressed: its darkest face is stone-mid, so it tops out at ink-deep; reported)'}`);
      st.check('D-019 value range: the near field reaches the dark end as mass', nearN > 0 && nearDark / nearN >= G.minNearDark,
        `${pc(nearDark, nearN)} of ${nearN} near non-silhouette px are dark MASS (ink-grey or darker, and so 3px away on every side) (need >= ${G.minNearDark * 100}%); paper ${pc(paperN, total)} of the frame (reported: B-42)`);
      const hit = silN ? silInk / silN : 0;
      st.check('D-019 ink_edge: where value separates the forms, the silhouette line BREAKS (neither absent nor uniform)', silN >= G.minEdgePixels && hit >= G.edgeHit[0] && hit <= G.edgeHit[1],
        `${silInk} of ${silN} near silhouette px with >= ${G.clearValue} levels across them are ink (${pc(silInk, silN)}; need ${G.edgeHit[0] * 100}-${G.edgeHit[1] * 100}% of >= ${G.minEdgePixels})`);
      st.check('D-019 ink_edge: where value does NOT separate them (one top against the next one down), the line never breaks', flatN < G.minClass.flat || flatInk / flatN >= G.minFlatEdgeHit,
        `${flatInk} of ${flatN} near silhouette px with <= ${G.sameValue} levels across them are ink (${pc(flatInk, flatN)}, need >= ${G.minFlatEdgeHit * 100}%${flatN < G.minClass.flat ? `; fewer than ${G.minClass.flat} such px in these cameras: too few to judge` : ''})`);
      const wN = weight.reduce((a, b) => a + b, 0), share = (k: number): number => (wN ? weight[k]! / wN : 0);
      const heavier = weight.slice(2).reduce((a, b) => a + b, 0) / (wN || 1);
      st.check('D-019 ink_edge: stroke weight varies (a hairline AND heavier widths, each a real share)', wN >= G.minClass.weight && share(1) >= G.minWeightShare && heavier >= G.minWeightShare,
        `${wN} measurable stroke px (need >= ${G.minClass.weight}); width shares ${weight.map((n, k) => (k ? `${k}px ${pc(n, wN)}` : '')).filter(Boolean).join(', ')}`);
      st.check('D-019 ink_edge: interior creases are not outlined', creaseN >= G.minClass.crease && creaseInk / creaseN <= G.maxCreaseInk,
        `${creaseInk} of ${creaseN} convex-crease px with no depth jump are an ink line (${pc(creaseInk, creaseN)}, allowed ${G.maxCreaseInk * 100}%)`);
      st.check('D-019 ink_edge: flat ground seen at a grazing angle carries no line', !dressed || (planeN >= G.minClass.plane && planeInk / planeN <= G.maxPlaneInk),
        `grazing camera ${G.graze.eye}u over the ground: ${planeInk} of ${planeN} px deep inside the receding ground plane are ink (${pc(planeInk, planeN)}${dressed ? `, allowed ${G.maxPlaneInk * 100}% of >= ${G.minClass.plane}` : '; undressed: reported, hazard pads lie on this ground'})`);
      st.check('D-019 ink_edge: distant forms carry no drawn line', midSilN >= G.minClass.mid && midLine / midSilN <= G.maxMidLine,
        `${midLine} of ${midSilN} mid silhouette px are darker than the form 3px inside (${pc(midLine, midSilN)}, allowed ${G.maxMidLine * 100}%)`);
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
      // ---- D-020: the paint layer, judged on the frame the player sees
      const P = PAINT_GATE;
      st.check('D-020 paint layer: on as the game ships (not only when this stage switches it on)', shipped.drawn, shipped.drawn ? `drawing ${shipped.painted} painted meshes` : `${shipped.painted} painted meshes in the scene, and the layer is NOT drawing them`);
      st.check('D-020 paint layer: the figure on every level; a painted far field on a dressed level and on no other',
        paintStatus.painted > 0 && (dressed ? paintStatus.backdrop > 0 && compN > 0 && bareChanged / compN >= P.minPaintedShare : paintStatus.backdrop === 0),
        dressed ? `${paintStatus.painted} painted meshes, ${paintStatus.backdrop} of them the far field; ${pc(bareChanged, compN)} of the frame differs from the ink pass alone${undrawn > 0 ? ' with the cliff wall lifted away' : ''} (need >= ${P.minPaintedShare * 100}%)${undrawn > 0 ? `; ${pc(compChanged, compN)} with the wall` : ''}` : `${paintStatus.painted} painted meshes, ${paintStatus.backdrop} of them a far field (undressed: none allowed); ${pc(compChanged, compN)} of the frame is painted`);
      if (paintStatus.painted > 0) {
        if (dressed) st.check('D-020 mist: the void is bare paper, not grey shapes', voidN > 0 && voidPaper / voidN >= P.minPaperShare,
          undrawn > 0 ? `paper is ${pc(voidPaper, voidN)} of the painted frame with the rock drawn in place of the painted wall (need >= ${P.minPaperShare * 100}%); ${pc(compPaper, compN)} of the frame the player sees`
            : `paper is ${pc(voidPaper, voidN)} of the painted frame (need >= ${P.minPaperShare * 100}%)`);
        if (dressed && rockPlaced > 0) st.check('D-021 a dressed level\'s rock collides and is not drawn, as the game ships', rockDrawn === 0 && undrawn === rockPlaced,
          `${rockPlaced} ${P.rock} placements: ${rockDrawn} drawn, ${undrawn} kept hidden`);
        if (undrawn > 0) {
          st.check('D-021 painted near field: where the rock stands, the player\'s frame reaches the dark end as mass', rockN > 0 && compDark / rockN >= P.minDarkShare,
            `${pc(compDark, rockN)} of the ${rockN} px where the rock would be seen are dark MASS in the painted frame (ink-grey or darker, and so 3px away on every side) (need >= ${P.minDarkShare * 100}%); ${pc(voidDark, rockN)} with the cliff wall lifted away`);
          // POOLED over every undrawn mesh and all six cameras: it cannot name one bare collider among many (OQ-071)
          st.check('D-021 undrawn rock: where the rock would be seen, the frame is drawn over (pooled over the cameras)', rockN > 0 && rockCovered / rockN >= P.minRockCovered,
            `${undrawn} undrawn meshes; of ${rockN} px where they would be seen, ${pc(rockCovered, rockN)} are drawn over (need >= ${P.minRockCovered * 100}%); ${pc(rockBare, rockN)} with the cliff wall lifted away`);
        }
        st.check('D-020 paint layer: no hue (the painted frame stays on the ramp\'s chroma)', compHue === 0,
          `${compHue} of ${compN} px above the ramp's chroma ${chromaMax}${compHueAt.length ? `: ${compHueAt.join('; ')}` : ''}`);
        st.check('D-020 paint layer: static (what it drew over the sky is identical next frame)', (dressed ? compStill > 0 : true) && compMoved === 0, `${compMoved} of ${compStill} painted sky px changed${foes ? `; ${foePx} px that the ${foes} swordsmen cover are not judged: a figure moves (D-023)` : ''}`);
        st.check('D-020 paint layer: hides no accent pixel', accentLost === 0, `${accentLost} px that are accent in the ink pass are not in the painted frame${foes ? `; ${accentBehindFoe} more are behind a swordsman, who may stand in front of a gate (D-023)` : ''}`);
      }
      // ---- D-029: every moving stone of an ink level, seen from where he stands before it
      const stones = dressed ? ((ctx.level as unknown as { platforms?: { id?: string; path: [number, number, number][]; duration: number }[] }).platforms ?? []) : [];
      if (stones.length) {
        const S = STONE_GATE;
        await g.page.evaluate((p) => { window.__HARNESS__!.paintLayer(true); window.__HARNESS__!.showMeshes(p, false); }, PAINT_GATE.undrawn); // the frame the player sees
        let leastPx = Infinity, leastOff = Infinity, leastTop = Infinity;
        const seen: string[] = [];
        for (const [pi, p] of stones.entries()) {
          const id = p.id ?? `platforms[${pi}]`, from = p.path[0]!, to = p.path[p.path.length - 1]!;
          const len = Math.hypot(to[0] - from[0], to[2] - from[2]) || 1, dir = [(to[0] - from[0]) / len, (to[2] - from[2]) / len];
          const feet = [from[0] - dir[0]! * S.stand, from[1], from[2] - dir[1]! * S.stand];
          const camPos = [feet[0]! - dir[0]! * S.back, feet[1]! + S.up, feet[2]! - dir[1]! * S.back] as [number, number, number];
          for (const [ei, end] of [from, to].entries()) {
            // run the world on until the stone is at this end (it comes back to each within two crossings)
            let at = false;
            for (let k = 0; k < Math.ceil(p.duration * 60) * 2 + 2 && !at; k++) {
              const snap = await g.page.evaluate(() => window.__HARNESS__!.advance(1, 0));
              const pos = snap.platforms.find((q) => q.id === id)?.pos;
              at = !!pos && Math.hypot(pos[0] - end[0], pos[1] - end[1], pos[2] - end[2]) <= S.arrive;
            }
            if (!at) { st.check(`D-029 moving stone ${id}: reaches the ${ei ? 'far' : 'near'} end of its path`, false, 'it never came within reach of it in two crossings'); continue; }
            await g.page.evaluate(([c, t]) => { window.__HARNESS__!.setCamera(c, t); window.__HARNESS__!.redraw(); }, [camPos, end] as const);
            const frame = PNG.sync.read(await g.page.locator('canvas').screenshot());
            const withIt = (await g.page.evaluate(() => window.__HARNESS__!.postProbe())).dist;
            await g.page.evaluate((m) => { window.__HARNESS__!.showMeshes(m, false); window.__HARNESS__!.redraw(); }, S.mesh);
            const without = (await g.page.evaluate(() => window.__HARNESS__!.postProbe())).dist;
            await g.page.evaluate((m) => { window.__HARNESS__!.showMeshes(m, true); window.__HARNESS__!.redraw(); }, S.mesh);
            let px = 0, off = 0, top = 0;
            for (let i = 0; i < withIt.length; i++) {
              if (!(withIt[i]! < without[i]! * 0.999)) continue; // not the stone: nothing came nearer when it was shown
              px++;
              const v = (frame.data[i * 4]! + frame.data[i * 4 + 1]! + frame.data[i * 4 + 2]!) / 3;
              if (Math.abs(v - vPaper) > PAINT_GATE.changed) off++;
              if (v >= vMist - G.tol) top++;
            }
            leastPx = Math.min(leastPx, px);
            leastOff = Math.min(leastOff, px ? off / px : 0);
            leastTop = Math.min(leastTop, px ? top / px : 0);
            seen.push(`${id} at its ${ei ? 'far' : 'near'} end ${px} px, ${pc(off, px || 1)} off the paper's value, ${pc(top, px || 1)} a light top`);
          }
        }
        st.check('D-029 a moving stone is drawn in an ink level: from where he stands before it, at each end of its travel, it is off the paper value and has a light top',
          leastPx >= S.minPx && leastOff >= S.minOff && leastTop >= S.minTop,
          `${seen.join('; ')} (need >= ${S.minPx} px, >= ${S.minOff * 100}% off paper, >= ${S.minTop * 100}% top)`);
      }
      st.check('zero console errors', g.errors.length === 0, g.errors.slice(0, 5).join(' | ') || 'none');
    } finally {
      await g.close();
    }
  });
}
