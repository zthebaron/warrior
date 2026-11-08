# PROMPT 00 — Bootstrap the control plane

**Run this as the first prompt of any Proofline build, in an empty repo, before any
product code.** Nothing here is specific to a game. It takes under an hour and it is the
difference between a build that can be audited and one that can only be remembered.

Why it exists: on the Warrior Day-0 spike, decisions lived in agent contexts, three prompts went
stale while still reading as live work, three sessions raced on the same task, and an agent
reported a gate green with four required files absent. Every one of those is a missing control
surface, not a bad agent. Each linter rule below maps to one of those specific failures.

---

## Build these, in this order

### 1. `state/DECISIONS.md` — append-only

Every architectural or scope call, with its reason and the commit that closed it. Append only;
never rewrite history. One entry per decision:

```
## D-007 — Assets are authored as code, not as .blend files
decided: 2026-11-08
closed_by: fcf673a
A .py asset is diffable, reviewable, deterministic, and a fan-out agent can author one.
A .blend is none of those. Hero assets needing real modelling stay binary, in LFS.
superseded_by: —
```

Rule for agents: **if a decision is not in this file, it has not been made.** A decision that
exists only in a session's context is one `kill` away from having to be made again, and the second
time nobody remembers why.

### 2. `state/GATES.md` — the project's own gate table

One row per gate, with status `open | passed | failed`, the evidence, and the commit. Gates come
from the project's plan; the file's job is to hold their *state*, which the plan cannot.

```
| gate | status | evidence | commit |
|------|--------|----------|--------|
| G-A pre-production | passed | 14/14 linter defect classes rejected | 272e385 |
| G-B art target locked | passed | palette.json + STYLE-BIBLE.md from locked seed | fcf673a |
| G-C asset pipeline | open | byte-identical rebuild proven; generic exporter outstanding | — |
```

### 3. `state/CLAIMS.jsonl` — claim before you work

One JSON object per line: `{"id":"P-12","agent":"kit","ts":"...","ttl_min":60}`. Append-only.
An agent claims a prompt id before starting. Expired claims are ignored, so a dead session cannot
block work forever.

### 4. `tools/claim.mjs` — the CLI for the above

- `node tools/claim.mjs take <prompt-id> --agent <name>` — appends a claim; **exits non-zero and
  prints the current holder** if an unexpired claim exists
- `node tools/claim.mjs release <prompt-id>`
- `node tools/claim.mjs list` — active claims only

### 5. `prompts/<id>.md` — prompts are build artifacts with a lifecycle

Required YAML front-matter:

```yaml
---
id: P-12
title: Asset pipeline proof
gate: G-C
status: open          # open | closed | superseded
closed_by:            # commit sha, required when status is closed
supersedes:           # prompt id, optional
reads:                # paths this prompt tells the agent to read
  - state/DECISIONS.md
  - MEASUREMENTS.md
produces:             # the acceptance manifest — exact paths that must exist when closed
  - tools/blender/export.py
  - tools/blender/lib.py
verify:               # commands that must exit 0 when closed
  - npm run assets:build
  - npm run lint:levels
---
```

`produces` and `verify` are the whole point. A prompt whose requirements are prose gets
interpreted; a prompt whose requirements are a path list and a command list cannot be.

### 6. `MEASUREMENTS.md` + `budgets.json`

`budgets.json` is the **only** place a budget constant may live. Every entry:

```json
{ "asset_triangles": { "value": 400, "unit": "tris", "measured": true,
  "method": "worst-case kit asset at 1u scale, measured 2026-11-08", "recorded_in": "MEASUREMENTS.md#asset-triangles" } }
```

`MEASUREMENTS.md` carries the prose: what was measured, how, what the first guess was and why it
was wrong. Guesses that turned out wrong are the most valuable lines in the file.

### 7. `FAILURES.md` — start it empty, keep it honest

Every caught error: what broke, what caught it, what it would have cost unchecked. Append during
the build, not after. This file is simultaneously the retrospective, the case study spine, and the
strongest sales artifact the build produces — because it is evidence of a control system rather
than a demo.

### 8. `tools/lint-prompts.mjs`

Each rule below is named after a failure that actually happened. Implement all six.

| code | rule | the failure it prevents |
|---|---|---|
| `PROMPT_FRONTMATTER` | front-matter missing or malformed | — |
| `DUPLICATE_ID` | two prompts share an `id` | — |
| `DANGLING_INPUT` | an **open** prompt's `reads:` names a path that does not exist | §P3.1 pointed agents at `levels/_schema.json`, a file that never existed, which would have made fan-out agents author their own schema |
| `STALE_OPEN` | a prompt whose `gate` is `passed` in GATES.md is still `status: open` | §H1.1 kept instructing agents to spend ~$40 generating a seed that was already locked |
| `UNCLOSED_OUTPUT` | a **closed** prompt's `produces:` names a path that does not exist, or a `verify:` command exits non-zero | an agent reported a gate green with four required files absent |
| `ORPHAN_CLOSED` | `status: closed` with no `closed_by` commit | — |

### 9. `tools/lint-measurements.mjs`

| code | rule |
|---|---|
| `UNMEASURED_BUDGET` | a `budgets.json` entry with `measured: false`, or missing `method` |
| `UNRECORDED_BUDGET` | a `budgets.json` key with no matching anchor in `MEASUREMENTS.md` |
| `BUDGET_OUTSIDE_LEDGER` | a numeric comparison in `tools/` or `src/` against a literal where a `budgets.json` key exists for that concept — warn, do not error |

### 10. `npm run state`

One command that prints the gate table, open prompts grouped by gate, and active claims. The
answer to "what is done, what is taken, what is next" must be one command, not a conversation.

### 11. CI

`lint:prompts` and `lint:measurements` run on every push, alongside typecheck. A document that no
test reads will drift — that is the finding this whole prompt exists to encode.

---

## Acceptance manifest

Report **RED** if any path is absent or any command exits non-zero. Do not report green on
partial completion; name what is missing instead.

Paths that must exist:

```
state/DECISIONS.md
state/GATES.md
state/CLAIMS.jsonl
prompts/README.md
MEASUREMENTS.md
budgets.json
FAILURES.md
tools/claim.mjs
tools/lint-prompts.mjs
tools/lint-measurements.mjs
```

Commands that must exit 0:

```
npm run state
npm run lint:prompts
npm run lint:measurements
node tools/claim.mjs take P-00 --agent bootstrap
node tools/claim.mjs list
node tools/claim.mjs release P-00
```

Commands that must exit **non-zero** (prove the linters bite — temporary fixtures, deleted after):

```
# a prompt with reads: a-path-that-does-not-exist      -> DANGLING_INPUT
# a prompt status: open whose gate is passed            -> STALE_OPEN
# a prompt status: closed with produces: a missing path -> UNCLOSED_OUTPUT
# a budgets.json entry with measured: false             -> UNMEASURED_BUDGET
# a second claim on a held id                           -> non-zero, prints holder
```

A linter that has never been shown to fail is not a linter. Prove each rule with a fixture, record
the proof, then remove the fixtures.

## Report

Write `BOOTSTRAP-PROOF.md`: each rule, the fixture that triggered it, the exact error output, and
a plain GREEN / AMBER / RED. Seed `FAILURES.md` with anything that broke during the bootstrap
itself. Commit in logical steps. Do not push.
