# GYM MEASUREMENTS — the single source of truth for movement

Measured 2026-11-07 by replaying recorded input frames through the real game code,
stepping one physics tick at a time. SPEC.md absorbs this section when Phase 0 runs.

Any change to these numbers must be made in BOTH places or the linter and the physics
disagree, and levels will lint clean while being unplayable:
  - `TUNING` in src/entities/player.ts
  - `MOVE` in tools/lint-level.mjs

## Measured

| Move | Run speed | Sprint speed | Max rise (speed-independent) |
|---|---|---|---|
| Single jump | clears 5.0, fails 6.0 | clears 7.5, fails 8.0 | 2.34 |
| Double jump | clears 9.5, fails 10.0 | clears 14.0, fails 15.0 | 4.12 |
| Flight distance, flat | 4.90 / 9.22 | 7.00 / 13.17 | — |

Gaps clear ~1.5u further than raw flight distance: coyote time adds ~0.12s of travel and
the capsule overhangs both edges. One jump left from 0.98u past the edge.

Variable jump height confirmed: tapped jump peaks at +0.995 vs +2.34 held.

## MOVE table basis — RUN speed, not sprint

The linter is a safety check. A false fail costs an agent a note and five minutes; a false
pass ships a level nobody can finish and surfaces as a mystery bot failure in Phase 8.
Sprint requires 0.6s of continuous ground running, which the linter cannot see from a
waypoint list, so budgeting at sprint speed would let unreachable levels pass.

Limits are set AT the measured run-speed clear, not below it. The margin comes from the
TIGHT warning at 90%, which flags anything near the edge for human review.

    jump      maxH 5.0   maxRise 2.3
    double    maxH 9.5   maxRise 4.1
    ground    slope 50deg, autostep 0.5     (slope matches Rapier maxSlopeClimbAngle)
    platform  unbounded                      (carried)

## Unmeasured — BLOCKED by the linter

dash, dashjump, wall, climb exist in code but have never been exercised. Their budgets
were guesses. The linter now errors with UNMEASURED_MOVE on any level using them, rather
than passing them against a fabricated number.

To unblock one: measure it in the gym, write the numbers here, set `measured: true` in
MOVE, and re-run the gym lint.

## Open

- Box colliders + enableSnapToGround(0.5) let the capsule sink ~0.7u over 2s. Trimesh
  holds. check:physics only ever tested trimesh. All gym primitives switched to trimesh.
  The schema still permits "collider":"box" — H4 must not emit box colliders for walkable
  surfaces until check:physics covers them.
- Landing slowdown: 0.23u moved over 4 ticks where 0.47u was expected. Check in feel test.
