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

    ground    slope 49deg, autostep 0.34    (slope measured B-20, see "B-20 re-measure" below; Rapier's
                                            maxSlopeClimbAngle is 50. autostep measured B-14: Rapier is configured 0.5)
    jump      maxH  5.0   maxRise 2.00   (B-20: maxH clean to 5.6, the top of the grid; not raised. maxRise 2.0
                                          does NOT meet D-017 and no lower grid value does: CONFLICT, see "D-017")
    double    maxH  8.4   maxRise 2.90   (D-017, 2026-11-09: every timing clean. Were 9.5 / 3.5: 9.5 was clean only
                                          with a late second press, 3.5 from most takeoff distances. See B-20)
    dash      maxH  2.6   maxRise 0.34   (maxRise B-20 = autostep: a grounded dash has no lift. maxH D-017: clean
                                          k0-k5 to 2.6; 4.0 was clean only at k0-k1. See "D-017")
    dashjump  maxH  8.0   maxRise 2.60   (B-20; were 10.0 / 2.75 on one sample each)
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
- MEASURED (B-20, 2026-11-09): single-jump rise from a running approach, 6 takeoff distances x 96 x 5:
  2.4 and 2.6 clean, 2.7 fails everywhere, but 2.0 has two single failures. maxRise stays 2.00
  (was derived from the double-jump running ratio, 3.5/4.0 applied to the measured 2.25), PROVISIONAL
  until those two are diagnosed. See "B-20 re-measure".
- RESOLVED (H3, 2026-11-07): the gym staircase (8 x 0.4 rise / 0.6 tread, critical_path seg
  11->12 `via: ground`) was UNWALKABLE, and linted clean. Found by the H3 nav bot on its first
  run: stuck at x=57.64 against the first riser. Cause: Rapier's autostep lifted the capsule, but
  the riser reports a wall-like normal and Player cancelled all into-wall velocity that same
  tick; snap-to-ground pulled it back down next tick, and from rest it never re-climbed. Fix in
  src/entities/player.ts: a grounded tick where the controller moved us UP (mv.y > 0, desired
  y <= 0) treats horizontal-normal contacts as steps — no velocity cancel, no wall contact.
  Airborne contacts (wall slide / wall jump / ledge grab) are untouched; every earlier nav segment
  time is identical to the tick, so ballistic moves are unaffected. 0.4u risers are now verified
  by the gym walk HEAD-ON. The autostep ceiling is now measured directly (B-14, "Autostep" below): 0.40
  risers stall on oblique approaches, so "verified" holds for the nav bot's line only (B-20).

## Autostep (B-14, 2026-11-08)

`kcc.autostepMaxHeight` 0.5 (src/engine/physics.ts) is an INPUT to Rapier's character controller. What
the player actually walks up without jumping is lower, and it is not a sharp edge: whether a riser
climbs depends on the sub-tick phase at which the capsule meets the face and on the approach angle.
Rapier is deterministic (`check:physics`), so a single sample at one position always repeats, which is
how a "clears 0.5" single measurement could be honest and still wrong.

Measured with `npm run measure:autostep` (tools/measure-autostep.ts): the harness build, real Rapier,
real Player, 60 Hz ticks. A fixture of risers (6 u treads, so `autostepMinWidth` 0.2 never binds) is
walked with NO jump; a STALL is the capsule pinned against the face for 150 ticks (2.5 s).
Coverage per height: 6 approaches (run head-on, rest against the face, sprint, 30 deg and 45 deg
oblique, walk at half stick) x 96 start phases spread over one tick of travel x 5 absolute placements
of the whole fixture = 2,880 trials. **Rule: a height is clean when it has zero stalls over all of it;
the value is the largest H with every grid height <= H clean, not rounded either way.**

    0.30-0.34   clean (0 stalls in 2,880 trials at each 0.01 step)       <- MOVE.ground.autostep = 0.34
    0.35        1 stall  (30 deg oblique)
    0.36        clean (an isolated clean height above the first stall does not raise the value)
    0.37        16 stalls (15 at 45 deg oblique, 1 at 30 deg)
    0.40        oblique only: up to 17 of 48 phases at 45 deg on one placement. Head-on clean.
    0.42        oblique 26 and 69 of 96, walk 2 of 96 (3 placements)
    0.44-0.50   most approaches, majority of trials; 0.50 stalls 17-24 of 24 even head-on

Head-on approaches stall rarely below 0.42 (at 96 phases x 3 placements: rest once at 0.375, sprint
once at 0.41, walk twice at 0.42); the oblique approaches set the ceiling, and MOVE uses it because
the linter cannot see the approach angle (the same argument as RUN not sprint, above). The value fell each time coverage widened (0.40 -> 0.39 -> 0.37 -> 0.34 as phases
went 24 -> 48 -> 96 and placements 1 -> 5), so it is a statement about THIS coverage: a riser in
0.30-0.34 may still stall at some untested phase, but not at any of 14,400 tested. A stall is not a
death: the player is pinned and can jump. Re-run when physics, TUNING or the capsule changes.

**FACE_RISE (B-19).** The linter bounds every face along a `ground` segment by this value, not by slope x run.
The first lint caught the levels themselves:
- **Chapter 1:** its stair was 0.40 risers (above the bound). It is rebuilt as 6 x 0.333.
- **The gym:** its stair is 0.40 risers too. It warns until B-20 rebuilds it.
OQ-055 records the decision.

## B-20 re-measure (2026-11-09)

The MOVE numbers that rested on one sample, re-measured with B-14's coverage protocol by
`npm run measure:b20` (tools/measure-b20.ts): harness build, real Rapier, real Player, 60 Hz. Every value is
96 phases x 5 absolute placements x 6 columns; a value is clean only at 0 failures, and the reported value
is the largest grid value with every lower grid value clean (B-14's rule). Each table cell is the worst
failures of 96 over the 5 placements.

Columns. `stair`, `dash` rise and `slope`: the six approaches (run, rest, sprint, 30 and 45 deg oblique,
walk). Gaps (`gap`): six press timings k = 0..5 ticks after the walk-off tick, all inside coyote time; the
nav bot presses at k = 2. Rises (`rise`): the press made with the capsule centre d = 3.5..6 u from the
face for double, 3..5.5 for dashjump (the far end of a running takeoff). Fixture rules are in the tool's header.

    slope deg   44-49 clean · 50: oblq45 6/96 · 51+: 96/96 every approach      -> MOVE slope 49 (was 50, Rapier's)
    dash rise   0.30, 0.34 clean (oblq45 excluded, below) · 0.38: run 2, rest 2, sprint 2, walk 1
                                                                                 -> MOVE dash maxRise 0.34 (was 0.50)
    dashjump    gap 7.5, 8.0 clean · 8.5: k0 90, k1 20                           -> MOVE dashjump maxH 8.0 (was 10.0)
    dashjump    rise 2.4-2.6 clean · 2.75: 96/96 at every distance               -> MOVE dashjump maxRise 2.6 (was 2.75)
    double      gap, nav press (release at vy <= 0.5): 8.4 clean · 8.8: k0 16 · 9.0: k0 96, k1 77
                gap, late press (release at vy <= -6):  9.0, 9.5 clean · 10.0: k0-k3 fail
                                                                                 -> MOVE double maxH 8.4 (D-017; 9.5 kept earlier, superseded)
    jump        gap 5.0, 5.4, 5.6 clean (top of the grid)                        -> MOVE jump maxH 5.0 unchanged
    stair       8 risers on 0.6 treads (the gym's shape), 10 wide: see below

The dash rise's 45 deg column is excluded, with this reason: dash reach is 3.2 u along the facing, so
2.26 u toward the face at 45 deg, and the trigger distance runs to 2.9 u. With the 0.35 capsule radius, the
dash cannot reach the face from d > 2.61, about 11 of the 96 phases, at ANY height. The column's 8 and 11
failures at 0.30 and 0.34 are those phases. 0.34 equals the autostep ceiling (B-14), which is what a grounded
dash with no vertical component should give.

**Not clean at the then-current value, kept PROVISIONAL (OQ-063). SUPERSEDED by D-017 (2026-11-09), see "D-017" below:**

    dash gap    3.4: k4 1, k5 3 · 3.6: k3 1, k4 1, k5 3 · 3.8: k2 1, k3 1, k4 1, k5 3
                4.0: k2 1, k3 1, k4 3, k5 2 · 4.2: k2-k5 fail · 4.4: every k fails. k0 and k1 clean to 4.2.
    double rise 2.9 clean · 3.2: d5 1 · 3.5: d5 1 · 3.8: d3.5, d4, d5.5 1 each · 4.1: d4 1 · 4.4: d6 47
    jump rise   2.0: d0.8 1, d1.6 1 · 2.4, 2.6 clean · 2.7: every distance fails (5-19 of 96)

Neither has a clean value at or below the shipped geometry: lowering dash maxH to 3.4 fails the gym
(seg 3->4) and 04-summit-ridge (seg 9->10), both 3.5 u dash gaps; lowering double maxRise to 2.9 fails
02-cliff-seam (segs 8->9, 9->10, +3.0 double rises). All of those pass nav in CI. In both, some press
timing is clean at the current value (dash pressed at k0-k1; double from most takeoff distances), the
same shape as double maxH 9.5, which Tim kept. So 4.0 and 3.5 stay, and the every-timing ceilings
(below 3.4 for the dash gap, 2.9 for the double rise) are recorded here, not put in code.

Jump rise 2.0 is the odd one: two single failures at 2.0, then 2.4 and 2.6 clean at every distance, then a
wall at 2.7. B-14's rule does not let a clean value above a failure raise the number, and a value below 2.0
is unmeasured, so maxRise 2.0 stays and is PROVISIONAL. A failure below a clean height is not a height limit:
it points at a timing or fixture effect (a lip catch on landing, say) that nobody has diagnosed yet (OQ-063).

**Stair (item a):**

    value   run  rest sprint oblq30 oblq45 walk
    0.30      0     0     0     3      1     0
    0.34      0     0     0     2      6     0
    0.36      2     2     5     6     42     6
    0.40      3     4     5    71     96     7

The gym's 0.40 risers fail even head-on (run 3, rest 4, sprint 5 of 96): they are not walkable, and the
gym's nav passes only because the bot walks one line at one phase. B-28 re-shapes them (a deliberate
golden and trace re-record). New: 0.6 treads stall at 30 and 45 deg oblique even at 0.30, below the
autostep ceiling that B-14 measured on single risers with 6 u treads. FACE_RISE bounds each face, and it
does not see consecutive narrow treads. B-29.

## D-017 every timing clean (2026-11-09)

Tim's ruling (PHASE-0-DECISIONS D-017): a MOVE budget is clean at EVERY press timing and approach in the
window, not at some. It supersedes the "kept" values above. Applied from the B-20 tables:

    double maxH     9.5 -> 8.4    nav press clean k0-k5 to 8.4; 8.8 fails k0
    double maxRise  3.5 -> 2.9    every takeoff distance clean to 2.9; 3.2 fails d5
    dash maxH       4.0 -> 2.6    clean k0-k5 to 2.6; 2.8 fails k4, k5

dash gap, below B-20's grid. Same protocol (96 phases x 5 placements x k0..k5, 14 400 trials, 0 console
errors, Darwin SwiftShader, 6dba83d, 3930 s; run by a second session under sub-claim OQ-063-dash, and its raw
log checked against this table):

    value u        k0     k1     k2     k3     k4     k5
    2.6             0      0      0      0      0      0
    2.8             0      0      0      0      1      1
    3.0             0      0      0      0      0      1
    3.2             0      0      0      1      0      1
    3.4             0      0      0      0      1      1      (B-20 had k4 1, k5 3: same timings, smaller count)

Above 2.6 the failures are flat at <= 1/96, confined to late presses, and not rising with distance. That is
the same shape as the jump rise below, and it goes to B-30 with it. The rule is strict, so 2.6 is the number.
The gym's and 04's dash gaps are 2.0 u edge to edge; their waypoints now span 2.5 (D-017).

The floor below 2.6, run alone on the machine (same protocol, 11 520 trials, 0 console errors, 2196 s, branch
oq063-every-timing, game code as fc5682f):

    value u        k0     k1     k2     k3     k4     k5
    2.0             0      0      0      0      0      0
    2.2             0      0      0      0      0      0
    2.4             0      0      0      0      0      0
    2.6             0      0      0      0      0      0

So 2.6 is clean on two independent runs, and every grid value under it is clean. Unlike jump rise, the
dash number has a real every-timing floor, so it is applied, not a CONFLICT.

**jump maxRise: no every-timing value exists in the grid (CONFLICT, B-30).** Measured below 2.0, same
protocol (96 phases x 5 placements x 6 distances, 11 520 trials, 0 console errors, Darwin SwiftShader,
branch oq063-every-timing at 47955d4, 58 min):

    value u      d0.4   d0.8   d1.2   d1.6     d2   d2.4
    1.4             0      0      0      1      0      0
    1.6             0      0      0      1      0      0
    1.8             0      0      0      0      0      0
    2.0             0      0      0      0      0      0

B-20's run, same values and protocol, had 2.0 failing at d0.8 1 and d1.6 1. Put together:
- **The failure does not fall away with height:** 1.4 fails as 2.0 once did, and 2.4 and 2.6 are clean.
- **2.0 is not stable either:** it went from 2 failures to 0 between two runs on the same machine.

That is a single-phase defect, or nondeterminism in the harness, not a height limit. Walking the number
down cannot satisfy D-017, so maxRise stays 2.0 in code, PROVISIONAL. B-30 dumps the failing phase and
placement and diagnoses it before any jump rise number is called every-timing clean.

## H4 asset budgets (2026-11-08)

Measured from the SHIPPED .glb (`tools/assets/measure.mjs`, Draco-decoded in Node) and again
in the harness browser (`renderer.info`, asset rendered alone — see `tools/harness/assets.ts`
for the exact definition of "placed once"). Limits live in `tools/assets/budgets.json` and are
set AT the measured value, the same discipline as the MOVE table: a budget is a ratchet. An
asset that grows fails `npm run assets:budget` (CI) and `npm run assets:build` until its line
is raised here with the new measurement and the reason.

| Asset | Triangles | Compressed bytes | Export bytes | Textures | Max tex px | Materials | Draw calls (once) |
|---|---|---|---|---|---|---|---|
| kit_torii | 108 / 108 | 2436 / 2436 | 9120 | 1 / 1 | 32 / 32 | 1 / 1 | 1 / 1 |
| kit_rock_mass | 216 / 216 | 3472 / 3472 | 16032 | 1 / 1 | 32 / 32 | 1 / 1 | 1 / 1 |

| kit_ledge (CH1-ASSETS) | 66 / 66 | 2400 / 2400 | 6420 | 1 / 1 | 32 / 32 | 1 / 1 | 1 / 1 |
| kit_stair_tread (CH1-ASSETS) | 50 / 50 | 2092 / 2092 | 5256 | 1 / 1 | 32 / 32 | 1 / 1 | 1 / 1 |
| kit_slide_stone (CH1-ASSETS) | 36 / 36 | 2068 / 2068 | 4268 | 1 / 1 | 32 / 32 | 1 / 1 | 1 / 1 |
| kit_crow (CH1-ASSETS) | 60 / 60 | 2328 / 2328 | 6372 | 1 / 1 | 32 / 32 | 1 / 1 | 1 / 1 |
| kit_mid_cliff (CH1-ASSETS) | 64 / 64 | 2368 / 2368 | 6028 | 1 / 1 | 32 / 32 | 1 / 1 | 1 / 1 |
| kit_far_peak (CH1-ASSETS) | 44 / 44 | 2176 / 2176 | 4524 | 1 / 1 | 32 / 32 | 1 / 1 | 1 / 1 |
| kit_cloud_band (CH1-ASSETS) | 22 / 22 | 2124 / 2124 | 3296 | 1 / 1 | 32 / 32 | 1 / 1 | 1 / 1 |

Cells are measured / limit. Renderer cross-check (SwiftShader): torii 1 call / 108 tris,
rock 1 call / 216 tris. CH1-ASSETS lines: new lines, not raises, each measured by `npm run
assets:build` on 2026-11-09 (Darwin, Blender 5.2.3, gltf-transform 4.5.1) and cross-checked by the
harness `assets` stage (48/48: every asset loads with Draco + KTX2, 1 draw call, the manifest's
triangle count, 32x32 texture, unlit). All seven are built `collider: "none"` (see "CH1-ASSETS
dressing" below). Adding them left kit_torii and kit_rock_mass byte-identical (manifest sha256
`07956ca0...` and `c1b264ba...` unchanged): `lib.py` gained one function at its end and no
palette cell.
  - kit_cloud_band RAISED 14 / 2064 -> 22 / 2124 (same day, before merge): its strips ran along x, the view
    direction, so they converged into floorboards (a surface: STYLE §4, §9 item 12). Re-authored ACROSS the
    view (strips at fixed x spanning z), which stack into horizontal screen bands. The strip count rose with
    the narrower axis it now walks. Measured by `assets:build`.
  - D-018 (2026-11-09), the kit re-valued against `reference/seed/hero`: kit_ledge LOWERED 74 / 2428 -> 66 / 2400
    (four bands, not five), kit_far_peak LOWERED 48 / 2228 -> 44 / 2176 (a low horizon ridge, not tall peaks),
    kit_mid_cliff 2380 -> 2368 B. kit_rock_mass RAISED 3460 -> 3472 B (+12): COLOURS ONLY, its strata re-valued
    lighter; the UVs compress 12 B worse. Its positions, faces and strokes are untouched: it is collision, and
    `tools/geometry-fingerprint.mjs` is IDENTICAL to main d173785 on all five levels (gym 3f8ace62, ch1 3c766f28,
    02 0ef30360, 03 282b2f50, 04 845342c6). Placed in 00-gym the scene went 30 -> 33 peak draw calls and
640 -> 1,072 peak triangles (+2 x 108 +216, exactly).

Budget history:
  - kit_rock_mass first measured at 310 tris / 3984 B (11-sided strata, 0.16 jitter). That
    read as a drum in the harness frames; STYLE-BIBLE 4 has no rounded rock. Rebuilt 7-sided,
    0.3 jitter, offset strata: 216 tris / 3436 B. Budget LOWERED to match.
  - RAISED, both assets, +24 B (torii 2412 -> 2436, rock 3436 -> 3460), D-001: the shared
    palette texture gained four cells (three accent candidates + the seed_red comparison
    fixture), 12 of 16 cells now filled. Geometry, triangles and texture size unchanged.

Seed red, measured (a FACT ABOUT THE SEED, not the accent — see D-001 below): saturated
red-orange pixels across all 36 seed frames, median `#603633`, 2,205 px = 0.012% of frame
area (peak frame 0.061%). Hero frames agree: median `#5d3531`, 0.013%.

Compression choices, measured on the 32x32 palette texture:
  - UASTC (level 2, no mips) 364 B vs ETC1S 385 B — at this size ETC1S's codebook costs more
    than it saves, and UASTC is the higher-fidelity codec. UASTC chosen.
  - No mipmaps: every kit face has a constant UV (one palette texel), so there is nothing to
    minify, and mips below the 8px cell size would average two palette entries off the ramp.
  - Draco edgebreaker, position 14 / normal 10 / texcoord 12 bits: 3.77x (torii) and 4.66x
    (rock) smaller than the Blender export. Texcoord quantisation keeps every UV inside its
    8px cell (palette fidelity below confirms it).

Palette fidelity in the harness (Tier-2, recorded, not asserted): asset rendered unlit with
tone mapping off on a magenta background; share of covered pixels within 6/255 of a palette
texel: rock 95.6%, torii 92.7%. The rest are MSAA edge blends with the magenta. Top colours
render EXACTLY as authored (`#383838`, `#534e4b`, `#20201e`, and the accent `#e34234`).

## Scene budgets (2026-11-08)

Per-level peak `renderer.info` over the harness `counters` trace (SwiftShader, CI-valid: counters
are CPU-side bookkeeping). Limits live in `tools/assets/budgets.json` `scenes` and are set AT the
measured value, the same ratchet as the asset budgets: a scene that grows fails `counters` until
its line is raised here with the measurement and the reason (OQ-040). The Tier-1 ceilings (300
draw calls, 500,000 triangles) still apply on top.

| Level | Peak draw calls | Peak triangles |
|---|---|---|
| 00-gym | 62 / 62 | 68,562 / 68,562 |
| 01-lower-stair | 140 / 140 | 381,066 / 381,066 |
| 02-cliff-seam | 94 / 94 | 132,870 / 132,870 |
| 03-drifting-stones | 94 / 94 | 134,094 / 134,094 |
| 04-summit-ridge | 92 / 92 | 132,846 / 132,846 |

D-018 (2026-11-09), every line re-set AT the measured peak (harness `counters`, Darwin SwiftShader). `renderer.info`
now counts the WHOLE frame: the scene draw into the post target plus the §6 full-screen pass (1 call, 2 tris),
reset once per frame in `Renderer.render`. The red fall plane (1 call, 2 tris) moved to the debug overlay, so the
four greybox levels net -1 call / -2 tris and are LOWERED; chapter 1 had no fall plane (ink) and nets +1 call,
and its kit re-valuing (kit_ledge -8 tris x 23, kit_far_peak -4 x 5) takes it 6,704 -> 6,502 tris.

01-lower-stair (CHAPTER-1, CI run 42505174534, landing mark on): 13 kit_rock_mass (13 x 216 = 2,808 tris), 4 kit_torii (432), greybox ledges/stair/knobs, 2 patrollers, 2 crows, the landing mark.

02-cliff-seam (CHAPTER-2, set here; Darwin SwiftShader `counters`, landing mark on): 18 kit_rock_mass (18 x 216 = 3,888 tris), 5 kit_torii (540), 13 greybox prim_box (11 floors/ledges/wall + 2 crow knobs), 2 patrollers, 2 crows, the landing mark. A new line, not a raise.

03-drifting-stones (CHAPTER-3, local harness run, landing mark on): 21 kit_rock_mass (21 x 216 = 4,536 tris), 5 kit_torii (540), greybox ledges, 2 lintels, the crow perch, 2 moving slabs, 1 patroller, 1 crow, the landing mark. More rocks than chapter 1, because they are spaced 7 u, not 8.5, so the overlap leaves no notch for chaos to wedge in.

02-cliff-seam, raised 49 / 5,040 -> 50 / 5,052 (B-23, OQ-062): one greybox prim_box added, the backstop
behind the wall teach's 1 u shelf (it stops a wall jump overshooting the shelf and bounds its readable depth).
Exactly +1 draw call and +12 triangles, measured by the harness `counters` stage on Darwin SwiftShader (peak
50 / 5,052). Revert the B-23 wall teach and this line reverts with it.

01-lower-stair, raised 43 / 3,852 -> 46 / 3,888 (D-015a + D-015c, PROVISIONAL with them): three
greybox prim_box added (the 1.25 jump-teach step at x 6-10, the two 1.75 shelves at x 38.5-41.5 and
91.5-94.5). Exactly +3 draw calls and +3 x 12 = +36 triangles, one unbatched box each, measured by the
harness `counters` stage on Darwin SwiftShader. Revert D-015a and this line reverts with it.

01-lower-stair, raised 46 / 3,888 -> 74 / 6,704 (CH1-ASSETS, 2026-11-09; 6,648 with the first 14-tri cloud): the greybox replaced by the kit.
Measured by the harness `counters` stage, Darwin SwiftShader, peak over the trace. What changed in what is
DRAWN (no collider changed; see "CH1-ASSETS dressing"): -17 prim_box meshes, -3 checkpoint pads, -1 fall
plane (palette "ink" does not draw them); +23 kit_ledge, +10 kit_stair_tread, +5 kit_mid_cliff,
+5 kit_far_peak, +9 kit_cloud_band; patrollers 12 -> 36 tris each (kit_slide_stone), crows 12 -> 60
(kit_crow). The static sum is 77 calls / 6,750 tris (with the re-authored 22-tri cloud). The measured peak is lower because `renderer.info`
counts after frustum culling, and no frame of the trace sees every placement. Still 4x under the Tier-1
300-call ceiling.

## CH1-ASSETS dressing (2026-11-09)

Chapter 1's art DRESSES its collision geometry and never replaces it. Every prim_box keeps its trimesh
collider. `tools/levelgen/dress-01.mjs` lays a collider-none kit placement over each one with the box's
own pos and scale, so the drawn top is the collider top. The placements are appended after every authored
entry, so `geometry[i]` indices and lint messages do not move. The constants it uses:

None of these is a MEASURED budget: each is labelled DERIVED (computed from other numbers here) or
AUTHORED (an art choice, recorded so it is never a bare number in code).

| Constant | Value | Kind | Basis |
|---|---|---|---|
| TREAD_MAX_X | 0.6 u | derived | the stair treads and perch stones are 0.6 u along x; the narrowest ledge is 3 u, so the rule cannot misfile one |
| OVERLAP_EPS | 0.08 u total (0.04 u per side), x and z only, never y | derived | a box sitting on a larger one (the 1.25 step, both 1.75 shelves) has its sides coplanar with the box below, and two patterns on one plane z-fight. It must clear kit_ledge's fracture strokes, which float 0.003 x the face width off the face: 0.021 u on a 7 u face. A first cut at 0.01 per side let them show through. To that it adds the depth resolution, z^2 / (near * 2^24): ~0.0015 u at 50 u and ~0.01 u at 130 u. 0.021 + 0.01 < 0.04. Never y, so a walkable top is never offset. The cost: the drawn riser of a step or shelf sits 0.04 u proud of its collider |
| TILE_OVERLAP | 0.01 u per side, interior seams only | derived | abutting coplanar tops leave a raster crack; the neighbour's black lip showed through it and the §6 ink edge outlined it as a dotted line (D-018 cam2). Overlapped tops are the same paper fill, so nothing visible z-fights; box ends stay exact |
| TILE_X | 4.5 u | authored | kit_ledge's stroke is 0.014 of the box; at 4.5 u that is 0.06 u, a brush line. The 41 u sweep slab untiled would draw 0.6 u bars |
| kit_cloud_band LIFT | 0.04 u | authored | the paper_cream bands above the mist_pale sheet; the band height is 9.5 u below the lowest walkable top |
| cloud sea y | -9.5 | authored | 0.5 u above the fall plane (-10), 9.5 u below the lowest top (0): a gap reads as a drop into cloud, never as floor (STYLE §9 item 12) |

Proof that collision did not move: `node tools/geometry-fingerprint.mjs levels/01-lower-stair.json
assets/dist/manifest.json` dumps every collider placement (with a hash of each placed kit soup), every
FACE_RISE face, the READABLE_RISE views, ASSIST_CASE and lint's verdict. Before: `3c766f28...` (34 collider
placements, 13 ground segments, 5 rises, 0 assist cases, lint PASS 0E/0W). After, with 52 dressing
placements added: the same hash, byte-identical. A mutation giving one dressing placement `collider:
"trimesh"` changes it (35 placements, `DIFFERS at "colliders"`). Lint did NOT catch that mutation, which is
the silent failure, so lint now has DRESS_COLLIDES, pinned in lint:self.

Nav, every simulation line identical (Darwin SwiftShader, `playtest --level=01-lower-stair --instrument=on`;
before = main's own build, after = this branch's build; 47 of 47 simulation lines identical. Taken twice,
because main moved under the work: against 080d3e3, and again after rebasing onto d173785 (PR #26, D-017),
whose ch1 fingerprint is the same 3c766f28...):

| Segment | Before | After |
|---|---|---|
| seg 0 spawn -> checkpoint[0] | 5.033 s | 5.033 s |
| seg 1 checkpoint[0] -> checkpoint[1] | 3.183 s | 3.183 s |
| seg 2 checkpoint[1] -> checkpoint[2] | 3.183 s | 3.183 s |
| seg 3 checkpoint[2] -> goal | 3.933 s | 3.933 s |
| goal | 15.35 s, 921 ticks, (99.61, 9.01, -0.00) | 15.35 s, 921 ticks, (99.61, 9.01, -0.00) |

The same holds for each of the 21 waypoint arrivals (time and position), the 32 phase-sweep cells and
HAZARD_INERT (4/8 and 2/8 blind failures). Replay passed against the COMMITTED trace, which was not
re-recorded: 921 vs 921 ticks, 0.000 u.

History:
  - 30 calls / 640 tris: greybox gym before H4.
  - 33 / 1,072: kit_torii x2 + kit_rock_mass placed (H4, PR 3): +3 calls, +2 x 108 +216 tris.
  - 34 / 1,104 (ratchet set here): the landing mark ships ON (D-010). Exactly +1 draw call and
    +32 triangles, the disc (CircleGeometry, 32 segments). Not batched: it moves on its own every
    frame and shares no geometry or material. Measured with `?landingmark=off`: 33 / 1,072,
    unchanged.

## D-001 accent contrast (2026-11-08)

PHASE-0-DECISIONS D-001: the navigational accent is AUTHORED; `#603633` (above) is rejected as
the accent. `ACCENT_CONTRAST` (`tools/assets/accent.mjs`, `npm run lint:accent`, run by
`assets:build` before Blender and by CI) checks every candidate in `assets/src/accent.json`
against every `reference/palette.json` entry. Its thresholds are measured from the palette,
not typed in; only the multipliers are policy:

| Measured from palette.json | Value | Rule |
|---|---|---|
| largest adjacent ramp step, CIEDE2000 | 9.9 (steps are 7.1-9.9) | dE2000 to nearest entry >= 2 x = **19.7** |
| largest palette chroma C*ab | 11.0 (paper-cream) | C* >= 3 x = **33.0** |
| L* of wash-mid, darkest non-ink value | 42.7 | L* >= **42.7** |

CIEDE2000 verified against six Sharma (2005) reference pairs, all exact to 4 decimals.
Why three conditions, not one: dE2000 alone compresses large chroma gaps (SC = 1 + 0.045 C), so
even `#e34234` is only dE 27.6 from stone-mid and a flat dE 40 would reject every red; and
dark `#5a0000` clears dE (24.5) while being exactly D-001's "another dark shape" — the
lightness floor is what rejects it.

| | hex | L* | C* | nearest, dE2000 | ACCENT_CONTRAST |
|---|---|---|---|---|---|
| vermilion_a (default until H2.5) | `#e34234` | 52.4 | 75.5 | stone-mid 27.6 | pass |
| vermilion_b | `#ef5b3b` | 58.2 | 72.9 | wash-light 26.7 | pass |
| vermilion_c | `#c8371f` | 45.8 | 73.0 | wash-mid 26.7 | pass |
| seed_red (must_fail fixture) | `#603633` | 27.7 | 20.9 | ink-grey 16.0 | **fails all three** |

Rendered on the gym torii by `node tools/harness/accent-renders.ts` -> `docs/build-log/accent/`
(per-shot PNGs, `contact-sheet.png`, `accent-renders.json`). Switch in place with
`?accent=<name>`. Accent share of frame, identical for every candidate (it is geometry, not
colour):

| shot | framing | accent area |
|---|---|---|
| follow | gameplay camera, 7 m arm behind a player at x=44, torii at x=50 | **2.056%** |
| approach | ~16 m from the x=50 torii | 1.165% |
| goal | goal-pad torii against open sky | 1.471% |
| scan | harness cam0, whole gym | 0.076% |

One torii at gameplay distance was ~2x the then-current 1% budget, whatever its colour. Flagged,
not adjusted; **D-003 withdrew the 1% budget** (its basis was an absence, not an area) and
replaced it with ACCENT_AREA, below. (These shots are hand-placed; the exact follow rig gives
2.30%, see D-003.)

## D-003 accent area (2026-11-08) — SUPERSEDED by D-006 below (no ceiling; floor at scanning distance)

`ACCENT_AREA` (harness `accent` stage, every level, CI): for each kit_torii, the player 6 m
before it along the critical path, camera at CAMERA_TUNING's rest pose (read from
src/engine/camera.ts: arm 7 m, pivot 1.5 m, pitch 18 deg; fov 60), real level, real occlusion.
Accent share of the frame must lie in the band:

| bound | value | measured from |
|---|---|---|
| floor (findable) | **0.505%** | kit_torii with the gate 25.26 u from the camera — the STYLE-BIBLE 3 near-band edge. PROVISIONAL until H2.5 measures findability directly. Frozen as a number in accent.json. |
| ceiling (not dominant) | **5.08%** | the smallest share in reference/palette.json (ink-black), read at run time |

Distance curve, x=50 torii, default accent, exact follow rig
(`node tools/harness/accent-renders.ts --area-curve` -> docs/build-log/accent/accent-area-curve.json):

| player before gate | camera -> gate | accent share |
|---|---|---|
| 0 m | 7.6 m | 9.036% |
| 2 m | 9.4 m | 5.139% (just over the ceiling) |
| 4 m | 11.27 m | 3.313% |
| **6 m (asserted)** | 13.18 m | **2.300%** |
| 8 m | 15.11 m | 1.647% |
| 12 m | 19.01 m | 0.970% |
| 18.34 m | 25.26 m | 0.505% (= floor) |
| 25 m | 31.87 m | 0.319% |
| 30 m | 36.84 m | 0.234% |
| 40 m | 46.8 m | 0.148% |

Gym, asserted: torii x=50 **2.300%**, torii x=88 **2.247%**: in band. Negative proofs: framing
at 1 m -> 6.658% / 6.564%, exit 1 (ceiling); at 25 m -> 0.319% / 0.296%, exit 1 (floor).
The band is asserted only at the canonical 6 m framing; walking through a gate (9% at 0 m) is
not a violation — the rule is about the frame in which the player is looking FOR the next one.

## D-006 accent floor (2026-11-08)

`tools/harness/accent-floor.ts` -> `docs/build-log/accent/palette/curve.json`. kit_torii alone, at
the follow rig's rest pose (CAMERA_TUNING, read from src/engine/camera.ts), 640x360, on a
paper-cream background. Area is geometry, not colour, so one candidate stands for all. Largest blob =
the largest 4-connected run of accent pixels, the shape a scanning eye has to find.

| player before gate | camera to gate | accent % | accent px | largest blob px |
|---|---|---|---|---|
| 0 m | 7.6 m | 8.9332% | 20582 | 20582 |
| 6 m | 13.18 m | 2.2465% | 5176 | 5176 |
| 25 m | 31.87 m | 0.2960% | 682 | 682 |
| 50 m | 56.78 m | 0.0621% | 143 | 143 |
| 70 m | 76.74 m | 0.0273% | 63 | 61 |
| 80 m | 86.73 m | 0.0313% | 72 | 72 (pixel-grid aliasing: not monotonic) |
| **90 m** | 96.73 m | **0.0204%** | 47 | **46: last above 27.6** |
| 100 m | 106.72 m | 0.0226% | 52 | 18: fractures, posts no longer one shape |
| 120 m | 126.71 m | 0.0056% | 13 | 5 |
| 200 m | 206.69 m | 0% | 0 | 0: vanishes |

**Findability boundary.** The one observed failure is the seed's red at 0.012% of the frame, which
is 27.6 px at 640x360. The last distance at which the largest blob exceeds it is 90 m.
**Floor = 0.0204%**, the share there. PROVISIONAL until H2.5 measures findability with a person;
the curve gives the feel test the distances to show. Frozen in `assets/src/accent.json` as a
number, so a smaller gate fails it rather than moving it. Note that 90 m is past STYLE-BIBLE §3's
far-band edge (80u), so in a styled level the band treatment, not pixel size, will usually bind
first.

**The rule (harness stage `accent`).** Each torii, in route order, is scanned for from the
previous anchor (the previous torii, or spawn for the first), with the follow rig facing it. Only
that gate's own accent pixels count: the frame is rendered with and without it, so occlusion
counts against it and other gates in view are not credited to it. Gym: x=50 gate scanned from
spawn (50 m) **0.0603%**; x=88 gate scanned from x=50 (38 m) **0.1033%**. Negative proof: a floor
of 0.08% fails the first gate, exit 1.

**Against the ramp** (`swatches-near.png` at 6 m, `swatches-floor.png` at 90 m; rows a, b, c,
seed_red; columns paper-cream to ink-black). All three candidates separate on every ramp value.
seed_red sinks into ink-grey, ink-deep and ink-black. Minimum CIEDE2000 against any ramp value:

| | vermilion_a #e34234 | vermilion_b #ef5b3b | vermilion_c #c8371f | seed_red #603633 |
|---|---|---|---|---|
| min dE2000 vs ramp | 27.6 | 26.7 | 26.7 | 16.0 |

For the feel test; this chooses nothing.

One correction found while measuring: the first render pass captured the menu HUD, a DOM overlay,
inside the canvas screenshot, over the gate. It is now hidden on those pages. In-level stages are
unaffected, because the HUD is empty in `play`.

**Measurement frame, D-012 (2026-11-08).** The floor is unchanged at 0.0204%. It is now met in the
BEST frame over every pitch the follow rig allows (CAMERA_TUNING `pitchMinDeg`..`pitchMaxDeg`, -25..70,
step fovDeg/6 = 10, plus rest 18), with the arm pulled in by the rig's own collision (`allowedArm`,
harness `rigCamera`). Verified: chapter 1's original two-climb T2 reads 0.0000% at rest and 0.3468%
at -25 (looking up), so it passes. A gate behind a 30 m wall reads 0.0000% at all 12 pitches, so it fails.

## D-015 readable rise (2026-11-08)

Arithmetic, not a render: every number below is computed by `readableBandDeg()` in
`tools/lint-level.mjs` from the rig constants IMPORTED from `src/engine/camera-tuning.ts` and
`src/engine/render-config.ts` (never retyped; `npm run lint:self` prints them).

Rig at rest (D-015): eye **3.66 u** above the feet (`pivotHeight + distance*sin(initialPitchDeg)`
= 1.5 + 7 sin 18), **6.66 u** behind them (`distance*cos(initialPitchDeg)`), looking 18 deg down,
vertical frustum -48..+12 deg (`fovDeg` 60).

| constant | value | status |
|---|---|---|
| `READABLE_RISE.standoffM` | 2.0 u | D-015's measuring condition (the player 2 m off the face) |
| `READABLE_RISE.minBandDeg` | 2.0 deg | D-015b's ruling. **PROVISIONAL**: a threshold picked between the table's failing (0.7) and passing (6.9) rows, never measured against players. B-17's per-segment deaths are the measurement that would move it |

Top-surface band, degrees, for a landing `rise` above the feet and `depth` deep along the approach.
A top at or above the eye is back-facing (the eye sees the face, never the ground): 0 (OQ-046).

| rise | depth 1.5 | 2.0 | 2.5 | 15 |
|---|---|---|---|---|
| 1.75 | **1.79** | 2.28 | 2.73 | 7.84 |
| 2.00 | 1.58 | 2.00 | 2.40 | 6.85 |
| 3.00 | 0.64 | 0.82 | 0.98 | 2.77 |
| 3.50 | 0.16 | 0.20 | 0.24 | 0.68 |
| 3.75 | 0 | 0 | 0 | 0 |
| 4.50 | 0 | 0 | 0 | 0 (D-015's table: 3.5, OQ-046) |

Chapter 1, measured by the linter: pre-split, the two +3.50 climb faces read **0.89 deg** (onto
geometry[10], 41 u deep) and **0.67 deg** (geometry[15], 14 u): both fail. Post-split, each +1.75 shelf
is 2.5 u readable (2.73 deg), the step off each shelf lands on deep ground (>= 7.8 deg), and the
D-015c teach step (+1.25 onto 4 u) reads 4.78 deg. D-015a's "1.5-wide shelf" as written reads 1.79
deg and would fail D-015b: that is why the shelves are 2.5 u.

### D-016 readable ceilings (rest pose)

Largest rise, at 0.01 u resolution, whose landing top still subtends >= 2.0 deg. Bisected with
`readableBandDeg`, and pinned in `npm run lint:self` at the value (accept) and +0.01 (reject):

| landing depth | 2.5 | 5 | 6 | 15 | 41 | limit |
|---|---|---|---|---|---|---|
| max readable rise (u) | 2.28 | 2.83 | 2.92 | 3.18 | 3.29 | 3.36 |

The limit is `eye - (standoff + behind) * tan(minBand)` = 3.663 - 8.657 tan 2 deg = 3.361: no landing
depth makes a higher rise readable. Wall (maxRise 4.00) and climb (4.50) have characteristic rises wholly
above it, so D-016 blocks chapter 2 on D-015d. This is arithmetic, not a render.

## D-015d pitch assist (B-18, 2026-11-08)

`src/engine/pitch-assist.ts` holds one rule, `assistPitchDeg`, that the camera runs and READABLE_RISE models.
`tools/harness/pitch-assist.ts` then measures it in the real rig. The rig itself (`pivotHeight`, `distance`,
`pitchMaxDeg`, `fovDeg`) is passed in and never retyped.

| constant | value | status |
|---|---|---|
| `PITCH_ASSIST.probeM` | 3.0 u | D-015d's "inside ~3 m of a face". A design value: **PROVISIONAL** |
| `PITCH_ASSIST.eyeBandM` | 0.5 u | D-015d's "top within 0.5 m of eye level", read as a lower bound: the probe casts at rest eye - 0.5 = **3.16 u** above the feet, so only a top at or above that is assisted. **PROVISIONAL** (OQ-052) |
| `PITCH_ASSIST.minBandDeg` | 2.0 deg | = `READABLE_RISE.minBandDeg`. The linter throws if the two differ |
| `PITCH_ASSIST.pitchStepDeg` | 1 deg | search resolution for the target pitch. Lint and camera use the same step, so they agree to the degree |
| `PITCH_ASSIST.depthStepM` | 0.5 u | spacing of the probe's depth down-rays. The linter feeds the depth the probe would measure (`probedDepth`), not the true depth |
| `PITCH_ASSIST.depthMaxM` | 15 u | depth cap, D-016's deepest measured column. Past it the assisted ceiling moves less than 0.01 u (4.67 at both 15 and 41) |
| `PITCH_ASSIST.epsM` | 0.05 u | probe tolerance: how far inside the face the first down-ray lands, and the height match for "same top surface" |
| blend rate | `CAMERA_TUNING.followDamping` (12 /s) | no new number: the assist eases at the follow rig's own sharpness. Running at `runSpeed` 7 u/s from 3 u to 2 u takes 0.14 s, which covers 82% of the offset. Standing at the face, it converges. `snap()` (spawn, respawn) jumps straight to the target |

**Trigger.** The probe casts along the player's `facing`, at 3.16 u (rest eye - `eyeBandM`), out to `probeM`.
The assist engages when the landing top does not read at the player's current pitch. It then drives the camera
to the lowest whole degree at which the top subtends `minBandDeg` or more. A top below 3.16 u gets no assist
and keeps its rest-pose verdict.

**Why the probe is not at pivot height (1.5 u).** The first build cast at pivot height. Over a full nav run
the assist then engaged on 90 ticks of shipped chapter 1, peaking at +27.8 deg on the staircase: a +1.51 step
with a 0.55 u tread, target 46 deg. On the gym it engaged on 288 ticks. That was a visible camera swing on
plain stairs, which READABLE_RISE never checks (`ground` rises are skipped). At 3.16 u it engages on **0 of
1,161 ticks** of chapter 1. On the gym it engages on 79 ticks, all at its +5.27 face (standoff 0.70, target
70 deg).

**Assisted ceilings.** These are the largest rises still readable, at 0.01 u resolution, from rest, at the
2 u standoff. They are pinned in `npm run lint:self` at the value (accepted) and at +0.01 (rejected).

| landing depth | 2.5 | 6 | 15 |
|---|---|---|---|
| max readable rise, assisted (u) | 4.48 | 4.62 | 4.67 |
| rest pose (D-016) | 2.28 | 2.92 | 3.18 |

**Wall and climb at their characteristic rise** (lint at the pitch it settles at, then the real rig):

| face | linter | harness, real rig |
|---|---|---|
| +3.50 onto 6 u | 24 deg | 2.42 deg band at 24.0 deg |
| +4.00 onto 6 u (wall) | 28 deg | 2.33 deg band at 28.0 deg |
| +4.50 onto 6 u (climb) | 32 deg | 2.17 deg band at 32.0 deg |
| +4.50 onto 15 u (climb) | 30 deg | 2.33 deg band at 30.0 deg |
| +4.50 onto 2.5 u | no pitch reads | 0.00 deg, assist idle |

With `?pitchassist=off` every one of these reads 0.50 deg or less.

**ASSIST_CASE (OQ-052 item 7).** The table above uses an unobstructed arm (B-23 below models the collided one). Every chapter waypoint that passes
READABLE_RISE only because of the assist is also run in its real level, by the `pitch-assist` stage. It must read
in the real rig, at the pitch modelled here.
- **Proof fixture:** the same +4.0 wall reads 2.33 deg when clean. Under an overhang 3.6 u high behind the
  approach it reads 0.00 deg (arm pulled in), and the check fails it.
- **Today:** gym and chapter 1 have 0 cases. A climb at maxRise 4.50 needs a landing at
strictly more than 2.55 u deep (2.56 tested). The former inclusive 2.55 claim is superseded by the RB-003/RB-004 edge measurement below.

**B-23: the collided arm (2026-11-08).** READABLE_RISE no longer assumes an unobstructed arm. It predicts
the eye the camera actually produces, in the camera's own two steps:
1. The assist picks its target pitch with the free-arm rig (`assistPitchDeg`).
2. The arm then collides: a ray from the pivot back along the view, shortened by `allowedArm` (now in
   `camera-tuning.ts`, shared with the camera).

The ray is cast against every static collider of the level: prim boxes exactly, and kit meshes as their
real collision triangles. **No new number:** `minDistance` 0.8 and `collisionPadding` 0.3 are the camera's
own `CAMERA_TUNING` values.

Linter against real rig, camera behind the facing, 2 u standoff (`pitch-assist` stage, B-23 proof):

| face | wall behind the stand point | linter: eye, band | real rig band | verdict, both |
|---|---|---|---|---|
| +3.75 onto 3.5 u (in wall's band) | 1 u (chapter 2's shape) | +1.91 at 29 deg, 0.00 deg | 0.00 deg at 29.0 | rejected |
| +3.75 onto 3.5 u | none | +4.89 at 29 deg, 2.39 deg | 2.42 deg at 29.0 | reads |
| +2.50 onto 3.5 u (below the band) | 1 u | +1.75 at 18 deg, 0.00 deg | 0.00 deg at 18.0 | rejected |
| +2.50 onto 3.5 u | none | +3.66 at 18 deg, 2.19 deg | 2.17 deg at 18.0 | reads |
| +4.0 onto 6 u, overhang 3.6 u high behind | overhang | +3.46 at 28 deg, 0.00 deg | 0.00 deg at 28.0 | rejected |
| chapter 2 `critical_path[5]` as first shipped, +2.50 | 1 u, cliff wall 8.5 tall | +1.75 at 18 deg, 0.00 deg | 0.00 deg, eye +1.76 | **rejected** |
| chapter 2 `critical_path[5]` rebuilt (B-23), +3.75 onto a 1 u shelf | 1.5 u, wall 3.25 tall | +7.16 at 54 deg, 3.54 deg | 3.50 deg at 54.0 | reads |

**Wall jumps.** A wall jump needs its wall close behind the stand point. Wall to landing is at most
`MOVE.wall.maxH` 4.2, so the wall is at most about 1.7 u back, and the arm meets it. The two
constraints, measured:
- **A tall wall never reads.** With it 1 u behind, the arm sits at `minDistance` and the eye is +1.75 at
  rest. No pitch the camera chooses shows a top a wall jump is needed for (OQ-062's first table).
- **A short wall reads, inside wall's band.** The wall must be short enough for the steep arm to pass over
  it. Rises at or above the probe height (3.16) get assisted pitches that steep. A shallow landing pushes
  the pitch steeper still (1 u: 53-55 deg).

The tallest wall that still reads is 2.80-2.90 at 1 u back and 3.45-3.60 at 1.5 u back (1 u landing,
+3.50 to +4.00).

The wall must also be tall enough to kick off. The nav bot sailed over walls 2.2 and 2.5 tall, and
wall-jumped off walls 3.0 and 3.5 tall (both 1 u back, +3.75).

So the teachable window is: rise in wall's band, wall about 1.5 u back and between about 3.0 and 3.5 tall,
landing about 1 u deep. Chapter 2 is rebuilt to the middle of it: +3.75, wall 3.25 at 1.5 u, 1 u shelf
(OQ-062).

## B-15 harness protocol: run-metric and ambient-motion (2026-11-08)

These are test-protocol parameters, not budgets. They are listed so that no number in
`tools/harness/run-metric.ts` or `tools/harness/ambient-motion.ts` lives only in code.

| parameter | value | why |
|---|---|---|
| run-metric: heavy run idle before dying | 900 ticks (15 s) | long enough that a run timer shows a different whole second from the clean run |
| run-metric: deaths, clean vs heavy | 1 vs 3 | a death counter must differ between the runs |
| run-metric: idle after the deaths / on results | 300 / 600 ticks | a timer that only ticks on results is also seen |
| run-metric: sample spacing while idle | 60 ticks | 1 s |
| ambient-motion: idle per level | 10 samples × 60 ticks (10 s) | the gym's slowest platform and chapter 1's patrollers both move well inside it |
| ambient-motion: motion threshold | 1e-4 u | float noise in getWorldPosition; any visible motion is >1e-2 |

Measured first run, 2026-11-08: run-metric 15/15 (A: 1 death, B: 3 deaths, play/death/results texts
identical). ambient-motion: gym 33 renderables, 3 moved (platform, player); 01-lower-stair 45, 6 moved
(hazard, player); 0 untagged.

Shown to fail before being listed as `harness` rows in SPEC §7:
  - HUD `fell (${deaths})`: run-metric FAIL 13/15 ("fell (1)" vs "fell (2)" vs "fell (3)")
  - results `COMPLETE ${t}s`: run-metric FAIL 14/15 ("COMPLETE 19s" vs "COMPLETE 39s")
  - a checkpoint bobbing 0.3 u: ambient-motion FAIL on both levels ("moved 0.279 u")

## Open (H4)

- Linux visual goldens for the asset-bearing gym were COPIED from Darwin, not rendered on
  Linux. Basis for the copy: main's Darwin and Linux sets are pixel-identical on all 6 cameras.
  Not yet confirmed on CI: the branch is unpushed, and Linux SwiftShader could pick a different
  KTX2 transcode target than macOS (ASTC 4x4 here).
- Tier-2 (hardware only): which compressed format a real GPU transcodes to, and GPU memory.
  SwiftShader advertises ASTC, ETC1, ETC2, S3TC and BPTC, so in CI the texture STAYS
  compressed (ASTC 4x4). That is a property of SwiftShader, not a guarantee about players' GPUs.

## RB-003 / RB-004 independent verification (2026-11-09)

Codex's counterexamples were independently reproduced by Claude at ad1eef8 and b8dfd5f;
verification report: `state/CLAUDE-VERIFY-RB003-RB004.md` in the `claude-rbverify` worktree.
Tim authorized the confirmed fixes and four-chapter playthrough on 2026-11-09.

- Forward beam: original chapter 2 + box [55,10.35,0], scale [0.5,0.7,7]. Lint accepted;
  real landing band 0 degrees. Control with beam lifted 3 u: readable again. A rear beam
  [49.5,10.6,0], scale [1,0.4,7], hides the top without colliding the arm or obstructing nav.
- Rotated rear slab [4,4,1], scale [0.3,8,4], yaw 45: envelope arm 4.87 versus real arm 7.0;
  real band 2.647 degrees. Use exact oriented boxes, not their world-axis envelopes.
- Landing top 2.5 with waypoint 2.2 on a 2.5-deep shelf: real band 1.715 degrees, model 2.122.
  Use geometry heights for the rise; waypoint tolerance locates support, not a substitute height.
- The 4.48 / 4.62 / 4.67 ceilings remain correct for ideal feet-relative coordinates.
  Fixture feet settle 0.00997391585 above the authored floor: authored rise is conservative by
  about 0.01 u. Do not add that skin to movement or readability budgets.
- The exact 2.55-depth prescription above is superseded: it must be **strictly deeper than 2.55**;
  2.56 is the tested working value. At +4.50, 2.549 and 2.550 read 0 degrees, 2.551 and 2.560 read
  2.059/2.060 degrees by independent target-directed rays. The final float32 ray at 12.55 lands
  exactly on the far edge and is missed; the model had counted it.
- `PITCH_ASSIST.sampleEdgeMarginM = 1e-4 u` is a conservative numerical guard for the model's
  down-ray samples, not a new camera or gameplay budget. The measured sample/edge discrepancy is
  2.384e-7 u at the 2.55 fixture. A 1e-4 margin rejects edge-dependent samples while retaining
  the measured 0.001 u interior control. Regression fixtures pin both sides; the runtime probe
  is unchanged. This guard is not a guarantee for arbitrarily large world coordinates.
- Static visibility subtracts exact projected occlusion intervals from the top band; it introduces
  no ray-count or angular sampling budget. Runtime READABLE_CASE uses the existing 720-ray
  protocol (VIEWPORT.height * 2), and the real snapped camera at the exact prescribed stand point.
  One warm-up physics tick builds Rapier queries before the snapshot; no settling/falling is used
  for this pose check. Existing 30-tick ASSIST_CASE checks remain for assisted standing faces.

### RB review follow-up: render visibility (2026-11-09)

Claude independently measured the render-only rear beam at [49.5,10.6,0], scale
[1,0.4,7], as hiding chapter 2 cp[9] while the physics band stayed 4.5 degrees.
The corrected 720-ray rendered-mesh check rejects it and accepts the control
lifted to y=13.6. Camera arm physics is unchanged. For threshold-adjacent results,
the protocol refines 720 samples to 7200 (10x), yielding 0.008333 degrees per ray
at the 60-degree FOV. Each observed visible interval contributes one row of
endpoint uncertainty; if that interval of uncertainty overlaps 2 degrees after
refinement, READABLE_CASE fails as ambiguous. This is sampling precision, not a
relaxed readability budget, and cannot bound features missed between all rays.
## D-018 post constants (2026-11-09)

`src/engine/ink-post.ts`, `INK_POST`. The §6 pass every level now renders through.

| Constant | Value | Kind | Basis |
|---|---|---|---|
| nearBandM, midBandM | 25 u, 80 u | STYLE §3 | the Bible's band table, distance from the camera (per pixel, along the view ray) |
| value_compression map | near i; mid i<=2 ? i : 2+floor(3(i-2)/5); far i==0 ? 0 : 1 | derived | i = nearest §2 step, 0 paper ... 7 ink-black. Mid never exceeds ink-grey (§3's dark bound); far is ONE mist-pale silhouette with paper kept (§3 "silhouette only"). It only ever LIGHTENS: §3's literal mid floor (wash-light) turned the paper cloud sea and paper path tops grey between 25 and 80 u, a visible dark ring (first render, D-018), which the seed never shows (hero_3s/7s/11s: path and cloud are paper at every distance). Recorded as a §3 conflict in OQ-067 |
| edgeLaplacian | 0.002 | measured | relative screen-space Laplacian of 1/z. 1/z is linear across a plane, so a face reads 0; 24-bit-float depth noise at 70 u is ~4e-5 relative, 50x under it; a kit fracture stroke 0.02 u proud of its face crosses it only inside ~10 u, where it is ink anyway. Gate: 100% of near and 99.9% of mid silhouettes inked in ch1 |
| nearEdgePx / midEdgePx | 2 / 1, ink-black / ink-grey, far none | STYLE §3 | "Outlines: black, full weight / grey, thin / none" |
| grainAmp | 3/255 | derived | must stay under ACCENT_AREA's 6/255 exact-match tolerance or grain would hide a gate. Measured sky sd 1.50 levels, max |dev| 3 |
| grainSeed | 20261109 | authored | constant: static grain, deterministic goldens |
| accentChroma | 0.2 (51 levels) | derived | the ramp's largest chroma is paper-cream's 30 levels; every accent.json candidate is above 140 |
| ROBE | #7d8590 | STYLE §2 | "near #7d8590" (src/engine/palette.ts) |

## D-018 post gate (2026-11-09)

Harness stage `post` (tools/harness/post.ts), every level, the six visual cameras, from the pixels plus a per-pixel
distance readback of the same frame. It fails when a pass is ABSENT, not when a golden moves. Proof, chapter 1,
each mutation made in the CODE (`SECTION6_PASSES`, or a light added to the loader), the stage run, the code
restored:

| Mutation | Stage | What caught it |
|---|---|---|
| none (shipped) | PASS 11/11 | 3 of 456,152 mid/far px off-band (0.001%, band-edge rounding); 7,797/7,797 near silhouettes inked; sky sd 1.50; 0 hue px |
| value_compression removed | FAIL 9/11 | pass list; 20,057 of 456,152 mid/far px darker than their band (4.397%, allowed 0.2%) |
| ink_edge removed | FAIL 8/11 | pass list; 496 of 6,226 near silhouettes inked (8.0%, need 95%); mid 0 of 2,482 |
| paper_grain removed | FAIL 9/11 | pass list; sky sd 0.00 levels (need >= 0.5) |
| a DirectionalLight added | FAIL 10/11 | §1: `DirectionalLight` in the scene |

## D-018 before / after: is the frame a painting (2026-11-09)

Share of non-accent, non-robe pixels OFF the §2 ramp (farther than 4 levels from every step: grain 3 + rounding),
and the number of distinct colours. Lit shading cannot stay on an 8-step ramp; flat fills can. Before = main
d173785's darwin goldens; after = this branch's.

| Frame | Before: off-ramp | Before: colours | After: off-ramp | After: colours |
|---|---|---|---|---|
| 01-lower-stair cam2 | 65.5% | 200 | 0.0% | 14 |
| 00-gym cam3 | 97.6% | 178 | 0.0% | 12 |
| 02-cliff-seam cam2 | 67.9% | 185 | 0.0% | 14 |

Frames: `docs/build-log/d018/`.

## D-019 post constants (2026-11-10)

`src/engine/ink-post.ts`, `INK_POST`: the ink edge and the near value push. D-018's `edgeLaplacian`,
`nearEdgePx` and `midEdgePx` (rows in "D-018 post constants" above) are SUPERSEDED: the crease test they served
is gone.

| Constant | Value | Kind | Basis |
|---|---|---|---|
| silhouetteGap | 0.02 (relative, in 1/z) | derived | a silhouette is two surfaces that do not meet. Each side of a pixel boundary is continued from its own two depth samples (1/z is linear across a plane in screen space); a line needs BOTH continuations to stay this far apart. One plane at any grazing angle: exactly 0. A crease: opposite signs. A step-down between parallel tops: the gap itself (the gym's 0.4 u treads at 5-20 u are 2-8%). 2% keeps a 0.02 u stroke proud of its face unlined beyond 1 u. The first cut, "a neighbour 1.2x farther", inked flat ground below ~4.4 deg grazing and missed gaps under 1.2x (independent review, verified) |
| diagonal step, uPx | whole pixels; integer | measured | a 0.7071 px diagonal step on the NEAREST-sampled depth texture lands on unevenly spaced texels and manufactures a gap on a receding plane: 25.2% of flat-ground px inked in the grazing camera, 0.1% with whole-pixel steps |
| strokeBasePx | 3 px within 8 u, 2 px to 16 u, 1 px to 25 u, none beyond | authored, STYLE §3 as amended | weight falls with distance; distant forms carry no line (Tim, D-019). At 360p |
| strokeMaxPx | 4 | authored | the seed's heaviest contour blobs against a 360p frame |
| strokeFreq | 0.6 /u | authored | the stroke's weight changes over ~1.5-2 u of the form (seed hero_7s path edge) |
| strokeGap, strokeGain | 0.36, 2.2 | measured | noise below the gap lifts the brush: 58-71% of high-contrast silhouette px inked, 1 px hairline share 34-48% |
| lowContrast | 0.04 (10 levels) | derived | under half the smallest gap between adjacent ramp steps (19 levels): only forms shown at the SAME step. There the stroke never breaks |
| pushSteps | +3 inside 12 u at most, +2 to 20 u, +1 to 24.9 u; steps 0 and 1 (paper, mist) never | measured | dark mass (ink-grey or darker) 23-46% of the near field; 1.0% with the push removed. Paper and mist are exempt so that no walkable top and no cloud is ever pushed |
| washFreq, washJitter | 0.12 /u (x1, x3.7, x11 octaves), 0.35 | authored | each boundary is pulled INWARD by up to 35%, never outward, so the push ends inside 24.9 u by construction. The first cut (+-30%, one octave) left a hard cut at exactly 25 u and arcs centred on the camera (review). Still per pixel by camera distance: OQ-068 item 4, B-43 |
| LEVEL_VISUAL topColor / defaultColor | mist-pale / stone-mid | derived | an undressed box: top one step off the paper sky at any distance, faces two steps below the top (43 levels) |
| LEVEL_VISUAL tagColors, platformTopColor | paper-cream | derived | what marks ground (goal pad, spawn pad, a moving platform) is paper on the mist ground: the only other value the push exempts |

Gate constants, `tools/harness/post.ts` `POST_GATE` (D-019):

| Constant | Value | Basis |
|---|---|---|
| jump, smooth | 1.25, 1.1 | a 4-neighbour this many times farther = a strong silhouette; every neighbour within 1.1 = no depth jump here |
| creaseLap | 0.004 | relative Laplacian of 1/z below -this with no jump = a convex crease; the depth readback's noise at 25 u is ~3e-4 |
| stepGap | 0.02 | = silhouetteGap, re-derived from the readback: a small step-down is a silhouette, not a crease |
| sameValue, clearValue | 14, 40 levels | across a silhouette: within 14 = the same step (grain 3 each side + rounding); 40 = two steps |
| inward walks | 3, 5, 7 px; width cap 6 px; "clearly lighter" 12 levels | 3 px clears a 2 px line; 5 px reads the form behind a 4 px stroke; 7 px for stroke width; 12 levels is over half the smallest ramp step |
| minClass | crease 500, mid 300, flat 50, weight 200, plane 2000 px | a check on an empty class proves nothing; shipped classes are 4-80x these, except same-value edges (151-778; the gym has 333) |
| graze, grazeSlope, planeLap | 1.5 u past spawn, 14 u ahead, eye 0.35 u; 1%/row; 0.0005 | a camera almost in the ground plane; a pixel deep inside a plane within ~100 rows of its vanishing line, planar 6 px every way |
| thresholds | edgeHit 35-92%, minFlatEdgeHit 95%, minWeightShare 10%, maxCreaseInk 45%, maxMidLine 35%, minNearDark 10%, minNearBlack 0.2%, maxPlaneInk 1% | each between the measured wrong value and the shipped value: table below |

## D-019 ink edge and value range (2026-11-10)

Harness stage `post`, every level, the six visual cameras plus the grazing camera. Darwin SwiftShader. Where a
cell reads "a -> b", a is PR #27's shader (D-018) and b is this branch. The D-018 crease and mid figures were
measured under the first version of those two checks (before real step-downs were excluded from the crease class).

| Level | Silhouette px inked where value separates the forms (35-92%) | ... where the forms are the same value (>= 95%) | 1px hairline share (>= 10%) | Interior creases that are an ink line (<= 45%) | Flat ground inked, grazing camera (<= 1%, dressed) | Mid silhouettes with a drawn line (<= 35%) | Near field: dark mass, ink-grey or darker (>= 10%) | ... ink-black mass (>= 0.2%, dressed) |
|---|---|---|---|---|---|---|---|---|
| 00-gym | 100.0% -> 70.6% | 100.0% -> 100.0% (333 px) | 0.0% -> 33.9% | 56.1% -> 5.2% | 0.0% | 71.3% -> 3.7% | 43.3% | 0.9% |
| 01-lower-stair | 100.0% -> 65.9% | 100.0% -> 98.0% (539 px) | 0.0% -> 37.0% | 64.4% -> 35.0% | 0.1% | 69.3% -> 3.0% | 23.3% | 0.8% |
| 02-cliff-seam | 100.0% -> 69.6% | 100.0% -> 100.0% (151 px) | 0.0% -> 46.9% | 69.8% -> 8.9% | 1.6% | 81.6% -> 2.9% | 43.9% | 1.0% |
| 03-drifting-stones | 100.0% -> 69.1% | 100.0% -> 96.4% (778 px) | 0.0% -> 48.1% | 66.2% -> 5.7% | 0.4% | 76.5% -> 1.8% | 32.3% | 0.8% |
| 04-summit-ridge | 100.0% -> 58.4% | 100.0% -> 98.7% (232 px) | 0.0% -> 47.2% | 66.8% -> 10.1% | 0.1% | 78.4% -> 3.4% | 38.3% | 1.0% |

Chapter 1's crease lines are the kit's own lip and nosing bands (B-38), not the post pass. 02's 1.6% of inked
flat ground is dark material lying on that ground, which is why the check is judged on dressed levels only.

Proof that each check bites: the shader SOURCE mutated, the stage run on chapter 1, the source restored
(byte-compared).

| Mutation | Stage | What caught it |
|---|---|---|
| none (shipped) | PASS 17/17 | |
| stroke weight constant 2 px, never lifts | FAIL 15/17 | 100.0% of silhouette px inked; no 1 px hairline |
| every convex crease outlined (the D-018 Laplacian test) | FAIL 15/17 | 76.3% of interior creases are an ink line |
| line drawn on mid-band forms | FAIL 15/17 | 61.4% of mid silhouettes carry a line; 1.43% of mid px darker than ink-grey |
| near push removed | FAIL 16/17 | dark mass 1.0% of the near field |
| push capped at ink-deep | FAIL 16/17 | ink-black mass 0.0% |
| the stroke allowed to break on same-value edges | FAIL 16/17 | 70.4% of same-value silhouette px inked |
| diagonal steps of 0.7071 px | FAIL 16/17 | 25.2% of flat-ground px inked in the grazing camera |
| value_compression removed | FAIL 13/17 | pass list; 5.477% off-band; dark mass 1.0% |
| ink_edge removed | FAIL 13/17 | pass list; 15.4% and 4.3% inked |
| paper_grain removed | FAIL 15/17 | pass list; sky sd 0.00 |
| the first D-019 test, "a neighbour 1.2x farther" | **PASS 17/17: NOT CAUGHT** | at this grazing pose that test inks only within ~6 px of real edges, which the flat-ground class excludes. A gate limit, recorded with OQ-068's two |

Value structure against the seed, the same frame as D-018's sheet (share of non-accent pixels nearest each §2
step; `docs/build-log/d019/sheet-ch1-cam2.png` is [seed hero_7s | D-018 | D-019]):

| Step | Seed hero_7s | ch1 cam2, D-018 | ch1 cam2, D-019 |
|---|---|---|---|
| paper-cream | 37.2% | 26.1% | 28.3% |
| mist-pale | 9.5% | 16.9% | 18.0% |
| wash-light | 16.1% | 19.4% | 7.0% |
| stone-mid | 5.8% | 14.5% | 5.9% |
| wash-mid | 8.4% | 10.4% | 17.3% |
| ink-grey | 9.6% | 1.8% | 12.9% |
| ink-deep | 8.0% | 0.0% | 6.2% |
| ink-black | 5.4% | 10.9% | 4.4% |

D-018's ink-black was all line; its dark MASS was 1.2% of the near field. Still off the seed, recorded rather
than tuned away: the slab faces of the kit (B-37, B-38) and the paper share (B-42, not started by instruction).

ACCENT_AREA, chapter 1 (the hue untouched): 0.2222 / 0.3021 / 0.4214 / 0.4835% of the frame (D-018: 0.103 / 0.168 / 0.241 /
0.243%; floor 0.0204%).

Collision and simulation: no level, asset or linter file is touched (`git diff origin/ch1-assets -- levels assets
tools/lint-level.mjs` is empty), so every geometry fingerprint is PR #27's. The full playtest passed with replay
against the committed, un-re-recorded traces on all five levels, and every scene ratchet held exactly
(33/1102, 75/6502, 49/5050, 49/5662, 48/5038).

## Harness step() draw fix (2026-11-10, OQ-069)

No constant changes. This records why a level job outgrew its 20-minute timeout on PR 29 and what the fix
measures. `step(frame, false)` drew every tick (see OQ-069); the bot now draws only the ticks it asks for
(`NAV_CONFIG.renderEvery`, unchanged at 30).

CI, Linux SwiftShader, 640x360, seconds per stage. PR #27 head 164c9fb is D-018 (run 42844946239); PR 29 head
5f93f22 is D-019 (run 42861208215, attempt 2). Both draw every tick; the difference is the D-019 shader.

| Level | nav D-018 | nav D-019 | phase-sweep D-018 | phase-sweep D-019 | level job D-019 |
|---|---|---|---|---|---|
| 00-gym | 43.2 | 65.7 | 334.8 | 429.7 | 9.6 min |
| 01-lower-stair | 45.1 | 70.4 | 486.6 | 792.6 | 16.3 min |
| 02-cliff-seam | 38.6 | not reported | 331.8 | over 1036 (cut in segment 4 of 5) | cancelled at 20 min, both attempts |
| 03-drifting-stones | 52.6 | 104.7 | 385.7 | 788.4 | 17.1 min |
| 04-summit-ridge | 45.4 | 87.0 | 379.0 | 746.2 | 15.6 min |

CI after the fix, same D-019 shader, head 5b7b11f (run 42872162141). Every stage passed on every level; the
only failure was 02-cliff-seam's `visual`, against Linux goldens it had never been able to produce:

| Level | nav | phase-sweep | chaos | level job |
|---|---|---|---|---|
| 00-gym | 7.5 | 47.9 | 25.1 | 2.8 min |
| 01-lower-stair | 4.1 | 37.1 | 18.6 | 2.3 min |
| 02-cliff-seam | 7.8 | 61.0 | 22.7 | 3.1 min |
| 03-drifting-stones | 5.8 | 29.8 | 31.4 | 2.3 min |
| 04-summit-ridge | 7.0 | 51.8 | 22.4 | 2.9 min |

chaos is now the same order as phase-sweep: it still draws every tick (B-44).

Local, darwin SwiftShader, D-019 head, the same commit before and after the fix:

| | nav before | nav after | phase-sweep before | phase-sweep after | level before | level after |
|---|---|---|---|---|---|---|
| 02-cliff-seam | 13.4 s | 2.2 s | 127.3 s | 13.6 s | 168 s | 42 s |
| 03-drifting-stones | 15.2 s | 2.3 s | 111.4 s | 11.4 s | 157 s | 44 s |

Full playtest (five levels and the once-per-run stages), after: PASS in 229 s. Before: not re-timed here; the
handoff gives about 12 min.

Simulation unchanged: for both levels the before and after `harness-report.json` differ in 15 fields, all of
them durations (`ms`, `durationMs`, `startedAt`), and in no check, detail or data value. Goldens unchanged.

## INK-HIRES display constants (2026-11-10)

`src/engine/ink-post.ts`, `INK_DISPLAY`: the display path, taken on any drawing buffer taller than 360 lines. The
reference path (360 lines or fewer, the harness's 640x360) is the D-019 shader, untouched; every `INK_POST`
constant above serves both.

| Constant | Value | Kind | Basis |
|---|---|---|---|
| referenceLines | 360 | derived | the frame every stroke weight is authored on, and the harness's height. At or below it the reference shader runs and the output is the goldens' own bytes (table below) |
| maxScale | 2 (internal texels per canvas pixel, per axis) | measured | at 2 each canvas pixel is an exact box of 4 decisions; edge pixels carrying an in-between value go from 0.3-1.2% to 28-57% (table below). Anything up to 5120x1440 runs at this scale or just under it |
| maxInternalPixels | 24,000,000 | measured | the frame-rate cap, set on the M4 Max at 5120x1440 (144 Hz, period 6.94 ms): frame cost in the worst view is 4.01 ms at 20M, 4.65 ms at 24M, 5.56 ms at 30M (a full 2x). 24M leaves a third of the period spare in that view and 45% in the player's own view. 5120x1440 therefore runs at 1.80x (9238x2598 internal); 2560x1440 and 1920x1080 at the full 2x |
| stride | uUnit rounded UP to a whole texel | measured | whole texels because the depth texture is sampled NEAREST (D-019's finding). Up, not to nearest: at 1.80x a 360p pixel is 7.2 texels, a stride of 7 makes the same-value rule take two strides where one reaches, and cost stopped falling with the internal size (rig view 4.10 ms at 24M against 4.56 ms at 30M; with the stride rounded up, 3.84 ms) |
| stroke weight | a real number of texels; last texel covered in part | derived | the reference rounds base x noise to whole 360p pixels, which at 1440 lines is a stroke that changes width in 4 px blocks |
| strokeBase (display) | the line through (4 u, 3 px), (12 u, 2 px), (20.5 u, 1 px), flat outside | derived from strokeBasePx | the centres of the reference's three distance bands. As steps, a receding stroke drops 4 device px at exactly 8 u and 16 u at 1440 lines |
| boundary bisection | a texel has left this surface when it lies more than 0.5 x silhouetteGap behind this surface's continuation; at most 8 halvings | derived | the silhouette test has already found the far side a full silhouetteGap behind at the far tap, so half of it separates the two surfaces at every texel between the taps. 8 halvings place the boundary to the texel for any stride up to 256 texels (the stride is 8 at 5120x1440) |
| diagonal step | counted as 1.414 texels | derived | the reference counts it as 1, which at 360 lines is a rounding and at 1440 a stroke 41% heavier across a diagonal edge |
| resolve | ceil(scale) x ceil(scale) bilinear taps, (scale - 1) / (taps - 1) texels apart, averaged in linear light | derived | at a whole scale every tap is a texel centre (an exact box); at scale 1 it is the texel itself. The internal target is sRGB-encoded, so GL decodes before it filters |
| grain (display) | value noise on the 360p pixel lattice, up to 5 octaves x2 finer down to one device pixel (each offset 17 lattice cells from the last), weights halving, amplitude grainAmp | derived | the reference's grain is one hash per device pixel: at 1440 lines the same paper would be 16x finer. Bounded by the same grainAmp (3 levels), static, seeded from grainSeed |

## INK-HIRES display sizes: before / after (2026-11-10)

Tim, after playing full screen at 5120x1440, 144 Hz, device pixel ratio 1, M4 Max: "very low rez and pixelated,
quality is bad, slow refresh". Measured with `tools/measure-display.mjs` (new): the harness bundle in HEADED
Chrome, GL renderer `ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Max)`, chapter 1, eight views (the player's
rig camera at spawn, the visual stage's six cameras, the post gate's grazing camera), 360 frames each, every
frame one fixed tick and one full render. Before = 8d7858f (D-019 as merged into PR 29); after = this change.
Frames and numbers: `docs/build-log/ink-hires/` (`before.json`, `after.json`, the PNGs, 1:1 crops).

What was wrong, measured:

| Reading | Verdict | Evidence |
|---|---|---|
| no anti-aliasing: `antialias: true` covers only the default framebuffer, the scene target has no samples | CONFIRMED | edge pixels carrying an in-between value: 0.3-1.2% at every size (`tools/edge-stats.mjs`, new). Every edge in the frame, fill or line, was a one-pixel staircase |
| the post is authored at 360p and works in `uPx` blocks | PARTLY | true of the ink stroke only: its depth taps and its weight moved in `uPx` = round(height / 360) device px (4 at 1440 lines), so a stroke changed width in 4 px blocks (`crop-before-5120x1440-*.png`). The fills, the wash noise (world space) and the grain (per device pixel) were at device resolution: the frame was not a 360-line image |
| the fragment shader is too slow at 7.4 Mpx | REFUTED | below: 144 fps at every size, a frame cost 1.4-1.7 ms at 5120x1440. "Slow refresh" was not reproduced in Chrome; see the note under the table |

Frame time, ms. `frame` is the interval between animation frames with vsync on (it cannot go below the display's
6.94 ms); `cost` is wall time per frame with the GPU forced to finish (a 1 px readPixels after every 8 frames).
Worst of the eight views:

| Size | frame p50 before | frame p95 before | frame p50 after | frame p95 after | frames over 10 ms (before / after, of 2880) | cost p50 / p95 before | cost p50 / p95 after | internal buffer after |
|---|---|---|---|---|---|---|---|---|
| 1920x1080 | 6.9 | 7.7 | 6.9 | 7.7 | 0 / 0 | 0.64 / 0.80 | 1.88 / 1.95 | 3840x2160 (2x) |
| 2560x1440 | 6.9 | 7.8 | 6.9 | 7.8 | 0 / 0 | 1.00 / 1.05 | 3.20 / 3.24 | 5120x2880 (2x) |
| 5120x1440 | 6.9 | 7.7 | 6.9 | 7.8 | 0 / 0 | 1.65 / 1.68 | 4.60 / 4.63 | 9238x2598 (1.80x) |

The player's own view (rig camera at spawn) costs 0.54 / 0.86 / 1.39 ms before and 1.55 / 2.60 / 3.78 ms after.
The production bundle with its real loop (60 Hz fixed tick, interpolated), W held for 8 s at 5120x1440: 1152
frames, p50 6.9 ms, p95 7.5 ms, max 7.9 ms, none over 10 ms; before the change, 1152 frames, max 7.9 ms.

Not reproduced: slow refresh. In Chrome on this Mac the game held the display's 144 Hz before the change and
holds it after. If it was seen in another browser (Safari by default holds animation frames near 60 Hz), that
is where to look, and this tool cannot say.

Is it anti-aliased now (`tools/edge-stats.mjs`: of pixels on a strong horizontal edge, the share whose value
lies between its two neighbours'):

| Size | rig before | rig after | cam2 before | cam2 after | graze before | graze after |
|---|---|---|---|---|---|---|
| 1920x1080 | 0.7% | 41.9% | 0.4% | 40.6% | 1.2% | 37.9% |
| 2560x1440 | 0.6% | 45.0% | 0.3% | 40.8% | 1.2% | 28.5% |
| 5120x1440 | 0.6% | 57.4% | 0.3% | 52.9% | 1.1% | 40.9% |

Is it the same picture (`tools/same-picture.mjs`, new: the display frame box-downscaled to 640x360 against the
darwin golden of the same camera, chapter 1 cam2; `over` = pixels more than 32 levels apart):

| Display frame | mean difference / 255 | over |
|---|---|---|
| 1920x1080 before | 3.25 | 2.35% |
| 1920x1080 after | 3.74 | 2.43% |
| 2560x1440 before | 3.32 | 2.31% |
| 2560x1440 after | 3.69 | 2.43% |

The difference image is lines only: the strokes and the edges, no area. The wash bands and every fill land
where the reference puts them, and the new path is as close to the reference as the old one was.

The grazing camera at 5120x1440 (`after-5120x1440-graze.png`): the flat ground carries no line. Judged by eye;
the `post` gate judges that pose at 360 lines only.

Where the display path's cost goes, 5120x1440 at a full 2x, rig view: the supersampled scene, an empty post and
the resolve 2.2 ms; value_compression 0.65 ms; ink_edge 1.8 ms (2.45 ms before its depth taps were shared between
opposite directions and fetched only when the near side asks: 5.25 ms a frame, then 4.57).

Byte identity at 640x360 (the constraint: the committed goldens hold). All 30 visual-stage cameras, rendered as
the harness renders them (headless Chromium, SwiftShader) and compared byte for byte with
`tools/harness/golden/darwin`:

| Level | Result |
|---|---|
| 00-gym, 02-cliff-seam, 03-drifting-stones, 04-summit-ridge | 24 of 24 cameras identical, every run |
| 01-lower-stair | 6 of 6 identical in one run of five; in the others 2 or 3 cameras differ in ONE pixel each |

Those single pixels are not this change. The same pixels differ, run to run, with the D-019 shader at 8d7858f
untouched (six runs: cam3 (606,91), cam4 (146,279), cam0 (450,93), cam5 (586,91), once cam5 (1,285) and
(2,286)): a pixel of paper showing through chapter 1's dressing, present or not from one run to the next. The
`visual` gate's 0.5% allows 1152 such pixels; recorded here because "byte-identical" was the bar.

Not measured: any GPU but this one. The cap is this Mac's. A weaker GPU at a large drawing buffer pays up to 4x
the pixels it paid before and nothing here lowers the scale when frames run long.

## D-020 scene budgets and the whole-scene cap (2026-11-10)

The "Scene budgets" table above is RAISED to these peaks (`tools/assets/budgets.json` `scenes`), measured by the
harness `counters` stage on the D-020 build. Reason: the figure (29,400 triangles, was a 324-triangle capsule),
the hero torii (9,510 triangles a gate, was 108), and the paint layer's depth-only pass, which draws the ink
geometry a second time; chapter 1 also draws 9 hero dressing meshes and 14 backdrop meshes.

| Level | Peak draw calls, D-019 -> D-020 | Peak triangles, D-019 -> D-020 |
|---|---|---|
| 00-gym | 33 -> 62 | 1,102 -> 68,562 |
| 01-lower-stair | 75 -> 140 | 6,502 -> 381,066 |
| 02-cliff-seam | 49 -> 94 | 5,050 -> 132,870 |
| 03-drifting-stones | 49 -> 94 | 5,662 -> 134,094 |
| 04-summit-ridge | 48 -> 92 | 5,038 -> 132,846 |

The whole-scene cap for hero content is the heaviest scene that has been measured on a real GPU, which is chapter
1's line above. `tools/measure-display.mjs`, headed Chrome, ANGLE Metal on an Apple M4 Max, 360 frames a view,
one fixed tick and one full render a frame (`docs/build-log/d020/art-pass-1.json`):

| Size | View | Frame p50 / p95 | Rate | Cost p50 / p95 |
|---|---|---|---|---|
| 2560x1440 | rig at spawn | 6.90 / 8.50 ms | 144.9 fps, 0 frames over 10 ms | 3.15 / 3.24 ms |
| 2560x1440 | cam2 | 6.90 / 8.40 ms | 144.9 fps | 2.96 / 3.02 ms |
| 5120x1440 | rig at spawn | 6.90 / 8.50 ms | 144.9 fps | 4.39 / 4.46 ms |
| 5120x1440 | cam2 | 6.90 / 8.50 ms | 144.9 fps | 4.01 / 4.06 ms |

Before the art pass the same views cost 1.4-1.7 ms at 5120x1440 (INK-HIRES). A scene heavier than 140 draw calls
and 381,066 triangles has not been measured: raise chapter 1's line only with a new run of this tool. The Tier-1
ceiling (500,000 triangles, 300 draw calls) still applies on top. Taken with the two cliff stacks at their first
size; they were made smaller afterwards, which does not change a triangle count.

## D-020 painted backdrop (2026-11-10)

`tools/art/backdrop-textures.mjs` (the textures) and `src/loaders/backdrop.ts` `BACKDROP` (where they stand).

| Constant | Value | Kind | Basis |
|---|---|---|---|
| far ridge crop | hero_11s.png 740,245,1920,320 -> 1024x64 | measured | the one stretch of far ridge clear of the hat, the torii and the cliff in any hero frame; zero robe or accent pixels |
| far ridge ink, floor | wash-mid; 0.05 | measured | density = (paper - L) / (paper - ink); the crop's darkest pixel (L 114) is lighter than wash-mid (100), so density stays under 1. Sky luminance sd is 1.6-2.3 levels of 88: under 0.05 is paper noise |
| mid cliff crop | hero_9s.png 0,0,470,540 -> 512x512 | measured | the seed's wall clear of pines, torii and the figure (shares by step: 0.2 / 2.1 / 34.2 / 8.5 / 25.1 / 15.4 / 10.2 / 4.3%) |
| mid cliff haze | 0.38 toward paper | derived | the crop's ink-black (31) lands at 91, between wash-mid and ink-grey: STYLE §3's mid band is never darker than ink-grey (79) |
| mid cliff silhouette | top 5-16% down, sides 2-9% in, foot fades over the lowest 34%, edge 1.2% of the width; noise at 5, 17 and 7 cycles; seeds 7 and 19 | authored | the seed has no free-standing mid cliff: an uneven top and near-vertical uneven sides (§4), and no drawn foot (the seed's faces dissolve into pale wash by 0.85-0.93 of their height) |
| ridge rings | radius 460 / 380 / 300 u, height 30 / 24 / 18 u, base y -13 / -12 / -11, 6 copies, turn 0.13 / 0.47 / 0.81, ink 0.6 / 0.8 / 1.0, 96 segments | authored | the ridge is 3.5 degrees tall in the seed; the farthest ring plus the farthest camera (75 u from the bounds' centre) stays inside the 600 u far clip. Copies are even because alternate copies are mirrored. Farther = paler |
| mid cliffs | 5 planes at z -50 to -64 (and one past the goal at x 158), 44-58 u wide, 52-72 u tall, yaw -80 to 10 degrees, foot y -14 | authored | 45-60 u from a camera on the path: §3's mid band |
| mist | 6 sheets, y -7 to -3, radius 520 u, opacity 1 at the base to 0.18 at the top, 48 segments | measured | the base is above every dressed wall's foot (lowest y -8) and solid; the top is 3 u under chapter 1's lowest landing (y 0). Six sheets show no terracing on the ledge walls in cam2 |
| backdrop PNGs | far_ridge 1024 px / 26,607 B; mid_cliff_a 512 px / 257,146 B; mid_cliff_b 512 px / 256,423 B | measured | budgets.json `backdrop`, set AT these; assets:budget also requires each PNG to be exactly what the script gives |

## D-020 paint gate (2026-11-10)

`tools/harness/post.ts` `PAINT_GATE`, judged on the six visual cameras with the paint layer ON. The 17 older checks
are judged with it OFF and `POST_GATE` did not change: chapter 1 passes them 17/17 on the ink pass alone (mid
silhouette class 2,462 px against its floor of 300 with kit_mid_cliff gone).

| Check | Wrong value, and how it was made | Shipped (ch1) | Gate |
|---|---|---|---|
| on as the game ships | the layer's `enabled` set false: 24 painted meshes, not drawn. The first cut of the stage switched the layer on itself and PASSED this mutation | drawn | must be drawing |
| figure everywhere, far field on a dressed level only | layer off: 0% of the frame differs from the ink pass | 7.3% differs; 24 painted meshes, 14 of them the far field. Undressed levels: 1 painted mesh (the figure), 0 far field | >= 3% on a dressed level |
| the void is bare paper | mist drawn mist-pale: 17.2%. D-019 (cloud-band strips, no mist): 35.3%. Restoring the strips UNDER the mist does not change it: the mist covers them | 46.7% paper | >= 41% |
| no hue | mist drawn #c8a888: 22,004 px over the ramp's chroma | 0 px | 0 px |
| static | (paint that changed between two ticks over clear sky) | 0 px | 0 px, judged where the sky is clear for a pixel all round in both frames |
| hides no accent pixel | (a painted thing in front of a torii) | 0 px | 0 px |

`changed` is 8 levels (twice the gate's tolerance): a pixel that far from the ink-only frame, at the same world tick
(`__HARNESS__.redraw`), is one the paint layer drew.

## D-020 hero assets (2026-11-10)

`tools/assets/budgets.json` `classes.hero`: 30,000 triangles and a 1024 px texture are Tim's ruling ("about 30k
triangles and a 1024 px texture per asset"); one texture, one material and one draw call are the kit's rule,
kept (OQ-070 item 5). Every asset below also has its own line, set AT the measured value.

| Asset | Delivered | Shipped triangles | Shipped bytes | Texture | Note |
|---|---|---|---|---|---|
| lantern | 29,400 tris, 2,572,592 B, 3 textures | 29,400 | 1,164,268 | 1024 px KTX2 UASTC, mipmaps | chroma as delivered 17 |
| cliff | 29,400 tris, 2,095,440 B | 29,400 | 1,004,212 | 1024 px | chroma as delivered 17 |
| cliff_b | 29,400 tris, 2,120,144 B | 29,400 | 1,079,720 | 1024 px | chroma as delivered 22. ART-GEN's second cliff, so the two stacks are two models |
| boulder | 29,400 tris, 2,114,200 B | 29,400 | 1,044,784 | 1024 px | chroma as delivered 19 |
| torii | 29,400 tris, 1,615,904 B | 9,510 | 21,824 | none | simplify --ratio 0.1 --error 0.001; drawn in the accent as a flat material |
| warrior_rigged (character) | 29,400 tris, 4,700,800 B, 24 joints, clips walk 1.067 s and run 0.667 s | 29,400 | 2,694,032 | 1024 px | chroma as delivered up to 109 (the gourds); capped on 24.3% of texels. No Draco |

| Constant | Value | Kind | Basis |
|---|---|---|---|
| chroma_cap | 26 levels | derived | the ramp's largest chroma is 30 (paper-cream) and the gate fails a pixel over 31; 26 leaves room for texture compression. The robe (#7d8590) is 19 |
| torii simplify | ratio 0.1, error 0.001 | measured | a gate stands 2-5 times on every level and is drawn twice a frame: 9,510 triangles each instead of 29,400 |
| torii fit | to kit_torii's bounding box (7.2 wide, 5.35 tall), yaw 90 | derived | from the two shipped files at load; nothing typed. The drawn posts stand where the collision posts are |
| hero dressing (ch1) | lanterns 2.2 u tall at z -2.7 / 2.8; boulders 1.8-3.0 u tall on rock masses at y 10, 15.5, 19; cliff stacks 24 and 30 u tall at z 62 and 78, foot y -9 | authored | a lantern a little taller than the figure (1.9). The stacks were first 30 and 40 u at z 46 and 58 and loomed at 5120x1440; Tim: sparingly |

ART-GEN re-delivered after reading the class (main eeaacac: one base-colour texture a file, the rigged warrior under `assets/hero/rigged/`, the pine under `rejected/`). Rebuilt from those files, the four static assets and the character came out byte-identical to the first build: the import had already been dropping what they removed.

Proof that nothing a player can touch changed: `node tools/geometry-fingerprint.mjs <level> assets/dist/manifest.json
--against=<dump taken before any edit>` prints IDENTICAL for all five levels (hashes 3f8ace62, 03d7d47a, f656ed93,
95c2a998, eba0e40e); the nine kit .glb sha256s are unchanged after two full rebuilds; replay passes against the
committed traces. The fingerprint prefixes recorded under "H4 asset budgets" and "CH1-ASSETS dressing" for levels
01-04 were already stale before this work (they predate PR #28's linter change).

## D-020 character (2026-11-10)

`src/entities/character-model.ts` `CHARACTER`. The rig has two clips; frames were chosen by eye from renders of
each cycle at eight times (`tools/gen/render-glb.mjs --clip <name> --time <t>`).

| Constant | Value | Kind | Basis |
|---|---|---|---|
| height | the capsule's, 1.9 u | derived | the delivered scale (1.7 u, armature scale 0.01) is measured from the rest pose at load and replaced |
| faceTurn | half a turn | measured | the delivered model looks down +Z; the player's forward is -Z. Seen in the engine: back to the follow camera, hilt over the right shoulder |
| idle, land | the rest pose, held | Tim | "rest pose for idle" |
| jump, double_jump, wall_jump | run at 0.17 s | authored | the trailing leg kicked up |
| fall | run at 0.50 s | authored | the widest split, arms out |
| dash | run at 0.33 s | authored | the lunge |
| wall_slide | walk at 0.00 s | authored | upright, feet together |
| ledge_grab, ledge_climb | walk at 0.53 s | authored | one leg forward and up |
| walkBelow | 0.5 of the run speed (3.5 m/s) | authored | Tim: "walk and run by speed". The player reaches run speed in 0.1 s, so the walk shows on analog input and while slowing |
| run rate | ground speed / run speed | derived | a sprint (10 m/s) strides 1.43x faster; the walk plays as delivered |
| blendSec | 0.1 s (6 ticks) | authored | long enough to hide a cut between two held frames, shorter than the dash (0.16 s) |

## D-020 production load (2026-11-10)

Why the `game` job failed on PR 31 (`reachable` 12/13 on CI runs 42893283097 and 42894610485: the production
bundle at the bare URL had not loaded the entry chapter 20 s after Enter; it passed locally). Measured on the
production bundle of 72a254f, headless Chromium on SwiftShader, Apple M4 Max, Enter to `body[data-level]`:

| Viewport | Enter to level | Frames rendered during the load | Frame interval |
|---|---|---|---|
| 640x360 | 232 ms | 10 | 17 ms |
| 1280x720 | 1,765 ms | 25 | 67-83 ms |
| 1920x1080 | 3,696 ms | 25 | 133-167 ms |

Above 640x360 the load is 25 frames long at any size: it is a chain of about 25 async hops (the level chunk, the
manifest chunks, each glb, both decoders, the torii skin after kit_torii, then the four other level chunks for the
progression index) and each hop queues behind one rendered frame, which on SwiftShader blocks the main thread
(`GPU stall due to ReadPixels` in the console). So on a software renderer the load takes 25 x the frame time. A CPU
throttle of 8x on the page alone only brings 640x360 to 1.3 s: the cost is the rasteriser, not the decode.

The bare-URL page was the one harness page opened at Playwright's default 1280x720; every other page uses the
pinned `VIEWPORT` (640x360, `tools/harness/lib.ts`). Fix: that page now uses `VIEWPORT` too, and the check prints
the time it took. The 20 s wait did not change. Local run after the fix: 0.4 s after Enter. Not measured: the
before-D-020 hop count (main passed at 1280x720 on CI, so it was under 20 s there), and the frame time on a CI
runner (read it from the check's detail line on the next run). On a real GPU the frame does not block and the
load is not frame-bound.

## D-021 painted cards (2026-11-10)

`tools/art/backdrop-cards.mjs` makes `assets/backdrop/cards/*.png` from ART-GEN's paintings in
`assets/backdrop/gen` (read only). `tools/assets/budgets.json` `cards` holds each AT its measured size and bytes;
`assets:budget` re-runs the script and requires every committed card to match it pixel for pixel.

| Constant | Value | Kind | Basis |
|---|---|---|---|
| cliff_a, cliff_b, cliff_c | 2048 px (their sources' own height); 1,847,913 / 2,144,122 / 2,472,500 B | measured | at 5120x1440 on the real GPU the nearest wall is magnified about 4x at 2048 px and its ink strokes keep their dry-brush edges; at 1024 px they would be magnified 8x |
| pine_a/b/c, peaks_a/b/c, wide_a/b, mist_a/b | 1024 px | authored | pines stand 6 to 7.5 u wide; the others are soft washes 230 u or more from the path |
| all 14 cards | 8,329,548 B | measured | 13 paintings and the path wash; with pngjs's own deflate strategy the same pixels were 10,111,188 B |
| value clamp | no texel lighter than paper-cream (202,191,172) | measured | 324 to 3,632 texels a card were lighter in the sources |
| chroma clamp | 30, the ramp's most coloured step | measured | the paint gate allows the ramp's chroma + 1; 291 to 1,484 texels a card were over it in the sources (largest 39) |
| colour alpha | 8 of 255 | measured | the sources fade to black below alpha 4 and hold black under alpha 0 |
| bleed | 16 px, then the card's mean colour | derived | the footprint of the fourth mipmap level; a nearest-colour fill of the whole sheet made the cliffs 25% larger |
| cliff foot | the lowest 0.1 of the height fades out | authored | cliff_c stands on a rock that runs off its sheet: seen from above its card ended in a straight edge |
| path wash | 1024x256; streak 96x2 px, patch 256x32 px, bristle 0.45, floor 0.72, ink 0.06, seed 11 | authored | two smooth noises multiplied, both repeating at the card's edges. A first version lifted from cliff_b's wash read as blotches; at floor 0.6 and ink 0.085 two critics read it as wood grain |

## D-021 cliff wall (2026-11-10)

`src/loaders/cliff-wall.ts` `CLIFF_WALL`. The wall is derived from the level's rock-mass placements. Chapter 1's
collision, measured from the placed soups at heights a player on the path can touch (0.05 to 1.9 u above it): its
front runs from z -3.58 to -5.58 against a path edge at z -3.5; pockets up to 2.0 u deep at the joins (x about
10, 48, 66, 74); no rock at the path's height from x 36 to 40.5.

| Constant | Value | Kind | Basis |
|---|---|---|---|
| frontBehind | 0.2 u | measured | a torii post's outer face is 0.02 behind the collision front: at 0.05 one post pixel blended with a card (accent and hue checks red, 1 px each). A sliding stone's front face is 0.42 behind it: at 0.45 the stone showed in front of the painting |
| front row | 3 cards a mass at -2.9, 0, +2.9 u; 6.5 to 8 wide, 13 to 21 tall; foot 5 below the mass's base; cycle of 7 | authored | from the player's camera a card is seen at a grazing angle: at 9.5 to 11 wide and 24 to 30 tall (the first cut) the near wall was a few strokes blown up and no top was in frame |
| bay row | one a join, 5 behind the front row, 10 to 14 wide, 20 to 40 tall, foot 9 below; none where two masses are more than 10 apart | authored | 2.2 behind (the first cut) read as one plane with the front row |
| back row | one per second mass, 11 to 14 behind, 20 to 28 wide, 46 to 64 tall, foot 12 below | derived | the camera's arm is 7 long: 10 or more behind the wall is beyond it |
| ink | front 1, bay 0.88, back 0.72 | authored | §3: nearer is darker; it is what separates the rows |
| taper | front 0.85, 0.95; bay 0.55, 0.75, 0.9; back 0.5, 0.7, 0.88 | authored | the wall ended in a straight vertical edge. Tapering the front row to 0.5 exposed the thinner rows behind it at spawn |
| pines | every second mass from the second; 6 to 7.5 wide; rooted on its tallest front card's ledge (cliff_a 0.2,0.58; cliff_b 0.7,0.65; cliff_c 0.4,0.46) | authored | 1 to 7 u above the path, inside the player's frame. Beside the spawn camera a pine was a smear across a third of the frame |
| pine roots | where the root is in each pine's own image, from its left and its foot: pine_a 0.08,0.1; pine_b 0.84,0.08; pine_c 0.12,0.86 | measured | read off the three paintings: the rock clump the trunk grows from |
| taper, by row | front and back by the mass's distance from the nearer end of the wall; bay by the join's (there is one join fewer than masses) | derived | a review found the bay row tapered by the mass index, so the far end never reached its lowest step |
| draw order | back 100, bay 200, front 300, pines 400; the figure 1e9 | derived | after the whole backdrop (orders 0 to 21: ridge 0, peaks 1-6, mid cliffs 7-12, mist sheets 13-18, bands 19-21); the sheets would otherwise paper over the cards |
| draw calls | 12 for the wall | measured | one mesh per painting per row; one a card was 39, and the scene peak 153 |
| open sides | where no rock stands beside a mass (the wall's two ends; a neighbour more than 10 u away) no front card reaches past the rock's own extent | measured | chapter 1 has no rock at the path's height from x 36 to 40.5. With three front cards a mass the painting covered that gap: a player walked through painted cliff and fell (found in review). Now it is an open cleft: driven into it, the player runs off the path and falls in the open (`motion.ts --only=cleft`) |

## D-021 painted backdrop (2026-11-10)

`src/loaders/backdrop.ts` `BACKDROP`. The seed-crop mid cliffs (mid_cliff_a, mid_cliff_b) and two of the three
ridge rings are gone; the rows of "D-020 painted backdrop" for them are history.

| Constant | Value | Kind | Basis |
|---|---|---|---|
| horizon | the 460 u ridge ring alone, ink 0.6 | authored | the seed's own ridge, behind everything |
| far peaks | 6 cards at 350 to 430 u, 230 to 260 wide, 0.6 of their painting's height, ink 0.4 to 1, feet at y -3.5 | authored | at full height and ink 0.5 to 0.8 they read as jagged alpine clusters 17 to 24 levels under paper; the seed's ridges are low humps about 40 under. Feet at y -10 were cut along one straight line by the mist. The sawtooth card is laid at 0.4: its ridge stroke was darker than §3's far band |
| mid cliffs | 6 of the painted cliff cards, 36 to 72 tall, ink 0.5 to 0.6, feet at y -4 | authored | at ink 0.6 the darkest texel (ink-black, 31) laid over paper (188) lands at 94, lighter than ink-grey (79): §3's mid band |
| mist bands | 3 cards at 210 to 280 u on the void side, ink 0.3 to 0.4, drawn after the sheets | authored | Tim: use mist_a/b where they beat the seed crops. Thin and at the horizon only (OQ-071 item 6) |
| peak placements | card, bearing (degrees from +x toward +z), radius: peaks_b 8, 400; peaks_a 62, 350 (mirrored); wide_b 118, 410; peaks_a 176, 370; peaks_c 236, 430 (mirrored); wide_a 312, 400. Widths 240, 250, 260, 240, 230, 250. Ink 0.9, 1, 0.8, 0.9, 0.4, 0.75 | authored | about 55 degrees apart, so one or two are in any view; the rounded paintings on the void side (8 to 176), the sawtooth behind the wall |
| mid cliff placements | card, x, z, height, yaw, ink: cliff_b 36, -62, 70, -6, 0.5; cliff_a 84, -56, 62, 10, 0.55 (mirrored); cliff_c 128, -60, 72, -12, 0.5; cliff_c -34, -30, 46, 40, 0.55 (mirrored); cliff_a 150, -22, 44, -70, 0.6; cliff_b 166, 8, 36, -95, 0.5 (mirrored) | authored | three behind the wall, 52 to 58 u from the path; one behind the start and two past the goal (x 101), turned to face back down the path |
| mist band placements | card, bearing, radius, width, foot y, ink: mist_b 40, 250, 170, -5, 0.4; mist_a 105, 210, 150, -6, 0.3 (mirrored); mist_b 160, 280, 190, -5, 0.35 (mirrored) | authored | on the void side only (bearings 40 to 160); feet under the mist's top |

## D-021 path wash (2026-11-10)

`src/loaders/path-wash.ts`: one mesh on the paint layer, a quad over every unturned prim_box top of an ink level,
`polygonOffset` -1, -1 (the landing mark's own), world-space UVs.

| Constant | Value | Kind | Basis |
|---|---|---|---|
| repeat | 24 u along x, 6 u along z | authored | 43 px a unit; a bristle mark is 2.25 u long |

## D-021 character (2026-11-10)

`src/entities/character-model.ts` `CHARACTER`, on `assets/char/warrior_anim.glb` (2,842,004 B, 29,400 triangles,
24 bones, one 1024 px texture, nine clips). How each was judged (`node tools/harness/motion.ts <dir>`: real input
through the real player, a strip of frames; `--clips`: every clip at eight even times on the still figure):
in motion in the game AND frame by frame: idle, run, jump, fall, land, dash, climb (the last in the gym, against
a real ledge). Frame by frame only: walk (it plays below half the run speed, which the strips did not reach) and
wall (it was replaced before a wall slide was captured with it). idle, walk, run, land, dash and climb read
right. jump and fall, in motion, tip the figure over and curl it up; all three of jump, fall and wall pitch the
head and the rigid hat over in every one of their frames, so no frame of them is used.

| State | Shown | Kind | Basis |
|---|---|---|---|
| idle | idle, looped | delivered | |
| run, sprint | walk below 0.5 of the run speed, else run at speed / run speed | D-020 | unchanged |
| jump, wall_jump | run held at 0.106 s | authored | the run's widest airborne stride: reads as a leap |
| double_jump | run held at 0.422 s | authored | the same stride on the other leg: the second jump kicks |
| fall | land held at 0 s | authored | arms out, knees bent, looking down; land then plays on from it |
| land | land, once | delivered | the state lasts 0.08 s; the clip keeps playing while it fades |
| dash | dash, looped | delivered | 0.16 s of it is seen |
| wall_slide, ledge_grab | climb held at 0 s | authored | arms up on the wall. In the gym the hands sit just over the ledge top |
| ledge_climb | climb, once | delivered | 0.4 s against a 0.35 s state |
| blendSec | 0.1 s | D-020 | now eased per clip and normalised: an interrupted fade carries on from where it is |

## D-021 paint gate (2026-11-10)

`tools/harness/post.ts`. `POST_GATE` is untouched. The 17 ink-only checks test the ink PASS and still judge it on
the level's whole geometry: the rock an ink level collides with and does not draw is shown for that frame only.
Without it (the first run on this build) two of them went red on a frame nobody sees: near dark mass 8.7% against
its floor of 10% (23.4% with the rock), creases outlined 57.1% against its ceiling of 45% (38.6% with it).

| Check | Wrong value, and how it was made | Shipped (ch1) | Gate |
|---|---|---|---|
| the rock collides and is not drawn, as the game ships | `INK.collideOnly` emptied: 13 drawn, 0 kept hidden | 0 drawn, 13 kept hidden | 0 drawn, all kept |
| where the rock stands, the player's frame reaches the dark end as mass | the wall lifted away (every run): 0.1% | 8.6% | >= 4% |
| where the rock would be seen, the frame is drawn over (POOLED over all 13 masses and six cameras) | the wall lifted away (every run): 11.8% (the mid cliffs behind it) | 99.9% | >= 90% |
| a painted far field on a dressed level (D-020's check, same floor), judged with the wall lifted away | layer off: 0%, D-020's figure, NOT re-measured on this build. With the wall counted it read 37.7%, which the wall alone would satisfy | 8.4% | >= 3% |
| the void is bare paper (D-020's check, same floor) | mist drawn mist-pale: 15.1% (D-020 measured 17.2%) | 47.4%, judged with the rock drawn in place of the painted wall; 41.5% of the frame the player sees | >= 41% |

Two failures found on the way and fixed: a card level with a torii post (1 px of accent lost, 1 px of hue), and
the front row tapered to half height at the wall's ends.

## D-021 scene budgets and frame cost (2026-11-10)

Chapter 1's line in `budgets.json` `scenes` is LOWERED to the new peak: 127 draw calls (was 140) and 287,036
triangles (was 381,066). Thirteen rock masses and three boulders are no longer drawn; the wall is 12 meshes. The
other four levels are unchanged (the figure is still 29,400 triangles).

`tools/measure-display.mjs`, headed Chrome, ANGLE Metal on an Apple M4 Max, 360 frames a view
(`docs/build-log/d021/art-pass-2.json`):

| Size | View | Frame p50 / p95 | Rate | Cost p50 / p95 |
|---|---|---|---|---|
| 2560x1440 | rig at spawn | 6.90 / 8.00 ms | 144.9 fps, 0 frames over 10 ms | 2.53 / 2.63 ms |
| 2560x1440 | cam2 | 6.90 / 8.00 ms | 144.9 fps | 2.61 / 2.66 ms |
| 5120x1440 | rig at spawn | 6.90 / 8.00 ms | 144.9 fps | 2.81 / 2.84 ms |
| 5120x1440 | cam2 | 6.90 / 8.00 ms | 144.9 fps | 2.93 / 2.96 ms |

D-020 cost 4.39 ms at 5120x1440 from the rig. "D-020 production load", not measured there: on a CI runner the
bare-URL load took 2.1 s at 640x360 (run 42896909133), against the 20 s wait; with this pass's cards and
character, 1.8 s (run 42911617289).

## D-022 title screen (2026-11-10)

`index.html` (markup, CSS and the gate), `src/ui/shell.ts` `SHELL`, `tools/art/ui-art.mjs` `UI_ART`,
`assets/ui/art.json`. The two paintings are Tim's (`assets/ui/src/`); `assets/ui/MANIFEST.md` lists what ships.

**Measured.** `node tools/harness/shell-shots.ts <dir>` draws the production page in Chromium at each size and
computes, from the image's real box and `object-fit`, where the painting's keep zone lands on screen:

| Size | Painting on screen | Keep zone (x 17% to 81%) | Result |
|---|---|---|---|
| 400x800 | x -106 to 519, y 0 to 349 | x 0 to 400 | whole; no button or credit line cut off |
| 1920x1080 | x -7 to 1927, y 0 to 1080 | x 322 to 1560 | whole |
| 5120x1440 | x 1270 to 3850, y 0 to 1440 | x 1709 to 3360 | whole; the painting is whole too |
| 1000x900 (B-59) | x 42 to 958, y 0 to 511 | x 198 to 784 | whole; no button or credit line cut off |
| 810x1010 (B-59) | x -156 to 985, y 0 to 637 | x 38 to 768 | whole; no button or credit line cut off |

**B-59 (2026-11-11, f98e55a).** Before the fix the same measurement gave, at 1000x900, the painting y 0 to 872 and
Play, How to play, Sound and both credit lines off the screen; at 810x1010, the painting y 0 to 706 and both
credit lines off the screen. In the tall layout the painting's box now takes the height the panel leaves, and
the image is never wider than the painting is at that height. Measured after the fix at twelve shapes, every one
whole with nothing cut off: 320x480, 360x640, 400x800, 430x932, 600x900, 768x1024, 810x1010, 1024x1366, 1000x873
(the squarest shape the tall layout is given), 1000x900, 1920x1080 and 5120x1440. The title and the first
how-to-play screen at 400x800, 1920x1080 and 5120x1440 are byte-identical to the screenshots committed before
the fix. `reachable` holds 1000x900 and 810x1010 in CI (`tools/harness/title-fit.ts`).

The first run of that measurement found two faults, both fixed: the focal point was 49% (the zone's centre), which
cropped 4 px of the zone at 400 px wide, where the right figure is 47.2%; and the stage's `max-width: 100%`
resolved against an auto-sized grid track, so at 1920x1080 the box was 1935 px wide.

Sizes shipped (`npm run assets:budget`, `tools/assets/shell-budget.mjs`): `title.webp` 266,046 B and `title.jpg`
240,351 B against the brief's 350,000; `title-wide.webp` 7,858 B; `title-tall.webp` 5,930 B; `courtyard.webp`
164,778 B; `courtyard.jpg` 168,571 B.

Load (`reachable`, production bundle): the first chapter decodes behind the title. Locally the level is up 0.3 s
after Enter. On a CI runner it took 1.9 s (run 42932276468): the stage presses Enter the moment the game says it
is ready, so the decode has barely begun. D-021 measured 1.8 to 2.5 s on CI with nothing decoded ahead.

| Constant | Value | Kind | Basis |
|---|---|---|---|
| keep zone `keep.x0`, `keep.x1` | 0.17, 0.81 of the painting's width | measured | read off the painting: the boat's bow tip is at x 255 of 1376 (18.5%) and the oar's blade at x 1100 (80%); the lettering and seal are inside that (31% to 72%). One point of margin each side |
| keep zone aspect | 1.1467 (881 x 768) | derived | (0.81 - 0.17) x 1376 / 768. The CSS switches to the tall layout at `max-aspect-ratio: 1146/1000` |
| painting aspect | 1376 / 768 = 1.7917 | measured | the file. The CSS softens the painting's side edges from `min-aspect-ratio: 1377/768`, the first shape wider than it |
| `object-position` x | 47.2% | derived | x0 / (1 - (x1 - x0)) = 0.17 / 0.36: the one focal point at which a box of the keep zone's aspect shows exactly the zone |
| paper tone `--paper` | `#e0d4be` | measured | the median colour of the title painting's pixels brighter than 185 (`ui-art.mjs` prints it) |
| `paperMinValue` | 185 of 255 | authored | what counts as bare paper when measuring the tone |
| `--ink`, `--ink-soft` | `#20201e`, `#534e4b` | derived | palette.json ink-black and ink-grey. The accent is not used: STYLE §2, never on UI |
| `webpQuality`, `jpegQuality` | 82, 80 | authored | the title lands at 266 KB and 240 KB, under the 350 KB the brief allows |
| `wide` 1536 x 432, blur 14, reach 0.8, quality 60 | | authored | a 32:9 wash, stretched: at 5120x1440 it is scaled 3.3 times, which a blurred wash bears. `reach`: bare paper from 80% of the way out |
| `tall` width 448, blur 9, reach 0.7, quality 60 | | authored | the keep zone and its mirror image, for a phone |
| `veilGamma` | 0.7 | authored | the wash pales early, so the extension never competes with the painting |
| edge mask | 6% each side (wide), last 6% (tall) | authored | the join between the painting and its extension is a fade, not a line; inside the 17% margin of the keep zone |
| `SHELL.leaveMs` | 350 ms | authored | the title's fade when a level starts; the same number as the CSS transition |
| panel type | `clamp(12px, 1.55cqw, 30px)`; tall `clamp(15px, 4.4cqw, 24px)` | authored | sized from the painting's own width, so the buttons keep their place on it at any size |
| button `min-height` | 44 px | authored | a finger's target on a phone |
| tall layout: the painting's box | `flex: 0 1 calc(100cqw / 1.1467)` | derived | as tall as the keep zone needs at the screen's width (the keep zone aspect, above), shrinking when the panel under it needs the room (B-59). The image's width is its height times the painting's own aspect, at most the screen's width |
| tall layout: panel padding | `5cqw 6cqw 3cqw` | authored | the top and sides are D-022's; the 3cqw under the credit lines is B-59's, so they do not sit on the screen's edge when the panel reaches it |
| tall layout: the squarer band | from `min-aspect-ratio: 2/3` | measured | squarer than 2:3 the panel carries the paper extension from where the painting ends. Narrower, the panel fits under the keep zone to within a few pixels (measured at 400 wide: the panel is 261 px tall and the zone 349, so a 400x600 window, exactly 2:3, is 10 px short and the painting gives them up: y 0 to 339, whole, nothing cut off), and the phone layout is left byte-identical |
| z-index | title 30, how-to-play 40, error banner 50, hint 5 | authored | a level that fails to load is shown above the title |

## D-022 sound (2026-11-10)

`src/audio/audio.ts` `AUDIO`, `src/audio/tap.ts` `SOUND_TAP`, `src/audio/prefs.ts` `SOUND_PREFS`,
`tools/gen/build-audio.mjs` `AUDIO_BUILD` and `LIMITS`, `tools/harness/audio-check.ts` `CHECK`.
**Nothing here was judged by ear.** The session that made it cannot hear (D-009: "Claude cannot hear it").
Every take was accepted or rejected on what `tools/gen/audio-stats.mjs` measures and on a spectrogram that was
looked at. `assets/audio/MANIFEST.md` lists every file, its take, its ledger row and its cost.

**The takes** (fal, through `tools/gen/fal-call.mjs`; ledger rows 67 to 80; $0.4860):

| Take | s | Peak dB | Energy under 200 Hz | Centroid Hz | Verdict |
|---|---|---|---|---|---|
| jump | 0.48 | 0.0 | 91.5% | 115 | rejected: a low thump, not a leap |
| jump-b | 0.48 | -2.1 | 90.9% | 167 | rejected: the same, with a prompt asking for air and cloth only |
| double_jump | 0.48 | -1.2 | 45.4% | 644 | ships as `jump`: broadband, spread over 0.25 s |
| land_soft | 0.48 | -38.6 | 6.6% | 4023 | rejected: nearly silent |
| land_soft-b | 0.48 | -14.4 | 0.4% | 4351 | ships: a bright scuff |
| land_hard | 0.80 | +0.8 | 35.8% | 382 | ships: a low thud, then three smaller hits |
| slash | 0.60 | +0.1 | 9.4% | 2649 | ships: broadband for 0.16 s, then thin lines near 4 to 5 kHz that ring to 0.56 s |
| dash | 0.60 | -11.6 | 78.3% | 233 | ships, cut from 229 ms: 170 ms of silence stood before it |
| wall_grab | 0.60 | +1.3 | 3.2% | 911 | ships, cut from 410 ms: the catch is the last fifth of the take |
| checkpoint | 2.00 | -15.7 | 0% | 2117 | ships: two steady partials near 1.6 and 2.2 kHz, decaying |
| respawn | 1.20 | -12.6 | 0% | 468 | ships: a tone near 250 Hz, harmonics entering, wavering at the end |
| music-s11 | 95.0 | -0.6 | 0% | 588 | ships: -17.8 LUFS, loudness range 7.7 LU; one sustained line 300 to 600 Hz, plucked transients, a few low hits. No noise bed: no wind, no rain |
| music-s29 | 95.0 | +1.7 | 0.2% | 586 | rejected: clips, loudness range 14.2 LU |
| rain_wind | 30.0 | -14.9 | 9.7% | 1980 | ships under the music: broadband, loudness range 1.8 LU |

**What ships** (`node tools/gen/build-audio.mjs --check`): eight effects, 2,821 to 23,510 B each (limit 50,000),
peaks -3.0 to -3.9 dB; `music.mp3` 1,359,620 B (limit 1,500,000), 84.9 s, -19.9 LUFS, loudness range 6.0 LU,
peak -2.5 dB.

**As a browser decodes it** (`node tools/harness/audio-check.ts`, Chromium's `decodeAudioData`): the decoder
adds 0 samples to the music file. Audio one loop apart differs by -23.2 dB (what is left is the codec's noise
on rain); the step across the seam is 1.81 ordinary sample steps. The control, a window 0.37 s too short:
-0.3 dB and 15.52 steps. Every effect starts within 0.9 ms of its file's start.

**What the page does** (`reachable`, production bundle, bare URL): before Play, 0 audio contexts and 0 sound
files requested. After Play: 1 context, running; 9 sounds decoded (0.18 to 1.9 s, and 84.9 s); a looping source
started; Space starts a 0.4 s source and J a 0.58 s one; N writes `karasu_sound=1.80`; a hidden tab leaves the
context `suspended`. On each of five gated URLs, after entering the level and jumping: 0 contexts, 0 sources,
0 requests.

| Constant | Value | Kind | Basis |
|---|---|---|---|
| `AUDIO_BUILD.onsetDb` | -18 dB under the take's peak | authored | where an effect is taken to start. It puts the dash's cut at 229 ms and the wall grab's at 410 ms, which is where the spectrograms show them |
| `leadInMs`, `fadeInMs` | 4 ms, 2 ms | authored | kept before the onset so the attack is whole; a 2 ms ramp so it cannot click |
| `effectPeakDb`, `effectKbps` | -3 dB, 96 kbps mono | authored | one level for every effect before the game's mix; the largest file is 23,510 B |
| effect lengths and fade-outs | jump 0.4 / 0.12, land_soft 0.4 / 0.1, land_hard 0.6 / 0.15, slash 0.58 / 0.12, dash 0.4 / 0.1, wall_grab 0.18 / 0.06, checkpoint 1.9 / 0.5, respawn 1.2 / 0.2 s | authored | each cut where its spectrogram is spent |
| music `from`, `to` | 0.1 s, 88 s | measured | the take fades out from about 89 s (2.7 s of silence at its end) |
| music `cross` | 4 s | authored | the end is cross-faded into the beginning, equal power |
| music `pad` | 0.5 s | authored | the loop is continued this long on both sides, so the window is seamless wherever a decoder's delay puts it |
| music `bedDb` | -10 dB under the music | authored | not judged by ear. The bed is under the music and above nothing |
| music `peakDb`, `kbps` | -2 dB, 128 kbps stereo | authored | 1,359,620 B for 84.9 s |
| `LIMITS.effectBytes`, `musicBytes` | 50,000, 1,500,000 B | brief | "each effect at most about 50 KB", "music at most about 1.5 MB" |
| `LIMITS.effectPeakDb` | -6 to 0 dB | measured | the encoded files peak at -3.0 to -3.9 |
| `LIMITS.effectLeadSilenceMs` | 40 ms | authored | more would be heard as lag; measured 0 to 0.9 ms |
| `LIMITS.musicLufs`, `musicPeakDb` | -24 to -14 LUFS, 0 dB | authored | around the shipped -19.9; a peak over 0 clips |
| `CHECK.sameAudioDb` | -15 dB | measured | between the shipped loop's -23.2 and a wrong window's -0.3. A first line of -25 was a guess made before measuring, and the shipped loop failed it |
| `CHECK.seamStep` | 4 ordinary steps | measured | between the shipped 1.81 and a wrong window's 15.52 |
| `CHECK.offBy`, `effectLagMs`, `silenceDb` | 0.37 s, 40 ms, -50 dB | authored | the control window; the lag limit; what counts as silence |
| `AUDIO.music.level` | title 0.3, game 0.6 | authored | not judged by ear. Under the title, and while paused, the music is at half its level in the game |
| `AUDIO.music.fadeSec` | 0.8 s | authored | a change of scene, mute or volume is eased, so nothing clicks |
| `AUDIO.gain` | jump 0.45, land_soft 0.5, land_hard 0.9, slash 0.7, dash 0.55, wall_grab 0.6, checkpoint 0.5, respawn 0.45 | authored | not judged by ear. Each effect's place against the others; all the files peak near -3 dB |
| `AUDIO.minGapSec` | 0.08 s | authored | 5 ticks: a wall slide can begin again within a few ticks |
| `AUDIO.volumeStep` | 0.1 | authored | one press of - or = |
| `SOUND_PREFS.volume`, `days` | 0.8, 365 | authored | a first visit's volume; how long the cookie lasts |
| `SOUND_TAP.doubleJumpRate` | 1.3 | authored | the second jump is the first jump's sound, quicker and higher |
| `SOUND_TAP.goalRate` | 0.75 | authored | the goal is the torii's bell, lower |
| `SOUND_TAP.land.silentBelow` | 3 m/s | authored | stepping down a stair is not a landing |
| `SOUND_TAP.land.hardAbove` | 18 m/s | derived | a jump on flat ground lands at 15.3 m/s (peak 2.44 m, fall gravity 32 x 1.5 = 48: the square root of 2 x 48 x 2.44); faster than that it has been a fall |
| `SOUND_TAP.land.fullAt`, `quietest` | 30 m/s, 0.3 | authored | terminal speed is 35 (`TUNING.maxFallSpeed`); the quietest landing's level |

## D-022 slash (2026-11-10)

`src/entities/slash.ts` `SLASH`. Looked at with `node tools/harness/motion.ts <dir> --slash`: the slash at six
times through it, over the figure standing, running and in the air, each from in front and from behind
(`docs/build-log/title/slash-standing.png`, `slash-running.png`). What the strips show: the hand goes up to the
right shoulder, the arm comes forward and ends low across the body; the legs go on idling, running or holding the
jump's frame; from behind, the stroke rises over the right shoulder, passes behind the figure and comes out low
on the left. Not judged in motion at speed by a person.

The first stroke was a ribbon in the blade's own plane, 0.39 m wide: from in front it read as a pale sheet, and
from behind (where the camera is) it was edge-on and could not be seen. It is now a ribbon turned to face the
camera each frame.

The harness never slashes, and what it draws is unchanged: `node tools/harness/frame-hashes.ts` gives the same
sha256 for all 30 frames (five levels, six cameras), the same counters and the same list of renderables as
main's build. The slash's clip, mixer action and stroke are made on the first slash.

| Constant | Value | Kind | Basis |
|---|---|---|---|
| `seconds` | 0.36 s | authored | the whole slash: about 22 frames at 60 Hz |
| `windupEnd`, `cutEnd` | 0.07 s, 0.19 s | authored | the hand is at the hilt for 0.07 s; the cut takes 0.12 s |
| `again` | 0.24 s | authored | a second press before this is ignored; after it, it starts the slash again |
| `fadeIn`, `fadeOut` | 0.05 s, 0.11 s | authored | how the slash takes and lets go of the upper body |
| `share` | 0.97 | authored | the slash's share of each bone it moves at its fullest; its mixer weight is share / (1 - share) against the pose's 1 |
| `lastFrameShy` | 0.0001 s | derived | a looping action evaluated AT its end reads its start |
| `chest` | wind-up twist -34, lean -5; cut twist 36, lean 14 degrees; the neck takes 0.3 of the turn | authored | from the strips |
| `swordArm`, `offArm` | directions, in the code | authored | from the strips |
| `arc.radius`, `centreY` | 1.4 m, 0.3 m above the capsule's centre | authored | the tip's reach from the shoulder line |
| `arc.width`, `fullAt`, `taper` | 0.2 m, 0.75, 0.8 | authored | a brush stroke: thin where it lands, widest soon after, drawn out to a point |
| `arc.from`, `through`, `to` | directions, in the code | authored | from over the right shoulder, across the front, to low on the left |
| `arc.segments` | 28 | authored | 56 triangles, one draw call, and only while a slash is on screen |
| `arc.opacity`, `tailLag` | 0.92, 0.85 | authored | from the strips: at 0.55 the far half of the stroke was gone before it was seen |
| `arc.order` | 500 | derived | after every painted card (100 to 400) and before the figure (`PAINT_LAST`) |
| `arc.streaks`, `bristleMin`, `dryFrom`, `dryOver`, `seed` | 9, 0.6, 0.7, 0.3, 7 | authored | the dry-brush: nine bristle tracks, some running dry in the stroke's last third. Seeded: it does not shimmer |

## D-022 gamepad (2026-11-10)

`src/engine/gamepad.ts` `GAMEPAD`. **Not tested with a pad:** none was connected to the machine or to the
harness's browser. It typechecks, it is not built in the harness's test mode, and with no pad connected it reads
nothing. Tim should try one.

| Constant | Value | Kind | Basis |
|---|---|---|---|
| `deadzone` | 0.35 | authored | a resting stick is rarely at 0 |
| move intent | length 0 or 1 | derived | past the dead zone a stick is a direction at full deflection, as a held key is. The simulation is never given a part speed, which no MOVE number was measured with |
| `lookPixelsPerSec` | 900 | authored | the right stick at full tilt turns the camera as a mouse moved that far each second |
| buttons | jump 0, dash 1, slash 2, sprint 7, start 0 or 9, pause 9, how to play 8, back 1 or 8, d-pad 12 to 15 | authored | the W3C standard mapping |

## D-022 the harness sees none of it (2026-11-10)

`node tools/harness/frame-hashes.ts <out.json> --build`, then `--diff`, on one machine (darwin, SwiftShader):

| Compared | Result |
|---|---|
| main (d9fad33) against itself, run twice | 1 value differs: chapter 1 cam3. One pixel, (606, 91), flips between two values from run to run (channel delta 51). Seen 3 times each way in 6 runs. A finding about main, not about this change |
| main against the title screen alone (b483f1d) | the page title, and that one pixel in its other value |
| main against the whole change (db5d964) | the page title only. 30 frames, counters, 255 renderables and the element ids `app hud` identical |
| every frame against its committed darwin golden | pixel-identical, but for that one pixel on chapter 1 cam3 |

`reachable` was mutated to prove it bites: with the title swallowing Enter (in `src/ui/shell.ts` and in
`index.html`'s inline listener) it is red on three checks ("loaded (nothing)" after 20.2 s). Restored.

## D-023 the fight (2026-11-10)

`src/systems/fight.ts` `FIGHT`: the one table of the fight, read by the game, the level linter, `check:fight` and
the harness. **Every value is authored by the builder to the brief's words and is PROVISIONAL for Tim's feel
(OQ-075). Nobody has played it.** The fixed tick is 1/60 s, so a time in the table runs as a whole number of
ticks; those are in the last column and are what `npm run check:fight` prints in its three `measured:` lines,
counted from the stepped functions, not worked out from the table (the 0.05 row and the trace's gap are the
`fight` stage's and the trace's own).

| Constant | Value | Kind | Basis, and what was measured |
|---|---|---|---|
| `warrior.slashSec` | 0.36 s | authored (D-022) | the whole slash: the clock is cleared on tick 22 after the press |
| `warrior.cutFrom`, `cutTo` | 0.07 s, 0.19 s | authored (D-022) | D-022's drawn cut, now the rule: the blade cuts on ticks 5 to 11 after the press, 7 ticks |
| `warrior.againSec` | 0.24 s | authored (D-022) | a second press is taken from tick 15. Two cuts land 16 ticks (0.267 s) apart in chapter 1's trace |
| `warrior.reach` | 1.9 m | authored | the warrior's centre to the swordsman's. The drawn stroke's tip is 1.4 m from the chest (`SLASH.arc.radius`) |
| `warrior.arcDeg` | 150 deg | authored | in front of him, half to each side |
| `warrior.reachHeight` | 1.5 m | authored | the two stand within this of the same height |
| `swordsman.hitsToFall` | 2 | the brief | "falls on the second hit; the first staggers him" |
| `swordsman.sightRange`, `sightHeight` | 4.5 m, 1.0 m | authored | he notices inside this, on his own level |
| `swordsman.keepRange`, `keepHeight` | 7 m, 3 m | authored | once roused. A jump rises 2.0 m and a double jump 2.9 m (MOVE), so neither loses him |
| `swordsman.forgetSec` | 1.5 s | authored | unseen this long, he walks back to his post |
| `swordsman.patrolSpeed`, `closeSpeed` | 1.5, 2.8 m/s | authored | the warrior runs at 7 m/s |
| `swordsman.turnRate` | 7 rad/s | authored | |
| `swordsman.patrolPauseSec` | 1.2 s | authored | at each end of a patrol |
| `swordsman.standoff` | 1.4 m | authored | he stops closing here: inside his own reach |
| `swordsman.engageRange`, `engageArcDeg` | 1.7 m, 50 deg | authored | the warrior this near and in front of him starts the wind-up |
| `swordsman.windupSec` | 0.6 s | the brief ("start near half a second") | **the number to judge.** His blade is out 36 ticks after the wind-up starts and the earliest cut lands on tick 37: 0.617 s |
| `swordsman.windupMinSec` | 0.5 s | authored | the wind-up is run at max(windupSec, windupMinSec). With windupSec set to 0.05: blade out at 30 ticks, cut at 31 (0.517 s) |
| `swordsman.windupTrackShare` | 0.6 | authored | he turns with the warrior for this share of the wind-up, then commits |
| `swordsman.slashSec` | 0.12 s | authored | his blade is live for 8 ticks |
| `swordsman.reach`, `arcDeg`, `reachHeight` | 1.8 m, 110 deg, 1.2 m | authored | "a short reach". A warrior more than 1.2 m above his ground is not cut |
| `swordsman.recoverSec` | 0.9 s | authored | 54 ticks in which he does nothing |
| `swordsman.staggerSec` | 0.7 s | authored | 42 ticks |
| `swordsman.edgeMargin` | 0.5 m | authored | his ground is drawn in this far from every edge |
| `placing.landClear` | 3 m | authored | `ENEMY_ON_LANDING` |
| `placing.standClear` | 0.5 m | authored | `ENEMY_AT_STAND`: beyond the stand's radius and a body's radius (0.35 m) |
| `placing.onGround` | 0.01 m | derived | his feet are on a box top to within this |
| `placing.stepOver`, `bodyHeight` | 0.05 m, 1.9 m | derived | what counts as standing on his ground: taller than a seam, lower than his head |

**What the table does as it stands** (chapter 1's trace, `tools/harness/traces/01-lower-stair.json`
`expect.fight`): each of the three is noticed, starts a wind-up, is hit 6 to 11 ticks into it, staggers, and falls
16 ticks later. No wind-up finishes. The first hit staggers him out of it, so two quick cuts fell a swordsman
before he can cut: the wind-up is only met by a player who is slow, misses, or arrives mid-swing. That is for Tim
to judge (OQ-075).

**The movement numbers did not change.** A swordsman has no physics body, so the physics world is main's. With
the fight code in and no level placing one (ffd9116), CI run 42952056875 passed every older trace, golden and
budget untouched, 9 of 9, and `frame-hashes --diff` against main's build was identical on 191 values.

## D-023 the swordsman (2026-11-10)

`src/entities/swordsman-model.ts` `SWORDSMAN`. The figure: `assets/char/swordsman_anim.glb`, 14,700 triangles,
1,914,752 B, one material, one texture (1024 px), 24 joints, six clips (`budgets.json` `characters`, at the
measured values). Made from `assets/hero/input/swordsman.png` and `swordsman_back.png` (the courtyard painting's
swordsman, redrawn to an A-pose with empty hands) by `fal-ai/hunyuan3d-v3/image-to-3d`, cut to 14,700 triangles
by `tools/gen/process.mjs --tris`, rigged and given clips by one `fal-ai/meshy/rigging/multi-animation` request,
assembled by `tools/gen/build-swordsman.mjs` (run again from the downloads in the second session: the rigged file
came out byte-identical). Looked at in `docs/build-log/enemies/clip-sheet.png`; never judged
in motion by a person.

| Clip | Length | From |
|---|---|---|
| idle | 1.667 s, a loop | Combat_Stance |
| walk | 1.033 s, a loop | the rig's own walk |
| close | 1.700 s, a loop | Walk_Fight_Forward |
| slash | 1.500 s | Right_Hand_Sword_Slash, whole |
| hit | 0.900 s | Hit_Reaction, its first 0.9 s |
| death | 1.200 s | dying_backwards, 0.30 to 1.50 s |

| Constant | Value | Kind | Basis |
|---|---|---|---|
| `height` | 1.8 m | authored | bare-headed, a little under the warrior's 1.9 m with his hat |
| `tone` | `wash-light` | measured | as delivered his texture is the paper's own value and does not read against it; multiplied by this ramp step it does. No hue |
| `faceTurn` | pi | derived | the model looks down +Z; forward in the game is -Z |
| `blendSec` | 0.12 s | authored | a change of clip is faded over this |
| `slashMarks` | cut from 0.433 s to 0.667 s of 1.5 s | measured | printed by `build-swordsman.mjs --probe`: the stretch of the slash clip in which the sword hand is above half its peak speed (11.82 m/s at 0.500 s). The fight's wind-up, cut and recovery are each mapped onto their part of the clip at these marks |
| `lastFrameShy` | 0.001 s | derived | a looping action evaluated AT its end reads its start |
| `movingAbove` | 0.2 m/s | authored | slower than this he shows the stance, not a stride |
| `walkRate`, `closeRate` | 1, 1.3 | authored | the walk clips' pace |
| `katana.blade`, `bladeWidth`, `bladeThick`, `curve` | 0.74, 0.034, 0.012, 0.045 m | authored | a katana's blade, guard to tip; the tip sits 0.045 m behind a straight line |
| `katana.hilt`, `hiltWidth`, `guard`, `guardThick`, `grip` | 0.25, 0.03, 0.045, 0.012, 0.07 m | authored | |
| `katana.bladeDir`, `edgeDir`, `inHand` | directions and an offset, in the code | authored | from two frames of the clip sheet: a blade carried ready, edge down and forward |
| the katana's mesh | 8 segments along the blade; the last 14% of it (from 0.86) narrows to a point no thinner than 0.08 of its width; the hilt is 0.8 of its width thick; a 10-sided guard | authored | 120 triangles, one draw call |
| `arcScale` | 1.15 | authored | his cut is the warrior's ink stroke, a little larger |
| `fall.inkBy`, `fadeFrom`, `fadeTo` | 0.3, 0.9, 1.6 s | authored | the falling figure is all ink by 0.3 s and gone by 1.6 s |
| `burst.seconds`, `from`, `to`, `hitShare`, `height`, `opacity` | 0.32 s, 0.5 m, 1.9 m, 0.6, 1.15 m, 0.9 | authored | ink thrown by a hit; the hit that only staggers throws 0.6 as much |
| `splat.size`, `growSec`, `holdSec`, `fadeSec`, `opacity` | 2.6 m, 0.2, 1.4, 1.6 s, 0.85 | authored | on the ground where he fell: gone to paper by 3.2 s |
| `ink.px`, `lobes`, `ragged`, `blot`, `droplets`, `dropMin`, `dropMax`, `seed` | 128, 7, 0.28, 0.42, 26, 0.012, 0.05, 23 | authored | the splatter's one texture, seeded: the same every time. Its edge is 1.5 texels soft, its blot fills 0.62 of `blot`, and its droplets land 0.75 to 1.3 of `blot` out, plus 0.04, drawn in by 0.9 |
| `inkTurn` | 2.399963 rad | derived | the golden angle: each swordsman's splatter is turned from the last one's |
| `order` | 600 | derived | drawn after every card and the warrior's stroke (500), before the figures |

## D-023 the bot and the harness (2026-11-10)

`tools/harness/nav.ts` `NAV_CONFIG`, `tools/harness/chaos.ts` `CHAOS_CONFIG`, `tools/harness/fight.ts`
`FIGHT_STAGE`.

| Constant | Value | Kind | Basis |
|---|---|---|---|
| `NAV_CONFIG.foeRange` | 5.5 m | authored | a standing swordsman this near is fought before the path goes on: beyond his sight range (4.5 m), so the bot turns to him first |
| `NAV_CONFIG.foeDy` | 1.2 m | authored | and only one on the bot's own level |
| `NAV_CONFIG.slashShare` | 0.85 | authored | of the warrior's reach: the bot presses the sword from 1.615 m |
| `NAV_CONFIG.creep`, `standShare` | 0.2, 0.5 | authored | inside that it creeps to keep facing him, and stands still nearer than 0.95 m |
| `CHAOS_CONFIG.p.slash` | 0.3 | authored | a random segment holds the sword this often. It takes the draw the old attack input took, which was still being consumed, so every other field of the stream is what it was |
| `FIGHT_STAGE.standShare` | 0.8 | authored | of the nearer reach: where the bot stops to be cut (1.36 m) |
| `FIGHT_STAGE.holdTicks`, `waitTicks` | 300, 900 | authored | a fallen swordsman is watched for 5 s; no one wait may take more than 15 s |
| `FIGHT_STAGE.lowWindupSec` | 0.05 s | authored | windupSec set a tenth of the minimum |
| `FIGHT_STAGE.broken` | hitsToFall 1, reach 0.1 m, closing speed x1.01, wind-up 0.1 s | authored | the four broken fights |

**Chapter 1, by the bot** (darwin and Linux agree to the tick: on CI run 42958599423 Linux replayed the
darwin-recorded trace with all 12 changes of mode on the recorded ticks, and measured the same 137 draw calls and
331,496 triangles): goal at 19.70 s of the 48 s budget (15.35 s
before the swordsmen); 3 down, 6 sword presses, 1.93 s spent fighting. Chapter 1's trace was recorded again from
that run (1,182 frames, was 921): the brief makes the slash recorded input and asks that the bot fight, which the
old trace did not (it ran past all three: a swordsman does not block). No other level's trace changed.

**PHASE_SWEEP with swordsmen in** (the same bot, from every torii at eight phases; 12 s a segment is an assertion):

| Segment | Worst arrival before | With swordsmen |
|---|---|---|
| spawn to torii 0 (`guard-first`) | 5.05 s | 5.43 s |
| torii 0 to 1 (`guard-patrol`) | 2.97 s | 3.30 s |
| torii 1 to 2 | 6.85 s | 6.85 s |
| torii 2 to goal (`guard-goal`) | 6.77 s | 7.12 s |

The crow segments still fail blind from the same offsets (0, 3, 4, 7 and 3, 7) and clear 8 of 8 on the cue.

**Every other level is what it was.** `node tools/harness/frame-hashes.ts --diff` against main's build: 23 values
differ, all of them chapter 1's (six frames, their counters, geometries 35 to 39, textures 22 to 26, renderables
84 to 90, painted meshes 42 to 48); the other 168 values, on four levels, are identical. Chapter 1's goldens were
written again (`--update-goldens` on darwin; Linux from CI's own frames). Against the old goldens the six cameras
drift 0.019% to 0.414%, under the 0.5% gate: the swordsmen are small in those frames. The six Linux goldens are
CI's own frames (run 42958599423, taken with the Linux goldens removed so that all six were written); against the
new darwin goldens they differ by 0, 0, 2, 21, 3 and 0 px.

**The screenshots** (`docs/build-log/enemies/`). The clip sheet and the three 1920x1080 frames are the harness's own
Chromium (SwiftShader). The three 5120x1440 frames are headed Chrome on the real GPU (`frame.ts --gpu`, ANGLE
Metal, Apple M4 Max), because at 5120x1440 SwiftShader draws the whole ink pass black: the path, the torii and
the sky are black and only painted things are drawn. That is not this change: chapter 2, which has no swordsmen,
does the same, and `ink-post.ts`, `renderer.ts` and `paint-layer.ts` are untouched on this branch. It was not
traced further (B-81). No stage of the playtest draws at that size.

## D-023 the checks (2026-11-10)

The brief asks for four checks. Each exists twice, and each was seen to fail.

`npm run check:fight` (`tools/check-fight.ts`, Node, in CI's static job) steps the real `stepSwordsman`,
`stepSlash` and `slashCutting`. Its `--self-test` runs first and puts each rule to nine broken fights:

| Rule | Broken fight | What the rule said |
|---|---|---|
| 1. two hits and not one | `hitsToFall` 1 | ONE hit felled him |
| | `hitsToFall` 3 | TWO hits did not fell him |
| | a slash that lands every tick its blade is inside him | one slash landed 2 times |
| 2. his cut reaches a warrior who stands there, and only one | his reach 0.1 m | the fight opened notice, wind-up, wind-up |
| | his blade ignores height | a warrior above his blade was cut |
| | a cut that lands on every tick of his slash | wind-up, cut, cut |
| 3. a fight replays the same | a step that keeps state outside the swordsman | differs from tick 1 |
| 4. the wind-up is never under the minimum | a wind-up clock run twice as fast | blade out after 0.250 s |
| | a wind-up cut short when the warrior is near | blade out after 0.167 s |

As shipped, rule 4 is measured at seven settings of `windupSec` from 0 to 1.5 s: the wind-up always runs
ceil(max(windupSec, 0.5) x 60) ticks, never fewer than 30.

The `fight` playtest stage (`tools/harness/fight.ts`, once a run, on `tools/harness/fixtures/swordsman.json`)
plays one attempt in the real game by input frames only: 713 ticks, 617 input frames.

| Rule | In the real game | Broken, it failed with |
|---|---|---|
| 1 | one slash: 1 hit, staggered; two: fallen; still down 5 s later; on his post again after the warrior's next respawn | `hitsToFall` 1: "after ONE slash: hits 1, mode fallen" |
| 2 | cut at tick 140: a death, and the respawn at the torii (-7, 0, 0), not the spawn (-14, 0, 0); he is back on his post, unhurt | reach 0.1 m: "stood in front of him and was never cut" |
| 3 | the recorded input replayed in two fresh pages: all 713 ticks identical to the live run and to each other (the warrior's position, both deaths, the checkpoint, the swordsman's every field) | closing speed x1.01: differs from tick 87 |
| 4 | 37 ticks (0.617 s) from the wind-up to the cut; 31 (0.517 s) with `windupSec` set to 0.05 | wind-up run at 0.1 s: "he cut 0.117 s after the wind-up began" |

**The stage launches a fresh Chromium for each of its seven pages.** Its first cut reused one browser: on Linux
the second page never loaded (CI run 42958599423, `page.goto` timed out after rules 1, 2 and 4 had passed on the
first page), and on darwin the same stage took 39.4 s against 3.9 s with fresh browsers. `run.mjs` already gives
every stage its own browser for the same reason (SwiftShader's GPU process wedging). A page that does not come
up is reported as an environment failure, with `diagnose`'s evidence, as `openGame` does.

`replay` on chapter 1 also holds the fight exactly: 12 changes of mode by three swordsmen, each on the tick the
trace recorded. Run twice on darwin, identical.

The warrior's slash clock was moved into `src/systems/fight.ts` after the engine-only proof (so that
`check:fight` runs the same function the player does). After the move every level's replay still ends 0.000 u
from its recorded position on the recorded tick (gym 1,677, chapter 2 1,638, chapter 3 1,759, chapter 4 1,449
ticks, their traces untouched), and `frame-hashes` is as above.

## D-023 sound (2026-11-10)

`tools/gen/build-audio.mjs` `AUDIO_BUILD`, `src/audio/audio.ts` `AUDIO.gain` (notice 0.5, hit 0.8, fell 0.8, cut
0.9: authored). **Nothing here was judged by ear.** Ledger rows 89 to 93, $0.0100. Each take's numbers are
`tools/gen/audio-stats.mjs` on the take, measured again in the second session. No voice in any take: a cry
cannot be judged by a session that cannot hear it.

| Take | Asked for | Centroid Hz | Verdict |
|---|---|---|---|
| notice | a blade loosened in its scabbard, a rustle of cloth | 4,935 | ships, cut to 0.40 s (silent after 0.35 s) |
| hit | steel on steel over a dull thud | 367, with 54% of its energy under 200 Hz | rejected: a low thud with no steel in it |
| hit-b | two blades meeting, metal only | 5,854; peak -29.8 dB before it is set to -3 dB | ships as `hit`, cut to 0.32 s (silent after 0.29 s) |
| fell | a body in heavy cloth on stone, a sword clattering once | 324 (57% under 200 Hz); 266 and 70% as shipped | ships, with 188 ms of silence before the thud cut away; 0.76 s |
| cut | a blade through cloth, a dull thump | 5,586 | ships, 0.60 s |

As shipped (`node tools/gen/build-audio.mjs --check`): notice 5,642 B, hit 4,702 B, fell 10,031 B, cut 7,836 B
(limit 50,000 each), peaks -3.3 to -4.1 dB. The nine older files came out byte-identical. When a hit fells him
the game plays `hit` and `fell` together.

## D-023 the paint gate (2026-11-10)

Two of D-020's six paint checks were written for painted scenery, and a swordsman is a painted figure that moves
and stands in front of a gate. These are the first measured wrong values those two rows have had.

| Check | With swordsmen, unchanged check | Now |
|---|---|---|
| static | 610 painted sky px changed between two ticks on darwin, 609 on Linux (CI run 42953349314): his idle clip and his patrol | 0 of 450,352 judged on darwin, 0 of 450,325 on Linux (run 42958599423); 2,509 px that the three swordsmen cover are not judged on either |
| hides no accent pixel | 47 px of the goal torii are behind `guard-goal` from one camera | 0; 47 more are counted as behind a swordsman |

The pixels a swordsman covers are found by drawing the same frame, at the same tick, without the swordsmen
(`__HARNESS__.showEnemies`) and taking every pixel that differs, in this frame or the next. A level with no
swordsmen takes no extra frame and is judged as it was. The other four paint checks and the 17 ink checks are
unchanged and judge the frame with the swordsmen in it: no hue above the ramp's chroma (0 px), paper 41.4% of the
frame. `ACCENT_AREA` still passes at every torii with the swordsmen standing.

## D-023 scene budget (2026-11-10)

Chapter 1's line in `budgets.json` `scenes` is RAISED to the new measured peak: 137 draw calls (was 127) and
331,496 triangles (was 287,036), over the new trace (47 samples) and the six cameras, the same on two runs.
Three figures of 14,700 triangles and three katanas of 120 are 44,460 triangles and six draw calls; the other
four draw calls are the ink of a fight on screen (a burst, a splat, a stroke). Geometries peak at 47 (was 36) and
textures at 29 (was 23). Tier 1 is 300 draw calls and 500,000 triangles. The other four levels' lines are
unchanged: the swordsman is decoded only for a level that places one.

## CAMERA-WALL-ZOOM the pivot, and the camera-room stage (2026-11-11)

Tim, from play: "On level 2, when I arrive at the first tall wall, I can run all the way to the hat. It needs to
zoom out." Measured on main (`8ca066c`) with `tools/harness/camera-log.ts`, which replays a run and reads the
real rig every tick.

**The cause is the pivot, not the arm.** The rig's pivot is not over the warrior: it leads him by his
velocity x `lookAheadTime` 0.25 s, up to `lookAheadMax` 2.0 u. Running at 7 u/s it leads by 1.75 u, so one
unit short of a wall the pivot is inside the wall. The arm's ray then starts inside rock, meets the face from
behind 0.03 to 0.11 u along, and `allowedArm` returns the 0.8 floor. The camera sits 0.8 u behind a pivot that
is inside the rock, which puts it in front of the warrior. Nothing behind him is involved.

Chapter 2's first climb face (geometry[1], x = 12, +4.5), a player's arrival: the recorded run to tick 90, then
forward held into the wall for 2.5 s (`camera-log.ts 02-cliff-seam --script=wall12`):

| tick | what the warrior is doing | arm before (u) | what the frame shows before | arm now |
|---|---|---|---|---|
| 97 | running, 1.1 u from the face | 7.00 | the wall, its top edge, the warrior | 7.00 |
| 98 | running, 1.0 u from the face; pivot at x = 12.09 | 0.80 | | 7.00 |
| 105 | against the face (reached at tick 104), velocity 0 | 0.80 | | 7.00 |
| 110 | standing | 0.80 | the camera is inside the rock: blank paper | 7.00 |
| 140 | standing | 0.80 | the hat fills the frame | 7.00 |
| 144 | standing | 1.57 | his back; feet and the wall's top are out of frame | 7.00 |
| 151 | standing | 3.60 | the first tick back over half the rest arm | 7.00 |
| 209 | standing | 6.93 | 99% of rest, 1.8 s after he stopped | 7.00 |

Before: 53 ticks under half the rest arm, 50 of them with the warrior cut by the frame or behind the camera.
The look-ahead decays at `lookAheadDamping` 3 /s, so the pivot stays in the rock for about half a second after
he stops. Now: 0 and 0. Frames: `docs/build-log/camera-wall/`. The same arrival at the wall-jump corridor
(`--script=corridor`: run at the 3.25 wall, hold, let go, wall jump) had the pivot in that wall and then in the
backstop over the shelf, arm 0.80 both times; now 0 ticks under the floor and 0 cut.

**Proof it is the look-ahead.** With `lookAheadTime` set to 0 (not committed) every such stretch on chapter 2
disappears, in the recorded run and in the scripted arrival.

**The fix adds no number.** `SpringArmCamera.holdPivotInTheOpen` casts one ray from the point over his feet at
`pivotHeight` (inside his own capsule, so never inside the level) to the pivot, and stops the pivot
`collisionPadding` 0.3 short of anything it meets. Standing still the pivot is that point, so no standing pose
changes: READABLE_RISE, `armAt` and `allowedArm` are untouched. `?pivothold=off` is the rig as it was.

**Why B-18 and B-23 did not catch it.** The `pitch-assist` stage and READABLE_RISE stand the warrior still (the
stage places him with `respawnAt`, which snaps the rig and zeroes the look-ahead) and measure whether a landing's
top is in view. The linter's `armAt` casts from over the feet. Neither has the look-ahead in it, and neither
measures the arm.

### The stage: `camera-room`

Per level, on the level's recorded trace, the camera at the yaw the game gave it at spawn. Constants
(`CAMERA_ROOM`, `tools/harness/camera-room.ts`):

| constant | value | basis |
|---|---|---|
| `minArmShare` | 0.5 (3.5 of 7 u) | Between what a run does now and what a cut-off warrior looks like. Now, outside the listed blocks, the shortest arm on any level's run is 3.72 u (53%, gym), then 4.20 (60%, chapter 3), 4.40 (63%, chapter 1), 6.11 (87%, chapter 4), 6.24 (89%, chapter 2). The longest arm at which the warrior was still cut by the frame is 3.57 u (51%, chapter 3 leaving the first lintel, pivot leading him by 1 u) |
| `momentSec` | 0.25 s (15 ticks) | The arm snaps in and eases out at `armReturnDamping` 4 /s. From the 0.8 floor back over 3.5 u takes ln(6.2 / 3.5) / 4 = 0.14 s, 9 ticks (measured: 0.80 at tick 142, 3.60 at tick 151, above). So one passing thing costs about 10 ticks under the floor however brief it was; 15 allows one, not two |
| the warrior is cut | no grace: 0 ticks | His box, feet to 1.9 u up and `capsuleRadius` 0.35 wide, projected by the real camera: any corner outside the frame or nearer than the near plane 0.1 |
| `turnDegPerSec` | 360 | `camera-log.ts --yaw=follow` only, not the stage: how fast the mouse turns the camera behind his facing. A guess at a player, which is why that view is not gated |

The stage on the rig as it was (`?pivothold=off`, the same as main) and now. A stretch is consecutive ticks
under the floor or with the warrior cut. `npm run playtest -- --only=camera-room`:

| level | rig as it was | now |
|---|---|---|
| 00-gym | FAIL: 2 stretches. t66..83 arm 0.80 at geometry[19]; t165..212 arm 0.80, 48 ticks, at geometry[20] | PASS: only the listed block (below) |
| 01-lower-stair | FAIL on the cut rule: t383..392 and t1098..1107, arm 0.80 for 10 ticks each, jumping up at geometry[10] and geometry[15] | PASS: 0 stretches, shortest arm 4.40 |
| 02-cliff-seam | FAIL: 3 stretches. t98..130 arm 0.80 at geometry[1], the first climb face; t402..423 arm 1.85 at geometry[36], the backstop over the wall-jump shelf; t1371..1402 arm 0.80 at geometry[9], the second climb face | PASS: 0 stretches, shortest arm 6.24 |
| 03-drifting-stones | PASS: only the two listed lintels, the same before and now | PASS, the same |
| 04-summit-ridge | FAIL on the cut rule: t1109..1118 arm 0.80 for 10 ticks at geometry[13] | PASS: 0 stretches, shortest arm 6.11 |

Chapters 1 and 4 fail only through the cut rule: their stretches are 10 ticks, inside a moment.

**Listed blocks (B-82).** Three places where the arm is blocked for real, with the pivot in the open. The pivot
hold does not answer them and they are the same before and now. The stage names each by the level box the arm's
own ray meets, fails on any box not listed, and fails if a listed box stops blocking:

| level | box | what happens | arm | ticks under the floor / cut |
|---|---|---|---|---|
| 03-drifting-stones | geometry[8], the first lintel, underside 2.0 u above the floor | the arm rises behind him at 18 deg and meets the underside 1.58 u from the pivot | 1.28 (18%) | 25 / 28 |
| 03-drifting-stones | geometry[9], the second lintel | the same | 1.28 (18%) | 25 / 28 |
| 00-gym | geometry[22], the test block | he drops down its far side and its face is 2 u behind him | 2.09 (30%) | 19 / 14 |

**Not gated: the camera turned behind his facing** (`camera-log.ts <level> --yaw=follow`), after the fix.
Chapters 1, 3 and 4 read the same as at the spawn yaw. Chapter 2's wall-jump corridor is 3.5 u wide:

| where | arm | ticks under the floor / cut |
|---|---|---|
| chapter 2, t352..369, jumping at the wall: the shelf face (geometry[4]) is behind him | 2.61 (37%) | 18 / 5 |
| chapter 2, t418..434, running off the shelf while the camera comes round past the backstop (geometry[36]) | 1.62 (23%) | 16 / 17 |
| chapter 2, standing at the corridor wall's foot facing it (`--script=corridor`): the shelf face (geometry[4]) 3.1 u behind him | 3.34 (48%), the whole warrior in frame; 3.04 as he jumps | for as long as he stands there (165 ticks in the script) / 7, at the jump |
| gym, t182..204, in the pit behind the test block: the face ahead of the pit (geometry[20]) 0.78 u from the pivot | 0.80 (11%) | 23 / 20 |

**Two numbers in the tools, neither a budget.** `boxAt` names the level box an arm ray's hit point lies on to
within 0.02 u: wide of float error in a hit point, far under the thinnest box on any path (the 0.5 u lintels).
The scripted arrivals in `camera-log.ts` hold forward into the wall for 150 ticks (wall12) or 90 (corridor) and
then let go for 60: long enough for the arm to go to its floor and come all the way back (99% by tick 209).

**Cost and what else moved.** The stage takes 0.6 to 1.2 s per level (two replays where it must be seen to fail).
Full playtest on the fix, darwin: PASS, 1,060 checks; `pitch-assist` 115 of 115, so every READABLE_CASE,
ASSIST_CASE and B-23 proof reads as before. No golden was rewritten: the visual stage's six cameras per level
are fixed cameras that never run the follow rig.

## ENEMIES-CH2-4 his ground: B-79 (2026-11-12)

`src/systems/fight.ts` `risers()` adds no number: it reads each asset's size from `assets/dist/manifest.json`
(`bbox` for a mesh, `size` for a primitive) and the placement's own scale and rotation, and `groundRect` cuts the
result with the numbers it already had (`FIGHT.placing.stepOver` 0.05, `bodyHeight` 1.9, `swordsman.edgeMargin` 0.5).

**The fixture** (`tools/fixtures/fight/risers.json`): a floor with `kit_rock_mass` at scale 0.3 standing on it and a
floor with a 2 u box turned 30 degrees standing on it; one swordsman beside each; the warrior stood across the
collider, inside his sight. `check:fight` rule 5 steps him 600 ticks with the game's own ground and tests his
centre against the collider's REAL triangles (the soup Rapier is handed, read by the linter's `obstaclesOf`; a
box as its eight corners): inside the solid (a ray's crossings are odd), and the distance on plan to the surface
that stands in his height band.

| | ground as main had it (unturned boxes only) | ground with B-79 |
|---|---|---|
| `beside-rock` | walks 2.82 m, inside the rock's triangles for 569 of 600 ticks, from tick 31 | walks 3.40 m along the cut, never nearer than 0.530 m |
| `beside-turned-box` | walks 2.89 m, inside the box for 579 of 600 ticks, from tick 22 | walks 1.80 m, never nearer than 0.593 m |

Main's ground is kept in `check:fight --self-test` as a broken fight rule 5 must catch (11 of 11 caught). `lint:self`
has six new cases, one that must lint clean and five that must fail; four of the five were red on main (commit 525faac): the linter passed a swordsman standing
in rock, standing in a turned box, and a patrol through either.

**What it cost chapter 1** (its file is unchanged): `guard-first`'s ground is the same rectangle. `guard-patrol`'s
ended at x 81.50 and now ends at 54.19, half a metre short of T2's torii; `guard-goal`'s ended at 107.50 and now
ends at 98.19, short of the goal torii (he stands at 98.10). On main both rectangles ran through a torii: B-79's
row said nothing shipped wrong, and that was not so. Proof nothing a harness sees moved: `frame-hashes --diff`
against main's build, taken on this machine before the change, `IDENTICAL: 191 values, 5 levels`; chapter 1's
untouched trace replays (12 changes of mode on the recorded ticks, 3 fell); `fight` 12 of 12.

**A torii is a wall to him.** Its bounding box is the whole gate (z -3.6 to 3.6 on a 7 u path), so no swordsman
passes through one. Measured on chapter 1's T2 torii: in his height band its collision triangles stand at |z| 1.89
to 2.51 (the two posts). With the posts alone cut out, `groundRect` would cut his ground along z at 1.89 and
draw it in to 1.39, and chapter 1's patrol (z -2.4 to 2.4) would be off its ground.

**The built game uses the same ground** (the checks above run the linter's copy of the manifest, not the
game's). Probed once in the harness bundle, not kept as a stage: chapter 1, the warrior put at (99.8, 9, 2.9),
past the goal torii, 3.36 m from `guard-goal` and 3.14 u from the goal, then 40 ticks. The game's swordsman is at
x 98.1565, z 1.8191: the position `stepSwordsman` gives under Node with B-79's ground, to 1e-9, and never past
x 98.19. With main's ground the same 40 ticks take him to x 98.9732, inside the torii's box (98.69 to 99.31).

## ENEMIES-CH2-4 where the ten stand (2026-11-12)

No number in `FIGHT`, `SWORDSMAN` or `NAV_CONFIG` changed. Positions are level data (`levels/0[234]-*.json`
`enemies`). Distances below are on plan, from his post (and patrol point) to the nearest of each thing; `lint`
holds only the first two (`ENEMY_AT_STAND`: 2.4 u from a stand; `ENEMY_ON_LANDING`: 3 u from a landing). His
sight is 4.5 m.

| Chapter | id | post | ground he keeps to (x, z) | D-011 segment | nearest respawn | nearest landing | sweep lane | dock |
|---|---|---|---|---|---|---|---|---|
| 2 | `guard-first` | 22, 4.5, 0 | 12.50..29.19, -3..3 | 0, teaches climb | T1 10.0 | climb 9.0 | none on his level | none |
| 2 | `guard-patrol` | 78.8, 10, -2.3 to 2.3 | 62.81..81.50, -3..2.4 | 3, transfer | T3 14.98 | double 10.94, across the gap | 4.8 past its far edge | none |
| 2 | `guard-goal` | 141.7, 15.5, 0 | 137.50..142.19, -3..3 | 4, practice | none on his ground (the goal is 3.3) | double 3.2 | none | none |
| 3 | `guard-first` | 21.5, 0, 0 | 15.50..26.50, -3..3 | 0, practice | spawn 21.5 | jump 6.0 | 63.5 | 28.3 |
| 3 | `guard-run` | 104.5, 2.5, 0 | 97.50..107.39, -3..3 | 3, practice | T4 5.7 | jump 6.0 | 17.5 | 7.5 |
| 3 | `guard-goal` | 127, 2.5, 2.4 | 122.50..127.50, -3..3 | 4, transfer | T4 16.97 | dash 3.84, across the gap | 40 | 5.55 |
| 4 | `guard-first` | 5.5, 0, 0 | -5.50..9.50, -3..3 | 0, practice | spawn 5.5 | jump 8.0 | none on his level | none |
| 4 | `guard-pair-a` | 111, 7, -1.8 | 104.81..114.00, -3..3 | 4, practice | T4 5.31 | jump 9.18 | none | none |
| 4 | `guard-pair-b` | 112.4, 7, 1.8 | 104.81..114.00, -3..3 | 4, practice | T4 6.65 | dashjump 9.28 | none | none |
| 4 | `guard-goal` | 139.2, 9.5, 0 | 134.00..139.69, -3..3 | 4, practice | none on his ground (the goal is 3.3) | double 4.7 | none | none |

The pair stand 3.86 m apart. No respawn is inside any swordsman's sight. Chapter 3's second lintel (x 127 to
129.3, its underside 2.0 u over the ground) is over the last half metre of `guard-goal`'s ground and not over his
post's far side; it is 0.1 u higher than `bodyHeight`, so it is not cut out.

**Three placements that were tried and moved, each for a measured reason.**
1. Chapter 2's patrol was first put at x 68.6, between T3's torii and the crow's sweep. `nav` FAILED: the bot
   died at (71.69, 10.01, 0.34), in the sweep. The crow's lift-off is "go now" timed from the torii; a fight
   4.6 m into the run leaves the warrior that much nearer the lane when it lifts. So: no swordsman between a crow
   torii and its sweep. He patrols 4.8 m past the lane instead.
2. Chapter 2's last segment (T4 to the goal) is worst arrival 10.73 s of `PHASE_SWEEP`'s 12 s with nobody in it,
   so it holds one swordsman, not two. The patrol was planned for the open ground at x 124.5 and is not there.
3. Chapter 2's and 4's goal guards were first stood in front of the gate's right post (142.1, 15.5, 2.8 and
   139.5, 9.5, 2.8). `post` FAILED on chapter 2 by one pixel: `D-020 paint layer: no hue`, cam4 (639, 43)
   rgb(120, 78, 72), the figure's edge over the post's vermilion. Chapter 4 passed with 7 accent pixels behind
   him. Both now stand in the gate's opening, as chapter 1's does: 0 accent pixels behind a swordsman on either.

**The bot** (`nav`, the same `NAV_CONFIG`), before and after, 60 Hz:

| Chapter | run before | run after | swordsmen down | sword presses | time fighting |
|---|---|---|---|---|---|
| 2 | 27.30 s | 27.63 s | 3 of 3 | 6 | 2.00 s |
| 3 | 29.32 s | 29.95 s | 3 of 3 | 6 | 2.60 s |
| 4 | 24.15 s | 25.23 s | 4 of 4 | 8 | 2.80 s |

In all three traces every swordsman's modes are close, wind-up, stagger, fallen: none reaches `slash`, so the
bot is never cut. `PHASE_SWEEP`, worst arrival per segment over the eight phases, limit 12 s:

| Chapter | before | after |
|---|---|---|
| 2 | 4.87, 2.65, 2.35, 8.85, 10.73 | 5.20, 2.65, 2.35, 9.18, **11.05** |
| 3 | 6.63, 7.67, 1.03, 8.32, 8.25 | 6.97, 7.67, 1.03, 8.65, 8.75 |
| 4 | 4.93, 2.00, 7.43, 6.60, 4.75 | 5.25, 2.00, 7.43, 6.60, 5.83 |

**The pair** (chapter 4's trace, `expect.fight`, ticks from the start of the run): `guard-pair-a` notices at
1175, winds up at 1193, is staggered at 1199 and falls at 1215. `guard-pair-b` notices at 1195, 20 ticks (0.33 s)
after the first and 20 ticks before he falls; winds up at 1228, is staggered at 1234 (6 ticks into a 36-tick
wind-up) and falls at 1250. Both are down 75 ticks (1.25 s) after the first notices. Four presses; no slash lands
on both. Probed, not shipped: at 2.47 m apart (111, 7, -1.2 and 111.6, 7, 1.2) the bot also fells all four, with
7 presses in place of 8, because one slash lands on both: nearer is easier, not harder.

**Scene budgets** (`tools/assets/budgets.json` `scenes`), each RAISED to the measured peak over the new trace
and the six cameras, the same on two runs:

| Level | draw calls | triangles | was |
|---|---|---|---|
| `02-cliff-seam` | 100 | 177,330 | 94 / 132,870 |
| `03-drifting-stones` | 100 | 178,554 | 94 / 134,094 |
| `04-summit-ridge` | 106 | 192,226 | 92 / 132,846 |

A figure and its katana are 14,820 triangles and two draw calls. Chapters 2 and 3: three of them, exactly. Chapter
4: four are 59,280 triangles and 8 draw calls; the other 100 triangles and 6 draw calls are the ink of the pair's
fight on screen. Tier 1 is 300 draw calls and 500,000 triangles. Chapter 1's and the gym's lines are unchanged.

**Goldens.** 15 of the 18 frames changed: cameras 0, 2, 3, 4 and 5 of each chapter. Camera 1 of each has no
swordsman in it and is byte-identical. `frame-hashes --diff` against main: 66 values differ, 22 a chapter, none in
`00-gym` or `01-lower-stair`. Every changed frame is under the `visual` stage's 0.5% drift against the old
golden, so CI would have passed without new goldens; the 15 Linux goldens were removed so that CI wrote its own
frames, and those frames are the new goldens. That was CI run 43244669052: on chapters 2, 3 and 4 `visual` was
the only stage of fourteen to fail, five times each, every one "golden missing"; `static`, `game`, the gym and
chapter 1 passed. Each of CI's 15 frames is 640x360 and within 37 px (0.016%, chapter 2 cam2) of the darwin
golden of the same camera at the stage's own threshold; four of them differ by 0 px.

**B-78.** `hudText('death')` is `cut down` when a swordsman's cut ended the attempt and `fell` otherwise. The
`fight` stage reads both off the page (13 of 13). `run-metric` 15 of 15: every death it causes is a fall.

## D-025 the wall, as a player meets it (2026-11-12)

Tim, from play on the live site: "level 2 can't jump the wall". The wall is chapter 2's first face:
`critical_path[2]`, `via: climb`, from (10, 0, 0) to (13, 4.5, 0), a +4.5 face at x 12, which is exactly
`MOVE.climb.maxRise`. `node tools/harness/teach-probe.ts --only=wall` drives the real rig at it through the
harness's public input API: held states, one frame a fixed tick, the player put at the start of an attempt and
never moved again. Walking in stops the feet at x 11.64. Nothing was changed before this was measured.

The rig's numbers (`TUNING`): the ledge probe finds a top 1.40 to 2.30 m above the feet, so on this face the feet
must be 2.20 to 3.10 m up, and the grab is tried only while falling, touching the wall, with the stick into it.

| Tried, standing at the foot of the face | Caught | Peak |
|---|---|---|
| jump key down 1 tick (17 ms), pushing in | no | 1.00 m |
| 4 ticks (67 ms) | no | 1.33 |
| 8 ticks (133 ms) | no | 1.70 |
| 12 ticks (200 ms) | no | 1.99 |
| 16 ticks (267 ms) | no | 2.19 |
| 18 ticks (300 ms) and every longer press | **yes** | 2.34, then the hang at 2.90 |
| jump held, pushing in | **yes** | |
| jump held, NOT pushing in | no | 2.34 |
| jump held, pushing in only on the way up | no | 2.34 |
| jump held, pushing in only on the way down | yes | |

"Every time": a held jump, pushing in, from a run, with the takeoff every 0.25 m from the wall out to 7 m, at
three places across the path (z -1.5, 0, 1.5): caught from every takeoff out to 3.0 m at a run and 4.5 m at a
sprint, 96 catches, no miss inside either distance. Farther out he reaches the wall after the peak and slides.
So **the move has no fault and the level is reachable; what was wrong is that nothing said how.** The margin
is thin: 0.14 m of height, or 5 ticks of the 23 the rise lasts (B-89).

What a player who does not know the move tries: a tap and a second press at the wall is a wall jump that kicks
him away (no catch); mashing the key, eight presses, never catches. Hanging: with every key let go, or with the
jump still held from the leap, he hangs for as long as measured (3 s); the pull-up needs the key let go and
pressed again, and ends standing at (12.24, 4.51); pushing away drops him.

## D-025 the moves as the rig makes them (2026-11-12)

The brief: "Check every other move's line against what the rig really needs, the same way as step 1, and fix any
that mislead." `node tools/harness/teach-probe.ts` (all sections), each at the step of its chapter that first
needs the move. The lines are `src/ui/howto.ts` `MOVE_TEXT`: one table for the how-to-play page and the screen.

| Move, where | What the rig did | The line before | Verdict |
|---|---|---|---|
| run, ch1 | 7.00 m/s; 10.00 with sprint held | "Move with {move}. Hold {sprint} to sprint." | true, kept |
| jump, ch1 step 2 (+1.25) and step 11 (+1.75) | peak 1.00 m at 1 tick, 2.34 held. +1.25 is cleared by any press of 2 ticks or more. +1.75 needs 6 ticks (100 ms); under that he ends HANGING from the shelf (B-91) | "Press {jump}. Hold it longer to rise higher." | true; now also says a tap is a low hop |
| ledge grab, ch2 step 2 | the section above | "Push into a ledge near its top to catch it. Press {jump} to pull yourself up, or push away to drop." | **misled**: no word of the jump, the hold, or that the pull-up is a second press |
| wall jump, ch2 step 5 (+3.75) | a second press on touching the wall kicks him up and away, with or without the stick held and with or without a slide first; steering away after it lands him on the shelf; steering back into the wall does not | "Push into a wall while you fall and you slide down it. Press {jump} to kick away from it." | true but back to front: the kick needs no slide. Reordered |
| double jump, ch2 step 9 (+2.8) | held jump from the takeoff, a second press at the peak: lands, peak +4.08. The second press while touching the face is a WALL JUMP and puts him back on the floor. A third press in the air does nothing | "Press {jump} again in the air for one more jump." | **misled** at a face, which is where this step is (B-90) |
| drifting stone, ch3 step 7 | steps on, is carried 8.44 m in 101 ticks with no key down, steps off | "Some stones move on a steady beat. Step on, ride, step off." | true, kept |
| dash, ch3 step 10 | crosses the gap; a jump there hits the lintel (peak +0.09); 3.99 m standing, the way he faces, or the way the stick points; one in the air; a second at once is refused for 0.35 s | "Press {dash} for a short burst of speed, on the ground or once in the air." | true, kept |
| dash jump, ch4 step 6 | clears with the jump key down 4 to 22 ticks after the dash key. Made from the torii the dash carries him off the lip and the jump is the air jump. A jump and an air jump clear the same gap; so do a jump and an air dash | "Dash, then press {jump} just as the dash ends. It carries you over the widest gaps." | **false** in its second half: see the next table |
| the fight, ch1 `guard-first` | at the spawn (4.6 m off) he does not see the warrior; walked up to and left alone he cuts, and the warrior stands at the spawn again; one slash staggers him (1 hit), a second fells him; a held key is one slash | (none on screen) | new line; its three claims hold |

How far each carries over flat ground at a run (chapter 3's second floor, takeoff to where the feet come down):

| Move | Metres |
|---|---|
| jump (held) | 5.00 |
| jump, air jump at the peak | 8.38 |
| dash | 3.32 |
| dash, jump as it ends | 8.24 |
| dash, jump as it ends, air jump at the peak | 11.63 |

These agree with the `MOVE` budgets (5.0, 8.4, 2.6 as a gap, 8.0). The double carries farther than the dash
jump, so "the widest gaps" was wrong. The dash jump's line now says what is true of it: the jump starts from
where the dash carried you.

Found on the way, reported and not changed (the brief: no change to moves or levels): four first-use places can
be cleared without the move they teach (B-92); a tap at chapter 1's +1.75 risers ends in a hang chapter 1 does
not teach (B-91); pushing into a wall on the ground flips the state between `idle` and `run` (B-93).

## D-025 the teach prompts (2026-11-12)

`src/systems/teach.ts` `TEACH` and the rule; `src/ui/howto.ts` `MOVE_TEXT` and `teachLine`; `src/ui/shell.ts`
`showTeach`; `index.html` `#teach`. `npm run check:teach` runs the rule under Node on `levels/` itself: 98
properties, and `--self-test` breaks it four ways and sees each caught. `--list` prints the 48 places (35 steps
of the four paths, 13 swordsmen); none is typed in.

**Every value is authored by the builder to the brief's words and is PROVISIONAL for Tim's feel (OQ-078).**

| Constant | Value | Kind | Basis |
|---|---|---|---|
| `TEACH.approachM` | 6 m | authored | "as he approaches": at a run the line is up 0.86 s before the place the move is made from, and it is beyond a swordsman's sight (`FIGHT.swordsman.sightRange` 4.5), so the fight's line is up before he comes. At chapter 2's first face it comes up at x 4 of a 12 m walk |
| `TEACH.lingerSec` | 5 s | authored | the brief's "several seconds" |
| `TEACH.misses` | 2 | authored | the brief's "twice" |
| `TEACH.riseM` | 0.34 m | derived | the measured autostep ceiling (`MOVE.ground.autostep`; "Autostep" above): a rise above it needs a move, and feet within it of the top are on top. `check:teach` fails if the two differ |
| height band | 2.0 m | derived | `GAME_RULES.goalHeightTolerance`, handed to the rule: he is at a place within this above its higher end or below its lower |
| dash jump window | 0.22 s (13 ticks) | derived | `TUNING.coyoteTimeSec` + `TUNING.jumpBufferSec`: a jump that starts this soon after a dash is the dash's. The probe's window at chapter 4 closes 12 ticks after the dash ends |
| `SHELL.keys.chapters`, `up`, `down` | C, the up and down arrows | authored | the list's own keys; Enter and Space press the chapter in focus, Esc shuts it |
| `GAMEPAD.buttons.chapters` | button 3 (Y / triangle) | authored | the one face button the game did not use |
| `#teach` place | `bottom: clamp(40px, 9vh, 120px)`, centred, `max-width: min(92vw, 44em)` | authored | low, clear of the warrior (who stands at the middle of the screen) and above the hint. Two lines at most at 1920x1080 for the longest line |
| `#teach` type | `clamp(15px, 1vw + 9px, 26px)/1.5`, weight 500, tracking 0.02em | authored | between the hint's 13 px and the HUD's one word (up to 30 px): it is read at a glance, and it is not the loudest thing on screen |
| `#teach` ground | paper `#e0d4be` at 86%, radius 0.4em, a soft edge of the same paper 0.9em wide, 0.5em spread | authored | ink on a wash of paper with no line round it. No accent (STYLE §2: never on UI) |
| `#chapters` | wash of paper at 80% over what it was opened from; card `min(100%, 25em)`; type `clamp(15px, 1.05vw + 9px, 21px)` (the how-to-play page's); 16 px margin; z-index 45 | authored | between the how-to-play page (40) and the error banner (50) |
| the chapter in focus | outline 0.18em, offset 0.2em (the `.btn`'s own), on plain focus | authored | a pad has no other way to show which chapter A will start |

## D-025 the chapter list and the title (2026-11-12)

`node tools/harness/shell-shots.ts <dir>` (production bundle, Chromium), now with the chapter list at each size:

| Size | Painting on screen | Keep zone | Title | Chapter list |
|---|---|---|---|---|
| 400x800 | y 0 to 349 | x 0 to 400 | whole; no button or credit line cut off | 4 chapters, every button on screen |
| 1920x1080 | y 0 to 1080 | x 322 to 1560 | whole | the same |
| 5120x1440 | y 0 to 1440 | x 1709 to 3360 | whole | the same |
| 1000x900 | y 0 to 431 (511 before the fourth button) | x 245 to 739 | whole; nothing cut off | the same |
| 810x1010 | y 0 to 556 (637 before) | x 81 to 719 | whole; nothing cut off | the same |

The fourth button takes 80 px from the painting where the buttons stand under it (B-95). `reachable` holds the
title and the list at 1000x900, 810x1010 and 400x800 in CI.

`reachable` (67 checks locally, 85.4 s; 49 before D-025) on the production page with real keys and clicks:
with the list open the title's buttons under it refuse the focus;
the list by mouse, by C and the arrows and Enter, and by a faked pad (Y, D-pad down, A); the chosen chapter
loads with one audio context running and the music started as a loop, none before the choice; Play after a
chapter was chosen and left loads chapter 1; the list in the how-to-play page of a running game starts the
chapter chosen, not paused; pressed before the game has loaded it opens with the four chapters. And the teach
line at the wall: up at `step:2` with its keys equal to the binding table's; still up after 8 s of pushing in and
after a held jump without pushing in; gone at the catch (first try), with the grab's sound started and the
hang's line in its place; and after a second press the next line is the swordsman's who stands on top.

It was mutated to prove it bites (one build, three faults: a jump counted as the climb, a chosen chapter started
without waking the sound, Play starting the last chapter played): 62 of the then 66, red on "starts with sound", "the line
stays ... through a held jump without pushing in", the grab's sound, and "Play starts the first chapter".
Restored.

## D-025 the harness sees none of it (2026-11-12)

`node tools/harness/frame-hashes.ts <out.json> --build`, then `--diff`, on one machine (darwin, SwiftShader):

| Compared | Result |
|---|---|
| main (be42133, before any edit) against the change (a35952b) | IDENTICAL: 191 values, 5 levels. All 30 frames, the counters, the renderables, the page's text and the element ids `app hud` |

The full local playtest at 7399844: 75 stages, 1,084 checks, all pass. No golden was updated and no trace re-recorded. The teach rule and its element are built only where the shell
is (`src/main.ts`: `teach` is null on a bare page); `reachable` still holds every bare page to ids `app hud`.

## D-026 the gate (2026-11-12)

`src/systems/fight.ts` `GATE`, `goalCounts`, `stepGate`. Authored to the brief's words, PROVISIONAL (OQ-079).

| Constant | Value | Kind | Basis |
|---|---|---|---|
| `GATE.openSec` | 1.2 s | authored | long enough to be seen opening, shorter than the walk to it; 72 ticks, measured below |
| `GATE.doorTag` | `gate_door` | authored | the tag of a door's placement |
| `COURTYARD.leaf.openDeg` | 100 deg | authored | the leaves stand just past square to the wall, out of the doorway |
| `COURTYARD.leaf.thick`, `top` | 0.14 m, 4.15 m | authored, derived | `top` is under the gate model's tie beam (0.521 of its 8 m height = 4.17 m) |
| `FIGHT_STAGE.gateLane`, `gateStandTicks`, `gatePushTicks` | 1.5 m, 60, 90 | authored | the fixture run: the lane round the door, 1 s on the goal, 1.5 s at the door |

Measured (`check:fight`, `fight` stage, `nav`): the gate stands open on the 72nd tick after the last fall
(`stepGate` snaps to 1 within 1e-9: 72 steps of 1/72 sum to 0.99999999); in the real game on the fixture the shut
door held the warrior at x 8.61 (its face is at 8.25); on the level the last fell on tick 214, the gate stood
open on tick 285 and the goal counted on tick 346.

## D-026 the courtyard (2026-11-12)

Positions are level data (`tools/levelgen/courtyard-05.mjs` `Y`, which writes `levels/05-courtyard.json`).

| What | Value | Basis |
|---|---|---|
| terrace | x -3 to 10, 9 m wide | at 7 m `post` counted 53 moving pixels of the idle warrior against the void (OQ-079 item 7) |
| yard | x 10 to 32, z -8 to 8: 22 by 16 m, one box | one box: a swordsman's ground is one box top; sized by the fight below |
| walls | 1 m thick, top 4.8 m, abutting the yard's box | above `MOVE.climb.maxRise` 4.5; abutting, so no ground is cut (`groundRect`) |
| way in | 7 m opening, posts 0.5 m, 6.6 m tall | the beam is out of the camera's frame from the checkpoint |
| far gate | 6 m gap, doorway 4.4 m, door top 4.8 m, model 8 m tall, centred 1.2 m beyond the wall line, posts 0.8 m | the model's own measures at 8 m: posts 2.2 to 3.0 m either side, eaves 5.03 m, tie beam 4.17 m |
| torii, checkpoint, goal | x 12; (14, 0, 0); (35.5, 0, 0) radius 1.5 | the checkpoint is 2 m past its torii, as every chapter's |

Where the three stand, and what was tried (each run is `nav` on the real rig, ticks from the level's start):

| Layout | notices (left, right, middle) | first falls | result |
|---|---|---|---|
| (20.5, -3.2) (21.5, 3.2) (25, 0.4), yard 24 by 18 | 151, 206, 220 | 191 | left alone; the other two after he fell |
| (19.5, -2.4) (19.9, 2.4) (22.3, 0.3) | 138, 156, 184 | 178 | two together; the middle 6 ticks after the first fell |
| **(19.5, -2.4) (19.9, 2.4) (21.9, 0.2), shipped** | **138, 156, 163** | **178** | **all three roused together** |

Shipped run: 4 sword presses, 1.42 s fighting. `guard-right` began a wind-up on tick 191 and was staggered on 197,
30 ticks before his blade would have been out; one slash staggered `guard-right` and `guard-middle` together
(197) and the next felled both (213, 214). All down 76 ticks after the first notice. Never cut. Apart: left to
right 4.82 m, left to middle 3.54 m, right to middle 2.97 m. From the respawn: 6.00, 6.37 and 7.90 m (his sight
is 4.5 m). Goal on tick 346, 5.77 s of the 24 s budget. `PHASE_SWEEP` worst arrivals 1.78 s and 3.78 s of 12 s.
`camera-room` 4 of 4 with no blocker listed for the level. `chaos` 7 of 7.

Scene budget: 54 draw calls, 123,704 triangles, set at the measured peak (Tier 1: 300, 500,000).

## D-026 the courtyard's look (2026-11-12)

`src/loaders/courtyard.ts` `COURTYARD`; `tools/art/courtyard-cards.mjs` `CARDS`, `ROSE`. All authored against
the painting and held by `post`, PROVISIONAL (OQ-079).

| Constant | Value | Kind | Basis |
|---|---|---|---|
| `floor`, `wall`, `cap`, `frame`, `leaf` fills | ramp steps by name | authored | pale forms: OQ-079 items 8 and 9, measured below |
| `cap.overhang`, `rise`, `eave` | 0.4, 0.75, 0.14 m | authored | the painting's wall caps |
| `frame.beamDrop`, `beam`, `past`, `tieDrop`, `tie` | 0.5, 0.45, 0.9, 1.5, 0.3 m | authored | a post-and-beam gateway |
| `flags.metres`, `plaster.metres`, `tiles.metres`, `leaf.plankMetres` | 16, 12, 4, 4 m | authored | the world size of one card |
| `flags.ink`, `plaster.ink`, `tiles.ink`, `leaf.ink` | 0.9, 0.9, 0.85, 0.8 | authored | how much of a card's ink is laid |
| `far.radius`, `topY`, `height`, `arc`, arcs | 70 m, 21 m, 27 m, 72 deg, five | authored | the mountains stand 3 to 13 degrees up from inside, over the far wall |
| `sky.radius`, `baseY`, `height`, `arc` | 300 m, 12 m, 62 m, 120 deg | authored | a band low over the mountains |
| `order` | -10, 90, 110 to 140 | authored | sky before the far ring, mountains after its mist, washes last |
| `ROSE` | rgb 204, 184, 174 | derived | the paper is 202, 191, 172: value 188.3, chroma 30. This is value 187.3, chroma 30, hue 20 deg against 38 |
| card sizes | far 2048 x 620, sky 1024 x 196, flags 2048 x 2048, plaster 1024 x 512 (two), tiles 512 x 256 | measured | `budgets.json` `courtyard`, at each file's size |

`post` on the level, as built up: dark caps and timbers 99.6% of near silhouettes ink (limit 92%) and 44.8% mid
lines (limit 35%); pale forms, outer plaster `mist-pale`: paper 36.4% (floor 41%); all plaster paper: 49.1% and
121 stroke pixels (floor 200); shipped: **23 of 23, paper 44.9%, far field 20.1%, 341 stroke pixels, near dark
mass 37.8%, ink-black mass 0.4%, 0 pixels over the hue limit**. The gate model at the way in: 2,169 accent pixels
hidden and 39 over the hue limit, so it is not there.

The gate asset: 29,400 triangles, 1,076,744 B, one 1024 px texture, one draw call (`budgets.json` `assets.gate`).
The asset build's other outputs are byte-identical (`diff -rq` of a dry build: `gate.glb` and its manifest entry
alone; both characters' shas unchanged).

## D-026 the checks (2026-11-12)

`lint:self`: the fixture clean, then 11 cases for the seven rules. `check:fight`: 6 rules, 16 broken fights
caught. `fight` stage 15 of 15. `check:teach` 107 of 107 (5 chapters, 52 places), four of them chapter 5's:
past the torii the fight's line is up for the nearest of the three, and goes when he falls. `reachable` 69 of 69 through
five chapters. `lint:not-list` 22 rows, with row 9's new check. The level: 14 of 14 per-level stages.
`frame-hashes` against origin/main (b3c12f3's tree): IDENTICAL, 191 values, 5 levels, with the engine change and
no level using it; with the level in, 38 values differ and every one is `levels.05-courtyard`.
fal: rows 94 to 96, $0.0398 (the gate's input image), $0.0200 (trellis shape test), $0.5250 (the model, Normal
and PBR): $0.5848 of this task's $4.00. Ledger total $15.1848 of $20.00. fal's three price pages were read
before the first call and matched the wrapper's table.
Goldens: darwin by `--update-goldens` on the level alone. Linux are CI run 43352065074's own six frames (on
that run `visual` was the only failing stage of `level (05-courtyard)`, for want of goldens); each is within 4
pixels of its darwin golden at pixelmatch 0.1 (0, 3, 1, 4, 3, 0).

## D-027 touch controls (2026-11-12)

`src/engine/touch.ts` `TOUCH`, drawn by `src/ui/touch-ui.ts`, looked by `index.html` ("D-027: the touch
controls"). Lengths are CSS pixels. **Every value is authored by the builder to the brief's words and is
PROVISIONAL for Tim's thumb (OQ-080). Nothing here was tried on a phone:** the touch stage plays it in headless
Chromium with touch emulated and real touch events (Chrome's own input pipeline), which proves what a finger
does to the game, not how it feels in a hand.

| Constant | Value | Kind | Basis |
|---|---|---|---|
| `stick.radius` | 60 | authored | the ring a thumb's tip travels: 120 px across, about 2 cm on a 3x phone |
| `stick.knob` | 26 | authored | the knob, a thumb's pad under it |
| `stick.reach` | 104 | authored | a touch beginning this near the ring's centre takes the stick: a thumb does not land on a circle it cannot see under itself |
| `stick.inset` | x 92, y 88 | authored | the ring's centre from the left and bottom edges of the safe area: the ring and its reach on screen at 390 px tall |
| `stick.deadzone` | 0.3 of the radius (18 px) | authored | a thumb at rest on the knob is not a push. Past it the move intent has length 1 (`readStick`), as the pad's has: no part speed reaches the simulation |
| `stick.sprintFrom` | 0.85 of the radius (51 px) | authored | sprint has no button (the brief): the stick pushed into its outer ring is sprint |
| `stick.sprintUntil` | 0.7 of the radius (42 px) | authored | once sprinting it holds until the stick comes back inside this, so a thumb resting on the ring's edge does not flicker between run and sprint |
| `buttons.jump` | radius 40, centre 70 and 64 in from the right and bottom | authored | the largest, under the thumb's rest in the corner (the brief) |
| `buttons.slash` | radius 31, centre 166 and 50 | authored | left of Jump along the thumb's arc |
| `buttons.dash` | radius 31, centre 60 and 160 | authored | above Jump along the same arc |
| button sizes | 80, 62, 62 across | derived | every one over the 44 px a finger needs (D-022's `min-height`) |
| `pressPad` | 10 | authored | a touch this far outside a button's edge still presses it |
| `slideOff` | 30 | authored | a finger this far past a held button's edge has slid off: the button is let go |
| `tapSlop` | 12 | authored | a touch on a page button that travels further is a scroll, and presses nothing |
| `pause` | 44 square, 10 in from the top and right | authored | the smallest target a finger needs, in the corner nothing else uses |
| `lookScale` | 1.5 | authored | a drag of 1 px turns the camera as a mouse moved 1.5 px (`CAMERA_TUNING.mouseSensitivity` 0.0025 rad/px): a 120 px drag is 25.8 degrees, measured by the touch stage |
| `maxPixelRatio` | 1.5 | authored | see "D-027 the phone's canvas" |
| opacities | ring 0.3 paper / 0.55 ink edge; buttons 0.42 paper / 0.6 ink edge; held 0.8 ink | authored | part see-through, ink on paper, no accent (STYLE §2) |
| z-index | controls 6, pause button 7, cards 20, the upright notice 25 | authored | over the hint and teach line (5), under the title (30), the how-to-play page (40) and the chapter list (45) |
| the teach line on touch | top 10 px under the safe area, at most the screen less 148 px wide | authored | clear of the stick, the buttons and the pause button; the touch stage holds it clear of the warrior at both sizes |

Where the controls land, measured by the touch stage on its pages (stick, Jump, Sword, Dash, pause; left, top,
width, height): 844x390: (32, 242, 120, 120), (734, 286, 80, 80), (647, 309, 62, 62), (753, 199, 62, 62),
(790, 10, 44, 44). None covers another, the warrior or the teach line at 844x390 or 932x430.

## D-027 the phone's canvas (2026-11-12)

`TOUCH.maxPixelRatio` 1.5, set by `Renderer.setPixelRatioCap` only where the device's main pointer is a finger
(`(pointer: coarse)`); a page with a mouse keeps `RENDER_CONFIG.maxPixelRatio` 2, so desktop rendering does not
change (frame-hashes below). **What was measured is SwiftShader on this Mac, not a phone's GPU.** It says how
the cost grows with the drawing buffer; a phone's frame rate is for Tim to see.

The game's own frame loop at the start of chapter 1, 4 s of frames, harness bundle at the front door (darwin,
SwiftShader):

| Viewport, device pixel ratio | Canvas (device px) | Frames a second | The simulation's share of the wall clock (5 ticks a frame at most) |
|---|---|---|---|
| 640x360, 1 | 640x360 | 11.4 | 95% |
| 844x390, 1 | 844x390 | 8.6 | 72% |
| 932x430, 1 | 932x430 | 8.1 | 67% |
| 844x390, 2 | 1688x780 | 4.7 | 39% |
| 844x390, 3 (desktop cap 2) | 1688x780 | 4.6 | 39% |
| 844x390, 3 (touch cap 1.5) | 1266x585 | 6.3 | 52% |
| 932x430, 3 (touch cap 1.5) | 1398x645 | 5.7 | 48% |

At ratio 3 a phone without the cap draws 4.0 times the pixels of ratio 1, and with it 2.25 times. 1.5 keeps
the ink's line at its 360-line weight or above (`InkPost` supersamples any buffer over 360 lines) and is the
largest round step under 2. PROVISIONAL (OQ-080): on a real phone it may be too much or too little.

## D-027 the touch stage (2026-11-12)

`tools/harness/touch.ts` `TOUCH_STAGE`: once per run (`ONCE_STAGES`), in CI's `game` job.

| Constant | Value | Kind | Basis |
|---|---|---|---|
| `phones` | 844x390, 932x430 | authored | the brief's two landscape phones |
| `minTarget` | 44 px | authored | D-022's button `min-height` |
| `fullRise` | 2.34 m | measured | "Measured": a single jump held to its full height |
| `catchTicks` | 18 | measured | "D-025 the wall": the shortest held Jump that catches chapter 2's first face from its foot |
| `riseTol`, `tapUnder` | 0.1 m, 0.4 m | authored | a held jump within 0.1 of 2.34; a tap at least 0.4 under it (a tap is 1.0, "D-025 the wall") |
| `speedTol` | 0.3 m/s | authored | top speed against `TUNING.runSpeed` 7 and `sprintSpeed` 10 |
| `turnTol` | 0.6 degrees | authored | a drag's turn against what the mouse's call gives for the same pixels |
| `share` | dead 0.15, mid 0.55, outer 1.0 of the radius | authored | inside the dead zone, between it and the outer ring, and at the edge |
| `fight` | approach 3.9 m, cut at 1.85 m, again after 16 ticks | derived | inside `FIGHT.swordsman.sightRange` 4.5, inside `FIGHT.warrior.reach` 1.9, over `againSec` 0.24 s |
| `home` | x 0 on chapter 1's first flat, within 1.2 m | derived | 6 m from the edge (x -6) and from the step (x 6). **Superseded by POLISH-1** ("POLISH-1 the touch stage"): the walk to it never settled |
| `goalStart` | (95.2, 9.05, 0) | authored | the stage's one shortcut: chapter 1's last flat, 5.8 m short of the goal and before its swordsman |
| `settleTicks`, `neutralTicks` | 8, 3 | authored | a release must show in the frames within 8 ticks, and the last 3 must be neutral |
| `msPerTick`, `waitMs` | 120, 20000 | authored | a wait for n ticks gives up after 20 s + 120 ms a tick (a CI runner draws about 4 frames a second) |

The stage's own time: 533 s on darwin SwiftShader, 28m20s in CI run 43374834353 (its `touch` job). The job's
limit is 45 minutes.

## D-027 desktop is untouched (2026-11-12)

`node tools/harness/frame-hashes.ts <out.json> --build` on origin/main (`4635605`, taken in this worktree before
the first change) and on this branch, then `--diff`, one machine (darwin, SwiftShader): **IDENTICAL: 229 values,
6 levels**, after the first `index.html` change and again on the finished source. No golden was written. A page
with a mouse has no touch element in its document, playing or paused (the touch stage's check); a bare page has
none even on a touch device, unless the URL asks (`?touch=on`).

## POLISH-1 the gate's sound (2026-11-13)

B-98. `assets/audio/gate.mp3`, `assets/audio/audio.json` `effects.gate`, `src/audio/audio.ts` `AUDIO.gain.gate`,
`src/audio/tap.ts` (the gate's event), `tools/gen/build-audio.mjs` `AUDIO_BUILD.effects.gate`.

| Constant | Value | Kind | Basis |
|---|---|---|---|
| the takes' length | 2.5 s | authored | asked of the model: `GATE.openSec` 1.2 s of swing and a tail; $0.002 a second, priced $0.0060 a take |
| the take that ships | `gate-b.mp3` | measured | `tools/gen/audio-stats.mjs`: `gate.mp3` peaks at -17.9 dB, -32.8 LUFS, broadband rumble with no creak in its spectrogram; `gate-b.mp3` peaks at -6 dB, -21.4 LUFS, a creak of regular wooden pulses for 1.6 s and one knock at 1.82 s; 43.5% of its energy under 200 Hz, 1.0% over 4 kHz (no ring of metal) |
| `seconds`, `fadeOut` | 2.2 s, 0.3 s | authored | keeps the knock at 1.82 s and lets it ring out; cut from its onset at 7 ms as every effect is |
| shipped | 27,271 B, 2.20 s, peak -3.4 dB, -20.8 LUFS, lead silence 1 ms | measured | `build-audio.mjs --check`: inside `LIMITS` (50,000 B an effect, peak -6 to 0 dB, lead under 40 ms) |
| `AUDIO.gain.gate` | 0.7 | authored | between the slash (0.7) and the fall (0.8) it starts with; **to be judged by ear** |
| when | the tick the gate leaves shut | derived | `check:fight` rule 6: heard once, on tick 579, the tick the last of three fell, with his `fell`; not again when a respawn shuts the gate |

Cost: $0.0120 in ledger rows 97 and 98; the ledger stands at $15.1968 of $20.00.

## POLISH-1 the touch stage (2026-11-13)

B-108. `tools/harness/touch.ts`. Where the time went, measured before any change: a timing line per check (not
committed), the stage on origin/main (`03b3988`) on this Mac, darwin SwiftShader.

| What | Before | After | Basis |
|---|---|---|---|
| the stage, darwin | 537.5 s, 60/60 | 121.4 s, 66/66 | `npm run playtest -- --only=touch`, the stage's own `ms` |
| the 17 checks that walk him home first | 474.8 s | about 2 s each | the timing lines |
| one `home()` | about 18 s: all 12 tries, every call | about 0.5 s | a probe of `home()` alone: he stopped at x 1.56 and x -2.04 by turns, never within 1.2 m of x 0 |
| "nothing sticks: both fingers lifted" | 135.1 s | 2.8 s | the walk back after the stuck-input check; not seen again once home is placed |
| everything else | 62.5 s | about the same | the timing lines |
| the stage, CI | 28m20s (run 43374834353) | three parts, three jobs: see "POLISH-1 the touch job on CI" | |

Why: `home()` walked the warrior back to the middle of the first flat by the stick, and the thumb lets go a frame
(5 played ticks, 0.6 m at a run) after the probe last showed him: he overshot by about 2.2 m either way, so every
call ran out its 12 tries. It now puts him there with the probe's `place` (as the goal's shortcut already did),
facing up the path; a standing first swordsman is still felled first, by the thumb.

| Constant | Value | Kind | Basis |
|---|---|---|---|
| the parts, darwin | one stage | `touch` 46.2 s (29 checks), `touch-release` 35.7 s (16), `touch-chapters` 49.3 s (27) | measured: one run, all three PASS; 66 distinct check names, 6 of them a part's own start and page-error checks |
| `home` | (1.5, 0.05, 0) | measured | where the old walk always ended (x 1.56, its twelfth try), so every check runs over the ground it ran over before. At x 0 the slide-off check's 'down' hold carried him over the edge at x -6 (seen: one run, one death) |

| `releaseAt` | (-5, 0.05, 0) | measured | where each nothing-sticks hold starts, pushing up the path: his one jump comes down short of the stair tread at x 6 (farthest seen, x 4.43), and its 1.25 m face holds him: a 250-tick hold ended at x 5.64, running, no death. From `home` a down hold ran over the edge at x -6 on a page slowed 6 times (see "POLISH-1 the touch job on CI") |

Every one of the 60 checks keeps its name, its condition and its "seen to fail"; the report's check names were
compared before and after: none missing.

## POLISH-1 the touch job on CI (2026-11-13)

B-108. `.github/workflows/ci.yml` job `touch`, a matrix of the three parts. Each job's time is GitHub's, from
start to end, setup included (the playtest itself is the report's `ms`).

| Run (head) | Shape | touch | touch-release | touch-chapters | Note |
|---|---|---|---|---|---|
| 43374834353 (main) | one job | 28m20s | | | before POLISH-1 |
| 43479377456 | one job, home by place | 11m03s, FAILED | | | the double jump (since paced by frames) |
| 43479707998 | one job | 12m39s | | | stage 611 s |
| 43482156143 | one job | 10m09s | | | stage 702 s |
| 43483354272 (`aece61e`) | three jobs | 3m00s | 4m12s | 7m21s | |
| 43485369808 (`d3357b7`) | three jobs | 2m52s | 8m11s | 6m32s | release: one check 286 s |
| 43485459420 (`eb5970d`) | three jobs | 5m41s, FAILED | 8m53s | 6m06s | release: one check 294 s; touch: the Jump tap |
| 43489321160 (`ea9e79d`) | three jobs | 2m52s | 3m05s | 5m18s | both fixed: stages 134.0, 136.9, 255.3 s |
| 43490541860 (`deb4b9b`) | three jobs | 2m52s | 3m19s | 4m10s | stage `touch` 132.1 s; every tap and hard move on try 1 |

| Constant | Value | Kind | Basis |
|---|---|---|---|
| the job's `timeout-minutes` | 14 (was 45) | measured | the slowest part on the code it now runs: touch-chapters 6m32s (43485369808), times the slowest runner seen, 2.01: the `touch` part's stage took 269.8 s on 43485459420 against 134.0 s on 43489321160, every check about twice as long (a slow runner, not a slow check). 13.1 min, so 14 |

**The release part's slow check.** On 43485369808 and 43485459420 "nothing sticks: the window loses focus" took
286 and 294 s (12.6 s on 43483354272), and the played ticks over it jumped by 3610 and 2415. Only a respawn stands a
fallen swordsman up; the next `home()` found chapter 1's first swordsman standing and called `fell` three times (90 s
each at most). On darwin with the CPU slowed 6 times the slide-off check's down hold ran from x 1.5 over the edge at
x -6, a death, and the swordsman stood again: a hold lasts as long as the round trips it waits on, so on a slow page
it can run 7.5 m (64 ticks at 7 m/s). Fixed by `releaseAt` (above): on 43489321160 the part's slowest check is its
first, 30.5 s, which fells him.

**The Jump tap.** On 43485459420 "a tap on Jump, down and up with no frame between, is still a jump, and a low one"
read Jump held for 5 ticks and rose 1.43 m; the five CI reports before it read 1 tick, 0.99 m, and `Thumbs.tap` is
as on main. The two touches are sent together, but a frame (5 ticks) came between them at the page. The stage now
records the played tick each touch reaches the page at (`TAP_SEEN`); a tap taken within one tick is judged at once,
and only a split one is sent again, up to `tries` (OQ-081 item 9). 43489321160: both at tick 945, try 1. Forced on
darwin: one split, sent again and passed on try 2; every try split, the check failed.

**The hard moves on CI**, paced by frames (43485369808, 43485459420, 43489321160, 43490541860): the double and the
dash jump land on try 1 every time (the dash jump's Jump 15 ticks after the dash began, window 4 to 22); the wall
jump on try 1, 1, 2 and 1. Its miss: Jump read down unbroken from ticks 0 to 59, so the one frame let go between its two presses played
no tick.

## POLISH-1 the hard moves by thumb (2026-11-13)

B-107. `tools/harness/touch.ts` sections 5b and 6b, `thumbMove`. Each move is placed at its step's takeoff (from
the level's `critical_path`, as `check:teach` reads it), played by real touch events, and judged from the probe's
tick log by teach-probe's `landedOn` (on his feet, no death, within 0.3 m of the landing's height). Each is seen to
fail with its control broken.

What a touch costs on this page, read from the probe's tick log: an awaited touch is taken about 14 to 18 played
ticks (3 frames) after it is sent; a frame is 5 ticks (the loop's `maxStepsPerFrame` binds on SwiftShader, so this
is the same on a slower runner); a tap (down and up sent together) is one tick.

| Constant | Value | Kind | Basis |
|---|---|---|---|
| `again` (was `kick`) | hold 2 frames, let go 1 frame | measured | chapter 2 step 5: pushed in with Jump held, then stick and Jump let go together, then Jump again: 11 of 11 wall jumps onto the shelf (10 in a probe of the move alone, 1 in the stage). Held 3 frames, the lift was lost; let go 2 frames, he had left the wall (a double jump, 3 of 3); still pushing in as he came down, he caught the wall top's edge (B-92) every time |
| `pressShort` | double 1.5 m, dash 1.2 m | measured | the touch lands up to 2 frames (1.2 m at a run) after the probe showed him. Double: 4 of 4 onto the next floor, x 58.2 to 58.6 (3 in a probe, 1 in the stage). Dash: the lip's edge is near x 35.1, short of the torii at 36; with Dash sent 1 m short and Jump timed by polls he ran off the lip before the dash, 0 of 3 in the stage |
| the dash jump's Jump | as soon as the tap on Dash is taken (`d3357b7`) | measured | Jump down 14 ticks after the dash began on darwin and 15 on CI (runs 43485369808, 43485459420, 43489321160, 43490541860), against a window of 4 to 22; it lands on try 1 each time. Was a frame after Dash: 18 or 19 on darwin, 20 on CI, near the window's end. By two polls of the probe it came 23 or 24 ticks after: 0 of 4 in a probe |
| the double's presses | `again`: down 2 frames, up 1 frame, down | measured | 3 of 3 in a probe, and in the stage. Paced instead by each press being taken: 4 of 4 on darwin, but on CI run 43479377456 the second press came at the face (a wall jump), 3 tries failed. By a poll for the peak: a ledge grab and no double jump, 0 of 8 |
| `moveTicks` | 150 | authored | a move's step gives up after this many played ticks; a move ends after twice this |
| `catchWithin` | 150 ticks | authored | chapter 2's first face: the catch must come within this many played ticks of Jump going down (it comes within about 40). Was 400 from the start of the run: the broken check waited it out, 52.7 s on CI |
| `tries` | 3 | authored | as `reachable`'s ledge catch is pressed again; the check says which try landed (all 1 of 3 on darwin). Also the most times the Jump tap is sent, and only when a frame split its touches ("POLISH-1 the touch job on CI") |

With its control broken: Jump broken, neither the wall jump nor the double leaves the ground; Dash broken, a jump
and an air jump reach the far side of chapter 4's gap and he hangs from its edge (B-92), not on top.

## POLISH-1 the gate's line (2026-11-13)

B-99. `src/systems/teach.ts` (a `gate` place), `src/ui/howto.ts` `MOVE_TEXT.gate`. No new number: the line is up
within `TEACH.approachM` (6 m) of the foot of the door, as every place's is, while any swordsman of the level
stands. `check:teach`: 126 properties (5 chapters, 53 places), 6 mutations caught. Chapters 1 to 4 have no gate
place. The line: "This gate opens when every swordsman is down. Press {slash} to cut."

## POLISH-1 desktop is untouched (2026-11-13)

`node tools/harness/frame-hashes.ts --build` on a copy of origin/main (`03b3988`) and on this branch after the
gate's sound and line, one machine (darwin, SwiftShader), then `--diff`: **IDENTICAL: 229 values, 6 levels**,
chapter 5 included. The harness's bare page shows no teach line and plays no sound. No golden was written.

## D-028 the seam's look (2026-11-13)

Chapter 2, `02-cliff-seam`, as an ink level (`palette: ink`, `lighting.ambienceZone: seam`). Constants: `SEAM` in
`src/loaders/seam.ts`. Darwin SwiftShader, the harness's 640 x 360, unless a row says otherwise. "authored" is a
choice made by eye from the player's own camera at the six beats in `docs/build-log/ch2-ink/`; "measured" has
the number beside it. Every value is PROVISIONAL (OQ-082).

| Constant | Value | Basis | How |
|---|---|---|---|
| `top` | paper-cream | measured | the six harness cameras look down on the path: with tops and lips at mist-pale the paint gate's paper share is 29.7% (floor 41%); at paper-cream 45.4% |
| `face` | mist-pale | measured | at wash-light (pushed dark when near, D-019) `post` is 24/26: 162 measurable stroke px (need 200), because a dark face is not a light form and a paper top against paper sky is a same-value edge. At mist-pale: 358 px, 26/26, and the rock's darks are the painted strokes (the courtyard's rule, OQ-079 item 8) |
| `lip.depth`, `lip.step` | 0.3 u, paper-cream | authored | the edge of the slab of ground at the top of every face, in the top's own value: the band a top is read by from below. 0.3 u is 5 px at 1080 lines from 10 u |
| `lip.under`, `lip.underStep` | 0.12 u, ink-grey | authored | one dark band under the lip (STYLE §4 Paths: a defined dark edge). Pushed to ink-black inside 12 u (D-019) |
| `minSlab` | 1 u | authored | a box lower than this is a stone (the two crow perches, 0.4 u): no lip, no brushwork |
| `across` | `seam_face_a`, 7 x 9 u a card, ink 0.9 | authored | faces across the path: 7 u is the path's width, so a face he climbs carries the card once. Laid from the box's own edge: laid in world z the first cut showed the card and its mirror image either side of z 0 |
| `along` | `seam_face_b`, 9 x 9 u, ink 0.8 | authored | faces along the path, in world x. Both cards: repeated as they are along a face (the cut edge is one more upright stroke), from the face's top and mirrored down it |
| `order` | -20 | derived | before the far field's mist sheets (0 up), which are paper over what stands in them: drawn after them, the strokes of a face showed through the mist |
| `ledge` | reach 6 u, up 0.9, paper-cream | derived | `kit_rock_mass` has level tops at 3.2, 5.8, 8.2, 10.2 and 12 u over its base, each stepped back up to 0.65 u; a mass stands with its base 2 u under the path. The two lowest (1.2 and 3.8 u over the path) are within a jump and a climb, and are drawn; the cards of the painted wall stand 6 u or more over the path and cover the rest |
| `pine.rise` | 2.5 u | derived | a face caught from below: chapter 2's are +4.5, +6.25, +2.8 and +4 (four pines); its +1.5 step has none |
| `pine.inset`, `pine.below` | 0.5 u, 0.3 u | measured | the card stands across the path 0.5 u past the face, its crown 0.3 u under the top. Standing ON the corner, the first cut failed the paint gate: 529 accent px hidden from the overview camera and 39 px off the ramp's chroma. Under the top: 0 and 0 |
| `EPS` (in `buildSeam`) | 1e-6 u | derived | two boxes meet where one's x1 is the other's x0: the edges of chapter 2's slabs in x and z are multiples of 0.5 u (the two perches, at 69.7 and the like, are not slabs), so any tolerance far under that tells "meets" from "does not" |
| `pine.cards` | pine_a 5.5, pine_c 5, pine_b 5.5 mirrored, pine_a 6 (u wide) | authored | chapter 1's wall pines are 6 to 7.5 wide; these grow from a face, not a cliff |
| `cliffs` | 8 towers | authored | three behind the wall, 66, 84 and 98 u tall (taller as the path climbs 15.5 u), ink 0.5 to 0.55; three in the void 30 to 62 u off the path, 60 to 84 u tall, ink 0.36 to 0.42 (thinner: STYLE §3 mid band, and §5's bright void); two past the ends. The paper share with them: 44.6% (45.4% without) |

**The gates on the shipped look** (`npm run playtest -- --level=02-cliff-seam`, all 14 stages PASS; `post` 26/26):

| Check | Chapter 2, ink | Floor or ceiling |
|---|---|---|
| near field dark mass (ink pass, rock shown) | 19.8% of 753,076 px | >= 10% |
| ink-black mass | 0.3% | >= 0.2% |
| silhouette inked where value separates | 71.0% of 3,602 px | 35 to 92% |
| ... where it does not | 98.3% of 898 px | >= 95% |
| measurable stroke px; 1 px share; 2 px and over | 316; 64.9%; 35.1% | >= 200; >= 10%; >= 10% |
| interior creases inked | 11.7% | <= 45% |
| flat ground inked, grazing camera | 0 of 48,098 px | <= 1% |
| mid silhouettes with a line | 3.0% | <= 35% |
| painted share (wall lifted away) | 25.3% | >= 3% |
| paper, rock drawn in place of the wall | 44.6% (37.7% of the frame the player sees) | >= 41% |
| dark mass where the rock stands | 10.2% (0.1% with the wall lifted away) | >= 4% |
| rock px drawn over | 99.8% (16.0% lifted away) | >= 90% |
| accent px hidden by paint; px off the ramp's chroma | 0; 0 | 0; 0 |

**The grazing check's ground class** (`tools/harness/post.ts`, one sign). The class was "a plane that recedes
steeply down the rows", by the absolute change of 1/z. On chapter 2 the rock's second slab overhangs the first,
and from 0.35 u over the ground its underside is such a plane, dark by value: 773 of 48,871 px, 1.6%, the same
1.6% this file records for chapter 2 under D-019 ("dark material", the reason the check was limited to dressed
levels). The slope is now signed: ground comes nearer toward the foot of the frame, an underside toward its top.

| Run | Chapter 1 | Chapter 2 |
|---|---|---|
| absolute slope, as it was | 0.1% (on record) | 1.6% (773 of 48,871): FAIL on rock, not on a line |
| signed slope, shipped | see "D-028 every other level" | 0.0% (0 of 48,098) |
| signed slope, the ink pass mutated to 0.7071 px diagonal steps (D-019's proof) | **FAIL 25/26**: 25.1% (10,873 of 43,267); 25.2% on record with the absolute slope | **FAIL 25/26**: 26.8% (12,903 of 48,098) |

`src/engine/ink-post.ts` was mutated for those two runs and restored; `git status` clean after. The 1% ceiling
and every other constant of `POST_GATE` and `PAINT_GATE` are untouched.

**Scene budget** (`tools/assets/budgets.json` `scenes`), beside chapter 1's:

| Level | Draw calls | Triangles | Was |
|---|---|---|---|
| 01-lower-stair | 137 | 331,496 | unchanged |
| 02-cliff-seam | 80 | 171,290 | 100 and 177,330 as greybox: 18 rock masses are no longer drawn, 14 boxes are one mesh |

## D-028 the seam's cards (2026-11-13)

`tools/art/seam-cards.mjs` -> `assets/seam/`. No fal call: both are cut from the inside of a cliff painting
ART-GEN delivered in round 2 (`assets/backdrop/gen`, ledger rows 47 to 60). Ledger total unchanged at $15.1968.

| Card | Source and rect (px) | Size | Bytes | Ink | Why |
|---|---|---|---|---|---|
| `seam_face_a` | `cliff_b`, 150,760 to 850,1460 | 1024 x 1024 | 776,504 | 37.6% | two buttresses and the cleft between them, below their tops and above the painted foot |
| `seam_face_b` | `cliff_c`, 280,390 to 860,970 | 1024 x 1024 | 797,296 | 40.9% | the broad stepped wall above its ledge: long dry strokes |

`floor` 0.3, `gain` 1.25 (authored): a wash is ink-black with the painting's density in alpha; density under 0.3
is the painting's own pale ground wash, which the face's mist-pale fill already is, so it is not laid twice.
At 1024 px a card is 114 to 146 px a u; chapter 1's front cliff cards are 98 to 158. Download: +1.57 MB.

## D-028 every other level (2026-11-13)

**Frame hashes.** `node tools/harness/frame-hashes.ts`, darwin SwiftShader, 229 values a report (six frames a
level with their counters, every visible renderable, the paint layer, the page's text and ids), on origin/main at
12a09c7 before any edit and on this branch.

| Run | Values that differ | Whose |
|---|---|---|
| first cut (5b8ca9e) | 24 | all `02-cliff-seam` |
| final tree | 24 or 25 | 24 `02-cliff-seam`; in some runs 1 more: `01-lower-stair` cam3 |

Chapter 1's cam3 is **not stable from run to run of one build**: hashed three times on the final tree it gave
the baseline's value once (c7b29bc6) and another twice (881620c4). The two frames differ in ONE pixel of
230,400, at (606, 91), by 51 levels in one channel. Nothing of the seam is loaded by chapter 1, and a run that
reproduces the baseline's hash exactly shows the branch changed nothing there. **And main does it too:** the
same tool run six times from a checkout of main's own source (the `polish-1` worktree at 0763225, whose `src`
differs from this branch's only in `level.ts` and `seam.ts`) gave 881620c4 four times and c7b29bc6 twice.
Not traced further (B-115).
The gym and chapters 3, 4 and 5: identical in every run.

**The grazing check after its sign** (the whole playtest, every level): gym 0 of 48,857 px; chapter 1 0 of
43,267 (0.1% on record with the absolute slope); chapter 2 0 of 48,098; chapter 3 148 of 48,446 (0.3%); chapter
4 31 of 47,453 (0.1%); chapter 5 49 of 50,868 (0.1%, ceiling 1%). The check is judged on dressed levels: 1, 2, 5.

**The whole playtest** on the tree before the last loader fix: every stage of every level PASS, and of the game
stages `reachable` 69/69, `run-metric` 15/15, `ambient-motion` 13/13, `fight` 15/15, `touch` 29/29,
`touch-release` 16/16, `touch-chapters` 27/27; `pitch-assist` 116/117. The one red was the fixture
`render-only-rear-beam` (a clone of chapter 2 with a beam that has no collider across the view): the linter's
model rejects the top behind it (0.000 deg) and the rig read it (4.250 deg), because an ink level did not draw a
box with no collider. A seam level now draws every unturned box; rerun: `pitch-assist` 117/117, and chapter 2's
`visual` unchanged against its goldens (the level has no such box).

**Linux goldens, chapter 2** (the documented way: CI's own frames). CI run 43504604178 on 0d7262b: every job
green but `level (02-cliff-seam)`, red at `visual` alone (six cameras 31.2 to 56.7% off the greybox goldens);
on Linux its `post` is 26/26 with darwin's numbers (ink-black mass 0.3%, paper 44.6%, grazing 0 of 48,098) and
`counters` is at the ratchet (80 and 171,290). All six `camN.actual.png` taken; against the darwin goldens
(pixelmatch, threshold 0.1) they differ in 0, 2, 1, 0, 1 and 2 px of 230,400. No other level's golden is written.

**Frame rate** (`tools/measure-display.mjs`, headed Chrome, ANGLE Metal, Apple M4 Max, the rig view at spawn,
360 frames, both levels in one session):

| Level | 2560 x 1440 | 5120 x 1440 | Cost of a frame, 2560 / 5120 |
|---|---|---|---|
| 01-lower-stair | 144.9 fps, 0 frames over 10 ms | 144.9 fps, 0 over 10 ms | 1.98 ms / 2.85 ms (2.81 ms on record, D-021) |
| 02-cliff-seam | 144.9 fps, 0 over 10 ms | 144.9 fps, 0 over 10 ms | 2.02 ms / 3.04 ms |

## D-029 the drift's look (2026-11-13)

Chapter 3, `03-drifting-stones`, as an ink level (`palette: ink`, `lighting.ambienceZone: drift`). Constants:
`DRIFT` in `src/loaders/drift.ts`. Darwin SwiftShader, the harness's 640 x 360, unless a row says otherwise.
"authored" is a choice made by eye from the player's own camera at the beats in `docs/build-log/ch3-ink/`;
"measured" has the number beside it. Every value is PROVISIONAL (OQ-083).

| Constant | Value | Basis | How |
|---|---|---|---|
| `top`, `face` | paper-cream, mist-pale | D-028 | the seam's, for the reasons measured there (paper share; a dark face is not a light form) |
| `brink.depth`, `brink.step` | 0.5 u, ink-grey | derived | the follow rig stands 6.66 u behind his feet and 3.67 u over them. At a 1.5 u gap, 2 u before its near edge, it sees the far face down to 3.67 x 1.5 / 8.66 = 0.64 u under its top; 0.5 u of dark fills that slice (chapter 2's lip leaves 0.12 u of dark in it). ink-grey is the lip band's step in D-028 |
| `minSlab`, `under` | 1 u, ink-deep | authored | a box thinner than 1 u hangs in the air (the lintels at 0.5 u, the crow's perch at 0.4 u): the band all the way down, and an underside, one step darker, so it is not see-through from below |
| `tile` | 7 u | derived | the seam's cards are 1024 x 1024: a square tile is the painting at its own proportion. 7 u is the path's width, so a face across the path carries one whole painting; 146 px a u |
| `cycle` | a, b mirrored, a mirrored, b | authored | the card of each tile along a face. The same strokes come round every 4 x 7 = 28 u (B-112: 7 to 9 u in chapter 2). The longest face is 28 u |
| `ink` | 0.85 | authored | between the seam's 0.9 (across) and 0.8 (along): one mesh a card here |
| `order` | -20 | D-028 | before the mist sheets, which are paper over what stands in them |
| `ledge` | reach 6 u, up 0.9, paper-cream | D-028 | the rock wall's two lowest ledges, as level ground |
| `mist` | base -5.5, top -1.5 | authored | chapters 1 and 2: -7 and -3. The lowest landing is y 0 (`buildBackdrop` throws if the mist reaches one). The same four u of fade, 1.5 u higher: the rock's feet dissolve 1.5 u under the lowest top, 4 u under the highest |
| `stone.top` | mist-pale | measured | paper: 4.8% of a docked stone's footprint is off the paper's value (the stone check, red). mist-pale: 100%. It is 22 levels off paper-cream and the post pass never pushes it (D-019) |
| `stone.lift` | polygon offset -2, -2 | derived | the stone's top lies in the ground's plane at each dock (0.5 u of it at its start, 2 u at its end). The path's dry-brush is offset -1; at -2 the stone is over both. Without it the frame at a dock is a depth tie between two meshes (B-115 is one such tie) |
| `stone.keel` | inset 0.35 u, drop 1.7 u, off (0.45, -0.3) u, ink-deep and ink-black | authored | rock hanging under the slab: 1.7 u is 3.4 slabs deep. Off centre, and two steps on alternate faces, so it is not a neat pyramid |
| `channel` | `mist_a` at its own 3.53 : 1, 3 u past each dock, 0.15 u over the mist's top, ink 0.6, order 60 | authored | 10 u of travel + 4 u of stone + 6 = 20 u long, so 5.67 u wide: wider than the 4 u stone, seen on both sides of it from above. Its thin ends lie inside the rock he boards from |
| `cliffs` | 5 towers | authored | three behind the wall, 60 to 72 u tall, ink 0.45 to 0.5; one past each end. The seam has 8 |
| `adrift` | 5 rocks | authored | cliff paintings 12 to 22 u tall hung with their feet 1.5 to 8 u over the path's lowest top, 22 to 44 u out in the void (18.5 u and more from the path's edge), ink 0.4 to 0.5, yaw 228 to 238: facing the way he comes. At yaw 170 to 200 (facing straight across the path) the first cut showed them as slivers from behind him |

**The gates on the shipped look** (`npm run playtest`, the whole run: every stage of chapter 3 PASS, `post` 28/28):

| Check | Chapter 3, ink | Floor or ceiling |
|---|---|---|
| near field dark mass (ink pass, rock shown) | 19.8% of 697,200 px | >= 10% |
| ink-black mass | 2.0% | >= 0.2% |
| silhouette inked where value separates | 70.7% of 3,530 px | 35 to 92% |
| ... where it does not | 99.4% of 1,309 px | >= 95% |
| measurable stroke px; 1 px share; 2 px and over | 659; 41.9%; 58.1% | >= 200; >= 10%; >= 10% |
| interior creases inked | 9.3% | <= 45% |
| flat ground inked, grazing camera | 148 of 48,446 px (0.3%, as greybox) | <= 1% |
| distant forms with a drawn line | 2.1% | <= 35% |
| void paper (rock drawn in place of the wall) | 48.5% | >= 41% |
| painted frame differs from the ink pass, wall lifted | 19.9% | >= 3% |
| dark mass where the rock stands; rock drawn over | 8.1%; 99.9% | >= 4%; >= 90% |
| scene peak (`counters`) | 80 draw calls, 171,044 triangles (greybox: 100 and 178,554) | ratchet set there |

## D-029 the stone check (2026-11-13)

`STONE_GATE` in `tools/harness/post.ts`: every moving stone of an ink level, from a camera at the follow rig's
offset (6.66 u behind, 3.67 u over) behind a point 5.2 u before the stone's start along its travel, with the
stone at each end of its path; the stone's own pixels are those that come nearer when its mesh is shown. Chapter
3, darwin SwiftShader, 640 x 360. Every red run is a mutation of the source, run with `--only=post`, then the
source restored and compared byte for byte.

| Run | stone_a near / far | stone_b near / far | Result |
|---|---|---|---|
| shipped | 2,908 / 1,346 px; 100% / 100% off paper; 93.1% / 29.7% light top | 2,890 / 1,332 px; 100% / 100%; 92.5% / 29.2% | PASS |
| the stone not drawn | 0 / 0 px | 0 / 0 px | FAIL |
| the greybox slab (an ink level before D-029) | 2,441 / 746 px; 6.3% / 68.9% off paper | 2,426 / 732 px; 4.8% / 69.0% | FAIL |
| paper on paper (top, sides, keel paper) | 6.0% / 34.4% off paper | 3.7% / 37.7% | FAIL |
| dark all over (top in the brink's step) | 0.0% / 0.8% light top | 0.0% / 0.0% | FAIL |

Thresholds: `minPx` 500, `minOff` 0.6, `minTop` 0.15, each between the worst wrong value and the least shipped.
**A first cut was discarded before any number was set:** it compared the frame with the frame without the stone,
and the paper-on-paper stone passed it at 83%, because the mist channel under the stone is grey.

## D-029 proportion (2026-11-13)

`PROPORTION_GATE` in `tools/harness/post.ts`, measured by the harness function `paintStretch` (`src/main.ts`):
for each textured painted mesh, the worst of its triangles' ratio between the two scales at which the painting's
pixels are laid on the world (1: neither stretched nor sheared). Judged in the `drift` zone, `max` 1.02;
reported elsewhere. It measures the card, not the view (a true card seen along its length is still foreshortened).

| Level | Painted cards | The worst three | Over 1.02 |
|---|---|---|---|
| 01-lower-stair | 9 | cliff:back 1.854, cliff:bay 1.815, backdrop:peak 1.667 | 4 (reported, B-116) |
| 02-cliff-seam | 12 | cliff:back 1.854, cliff:bay 1.815, backdrop:peak 1.667 | 5 (reported, B-116) |
| 03-drifting-stones | 13 | backdrop:ridge 1.003, path:wash 1.000, cliff:front 1.000 | 0 |
| 05-courtyard | 9 | courtyard:planks 2.075, backdrop:yard-sky 1.938, courtyard:tiles 1.707 | 5 (reported, B-116) |

Red runs on chapter 3 (each source restored byte-identical): the wall without the proportion flag, cliff:back
2.035, cliff:bay 1.815, cliff:front 1.342 (and `post` also lost one accent px to it); the far peaks squashed to
0.6, 1.667; a face tile laid 7 u by 9 u as the seam lays its card, 1.286. The far ridge's ring is 1.003: its
1024 x 64 painting is laid 481.7 u by 30 u a repeat.

## D-029 every other level (2026-11-13)

**Frame hashes.** `node tools/harness/frame-hashes.ts`, darwin SwiftShader, on origin/main at 584a9d4 (a scratch
checkout) and on this branch at 4b437bf: **25 values differ, 24 `03-drifting-stones`'s** (six frames, their
counts, the renderables, the paint layer) **and 1 `01-lower-stair` cam3**: 881620c4 on main's run and c7b29bc6 on
the branch's, the two values B-115's flipping pixel gives on main's own source (D-028). The gym and chapters 2,
4 and 5: identical. Chapter 2 did not take the proportion fix.

**The whole playtest** (`npm run playtest`, darwin, at d27f7f6's source): every stage of every level PASS; `post`
22, 27, 27, 28, 22, 24 for the gym and chapters 1 to 5; `reachable` 69/69, `pitch-assist` 117/117, `run-metric`
15/15, `ambient-motion` 13/13, `fight` 15/15, `touch` 29/29, `touch-release` 16/16, `touch-chapters` 27/27.

**fal:** no call. The ledger stands at $15.1968 of $20.00.
