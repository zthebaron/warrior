# assets/courtyard: the courtyard's painted cards (D-026)

Every PNG here is written by `node tools/art/courtyard-cards.mjs` and by nothing else; `npm run assets:budget`
re-runs it and compares each file pixel for pixel. They are loaded by an ink level in the `courtyard` zone only
(`src/loaders/courtyard.ts` `preloadCourtyard`), never by chapter 1.

| Card | Size | From | Drawn as |
|---|---|---|---|
| `yard_far` | 2048 x 620 | Tim's painting (`assets/ui/src/courtyard-duel.png`), rows 70 to 380, its walls and gate cut out | the mountains and pines beyond the walls, on five arcs round the yard |
| `yard_sky` | 1024 x 196 | the painting's sky, rows 0 to 196: where it is red | a rose wash low over the mountains (rgb 204, 184, 174) |
| `yard_flags` | 2048 x 2048 | drawn from seed 5 | flagstones over every floor, 16 m to a tile |
| `yard_plaster_lit`, `yard_plaster_shade` | 1024 x 512 | drawn from seeds 21 and 23 | stains, a timber post and base stones on the walls' long faces, 12 m to a card |
| `yard_tiles` | 512 x 256 | drawn from seed 9 | tile rows on the wall caps, and the planks of the door's leaves |

No fal call made any of these. The one bought asset of D-026 is the gate: `assets/hero/MANIFEST.md`.
