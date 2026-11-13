# HANDOFF-COURTYARD (written 2026-11-12 by session `courtyard`, for a fresh session with zero memory)

Written because this session's context passed 75 percent, as `00-start-here/PROMPT-COURTYARD.md` asks. **The build
is finished; what is left is the close-out in section 2.** If the session that wrote this finished it too, the
last line of this file says COMPLETE.

## 1. Where things stand

- Worktree `/Users/timdevallee/Code/warrior/.claude/worktrees/courtyard`, branch `courtyard`, no upstream: push
  with `git push origin HEAD:refs/heads/courtyard`. Cut from origin/main at a165120.
- **PR #41** https://github.com/zthebaron/warrior/pull/41, title as the brief gives it, opened as a draft.
- Claim `COURTYARD` held by agent `courtyard` on main (b3c12f3, 600 min from 2026-11-13T01:05Z).
- Commits, oldest first: 9711fa0 the rule and the gate with no level using them; dc85f2a the level, the three
  swordsmen and the look; 1c48278 the gate model and the suite; 61aff4d the far field and darwin goldens;
  the Linux goldens (CI run 43352065074's frames); dbe054d the records and nine frames; then the commit that
  adds this file (chapter 5's fight-line assertions in `check:teach`, three record corrections).
- Everything the brief asks for is built and recorded: D-026, OQ-079, MEASUREMENTS "D-026 ..." (4 sections),
  SPEC, BACKLOG B-97 to B-104, `docs/build-log/courtyard/`. fal: $0.5848 spent, ledger $15.1848.
- Local, on the final tree: all 14 per-level stages on `05-courtyard`, the five game stages, every static check,
  and `frame-hashes` against origin/main differing on `05-courtyard` alone (38 values, none of an older level).
- CI on Linux: run 43351607313 (1c48278) had `game`, `static` and the five older levels green and only
  `level (05-courtyard)` red, at `visual`, for want of Linux goldens. They are committed now.

## 2. What is left, in order

1. Wait for CI on the head of `courtyard` (`gh pr checks 41`). Green is **10 of 10**: static, matrix, six level
   jobs, game, playtest. If `level (05-courtyard)` is red at `visual`, compare the run's `camN.actual.png` with
   `tools/harness/golden/linux/05-courtyard/` before anything else; nothing visual changed after 61aff4d.
2. PR body: `$CLAUDE_JOB_DIR/tmp/courtyard/pr-body.md` (job bf6381cf; if gone, rebuild it from D-026 and
   OQ-079). Replace `CI_LINE` with "10 of 10 green on the head, <sha> (run <id>)" and `HEAD_SHA` with the full
   40-character sha, then `gh pr edit 41 --body-file <file>` and `gh pr ready 41`.
3. Release the claim from a detached origin/main in a separate worktree, never from `courtyard`:
   `git worktree add --detach .claude/worktrees/courtyard-claim origin/main`, enter it,
   `node tools/claim.mjs release COURTYARD --agent courtyard`, commit the ledger line alone,
   `git log --oneline origin/main..HEAD` must show exactly one commit, `git push origin HEAD:main`, remove the
   worktree. Each git command alone: the shell guard refuses compound commands that name git.
4. Report to Tim in at most 12 lines (the brief's last section says what it must hold).

## 3. Gotchas this task met

- `fal-call.mjs --max-total 18.60` with a space; the equals form is read as no ceiling (B-72).
- `npm run assets:build` rewrites `assets/dist`: build with `ASSETS_OUT=assets/build/dry`, `diff -rq` it, copy only
  the new file and `manifest.json`.
- `post` reads the dark edge of a dark form as a drawn line: keep the ink pass pale (OQ-079 items 8 and 9).
- A painted model may not stand in front of a torii (OQ-079 item 6).
- One playtest, frame or log at a time; never edit `src/` or `levels/` during one.

**COMPLETE (2026-11-12, the same session).** Section 2 is done: CI was 10 of 10 green on e77e5a5 (run 43353508649), PR 41 has its body and is ready for review, and the claim was released on main (0735cd1). Nothing is left but for the reviewer to merge. Not deployed.
