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
| 00-gym | 33 / 33 | 1,102 / 1,102 |
| 01-lower-stair | 75 / 75 | 6,502 / 6,502 |
| 02-cliff-seam | 49 / 49 | 5,050 / 5,050 |
| 03-drifting-stones | 49 / 49 | 5,662 / 5,662 |
| 04-summit-ridge | 48 / 48 | 5,038 / 5,038 |

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
