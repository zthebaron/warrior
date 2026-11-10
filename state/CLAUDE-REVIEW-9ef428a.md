# Claude review of 9ef428a (codex/rb-fixes)

**Reviewed SHA:** `9ef428a9d85f89739ce7acd628556ce617ae22d9`, the source fix. It follows my CHANGES REQUIRED review of `fab01f0` (`CLAUDE-REVIEW-fab01f0.md`).
- The later branch head `42d9a9f` changes no source: `git diff --stat 9ef428a 42d9a9f -- src tools levels vite.config.ts` is empty. Its reports and docs were not reviewed.
- **Mode:** read-only for the peer's branch. Independent checks ran in my own detached worktree (`claude-rbverify-main` at 9ef428a, fresh build). Nothing was pushed, merged or promoted.
- **Stray file:** during the PR #27 lint run, I briefly copied one temp file into the peer's worktree (`tools/.lint-fab-tmp.mjs`) and deleted it straight away. It was never staged or committed. The untracked `state/rb-fixes-validation/review-game-report.json` there is the peer's output, not mine.

## Verdict: CLEAN

The blocker from `fab01f0` is fixed, and I verified the fix independently. The three smaller `fab01f0` items are fixed too. The non-blocking advisories below do not gate the push or the PR.

## Checks actually run

1. **Diff read in full,** `fab01f0..9ef428a`:
   - `src/main.ts` (castRenderRay), `tools/lint-level.mjs` and `tools/visible-top.mjs`;
   - `tools/harness/pitch-assist.ts` and `tools/fixtures/readability.mjs`;
   - the MEASUREMENTS, OPEN-QUESTIONS and FIX-RESULTS additions.
2. **My own build, full stage:** `npm run playtest -- --only=pitch-assist` at 9ef428a in my worktree gave **RESULT: PASS**. Relevant lines:
   - render-only-rear-beam: model 0.000°, rig 0.000°, rejected (it was 4.267° in the model and 4.5° by physics at fab01f0);
   - render-only-lifted-beam (control): model 4.267°, rig 3.833°, reads;
   - all 20 shipped rises: rig and model agree.
3. **Static checks:** typecheck, `lint:levels` (all four chapters pass) and `lint:self` (pass).
4. **Protected files:** no changes to levels, budgets, schema or decisions.
5. **Public repo:** no absolute or home paths added anywhere in `8055140..9ef428a`.
6. **Adversarial render-only occluders** on chapter 2 cp[9], none of them in the peer's fixtures. The linter is the CLI. The rig is my own probe, which casts `castRay` and `castRenderRay` row by row at the exact READABLE_CASE pose.

| Variant | Linter | Physics band | Render band |
|---|---|---:|---:|
| render-only front beam `[55,10.35,0]` | rejects, `Sightline occluders: geometry[37]` | 4.25 | 0.000 |
| render-only rotated box `[54,10.4,0]` rot z 30 | rejects, names geometry[37] | 4.25 | 0.000 |
| **render-only kit mesh** (`kit_rock_mass`, scale `[0.06,0.06,1.7]`, `[55,10,0]`) | rejects, names geometry[37] | **4.25** | **0.000** |
| same kit mesh with a trimesh collider | rejects | 0 | 0 |
| render-only thin slab above the sightline `[49.5,11.6,0]` | passes | 4.25 | 3.833 (unchanged) |
| render-only torii at x=57, centreline between posts | passes | 4.25 | 3.833 (unchanged) |

The kit-mesh row covers the class PR #27 adds (kit meshes, `collider:none`). Physics alone would have let it through. Both new gates reject it.

7. **PR #27 levels with the new linter:** the levels and manifest from `origin/ch1-assets` were linted with this commit's linter. All four chapters, including chapter 1 with its 52 render-only placements, give LINT PASS.
8. **Coverage check:** `expected` now comes from the authored `critical_path` moves, independently of `riseViews`. A dropped rise now fails the check instead of passing.
9. **Messages:** they now print `v.rise` (the geometry rise) and list the sightline occluders.

## What I confirmed correct

- **Arm vs visibility:** the camera arm still uses physics-only obstacles, matching `camera.ts`. Visibility uses every authored placement, including `collider:none`.
- **castRenderRay:**
  - it raycasts the visible meshes under `level.root` and skips invisible or zero-opacity materials;
  - it applies the normal matrix;
  - the player and the landing mark are outside `level.root`, so they are excluded;
  - the loader has no InstancedMesh, so the per-instance-matrix concern doesn't apply.
- **Sampling:**
  - Uncertainty is runs × fov/rows. That is right: each sampled interval has two endpoints, each off by up to half a row.
  - Refinement triggers only when the band is within that uncertainty of 2°. A result still ambiguous after refining returns `null`, which can't equal a boolean verdict, so it fails.
  - The 10× / 7200 figure is recorded in MEASUREMENTS.
  - I reviewed the refinement path by reading only. No shipped face is within one row of 2°, so neither my run nor CI exercises it.

## Non-blocking advisories (do not gate push/PR)

1. **The linter's model is more optimistic than the rendered frame on some meshes.**
   - For collidable meshes the linter uses collider triangles, but the rig now sees render meshes. The shipped torii render mesh has a plinth at about y+0.06 that its collider lacks.
   - My row-by-row probe found render hits at (63.4, 10.06) where physics reaches the landing top.
   - The result is that the model exceeds the rig by 0.43° (02 cp[9]: 4.267 vs 3.833), 0.85° (02 cp[15]) and 0.86° (04 cp[16]).
   - READABLE_CASE's verdict comparison catches this loudly, and every shipped face has margin. The docs should say that `lint:levels` alone can be optimistic by that much.
2. **The guard band applies only to READABLE_CASE.** `readableVerdict` is used at `tools/harness/pitch-assist.ts:193` and `:219`. ASSIST_CASE (`:120`), the B-18 face checks (`:154`) and the B-23 proof (`:263`) still compare the raw `band >= min`. The smallest shipped assisted margin is 0.42°, against 0.083° per row, so nothing is exposed today.
3. **No fixture forces the ambiguous path.** Neither refinement nor the ambiguous-fail branch is exercised. A fixture tuned to about 2° would pin it.
4. **Carried from before:** the player's own body is still not modelled as an occluder.
