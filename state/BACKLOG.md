# Backlog — decided but not implemented

D-002 made `implemented_by:` mandatory on every decision. This file is the operational view of
that: closed decisions whose code does not exist yet. A decision here is **not** a suggestion — it
is agreed and pending. An agent may pick any item up; claim it first.

Verified against the repository on 2026-11-08, not taken from any report.

| # | item | decision | state | verified how |
|---|---|---|---|---|
| B-1 | `speed` / `phase` on patrollers, mandatory linter errors | Q2 | **MISSING** | 0 occurrences in `levels/level.schema.json` and `tools/lint-level.mjs` |
| B-2 | Cut `fire` hazard and `torch` interactable; `water` restricted to flat wash | Q2c | **MISSING** | all three enum values still present in the schema |
| B-3 | Landing mark behind a flag, default off | Q2b | **MISSING** | no match for landing-mark identifiers anywhere in `src/` |
| B-4 | `moves_allowed` per chapter + its linter check | Q5 | MISSING | — |
| B-5 | `ACCENT_CONTRAST` lint rule | D-001 | MISSING | — |
| B-6 | `ACCENT_AREA` band measured at the gameplay camera | D-003 | MISSING | — |
| B-7 | `PHASE_SWEEP` harness stage (8 phase offsets per segment) | Q6 | MISSING | no hazard-phase handling in `tools/harness/` |
| B-8 | `HAZARD_AT_CHECKPOINT` lint rule | Q6 | MISSING | — |
| B-9 | Respawn gated on a furthest-index counter | Q6 | MISSING | `src/main.ts` reassigns `respawn` for any checkpoint in radius |
| B-10 | `lint:not-list` (schema-field and src-identifier checks) | Q7 | MISSING | — |
| B-11 | `implemented_by:` lint rule for closed decisions | D-002 | MISSING | — |

**B-1 blocks B-7.** `PHASE_SWEEP` cannot sweep a phase the schema does not carry. Do B-1 first.

## Confirmed already done

| item | decision | evidence |
|---|---|---|
| `CHAPTER_LENGTH` linter code | Q4 | present in `tools/lint-level.mjs` (3 occurrences) |
| No `score` / `par_time` / `rank` fields | Q4 | absent from the schema; 17 `additionalProperties` guards |
| 15-25 min session target retired in place | Q4 | struck through with a `[SUPERSEDED — PHASE-0-DECISIONS Q4]` block; 5 supersede markers |
| `HAZARD_ON_PATH`, `FALL_DAMAGE`, `NO_FALL_PLANE`, `UNMEASURED_MOVE`, `NO_VIA` | playbook | all present in the linter |
