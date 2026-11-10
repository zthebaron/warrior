# Hero models: handoff to a2

What exists, and what you need to know to load it. Nothing here is wired into the game: no level,
loader, budget, collider or shader was touched. Verdicts and defects are in `MANIFEST.md`; look at
`docs/build-log/art-gen/sheet.png` first.

## Files

| file | use it? | size as stored (x, y, z) | origin |
|---|---|---|---|
| `warrior.glb` | yes, static | 0.632 x 1.0 x 0.393 | between the feet, on the ground |
| `warrior_rigged.glb` | yes, skinned | 1.075 x 1.7 x 0.669 at rest | between the feet, on the ground |
| `torii.glb` | yes | 1.052 x 1.0 x 0.162 | centre of the base, on the ground |
| `lantern.glb` | yes | 0.412 x 1.0 x 0.415 | centre of the base, on the ground |
| `boulder.glb` | yes | 2.130 x 1.0 x 2.016 | centre of the base, on the ground |
| `cliff.glb` | yes, see caveat in MANIFEST | 0.502 x 1.0 x 0.537 | centre of the base, on the ground |
| `pine.glb` | no (flat canopy) | 1.201 x 1.0 x 0.478 | centre of the base, on the ground |

## Scale and orientation

- **Every static model is exactly 1.0 unit tall**, +Y up, sitting on y = 0, centred on x and z.
  Multiply by the world height you want. No game dimension is baked in, so nothing here depends
  on `MEASUREMENTS.md`.
- **Front faces +Z.** The warrior's face and chest look down +Z; his back, with the sword, faces -Z.
  A follow camera behind him is on his -Z side.
- All node transforms are baked into the vertices: one mesh, one primitive, identity transform.
- **`warrior_rigged.glb` is the exception.** It is 1.7 units tall (Meshy's default character height)
  and its `Armature` root carries a scale of 0.01. Scale the scene root by `height / 1.7`. Do not
  bake or reset that armature scale; the skin depends on it.

## Format

- Plain GLB. **No Draco, no Meshopt, no KTX2**, so a bare `GLTFLoader` reads them. If you run them
  through the kit's compression later, that is your call.
- 29,400 triangles each, one material, three 1024 px textures: base colour (PNG), normal (JPEG),
  metallic-roughness (JPEG).
- The material is standard PBR as Hunyuan wrote it: `metallicFactor` 1 and `roughnessFactor` 1
  multiplied by the texture, `doubleSided` true, and the `KHR_materials_specular` extension is
  declared. For the ink look you most likely want only the base colour texture on your own
  material and can ignore the rest.
- **The base colour is already the final colour.** It was tone-matched to the painting and, for
  everything but the warrior, rebuilt as a single-hue ramp from the style bible. Light it flat.
- These are far over the kit budgets (the kit caps at 22 to 216 triangles and 32 px). They are the
  "hero" class your import path is for. `tools/assets/budgets.json` was not edited.

## The torii and the accent

`torii.glb` has the accent baked into its texture as one flat hue, `vermilion_a` `#e34234`. The
kit torii switches accent with `?accent=`. To keep that working on this model, ignore the texture
and set the material colour from `assets/src/accent.json`; the gate is a single colour, so nothing
is lost.

## The rig

- 24 joints, Mixamo-style names: `Hips Spine02 Spine01 Spine neck Head head_end headfront
  LeftShoulder LeftArm LeftForeArm LeftHand RightShoulder RightArm RightForeArm RightHand
  LeftUpLeg LeftLeg LeftFoot LeftToeBase RightUpLeg RightLeg RightFoot RightToeBase`.
- Two clips, by name: `walk` (1.067 s) and `run` (0.667 s). Both are in place: over a whole clip
  the `Hips` joint moves less than 0.08 of the 1.7-unit height on any axis (sway and bob, no
  forward travel), so the game drives position. Whether they loop without a pop is unchecked.
- **No idle, jump, dash, land or slide clip exists.** For those, hold a pose from `walk`, or swap
  to the static `warrior.glb`, until more clips are bought.
- The sword and the gourds are part of the skinned mesh. They follow the spine and hips and do
  not swing.
- I rendered the rest pose, `walk` at 0.3 s and `run` at 0.2 s and they deform correctly. The rig
  has not been loaded in the game or played through a full cycle.

## Looking at a model without the game

```
node tools/gen/render-glb.mjs assets/hero/warrior.glb out.png                       # 4 views, textured and clay
node tools/gen/render-glb.mjs assets/hero/warrior_rigged.glb out.png --clip run --time 0.2
node tools/gen/inspect-glb.mjs assets/hero/torii.glb                                # triangles, textures, bounds
```
