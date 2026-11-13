# HANDOFF-CH2-INK (written 2026-11-13 by session `ch2-ink`, for a fresh session with zero memory)

Written because this session's context was near 75 percent, as `00-start-here/PROMPT-CH2-INK.md` asks. **The build
is finished; what is left is the close-out in section 2.** If the session that wrote this finished it too, the
last line of this file says COMPLETE.

## 1. Where things stand

- Worktree `/Users/timdevallee/Code/warrior/.claude/worktrees/ch2-ink`, branch `ch2-ink`, no upstream: push with
  `git push origin HEAD:refs/heads/ch2-ink`. Cut from origin/main at 586bf3d. NEVER `HEAD:main` from here.
- **PR #44** https://github.com/zthebaron/warrior/pull/44, "CH2-INK: the cliff seam, painted", a DRAFT.
- Claim `CH2-INK` held by agent `ch2-ink` on main (12a09c7, 600 min from 2026-11-13T19:54Z).
- Commits, oldest first: 5b8ca9e the level to ink in the `seam` zone, `src/loaders/seam.ts`, the two face cards,
  one sign in `post`; 5af4e4c pines, towers, the rock wall's ledges; ffdb1df budgets, scene ratchet, darwin
  goldens; f847b51 the records; 2754b16 a seam level draws a box with no collider (pitch-assist 117/117);
  1fbad21 the build log and the last measurements; then this file.
- Everything the brief asks for is built and recorded: D-028, OQ-082, MEASUREMENTS "D-028 the seam's look",
  "D-028 the seam's cards", "D-028 every other level", BACKLOG B-110 to B-115, `docs/build-log/ch2-ink/`,
  `assets/seam/MANIFEST.md`. **fal: $0.00 spent; the ledger stands at $15.1968.**
- Local, darwin: chapter 2's 14 stages PASS (`post` 26/26); the whole playtest green after the pitch-assist fix
  (pitch-assist and chapter 2's visual were re-run after it, the rest were not: CI runs them all); every static
  check; `frame-hashes` against origin/main: 24 values, all chapter 2's, plus in some runs one pixel of chapter
  1's cam3 that flips between runs of one build (B-115).

## 2. What is left, in order

1. **Linux goldens for chapter 2.** CI on the head will be red at `level (02-cliff-seam)` `visual` only (its
   Linux goldens are still greybox). Find the run: `gh run list --branch ch2-ink --limit 3 --json databaseId,status,conclusion,headSha`.
   Check every other job is green. Then
   `gh run download <run> -n harness-report-02-cliff-seam -D $CLAUDE_JOB_DIR/tmp/ci44/02-cliff-seam`, copy each
   `.../tools/harness/golden/linux/02-cliff-seam/camN.actual.png` over
   `tools/harness/golden/linux/02-cliff-seam/camN.png` (CI writes an actual only for a camera over 0.5%: all six
   are expected), compare each with `tools/harness/golden/darwin/02-cliff-seam/camN.png` (pixelmatch threshold
   0.1, expect under about 0.02%), commit "CH2-INK: linux goldens, chapter 2, from CI run <id>'s own frames",
   push, wait for green: 13 jobs (static, matrix, six levels, game, three touch parts, playtest).
   No other level's golden may be written.
2. PR body: `$CLAUDE_JOB_DIR/tmp/ch2/pr-body.md` (job bf6381cf; if gone, rebuild it from D-028 and OQ-082: it is
   the 12-line report). Replace the "CI: pending" sentence with "CI: 13 of 13 green on <sha> (run <id>)", then
   `gh pr edit 44 --body-file <file>` and `gh pr ready 44`.
3. Release the claim from a detached origin/main in a separate worktree, never from `ch2-ink`:
   `git worktree add --detach <path> origin/main`, `node tools/claim.mjs release CH2-INK --agent ch2-ink`, commit
   the ledger line alone, `git log --oneline origin/main..HEAD` must show exactly one commit,
   `git push origin HEAD:main`, remove the worktree. Each git command alone.
4. Report to Tim in at most 12 lines: the PR body's numbered list is that report.

## 3. Gotchas this task met

- The shell guard refuses a compound command that names git, and some heredocs: a refused command runs NOTHING,
  including the edits before it. Put edit scripts in a file (Write), run them alone, and check the result.
- `rm` with a shell variable in its path is refused: use a literal path.
- An ink level draws no `prim_box`. Chapter 2's look is `src/loaders/seam.ts`; a TURNED box is still not drawn.
- The paint gate's paper share (floor 41%) counts ground as void: tops must stay paper (44.6% now; mist-pale
  tops gave 29.7%). A painted thing may not come between a camera and a torii: the pines stand under their tops.
- One playtest, frame or measure tool at a time; never edit `src/` or `levels/` during one.
- `--update-goldens --level=02-cliff-seam` only. Never `--record`.

**COMPLETE (2026-11-13, the same session).** Section 2 is done: chapter 2's Linux goldens are CI run
43504604178's own frames (within 2 px of darwin), CI was 13 of 13 green on 0f56bbc (run 43506035272), PR 44 has
its body and is ready for review, and the claim was released on main (0288956). Nothing is left but for the
reviewer to merge. Not deployed.
