# Local verification log: while CI is down

GitHub Actions has refused every job on this repo since about 06:16 UTC on 2026-11-09. That covers every branch, including main's unchanged workflow, and every job dies with zero steps executed (Actions minutes exhausted on a private repo).

Until CI is back, a result here is a **local** run on the named commit. It is not a CI result. Nothing in this file is green on the strength of a CI run.

Each entry names:
- the exact commit;
- the commands run;
- the result each one printed.

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
  - The linux goldens. Visual ran against darwin goldens only.
  - CI-runner timing. A local run is faster than a CI runner, so the CI times will be longer than these.

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
