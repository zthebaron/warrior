# HANDOFF-ART (written 2026-11-10 ~22:27Z by session art-pass-2, for a fresh session with zero memory)

## 1. Branch, PR, and exactly what is left
- Worktree `/Users/timdevallee/Code/warrior/.claude/worktrees/ch1-assets`, branch `art-pass-2` (off main; head 4f004a4 + this file). PR 31 (art pass 1) and PR 33 (art-gen round 2) are MERGED.
- **PR #34** `art-pass-2` -> main: OPEN, DRAFT. https://github.com/zthebaron/warrior/pull/34. Tim merges; he asked for ONE PR.
- Local state at 4f004a4: full playtest PASS before the last two fixes; after them chapter 1 `counters`, `post` 26/26 and `visual` (darwin) PASS; typecheck, lint:levels, lint:decisions, assets:budget PASS. Not re-run after them: the other four levels and the game stages (CI will).
- **Only thing red on CI: `level (01-lower-stair)` on `visual`** (so `playtest` too). The committed Linux goldens for chapter 1 are run 42911617289's actuals, taken BEFORE two layout fixes (bay taper, the open cleft), so some cameras now differ.
- **Which run holds the actuals:** the newest COMPLETED run on art-pass-2 (`gh run list --branch art-pass-2 --limit 3 --json databaseId,status,conclusion,headSha`). Pushing this file starts one more run; its frames are the same as 4f004a4's. Check first that every stage but `visual` passed (`gh run view <run> --log-failed`, grep `│ [a-z-]+ +(PASS|FAIL)`).
- **Pull and commit** (each git command alone):
  `gh run download <run> -n harness-report-01-lower-stair -D $CLAUDE_JOB_DIR/tmp/ci34b/01-lower-stair`
  copy each `.../tools/harness/golden/linux/01-lower-stair/camN.actual.png` that exists over `tools/harness/golden/linux/01-lower-stair/camN.png` (CI writes an actual only for a camera over 0.5%); compare all six to `golden/darwin/01-lower-stair/camN.png` with pixelmatch threshold 0.1 (expect <= 0.02%; a camera NOT taken that is over 0.1% is a stale golden: record it in OQ-071). The script `$CLAUDE_JOB_DIR/tmp/take-linux.mjs <root> <ci dir>` does copy + compare if the job tmp survives.
  `git add tools/harness/golden/linux` / `git commit -m "D-021: linux goldens, chapter 1, from CI run <id> actuals"` / `git push origin HEAD:refs/heads/art-pass-2` / wait for 9/9.
- **Then:** `gh pr edit 34 --body-file $CLAUDE_JOB_DIR/tmp/ap2/pr-body.md` (drafted; if gone rebuild from D-021 and OQ-071) after adding: the independent review (7 findings, all fixed), the far-field check at 8.4% with the wall lifted away, the open cleft, the green run id, the CI bare-URL load (1.8 s). Then `gh pr ready 34`.
- **Release the claims** ART-PASS-2, B-45, B-46, B-49 (agent `art-pass-2`) from a detached origin/main, ONE ledger-only commit: a worktree for that exists at `$CLAUDE_JOB_DIR/tmp/claim-wt` (`git fetch origin`; `git switch --detach origin/main`; `node tools/claim.mjs release <id> --agent art-pass-2` x4; `git add state/CLAIMS.jsonl`; commit; `git log --oneline origin/main..HEAD` must be exactly 1; `git push origin HEAD:main`). Then `git worktree remove` it.
- Report to Tim: the screenshot is `docs/build-log/d021/ch1-player-5120x1440.png` (5120x1440, player's camera at spawn, real GPU, final build). `git diff --stat origin/main...HEAD -- src/engine/ink-post.ts src/engine/renderer.ts` is EMPTY.

## 2. What art pass 2 built (D-021 in PHASE-0-DECISIONS; OQ-071; MEASUREMENTS "D-021 ..." sections)
- **Rock undrawn:** `src/loaders/level.ts` `INK.collideOnly: ['kit_rock_mass']`. In an ink level (chapter 1) the rock goes to physics by the same untouched code and its draw loop is skipped; it keeps a hidden mesh named `undrawn:kit_rock_mass` for the harness. The three boulders are gone from `tools/levelgen/dress-01.mjs`.
- **Painted cliff wall:** `src/loaders/cliff-wall.ts` `CLIFF_WALL`, built from the rock placements (`RockMass`: x, base, top, frontZ, minX, maxX). All cards are flat, parallel to the path, FRONT faces only, blended, no depth write. Three rows:
  front: 3 small cards a mass at -2.9/0/+2.9 u, 6.5-8 wide, 13-21 tall, 0.2 u behind the collision front (z -3.78), cycle of 7; never past a mass's own extent on a side with no neighbour (the wall's ends, and the gap at x 36-40.5, which stays an open cleft);
  bay: one per join, 5 u further back, 20-40 tall, none where masses are > 10 u apart;
  back: every second mass, 11-14 u back, 46-64 tall. Ink 1 / 0.88 / 0.72. Ends taper.
  Pines (pine_a/b/c) on every second mass from the second, rooted on a ledge of its tallest front card (`CLIFF_WALL.ledge`). One mesh per painting per row = 12 draw calls; draw order back 100, bay 200, front 300, pine 400.
- **Nothing painted hides the player:** `src/engine/paint-layer.ts` `paintLast` (the figure is drawn after every card; used in `src/loaders/character.ts`).
- **Cards:** `tools/art/backdrop-cards.mjs` makes `assets/backdrop/cards/*.png` from ART-GEN's `assets/backdrop/gen` (read only): resize, clamp to paper value and ramp chroma 30, bleed colour under the cut, fade cliff feet, plus the generated `path_wash`. Cliffs ship at 2048 px. `budgets.json` `cards`; `tools/assets/paint-budget.mjs` re-runs the script and compares pixels. `--check` exists.
- **Far field:** `src/loaders/backdrop.ts` `BACKDROP`: one seed ridge ring (460 u), six painted peaks at 0.6 height with feet at y -3.5, six painted mid cliffs (feet y -4), the paper mist sheets, three thin mist bands on the void side drawn after the sheets. The seed-crop mid cliffs are deleted.
- **Animated warrior:** `assets/char/warrior_anim.glb` (from `assets/hero/rigged/`, via `assets/src/hero.json` + `npm run assets:build`). `src/entities/character-model.ts` `CHARACTER.poseOf`: idle -> idle loop; run/sprint -> walk below half run speed else run; jump, wall_jump -> run HELD at 0.106 s; double_jump -> run held at 0.422 s; fall -> land held at 0 s; land -> land once; dash -> dash loop; wall_slide, ledge_grab -> climb held at 0 s; ledge_climb -> climb once. **Rejected clips: jump, fall, wall** (head and rigid hat pitch over in every frame). Cross-fade: per-clip weights eased over 0.1 s and normalised, driven only by the player's state clock (idempotent under `redraw()`).
- **Brushed path:** `src/loaders/path-wash.ts`: one paint-layer mesh over every unturned prim_box top, world-space UVs, repeat 24 x 6 u, polygonOffset.
- **Gate:** `tools/harness/post.ts`. `POST_GATE` untouched; the 17 ink-only checks run with the undrawn rock SHOWN. New paint checks: rock undrawn as shipped (13 kept hidden, 0 drawn); dark mass where the rock stands 8.6% (>= 4%, 0.1% with the wall lifted); rock pixels drawn over 99.9% (>= 90%, pooled); far field 8.4% with the wall lifted (>= 3%); void paper 47.4% with the rock drawn in place of the wall (>= 41%; mutation mist-pale 15.1%).
- **Tools:** `node tools/harness/motion.ts <dir> [--only=..] [--clips]` (strips of the figure in motion); harness hooks `showMeshes(prefix, visible)`, `showFigure(clip, time)`, `figureClips()`.
- **Numbers:** scene ratchet 127 draw calls / 287,036 triangles; 144.9 fps at 5120x1440, 2.81 ms a frame (M4 Max); cards 8.3 MB.

## 3. Unfinished or known wrong (all in OQ-071, PROVISIONAL for Tim)
- PR 34 not green yet (section 1). The other four levels and game stages were not re-run locally after the last two fixes.
- From the player's camera the wall is still a wall seen along its length (B-52): the rock is a straight wall at the path's edge, so cards cannot turn toward the camera without a level change. I would fix this next.
- The rock's ledges are climbable and not painted as ledges; at the joins (x ~10, 48, 66, 74) a player can step off the path edge through the painting and fall, visibly (B-51).
- The two 3D cliff stacks in the void are now the most game-like things in the frame (B-53); untouched, not in the four jobs.
- Three mist bands stand against D-020's "the mist must be bare paper" (OQ-071 item 6). Style Bible strains recorded, not amended (item 11).
- The coverage check is pooled, not per collider (item 15). The far-field check's wrong value (0%) is D-020's, not re-measured.
- Bay and front cards can share a painting at one mass (a critic's finding, not fixed). No soft-landing pose. Walk and wall were judged frame by frame only, not in motion.
- Cliffs are 6.5 MB of PNG (B-47). `boulder` is still built, unplaced. PR 31's seven stale Linux goldens on other levels remain.

## 4. Gotchas (and read section 4 of state/HANDOFF-INK.md: all of it still holds)
- The shell guard rejects ANY compound command containing `git` (`&&`, pipes, heredocs): a refused command runs NOTHING, including the non-git parts before it. Run each git command alone; put edits in a script file and run it.
- A `cd` into a subfolder persists: always `cd` to the worktree root first. The Write tool refuses a file changed on disk since it was read.
- Wash cards write no depth: the mist sheets paper over anything drawn before them, so near cards draw after (order >= 100) and far cards stand with their feet just under the mist top (y -3).
- A card level with a torii post (z -3.6) bleeds 1 px into it (accent and hue checks red); a card behind a sliding stone's face (z -4.0) shows the stone. Hence `frontBehind: 0.2`.
- `tools/measure-display.mjs` takes space-separated args and overwrites `<label>.json` with only the views it ran; it opens a headed Chrome. Keep only `ch1-player-5120x1440.png` (rename from `art-pass-2-5120x1440-rig.png`).
- A stage that toggles meshes or the paint layer must restore them. Never `--record`; `--update-goldens` only. One playtest/frame/motion run at a time; never edit `src/` during one.
- `npm run assets:build` needs Blender and ktx and rewrites `assets/char/`; check the kit shas after.

## 5. Background shells
- One read-only wait loop (id bc8k87opl) polling the CI run for 4f004a4; safe to kill. No playtest, workflow or other process is running.
