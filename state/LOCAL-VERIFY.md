# Local verification log

GitHub Actions has been down repo-wide since 2026-11-09 06:16 UTC: every run fails with zero steps
executed, on every branch, main included. That is exhausted Actions minutes on a private repo, not a
code failure. Until CI is back, a PR is verified by running the suite locally, and the result is
recorded here so it outlives the session that ran it. **No entry here is a CI result.** When CI
returns, the PR still needs a green run before it counts as verified by CI.

Each entry gives the exact commit, the commands, the environment, and the real output.

---

## PR #16 — Chapter 4: `04-summit-ridge` (dashjump, Q5) — LOCAL PASS

- verified: 2026-11-09 00:14 PST by phase0-spec
- commit: `00ac2faa2def0b77184d00ed1a6aad38d6654e38` (PR head, branch `chapter-4`), in a clean detached
  worktree with LFS goldens pulled (`.claude/worktrees/verify-pr16`)
- vs main: since the merge-base, main has changed only `state/CLAIMS.jsonl` (+12 lines; B-23 went in and
  was reverted, so it nets to zero). The verified tree is therefore the code that would land.
- not covered: chapter 3 (`03-drifting-stones`, PR #17) is not on this branch. Whichever of #16 and #17
  merges second needs this run repeated on the merged tree (union rule for state/ and the progression
  chain).
- environment: darwin (macOS arm64), chromium 158.0.8127.18 headless, ANGLE SwiftShader (Vulkan 1.3.0),
  the harness's pinned args. Machine heavily loaded (B-20 measurement runs alongside); bot times are in
  fixed 60 Hz ticks and do not depend on load.

| command | exit | result |
|---|---|---|
| `npm run lint:self` | 0 | `LINT-SELF PASS` |
| `npm run lint:levels` | 0 | `LINT PASS` 00-gym (1 warning: `[TIGHT] seg 14->15 via jump is at 100% of the limit`, accepted D-016/OQ-051), 01-lower-stair, 02-cliff-seam, 04-summit-ridge |
| `npm run playtest` | 0 | `RESULT: PASS` — levels 00, 01, 02, 04. Per level: schema, lint-level, preflight, nav, phase-sweep, replay, chaos, hazards, counters, assets, accent, visual all PASS (4/4 each); run-once stages reachable 11/11, pitch-assist, run-metric, ambient-motion PASS |

### 04-summit-ridge — stage results

    schema 2/2 · lint-level 1/1 (clean) · preflight 7/7 · nav 6/6 · phase-sweep 14/14 · replay 5/5
    chaos 7/7 · hazards 7/7 · counters 8/8 · assets 13/13 · accent 6/6 · visual 7/7
    nav:      goal reached, results at 24.17s; within 12s x 5 segments: 24.17s / 60s; 23/23 waypoints in
              order; every declared move completed: ground 13/13, jump 3/3, double 2/2, dashjump 3/3, dash 1/1
    replay:   1450 vs 1450 ticks (0.00%), final position 0.000u off
    counters: draw calls peak 49 (scene ratchet 49), triangles 5040 (ratchet 5040)
    visual:   cam0-cam5 drift 0.000% against the darwin goldens
    reachable: 01-lower-stair > 02-cliff-seam > 04-summit-ridge; bot finishes 04 at 24.17s; Enter at its
              results returns to the menu

### 04-summit-ridge — per-segment bot time against the Q3 budget (12 s)

A Q3 segment runs from respawn point to respawn point: spawn, the four torii T1-T4 (x = 34, 52, 80, 104),
then the goal (x = 140.5). `nav` asserts only the total (12 s x segments). The per-segment times below
are differences of nav's cumulative waypoint clock at the T-waypoints, which sit about 1 u past each
torii (activation radius 2 u). Treat them as accurate to a few tenths of a second. `phase-sweep` asserts
the per-segment budget directly: respawn there, at each of 8 offsets of the 4.00 s loop, and time the run
to the next respawn point, counting the wait for the crow.

| seg | from -> to | nav bot (cumulative t at T-waypoint) | nav bot, this segment | phase-sweep, 8 arrival phases (s) | sweep worst | budget | margin (worst) |
|---|---|---|---|---|---|---|---|
| 0 | spawn -> T1 | 5.07 | **5.07** | 4.9 x 8 | 4.93 | 12 | 7.07 |
| 1 | T1 -> T2 | 7.33 | **2.26** | 2.0 x 8 | 2.00 | 12 | 9.74 |
| 2 | T2 -> T3 (crow + sweep, dash gap) | 12.17 | **4.84** | 3.9 7.4 6.9 6.4 5.9 5.4 4.9 4.4 | 7.43 | 12 | 4.57 |
| 3 | T3 -> T4 (crow + swept ledge, shelf) | 19.32 | **7.15** | 3.1 6.6 6.1 5.6 5.1 4.6 4.1 3.6 | 6.60 | 12 | 4.85 |
| 4 | T4 -> goal | 24.17 | **4.85** | 4.8 x 8 | 4.75 | 12 | 7.25 |

Every segment is inside 12 s on both measures. The tightest is seg 2 at 7.43 s worst-phase. HAZARD_INERT
holds on both crow segments: blind departures fail 4/8 phases (seg 2 offsets 0,3,4,7; seg 3 offsets
2,3,6,7) and reading the crow clears 8/8. Nav's seg 3 (7.15 s) exceeds the sweep's worst (6.60 s)
because the nav run reaches T3 at a different loop phase than any of the sweep's eight respawn offsets,
and it includes the approx. 1 u waypoint offset.

Other levels on this run, for context (nav total / budget): 00-gym 27.85 / 36 s, 01-lower-stair
19.35 / 48 s, 02-cliff-seam 27.30 / 60 s; phase-sweep worst arrival per segment 01: 5.68, 2.97, 6.85,
6.77; 02: 4.87, 2.78, 2.35, 8.85, 10.73 (02 seg 4 is the tightest anywhere, 1.27 s of margin).

---

## PR #17 — chapter 3 (`03-drifting-stones`), head `ef075b1`
verified: 2026-11-09 by ci-parallel (PR17-VERIFY), darwin, a detached worktree at `ef075b16ef8d8a9888525b0a70c70710ad97eeab`
- **Basis:** main has no changes outside `state/CLAIMS.jsonl` since the branch's merge-base, so this head is what a merge would test.

| command | result |
|---|---|
| `npm run lint:self` | `LINT-SELF PASS` |
| `npm run lint:levels` | exit 0. 03-drifting-stones has 0 warnings. The only warning in the tree is the gym's accepted TIGHT on seg 14->15 (OQ-051) |
| `npm run playtest` (full, serial, all 4 levels + the once-per-run stages) | `RESULT: PASS` in 969 s |

- **Every stage of 03-drifting-stones passed:** schema, lint-level, preflight, nav, phase-sweep, replay, chaos, hazards, counters, assets, accent and visual.
- **Chapters 00-02 passed every stage** as well.
- **The once-per-run stages passed:**

  | stage | checks |
  |---|---|
  | REACHABLE | 11/11; it plays 01 > 02 > 03 from the bare URL |
  | pitch-assist | 26/26 |
  | run-metric | 15/15 |
  | ambient-motion | 9/9 |

- **Per-segment bot time against the 12 s budget, for 03-drifting-stones.** "nav run" is the green nav run, split at the checkpoint waypoints (cp 5, 9, 11, 15 and the goal). The phase-sweep column is the worst of 8 arrival phases, including any crow wait.

  | seg | span | nav run | phase-sweep worst | budget |
  |---|---|---|---|---|
  | 0 | spawn -> checkpoint[0] (jump gap 3, double gap 6) | 6.78 s | 6.63 s | 12 s, PASS |
  | 1 | cp[0] -> cp[1] (first platform ride, stone_a) | 6.54 s | 7.67 s | 12 s, PASS |
  | 2 | cp[1] -> cp[2] (first dash, under the lintel) | 1.28 s | 1.03 s | 12 s, PASS |
  | 3 | cp[2] -> cp[3] (crow run, +1.5 jump) | 6.58 s | 8.32 s | 12 s, PASS |
  | 4 | cp[3] -> goal (second ride, dash off it) | 8.14 s | 8.25 s | 12 s, PASS |

  - **Total nav run:** 29.32 s against the level's 60 s (12 s x 5 segments).
  - **Waypoints:** 22/22 in order, and every declared move completed: ground 14/14, jump 2/2, double 1/1, platform 2/2, dash 2/2.
  - **HAZARD_INERT on seg 3:** blind departures fail 4/8 arrival phases, and reading the crow clears 8/8 (4.57-8.32 s).
  - **Worst segment:** seg 3 at 8.32 s, which leaves 3.68 s of the 12 s.
- **Not verified here:**
  - PR #16 (04-summit-ridge) is not on this branch. As that entry above says, whichever of #16 and #17 merges second needs this run repeated on the merged tree.
  - The linux goldens. Visual ran against darwin goldens only.
  - CI-runner timing. A local run is faster than a CI runner, so the CI times will be longer than these.

---

## PR #18 — B-22 parallel CI playtest, head `f3073a8`
verified: 2026-11-09 by ci-parallel (B-22), darwin

| command | result |
|---|---|
| `npm run lint:self` | PASS |
| `npm run lint:levels` | PASS |
| `npm run check:merge-reports` | 7/7 cases behave |
| `npm run playtest` (serial) | `RESULT: PASS` in 586 s |

- **The split jobs, run one after another** (they share one dist/ and port 4317 locally):

  | job | time |
  |---|---|
  | 00-gym | 108 s |
  | 01-lower-stair | 137 s |
  | 02-cliff-seam | 196 s |
  | game | 66 s |

  Then `merge-reports.mjs` printed `RESULT: PASS`. Removing one level's report gives COVERAGE_LEVEL, and a cancelled job gives JOB_RESULT; both exit 4.
- **Wall-clock, local, on the same machine and in the same session:**
  - **Serial:** 586 s.
  - **Split:** the slowest job, 196 s. On CI each job has its own VM, so this is derived from measured jobs, not measured running side by side.
- **CI:** 28.0 min before (42561268355, four levels). The after time is not measured, because no run has executed.
- **The workflow matrix was checked, and no change was needed:**
  - **Interpolation is not the failure.** The `level` job's literal name `level (${{ matrix.level }})` on run 42568273892 is how GitHub displays a matrix job that was never expanded, because its upstream `matrix` job never started.
  - **The jobs with no matrix died the same way.** `static`, `matrix`, `game` and `playtest` each died in 1-3 s carrying the billing annotation ("The job was not started because recent account payments have failed or your spending limit needs to be increased"). So did main's unchanged single-job workflow (42572942119) and b23-wall-eye (42572158973).
  - **The matrix step's exact run line works locally.** It emits `levels=["00-gym","01-lower-stair","02-cliff-seam"]`, which parses as a 3-element JSON array for `fromJSON`.
  - **`actionlint` (1.7, with expression and type checking) reports `.github/workflows/ci.yml` clean.**
  - **No edit was made,** because a cosmetic change would have read as a fix for a defect that is not there.
