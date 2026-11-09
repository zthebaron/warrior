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

    ground    slope 50deg, autostep 0.34    (slope = Rapier maxSlopeClimbAngle, NOT measured; autostep
                                            measured B-14, see "Autostep" below: Rapier is configured 0.5)
    jump      maxH  5.0   maxRise 2.00
    double    maxH  9.5   maxRise 3.50   (running approach, not standing-adjacent 4.0)
    dash      maxH  4.0   maxRise 0.50   (measured clear, one sample; NOT the autostep height, which is 0.34
                                          effective: re-measure with coverage, B-20)
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
| kit_rock_mass | 216 / 216 | 3460 / 3460 | 16032 | 1 / 1 | 32 / 32 | 1 / 1 | 1 / 1 |

Cells are measured / limit. Renderer cross-check (SwiftShader): torii 1 call / 108 tris,
rock 1 call / 216 tris. Placed in 00-gym the scene went 30 -> 33 peak draw calls and
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
| 00-gym | 34 / 34 | 1,104 / 1,104 |
| 01-lower-stair | 46 / 46 | 3,888 / 3,888 |

01-lower-stair (CHAPTER-1, CI run 42505174534, landing mark on): 13 kit_rock_mass (13 x 216 = 2,808 tris), 4 kit_torii (432), greybox ledges/stair/knobs, 2 patrollers, 2 crows, the landing mark.

01-lower-stair, raised 43 / 3,852 -> 46 / 3,888 (D-015a + D-015c, PROVISIONAL with them): three
greybox prim_box added (the 1.25 jump-teach step at x 6-10, the two 1.75 shelves at x 38.5-41.5 and
91.5-94.5). Exactly +3 draw calls and +3 x 12 = +36 triangles, one unbatched box each, measured by the
harness `counters` stage on Darwin SwiftShader. Revert D-015a and this line reverts with it.

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

**ASSIST_CASE (OQ-052 item 7).** The table above uses an unobstructed arm. Every chapter waypoint that passes
READABLE_RISE only because of the assist is also run in its real level, by the `pitch-assist` stage. It must read
in the real rig, at the pitch modelled here.
- **Proof fixture:** the same +4.0 wall reads 2.33 deg when clean. Under an overhang 3.6 u high behind the
  approach it reads 0.00 deg (arm pulled in), and the check fails it.
- **Today:** gym and chapter 1 have 0 cases. A climb at maxRise 4.50 needs a landing at
least 2.55 u deep.

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
