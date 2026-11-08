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

## Open (H4)

- Linux visual goldens for the asset-bearing gym were COPIED from Darwin, not rendered on
  Linux. Basis for the copy: main's Darwin and Linux sets are pixel-identical on all 6 cameras.
  Not yet confirmed on CI: the branch is unpushed, and Linux SwiftShader could pick a different
  KTX2 transcode target than macOS (ASTC 4x4 here).
- Tier-2 (hardware only): which compressed format a real GPU transcodes to, and GPU memory.
  SwiftShader advertises ASTC, ETC1, ETC2, S3TC and BPTC, so in CI the texture STAYS
  compressed (ASTC 4x4). That is a property of SwiftShader, not a guarantee about players' GPUs.
