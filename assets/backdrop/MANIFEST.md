# Painted backdrop cards: manifest

Generated 2026-11-10 on fal.ai for `00-start-here/PROMPT-ART-GEN-2.md`, Priority 2. Contact sheet:
`docs/build-log/art-gen/backdrop-sheet.png`. Machine-readable copy with what the cutter measured:
`gen/cards.json`. Money: `state/FAL-LEDGER.md`, rows 47 to 60.

Round 1 showed that image-to-3D turns a flat ink painting of landscape into a thin card. So the
landscape is delivered as what it is: thirteen painted layers, each subject painted alone on plain
paper and the paper cut away locally. Nothing here is wired into the game.

**Cost: $1.5998** (one 1K test at $0.0398, thirteen paintings at $0.12). Nothing was repainted and
nothing was rejected.

## Where they are, and why not one folder up

`assets/backdrop/gen/*.png`. The brief says `assets/backdrop/`. They are one level down because on
`art-pass-1` two things read every `assets/backdrop/*.png`: `src/loaders/backdrop.ts` bundles and
preloads each one, and `tools/assets/paint-budget.mjs` fails on any file there that
`tools/art/backdrop-textures.mjs` does not make. Thirteen 2048 px sources dropped beside the three
shipped textures would break that budget check and add 13 MB to the bundle the moment the branches
met. These are **source art for a2 to place, resize and budget**, not shipped textures. `git mv`
them up if that is wrong.

## The cards

All are PNG with straight (not premultiplied) alpha, 2048 px on the long side, in the colours of
`reference/palette.json` and no others.

| card | size | cut | what it is | ship? |
|---|---|---|---|---|
| `cliff_a` | 875 x 2048 | matte | one leaning tower with a split top | **yes** |
| `cliff_b` | 962 x 2048 | matte | two buttresses split by a dark cleft, a shoulder on the right one | **yes** |
| `cliff_c` | 1026 x 2048 | matte | stepped wall with a heavy overhanging top and a ledge | **yes** |
| `pine_a` | 2048 x 1421 | open | gnarled pine growing out to the right from a rock at lower left | **yes** |
| `pine_b` | 2048 x 1600 | open | pine leaning left from a rock at lower right, one stem rising from its middle | **yes**, with a note |
| `pine_c` | 2048 x 1759 | open | pine hanging down and right below its root | **yes** |
| `peaks_a` | 2048 x 479 | wash | one rounded far summit with a long shoulder | **yes** |
| `peaks_b` | 2048 x 390 | wash | one long low far range | **yes**, but it is less than was painted |
| `peaks_c` | 2048 x 602 | wash | a jagged far range of five peaks | **yes** |
| `mist_a` | 2048 x 580 | wash | three soft streaks of mist | usable, the weakest card |
| `mist_b` | 2048 x 425 | wash | two drifting layers of mist with a billowing upper edge | **yes** |
| `wide_a` | 2048 x 403 | wash | three far peaks on the right, one small rock island on the left | **yes** |
| `wide_b` | 2048 x 386 | wash | a chain of five far peaks, tallest on the left | **yes** |

The three cliff faces are the best thing either round produced, and they are what the brief said
the game most lacks: jagged, broken contours and near-black vertical ink masses over mid-grey wash,
like the cliff on the left of `reference/seed/hero/hero_7s.png`.

## Checked against the seed, by eye

Each uncut painting was compared with the seed frames before it was cut, and each cut card was
viewed on the paper colour and on a dark tone (a sheet on paper hides a pale fringe).

- **Lit side:** none. The cliffs' tone varies by wash and by dry-brush stroke, with no consistent
  light direction.
- **Cast shadow:** none in the delivered cards. `pine_b`'s painting came on paper that was darker
  under the tree, and a first cut kept that as a pale patch that read as a shadow; the pines are
  now cut with a higher floor, which removes it.
- **Hue:** every painting's ink leans warm (sepia), none toward blue or green; `gen/cards.json`
  records each one's drift from the palette ramp (`hue_drift`, largest `pine_b` at 8.2 on a 0-255
  scale). The delivered cards cannot carry that drift: the cutter writes palette colours only.

## What is wrong with them

- **`peaks_b`** was painted as a low range with a taller, paler peak behind it. That rear peak sits
  only about 4% below the paper, inside the paper's own unevenness, and did not survive the cut. A
  lower floor brought back a fragment of it floating free of the range, which looked like a
  mistake, so the card is the front range alone.
- **`mist_a`** was painted as a fuller bank of mist. Its pale body is as faint as `peaks_b`'s rear
  peak and only the three darker streaks cut. It is upscaled 1.18x, the most of any card.
- **`pine_b`** is more upright than the brief's "growing sideways": a low trunk leaning left with a
  straight stem rising from it. `pine_a` and `pine_c` are the truly sideways ones.
- **`pine_c`'s** foliage is fans of needles more than flat shelves.
- **The pale washes keep a trace of the generated paper's weave** (visible in `peaks_a` close up).
- **The cliffs' feet** fade out as painted. On paper that is right. Over anything darker than
  paper the faded foot shows as a soft pale edge, because the foot is a wash and not a solid.
- `pine_a`, `pine_c`, `peaks_c` and `mist_a` are upscaled by 5 to 18% to reach 2048 px, because
  their subjects filled less of the painting. The rest are downscaled.

## How they are cut, and how to draw them

`tools/gen/cut-paper.mjs` reads a painting as ink laid on paper. It fits the paper's tone from the
picture's border, measures each pixel's ink density against it on the palette's scale from
`paper-cream` to `ink-black`, and writes one of three cuts. Two of them are the two your own
`tools/art/backdrop-textures.mjs` makes.

| cut | what the PNG holds | draw it as |
|---|---|---|
| **wash** | one flat colour, `ink-black`, with the ink density in alpha | ink over paper: `paintMaterial({ map, wash: true })`. Over the paper sky it reproduces the painting; where there was paper there is nothing, so there is no fringe. It does not hide what is behind it, it darkens it. |
| **matte** | opaque inside the subject's outline, in the ramp colour for each value, feathered to a wash at the rim and where the painting thins away | a solid form: `paintMaterial({ map, wash: true })` for the soft edge. It hides what is behind it. Paper the brush skipped inside the outline stays, as pale rock. |
| **open** | solid wherever there is real ink, nothing where there is paper, even paper enclosed by ink | as matte. The gaps between a pine's needles stay gaps. |

- The mist cards are washes of grey, not sheets of paper colour. They add cloud form over the
  paper; they do not hide a cliff's foot the way your paper-coloured mist sheets do.
- Distance is yours to set with `opacity`: a wash card at `opacity: 0.6` is a paler, farther ridge.
- Sizes are far over your `budgets.json` backdrop lines (512 and 1024 px). Resize to what a layer
  needs; these are sources.

## Decisions I made that Tim may want to reverse

1. **The cards are in `assets/backdrop/gen/`, not `assets/backdrop/`.** Reason above.
2. **`fal-ai/nano-banana-2` at 2K ($0.12 an image), not `fal-ai/nano-banana` ($0.0398).** I
   painted the first cliff with both. The cheaper model gave a pale rock of nested outlines; the
   newer one gave the seed's cliff, and at 1536 x 2752, so 2048 px is a downscale. Both test
   images are ledger rows 47 and 48. The set cost $1.60 where the cheaper model would have cost
   about $0.52.
3. **Every card is re-coloured to the palette.** The paintings came on five different paper tones
   with sepia ink. The cutter keeps their values and writes palette colours.
4. **The uncut paintings are not committed** (85 MB of PNG; CI checks out LFS in every job). The
   small fal records are in `gen/raw/`, and any painting can be re-downloaded for free while fal
   keeps it: `node tools/gen/fal-call.mjs fetch <request id> --out assets/build/gen/bd --name <card>.2k`.
5. **Pale scraps are dropped.** An island of pale wash far smaller than the main form (the sheet
   darkening toward a corner, a leftover of a wash too faint to cut) is removed whole. That is
   what took the fragment of `peaks_b`'s rear peak away.

## Reproducing

```
node tools/gen/crop-refs.mjs assets/build/gen/refs           # the seed crops used as style references
node tools/gen/make-backdrop-payloads.mjs --model nano-banana-2   # the 13 prompts -> tools/gen/payloads/bd-*.2k.json
node tools/gen/build-backdrop.mjs                            # cut every downloaded painting -> assets/backdrop/gen/
node tools/gen/backdrop-sheet.mjs docs/build-log/art-gen/backdrop-sheet.png
node tools/gen/backdrop-sheet.mjs /tmp/dark.png --bg "#3a3632"    # the halo check
```
