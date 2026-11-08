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
Sprint is explicit input (Shift). The linter reads waypoints, not input, so it cannot know
whether a given approach was sprinted — budgeting at sprint speed would let levels pass
that are only clearable with a sprint the geometry may not permit.

The same logic forces a second, sharper correction: max rise is only reachable from a
standing jump directly against the ledge face. From a running approach, double reaches 3.5
not 4.0. The linter cannot see the approach, so rise budgets use the RUNNING values.

Limits are set AT the measured run-speed clear, not below it. The margin comes from the
TIGHT warning at 90%, which flags anything near the edge for human review.

    ground    slope 50deg, autostep 0.5     (slope matches Rapier maxSlopeClimbAngle)
    jump      maxH  5.0   maxRise 2.00
    double    maxH  9.5   maxRise 3.50   (running approach, not standing-adjacent 4.0)
    dash      maxH  4.0   maxRise 0.50   (rise is just autostep height)
    dashjump  maxH 10.0   maxRise 2.75
    wall      maxH  4.2   maxRise 4.00
    climb     maxH  7.0   maxRise 4.50
    platform  unbounded                  (carried)

All 8 moves measured 2026-11-07 on the post-groundStick-fix build. Measured clears:
dash 4.0/0.5 · dashjump 10.0/2.75 · wall 4.27 from start, ledge 4.0 · climb 7.0/4.5.

How wrong the original guesses were, and why UNMEASURED_MOVE earned its place:
  dash      guessed 7.0 horizontal, actual 4.0   — 75% too generous
  wall      guessed 6.2 rise,       actual 4.0   — 55% too generous
  dashjump  guessed 12.6,           actual 10.0  — 26% too generous
  climb     guessed 1.5,            actual 7.0   — far too conservative
A level using `via: dash` across a 6-unit gap would have linted clean and been unplayable.

WALL CHAINING: a wall jump restores the double jump. The wall budget assumes NO double
afterwards. A designer wanting wall-then-double writes two segments, `wall` then `double`,
so each is independently checkable.

JUMP BUFFER: the real window is 5 ticks (83ms), not the 0.1s in TUNING — the timer counts
down before it is checked and the jump fires the tick after landing. Left as-is; all
measurements were taken with this behaviour.

## Open

- Box colliders + enableSnapToGround(0.5) let the capsule sink ~0.7u over 2s. Trimesh
  holds. check:physics only ever tested trimesh. All gym primitives switched to trimesh.
  The schema still permits "collider":"box" — H4 must not emit box colliders for walkable
  surfaces until check:physics covers them.
- RESOLVED: landing slowdown was TUNING.groundStickSpeed = 2. Pushing into the floor each
  grounded tick made the character controller intermittently report the whole move blocked
  (12 stalls in 1179 ticks; 0 with no push). Set to 0. Running stalls 25/1010 -> 0/1010,
  landing stalls 84/417 -> 2/417, and the 2 remaining are legitimate wall contacts.
- RESOLVED: box colliders removed from the schema enum entirely. Box sinks ~0.1u when the
  capsule STANDS STILL on it — the first test missed it because the capsule was always
  walking. Pingpong platforms stand still at each end of their path, so box platforms do
  not prove clean either. Loader and manifest parser are trimesh-only.
- OPEN: single-jump rise from a running approach was not measured directly. jump maxRise
  is set to 2.00, derived conservatively from the double-jump running ratio (3.5/4.0
  applied to the measured 2.25). Measure it directly and tighten or relax.
- RESOLVED (H3, 2026-11-07): the gym staircase (8 x 0.4 rise / 0.6 tread, critical_path seg
  11->12 `via: ground`) was UNWALKABLE, and linted clean. Found by the H3 nav bot on its first
  run: stuck at x=57.64 against the first riser. Cause: Rapier's autostep lifted the capsule, but
  the riser reports a wall-like normal and Player cancelled all into-wall velocity that same
  tick; snap-to-ground pulled it back down next tick, and from rest it never re-climbed. Fix in
  src/entities/player.ts: a grounded tick where the controller moved us UP (mv.y > 0, desired
  y <= 0) treats horizontal-normal contacts as steps — no velocity cancel, no wall contact.
  Airborne contacts (wall slide / wall jump / ledge grab) are untouched; every earlier nav segment
  time is identical to the tick, so ballistic moves are unaffected. 0.4u risers are now verified
  by the gym walk; the 0.5u autostep ceiling in MOVE.ground is still not measured directly.
- CHANGED (H4, 2026-11-08): the gym staircase is now the real asset `stair_run_12` (12 x 0.2667
  rise / 0.4 tread / 4.0 wide, 33.69deg; constants in tools/blender/stair_run_12.py, which
  asserts riser < 0.4, riser < 0.5 autostep, slope < 50deg and flat tread > 0.2 autostep min
  width). Same footprint and waypoints as the 8-box stair (x 58 -> 62.8, y 0 -> 3.2), so the
  lint segment is unchanged. Nav: 23/23, stair segment 18->19 in 0.85s, no stall on the narrower
  0.4 tread. CONSEQUENCE: the gym no longer contains a 0.4u riser — the H3 "0.4u risers verified"
  claim above is now unexercised. If 0.4u risers matter for real levels, add a 0.4u stair to
  the gym's test lane.
- OPEN: the linter checks only the waypoint chord (here 3.2 rise over 4.8 run), never the stair
  geometry itself. A stair asset with a 0.6u riser on the same footprint would lint clean and be
  unwalkable. Today the Blender script's asserts are the only per-step check.
- NOTE: Draco quantisation (14-bit positions) moves vertices by up to ~1e-4u: the tread is
  0.399927 deep and the run tops out at 3.1999, not 3.2. Far below autostep; recorded so nobody
  chases it.
