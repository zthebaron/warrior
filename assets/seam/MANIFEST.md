# assets/seam: the cliff seam's painted cards (D-028)

Every PNG here is written by `node tools/art/seam-cards.mjs` and by nothing else; `npm run assets:budget`
re-runs it and compares each file pixel for pixel. They are loaded by an ink level in the `seam` zone only
(`src/loaders/seam.ts` `preloadSeam`): chapter 2. No other level loads them.

| Card | Size | From | Drawn as |
|---|---|---|---|
| `seam_face_a` | 1024 x 1024 | `assets/backdrop/gen/cliff_b.png`, px 150,760 to 850,1460: two buttresses and the cleft between them | the brushwork of every face that stands across the path (the ones he climbs), 7 u wide and 9 u tall a card |
| `seam_face_b` | 1024 x 1024 | `assets/backdrop/gen/cliff_c.png`, px 280,390 to 860,970: the stepped wall above its ledge | the brushwork of every face that runs along the path, 9 u a card |

Both are washes: ink-black, with the painting's ink density in alpha (density under 0.3 dropped, the rest x 1.25),
laid over the pale face the ink pass draws.

No fal call made either of these. Their sources are ART-GEN's round 2 cliff paintings (`assets/backdrop/MANIFEST.md`,
ledger rows 47 to 60), already paid for and already shipped as chapter 1's wall.
