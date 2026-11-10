# RB-003/RB-004 fixes and four-chapter playthrough

Date: 2026-11-09, America/Los_Angeles. Owner: Codex. Branch: `codex/rb-fixes`.
Base: `8055140` (origin/main when work began). Claim commit: `fd1e620`.
Tim authorized independent verification, confirmed fixes, and a complete four-chapter playthrough.

## Verification accepted

Reviewed Claude's completed independent report in the sibling worktree:
`../claude-rbverify/state/CLAUDE-VERIFY-RB003-RB004.md` (ad1eef8 reproduction and b8dfd5f main checks).
Claude reproduced the primary constructions with separately written target rays and oriented-box
math, tested mutation controls, and found the sunk-waypoint case. Its corrections are adopted:

- Occlusion is a future-content validation defect, not an existing shipped chapter-2 blocker.
- Rotated primitives caused safe-direction false rejections.
- Exact 2.55 depth was optimistic; the existing assist guard catches it.
- The 4.48/4.62/4.67 ideal feet-relative ceilings are valid. The roughly 0.01 floor/feet offset
  requires a qualification, not a budget change.

Coordination: `warrior-b2` received explicit ownership messages assigning Codex implementation and
final playthrough, with Claude verification/reporting only. An independent review of the resulting
implementation was also requested. No concurrent source implementation was imported.

## Changes

- READABLE_RISE subtracts occluded angular intervals from the visible landing-top band. It uses
  exact centre-plane intersections with triangles/box faces, without a new sampling budget.
- Camera arm rays intersect rotated primitives in their local frame; their enclosing world-axis
  boxes are broadphase only.
- Landing rise uses the geometry top and the support height at the prescribed stand point. Where
  that point is over a gap, the authored takeoff elevation remains the pose convention.
- The model credits only depth samples strictly inside the landing by a recorded 1e-4 u margin.
  Runtime camera sampling and movement are unchanged. The tested usable prescription is 2.56 u.
- READABLE_CASE runs both verdict directions for every measured chapter rise, including faces
  requiring no assist. It warms collision queries and snaps the actual rig at the prescribed
  pose without advancing/falling. Existing settled ASSIST_CASE checks remain in place.
- The angular ray count is converted directly to degrees (`hits * fov / rows`), avoiding a
  radians round-trip that incorrectly represented exactly 2 degrees as 1.9999999999999996.
- Fifteen fixtures pin front/rear occlusion, lifted-beam control, rotated-box clear/blocked
  controls, honest/sunk/floating waypoint heights, depth edge/interior, and historical occlusion.
  The old pre-D-015 fixture's first face is in fact hidden by a torii; the new real-rig test proves
  this, and the old purely angular acceptance assertion was corrected.

No shipped level, move limit, scene budget, asset, or visual golden was changed.

## Results

- All 11 static CI checks pass: typecheck, lint:levels, lint:self, check:patrol, check:progression,
  lint:not-list, lint:pack, lint:decisions, lint:accent, assets:budget, check:merge-reports.
- Real-camera stage: **109/109 checks pass**, including all **20 shipped rises** and 15 regression
  fixtures. Seventeen of those shipped rises were outside the previous assist-only coverage.
- Independent geometry cross-check: 64 deterministic oblique/rotated/overlapping-box scenes
  compared with a separately implemented Three.js ray sampler. All pass its resolution bound;
  worst angular difference 0.000133375 degrees.
- Before/after proof runs the new fixtures against the original linter and original probe-depth
  function from HEAD before implementation. Seven verdicts differ from the expected real-rig
  outcome before the fix; all fifteen match afterward. `before-after.json` preserves each result.

### Complete automated playthrough

Command: `npm run playtest -- --only=reachable,pitch-assist,run-metric,ambient-motion`.
Fresh production and harness builds; source/level freshness checks pass.
The production bare URL opens chapter 1. The harness bot then follows the normal results/Enter
progression through every chapter, without selecting chapters via URL.

| Chapter | Result | Simulated traversal time |
|---|---|---:|
| 01-lower-stair | reached results; Enter advances to chapter 2 | 15.35 s |
| 02-cliff-seam | reached results; Enter advances to chapter 3 | 27.30 s |
| 03-drifting-stones | reached results; Enter advances to chapter 4 | 29.32 s |
| 04-summit-ridge | reached results; Enter returns to menu | 24.15 s |

Reachable 13/13, pitch-assist 109/109, run-metric 15/15, ambient-motion 11/11; zero console errors.
These are bot completion times, not measured first-time human play times.

### Per-level behavioral and visual checks

Command: `npm run playtest -- --only=nav,phase-sweep,replay,chaos,counters,hazards,assets,accent,visual`.
**RESULT: PASS for every stage on all five levels (gym plus chapters 1–4).**
The merged coverage check reports PASS with no missing per-level or once-per-run stages.
Nav, phase-sweep, replay, chaos, hazards, counters, assets, accent, and all visual comparisons pass.

After final comment/documentation cleanup, a fresh camera run again passed 109/109. The rebuilt
production and harness executable JavaScript is byte-identical (SHA-256) to the bundles used for
the complete progression and per-level runs. Final source/level freshness preflight passes.

## Evidence and limits

Machine: Node v26.9.0, Chromium 158.0.8127.18, ANGLE Vulkan SwiftShader, macOS.
`state/rb-fixes-validation/` contains static logs/results, before/after verdicts, independent
visibility cross-check script/results, game report and progression log, and final level report.

The camera predicate is geometric, scoped to its existing centreline/pose convention. It does not
prove subjective colour contrast or first-time-player comprehension. Gap-pose snapshots prove
visibility at the prescribed pose; actual traversal is separately covered by nav and progression.
No remote CI run, push, merge, deployment, or re-baselining is claimed.

## Independent review follow-up

Claude reviewed fab01f0 and returned CHANGES REQUIRED: visible collider:none
placements escaped the physics-only occlusion checks. The review is preserved
in `state/CLAUDE-REVIEW-fab01f0.md`. Publication was held.

The correction separates visibility geometry (all authored placements) from
physics arm obstacles. The harness now raycasts actual visible level meshes,
including render-only decoration, instead of physics colliders. Two additional
fixtures pin the render-only rear beam and its raised control (17 total).
Diagnostics report the measured geometry rise and contributing occluder indices.
Coverage compares evaluated indices against independently enumerated authored
rises, so a missing model result cannot silently disappear from the guard.

READABLE_CASE checks the verdict, not pitch equality. For example, legacy cp[16]
can read at real pitch 24 degrees while the model predicts 21. ASSIST_CASE
separately checks pitch on assist-dependent standing cases. Exact poses are
snapped at support height before settling; settled feet normally sit roughly
0.01 above the authored floor. The refined sample protocol and its limitations
are recorded in MEASUREMENTS.md. No threshold was relaxed.

Validation at correction commit 9ef428a: all 11 static CI checks PASS; camera
115/115, reachable 13/13, run-metric 15/15, ambient-motion 11/11. All four
chapters completed through normal progression again with the same simulated
traversal times above. Every per-level stage passed for the gym and chapters
1–4, including unchanged visual goldens. The combined coverage check reports
PASS with no missing stages. Fresh evidence: `review-game-report.json`,
`review-levels-report.json`, and `review-coverage.json` in the validation folder.
