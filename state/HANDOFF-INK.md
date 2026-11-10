# HANDOFF-INK (written 2026-11-10 ~17:45Z by session ink-refine, for a fresh session with zero memory)

## 1. Branches and PRs
- Worktree: `/Users/timdevallee/Code/warrior/.claude/worktrees/ch1-assets`, local branch `ink-refine` (HEAD 5f93f22 + this file).
- PR #27 `ch1-assets` -> main (head 164c9fb): OPEN, ready, was green. Tim's. DO NOT touch or push to it.
- PR #29 `ink-refine` -> base `ch1-assets` (stacked on #27): OPEN, NOT green yet. GitHub retargets it to main when #27 merges.
- Claim `INK-REFINE` (agent `ink-refine`) taken ~16:50Z, 90 min TTL, lives on main's `state/CLAIMS.jsonl`. Release when #29 is green.
- Claim take/release ONLY from a detached origin/main: `git fetch origin; git switch --detach origin/main; node tools/claim.mjs take|release INK-REFINE --agent ink-refine; git add state/CLAIMS.jsonl; git commit -m "claim: ..."; git log --oneline origin/main..HEAD` (must be exactly 1); `git push origin HEAD:main; git switch ink-refine`.

## 2. What remains to make PR 29 green
Only the Linux goldens: all 5 levels changed look, so `visual` fails on Linux until they are committed. Everything else passes (post 17/17 on Linux for 00, 01, 04).
- CI run **42861208215** holds the Linux actuals. First attempt: 00-gym, 01-lower-stair, 04-summit-ridge failed on visual only; 02-cliff-seam and 03-drifting-stones were CANCELLED by the runner. I ran `gh run rerun 42861208215 --failed`; check it finished.
- Already downloaded (job tmp, may be gone): 00/01/04, matching darwin within 0.010%.
- Commands (run each `git` as its own plain command; see gotchas):
  `for l in 00-gym 01-lower-stair 02-cliff-seam 03-drifting-stones 04-summit-ridge; do gh run download 42861208215 -n harness-report-$l -D /tmp/ci29/$l; done`
  `for l in <same 5>; do for k in 0 1 2 3 4 5; do cp /tmp/ci29/$l/tools/harness/golden/linux/$l/cam$k.actual.png tools/harness/golden/linux/$l/cam$k.png; done; done`
  Compare each to `tools/harness/golden/darwin/<level>/camN.png` with pixelmatch threshold 0.1 (expect <0.02%), then
  `git add tools/harness/golden/linux` / `git commit -m "D-019: linux goldens, all five levels, from CI run 42861208215 actuals"` / `git push origin HEAD:refs/heads/ink-refine`
- Wait for the new run: 9 jobs (static, matrix, game, 5x level, playtest) all success. If a level job is cancelled again, `gh run rerun <id> --failed`.
- Then update the PR body with the run id, release the claim.

## 3. Design
**D-018 (in PR #27):** zero lights, zero lit materials; every fill an unlit MeshBasicMaterial of a named ramp step (`src/engine/palette.ts`, reads `reference/palette.json`). One post pass, `src/engine/ink-post.ts`, three named passes in `SECTION6_PASSES`: `value_compression`, `ink_edge`, `paper_grain`. Constants: `INK_POST` in that file; basis in `00-start-here/MEASUREMENTS.md` "D-018 post constants" / "D-019 post constants". Gate: harness stage `post` (`tools/harness/post.ts`, constants `POST_GATE`), judged from pixels + per-pixel depth readback (`__HARNESS__.postProbe`).
**D-019 (PR #29):** Tim: "outlining everything is outlining nothing" (gap ONE) and "no value range" (gap TWO).
- Silhouette test (`silhouetteWithin` in ink-post.ts): a line only where TWO SURFACES DO NOT MEET. Along 8 whole-pixel directions, each side of a pixel boundary is continued from its own two depth samples (1/z is linear across a plane); line iff both continuations stay `silhouetteGap` 2% apart. Plane at any grazing angle = 0, crease = opposite signs, step-down = gap. Near band (<25u) only.
- Stroke weight = base(distance 3/2/1 px) x world-anchored value noise; 0 = a break, max 4px. Never breaks where both forms are shown at the SAME ramp step.
- Near push (`mapStep`): steps 2-7 go +3/+2/+1 darker inside 12/20/24.9u, boundaries pulled inward by 3 noise octaves; paper and mist never pushed. Mid/far only lighten (D-018).
- Undressed prim_box (`src/loaders/level.ts` `LEVEL_VISUAL`, `walkGeo`): mist top, stone-mid faces; tagged pads and moving platforms paper top. ch1 is dressed (`palette: "ink"`): boxes not drawn.
- Records: D-019 in `00-start-here/PHASE-0-DECISIONS.md`; OQ-068 (provisional calls + known limits); B-40..B-43 in `state/BACKLOG.md`; STYLE-BIBLE §1/§3/§6 amended in place.
- Sheet re-take: `docs/build-log/d019/sheet-ch1-cam2.png` = 3-up [seed `reference/seed/hero/hero_7s.png` box-downscaled 3x to 640x360 | before | after], after = `tools/harness/golden/darwin/01-lower-stair/cam2.png`. My script was in job tmp (`sheet.mjs`, pngjs): rewrite it (30 lines) if gone. Value histogram vs the ramp: nearest-step share of non-accent px (chroma > 51 = accent).

## 4. Gotchas that cost time
- The shell guard rejects compound commands containing `git` (pipes, `&&` chains with redirects, heredocs with git): run git commands alone. Put python/node edit scripts in a file and run that.
- NEVER `git push origin HEAD:main` from the work branch: it lands the work. Detach at origin/main first (see 1).
- Only ONE playtest at a time (preview port 4317). A full `npm run playtest` takes ~12 min; `-- --level=X --only=post` ~45 s. Never edit `src/` while one runs (stale-bundle preflight).
- `--update-goldens` only. NEVER `--record` (traces must not be re-recorded: replay against them is the collision proof).
- Depth texture is sampled NEAREST: fractional sample offsets (0.7071 diagonals, non-integer `uPx`) manufacture false silhouettes on receding planes.
- `Math.max(...bigArray)` overflows the stack in harness code. LFS: goldens are LFS; `git archive` gives real PNGs.
- A rebase rewrites shas: `implemented_by:` in PHASE-0-DECISIONS must name commits on HEAD's history or `lint:decisions` fails UNKNOWN_COMMIT (D-019 cites 6474469 and c917b0f; re-check after any rebase).
- three r187 ShaderMaterial with `glslVersion: GLSL3`: write `in/out`, `texture()`, an explicit `out vec4`.
- Mutation proofs: mutate the shader source, run `--level=01-lower-stair --only=post`, restore, byte-compare. Results in MEASUREMENTS "D-019 ink edge and value range".

## 5. Queued next task (Tim, verbatim), start once PR 29 CI is green
"Queued next task, start it once PR 29 CI is green. I looked at the D-019 sheet: gaps ONE and TWO landed, the CAD outlines are gone and the near rock now reads as wash. What still makes it read as 3D boxes is gaps FOUR and THREE, so do those next on a new branch stacked on ink-refine, one PR. FOUR, the silhouettes: in the seed the cliff is one irregular gestural mass with a broken, uneven contour; ours is stacked rectangular slabs with striations. Rebuild kit_rock_mass, kit_mid_cliff and kit_ledge in their Blender sources so the outer contour is irregular and asymmetric and the slab banding is gone (this is B-37 and B-38). Dressing only: colliders and walkable tops stay byte-identical, and if a triangle or byte budget has to rise, raise it at the measured value and record it. THREE, the empty paper: the cloud band, the far field and the ground beyond the path should resolve to bare paper, not grey shapes; the grey diagonal bands on the right of cam2 are the thing to remove. Compare against reference/seed by eye at every step, stop short of perfect, backlog what is left, and re-take sheet-ch1-cam2 against the same seed frame."
My note, not Tim's: `kit_rock_mass` IS a trimesh collider on every level (its own triangles). To change its look with colliders byte-identical, keep the existing mesh as invisible collision and add a new `collider: none` visual asset over it (the ch1 dressing pattern: `tools/levelgen/dress-01.mjs`, lint rule DRESS_COLLIDES, proof `tools/geometry-fingerprint.mjs`). kit_mid_cliff and kit_ledge are already collider none. B-42 is gap THREE.

## 6. Background shells
- One wait loop (`until gh run view 42861208215 ... completed`) polling the CI rerun. Read-only, safe to kill. Nothing else is running; no playtest in progress.
