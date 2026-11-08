# Day 0 Retrospective — what to build first, next time

Written 2026-11-08, after the Day-0 spike. Audience: the next build, and the case study.

## Thesis

**We started with a plan document. We should have started with a control plane.**

`AI-GAME-BUILD-PLAYBOOK-v2.1.md` and the prompt pack describe *work to do*. Neither holds
*state*. Every cost overrun on Day 0 reduces to that one gap: what was decided, what was claimed,
and what was proven all lived in agent contexts and in prose, instead of in files under test.

## The corollary worth keeping

**Anything an agent reads as an instruction must be under CI.**

Two documents in the same repo, on the same day, opposite outcomes:

| document | read by a test? | drifted? |
|---|---|---|
| MOVE table in `MEASUREMENTS.md` | yes — `lint-level.mjs` | never |
| `AI-GAME-BUILD-PROMPT-PACK-v2.1.md` | no | three times |

That is the whole finding. The MOVE table could not drift because the linter consumed it. The
prompt pack drifted because nothing did. `STYLE-BIBLE.md` is prose today and is already in tension
(the §9 shadow conflict). Express what is expressible as assertions and the argument ends.

Style rules that should be tests, not prose:
- every colour in a shipped asset is a member of `palette.json`
- vermilion pixels <= 1% of frame, and appear only on torii meshes
- nothing translates in a frame except the player and hazards
- near band (0-25u) has outlines, far band (80u+) does not

## What actually went wrong on Day 0

Ordered by cost, not by severity.

1. **Decisions had no home.** Q1 and Q2 were settled for an hour and existed only inside one
   process, which was then killed. Recovered only because they happened to be in review.
2. **Prompts rotted and still read as live work.** §H1.1 instructed agents to spend ~$40
   generating a seed that was already locked. §P3.1 and §P8.1 pointed at `levels/_schema.json`,
   a file that never existed — it would have made fan-out agents author their own schema with no
   move annotations. The playbook's 15-25 minute session figure contradicted the measured plan.
3. **Fan-out had no claim mechanism.** Nine worktrees, three racing on H4, two independently
   writing the same §H1.1 close-out. Nobody was wrong; nobody knew what was taken.
4. **"Done" was self-assessed.** PR #2 reported green while `assets/manifest.schema.json`,
   `tools/blender/export.py`, `tools/blender/lib.py` and `tools/assets/budget.mjs` were all
   absent, `MEASUREMENTS.md` was untouched, and the stated KTX2/SwiftShader risk was stepped
   around rather than resolved.
5. **Failing mechanisms were retried with better instructions.** Three failed zip downloads before
   switching to a connected folder. Two failed prompt handoffs before running it directly. exFAT
   before moving to the internal disk. Two failures of the same step is the signal to change the
   mechanism, not the wording.
6. **Conflict resolution lost a line nobody was watching.** Merging main into the H4 branch kept
   `.claude/` and `/assets/build/` and silently dropped `.env`, `.env.*` and `!.env.example`.
   Keeping "both sides" by naming the rules you recognise loses what you did not know to look for.

## The bootstrap that should be prompt #1

Before any engine, level or asset work. All of it is cheap and all of it pays back inside a day.

```
state/
  DECISIONS.md        append-only; every call with its reason and closing commit
  GATES.md            each gate: open|passed|failed, the evidence, the commit
  CLAIMS.jsonl        an agent appends a claim before starting work; stale claims expire
prompts/
  <id>.md             front-matter: status: open|closed, closed_by: <sha>, supersedes: <id>
FAILURES.md           what broke, what caught it, what it would have cost unchecked
tools/
  lint-prompts.mjs    fails CI when an open prompt references a nonexistent path,
                      when a closed gate still has open prompts, or when a prompt
                      names a file the repo does not have
  lint-measurements.mjs  fails CI when a budget constant in tools/ has no entry in
                      MEASUREMENTS.md
```

`lint-prompts.mjs` alone would have caught all three stale instructions on the commit that made
them stale.

## Prompt-writing changes

1. **End every build prompt with an acceptance manifest, not prose.** Exact paths, exact npm
   scripts, exact assertions, and an explicit instruction to report RED if any path is absent.
   Prose requirements get interpreted; a path list cannot be. This alone makes PR #2's green
   report impossible.
2. **Turn every "record it with discipline" into a lint rule.** A request is not a gate.
3. **Give prompts an identity and a status.** A prompt is a build artifact with a lifecycle, not
   a message.
4. **Claim before dispatch.** One line in `CLAIMS.jsonl` prevents the three-way H4 race.
5. **Check session state before sending.** The H4 prompt went to busy sessions twice before it
   ran. Trivially automatable.
6. **Never hand a prompt to a human to relay.** Put it in the repo and point the agent at the
   path. Avoids TUI paste mangling, gives the prompt a commit history, and means the next agent
   gets the instruction rather than a reconstruction of it.

## For the case study

The sellable claim is not "AI built a game fast." That is a commodity claim and no technical buyer
believes it. The differentiated claim is **the build caught itself**, with receipts:

- 14 of 14 semantic defect classes rejected by the level linter; 8 of 9 structural attacks rejected
  by the schema
- frame time asserted in CI was wrong (SwiftShader makes it meaningless) and was split into
  Tier-1 CI-enforceable and Tier-2 hardware-only
- three stale prompts found by searching for the *absence* of the new pattern, not the presence of
  the old
- an agent report of green with four specified files missing, caught by listing paths
- a merge resolution that silently dropped a secrets-protection rule
- two independent implementations of the same pipeline, turned into a cross-check by comparing
  published sha256 values rather than discarded as waste

Keep `FAILURES.md` from commit one. It is simultaneously the case study's spine and the strongest
sales asset the agency has, because it is evidence of a control system rather than a demo.

And because prompts-as-files makes the build replayable, the final artifact can be: the repo, the
ordered prompt list, and the commit each prompt produced. That is a much stronger showcase than a
video, and it costs nothing if done from the start.

---

## Addendum: failure 7, found while writing this file

**The main checkout is an unclaimed shared resource, and the control plane above does not protect
it.**

What happened: the interview agent created `phase0-q4-amendments` in the main worktree and switched
to it, to implement the Q4 amendments. Two later review commits — PROMPT 00 and the Q5/D-001
ruling — were then made from that same directory and landed on *that* branch. `git push origin main`
was run after each and **returned exit 0 both times**, because `main` genuinely had nothing to
push. The commits were reported to the user as pushed. They were not. Nothing was lost, but the
state was asserted without being verified, which is the failure this whole document is about.

Two fixes, in order of cheapness:

1. **Never `git push origin main`. Always `git push origin HEAD:main`.** `main` names a ref
   regardless of where you are standing, so it silently no-ops when you are on another branch.
   `HEAD:main` pushes what you actually committed, and fails loudly when that is not a
   fast-forward. One character of discipline, and it converts a silent wrong answer into an error.
2. **`CLAIMS.jsonl` claims prompts; nothing claims the checkout.** Add to PROMPT 00: agents work
   only in their own worktree and never in the main checkout, and any commit step asserts the
   expected branch (`git rev-parse --abbrev-ref HEAD`) before committing. A shared mutable cwd
   between two actors is the same class of problem as the three-way H4 race, one level down.

Worth noting what caught it: not the linters, not CI, and not a failing command. It was reading
`git log main` for an unrelated reason and noticing two commits missing. That is luck, and luck is
not a control. Rule 1 above is what turns it into one.
