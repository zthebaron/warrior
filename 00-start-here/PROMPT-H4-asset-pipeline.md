# H4 — Asset Pipeline Proof

Prove an agent can go source -> compressed glb -> loaded in the harness -> budget
enforced in CI, with no human ever opening Blender.

## READ FIRST, IN THIS ORDER

- `00-start-here/DAY-0-PROOF-SPIKE.md` — the H4 section, and how H1-H3 reported
- `00-start-here/H3-HARNESS-PROOF.md` — the report shape you will match
- `00-start-here/MEASUREMENTS.md` — how a measured number gets recorded
- `00-start-here/STYLE-BIBLE.md` — sections 2, 3, 5: what the asset must look like
- `tools/harness/counters.ts` — the Tier-1 counters that already exist
- `assets/dist/manifest.json` — what `lint:levels` reads today
- `src/loaders/level.ts` — how a level resolves an asset name

## ARCHITECTURAL DECISION TO IMPLEMENT, NOT RE-LITIGATE

Assets are authored as code wherever the geometry allows. The environment kit —
rock masses, cliff faces, torii, platforms, ground slabs — is Blender Python that
builds geometry procedurally. Hero assets needing real modeling stay as `.blend`
in LFS. Both go through the same headless export.

Reason: a `.py` asset is diffable, reviewable, deterministic, and a fan-out agent
can author one. A `.blend` is none of those. This mirrors levels-as-data — the
thing agents touch is text.

## BUILD

### 1. `tools/blender/export.py`

Headless export driven by `blender -b -P`. Accepts either a `.blend` to open or a
`.py` module to execute; exports glTF binary to a given path. No GUI, no user
prefs, no addons beyond what ships with 5.2.3. Deterministic: same input gives
byte-identical output, or you document exactly which bytes move and why.

Blender is at `/Applications/Blender.app/Contents/MacOS/Blender`, version 5.2.3 LTS,
CLI confirmed working.

### 2. `tools/blender/lib.py`

The procedural primitives the kit is built from. Hard-edged only — read
STYLE-BIBLE section 2 before you choose any bevel. Every function takes explicit
dimensions in world units so an asset's footprint is readable from its source.

### 3. `assets/src/kit_torii.py` and `assets/src/kit_rock_mass.py`

Two real assets.

- **Torii** because STYLE-BIBLE section 5 makes it a path marker, and it is the one
  place vermilion is allowed, under the 1 percent budget.
- **Rock mass** because it is the cliff side of the composition rule and the asset
  most likely to blow the triangle budget.

### 4. `tools/assets/build.mjs`

The pipeline. For each asset under `assets/src`: export via Blender, then compress
with `gltf-transform`. Install it and pin the version exactly, the way three.js and
rapier are pinned. Emit to `assets/dist`.

Regenerate `assets/dist/manifest.json` as a BUILD OUTPUT, validated against a new
`assets/manifest.schema.json` that is strict with `additionalProperties: false`
everywhere, the way `levels/level.schema.json` is strict. Keep the two existing
procedural primitives (`prim_box`, `prim_slab`) in the manifest — the green level
depends on them.

Wire it as `npm run assets:build`.

### 5. `tools/assets/budget.mjs`

Per-asset Tier-1 budgets, CI-enforceable: triangle count, compressed file size,
texture dimensions, material count, and draw calls when the asset is placed once in
a scene.

Every number comes from measurement, never from the spec. Record each one in
`MEASUREMENTS.md` with the same discipline as the MOVE table, including any budget
you had to raise and the reason.

### 6. Harness integration

The compressed asset must load and render in the harness browser, and the nav bot
must still clear the green level with both assets present. Add a harness stage that
places them in a scene, reads `renderer.info`, and asserts the Tier-1 budgets.

## THE RISK, STATED UP FRONT

KTX2 texture compression requires `KTX2Loader.detectSupport(renderer)`. CI renders on
SwiftShader, which may advertise no compressed-texture format at all. If it degrades
to uncompressed there, that is not a failure to hide — it is exactly the situation H3
hit with frame time, which got split into Tier-1 CI-enforceable and Tier-2
hardware-only.

Resolve it the same way: measure what SwiftShader actually supports, assert in CI only
on what is renderer-independent (file size, triangle count, that the asset loads at
all, that textures arrive at expected dimensions), and move anything depending on real
GPU texture formats to Tier-2 with that written down.

Same discipline for Draco: prove the decoder loads headless before you commit to it.

## DO NOT

- Do not open Blender interactively or ask for a human to.
- Do not hand-write `manifest.json`. It is generated or it is wrong.
- Do not put a budget number in code that you did not measure.
- Do not weaken `level.schema.json` or the MOVE table to make an asset fit.
- Do not add a dependency without pinning it exactly.

## REPORT

Write `00-start-here/H4-ASSET-PROOF.md` in the shape of `H3-HARNESS-PROOF.md`: what
you measured, the number, how you measured it, what surprised you, and a plain
GREEN / AMBER / RED on whether an agent can author an asset end to end with no human
in Blender. If any part is AMBER, say precisely what a human still has to do.

Commit in logical steps. Do not push.
