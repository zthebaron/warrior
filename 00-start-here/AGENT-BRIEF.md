# AGENT BRIEF — read this first, every session

You are a build agent on **Karasu: Flight of the Exile**, a browser 3D traversal platformer. This
is the standing preamble. Before you touch anything, read [`SPEC.md`](SPEC.md) (what the game is),
[`STYLE-BIBLE.md`](STYLE-BIBLE.md) (what it looks like, which is LAW) and
[`PHASE-0-DECISIONS.md`](PHASE-0-DECISIONS.md) (why). When this brief conflicts with a decision
entry, the decision wins and this brief has a bug: file it, don't work around it.

Every rule below says **what enforces it**. *Unenforced* means only your attention stands behind
it. Treat those rules as the ones most likely to be broken, and the ones a reviewer checks first.

---

## 1. Working protocol

| rule | enforced by |
|---|---|
| **Never print a question and wait.** Decide, append the question, your options, your choice and your argument to `state/OPEN-QUESTIONS.md` as `PROVISIONAL`, and keep working. Stop only for a decision that is irreversible *and* could reasonably go either way: a destructive migration, a production deploy, money, or publishing externally. | unenforced |
| **Work only in your own worktree, never in the main checkout.** Before every commit, assert the branch: `git rev-parse --abbrev-ref HEAD`. | unenforced (failure 7) |
| **Push with `git push origin HEAD:main`, never `git push origin main`.** The bare ref silently pushes nothing from another branch. | unenforced (failure 7) |
| **"Done" means verified by a command whose output you quote.** Never self-assess. | unenforced (failure 4) |
| **Two failures of the same step means change the mechanism, not the wording.** | unenforced (failure 5) |
| When you resolve a merge conflict, re-read **every** line on both sides, not just the ones you recognise. | unenforced (failure 6) |
| A decision you implement gets its commit in that entry's `implemented_by:` field. | pending lint (D-002) |

## 2. Locked stack

Installed versions are pinned by `package-lock.json`. Do not upgrade, add or swap anything without
a decision entry.

| package | version | note |
|---|---|---|
| three / @types/three | **0.187.0 exact** | `postprocessing` supports three < 0.188.0. One minor version from breaking the look. |
| @dimforge/rapier3d-compat | 0.21.0 (lockfile) | `package.json` says `^0.21.0`, so only the lockfile pins it. Run `npm ci`, never `npm install <pkg>`. |
| vite · typescript · ajv | 8.3.6 · 7.0.2 · 8.20.0 | TS strict |
| @playwright/test · pixelmatch | 1.65.0 · 8.0.0 | harness; Chromium 158 headless, SwiftShader in CI |
| Node | 22.22.3 in CI | harness `.ts` runs under Node's type stripping: erasable syntax only |

Planned but **not installed yet**: `postprocessing` 6.39.6 and `three-mesh-bvh` 0.9.18. There is
no guard yet for three's peer range either.

Excluded outright: game-engine GUIs, asset stores, multiplayer, any backend (SPEC §7 row 17).

## 3. Budgets

| budget | limit | enforced by |
|---|---|---|
| nav bot time | ≤ **12 s × segments** (segments = checkpoints + 1) | harness `nav` |
| chapter length, ch 2+ | 5 ± 1 segments | lint `CHAPTER_LENGTH` |
| chapter 1 length | **not fixed** until the vertical slice measures the teach rate | lint warns `CHAPTER_LENGTH_PENDING` |
| level JSON | 120 KB | lint `SIZE` |
| level completable | bot reaches goal, waypoints in order, every declared move done | harness `nav` |
| console errors | 0 | harness |
| visual drift vs golden | < 2% | harness `visual` |
| draw calls · triangles | < 300 · < 500,000 | harness `counters` |
| respawn, death → control | ceiling 1.2 s, target ≤ 0.5 s | **pending** (Q6) |
| initial download (gzip) · all levels | 12 MB · 60 MB | build report |

Never put an unmeasured number in a budget. A frame time measured in CI is meaningless
(SwiftShader); hardware budgets are Tier 2 and not yours to assert.

## 4. Level-schema rules

Levels are data, not code. You write `levels/<id>.json` against `levels/level.schema.json`.

1. **`additionalProperties: false` throughout.** If the schema has no field for something, the
   game does not have it. Do not add the field. File a note.
2. **Every `critical_path` waypoint after spawn declares `via`**, one of the eight moves, and it
   must be the honest move: the linter checks each segment against that move's measured budget
   (SPEC §8). Lint codes: `NO_VIA`, `BAD_VIA`, `UNREACHABLE`, `UNMEASURED_MOVE`, `TIGHT` (warn).
3. **`via: platform` names its platform** by id (`BAD_PLATFORM_REF`).
4. **The path starts at spawn and ends in the goal radius** (`PATH_START`, `PATH_END`). No hazard
   sits on a waypoint (`HAZARD_ON_PATH`, static only: moving-hazard collisions are the bot's job).
5. **Every level has a fall plane** (`NO_FALL_PLANE` warns).
6. **One level file = one chapter.** Use only the moves your chapter has unlocked (SPEC §5).
   *Pending:* the `moves_allowed` field and its check. Until they land, the SPEC §5 table is the
   rule.
7. **No `par_time`, `score` or `rank`.** The schema rejects them. That absence is the no-score rule.
8. **Colliders are `trimesh`.** `box` is gone from the enum because the capsule sinks through it.
9. **Asset names are `lower_snake_case`** (`assetRef` pattern) and must exist in
   `assets/dist/manifest.json` (`UNKNOWN_ASSET`).
10. **Every platform attaches to the cliff mass.** Nothing floats in open space (Q2b, unenforced).
11. **`tools/example-level.json` is the template.** It is an honest chapter-3 level: 5 segments,
    chapter-3 moves only, a patroller hazard with `path`/`speed`/`phase`, and nothing from the NOT
    list. Agents copy examples more faithfully than they follow rules (Q7), so a change to the
    example is a change to the spec.

Verify before reporting done:
`npm run lint:levels && npm run lint:not-list && npm run playtest -- --level=<id>`

## 5. Lane isolation

| lane | owns | never |
|---|---|---|
| BUILDER (Claude Code) | engine code, level JSON, assets | approves its own work at a gate. It *does* land on main directly (`git push origin HEAD:main`, green checks quoted), and the reviewer confirms or overrides by commit under the OPEN-QUESTIONS protocol. |
| VERIFIER (Codex) | cold re-runs, diff review, budget audit | writes feature code |
| REVIEWER (Claude chat) | art direction, scope, gate calls, decisions | touches the repo |
| APPROVER (Tim) | gate clearance, deploy, publish | — |

**Layers depend downward only:** content → gameplay → engine → platform. A level agent writes
content: its own `levels/<id>.json`, its concept files, assets built through the pipeline.

| rule | enforced by |
|---|---|
| A level agent touches only its own files | **unenforced**: the pre-commit path check is not built |
| `src/engine/` and `src/systems/` belong to the approver | **unenforced**: there is no `CODEOWNERS` file |
| No import from `src/engine/**` into `src/entities/**` or `levels/**` | **unenforced**: no import-direction lint |
| Content cannot invent engine concepts | schema `additionalProperties: false` + `lint-level` |
| Fan-out only after Gate C2 (pipeline proven) | process |

The playbook lists the first three as mechanical. In this repo they are not yet, so that wall is
currently held up by you. **If you believe you need engine work, stop that task, file a note in
`state/OPEN-QUESTIONS.md`, and take other work.** Do not improvise around the seam.

## 6. Never

The game-design refusals are the **NOT list in SPEC §7**. That table is machine-checked by
`npm run lint:not-list` and is not repeated here, so it can't drift. In short: no combat, no
pursuit, no ninth move, no pickups, no puzzles or interactables, no win but arriving, no score,
no health/lives/damage, no saves or unlocks, no directional light, no multiplayer.

The process refusals:

| never | enforced by |
|---|---|
| Add a schema field, move, hazard type or lint exemption to make your level work | schema · `lint-level` · CODEOWNERS (*missing*) |
| Change `TUNING`, `GAME_RULES`, `CAMERA_TUNING` or the `MOVE` table. They are frozen at Gate C and must change together. | unenforced |
| Mark a move `measured: true` without a gym measurement | `UNMEASURED_MOVE` checks the flag, not the measurement |
| Weaken a test, golden, budget or tolerance to turn a run green | unenforced. Reviewers diff `tools/harness/` first. |
| Re-record goldens or traces to hide a regression | unenforced |
| Treat a CI frame time as a measurement | unenforced |
| Put any colour off the palette ramp, or the accent anywhere but a torii | pending (`ACCENT_CONTRAST`, `ACCENT_AREA`) |
| Make anything translate except the player and hazards | unenforced (SPEC §7 row 18) |
| Generate a new seed video or re-derive the palette | the seed is locked (Gate B). Prompts that say otherwise are superseded. |
| Act on a prompt or doc section marked SUPERSEDED or CLOSED | unenforced |
| Commit secrets, or `.env` | `.gitignore` |
| Deploy, publish or spend money | APPROVER only |
