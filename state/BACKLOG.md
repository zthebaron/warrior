# Backlog — decided but not implemented

D-002 made `implemented_by:` mandatory on every decision. This file is the operational view of
that: closed decisions whose code does not exist yet. A decision here is **not** a suggestion — it
is agreed and pending. An agent may pick any item up; claim it first.

Verified against the repository on 2026-11-08, not taken from any report.

| # | item | decision | state | verified how |
|---|---|---|---|---|
| B-3 | Landing mark behind a flag, default off | Q2b | **MISSING** | no match for landing-mark identifiers anywhere in `src/` |
| B-4 | `moves_allowed` per chapter + its linter check | Q5 | MISSING | — |
| B-5 | `ACCENT_CONTRAST` lint rule | D-001 | **IN PR 3**, not on main | `dc84f02` on `h4-asset-kit`: `npm run lint:accent`, CI step; lands when PR 3 merges |
| B-6 | `ACCENT_AREA` band measured at the gameplay camera | D-003 | **IN PR 3**, not on main | `a61019a` on `h4-asset-kit`: harness `accent` stage; lands when PR 3 merges |
| B-7 | `PHASE_SWEEP` harness stage (8 phase offsets per segment) | Q6 | MISSING | no hazard-phase handling in `tools/harness/` |
| B-8 | `HAZARD_AT_CHECKPOINT` lint rule | Q6 | MISSING | — |
| B-9 | Respawn gated on a furthest-index counter | Q6 | MISSING | `src/main.ts` reassigns `respawn` for any checkpoint in radius |
| B-11 | `implemented_by:` lint rule for closed decisions | D-002 | MISSING | — |

**B-7 is unblocked:** B-1 landed, so the schema now carries `phase` and `speed`, and B-12 gives the patroller a
runtime (`src/systems/patrol.ts`): position is `patrolPosition(def, t)`, a pure function, so PHASE_SWEEP can choose
arrival phases by choosing `t` instead of simulating. B-13 makes the game actually deliver varied arrival phases.

## Confirmed already done

| item | decision | evidence |
|---|---|---|
| `CHAPTER_LENGTH` linter code | Q4 | present in `tools/lint-level.mjs` (3 occurrences) |
| No `score` / `par_time` / `rank` fields | Q4 | absent from the schema; 17 `additionalProperties` guards |
| 15-25 min session target retired in place | Q4 | struck through with a `[SUPERSEDED — PHASE-0-DECISIONS Q4]` block; 5 supersede markers |
| `HAZARD_ON_PATH`, `FALL_DAMAGE`, `NO_FALL_PLANE`, `UNMEASURED_MOVE`, `NO_VIA` | playbook | all present in the linter |
| B-12 patroller runtime, pure function of `phase + t·speed` | Q6 | `de76147` (branch `b12-b13-world-clock-patroller`): `src/systems/patrol.ts`; `npm run check:patrol` 51 properties (CI); harness `hazards` stage: browser == Node to 0 over 24 samples, touch = death; `size` mandatory (`NO_PATROL_SIZE`) |
| B-13 world clock runs in `death`, stops in `pause` | D-004 | `7e57746`: `state.worldRunning()` drives the fixed loop; chaos asserts +0.8000 s across all 5 gym deaths; `hazards` asserts a new phase at respawn and a frozen clock in pause; a frozen-clock mutation fails both |
| B-1 `speed`/`phase` on patrollers | Q2 | `19234ab`: required in schema (if/then) and lint errors `NO_SPEED`/`NO_PHASE`/`NO_PATROL_PATH`; probes rejected by both |
| B-2 fire/torch cut, water a flat wash | Q2c | `19234ab`: `fire` and `interactables` absent; water requires `y`, forbids period/path/speed/phase (OQ-008) |
| B-10 `lint:not-list` | Q7 | `1191a34` (in CI); `19234ab` closed all 9 known-open checks: 17 enforced, 0 pending, 5 unenforced |
| Q7 schema cut | Q7 | `19234ab`: enemies, interactables, collectibles, other goal types, damage, triggered, lighting direction |
