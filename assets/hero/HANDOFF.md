# Hero models: handoff to a2

What exists, and what you need to know to load it. Nothing here is wired into the game: no level,
loader, budget, collider or shader was touched. Verdicts and defects are in `MANIFEST.md`; look at
`docs/build-log/art-gen/sheet.png` first.

Written against your `art-pass-1` at `bb5de28` (the D-020 hero class, the `.glb` import path and
`src/loaders/character.ts`). Three things in it need your attention before the two branches meet.

## Read this first

1. **Budget lines are missing, and I may not add them.** Your import path reads every
   `assets/hero/*.glb`, and D-020 says each hero asset has its own line in `budgets.json` `assets`
   set at its measured value. This branch adds six such files and no lines (the brief forbids me
   editing `tools/assets/budgets.json`). On `main` today nothing reads `assets/hero/`, so this
   branch passes `assets:budget`. **Once both branches are on `main`, expect `assets:build` to pick
   these six up and `assets:budget` to want six lines.** The values as delivered are in the table
   below; your build re-welds and compresses, so measure after it.
2. **The six static files are built to your class ceilings:** 29,400 triangles (ceiling 30,000),
   one 1024 px texture, one material, one primitive, lower_snake_case names, none colliding with a
   kit asset name.
3. **The rigged warrior does not fit `src/loaders/character.ts` as it stands**, so it is in
   `assets/hero/rigged/`, not `assets/char/`. Details under "The rig".

## Files

| file | use it? | triangles | size as stored (x, y, z) | bytes |
|---|---|---|---|---|
| `warrior.glb` | yes, static | 29,400 | 0.632 x 1.0 x 0.393 | 3,170,420 |
| `torii.glb` | yes | 29,400 | 1.052 x 1.0 x 0.162 | 1,498,284 |
| `lantern.glb` | yes | 29,400 | 0.412 x 1.0 x 0.415 | 2,317,256 |
| `cliff_b.glb` | yes | 29,400 | 0.530 x 1.0 x 0.546 | 2,120,144 |
| `cliff.glb` | yes, alongside `cliff_b` | 29,400 | 0.502 x 1.0 x 0.537 | 1,924,468 |
| `boulder.glb` | yes | 29,400 | 2.130 x 1.0 x 2.016 | 1,971,444 |
| `rigged/warrior_rigged.glb` | yes, skinned; needs loader work | 29,400 | 1.075 x 1.7 x 0.669 at rest | 3,905,320 |
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

## The rig

`rigged/warrior_rigged.glb`: the same mesh and texture as `warrior.glb`, skinned by Meshy.

- 24 joints, Mixamo-style names: `Hips Spine02 Spine01 Spine neck Head head_end headfront
  LeftShoulder LeftArm LeftForeArm LeftHand RightShoulder RightArm RightForeArm RightHand
  LeftUpLeg LeftLeg LeftFoot LeftToeBase RightUpLeg RightLeg RightFoot RightToeBase`.
- Two clips, by name: `walk` (1.067 s) and `run` (0.667 s). Both are in place: over a whole clip
  the `Hips` joint moves less than 0.08 of the 1.7-unit height on any axis (sway and bob, no
  forward travel), so the game drives position. Whether they loop without a pop is unchecked.
- **No idle, jump, dash, land or slide clip exists.**
- 1.7 units tall with feet on y = 0, which matches your "1 unit = 1 m" if he is 1.7 m. The
  `Armature` root carries a scale of 0.01. Do not bake or reset it; the skin depends on it.
- The sword and the gourds are part of the skinned mesh. They follow the spine and hips and do
  not swing.

**Where it does not match `src/loaders/character.ts`:**

| your loader expects | this file has |
|---|---|
| `assets/char/*.glb` | `assets/hero/rigged/warrior_rigged.glb` (moving it is your call) |
| materials named `robe`, `ink`, `wash`, `paper`, each replaced by a flat palette fill; any other name is an error | one material, `Material.001`, carrying a painted texture |
| facing -Z | facing +Z |

The second row is the real one. Your loader discards the GLB's colour and fills by material name;
this model's whole point is its painted texture. Two ways through, both yours to choose:
- **Keep the painting:** give the loader a textured path that keeps `map` on an unlit material.
- **Keep the flat fills:** split this mesh into four named materials by texel colour (robe blue-grey,
  near-black, mid grey, pale). That is mechanical and I can do it in `tools/gen/` if you want it,
  but it throws the painting away, and your `ink` fill would turn the straw hat black.

I rendered the rest pose, `walk` at 0.3 s and `run` at 0.2 s and they deform correctly. The rig
has not been loaded in the game or played through a full cycle.

## Looking at a model without the game

```
node tools/gen/render-glb.mjs assets/hero/warrior.glb out.png                              # 4 views, textured and clay
node tools/gen/render-glb.mjs assets/hero/rigged/warrior_rigged.glb out.png --clip run --time 0.2
node tools/gen/inspect-glb.mjs assets/hero/torii.glb                                       # triangles, textures, bounds
```
