# Hero models: handoff to a2

What exists, and what you need to know to load it. Nothing here is wired into the game: no level,
loader, budget, collider or shader was touched. Verdicts and defects are in `MANIFEST.md`; look at
`docs/build-log/art-gen/sheet.png` first.

Written against your `art-pass-1` at `bb5de28` (the D-020 hero class, the `.glb` import path and
`src/loaders/character.ts`). Three things in it need your attention before the two branches meet.

## Read this first

1. **Budget lines are missing, and I may not add them.** Your import path reads every
   `assets/hero/*.glb`, and D-020 says each hero asset has its own line in `budgets.json` `assets`
   set at its measured value. Round 1 added six such files and round 2 adds two more
   (`boulder_b.glb`, `spire.glb`), with no lines (the brief forbids me
   editing `tools/assets/budgets.json`). On `main` today nothing reads `assets/hero/`, so this
   branch passes `assets:budget`. **Once both branches are on `main`, expect `assets:build` to pick
   these eight up and `assets:budget` to want eight lines.** The values as delivered are in the table
   below; your build re-welds and compresses, so measure after it.
2. **The eight static files are built to your class ceilings:** 29,400 triangles (ceiling 30,000),
   one 1024 px texture, one material, one primitive, lower_snake_case names, none colliding with a
   kit asset name.
3. **The rigged warrior does not fit `src/loaders/character.ts` as it stands**, so it is in
   `assets/hero/rigged/`, not `assets/char/`. Details under "The animated warrior".
4. **Round 2 added the clips you were missing.** `rigged/warrior_anim.glb` has all nine, cut to
   your state map. See "The animated warrior (round 2)".
5. **Round 2 added painted backdrop cards for your layered backdrop:** thirteen PNGs with alpha in
   `assets/backdrop/gen/` (three cliff faces, three cliff pines, three far peaks, two mist, two wide
   views). They are one folder down so that your loader's glob and `paint-budget.mjs` do not see
   them. `assets/backdrop/MANIFEST.md` says how each is cut and how to draw it;
   `docs/build-log/art-gen/backdrop-sheet.png` shows them.

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
| `spire.glb` | yes as a rock; it is a wedge, not a spire (round 2) | 29,400 | 0.547 x 1.0 x 1.126 | 1,950,636 |
| `rigged/warrior_anim.glb` | **yes, skinned, nine clips; needs loader work** | 29,400 | 1.075 x 1.7 x 0.669 at rest | 3,846,332 |
| `rigged/warrior_rigged.glb` | no: superseded by `warrior_anim.glb` (kept as the paint tool's reference) | 29,400 | 1.075 x 1.7 x 0.669 at rest | 3,905,320 |
| `rejected/pine.glb` | no (flat canopy) | 29,400 | 1.201 x 1.0 x 0.478 | 1,976,892 |

`rigged/` and `rejected/` are one level down so your `assets/hero/*.glb` glob does not see them.

## Scale and orientation

- **Every static model is exactly 1.0 unit tall**, +Y up, sitting on y = 0, centred on x and z.
  Origin is the centre of the base (for the warrior, the ground between his feet). Multiply by the
  world height you want. No game dimension is baked in.
- **Front faces +Z.** The warrior's face and chest look down +Z; his back, with the sword, faces -Z.
  Your character convention is facing -Z, so he needs a half turn about Y.
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

**`rigged/warrior_anim.glb` is the one to load.** It replaces `rigged/warrior_rigged.glb`, which
stays only as the paint tool's reference. Look at `docs/build-log/art-gen/anim-sheet.png` first.

The round 2 brief named the path `assets/hero/warrior_anim.glb`. It is one folder down instead,
because your `tools/assets/build.mjs` imports every `assets/hero/*.glb` as a static hero asset: it
would strip the skin and clips from this file and want a budget line for it. `git mv` it if you
would rather have it at the brief's path.

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

Cut for your state map in `src/entities/character-model.ts` and the timings in
`src/entities/player.ts` as they stood on `art-pass-1` at `3bec925`. Keys are 30 per second, linear.

| clip | seconds | your map plays it | what it is | verdict |
|---|---|---|---|---|
| `idle` | 9.967 | loop | standing, small sway and weight shifts | good |
| `walk` | 1.033 | (unmapped) | the rig's own walk | good |
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

**Where it does not match `src/loaders/character.ts`:** unchanged from round 1.

| your loader expects | this file has |
|---|---|
| `assets/char/*.glb` | `assets/hero/rigged/warrior_anim.glb` (moving it is your call) |
| materials named `robe`, `ink`, `wash`, `paper`, each replaced by a flat palette fill; any other name is an error | one material, `Material.001`, carrying a painted texture |
| facing -Z | facing +Z |
| asset name `char_warrior` | `warrior_anim` |

The second row is the real one. Your loader discards the GLB's colour and fills by material name;
this model's whole point is its painted texture. Two ways through, both yours to choose:
- **Keep the painting:** give the loader a textured path that keeps `map` on an unlit material.
- **Keep the flat fills:** split this mesh into four named materials by texel colour (robe blue-grey,
  near-black, mid grey, pale). That is mechanical and I can do it in `tools/gen/` if you want it,
  but it throws the painting away, and your `ink` fill would turn the straw hat black.

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
