# assets/ui: the title and how-to-play paintings (D-022)

Two paintings by Tim de Vallée, given on 2026-11-10 for the title screen and the how-to-play page. Nothing here
was generated and nothing cost anything. `tools/art/ui-art.mjs` makes every shipped file from the two sources;
`tools/assets/shell-budget.mjs` (in `npm run assets:budget`) holds each one to its line in `budgets.json`.

## Sources (read only)

| file | size | what it is |
|---|---|---|
| `src/karasu-title.png` | 1376x768, 1,867,879 B | The title art. The lettering "KARASU / Flight of the Exile" and the red seal are painted into it. |
| `src/courtyard-duel.png` | 1024x1024, 1,525,425 B | The warrior facing three swordsmen in a walled courtyard. |

## Shipped

| file | size | bytes | what it is |
|---|---|---|---|
| `title.webp` | 1376x768 | 266,046 | The title painting, whole. WebP quality 82. The brief's limit is about 350 KB. |
| `title.jpg` | 1376x768 | 240,351 | The same, for a browser with no WebP. JPEG quality 80. |
| `title-wide.webp` | 1536x432 | 7,858 | What stands beside the painting on a screen wider than it: the painting mirrored outward from each edge, washed to bare paper, blurred. |
| `title-tall.webp` | 448x782 | 5,930 | The same for a phone held upright: the keep zone, then its mirror image below, fading to paper. |
| `courtyard.webp` | 1024x1024 | 164,778 | The courtyard painting, whole: the how-to-play page's header. WebP quality 82. |
| `courtyard.jpg` | 1024x1024 | 168,571 | The same, for a browser with no WebP. |

`art.json` holds the title painting's keep zone: the part that is never cropped (the lettering, the seal, the
boat and its oar), x 17% to 81% of its width. `index.html` uses the same numbers in CSS, and
`tools/harness/shell-shots.ts` measures in a browser that the zone is whole at 400x800, 1920x1080 and 5120x1440.

The paper tone used for the page and the extensions, `#e0d4be`, is the median colour of the title painting's
bright pixels (`ui-art.mjs` measures it).

## Rebuild

```
node tools/art/ui-art.mjs
```

`sharp` does the work. It is not a dependency of the game: `@gltf-transform/cli`, a dev dependency, brings it.
CI checks the sizes and does not rebuild, because an encoder's bytes differ between platforms.
