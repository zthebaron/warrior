# HANDOFF-ART: READ THIS SECTION FIRST (art pass 2, written 2026-11-10 ~22:25Z by session art-pass-2)

Everything below the line was written before PR 31 merged and is history. Current state:
- **PR 31 (art pass 1) is MERGED.** Its CI story is OQ-070 item 15 and MEASUREMENTS "D-020 production load".
- **Art pass 2 is PR 34**, branch `art-pass-2` off main: D-021 in PHASE-0-DECISIONS, OQ-071, MEASUREMENTS "D-021 ..." sections, backlog B-51 to B-53. Evidence in `docs/build-log/d021/` (the 5120x1440 player-view frame is `ch1-player-5120x1440.png`).
- **What it built:** ink levels do not draw kit_rock_mass (`src/loaders/level.ts` `INK.collideOnly`); `src/loaders/cliff-wall.ts` stands painted cards there, derived from the rock placements; `src/loaders/backdrop.ts` uses ART-GEN's peaks, cliffs and mist; `src/loaders/path-wash.ts` brushes the path; the player is `warrior_anim` (`src/entities/character-model.ts`); cards are made by `tools/art/backdrop-cards.mjs` from `assets/backdrop/gen` and held by `assets:budget`.
- **Tools added:** `node tools/harness/motion.ts <dir>` (the figure in motion, as strips; `--clips` for every clip frame by frame); harness hooks `showMeshes(prefix, visible)`, `showFigure(clip, time)`, `figureClips()`.
- **Gotchas:** cards are blended and write no depth, so draw order is explicit (the wall after the mist, the figure last: `paintLast`). The post stage shows the undrawn rock for its ink-only frame and hides it again; a new harness stage that toggles meshes must restore them. CI writes Linux actuals only for cameras over 0.5%, so take goldens from the run and compare the rest to darwin.
- **Open for Tim:** OQ-071 (all PROVISIONAL), above all items 2, 3, 6 and 14.

---

# HANDOFF-ART (written 2026-11-10 ~20:20Z by session art-pass-1, for a fresh session with zero memory)

## 1. Branch, PR, CI
- Worktree `/Users/timdevallee/Code/warrior/.claude/worktrees/ch1-assets`, branch `art-pass-1` (HEAD 7fefbd3 + this file). main (eeaacac, with PR 30 INK-HIRES and PR 32 ART-GEN) is merged in.
- PR #31 `art-pass-1` -> main: OPEN, DRAFT, MERGEABLE. Tim: take it out of draft once the backdrop, the rigged warrior and the torii are in and CI is green; he merges. Then send him the 5120x1440 screenshot (`docs/build-log/d020/ch1-warrior-5120x1440.png`).
- Claim `ART-PASS-1` (agent `art-pass-1`, taken 18:19:49Z, ttl 480 min) is live on main. Release when PR 31 is green, from a detached origin/main (HANDOFF-INK.md section 1 has the exact sequence).
- CI run **42893283097** on 7fefbd3 (complete): static and matrix PASS; all five level jobs FAIL; **game FAILS**; playtest (merge) fails as a result. Pushing this file starts a new run on the new head: take actuals from the newest COMPLETED run on art-pass-1.
  - Levels (2.5-6 min each): `visual` only, confirmed in the 00-gym and 03 logs (one FAIL line each); assumed for 01, 02, 04: check. Cause: Linux goldens are still D-019's; darwin goldens were re-taken on all five levels.
  - **game (job 130099672397): `reachable` 12/13**: `✗ bare URL reaches the entry chapter (production bundle): loaded "(nothing)", expected "01-lower-stair"`. Passes locally. NOT diagnosed. It is the PRODUCTION bundle (dist/) at the bare URL not reporting a loaded level in time. Start in `tools/harness/reachable.ts` (the wait for `document.body.dataset.level`) and the console errors of that page. Suspects: the load is now slower than that wait on CI (every level decodes `assets/char/warrior_rigged.glb`, a 1024 px KTX2, plus chapter 1's four 1 MB hero glbs and three backdrop PNGs, on SwiftShader); or a production-only path (`import.meta.glob` of `assets/char/*.glb` / `assets/backdrop/*.png`, the KTX2 transcoder under /vendor/basis). Reproduce locally with `npm run playtest -- --only=reachable`; if it only fails on CI, measure the load time there before touching any wait (a wait is a number: MEASUREMENTS).
- Fix for the levels (each git command alone):
  `for l in 00-gym 01-lower-stair 02-cliff-seam 03-drifting-stones 04-summit-ridge; do gh run download <run> -n harness-report-$l -D $CLAUDE_JOB_DIR/tmp/ci31/$l; done`
  check every stage but `visual` passed in each log; copy `tools/harness/golden/linux/<l>/camN.actual.png` over `tools/harness/golden/linux/<l>/camN.png` (N 0-5); compare to darwin with pixelmatch 0.1 (PR 29 was <= 0.016%; the paint layer is drawn on the MSAA canvas, so expect a little more: look at any camera over 0.1%); `git add tools/harness/golden/linux`; commit "D-020: linux goldens, all five levels, from CI run <id> actuals"; `git push origin HEAD:refs/heads/art-pass-1`; wait for 9/9.
- Then: `gh pr edit 31 --body-file $CLAUDE_JOB_DIR/tmp/pr-art-final.md` (drafted; if the job tmp is gone, rebuild it from D-020 and add the green run id), `gh pr ready 31`, release the claim, report.
- Small fix still owed: BACKLOG B-47 says "6.0 MB added"; with cliff_b it is 7.0 MB.

## 2. What art pass 1 built (D-020 in PHASE-0-DECISIONS; OQ-070; MEASUREMENTS "D-020 ..." sections)
- **Paint layer** `src/engine/paint-layer.ts`, called from `src/main.ts` right after `renderer.render()`. Painted meshes are on three.js layer 1 in the same scene; per frame: clear canvas depth, draw the ink geometry depth-only, draw layer 1 with depth test. `paintMaterial()` = unlit + the ink pass's static grain. `ink-post.ts` / `renderer.ts` are NOT edited.
- **Painted backdrop** `src/loaders/backdrop.ts` (`BACKDROP`), ink-palette levels only (chapter 1). Textures: `tools/art/backdrop-textures.mjs` -> `assets/backdrop/*.png` from the seed (far_ridge from hero_11s, mid_cliff_a/b from hero_9s). Layers: paper sky = nothing; 3 static ridge rings (r 300/380/460); 5 mid-cliff planes; mist = 6 paper-cream sheets y -7..-3 (bare paper). kit_mid_cliff / kit_far_peak / kit_cloud_band are no longer placed (`tools/levelgen/dress-01.mjs`).
- **Hero class**: `tools/assets/budgets.json` `classes.hero` (30000 tris, 1024 px, 1 texture/material/draw call) + a measured line per asset; `backdrop` and `characters` blocks checked by `tools/assets/paint-budget.mjs` inside `npm run assets:budget`. Manifest schema has optional `class: "hero"`.
- **Import path**: `npm run assets:build` (`tools/assets/build.mjs`) imports ONLY what `assets/src/hero.json` names: `static` from `assets/hero/<name>.glb` -> `assets/dist/` (unlit, base colour only, chroma cap 26, optional simplify, 1024 px KTX2 UASTC, Draco, collider none); `characters` from `assets/hero/rigged/<name>.glb` -> `assets/char/` (same but no flatten/Draco, skin and clips kept). A new asset fails the build once and prints its measured numbers: add the line. `HERO_DIR=` / `ASSETS_OUT=` (repo-relative) give a dry run. assets/hero and tools/gen belong to ART-GEN.
- **Warrior**: `src/loaders/character.ts` loads `assets/char/warrior_rigged.glb` whole (KTX2 via `assetLoader()`), paint material, layer 1, synthesises a `rest` clip from the bind pose. `src/entities/character-model.ts` `CHARACTER.poseOf`: idle, land -> rest; run, sprint -> stride (walk clip below 0.5 x run speed, else run clip at speed/runSpeed); jump, double_jump, wall_jump -> run@0.17; fall -> run@0.50; dash -> run@0.33; wall_slide -> walk@0.00; ledge_grab, ledge_climb -> walk@0.53; 0.1 s blend. Scaled to the capsule (1.9 u), half turn, feet at y 0. `player.ts` builds it when `prepareLevel` has preloaded it; the capsule stays the collider.
- **Torii**: `assets/src/hero.json` `skins.kit_torii`. A kit_torii placement keeps its own triangles as collider and is DRAWN as hero `torii` (9510 tris, no texture) fitted to kit_torii's bbox in `src/loaders/assets.ts` `skinFor`, flat accent material (`?accent=` works). No level file changed.
- **Dressing** (chapter 1, `dress-01.mjs` `HERO`): 4 lanterns, 3 boulders on rock masses, cliff + cliff_b stacks in the void.
- **Gate**: `tools/harness/post.ts`: the 17 D-018/D-019 checks judge the ink pass alone (paint off); `PAINT_GATE` adds 6 checks on the painted frame. Harness hooks `paintLayer(on?)`, `redraw()`. All six seen red.
- **Tools**: `tools/harness/frame.ts` (one frame, any size/pose, SwiftShader), `tools/art/sheet.mjs` (sheet + ramp shares), `tools/measure-display.mjs` (INK-HIRES: real GPU fps + frames). Evidence in `docs/build-log/d020/`.
- **Proofs**: `node tools/geometry-fingerprint.mjs levels/<l>.json assets/dist/manifest.json` hashes are 3f8ace62 / 03d7d47a / f656ed93 / 95c2a998 / eba0e40e (identical to before the work); nine kit glb shas unchanged; full local playtest PASS (~460 s); M4 Max 144.9 fps at 5120x1440, 4.39 ms a frame.

## 3. Unfinished or known wrong
- PR 31 not green (section 1). Hero work for the near rock (kit_rock_mass slabs) not done: needs collision-without-drawing (B-46).
- Two clips only; held frames are placeholders (B-45). Painted things get no ink edge; grain is per device pixel (B-48). Greybox levels have no backdrop or dressing (B-50). Pines unused (B-49). Hero files ~1 MB each (B-47). `replay`/`chaos` still draw every tick (B-44) and `chaos` is now the longest level stage.
- PROVISIONAL for Tim (OQ-070): chroma cap 26 mutes the warrior's orange gourds and straw hat (D-003); the torii is 1.28x wider for its height than delivered; kit_mid_cliff removed too.
- The Blender stand-in figure was stopped on Tim's order; its files are outside the repo (`$CLAUDE_JOB_DIR/tmp/standin-figure`), not shipped.

## 4. Gotchas (and read section 4 of state/HANDOFF-INK.md: all of it still holds)
- The shell guard rejects heredocs and any compound command containing the word `git`, even inside a grep pattern. Write scripts with the Write tool and run them; run each git command alone.
- GitHub runs no CI on a PR that conflicts with main (mergeStateStatus DIRTY): a push that "does nothing" means merge origin/main first.
- `npm run assets:build` replaces `assets/dist/` wholesale and rewrites `assets/char/`; after it, check the kit shas against the manifest and `git status`.
- A playtest is ~460 s for everything, ~90 s a level; `--level=X --only=post` ~15 s. One at a time (port 4317); `tools/measure-display.mjs` uses 4391 and opens a headed Chrome.
- A harness stage that switches a feature on itself cannot see that the game ships it off (found by mutation: the paint layer). Mutate, expect red.
- `gh run view --log` returns nothing while a run is in progress; job conclusions are available earlier.
- Compare paint against the ink frame at the SAME world tick (`redraw`), or moving hazards read as paint.
- Blender-free: hero assets need no Blender, the kit does (5.2.3 at /Applications/Blender.app).

## 5. Background shells
- None. The CI wait loop for run 42893283097 has finished; the stand-in figure agent was stopped; no playtest is in progress.
