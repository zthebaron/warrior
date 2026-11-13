# HANDOFF — POLISH-1 (written at about 75 percent context, 2026-11-13)

Brief: `00-start-here/PROMPT-POLISH-1.md`. Branch `polish-1`, draft PR #43 (zthebaron/warrior). Claim POLISH-1 is
taken (`e458538`, on main) and NOT yet released. Do not deploy; the reviewer merges.

## Where it stands

| Row | State | Proof |
|---|---|---|
| B-98 the gate's sound | built, committed | `assets/audio/gate.mp3` (take `gate-b`), `audio.json`, `AUDIO.gain.gate` 0.7, the tap's gate event (`src/audio/tap.ts`, `src/main.ts` passes `gateShare`). `check:fight` rule 6 runs the real tap: once, on the tick of the last fall; two mutations caught (18/18). fal $0.0120 (rows 97, 98); ledger $15.1968 |
| B-99 the gate's line | built, committed | `src/systems/teach.ts` gate place, `src/ui/howto.ts` `MOVE_TEXT.gate`: "This gate opens when every swordsman is down. Press {slash} to cut." `check:teach` 126/126, 6/6 mutations |
| B-107 a thumb's three hard moves | built, committed | `tools/harness/touch.ts` 5b and 6b, `thumbMove`, `pressTwice`, `nextFrame`. Darwin: all land on try 1. CI run 43483354272: wall jump landed on try 3 of 3 (the reason the tries are now all reported) |
| B-108 the slow stage | built, committed | `home()` by `place` (537.5 s to 121.4 s darwin, 60/60 kept); then the stage split in three once-stages and three CI jobs (`touch`, `touch-release`, `touch-chapters`): darwin 46.2 / 35.7 / 44.8 s; CI run 43483354272 jobs 3m00s / 4m12s / 7m21s, all green |

Frame hashes against origin/main: IDENTICAL, 229 values, 6 levels (MEASUREMENTS "POLISH-1 desktop is untouched").
CI static job: all green locally and on CI.

## Left to do

1. **Wait for the CI run on `d3357b7`** (pushed last: the dash jump's Jump on the tap's acknowledgement, 14 ticks
   on darwin; every try reported; the broken face bounded from the press; the laptop page at 640x360). Read
   `touch-chapters`' report (`gh run download <id> -p 'harness-report-touch*'`): the wall jump's tries and its
   "Jump read down on ticks" line say whether the frame pacing holds on CI. If the wall jump keeps needing 3 tries,
   say so in the report as a thumb not reliably shown on CI; do not loosen the check.
2. **Set `timeout-minutes` of the `touch` job** in `.github/workflows/ci.yml` from the CI times (two runs at least:
   43483354272 and the `d3357b7` run), and rewrite its stale comment (it still says 533 s / 28m20s / 45). Put the
   numbers in MEASUREMENTS as a new section "POLISH-1 the touch job on CI" (referenced already by the B-108 row and
   by "POLISH-1 the touch stage"; it does not exist yet). Before: 28m20s (run 43374834353), one job; after the home
   fix, one job: 11m03s (failed: the double jump, since fixed) and 12m39s and 10m09s; after the split: the three.
3. Update the B-108 backlog row with the split and the CI times; update B-107's row if the wall jump stays at try 3.
4. Release the claim (`node tools/claim.mjs release POLISH-1`), commit the ledger line, and push it to main with
   `git push origin HEAD:main` only from a clean commit containing nothing but that line (see memory: claim pushes
   from a clean HEAD). Or leave it for the reviewer, and say so.
5. Write the PR body (title is set) and the 10-line report. Keep the PR a draft if the handoff is what ends this.

## Traps

- `tools/harness/.diag/` is an untracked diagnostic driver (not to be committed).
- The sandbox refuses `git` in compound commands: one git command per call.
- `touch.ts` parts: `touch` = controls, `touch-release` = nothing sticks and pause, `touch-chapters` = the rest.
  `run.mjs` ONCE list and `lib.ts` ONCE_STAGES must stay equal (run.mjs throws otherwise).
- Every number in code must be in MEASUREMENTS: the new ones are in "POLISH-1 the touch stage" and "POLISH-1 the
  hard moves by thumb" (`home`, `again`, `pressShort`, `moveTicks`, `catchWithin`, `tries`).
