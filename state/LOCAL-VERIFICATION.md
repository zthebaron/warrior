
## PR #20 — B-23 collided camera arm + chapter 2 wall-teach rebuild, head `cb72b50`
verified: 2026-11-09 08:04Z by kit, darwin, worktree on `b23-wall-eye` at `cb72b507530aea4f7f238634760ef2228e5d0c64`, tree clean
- **Basis:** the branch is main as of `fdf4eda` plus its own commits. Main has changed only in `state/` since, so this head is what a merge would test.

| command | exit | result |
|---|---|---|
| `npm run lint:self` | 0 | `LINT-SELF PASS`, including the B-23 block (below) |
| `npm run lint:levels` | 0 | `LINT PASS` 00-gym, 01-lower-stair, 02-cliff-seam. The only warning is the gym's accepted TIGHT on seg 14->15 |
| `npm run playtest` (full, serial) | 0 | `RESULT: PASS`, 305 checks, 0 failed |

- **The new wall teach** (`02-cliff-seam` `critical_path[5]`) is **+3.75**, inside wall's D-016 band (3.50, 4.00]. The player kicks off a 3.25-tall wall 1.5 u behind the stand point, onto a 1 u shelf.
- **Chapter 2 now passes the corrected arm model:**
  - READABLE_RISE: `lint-level.mjs clean`.
  - The real rig: `ASSIST_CASE 02-cliff-seam critical_path[5] reads in the real rig ... wall +3.75 onto 1.00u: real rig reads 3.50deg at view pitch 54.0deg (probe target 54); linter modelled 54deg, needs >= 2deg`. The linter models 3.54°.
  - The teach first shipped at +2.50 (wall 1 u back, 8.5 tall). It read 0.00° in both the linter and the rig, eye +1.75 against +1.76 (OQ-062).
- **lint:self, B-23 block, all ok:**
  - rejects +3.75 with its wall 1 u behind (ERROR, teaching instance);
  - accepts +3.75 with nothing behind (assisted, 29°);
  - rejects +2.50 with its wall 1 u behind;
  - accepts +2.50 with nothing behind (at rest);
  - judges the walled +3.75 at the camera's own target, 29°, with the arm collided there (eye +1.91).
- **Per-segment worst arrival** (phase-sweep, worst of 8 arrival phases, including the crow wait), against the 12 s budget:

  | level | seg 0 | seg 1 | seg 2 | seg 3 | seg 4 |
  |---|---|---|---|---|---|
  | 02-cliff-seam | 4.87 | 2.67 | 2.35 | 8.85 | 10.73 |
  | 01-lower-stair | 5.68 | 2.97 | 6.85 | 6.77 | — |

  All PASS.
- **Not verified here:**
  - The linux goldens. The 02 cam0-2 goldens were copied from darwin. That copy rests on cam3-5 being byte-identical across darwin and linux for this level.
  - CI-runner timing.

## PR #13 — B-19 FACE_RISE, head `410cf30` (rebased after its last green CI run)
verified: 2026-11-09 07:58Z by kit, darwin, worktree on `b19-face-rise` at `410cf3039ce2ddd957256621843467155ae34055`

| command | exit | result |
|---|---|---|
| `npm run lint:self` | 0 | `LINT-SELF PASS`, including FACE_RISE 8/8 ok (+0.35 face found, one +0.50 face in a 6.6 u run found, the long-run fixture FAILS FACE_RISE and nothing else) |
| `npm run lint:levels` | 0 | `LINT PASS` 00-gym (FACE_RISE WARNING on seg 18->19, its 0.40 risers, B-20's) and 01-lower-stair |
| `npm run playtest` (full, serial) | 0 | `RESULT: PASS`, 201 checks |

- **Chapter 1 worst arrival per segment:** 5.05 / 2.97 / 6.85 / 6.77 s, all within 12 s.
- **Caveat: this head predates chapter 2 on main.** The branch only has 00-gym and 01, so the run above does not test FACE_RISE against `02-cliff-seam`. That gap is covered by the trial merges below.

## Trial merges: what landing #13, then #20, would test
verified: 2026-11-09 by kit, darwin, a scratch worktree (not pushed)
- **main + #13** (main at `73eb311`; main has changed only in `state/` since): clean merge, no conflicts.
  - `lint:self` PASS.
  - `lint:levels` PASS on 00, 01 and **02-cliff-seam**. Chapter 2 has no FACE_RISE finding.
- **+ #20 on top:** one conflict, in the `tools/lint-self.mjs` import line. Both sides add names; the union resolves it.
  - Resolved: `lint:self` PASS, `lint:levels` PASS on 00/01/02, typecheck PASS.
  - `npm run playtest`: exit 0, `RESULT: PASS`, 305 checks. ASSIST_CASE 02 `critical_path[5]` reads 3.50° at 54.0°.
- **Whichever of #13 and #20 merges second** needs that one-line import union. Nothing else conflicts.
