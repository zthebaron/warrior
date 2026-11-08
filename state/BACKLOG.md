# Backlog — decided but not implemented

D-002 made `implemented_by:` mandatory on every decision. This file is the operational view of
that: closed decisions whose code does not exist yet. A decision here is **not** a suggestion — it
is agreed and pending. An agent may pick any item up; claim it first.

Verified against the repository on 2026-11-08, not taken from any report.

| # | item | decision | state | verified how |
|---|---|---|---|---|
| B-11 | `implemented_by:` lint rule for closed decisions | D-002 | MISSING | — |
| B-14 | Measure the 0.5u autostep ceiling, or make `measured` per-field in the MOVE table | RB-002 | MISSING | `MOVE.ground` is `measured: true` while `MEASUREMENTS.md` records its autostep as not measured directly |
| B-15 | Close or justify the 5 unenforced NOT-list rows — #20 (player-visible run metric) first | RB-002, Q7 | MISSING | `lint:not-list` reports `22 rows: 17 enforced, 0 pending, 5 unenforced` |
| B-17 | Per-segment death counts in the harness (the teach-rate measurement) | Q6 part 6 | MISSING | only a total `deaths` counter exists (`src/main.ts`); nav fails on the first death, so the expert bot always reports 0. CHAPTER-1 used PHASE_SWEEP blind departures as a labelled proxy (OQ-036) |

**B-7 and B-8 landed** (see below). B-8 `HAZARD_AT_CHECKPOINT` is the precondition of PHASE_SWEEP's wait
arithmetic (an arrival waits at the torii), which is why it had to land before the sweep's numbers mean anything.

## Confirmed already done

| item | decision | evidence |
|---|---|---|
| `CHAPTER_LENGTH` linter code | Q4 | present in `tools/lint-level.mjs` (3 occurrences) |
| No `score` / `par_time` / `rank` fields | Q4 | absent from the schema; 17 `additionalProperties` guards |
| 15-25 min session target retired in place | Q4 | struck through with a `[SUPERSEDED — PHASE-0-DECISIONS Q4]` block; 5 supersede markers |
| `HAZARD_ON_PATH`, `FALL_DAMAGE`, `NO_FALL_PLANE`, `UNMEASURED_MOVE`, `NO_VIA` | playbook | all present in the linter |
| B-16 test-level loader decodes mesh assets | — | `7f63d8d`: `buildLevel`/`install` take only a `PreparedLevel`, made only by `await prepareLevel(data)` (decodes the meshes); skipping it is a typecheck error (TS2345, proven). Harness `startJson` for `tools/harness/fixtures/`; assets stage loads `fixtures/mesh-asset.json` on a COLD page: kit_torii on screen (accent 5.514%); a cast past the gate fails with "not decoded" |
| B-6 `ACCENT_AREA` — floor at scanning distance | D-003, D-006 | `29b41c0`: harness `accent` stage: each torii scanned from the previous anchor, only its own pixels counted, floor 0.0204% (measured: last distance its largest blob beats the seed red's 27.6 px failure). Gym 0.0603% / 0.1033%; floor 0.08% fails. Swatches vs the ramp for H2.5 |
| B-5 `ACCENT_CONTRAST` lint rule | D-001 | `e8b0f8b`: `tools/assets/accent.mjs`, `npm run lint:accent` (CI; also in `assets:build` and `assets:budget`). dE2000 >= 2x ramp step, C* >= 3x palette max chroma, L* >= wash-mid, all derived from palette.json; 3 candidates pass, `#603633` must fail |
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
| B-9 respawn at furthest torii | Q6 part 3 | `b5a1939`: assignment gated on max(checkpointLog), no new state. Probe: walk past torii at x=3 and x=6, back through x=3, die -> respawn x=6.00; with the gate removed -> x=3.00 (bug reproduced) |
| D-008 hazard kill volumes | D-008, OQ-016 | `6a88496`: audit of all hazard types. Schema accepts exactly each type's effective form, lint `NO_KILL_VOLUME` mirrors it, water planes kill like fall, kill plane = highest plane, `period` removed (OQ-032). Runtime-proven: a water plane at y=-1 killed at -1.04 |
| B-4 `moves_allowed` | Q5 | `cf642c7`: required schema field; lint `MOVES_ALLOWED` (declared set must equal the chapter's, cannot be widened) and `CHAPTER_MOVE` (every via unlocked, checked against the canonical set, so declaring all eight does not dodge it). gym, example and B-16 fixture declare theirs |
| Crow cue (chapter 1) | Q2, Q2a, Q5 | `f24a9ac`: `crow` block on a patroller (schema, patroller-only), pure in the patroller's loop fraction (`crowAt`, `loopFraction` shared with `patrollerAt`), ink-black, never pickable or lethal. Waypoint `cue` = wait at a torii for lift-off. Lint BAD_CUE, CUE_NOT_AT_TORII, NO_CROW_CUE. The bot holds for the perched -> airborne edge. Proven: chapter 1 crow segments clear 8/8 arrival phases reading the crow, against 4/8 and 6/8 blind; a quarter-loop mistimed lift fails 0/8 |
