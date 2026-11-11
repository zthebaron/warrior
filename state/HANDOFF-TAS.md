# HANDOFF-TAS (written 2026-11-11 ~00:55Z by session title-audio-sword, for a fresh session with zero memory)

The task is `/Users/timdevallee/Code/warrior/00-start-here/PROMPT-TITLE-AUDIO-SWORD.md` (71 lines, untracked in the
main checkout: read it first). Tim asked for all of it in one PR. The reviewer merges. Do not deploy.

## 1. Where things stand

- Worktree `/Users/timdevallee/Code/warrior/.claude/worktrees/title-audio-sword`, branch `title-audio-sword`, cut
  from origin/main at d9fad33. **PR #35**, OPEN, DRAFT: https://github.com/zthebaron/warrior/pull/35
- Claim `TITLE-AUDIO-SWORD` is held by agent `title-audio-sword` on main (b8ceb89, ttl 480 min from 23:46Z).
- **All four things in the brief are built, committed and pushed.** The reviewer's note that sound and the slash
  were still to build was out of date. Commits, oldest first:
  - b483f1d the gate, the title screen, the how-to-play page, `reachable` at the bare URL
  - 0c40975 sound
  - db5d964 the sword slash and the gamepad
  - aa0c96c D-022 records (decision, MEASUREMENTS, OQ-072, backlog B-54 to B-58, SPEC §7 row 2) and the screenshots
  - 256390d `reachable` holds keys and retries (fixes the one CI failure below)
  - this file
- **CI.** b483f1d: 9/9 green (run 42930333265). 0c40975: 9/9 green (run 42932276468). db5d964: `game` RED, all
  else green (run 42933635485): `reachable` 39/40, "a jump starts the jump sound: Space started no sound in 5 s".
  Cause: the check tapped Space for less than one frame, and move keys are sampled once a fixed tick, so a slow
  runner never saw it. 256390d holds the key 350 ms and retries for 15 s; it passes locally 40/40. **The push of
  this file starts the run that proves it on CI: check it first.**
- fal: this task spent **$0.4860** (ledger rows 67 to 80) of its $4.00. Ledger total **$12.0860** of $20.00.

## 2. What is left, in order

1. **CI 9/9 on the pushed head.** `gh pr checks 35`. If `game` is red again, read
   `gh run view <run> --log-failed` and look at `reachable`'s ✗ lines. Do not weaken a check to pass.
2. **Read the independent review and fix what it confirmed.** A workflow (run id `wf_a7c194c0-966`, five
   reviewers of db5d964, each finding re-checked by a skeptic) was still running when this was written. Its
   results are one JSON line per agent in
   `/Users/timdevallee/.claude/projects/-Users-timdevallee-Code-warrior--claude-worktrees-title-audio-sword/71bcbee5-0f41-4a44-958d-2357cca10846/subagents/workflows/wf_a7c194c0-966/journal.jsonl`
   (lines with `"type":"result"`; the verify agents return `verdicts[]` with `real`, `evidence`, `fix`). Act only
   on `real: true`, and check each against the code yourself first: a review is a proposal (CLAUDE.md). If the
   journal has fewer than ten result lines the run was cut short: re-launch it from
   `.../workflows/scripts/tas-review-wf_a7c194c0-966.js` or review by hand.
3. **Two small gaps I know of.**
   - The left-click slash is not in the how-to-play table. Add `'Mouse0'` to `INPUT_CONFIG.bindings.slash`
     (`src/engine/input.ts`) and make the `mousedown` listener in `src/main.ts` test
     `bindings.slash.includes('Mouse' + e.button)`. `KEY_NAME` in `src/ui/howto.ts` already maps `Mouse0`.
   - `D-022`'s `implemented_by:` line names b483f1d, 0c40975, db5d964. Append any later commit that changes code.
4. **After any source change:** `npm run typecheck`, `npm run lint:not-list` (strings are scanned), the eleven
   static checks (section 5), `npm run playtest -- --only=reachable`, and `frame-hashes` (section 4).
5. **PR description, then ready.** Replace the draft body. It must say: what shipped; what did not and why (no
   bought clip; sword stays on the back; no touch controls; gamepad untried); the proof the harness sees none of
   it; that nothing was judged by ear; the green run id. The screenshots are LFS PNGs in `docs/build-log/title/`:
   a relative path does not render in a PR body, use
   `https://github.com/zthebaron/warrior/blob/<full sha>/docs/build-log/title/<file>?raw=true`. Then `gh pr ready 35`.
6. **Release the claim** from a detached origin/main in a separate worktree, one ledger-only commit:
   `node tools/claim.mjs release TITLE-AUDIO-SWORD --agent title-audio-sword`, check
   `git log --oneline origin/main..HEAD` is exactly that one commit, `git push origin HEAD:main`.
   **Never push HEAD:main from the `title-audio-sword` branch: it lands the work.**
7. **The report to Tim, at most 15 lines:** what shipped; what did not and why; fal spend for this task ($0.4860,
   unless more is bought) and the ledger total ($12.0860); the keys chosen (slash J / pad X / left click, mute N,
   volume - and =, how to play H); what Tim should judge by eye (the slash pose and stroke, the title at his
   5120x1440) and by ear (everything: nothing was heard); the cookie; the gamepad untried.

## 3. The gate (the design everything else hangs on)

- `index.html` decides once, from the URL, in an inline script in `<head>`: with any of `harness`, `playtest`,
  `replay`, `instrument`, `level` the page is `<html class="bare">`; otherwise `<html class="shell">`.
  The harness's real marker is `harness=1`; `playtest` and `replay` do not exist in `src/` and are honoured
  because the brief names them.
- The title and how-to-play markup live in `<template id="shell">`. A second inline script, after it, stamps the
  template into the page on a shell page and **removes it** on a bare page. So a bare page's elements with an id
  are `app` and `hud`, as on main. The title painting is therefore on screen before `src/main.ts` loads.
- `src/main.ts` builds `shell`, `audio` and `tap` only if `!HARNESS_MODE && shellEnabled()`; `pad` and
  `slashClock` only if `!HARNESS_MODE`. On a bare page every line that names them is `x?.…` and does nothing.
- A press before the game is ready: the inline script sets `<html data-intent="play|help">`; `Shell.ready()`
  (first `menu` state) sets `<html data-shell="ready">` and honours the intent in a microtask.
  `reachable` waits on `data-shell="ready"`, never on the painting.
- The slash's clip, mixer action and stroke mesh are created on the **first slash**, so a page that never slashes
  has exactly main's mixer actions and scene objects.
- Proof: `node tools/harness/frame-hashes.ts <out.json> --build`, then `--diff <before> <after>`. The baseline
  from main is `$CLAUDE_JOB_DIR/tmp/tas/base/before.json` (job `bf6381cf`; if gone, the same proof is: every frame
  is pixel-identical to its committed darwin golden). Result on db5d964: only the page `<title>` differs.

## 4. What was built (read D-022, OQ-072 and MEASUREMENTS "D-022 …" for the detail)

- **Title:** `index.html` (CSS and markup), `src/ui/shell.ts`, `assets/ui/` (made by `tools/art/ui-art.mjs` from
  `assets/ui/src/`), keep zone in `assets/ui/art.json`. Check: `node tools/harness/shell-shots.ts <dir>` (draws
  400x800, 1920x1080, 5120x1440 and measures that the keep zone is whole and no button is cut off).
- **How to play:** `src/ui/howto.ts`, built from `INPUT_CONFIG.bindings`, `GAME_RULES.keys`, `SHELL.keys`,
  `AUDIO.keys`, `GAMEPAD.labels` and each level's `moves_allowed`.
- **Sound:** `src/audio/audio.ts` (events in, sound out), `tap.ts` (reads the player after each tick, writes
  nothing; `player.ts` has no events), `prefs.ts` (one cookie, `karasu_sound`). Files in `assets/audio/`, made by
  `tools/gen/build-audio.mjs` from fal takes in `assets/build/gen/audio/` (git-ignored; request ids are in the
  ledger and in `assets/audio/raw/*.result.json`, so `fal-call.mjs fetch` brings a take back free).
  Checks: `node tools/gen/build-audio.mjs --check`, `node tools/harness/audio-check.ts`.
- **Slash:** `src/entities/slash.ts` (`SlashClock`, `slashClip`, `SlashArc`), the slash block in
  `character-model.ts` `apply()`, `Player.slashTime`. Look at it: `node tools/harness/motion.ts <dir> --slash`.
- **Gamepad:** `src/engine/gamepad.ts`, `InputSystem.setPad`. Never tried with a pad.
- **Budgets:** `tools/assets/shell-budget.mjs` (in `npm run assets:budget`), lines `ui` and `audio` in `budgets.json`.
- **fal:** `tools/gen/fal-call.mjs` knows `fal-ai/elevenlabs/sound-effects/v3` ($0.002 a started second; a
  payload with no `duration_seconds` is refused) and `fal-ai/stable-audio-25/text-to-audio` ($0.20), and takes
  `--max-total <dollars>`. Every call of this task: `sh tools/gen/run-audio.sh <name>` (it passes 15.60).
  `node tools/gen/fal-call.selftest.mjs`: 57 pass.

## 5. Gotchas (each one cost time)

- **The shell guard.** Any command that mentions `git` (even inside the word `github`) together with `&&`, a
  pipe, a heredoc or a loop is refused, and a refused command runs **nothing**. Run each git command alone. Write
  scripts with the Write tool, not a heredoc. A `cd` into another directory is reset after the command.
- **lint:not-list scans strings in `src/`.** Refused there, as identifiers or inside any string: `attack`,
  `strike`, `combo`, `parry`, `hitstop`, `localStorage`, `sessionStorage`, `indexedDB`, anything starting
  `unlock`, `score`, `rank`, `health`, `hp`, `lives`, `damage`, `easy…`, `subtitle…`. So: "slash", `wake()`,
  a cookie. `index.html` is not scanned.
- **A key tap in a Playwright test is shorter than a frame.** Move keys are sampled once a fixed tick. Hold the
  key (`keyboard.down`, wait, `keyboard.up`). Keys handled by a `keydown` listener (Enter, H, N, J) are fine.
- **The bundler inlines files under 4 KB** (`wall_grab.mp3`), so they are never a network request. Count decodes.
- **`.sound { display: flex }` beats the `hidden` attribute.** `.shell [hidden] { display: none !important }` is there for that.
- **`max-width: 100%` on a grid item** resolves against an auto track: use `100vw`.
- **`object-position` for a keep zone** is `x0 / (1 - (x1 - x0))` (47.2%), not the zone's centre.
- **`text-transform` changes `innerText`.** Read `textContent` for button labels in a test.
- **three.js mixer:** an action evaluated exactly at its clip's end under LoopRepeat reads the start
  (`SLASH.lastFrameShy`). A PropertyMixer only writes a bone when the mixed value changed, so never pose a bone by
  hand behind the mixer's back. The slash is a mixer action with weight `share / (1 - share)` for that reason.
- **A ribbon in the blade's own plane is edge-on from behind the player.** The stroke faces the camera each frame.
- **`ui-art.mjs` writes files when imported.** Do not import it from another tool; the shared numbers are in `assets/ui/art.json`.
- **Chapter 1 cam3 flickers on main:** one pixel, (606, 91), two values, run to run. `frame-hashes --diff` may
  report that one frame. It is not this change (OQ-072 item 13, B-58).
- **Several Linux goldens are stale** (OQ-071 items 13 and 17), so "visual passes" proves little. On run
  42933635485 the Linux pixel counts were exactly main's (run 42916101340): 01 cam3 152, cam4 837; 03 cam0 335;
  02 cam0 520, cam4 762; 00 cam0 297, cam1 790, cam2 561; 04 cam0 438; every other camera 0 to a few px.
- **Never `--record`, never `--update-goldens` here.** The picture must not change. If a golden changes, stop and report.
- **One playtest, frame, motion or shots run at a time** (ports 4317, 4318, 4319). Never edit `src/` during one.
- **Every push to the PR branch is a nine-job CI run.** Batch commits.
- `FAL_KEY` is read by `fal-call.mjs` from `~/Code/warrior/.env`. Never print it; never call fal any other way.
- The session opened at 93% of the weekly limit. Since then the codebase survey and the price lookup used about
  0.97M subagent tokens, and the review is still running. Do not start another workflow without need.

## 6. Background tasks at handoff

- The review workflow `wf_a7c194c0-966` (task `wo76doeyz`): read-only, safe to let finish or to stop.
- No playtest, build or server is running.
