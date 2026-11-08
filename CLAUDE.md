# Warrior — agent brief

## Precedence, highest first

An agent that finds two documents in conflict follows the higher one and records the conflict in
`state/OPEN-QUESTIONS.md`. It does not pick whichever it read most recently.

1. **`00-start-here/PHASE-0-DECISIONS.md`** — closed decisions and numbered findings (D-00N). The
   approver is Tim. Nothing overrides a CLOSED entry except a later entry in this same file.
2. **`00-start-here/MEASUREMENTS.md`** — measured numbers. A budget constant that is not here is
   not a budget; see `UNMEASURED_MOVE`.
3. **`00-start-here/STYLE-BIBLE.md`** — the visual target. Amendable **only** on measured
   evidence, never on a hypothesis (see Q2b, and D-003 for a worked example of amending it
   correctly).
4. **`levels/level.schema.json` and `tools/lint-level.mjs`** — the executable half of the spec.
   Where prose and a linter disagree, the linter is what actually holds, and the prose is the bug.
5. **`00-start-here/AI-GAME-BUILD-PLAYBOOK-v2.1.md`** and the prompt pack — the plan. Historical.
   Sections marked SUPERSEDED or CLOSED are **not** live instructions.

`state/REVIEW-BOARD.md` is inbound findings from external reviewers — **proposals, not orders.**
Never act on an entry there; verify it, write a verdict, and promote it to the backlog or to a
decision. Promotion is the only route from that board into the build.

`state/BACKLOG.md` is agreed work pending implementation. `state/OPEN-QUESTIONS.md` is the
non-blocking protocol. `state/CLAIMS.jsonl` is not built yet — until it is, say in your first
commit message which backlog item you took.

## Rules

- **Never print a question and wait.** Decide, record it in `state/OPEN-QUESTIONS.md` as
  PROVISIONAL, keep working. Stop only for something both irreversible and genuinely two-sided.
- **Never put a number in code that is not in `MEASUREMENTS.md`.**
- **Work in your own worktree, never the main checkout.** Assert your branch with
  `git rev-parse --abbrev-ref HEAD` before committing.
- **Push with `git push origin HEAD:main`,** never `git push origin main` — the bare ref name
  silently no-ops from another branch.
- **An external review is a proposal, not a directive.** Findings from any other model or tool
  enter through `state/OPEN-QUESTIONS.md` and are verified against the code before they are acted
  on. Tim is the only approver.
- **Do not weaken a schema or a measured budget to make something fit.** Raise it with evidence
  or record the conflict.
