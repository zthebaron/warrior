# Hero models: manifest

Generated 2026-11-10 on fal.ai for `00-start-here/PROMPT-ART-GEN.md`. Machine-readable copy:
`hero.json`. Contact sheet: `docs/build-log/art-gen/sheet.png`. Money: `state/FAL-LEDGER.md`.

**Total committed: $6.8306 of the $10.00 cap, in 45 calls,** at listed prices. $3.1694 was left
unspent on purpose (see "Where the money stopped"). The rig is booked at $0.80 and may have been
billed at $0.20, so the real charge could be about $0.60 lower.

## What I would ship

| asset | ship? | one line |
|---|---|---|
| `warrior.glb` | **yes** | The best result. Reads as the design from every side, sword across the back. Face is blank. |
| `rigged/warrior_rigged.glb` | **yes, untested in engine** | Same mesh, 24-joint skeleton, `walk` and `run` clips. Does not fit a2's character loader as it stands (see HANDOFF). |
| `torii.glb` | **yes** | Clean gate with real thickness, one flat vermilion. |
| `lantern.glb` | **yes** (optional asset) | The cleanest geometry of the run. |
| `cliff_b.glb` | **yes** (optional asset) | Split-topped crag with buttresses. The better of the two cliffs. |
| `cliff.glb` | **yes, with a caveat** | A true solid, but a tidy pillar. Use it alongside `cliff_b`, not alone. |
| `boulder.glb` | **yes** | A true solid, but it reads as stacked slabs more than one angular rock. |
| `rejected/pine.glb` | **no** | Trunk and base are solid; the canopy is a thin sheet. A bonsai on a disc, not a cliff pine. |

Neither cliff is the towering, jagged wall of the seed. They are free-standing blocks of it.

## Per asset

Triangles are before -> after `tools/gen/process.mjs`. Every delivered GLB has one 1024 px base
colour texture, one material and one primitive, down from three 4096 px textures. "All attempts" is
every ledger row spent getting that asset, including rejected inputs and tests.

| asset | input image | endpoint | final call | all attempts | request id of the delivered call | triangles | file |
|---|---|---|---|---|---|---|---|
| warrior | `input/warrior.png` + `input/warrior_back.png` | `fal-ai/hunyuan3d-v3/image-to-3d`, Normal + PBR + back view | $0.675 | $1.4588 | `01a1c6ca-322a-7062-8dae-641d1d049d46` | 500,000 -> 29,400 | 48.8 MB -> 3.17 MB |
| warrior_rigged | `warrior.glb` | `fal-ai/meshy/rigging` | $0.80 booked | $0.8000 | `01a1c6e3-846c-70d1-9cfa-a6a4bdf42a32` | 29,400 (unchanged) | 3.91 MB |
| pine | `input/pine.png` | hunyuan3d-v3, Normal + PBR | $0.525 | $0.8838 | `01a1c6da-90c8-78b1-ad59-09ae39bd1a65` | 500,000 -> 29,400 | 49.6 MB -> 1.98 MB |
| cliff | `input/cliff.png` | hunyuan3d-v3, Normal + PBR | $0.525 | $1.2492 | `01a1c6e1-74f4-7c82-baaf-ec3daa4e9aab` | 500,000 -> 29,400 | 36.7 MB -> 1.92 MB |
| cliff_b | `input/cliff_b.png` | hunyuan3d-v3, Normal + PBR | $0.525 | $0.5848 | `01a1c6ee-d88e-7683-a2a2-b61b3d9b93c7` | 500,000 -> 29,400 | 38.9 MB -> 2.12 MB |
| boulder | `input/boulder.png` | hunyuan3d-v3, Normal + PBR | $0.525 | $0.6446 | `01a1c6d5-7877-7be0-81c2-5574a2d976e3` | 498,896 -> 29,400 | 39.8 MB -> 1.97 MB |
| torii | `input/torii.png` | hunyuan3d-v3, Normal + PBR | $0.525 | $0.6246 | `01a1c6d8-69af-7550-b7dd-09e2e86e9130` | 500,000 -> 29,400 | 31.7 MB -> 1.50 MB |
| lantern | `input/lantern.png` | hunyuan3d-v3, Normal + PBR | $0.525 | $0.5848 | `01a1c6e3-617e-70f0-9913-7f54a2492104` | 500,000 -> 29,400 | 44.9 MB -> 2.32 MB |

The "all attempts" column sums to $6.8306, the ledger total. The warrior's figure includes the
$0.525 no-PBR comparison; the rig is its own row.

## What is wrong with each one

**warrior.** Geometry is right: conical hat, one sword across the back with the hilt over the right
shoulder, two gourds at the left hip, frayed hem and sleeves, forearm and leg wraps, sandals.
- The face under the hat is a blank pale patch with no features. From behind and above it does not show.
- The hands are near-white rather than skin.
- The robe is darker at the centre and paler toward the shoulders and sleeve ends. That is the
  generator's texture, not lighting, and it does not match the flat wash of the painting.
- Under the robe there are baggy trousers. The seed shows bare legs under a torn hem. The image
  model added them in the front view and I let it stand.
- Colour was corrected locally. Hunyuan's texture came back pale (robe near white-blue, trousers
  white). `process.mjs --match` pulls the tones back to the input painting. It moves tones; it
  cannot repaint.

**warrior_rigged.** Rest pose, a mid-walk frame and a mid-run frame were rendered and look right:
limbs swing, the robe follows, sword and gourds travel with the body. It has **not** been loaded
in the game. The sword and gourds are skinned to the body, so they do not swing. Only two clips
exist; there is no idle, jump, dash or land.

**pine.** Do not ship as a 3D prop. Seen from the side the canopy is a blade (the sheet's "side"
column shows it). It is also the wrong tree: an upright bonsai on a round disc, where the brief
asked for a gnarled pine growing sideways out of rock. Six input paintings and five Trellis tests
went into the pine. Every flat ink painting of a pine came back as a card between 1% and 13% as
deep as it is wide, including a two-view attempt. The one that got a solid trunk and base is the
one delivered. It would pass as a flat card that always faces the camera, nothing more.

**cliff.** The first cliff final was thrown away: Hunyuan read the nested slab outlines of the
painting as a deck of thin vertical plates ($0.525 lost; it had passed its Trellis test as a solid).
The delivered one was repainted from the boulder painting as a tall block, and is solid from every
side. But it is a neat rectangular pillar with stepped blocks at the foot, about twice as tall as
wide. Its input painting has one face slightly darker than the other, which bends the "no lit
side" rule; the fully flat versions are the ones that produced plates.

**cliff_b.** Solid, split into two tops by a deep cleft, with buttress blocks at the foot. I asked
for two unequal jagged peaks and a lean and got two flat-topped halves of nearly equal height.
Same slight face-to-face tone difference as `cliff`.

**boulder.** Solid, but layered like a stack of flat slabs, wider than tall (2.13 x 1 x 2.02). The
small tufts in the painting became little spikes at the corners.

**torii.** Nothing structural. Its red is set to the authored accent `vermilion_a` `#e34234` from
`assets/src/accent.json`, baked into the texture as one flat hue. The image model painted the
lintel cap and post feet black twice against the prompt; `tools/gen/fix-torii.mjs` repainted them
in the input before any 3D spend.

**lantern.** Nothing structural. The texture has soft tonal shading carried over from its input
painting, which was less flat than the others.

## Decisions I made that Tim may want to reverse

These are recorded here, not in `state/OPEN-QUESTIONS.md`, because the brief says to add none.

1. **I paid for the pine final against the brief's gate.** The brief says to pay for a final only
   if the Trellis mesh reads as the object. The pine's Trellis mesh had a solid trunk and base and
   read as a pine from the front, but its canopy was already a thin sheet. I judged that Trellis's
   limit and spent $0.525 on Hunyuan anyway. Hunyuan made the same sheet. That money bought
   nothing, and by the letter of the gate it should not have been spent.
2. **The untouched downloads are not committed.** They are in `assets/hero/raw/*.glb` on disk
   (git-ignored), 290 MB in all, with a copy I wrote into the **main checkout** at
   `assets/build/hero-raw/` (also git-ignored; `assets:build` clears only its own per-asset
   folders there, not this one). CI checks out LFS in seven jobs per run, so committing them would
   add about 2 GB of LFS transfer to every run. The small `raw/*.result.json` records are
   committed, and `node tools/gen/fal-call.mjs fetch <request id> --out <dir>` re-downloads any of
   them from fal for free while fal keeps them. To commit them anyway:
   `git add -f assets/hero/raw/*.glb`.
3. **The normal and metallic-roughness maps are dropped from the delivered files.** The brief asked
   for Normal + PBR and that is what was generated and paid for. But a2's hero class (D-020,
   `budgets.json` `classes.hero`) is one texture per asset, and an unlit ink material reads only
   base colour. The maps are still in the untouched downloads.
4. **The pine and the rig are one folder down** (`rejected/`, `rigged/`). a2's importer reads every
   `assets/hero/*.glb` as a shippable static asset, and would strip the rig's animations.
5. **No input came from a crop.** Every subject in `reference/seed/` overlaps cliff, cloud or path,
   and the warrior is only ever seen from behind. All inputs were generated with
   `fal-ai/nano-banana` using the brief's style block, most with a seed crop as the reference.
6. **PBR bought nothing visible.** I paid $0.525 for a warrior without PBR to find out whether PBR
   caused the pale texture. It did not; the two look the same. That call is ledger row 26.
7. **Stone, pine and torii textures are re-tinted to the style bible.** The generator drifted to
   tan and olive. `process.mjs --tint` rebuilds each texture as a single-hue ramp whose median is
   `stone-mid` `#827d76` for the cliffs, boulder and lantern, `ink-deep` `#383838` for the pine,
   and the accent for the torii.
8. **The rig is booked at $0.80.** fal's model page says $0.20 per request; fal's pricing API says
   $0.80. The cap is charged the larger figure. Whichever is billed, the cap held.
9. **All static models are normalised to 1.0 unit tall** so no game dimension went into this tool.

## Where the money stopped

| what | spent |
|---|---|
| Input paintings (22 images at $0.0398) | $0.8756 |
| Trellis tests (13, one of them two-view) | $0.2800 |
| Hunyuan finals that are delivered (7, including the pine I would not ship) | $3.8250 |
| Hunyuan finals that are not delivered: warrior without PBR, first cliff | $1.0500 |
| Meshy rig | $0.8000 |
| **Total** | **$6.8306** |

Of that, $1.575 bought nothing usable: the pine final, the first cliff final and the no-PBR
comparison.

I stopped at $6.83 rather than $9.50 because the only unfinished item was the pine, and five
failed Trellis tests say more image-to-3D attempts on it would be the same money for the same
card. The second pine variant was not made for the same reason.

## Reproducing

```
node tools/gen/fal-call.selftest.mjs        # 27 checks that the cap holds, network disabled
node tools/gen/fal-call.mjs total           # committed total and headroom
sh tools/gen/finish.sh <name>               # raw/<name>.glb -> <name>.glb (needs the raw download)
node tools/gen/sheet.mjs                    # rebuild docs/build-log/art-gen/sheet.png
node tools/gen/render-glb.mjs <glb> out.png # look at any GLB from four sides, textured and clay
```

The prompts for every input painting are in `tools/gen/payloads/` and `tools/gen/make-payloads*.mjs`.
