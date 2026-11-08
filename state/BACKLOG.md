# Backlog — decided but not implemented

D-002 made `implemented_by:` mandatory on every decision. This file is the operational view of
that: closed decisions whose code does not exist yet. A decision here is **not** a suggestion — it
is agreed and pending. An agent may pick any item up; claim it first.

Verified against the repository on 2026-11-08, not taken from any report.

| # | item | decision | state | verified how |
|---|---|---|---|---|
| B-4 | `moves_allowed` per chapter + its linter check | Q5 | MISSING | — |
| B-5 | `ACCENT_CONTRAST` lint rule | D-001 | MISSING | — |
| B-6 | `ACCENT_AREA` band measured at the gameplay camera | D-003 | MISSING | — |
| B-9 | Respawn gated on a furthest-index counter | Q6 | MISSING | `src/main.ts` reassigns `respawn` for any checkpoint in radius |
| B-11 | `implemented_by:` lint rule for closed decisions | D-002 | MISSING | — |
| B-14 | Measure the 0.5u autostep ceiling, or make `measured` per-field in the MOVE table | RB-002 | MISSING | `MOVE.ground` is `measured: true` while `MEASUREMENTS.md` records its autostep as not measured directly |
| B-15 | Close or justify the 5 unenforced NOT-list rows — #20 (player-visible run metric) first | RB-002, Q7 | MISSING | `lint:not-list` reports `22 rows: 17 enforced, 0 pending, 5 unenforced` |
| B-16 | **Merge hazard.** Test-level loader must decode mesh assets before build, as `startLevel` does | — | MISSING | PR 3 `src/main.ts:209` awaits `preloadLevelAssets(data)` before the synchronous `install()`; `main` has no decode step at all, so any branch cut from `main` inherits the gap. Harmless while test levels use only boxes; breaks the first time one places a mesh asset |

**B-7 and B-8 landed** (see below). B-8 `HAZARD_AT_CHECKPOINT` is the precondition of PHASE_SWEEP's wait
arithmetic (an arrival waits at the torii), which is why it had to land before the sweep's numbers mean anything.

## Confirmed already done

| item | decision | evidence |
|---|---|---|
| `CHAPTER_LENGTH` linter code | Q4 | present in `tools/lint-level.mjs` (3 occurrences) |
| No `score` / `par_time` / `rank` fields | Q4 | absent from the schema; 17 `additionalProperties` guards |
| 15-25 min session target retired in place | Q4 | struck through with a `[SUPERSEDED — PHASE-0-DECISIONS Q4]` block; 5 supersede markers |
| `HAZARD_ON_PATH`, `FALL_DAMAGE`, `NO_FALL_PLANE`, `UNMEASURED_MOVE`, `NO_VIA` | playbook | all present in the linter |
| B-1 `speed`/`phase` on patrollers | Q2 | `19234ab`: required in schema (if/then) and lint errors `NO_SPEED`/`NO_PHASE`/`NO_PATROL_PATH`; probes rejected by both |
| B-2 fire/torch cut, water a flat wash | Q2c | `19234ab`: `fire` and `interactables` absent; water requires `y`, forbids period/path/speed/phase (OQ-008) |
| B-10 `lint:not-list` | Q7 | `1191a34` (in CI); `19234ab` closed all 9 known-open checks: 17 enforced, 0 pending, 5 unenforced |
| Q7 schema cut | Q7 | `19234ab`: enemies, interactables, collectibles, other goal types, damage, triggered, lighting direction |
| B-12 patroller runtime | Q6 | `6dcc157`: `patrollerAt()` in `src/loaders/level.ts`, a pure function of (path, speed, phase, t). Platforms moved onto the same clock (OQ-011). Probe: two runs with different death histories give identical patroller poses at the same tick, equal to an independent closed form |
| B-13 world clock runs during `death` | D-004 | `6dcc157`: `worldTick` in `src/main.ts`; `StateMachine.worldRunning()` = play or death. Death and respawn run in fixed ticks (OQ-010). Probe: +5.000 s over 300 ticks with 7 deaths; pause freezes ticks, clock and patroller |
| Hazard contact → death | Q6 part 1 | `6dcc157`: `LevelInstance.hazardHit()`; same `death` path as falling. Probe: a spike on spawn killed 7× in 300 ticks |
| B-7 `PHASE_SWEEP` | Q6 | `7fa2b70`: harness stage `phase-sweep` (tools/harness/sweep.ts). Every respawn point x 8 offsets of the longest timed loop; asserts some phase clears and every phase clears within 12 s counting the wait (chapter 0 exempt from the 12 s, OQ-014). Proven on throwaway levels: a crossing patroller fails 2/8 departures and costs 14.05 s; a blocking wall fails 0/8 |
| B-8 `HAZARD_AT_CHECKPOINT` | Q6, D-005 | `c640e4b`: spawn, every checkpoint and the goal vs every static volume, patrol sweep (each leg an AABB grown by the box's half-extents) and fall plane. 3D, phase-independent. ERROR when the 1.9 u capsule standing at the point is hit (respawn into a hazard); WARN when the volume only enters the activation disc (radius + 0.35). Each D-005 trap has a test case: box edge 0.2 u away with its polyline at 1.0 u errors; bottom 1.95 u up is clean, 1.85 u errors; 5 u overhead is clean; a path that merely ends on the torii errors. Its 5 mirrored constants are asserted against the running game by phase-sweep |
| B-3 landing mark | Q2b, D-007 | `bf19ded`: `?landingmark=on` / `TUNING.landingMark`, default off. Hard-edged ink-black disc straight under the capsule, radius shrinking with height, no new numbers. Off: goldens 0.000%, counters unchanged. On: 31 draw calls (ceiling 300), nav/replay identical. Ready for the H2.5 feel test; if depth is still unreadable, build a ballistic predictor, not a bigger dot |
