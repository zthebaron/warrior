# HANDOFF-CH4-INK (written 2026-11-13 by session `ch4-ink`, for a fresh session with zero memory)

Written because this session's context was at 75 percent, as `00-start-here/PROMPT-CH4-INK.md` asks. **The look, the
greybox check, the darwin goldens, the build log and D-030 / OQ-084 / MEASUREMENTS / the backlog rows are built and
pushed; what is left is the close-out in section 2.** If the session that wrote this finished it too, the last line
of this file says COMPLETE.

## 1. Where things stand

- Worktree `/Users/timdevallee/Code/warrior/.claude/worktrees/ch4-ink`, branch `ch4-ink`, no upstream: push with
  `git push origin HEAD:refs/heads/ch4-ink`. Cut from origin/main at 7fae5e2; its first commit is the claim
  (d528ce6), which is on main. NEVER `HEAD:main` from here.
- **PR #46** https://github.com/zthebaron/warrior/pull/46, "CH4-INK: the summit ridge, painted", a DRAFT. Its body
  is the 12-line report: `$CLAUDE_JOB_DIR/tmp/ch4/pr-body.md` (job bf6381cf; if gone, `gh pr view 46 --json body`).
- Claim `CH4-INK` held by agent `ch4-ink` on main (d528ce6, 600 min from 2026-11-13T22:42Z).
- The CH3-INK claim was released on main (7fae5e2) before this task began.
- Commits, oldest first: a1c8c2f the look (`src/loaders/summit.ts`; optional parameters on `drift.ts`,
  `backdrop.ts`, `cliff-wall.ts`; `level.ts`; one zone and one prefix in `post`'s proportion check); 9281280 darwin
  goldens and `tools/lint-no-greybox.mjs` in `lint:levels`; then the records, the build log and this file.
- Local, darwin: chapter 4's per-level suite PASS on all 14 stages (`post` 27/27, no check edited); typecheck,
  lint:levels, lint:self, lint:not-list, lint:pack, lint:decisions, check:teach, check:fight PASS. `frame-hashes`
  against origin/main: 24 values, all chapter 4's. Seen red: proportion on chapter 4; NO_GREYBOX_CHAPTER.
- **Not run on this machine:** the whole playtest (every level, the game stages, `reachable` through all five,
  the three touch stages). CI runs them.
- **fal: $0.00 spent; the ledger stands at $15.1968.**

## 2. What is left, in order

1. **Linux goldens for chapter 4.** CI on the head will be red at `level (04-summit-ridge)` `visual` only (its
   Linux goldens are still greybox). `gh run list --branch ch4-ink --limit 3 --json databaseId,status,conclusion,headSha`.
   Check every other job is green. Then `gh run download <run> -n harness-report-04-summit-ridge -D
   $CLAUDE_JOB_DIR/tmp/ci46/04`, copy each `.../tools/harness/golden/linux/04-summit-ridge/camN.actual.png` over
   `tools/harness/golden/linux/04-summit-ridge/camN.png` (all six are expected), compare each with the darwin
   golden (pixelmatch threshold 0.1, expect under about 0.02%; `$CLAUDE_JOB_DIR/tmp/ch3/take-linux.mjs` does both
   for chapter 3: change its three paths), commit "CH4-INK: linux goldens, chapter 4, from CI run <id>'s own
   frames", push, wait for green on all 13 jobs. No other level's golden may be written.
2. If any job other than chapter 4's `visual` is red, read it before anything else. A `post` failure that is not
   a fault: stop, describe it in the PR, leave it a draft. Do not change a gate.
3. In the PR body replace "CI: pending." with "CI: 13 of 13 green on <sha> (run <id>).", `gh pr edit 46
   --body-file <file>`, then `gh pr ready 46`.
4. Release the claim from a detached origin/main, never from `ch4-ink`: the scratch worktree
   `/Users/timdevallee/Code/warrior/.claude/worktrees/ch3-ink/.claude/worktrees/claim-ch3-release` is there for it
   (enter it with the EnterWorktree tool's `path`, `git fetch origin`, `git checkout --detach origin/main`),
   `node tools/claim.mjs release CH4-INK --agent ch4-ink`, commit the ledger line alone,
   `git log --oneline --stat origin/main..HEAD` must show exactly one commit touching only `state/CLAIMS.jsonl`,
   `git push origin HEAD:main`. Each git command alone.
5. Report to Tim: the PR body's numbered list is the report. Do not deploy; the reviewer merges.

Before step 3, three things this session did not look at:

- **The frame from the torii he respawns at.** `stone-before` is taken with his feet at x 59.6, past the T2 torii
  (x 52). He respawns at x 54 with the camera behind that torii, and torii posts hiding a mover was exactly
  chapter 3's failure. Take `node tools/harness/frame.ts 04-summit-ridge <out> --size=1920x1080 --at=54,2.5,0
  --yaw=-90 --settle=30` and `--settle=150`, and the same from `--at=56.5,2.5,0`. If the posts hide the stone or
  its lane, say so in the report's line 3 and in OQ-084 item 5. Move nothing: placements do not move.
- **The 5120x1440 frames were not opened.** Each capture logged 404s to the console (chapter 3's did too, and
  its frames were good). Open one of `docs/build-log/ch4-ink/*-5120x1440.jpg` before marking the PR ready.
- **If no CI run appears for the head**, the run on 9281280 differs from it in render source only by a comment
  in `summit.ts`: its chapter 4 frames are the head's.

And for step 4: if the nested scratch worktree is gone, `git worktree add --detach $CLAUDE_JOB_DIR/tmp/<name>
origin/main` is allowed by the guard.

## 3. Open, not blocking (all in the backlog)

B-122 the islands are cut by the mist; B-123 the hanging boxes' undersides are never seen by the follow camera;
B-124 no `post` check holds the lane; B-125 the void is on one side only (the rock masses collide); B-126 the
scene ratchet for chapter 4; B-127 the proportion check's title.

## 4. Gotchas this task met

- The shell guard refuses `git -C`, a `git worktree add` into the shared checkout, and any compound command with
  a heredoc: a refused command runs NOTHING. Put edits in a script file and run it alone.
- EnterWorktree with `name` makes the branch `worktree-<name>`: rename it (`git branch -m`).
- The wall's cap: 15 u leaves D-021's "undrawn rock drawn over" at 90.2% against a 90% floor. 18 u ships (97.1%).
- Nothing painted may move: the lane is fixed in the world; the stone is the kit's, in the ink pass.
- After a mutation run the bundle is stale: the next `frame.ts` needs `--build`.
- `--update-goldens --level=04-summit-ridge` only. Never `--record`.
- A greybox frame of chapter 4 comes from a checkout of origin/main (the scratch worktree above has one, with
  its `node_modules`); `$CLAUDE_JOB_DIR/tmp/ch4/shots.sh` takes the six frames from any checkout's root.

## 5. The close-out session (2026-11-13, later the same day)

Done in the commit that adds this section: section 2's step 1 (chapter 4's Linux goldens, from run 43525329870's
own frames on bd28a42, each within 3 px of darwin) and the three things not yet looked at. The respawn torii: the
posts hide nothing over the path, the painted wall hides the stone at the wall end of its sweep (OQ-084 item 5,
B-128, `docs/build-log/ch4-ink/respawn-torii-sheet.png`). The 5120x1440 frames: all six opened, every card drawn.
The CI run: one did appear for the head.

Steps 3 to 5 (green on this commit, the run id in the PR body, ready, the claim released on main) are not commits
on this branch, so this file cannot say COMPLETE: PR #46's line 12 and `state/CLAIMS.jsonl` on main say it. If
line 12 names a green run on the PR's head and the ledger shows CH4-INK released, nothing is left.
