# Claude review of fab01f0 (codex/rb-fixes)

**Reviewed SHA:** `fab01f0894d11332eadf21e3b573075d3e86932c` (parent `fd1e620`, implementation base `8055140`). The codex-rb-fixes worktree HEAD was re-checked at that SHA when this file was written.
**Mode:** read-only. The peer's branch was not edited, and nothing was pushed, merged or promoted.

**Verdict: CHANGES REQUIRED**

I had already reviewed exactly this SHA, so the result below is recorded from that review, not re-run. The full evidence is in `CLAUDE-VERIFY-RB003-RB004.md`, section "Addendum: read-only review of the fix commit `fab01f0`". The reproduction files are in `claude-rb003-rb004-evidence/`.

## Checks actually run (at fab01f0, or main where stated)

- I read the source diff `8055140..fab01f0` in full: `tools/visible-top.mjs`, `tools/lint-level.mjs`, `tools/harness/pitch-assist.ts` and the fixtures.
- **Linter:** `node tools/lint-level.mjs` was run on shipped chapter 2, and on chapter 2 plus a render-only rear beam and a collidable rear beam.
- **Independent cross-check:** `xcheck.mjs` (Rapier target rays plus three.js OBB math in Node, separate from the linter) at the fab01f0 pose convention, using rigCamera with an `advance(2)` warmup.
- **Rendered frames:** `shot.mjs` captured them, with and without the render-only beam (`lv-main-baseline.png`, `lv-main-render-only.png`).
- The legacy pre-D-015 cp[9] torii occlusion was checked in the real rig.

## Confirmed correct

- **`tools/visible-top.mjs`:** the occluded-interval subtraction is right. That covers the centre-plane section of boxes and triangles and the interval union.
- **Rotated primitives:** the camera-arm ray is tested exactly in each primitive's local frame. The world-axis box serves only as a broadphase.
- **Landing rise:** it uses the geometry top and the support height at the stand point. The fallback to the authored takeoff height over a gap is consistent.
- **`probedDepth`:** the 1e-4 margin is conservative, and the 2.55 float32 edge case now rejects.
- **Legacy cp[9] torii occlusion:** the rig confirms it. All target rays stop at about (33.89, 5.94).
- **D-016 severity:** preserved. I saw no severity downgrade in the diff.

## Findings

### 1. Render-only occluders escape both gates (blocking)

- **Where:** `tools/lint-level.mjs:140`. `obstaclesOf` drops `collider: "none"` geometry, and its result feeds `riseView` visibility at `:452` (and also `:276`, `:289`).
- **Real-camera check:** READABLE_CASE (`tools/harness/pitch-assist.ts:86`) measures with `H.castRay`, which only sees physics geometry. So it is blind to the same objects.
- Dropping these objects is right for the camera arm, which collides only with physics. It is wrong for what the player sees.

**Reproduction:**
1. Take shipped `02-cliff-seam` and add `{"asset":"prim_box","pos":[49.5,10.6,0],"scale":[1,0.4,7],"collider":"none"}`. The level is saved as `claude-rb003-rb004-evidence/lv-rear-beam-render-only.json`.
2. **Linter at fab01f0:** passes with 0 errors, no READABLE_RISE at cp[9], and a model band of 4.267°.
3. **Control:** the identical beam with a collider is rejected, band 0.000°.
4. **Real-camera band:** the centre-column physics band is 4.5° with and without the beam.
5. **Rendered frame:** the landing top is hidden (`lv-main-render-only.png` vs `lv-main-baseline.png`).

**Exposure:** PR #27 (`origin/ch1-assets`) adds 52 render-only placements to chapter 1.

**Why this blocks:** RB-003's claim, as recorded in the REVIEW-BOARD, says the readability gap is fixed. As committed, that is untrue for visible non-colliding geometry.

**Fix, either of:**
- **(a) Count render geometry:** pass a visibility obstacle list that includes `collider:none` geometry to `riseView`, and keep the arm list physics-only. Then give READABLE_CASE a render-geometry ray, such as a three.js raycast against the scene, alongside `castRay`.
- **(b) Narrow the claim:** state that the gate covers collidable geometry only, and add a lint rule that rejects render-only geometry crossing a landing's sightline.

### 2. The READABLE_RISE message misreports the rise and the cause (minor)

**Where:** `tools/lint-level.mjs:455` and `:470`.
- The message prints `rise=c[1]-a[1]`, the waypoint rise. The verdict uses the geometry rise from `riseView`, so the printed number can disagree with what was judged.
- When the free-arm rest band would read but an occluder hides the top, the message does not name the occluding `geometry[i]`.

### 3. The coverage checks are vacuous, with no guard band (minor)

**Where:** `tools/harness/pitch-assist.ts:173`/`:178` and `:237`/`:242`.
- `ran++` is incremented inside the loop over `views`, so `ran === views.length` always holds and the check cannot fail.
- READABLE_CASE compares verdicts at a resolution of 0.0833° per row against the 2° threshold, with no guard band. A rise that measures within one row of 2° can flip either way.

### 4. The docs don't state what READABLE_CASE covers (minor)

- It checks the verdict only, not the pitch. On the legacy cp[16] the model gives 21° and the real probe gives 24°.
- It measures at the snapped pose before the player settles, about 0.01 above the authored floor.
- Neither point appears in `RB003-RB004-FIX-RESULTS.md` or in the code comments.

**Pre-existing, noted only:** the player's own body is not modelled as an occluder by either gate.

## Bearing on the PR authorization

The authorization was conditional on a clean review, and this review is not clean. Finding 1 must be fixed, or its claim narrowed per (b), before codex/rb-fixes is pushed as closing RB-003. Findings 2–4 do not block on their own.
