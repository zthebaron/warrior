# HANDOFF-CH3-INK (written 2026-11-13 by session `ch3-ink`, for a fresh session with zero memory)

Written because this session's context was near 75 percent, as `00-start-here/PROMPT-CH3-INK.md` asks. **The look,
the two checks, the darwin goldens and D-029 / OQ-083 / the backlog rows are built and pushed; what is left is the
close-out in section 2.** If the session that wrote this finished it too, the last line of this file says COMPLETE.

## 1. Where things stand

- Worktree `/Users/timdevallee/Code/warrior/.claude/worktrees/ch3-ink`, branch `ch3-ink`, no upstream: push with
  `git push origin HEAD:refs/heads/ch3-ink`. Cut from origin/main at 584a9d4. NEVER `HEAD:main` from here.
- **PR #45** https://github.com/zthebaron/warrior/pull/45, "CH3-INK: the drifting stones, painted", a DRAFT, with
  its body: the 12-line report (copy at `$CLAUDE_JOB_DIR/tmp/ch3/pr-body.md`, job bf6381cf; if gone, read it back
  with `gh pr view 45 --json body`).
- Claim `CH3-INK` held by agent `ch3-ink` on main (ea29a8e, 600 min from 2026-11-13T21:14Z).
- Commits, oldest first: 568fab4 the look; 8cf74d3 the stone's top and the stone check; 4b437bf the far peaks,
  the proportion check, darwin goldens, the ratchet; d27f7f6 D-029, OQ-083, backlog, this file; 3aaa9c7 the build
  log, MEASUREMENTS, the self-review (OQ-083 item 16); bb65ffb Linux goldens from CI run 43515130393.
- **Everything the brief asks for is built and recorded.** Local, darwin: the whole playtest PASS (every stage of
  every level, every game stage); typecheck, lint:levels, lint:not-list, lint:self, lint:decisions, lint:pack,
  assets:budget, check:teach, check:fight, check:physics PASS. `frame-hashes` vs origin/main: 24 chapter 3
  values plus B-115's chapter 1 cam3 pixel. CI on 4b437bf: every job green but chapter 3's `visual` (greybox
  Linux goldens), now replaced.
- **fal: $0.00 spent; the ledger stands at $15.1968.**

## 2. What is left, in order

1. **CI on bb65ffb** (or the head): `gh run list --branch ch3-ink --limit 3 --json databaseId,status,conclusion,headSha`.
   All 13 jobs must be green. If chapter 3's `visual` is still red on a camera, its Linux golden was not
   the head's frame: take that run's actuals the same way (HANDOFF-CH2-INK section 2 item 1).
2. In the PR body replace "CI: pending." with "CI: 13 of 13 green on <sha> (run <id>).", `gh pr edit 45
   --body-file <file>`, then `gh pr ready 45`. Every `post` check passed with no gate edited, so ready is allowed.
3. Release the claim from a detached origin/main in a scratch worktree under the job's tmp, never from `ch3-ink`:
   `git worktree add --detach <dir> origin/main` (after `git fetch origin`), in it `node tools/claim.mjs release
   CH3-INK --agent ch3-ink`, commit the ledger line alone, `git log --oneline origin/main..HEAD` must show exactly
   one commit, `git push origin HEAD:main`, remove the worktree. Each git command alone. Also remove the scratch
   checkout `$CLAUDE_JOB_DIR/tmp/main-wt` (`git worktree remove --force <it>`).
4. Report to Tim: the PR body's numbered list is the report. Do not deploy; the reviewer merges.

## 3. Gotchas this task met

- This session's shell guard refuses `git -C`, a `git worktree add` into the shared checkout, and any compound
  command it cannot verify (a heredoc with a redirect, several `&&` with git): a refused command runs NOTHING.
  Put edits in a script file and run it alone. A scratch worktree under the job's tmp directory is allowed.
- Nothing painted may move: `post` advances the world one tick between two frames and fails if a painted pixel
  over the sky changed. Anything that rides a platform must be ink-pass geometry.
- An apostrophe inside a single-quoted check title breaks the harness build; a broken build runs no check.
- After a mutation run the bundle is stale: the next `frame.ts` needs `--build`.
- `--update-goldens --level=03-drifting-stones` only. Never `--record`.
