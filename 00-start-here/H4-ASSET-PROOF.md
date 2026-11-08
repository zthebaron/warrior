# H4 asset pipeline — proof runs (2026-11-08)

Source -> compressed glb -> loaded in the harness -> budget enforced in CI, with no human ever
opening Blender. Everything below ran headless on macOS (Blender 5.2.3 LTS, KTX-Software 4.4.2,
gltf-transform 4.5.1, Chromium 158 on SwiftShader).

    npm run assets:build      Blender export -> style -> resize -> ktx2 -> draco -> manifest -> budgets
    npm run assets:budget     CI gate on the COMMITTED assets/dist (CI has no Blender)
    npm run playtest          now includes the `assets` stage

Exit codes. assets:build: 0 ok · 1 stage failed · 2 toolchain missing · 3 over budget/schema.
assets:budget: 0 · 1. playtest: unchanged from H3.

## Verdict

**GREEN** — an agent can author an environment asset end to end with no human in Blender. Both
kit assets are Python. Build, budget gate, loader and harness ran unattended. Every gate was
shown to bite, and a cold rebuild is byte-identical at every stage.

**AMBER, one item: the Linux visual goldens are unconfirmed.** They were copied from Darwin,
because this branch is unpushed. What a human must do: push the branch, open the PR and check
that CI's `visual` stage passes. If it fails, download the `harness-report` artifact and commit
its `*.actual.png` files as `tools/harness/golden/linux/00-gym/camN.png`, as was done for H3
(272e385). Everything else CI runs (`assets:budget` and the `assets` stage) needs no new inputs.

## What was built

| Piece | Path |
|---|---|
| Headless export (.py kit module or .blend hero) | `tools/blender/export.py` |
| Procedural primitives, hard-edged, palette-law colours | `tools/blender/lib.py` |
| Torii (vermilion path marker) | `assets/src/kit_torii.py` |
| Rock mass (the dark wall) | `assets/src/kit_rock_mass.py` |
| Pipeline | `tools/assets/build.mjs` |
| Measurement (one source for every number) | `tools/assets/measure.mjs` |
| Tier-1 budget gate + limits | `tools/assets/budget.mjs`, `tools/assets/budgets.json` |
| Strict manifest schema | `assets/manifest.schema.json` (manifest is a build output; `generated_by` const) |
| Loader (Draco + KTX2 from the pinned three) | `src/loaders/assets.ts`, `src/loaders/level.ts`, `vite.config.ts` |
| Harness stage | `tools/harness/assets.ts` (+ harness-only `assetProbe` in `src/main.ts`) |
| CI | `.github/workflows/ci.yml`: `npm run assets:budget` before the playtest |

Pins added, exact: `@gltf-transform/{cli,core,extensions,functions}` 4.5.1, `draco3dgltf` 1.5.9.

Design: each asset is one mesh with one material sampling a shared 32x32 palette texture. That
gives one draw call per asset. Each face gets a constant UV into an 8px cell holding one of the
8 ramp values or vermilion. Faces are flat with hard edges. There are no modifiers, so there is
nothing to bake.

## Measured

| | kit_torii | kit_rock_mass |
|---|---|---|
| triangles | 108 | 216 |
| Blender export (uncompressed) | 9,104 B | 16,016 B |
| after style / resize / ktx2 | 9,056 / 8,864 / 9,160 B | 15,972 / 15,780 / 16,076 B |
| shipped (Draco) | **2,412 B** (3.77x) | **3,436 B** (4.66x) |
| textures | 1 x 32x32 KTX2 UASTC | 1 x 32x32 KTX2 UASTC |
| materials | 1 (KHR_materials_unlit) | 1 |
| draw calls placed once (renderer.info) | 1 | 1 |
| full build, both assets, cold | 3.1 s | |

Gym with both assets (2 torii + 1 rock mass): peak draw calls 30 -> 33 and peak triangles
640 -> 1,072. That is exactly +2x108 +216. Budgets and history are in MEASUREMENTS.md under
"H4 asset budgets".

## a — clean build from nothing, twice, every stage hashed

`rm -rf assets/dist assets/build && npm run assets:build`, run twice. All 13 files (5 stages x
2 assets + 3 dist files) are identical across the runs. The dist matched the committed files
(`git status` was clean).

```
toolchain: Blender 5.2.3 LTS · ktx version: v4.4.2 · gltf-transform 4.5.1
  [export] kit_rock_mass: 216 tris, 16016 bytes, objects=['kit_rock_mass'] -> assets/build/kit_rock_mass/0-export.glb
  [export] kit_torii: 108 tris, 9104 bytes, objects=['kit_torii'] -> assets/build/kit_torii/0-export.glb

asset            tris   export     style      resize     ktx2       draco(dist)  ratio   textures
kit_rock_mass      216  15.64 KB   15.60 KB   15.41 KB   15.70 KB   3.36 KB     4.66x  32x32 image/ktx2
kit_torii          108  8.89 KB    8.84 KB    8.66 KB    8.95 KB    2.36 KB     3.77x  32x32 image/ktx2

Tier-1 budgets
  kit_rock_mass  (KHR_draco_mesh_compression, KHR_materials_unlit, KHR_texture_basisu)
    ✓ triangles                      216  / 216
    ✓ compressed bytes              3436  / 3436
    ✓ textures                         1  / 1
    ✓ texture max dimension px        32  / 32
    ✓ materials                        1  / 1
    ✓ draw calls (placed once)         1  / 1
  kit_torii  (KHR_draco_mesh_compression, KHR_materials_unlit, KHR_texture_basisu)
    ✓ triangles                      108  / 108
    ✓ compressed bytes              2412  / 2412
    ✓ textures                         1  / 1
    ✓ texture max dimension px        32  / 32
    ✓ materials                        1  / 1
    ✓ draw calls (placed once)         1  / 1

ASSETS OK  assets/dist/ regenerated: kit_rock_mass.glb, kit_torii.glb, manifest.json

sha256, identical in both runs:
c43b2e09…7b65  build/kit_rock_mass/0-export.glb     ab26a789…6b29  build/kit_torii/0-export.glb
49efe703…41c   build/kit_rock_mass/1-style.glb      8d5c2c91…5cd9  build/kit_torii/1-style.glb
11d1f492…741c  build/kit_rock_mass/2-resize.glb     7ff3b1d6…7a07  build/kit_torii/2-resize.glb
c13eae29…3c92  build/kit_rock_mass/3-ktx2.glb       55ff54ff…3d18  build/kit_torii/3-ktx2.glb
59a274a4…62ea  dist/kit_rock_mass.glb               6d6e6cb3…b571  dist/kit_torii.glb
2f277191…9845  dist/manifest.json
```

No bytes move. Determinism comes from four things. Blender gets every exporter option
explicitly, in an empty factory scene. Jitter comes from `random.Random(SEED)`. The encoders run
with `--jobs 1`. Nothing time- or host-dependent is written, and the manifest's `source` is
repo-relative.

## b — the .blend branch

No hero `.blend` exists yet, so the branch was proven with a stand-in. A scratch script built
kit_torii and saved it with `save_as_mainfile`, plus a `kit_torii.meta.json` sidecar. That
`.blend` was then exported twice through `export.py --input x.blend`. Both exports are
**byte-identical to the .py export** (sha256 `ab26a789…`). The .py and .blend paths produce the
same file, so a hero asset enters the same pipeline as a kit asset. Without the sidecar the
export fails:
`a .blend asset needs <stem>.meta.json with at least {"collider": ...}`, exit 1.
`*.blend` is not in `.gitattributes` yet. Add it with the first committed hero file.

## c — playtest, green, both assets in the gym. Exit 0.

```
┌─ 00-gym ────────────────────────────────────────────────────────────────────────────────
│ schema      PASS    1/1    0.0s
│ lint-level  PASS    1/1    0.0s
│     ✓ lint-level.mjs                             clean, 1 warnings: [TIGHT] seg 14->15 via jump is at 100% of the limit
│ preflight   PASS    7/7    1.0s
│     ✓ harness API stripped from production bundle 0/3 sentinels in dist/, 3/3 in dist-harness/
│     ✓ webgl2 context on about:blank              renderer: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)
│ nav         PASS    6/6    4.4s
│     ✓ goal reached                               results at 27.85s (par 30s, limit 90s)
│     ✓ waypoints reached in order                 23/23: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22]
│     ✓ every declared move completed              ground 12/12, climb 1/1, dash 1/1, wall 1/1, dashjump 1/1, jump 4/4, double 1/1, platform 1/1
│     ✓ zero console errors                        none
│ replay      PASS    5/5    0.5s
│     ✓ position within 0.5u                       final (90.60, 3.21, -0.00) vs (90.60, 3.21, -0.00): 0.000u
│     ✓ frames within 5%                           1671 vs 1671 ticks (0.00%, 27.85s)
│ chaos       PASS    6/6    0.8s
│     ✓ ran full duration                          3600/3600 ticks, 5 deaths/respawns
│ counters    PASS    5/5    0.5s
│     ✓ draw calls < 300                           peak 33
│     ✓ triangles < 500,000                        peak 1,072
│     ✓ geometries < 400                           peak 6
│     ✓ textures < 120                             peak 3
│ assets      PASS   12/12   0.4s
│     ✓ manifest has mesh assets                   2: kit_rock_mass, kit_torii
│     ✓ kit_rock_mass loads (draco + ktx2)         MeshBasicMaterial · 1 map(s)
│     ✓ kit_rock_mass draw calls <= 1              1 rendered alone (manifest 1)
│     ✓ kit_rock_mass triangles <= 216             216 rendered (manifest 216)
│     ✓ kit_rock_mass textures at declared size    32x32 (manifest 32x32)
│     ✓ kit_rock_mass unlit material               MeshBasicMaterial
│     ✓ kit_torii loads (draco + ktx2)             MeshBasicMaterial · 1 map(s)
│     ✓ kit_torii draw calls <= 1                  1 rendered alone (manifest 1)
│     ✓ kit_torii triangles <= 108                 108 rendered (manifest 108)
│     ✓ kit_torii textures at declared size        32x32 (manifest 32x32)
│     ✓ kit_torii unlit material                   MeshBasicMaterial
│     ✓ zero console errors                        none
│ visual      PASS    7/7    1.1s
│     ✓ cam0..cam5 drift <= 0.5%                   0.000% (0 px) each
└──────────────────────────────────────────────────────────────────────────────────────────
    tier-2 (recorded, not asserted): ktx2 targets astc,etc1,etc2,dxt,bptc · kit_rock_mass: RGBA_ASTC_4x4 · kit_torii: RGBA_ASTC_4x4

RESULT: PASS
```

(This is trimmed to the informative lines. Every check in the full run passed, and the full run
is reproducible with the command above.) Nav, replay and chaos are tick-identical to the run
before the assets were placed: 27.85 s, 1,671 ticks, the same final position. The torii stand
astride the z=0 lane on the x=50 pad and on the goal pad. The rock mass stands beside the x=52
pad at z=-9. Frames: `tools/harness/golden/darwin/00-gym/cam3.png` and `cam4.png`.

## d — every gate bites

| # | Break | Caught by | Result |
|---|---|---|---|
| N1 | torii budget triangles 108 -> 100 | `assets:budget` | exit 1, `✗ kit_torii: triangles 108 > budget 100` |
| N1b | same, through the build | `assets:build` | exit 3, `assets/dist/ left unchanged` (hashes compared) |
| N2 | manifest hand-edited: torii triangles 108 -> 90 | `assets:budget` | exit 1, `manifest triangles=90 but the shipped file measures 108 — manifest stale or hand-edited` |
| N3 | manifest hand-edited: `"color"` added to prim_box | `assets:budget` (and the game at boot: same schema) | exit 1, `must NOT have additional properties "color"` |
| N4 | `BLENDER=/nonexistent` | `assets:build` | exit 2, `Blender not runnable … assets/dist/ left unchanged` |
| N5 | kit with an Array modifier | `export.py` | exit 1, `has modifiers ['ARRAY'] — kit geometry is built, not modified` |
| N6 | vermilion on a non-torii asset | `lib.py` | exit 1, `vermilion is torii-only (STYLE-BIBLE section 2); set accent=True` |
| N7 | `collider: "box"` | `export.py` | exit 1, `trimesh \| none only (box sinks; see check:physics)` |
| N8 | .blend without its meta sidecar | `export.py` | exit 1 |
| N9 | torii draw_calls budget 1 -> 0 | harness `assets` stage | exit 1 LEVEL_FAILURE, `✗ kit_torii draw calls <= 0   1 rendered alone` |

## The risk, resolved: KTX2 and Draco on SwiftShader

**Draco** decodes headless. three's own `draco_decoder.wasm`, served from the pinned
`node_modules/three` under `/vendor/draco/`, loads both assets in Chromium on SwiftShader with
zero console errors. It is asserted on every run by the `assets` stage. In Node, budget.mjs
decodes the same files with `draco3dgltf` 1.5.9.

**KTX2 did not degrade.** The expected failure was that SwiftShader advertises no compressed
format and Basis falls back to uncompressed RGBA. Measured instead, `KTX2Loader.detectSupport`
on this SwiftShader reports **astc, etc1, etc2, dxt (S3TC), bptc** (no pvrtc). Both textures
transcode to **RGBA_ASTC_4x4** and arrive as `CompressedTexture`. As H3 did, this is split
anyway:

- **Tier-1, asserted in CI:** the file loads with zero errors. Triangles and draw calls are
  within budget per renderer.info. Textures arrive at the manifest's dimensions (32x32). The
  material is unlit. Separately, `assets:budget` checks file size, triangles, texture count and
  dimensions, material count and primitive count straight from the bytes.
- **Tier-2, recorded only:** which GPU format was chosen, whether it stayed compressed, GPU
  memory and palette fidelity. ASTC on SwiftShader says nothing about a player's GPU. Linux CI's
  SwiftShader may choose differently, and the stage logs its choice on every run.

## What surprised me

1. **The harness found a colour bug that no static check could.** The first build shipped every
   palette colour about 4x too dark: `#383838` rendered `#0a0a0a`, vermilion rendered
   `#1e0908`. For a BYTE image, Blender's `Image.pixels` stores values as given. I had converted
   sRGB to linear first, wrongly assuming the PNG writer converts back. The `assets` probe reads
   back the rendered pixels and compares them with the palette: 0% matched before the fix,
   92.7–95.6% after. The remainder are MSAA edges against the magenta probe background. Without
   the readback, these assets would have passed every Tier-1 check while violating STYLE-BIBLE
   §2 in every frame.
2. **Tone mapping would have broken the palette law anyway.** The renderer uses ACES. Kit
   materials now set `toneMapped = false` because the palette texels are display colours. Any
   future post pass (§6) must preserve them too.
3. **The vermilion has no number in the Style Bible.** §2 names it, and palette.json omits it
   because it never clustered. I measured it from the 36 seed frames: median `#603633`, 0.012%
   of frame area. That is a muted, misted red, not the bright vermilion one would guess.
4. **ETC1S is larger than UASTC at this size** (385 B vs 364 B). The codebook overhead dominates
   a 32x32 texture. Mipmaps are off: every face samples one texel, so there is nothing to
   minify.
5. **The first rock mass was a drum.** Its 11-sided strata read as a cylinder in the harness
   frames. Seven sides with stronger jitter reads as cut planes, and it got cheaper: 310 -> 216
   tris. The budget was lowered, not raised.
6. Blender's `export_apply` question did not arise. Kit geometry is built with bmesh, and
   `export.py` rejects any object that has modifiers.

## What a human still has to do

Only the AMBER item above: push the branch and confirm the Linux `visual` stage on CI,
re-recording the Linux goldens from the CI artifact if needed. No Blender step remains.
