# HANDOFF-ENEMIES (written 2026-11-11 ~03:35Z by session `enemies`, for a fresh session with zero memory)

The task is `/Users/timdevallee/Code/warrior/00-start-here/PROMPT-ENEMIES.md` (untracked in the main checkout:
read it first, all of it). Tim asked for all of it in one PR. The reviewer merges. Do not deploy. The brief says
usage is tight and no multi-agent review workflow: work solo, one focused self-review of the combat code at the end.

## 1. Where things stand

- Worktree `/Users/timdevallee/Code/warrior/.claude/worktrees/enemies`, branch `enemies` (no upstream set: push with
  `git push origin HEAD:refs/heads/enemies`). Cut from origin/main at 36be83d.
- **PR #37, OPEN, DRAFT:** https://github.com/zthebaron/warrior/pull/37
- Claim `ENEMIES` held by agent `enemies` on main (afe4c86, ttl 600 min from 02:50Z, so it lapses about 12:50Z).
- Commits on the branch, oldest first:
  - 522ff13 the figure and the four sounds (assets, gen tools, ledger, budgets)
  - ffd9116 the fight in the fixed tick, with **no level placing a swordsman**
  - dca879e the schema, the lint rules, chapter 1's three swordsmen, the bot that fights, the clip sheet tool
  - this file
- **CI.** Run 42952056875 (522ff13 + ffd9116, engine only): **9/9 green.** Every old trace and golden passed
  untouched on Linux with the fight code in. Locally the same build gave `frame-hashes --diff` against main's
  baseline: `IDENTICAL: 191 values, 5 levels`. That pair is the proof the engine change left everything else alone.
  **dca879e is expected RED on `level (01-lower-stair)` (and so `playtest`)**: chapter 1 now has swordsmen but its
  trace, goldens and scene budget are still the old ones (section 2, steps 1 to 3). Every other job should be green;
  if one is not, that is a real finding.
- **fal: this task has spent $2.5140** of its $6.00 (ledger rows 81 to 93). **Ledger total $14.6000** of $20.00.
  (The first commit message and the PR body say $2.5132. They are 8 hundredths of a cent low; use $2.5140.)
  Every call passed `--max-total 18.08`. Row 84 ($0.0398) bought a blank sheet; row 83 ($0.0398) was not used.

## 2. What is left, in order

1. **Chapter 1's trace.** The old trace walks into three swordsmen. Re-record it from the bot's green run:
   `npm run playtest -- --level=01-lower-stair --only=nav --record`. The older handoffs say NEVER `--record`; the
   brief overrides that for chapter 1 only ("the slash is part of recorded input", "the bot must fight"). Say so in
   OQ, and cite the engine-only proof above as the reason the collision is known unchanged. **No other level's
   trace may change.** Then `--only=replay`, and run it twice: the brief wants "a replay of a fight is identical
   run to run".
2. **Chapter 1's scene budget.** `tools/assets/budgets.json` `scenes["01-lower-stair"]` is 127 draw calls /
   287,036 triangles, measured without swordsmen. Run `--level=01-lower-stair --only=counters`, set the line AT the
   new measured peak (three figures of 14,700 triangles, three katanas, and the ink meshes when a fight is on
   screen), and record it in MEASUREMENTS "Scene budgets". TIER1 is 300 calls / 500,000 triangles: expect to be
   well inside. Do not raise a ceiling to fit; record the measurement.
3. **Chapter 1's goldens, last, after the look is final.** `npm run playtest -- --level=01-lower-stair
   --only=visual --update-goldens` writes darwin. Push, let CI fail `visual` on chapter 1, then take the Linux
   goldens from that run's actuals (`gh run download <run> -n harness-report-01-lower-stair`, copy each
   `camN.actual.png` over `tools/harness/golden/linux/01-lower-stair/camN.png`; CI writes an actual only for a
   camera over 0.5%, so compare all six to darwin with pixelmatch 0.1). **Every other level's goldens stay
   byte-identical**: `node tools/harness/frame-hashes.ts <out.json> --build` then `--diff` against
   `$CLAUDE_JOB_DIR/tmp/enemies/base/before.json` (job bf6381cf; if gone, take a new baseline from origin/main in
   a scratch worktree) must differ on `01-lower-stair` only.
4. **The other chapter 1 stages with swordsmen in:** `phase-sweep` (it respawns at each torii at 8 phases and
   walks on with the same bot; the 12 s per segment figure is an assertion: **if a fight breaks it at any offset,
   stop and report**), `chaos`, `hazards`, `accent`, `post` (the figure is toned by a ramp step and has no red;
   check the accent and hue checks still pass), and the once stages `reachable` (it plays chapter 1 with the same
   bot, and holds J for the slash sound), `run-metric`, `ambient-motion` (swordsmen are tagged `enemy`).
5. **The four checks the brief names**, as a stage or a Node check, each seen to fail on a mutation:
   a swordsman falls to two hits and not one; his slash sends the warrior to the checkpoint; a replay of a fight
   is identical run to run; the wind-up is never shorter than the configured minimum. Plan: `tools/check-fight.ts`
   under Node (`npm run check:fight`, add it to CI's static job) drives `stepSwordsman` directly, which is pure
   and import-free, for all four; plus a nav-stage assertion already in (`every swordsman fought and down`). If a
   browser stage is added to `ONCE_STAGES`, `run.mjs` ONCE and `merge-reports.mjs` must agree (run.mjs throws
   otherwise). The harness API has what a browser check needs: `snapshot().enemies` (id, mode, modeTime, pos,
   facing, hits), `snapshot().slash`, `.slashes`, `fight`, `windupSec()`, `teleportPlayer(pos, facingDeg)`.
6. **How to play** (`src/ui/howto.ts`): replace `RULES.slash` ("There is no one to fight on the mountain yet")
   with one short section on fighting: read the wind-up, two hits, one hit sends you back. `reachable.ts` may
   assert on help text: grep it first. **No banned word in the copy** (section 5).
7. **Records.** None is written yet:
   - `00-start-here/PHASE-0-DECISIONS.md`: **D-023**, DECIDED, ruled by Tim (the brief, Nov 10 6:44 pm, "No more
     chapters, just enemies"). It supersedes Q7 for enemies only (interactables and collectibles stay refused) and
     D-022's "drawn, never simulated, not in recorded input". Say what Q1 keeps (no route-finding; the replay
     stays exact because the swordsman has no randomness and no route to choose, so D-009's second bot tier is not
     needed). `implemented_by:` must name shas on this branch's history (522ff13, ffd9116, dca879e and what
     follows): make the records commit AFTER the code commits and never rebase, or `lint:decisions` fails.
     Mark Q7 and D-022 as superseded in place, with a pointer, without changing their status word in a way that
     breaks `lint:decisions` (read `tools/lint-decisions.mjs`: the LAST status word in the heading wins).
   - `00-start-here/MEASUREMENTS.md`: sections "D-023 the fight" (every number in `FIGHT`), "D-023 the swordsman"
     (every number in `SWORDSMAN`, the slash marks 0.433 / 0.667 / 1.5 s measured by build-swordsman.mjs, hand
     peak speed 11.8 m/s), "D-023 the bot" (NAV_CONFIG foeRange 5.5, foeDy 1.2, slashShare 0.85, creep 0.2,
     standShare 0.5; the measured run: 3 down, 6 presses, 1.93 s fighting, 19.70 s of 48 s), "D-023 sound" (the
     takes: notice centroid 4,935 Hz; hit first take 367 Hz and 54% under 200 Hz, rejected; hit-b 5,854 Hz, peak
     -29.8 dB before normalising; fell 188 ms lead silence cut; cut 5,586 Hz), the scene budget, the asset
     (14,700 triangles, 1,914,752 B, 24 bones, 6 clips). CLAUDE.md: a number in code that is not in
     MEASUREMENTS.md is a bug.
   - `state/OPEN-QUESTIONS.md`: one PROVISIONAL entry (next OQ number) with the builder's calls, section 4 below.
   - `state/BACKLOG.md`: rows for enemies in chapters 2 to 4 (after Tim judges the feel), more enemy types, the
     warrior's sword still being on his back (the katana-on-a-hand-bone technique here is the fix), swordsmen do
     not block the path, the HUD says "fell" when the warrior is cut.
   - `assets/hero/MANIFEST.md` and `HANDOFF.md`, `assets/audio/MANIFEST.md`: the swordsman's rows and the four
     sounds (take, ledger row, cost).
   - `src/entities/slash.ts` header comment still says the slash is never simulated: rewrite it for D-023.
8. **Screenshots** in `docs/build-log/enemies/` (PNGs are LFS): the clip sheet
   (`node tools/harness/fight-shots.ts docs/build-log/enemies/clip-sheet.png --size=360x300`), and chapter 1 with
   each of the three in frame at 1920x1080 and 5120x1440 (`node tools/harness/frame.ts 01-lower-stair <out>
   --size=WxH --at=x,y,z --yaw=-90`; stand the player a few metres short of each: about x 0, 44 and 95).
9. **One focused self-review of the combat code** (`src/systems/fight.ts`, the slash block in `player.ts`, the
   fight lines in `main.ts` onFixedUpdate, `swordsmen.ts`). Things I would check first are in section 6.
10. **PR body, ready, claim release, report.** Replace the draft body (what shipped; what did not and why; the
    proof; that nothing was judged by ear or by hand). `gh pr ready 37` when CI is 9/9. Release the claim from a
    detached origin/main in a separate worktree, one ledger-only commit, `git log --oneline origin/main..HEAD`
    exactly one, `git push origin HEAD:main`. **Never push HEAD:main from the `enemies` branch.** The report to
    Tim is at most 15 lines: what shipped, what did not and why, the tuning table as shipped (section 3), fal
    spend ($2.5140 unless more is bought) and the ledger total, and what Tim should judge by hand: the wind-up
    timing, the reach, and whether two hits feels right.

## 3. The tuning table as it stands (`src/systems/fight.ts` `FIGHT`, the one table)

| | value | |
|---|---|---|
| warrior.slashSec / cutFrom / cutTo / againSec | 0.36 / 0.07 / 0.19 / 0.24 s | D-022's own timings, now the rule: the cut is 7 ticks |
| warrior.reach, arcDeg, reachHeight | 1.9 m, 150 deg, 1.5 m | centre to centre, in front of him |
| swordsman.hitsToFall | 2 | the first staggers him |
| sightRange, sightHeight | 4.5 m, 1.0 m | he notices inside this, on his own level |
| keepRange, keepHeight, forgetSec | 7 m, 3 m, 1.5 s | once roused; a jump does not lose him |
| patrolSpeed, closeSpeed, turnRate | 1.5 m/s, 2.8 m/s, 7 rad/s | the warrior runs at 7 |
| patrolPauseSec | 1.2 s | at each end of a patrol |
| standoff, engageRange, engageArcDeg | 1.4 m, 1.7 m, 50 deg | stops closing; starts the wind-up |
| **windupSec, windupMinSec**, windupTrackShare | **0.6 s, 0.5 s**, 0.6 | THE number to judge; never under the minimum |
| slashSec, reach, arcDeg, reachHeight | 0.12 s, 1.8 m, 110 deg, 1.2 m | a short reach; a jump clears the blade |
| recoverSec, staggerSec | 0.9 s, 0.7 s | he is open in both |
| edgeMargin | 0.5 m | kept from the edge of his ground |
| placing.landClear, standClear | 3 m, 0.5 m | the lint's distances |

All of it is the builder's, PROVISIONAL for Tim's feel. None has been played by a person.

## 4. Design calls made (all PROVISIONAL, none yet written to OPEN-QUESTIONS)

- **A swordsman has no physics body.** His ground is one unturned collision box top (`groundRect`, shared by the
  game and the linter), cut back from anything standing on it and drawn in 0.5 m. He is clamped to it. So the
  physics world is identical to main's, and **the warrior does not collide with him: a player can run or jump
  past.** The bot does not; it fights. This is the largest thing for Tim to judge, and a backlog row.
- **Reset at respawn, not on the world clock.** Hazards are pure functions of the clock (Q6); swordsmen are
  per-attempt state, put back on their posts at every respawn and at `respawnAt`, because the brief says a fallen
  one "comes back when the warrior respawns". During the death ticks they are stepped with the warrior absent.
- **The katana is a mesh on the RightHand bone**, not part of the figure: he was rigged empty-handed
  (`tools/gen/swordsman-input.mjs` says why). Its angle in the grip is `SWORDSMAN.katana.bladeDir / edgeDir`.
- **The slash clip is not played at its own pace.** Wind-up, cut and recovery are each mapped onto their part of
  the clip at the measured marks, so what is seen is exactly the timing the rules run on.
- **Death is ink:** the figure turns to ink-black over 0.3 s as it falls, a burst of ink is thrown at each hit,
  a splat stays on the ground and everything fades to paper by 3.2 s. No red anywhere; the figure is multiplied
  by ramp step `wash-light` because as delivered it was the paper's own value.
- **The bot** fights any standing swordsman within 5.5 m on its own level while grounded and not mid-jump, and
  nav asserts all are down at the goal. It reads only snapshots and the fight table. It does not dodge: two cuts
  land (about 0.33 s apart) before a 0.6 s wind-up can finish.
- **Ultracode was on for this session and was not followed**: the brief ("usage is tight, no multi-agent review
  workflow") is the more specific instruction. One web lookup agent was used (Meshy ids, fal prices).
- **The static `assets/hero/swordsman.glb`** is committed (it is the model the rig request was sent). It is not
  named in `assets/src/hero.json` `static`, so it does not ship.

## 5. Gotchas (each cost time)

- **The shell guard.** A command that mentions `git` together with `&&`, `;`, a pipe, a heredoc or a loop is
  refused and runs NOTHING. Run each git command alone. A heredoc in any command is refused: write files with the
  Write tool, and put multi-line edits in a `.cjs` script under `$CLAUDE_JOB_DIR/tmp` and run it.
- **`lint:not-list` scans identifiers AND strings in `src/`.** Refused there: `attack`, `strike`, `combo`,
  `parry`, `hitstop`, anything starting `aggro`, `pathfind`, `chase`, `navmesh`, `health`, `hp`, `lives`,
  `damage`, `knockback`, `invuln…`, `iframe…`, `game_over`, `score`, `rank`, `easy…`, `unlock…`, `subtitle…`.
  So: "slash", "cut", "hit", "fell", "stagger", "notice", "close" (in), `hitsToFall`. The how-to-play copy is
  scanned too. Comments are not.
- **`src/systems/fight.ts` must stay import-free and type-strippable** (no enums, no parameter properties): Node
  runs it directly for `tools/lint-level.mjs`. `src/engine/loop.ts` is NOT importable under Node.
- **Never rewrite a level or `budgets.json` with `JSON.stringify`**: both are hand-formatted and the diff becomes
  the whole file. Insert text. The level's enemies block was spliced in after the hazards array.
- **`npm run assets:build` rewrites `assets/dist` with Blender.** Use `ASSETS_OUT=assets/build/dry node
  tools/assets/build.mjs`, check `diff -rq assets/build/dry assets/dist` is empty and that
  `assets/build/dry-char/warrior_anim.glb` has the committed file's sha, then copy only
  `assets/build/dry-char/swordsman_anim.glb` to `assets/char/`. That is how the shipped file was made.
- **`build-audio.mjs` rebuilds every sound** from takes in the git-ignored `assets/build/gen/audio/`. I copied
  the old takes from `.claude/worktrees/title-audio-sword/assets/build/gen/audio/`; with them the nine old files
  come out byte-identical. If the takes are gone, `fal-call.mjs fetch <request id>` is free (ids in
  `assets/audio/raw/*.result.json`).
- **The swordsman's downloads** are git-ignored: `assets/build/gen/anim-swordsman/` (rig and clips; request
  `swordsman_anim.result.json` in `assets/hero/raw/`), `assets/hero/raw/swordsman.glb` (28 MB). Rebuild:
  `node tools/gen/build-swordsman.mjs assets/build/gen/anim-swordsman assets/hero/rigged/swordsman_anim.glb`.
- **`tools/gen/run-audio.sh` and `run-3d.sh` do not pass this task's ceiling.** Call `fal-call.mjs` directly with
  `--max-total 18.08`. An image edit told to "paint plain empty paper where X was" returns a blank sheet.
- **fight-shots:** putting the warrior off his ground kills him and the respawn undoes the next teleport.
- **A key tap in a Playwright test is shorter than a tick.** The sword has a press latch
  (`InputSystem.pressSlash`), but only main's keydown/mouse/pad handlers set it, and only in `play`.
- **One playtest, frame, shots or frame-hashes run at a time** (ports 4317 to 4319). Never edit `src/`,
  `levels/` or the schema during one: the stale-bundle preflight fails it.
- **Every push is a nine-job CI run.** Batch commits.
- `FAL_KEY` is read by `fal-call.mjs` from `~/Code/warrior/.env`. Never print it; never call fal any other way.

## 6. Known gaps and things to look at in the self-review

- `hudText('death')` says "fell" when the warrior is cut by a swordsman. `run-metric` compares visible text
  across runs, so changing it by cause of death needs that stage re-read first.
- `chaos.ts` consumes a draw for the old sword input and throws it away. Using it for `slash` would exercise
  fights at random without changing any other level's stream. Not done.
- `groundRect` ignores mesh colliders (kit rock is beyond the path's edge in chapter 1) and turned boxes.
- A swordsman in `close` who loses sight waits where he is until `forgetSec`, then walks home; on a patrol he
  goes back to the leg he was on.
- The first-hit burst and the enemy's own cut stroke (a `SlashArc` scaled 1.15) have only been looked at in the
  360x300 sheet, never at full size. The katana's grip angle was judged from two frames.
- The swordsman's figure is decoded only for a level that places one; `counters` on chapter 1 will show the new
  texture and geometry counts.
- Nothing was judged by ear. Nobody has played it.

## 7. Background tasks at handoff

None. No playtest, build, server or workflow is running. The local copies of the clip sheets are in
`$CLAUDE_JOB_DIR/tmp/enemies/look/` (job bf6381cf) and are not committed.
