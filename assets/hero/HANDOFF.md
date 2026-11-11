# Hero models: handoff to a2

What exists, and what you need to know to load it. Nothing here is wired into the game: no level,
loader, budget, collider or shader was touched. Verdicts and defects are in `MANIFEST.md`; look at
`docs/build-log/art-gen/sheet.png` first.

Round 1 wrote this against your `art-pass-1` at `bb5de28`. Round 2 re-read your branch at `72a254f`
and brought this file up to it: you now import only what `assets/src/hero.json` names, statics from
`assets/hero/` and rigged models from `assets/hero/rigged/`, you keep the painted texture, and you
turn the figure to face -Z yourself. Where round 1's text said otherwise it has been removed.

## Read this first

1. **Round 2 delivered the clips you are holding frames for** (your B-45).
   `rigged/warrior_anim.glb` has nine: `idle walk run jump fall land dash wall climb`. It is where
   your build reads rigged models from. Wiring it in is under "The animated warrior (round 2)".
2. **Round 2 delivered painted cards for your layered backdrop:** thirteen PNGs with alpha in
   `assets/backdrop/gen/` (three cliff faces, three cliff pines, three far peaks, two mist, two wide
   views). They are one folder down because your loader's glob and `paint-budget.mjs` both read
   `assets/backdrop/*.png` without descending, and would bundle and fail on thirteen 2048 px
   sources. `assets/backdrop/MANIFEST.md` says how each is cut and how to draw it;
   `docs/build-log/art-gen/backdrop-sheet.png` shows them.
3. **Two more static rocks** are there to name in `assets/src/hero.json` if you want them:
   `boulder_b` and `wedge`. Nothing ships until you name it, and each one you name wants its
   measured line in `budgets.json`, which I may not edit. The values as delivered are in the table
   below; your build welds and compresses, so measure after it.
4. **All eight static files are built to your class ceilings:** 29,400 triangles (ceiling 30,000),
   one 1024 px texture, one material, one primitive, lower_snake_case names. None has the name of
   a kit asset (checked against `assets/dist/manifest.json`).
5. **The warrior's face and hands are now painted** in `warrior.glb` and `warrior_anim.glb`. Your
   chroma cap (26) will mute the skin the way it mutes the gourds (your OQ-070).

## Files

| file | use it? | triangles | size as stored (x, y, z) | bytes |
|---|---|---|---|---|
| `warrior.glb` | yes, static | 29,400 | 0.632 x 1.0 x 0.393 | 2,960,148 |
| `torii.glb` | yes | 29,400 | 1.052 x 1.0 x 0.162 | 1,498,284 |
| `lantern.glb` | yes | 29,400 | 0.412 x 1.0 x 0.415 | 2,317,256 |
| `cliff_b.glb` | yes | 29,400 | 0.530 x 1.0 x 0.546 | 2,120,144 |
| `cliff.glb` | yes, alongside `cliff_b` | 29,400 | 0.502 x 1.0 x 0.537 | 1,924,468 |
| `boulder.glb` | yes | 29,400 | 2.130 x 1.0 x 2.016 | 1,971,444 |
| `boulder_b.glb` | yes (round 2) | 29,400 | 0.633 x 1.0 x 0.635 | 2,050,884 |
| `wedge.glb` | yes (round 2). Asked for as a spire; it came back a wedge, twice as deep as wide | 29,400 | 0.547 x 1.0 x 1.126 | 1,950,636 |
| `rigged/warrior_anim.glb` | **yes, skinned, nine clips; needs loader work** | 29,400 | 1.075 x 1.7 x 0.669 at rest | 3,846,332 |
| `rigged/warrior_rigged.glb` | no: superseded by `warrior_anim.glb` (kept as the paint tool's reference) | 29,400 | 1.075 x 1.7 x 0.669 at rest | 3,905,320 |
| `swordsman.glb` | the model the rig request was sent (D-023). Not named in `assets/src/hero.json` `static`, so it does not ship | 14,700 | not measured | 2,258,952 |
| `rigged/swordsman_anim.glb` | **yes, skinned, six clips** (D-023): `idle walk close slash hit death`. In the game as `assets/char/swordsman_anim.glb` | 14,700 | 1.8 m tall as the game scales him | 2,687,588 |
| `rejected/pine.glb` | no (flat canopy) | 29,400 | 1.201 x 1.0 x 0.478 | 1,976,892 |

`rigged/` is where your build reads rigged models from. `rejected/` holds what should not ship.

## Scale and orientation

- **Every static model is exactly 1.0 unit tall**, +Y up, sitting on y = 0, centred on x and z.
  Origin is the centre of the base (for the warrior, the ground between his feet). Multiply by the
  world height you want. No game dimension is baked in.
- **Front faces +Z.** The warrior's face and chest look down +Z; his back, with the sword, faces -Z.
  (Your `CHARACTER.faceTurn` already turns him.)
- All node transforms are baked into the vertices: one mesh, one primitive, identity transform.

## Format

- Plain GLB. **No Draco, no Meshopt, no KTX2, no extensions.** Your pipeline adds KTX2 and Draco.
- One material, `metallicFactor` 0, `roughnessFactor` 1, `doubleSided` true, with one base colour
  texture (PNG, 1024 px). No normal or metallic-roughness map: they were generated and then
  dropped to fit the class's one-texture ceiling.
- **The base colour is already the final colour.** It was tone-matched to the painting and, for
  everything but the warrior, rebuilt as a single-hue ramp from the style bible (`stone-mid` for
  stone, the accent for the torii). Draw it unlit.

## The torii and the accent

`torii.glb` has the accent baked into its texture as one flat hue, `vermilion_a` `#e34234`. The
kit torii switches accent with `?accent=`. To keep that working on this model, ignore the texture
and set the material colour from `assets/src/accent.json`; the gate is a single colour, so nothing
is lost.

## The animated warrior (round 2)

**`rigged/warrior_anim.glb` is the one to load.** It replaces `rigged/warrior_rigged.glb`, the
file your `assets/src/hero.json` names today. That one is untouched and keeps working until you
switch; after that it is only the paint tool's reference. Look at `docs/build-log/art-gen/anim-sheet.png` first.

The round 2 brief named the path `assets/hero/warrior_anim.glb`. It is in `rigged/` instead,
because that is where your build reads rigged models from (`heroSource(name, 'rigged')`, and your
comment "rigged ones at assets/hero/rigged/<name>.glb (ART-GEN)"). At the brief's path your build
would not find it as a character.

**To use it:** name it under `characters` in `assets/src/hero.json` (`"warrior_anim": {}`), give
it its `budgets.json` `characters` line, set `CHARACTER.asset` to `warrior_anim`, and replace the
held frames in `poseOf` with the clips below. `walk` and `run` keep their names, so your stride
logic is unchanged; their lengths differ slightly from round 1's (1.033 s and 0.633 s).

- One mesh, one primitive, one material (`Material.001`), one 1024 px base colour texture, one
  skin of 24 joints, **nine clips named exactly** `idle walk run jump fall land dash wall climb`.
  3,846,332 bytes. `tools/gen/build-anim.mjs` asserts all of that on the written file.
- 24 joints, Mixamo-style names: `Hips Spine02 Spine01 Spine neck Head head_end headfront
  LeftShoulder LeftArm LeftForeArm LeftHand RightShoulder RightArm RightForeArm RightHand
  LeftUpLeg LeftLeg LeftFoot LeftToeBase RightUpLeg RightLeg RightFoot RightToeBase`.
- 1.7 units tall with feet on y = 0, which matches your "1 unit = 1 m" if he is 1.7 m. The
  `Armature` root carries a scale of 0.01. Do not bake or reset it; the skin depends on it.
- **It is a new rig, not round 1's.** All nine clips, `walk` and `run` included, come from one
  request. Two rig runs of the same mesh do not agree (rest joints up to 0.021 of the height
  apart), so do not play a clip from `warrior_rigged.glb` on this skeleton or the reverse.
- The face and hands are now skin (`tools/gen/paint-warrior.mjs`); `warrior.glb` has the same paint.

### The clips

Cut for the twelve player states and the timings in `src/entities/player.ts`. The "plays" column
is how each clip is meant to be played; it follows the state map your `character-model.ts` had at
`3bec925` (one-shots hold their last frame, `ledge_grab` holds the first frame of `climb`). Keys
are 30 per second, linear.

| clip | seconds | plays | what it is | verdict |
|---|---|---|---|---|
| `idle` | 9.967 | loop | standing, small sway and weight shifts | good |
| `walk` | 1.033 | loop | the rig's own walk | good |
| `run` | 0.633 | loop; also `sprint`, faster | the rig's own run | good |
| `jump` | 0.400 | once, last frame held | spring off the ground into a tuck | acceptable: arms cross the hat brim |
| `fall` | 0.700 | loop | pitched forward, arms out, legs working | acceptable: more dramatic than the design |
| `land` | 0.900 | once | opens on the impact crouch, then stands up | good |
| `dash` | 0.600 | loop | low forward-leaning sprint, starting on its widest stride | good |
| `wall` | 0.467 | loop | clinging to a wall in front of him, knees tucked, hands up | weak: nearly still, arms cross the brim |
| `climb` | 0.400 | once; frame 0 held as `ledge_grab` | ledge hang, then a crouch on top, then rising | weak: composed, see below |

- **Every clip is in place.** The game owns movement. Travel along the ground was removed from the
  `Hips`, and so was flight: the three airborne clips (`jump`, `fall`, `wall`) hold the `Hips` at
  standing height and tuck the legs up under them, so nothing drops inside the capsule when one
  blends into another. Origin is the ground between the feet.
- **Every loop closes**, checked on all joints by the build, not by eye.
- **`land`** is 0.9 s but your `land` state is 0.08 s, so only its first frames show: it opens
  already in the crouch for that reason.
- **`dash`** is 0.6 s and your dash is 0.16 s, so only its start shows: the loop was turned so that
  the start is the widest stride.
- **`climb`** does not exist in Meshy's library in the shape you need (0.35 s, hang first, standing
  last), so it is three bought poses joined by interpolation: a hang at 0 s, a deep crouch at
  0.24 s, rising at 0.35 s, held to 0.40 s. In the hang the hands are 1.60 above the origin, your
  `ledgeHangFeetBelowTop`, with the feet at the origin. It has never been seen against a ledge.
- **`wall`** faces the wall: the wall is on his +Z side.
- In `jump`, `wall` and `climb` the raised forearms pass through the hat brim. The hat is wide and
  rigid on the head joint; no clip with the arms up avoids it.
- The sword and the gourds are part of the skinned mesh. They follow the spine and hips and do
  not swing.
- Nothing here has been loaded in the game.

Rebuilding it (needs the download, which is git-ignored under `assets/build/gen/anim/`):

```
node tools/gen/fal-call.mjs fetch 01a1c6fb-7230-7952-bbdc-8d3d7272c61d --out assets/build/gen/anim --name warrior   # free
node tools/gen/build-anim.mjs assets/build/gen/anim assets/hero/rigged/warrior_anim.glb
node tools/gen/paint-warrior.mjs --weights assets/hero/rigged/warrior_rigged.glb --apply assets/hero/rigged/warrior_anim.glb
```

## Looking at a model without the game

```
node tools/gen/render-glb.mjs assets/hero/warrior.glb out.png                              # 4 views, textured and clay
node tools/gen/render-glb.mjs assets/hero/rigged/warrior_anim.glb out.png --clip run --time 0.2
node tools/gen/anim-strip.mjs out.png --frames 6 land=assets/hero/rigged/warrior_anim.glb#land    # frames of a clip
node tools/gen/inspect-glb.mjs assets/hero/torii.glb                                       # triangles, textures, bounds
```
