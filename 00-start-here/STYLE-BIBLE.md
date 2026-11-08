# STYLE BIBLE — Karasu: Flight of the Exile

Derived from `reference/seed/seed.mp4` (locked) and `reference/palette.json`.
Written from the six hero frames, not from memory.

**This document is LAW.** An agent that has never seen the seed video must be able to
produce matching work from this text alone. Every rule below is stated so it can be
checked against a screenshot.

---

## 1. MEDIUM — WHAT THIS IS

Flat sumi-e ink wash on aged paper. It is a **painting**, not a render of a painting.

**Required:**
- Forms are defined by outline plus flat fill. A shape has an edge and an interior; it
  does not have a gradient from a light source.
- Brush character is visible at form edges — strokes taper and vary in weight.
- Paper tone shows through everywhere. Nothing is pure white.

**Forbidden, without exception:**
- Specular highlights of any kind
- Cast shadows with a direction — no sun, no key light, no shadow angle
- Ambient occlusion, contact shadows, bloom, lens flare, chromatic aberration
  *(The landing mark is not a contact shadow. It is the one documented exception, specified in §9. [D-010])*
- Depth of field or any lens blur
- Film grain (paper grain is different — see §6)
- Any surface that reads as wet, polished, metallic or glass
- Gradients used to suggest a curved surface lit from one side

**The test:** if you can tell where the light is coming from, it's wrong.

---

## 2. PALETTE LAW

Eight values, one warm-grey ramp. Measured from 36 frames.

```
paper-cream  #cabfac  34.1%   far distance, sky, paper
mist-pale    #afa79c  11.2%   high mist
wash-light   #979189  14.4%   light wash, distant stone
stone-mid    #827d76   9.2%   mid-ground stone
wash-mid     #69645f   8.9%   mid wash
ink-grey     #534e4b   8.2%   near forms
ink-deep     #383838   8.8%   deep shadow, pine mass
ink-black    #20201e   5.1%   brush black, outlines
```

**The palette is monochromatic.** There is no hue variation across these eight. Any
colour that is not on this ramp is a violation unless it is the accent below.

### The accent

Vermilion, and only on torii gates. *(Amended 2026-11-08 by PHASE-0-DECISIONS D-001, D-003 and D-006,
on measurement. The original 1% ceiling is withdrawn; its reasoning — "the vermilion never
clustered at k=8" — shows the seed contains no vermilion and says nothing about area.)*

**Hue — authored, not measured (D-001).** The seed's reddest pixels (median `#603633`) read as
another dark shape and are recorded in MEASUREMENTS.md as a fact about the seed, not as the
accent. The accent must pass `ACCENT_CONTRAST` against every ramp value above: CIEDE2000
>= 2x the largest ramp step, chroma >= 3x the ramp's largest chroma, and lightness at or above
wash-mid. Candidates live in `assets/src/accent.json`; the H2.5 feel test chooses between them.

**Area — a floor at scanning distance, never a ceiling (D-003, revised by D-006).** The same gate
fills 9% of the frame from inside it and nothing at 200u. That is distance, not intent, and a
player walking through a gate is the moment the accent is meant to dominate. So there is no
ceiling. What matters is that the **next** gate can be found. `ACCENT_AREA` stands the player at
the previous torii (or spawn), turns the follow camera toward the next gate, and counts only that
gate's accent pixels. It must cover **at least 0.0204% of the frame**.

That floor is measured, not chosen. The one observed findability failure is the seed's red at
0.012% of the frame, about 28 px at 640x360. A torii's largest accent blob stays above that out
to 90u (0.0204%) and fractures at 100u. Provisional until the H2.5 feel test measures
findability with a person. Basis and full curve: MEASUREMENTS.md "D-006 accent floor".

The restraint that carries the weight is unchanged: **what** may carry the accent.

- Torii only, and nothing else, ever
- Never on the character
- Never on terrain, stone, trees, mist or sky
- Never on UI
- A frame may contain more than one torii. The band applies to the whole frame.

The character's robe is **desaturated blue-grey**, not blue. It sits near `#7d8590` in
value and saturation. It is not a second accent.

---

## 3. DEPTH — THREE BANDS

Depth is conveyed **only** by value and atmosphere. Never by blur, never by lighting.

| Band | World distance | Value range | Outlines | Detail |
|---|---|---|---|---|
| **Near** | 0–25u | full ramp, `ink-black` present | black, full weight | fracture lines, needle clusters, fabric folds |
| **Mid** | 25–80u | `wash-light` to `ink-grey` only | grey, thin | major forms only, no surface texture |
| **Far** | 80u+ | `paper-cream` to `mist-pale` only | **none** | silhouette only |

Transitions are not gradual fades. Each band has its own treatment and the change at the
boundary is visible. Fog near/far in level JSON should be set so the bands land at these
distances.

**No element may span two bands.** A cliff that runs from near to far is drawn as separate
masses, each belonging to one band.

---

## 4. ENVIRONMENT GRAMMAR

The vocabulary of forms. Do not invent outside this list.

**Cliffs** — the structural element. Vertical faces, drawn with:
- horizontal strata as value steps between flat masses
- **vertical fracture lines** as dark strokes over the flat fill, roughly parallel,
  irregular spacing, running the full height of a face
- Cliff tops are flat or near-flat. Cliff faces are near-vertical. There is no rounded
  rock anywhere in the reference.

**Paths** — narrow ledges of lighter value than the cliff beside them. Always have a
defined dark edge where they meet the void. Cut stone where man-made, bare rock where not.

**Stairs** — straight runs, visible treads as horizontal value lines. Never spiral.

**Pines** — dark silhouette masses in horizontal layers. No individual needles. Trunks are
visible and crooked. Always `ink-deep` or `ink-black`, never mid-value.

**Torii** — vermilion post-and-lintel. **Placed in sequence along a path as waypoint
markers**, not as single landmarks. Two or three receding into mist is the canonical use.

**Cloud sea** — horizontal banded wash in `paper-cream` and `mist-pale`. It has no form
and no surface. It is a boundary, never a place.

**Buildings** — pagoda and fortress forms: tiled roof planes with upswept eaves, plastered
walls, stone bases. Roofs are the readable element; walls are flat fills.

---

## 5. COMPOSITION — THE DARK WALL AND THE BRIGHT VOID

Every reference frame shares one structure, and this is the single most useful rule here:

**A dark cliff mass occupies one side of the frame. A bright void (cloud sea or sky)
occupies the other. The navigable path is the seam between them.**

This is not just a look — it is a level-building rule. It tells a level agent where to put
geometry and where to put nothing. A level that reads as a dark wall on one side and
bright emptiness on the other, with a thin walkable seam between, will look correct before
anyone adjusts a single material.

Corollaries:
- The horizon sits high. Void fills the lower-mid frame.
- Near foreground elements (a pine branch, a rock) frequently intrude from one edge to
  frame the shot. Levels should place such elements near the camera path.
- Vertical cliff lines and the horizontal cloud bands cross at roughly right angles. That
  tension is the composition.

---

## 6. SURFACE AND POST

**Paper grain** — a static texture over the whole frame, low opacity, visible in flat
areas. It does NOT scroll or animate: a moving grain reads as film, which is wrong. Must
be seeded from a constant so visual regression stays deterministic.

**Ink edge** — a dark outline pass on depth and normal discontinuity. Weight scales DOWN
with distance (see §3) so far geometry does not turn noisy.

**Value compression by depth** — the three-band treatment applied as a post pass, not
baked into materials.

**Forbidden in post:** bloom, vignette beyond a very slight paper darkening at the extreme
corners, colour grading that introduces hue, motion blur, any screen-space reflection.

---

## 7. THE CHARACTER

Read from hero frames, where he is closest. Get these right or the silhouette breaks.

- **Wide conical straw hat (amigasa).** Reads as a flat dark disc from behind and above.
  This is the single most identifying element — it must stay crisp at any distance.
- **Layered robe**, desaturated blue-grey, **frayed and ragged at the hem**. The fraying is
  character — he is an exile, not a retainer.
- **Sword across the back**, diagonal, scabbard visible, hilt over the right shoulder.
- **Two gourds**, one at each hip, pale tan. Not one — two.
- **Leg wraps** below the knee, then straw sandals.
- Hair tied back, visible below the hat brim.

**Silhouette test:** rendered at 64 pixels tall as a solid black shape, the hat disc, the
robe mass and the sword diagonal must all still read. If any of the three disappears, the
model is wrong.

---

## 8. CAMERA

- Behind the character, slightly above, roughly shoulder height.
- Character occupies **one fifth to one quarter** of frame height.
- Character sits right of centre; the path leads away into frame.
- Horizon high.
- No crane moves, no orbits, no cuts. The camera follows; it does not perform.

---

## 9. FORBIDDEN LIST

The section that prevents the most drift. An agent unsure whether something is allowed
should assume it is not.

1. Any light source you can locate
2. Any colour off the §2 ramp, except the accent on torii
3. Saturated colour of any kind on the character
4. Rounded or organic rock — all stone is faceted and planar
5. Spiral stairs, arches, domes
6. Individually drawn pine needles
7. Anything that reads as a lens: blur, flare, aberration, grain that moves
8. Water with a reflective surface — water is flat wash
9. Gradients within a single form
10. Text, UI chrome or signage rendered into the world
11. A frame with no dark mass, or no bright void — see §5
12. Cloud or mist treated as a surface you can stand on

**The one exception: the landing mark. [Amended on evidence, D-010: the H2.5 feel test.]**
A flat ink disc under the player is allowed, and it is NOT a shadow, *only* while all of these hold:

- **hard-edged**: no softness, no penumbra, no blur, no opacity falloff
- **opaque, flat, palette ink** (`ink-black #20201e`): never the accent, never a tint of the ground
- **directly beneath the capsule centre**: no offset in any direction, so it points at no light
- **under the player only**: nothing else in the world gets one
- **size from height alone**: capsule radius at the ground, shrinking as the player rises

It reports how far down the ground is, and implies no light direction, so it passes §10 test 1.
Break any one property (soften it, offset it, put one under a crow) and it becomes a shadow, which
§1 and item 1 above forbid. A ballistic landing *predictor* is not covered: D-010 dropped it.
Implementation: `src/entities/landing-mark.ts`. `?landingmark=off` shows the frame without it.

---

## 10. HOW TO CHECK A SCREENSHOT

In order. Any failure is a failure.

1. Can you tell where the light is? → fail
   (The §9 landing mark does not count: it sits dead centre under the player and has no direction.)
2. Is any colour off-ramp other than the accent on torii? → fail
3. Scanning from one torii, does the next gate's accent cover less than 0.0204% of the frame? → fail
   (`ACCENT_AREA`, D-006. A waypoint nobody finds is not a waypoint. There is no upper limit.)
4. Are there three distinguishable depth bands? → if not, fail
5. Is there a dark mass on one side and a bright void on the other? → if not, fail
6. Does the hat disc read as a clean shape? → if not, fail
7. Any item from §9 present? → fail

---

*Derived from the locked seed. If the seed changes, this document is void and must be
re-derived — do not patch it. Amendments made on MEASUREMENT under a recorded decision are
the one exception, and each is marked in place (section 2: D-001, D-003, D-006; sections 1, 9, 10:
D-010, the landing mark).*
