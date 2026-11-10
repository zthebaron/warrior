# Hero models: manifest

Generated 2026-11-10 on fal.ai for `00-start-here/PROMPT-ART-GEN.md`. Machine-readable copy:
`hero.json`. Contact sheet: `docs/build-log/art-gen/sheet.png`. Money: `state/FAL-LEDGER.md`.

**Total committed: $6.2458 of the $10.00 cap, in 42 calls.** $3.7542 was left unspent on purpose
(see "Where the money stopped").

## What I would ship

| asset | ship? | one line |
|---|---|---|
| `warrior.glb` | **yes** | The best result. Reads as the design from every side, sword across the back. Face is blank. |
| `warrior_rigged.glb` | **yes, untested in engine** | Same mesh, 24-joint skeleton, `walk` and `run` clips. |
| `torii.glb` | **yes** | Clean gate with real thickness, one flat vermilion. |
| `lantern.glb` | **yes** (optional asset) | The cleanest geometry of the run. |
| `boulder.glb` | **yes** | A true solid, but it reads as stacked slabs more than one angular rock. |
| `cliff.glb` | **yes, with a caveat** | A true solid, but a tidy pillar. It is not the towering jagged cliff of the seed. |
| `pine.glb` | **no** | Trunk and base are solid; the canopy is a thin sheet. A bonsai on a disc, not a cliff pine. |

## Per asset

Triangles are before -> after `tools/gen/process.mjs`. Every shipped texture is 1024 px (base colour
PNG, normal JPEG, metallic-roughness JPEG), down from 4096 px. "All attempts" is every ledger row
spent getting that asset, including rejected inputs and tests.

| asset | input image | endpoint | final call | all attempts | request id of the shipped call | triangles | file |
|---|---|---|---|---|---|---|---|
| warrior | `input/warrior.png` + `input/warrior_back.png` | `fal-ai/hunyuan3d-v3/image-to-3d`, Normal + PBR + back view | $0.675 | $2.2588 | `01a1c6ca-322a-7062-8dae-641d1d049d46` | 500,000 -> 29,400 | 48.8 MB -> 3.46 MB |
| warrior_rigged | `warrior.glb` | `fal-ai/meshy/rigging` | $0.80 booked | $0.80 | `01a1c6e3-846c-70d1-9cfa-a6a4bdf42a32` | 29,400 (unchanged) | 4.70 MB |
| pine | `input/pine.png` | hunyuan3d-v3, Normal + PBR | $0.525 | $0.8838 | `01a1c6da-90c8-78b1-ad59-09ae39bd1a65` | 500,000 -> 29,400 | 49.6 MB -> 2.25 MB |
| cliff | `input/cliff.png` | hunyuan3d-v3, Normal + PBR | $0.525 | $1.2492 | `01a1c6e1-74f4-7c82-baaf-ec3daa4e9aab` | 500,000 -> 29,400 | 36.7 MB -> 2.10 MB |
| boulder | `input/boulder.png` | hunyuan3d-v3, Normal + PBR | $0.525 | $0.6446 | `01a1c6d5-7877-7be0-81c2-5574a2d976e3` | 498,896 -> 29,400 | 39.8 MB -> 2.11 MB |
| torii | `input/torii.png` | hunyuan3d-v3, Normal + PBR | $0.525 | $0.6246 | `01a1c6d8-69af-7550-b7dd-09e2e86e9130` | 500,000 -> 29,400 | 31.7 MB -> 1.62 MB |
| lantern | `input/lantern.png` | hunyuan3d-v3, Normal + PBR | $0.525 | $0.5848 | `01a1c6e3-617e-70f0-9913-7f54a2492104` | 500,000 -> 29,400 | 44.9 MB -> 2.57 MB |

The "all attempts" column sums to $6.2458, the ledger total.

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
wide. One of these repeated along a wall will read as copy-paste. Its input painting has one face
slightly darker than the other, which bends the "no lit side" rule; the fully flat versions are the
ones that produced plates.

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

1. **The untouched downloads are not committed.** They are in `assets/hero/raw/*.glb` on disk
   (git-ignored) and copied to `assets/build/hero-raw/` in the main checkout, 251 MB in all. CI
   checks out LFS in seven jobs per run, so committing them would add about 1.7 GB of LFS transfer
   to every run. The small `raw/*.result.json` records are committed, and
   `node tools/gen/fal-call.mjs fetch <request id> --out <dir>` re-downloads any of them from fal
   for free while fal keeps them. To commit them anyway: `git add -f assets/hero/raw/*.glb`.
2. **No input came from a crop.** Every subject in `reference/seed/` overlaps cliff, cloud or path,
   and the warrior is only ever seen from behind. All inputs were generated with
   `fal-ai/nano-banana` using the brief's style block, most with a seed crop as the reference.
3. **PBR was kept on, as the brief says, though it buys nothing visible.** I paid $0.525 for a
   warrior without PBR to find out whether PBR caused the pale texture. It did not; the two look
   the same. That call is ledger row 26.
4. **Stone, pine and torii textures are re-tinted to the style bible.** The generator drifted to
   tan and olive. `process.mjs --tint` rebuilds each texture as a single-hue ramp: `stone-mid`
   `#827d76` for cliff, boulder and lantern, `ink-deep` `#383838` for the pine, the accent for
   the torii.
5. **The rig is booked at $0.80.** fal's model page says $0.20 per request; fal's pricing API says
   $0.80. The cap is charged the larger figure. Whichever is billed, the cap held.
6. **All models are normalised to 1.0 unit tall** so no game dimension had to go into this tool.

## Where the money stopped

| what | spent |
|---|---|
| Input paintings (21 images at $0.0398) | $0.8358 |
| Trellis tests (12, one of them two-view) | $0.2600 |
| Hunyuan finals that are delivered (6, including the pine I would not ship) | $3.3000 |
| Hunyuan finals that are not delivered: warrior without PBR, first cliff | $1.0500 |
| Meshy rig | $0.8000 |
| **Total** | **$6.2458** |

I stopped at $6.25 rather than $9.50 because the only unfinished item was the pine, and five
failed Trellis tests say more image-to-3D attempts on it would be the same money for the same
card. The second cliff and second pine variants were not made.

## Reproducing

```
node tools/gen/fal-call.selftest.mjs        # 27 checks that the cap holds, network disabled
node tools/gen/fal-call.mjs total           # committed total and headroom
sh tools/gen/finish.sh <name>               # raw/<name>.glb -> <name>.glb (needs the raw download)
node tools/gen/sheet.mjs                    # rebuild docs/build-log/art-gen/sheet.png
node tools/gen/render-glb.mjs <glb> out.png # look at any GLB from four sides, textured and clay
```

The prompts for every input painting are in `tools/gen/payloads/` and `tools/gen/make-payloads*.mjs`.
