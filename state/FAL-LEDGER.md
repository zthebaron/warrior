# fal.ai ledger

Cap **$10.00**, absolute. No new call starts at or past **$9.50**. Written by `tools/gen/fal-call.mjs`
only: the row is appended as `pending` before the request is sent, so a crash cannot hide a charge.

Every row counts toward the total at its listed price, with one exception: `rejected` means fal
answered the submit with a non-2xx status and never accepted the job, so it is listed at its price
but counted as $0.0000. `failed`, `pending` and `unknown` rows count in full.

| # | time (UTC) | endpoint | for | listed price | counted | request id | status | running total |
|---|---|---|---|---|---|---|---|---|
| 1 | 2026-11-10T18:31:35Z | fal-ai/nano-banana/edit | input image: warrior front v1 | $0.0398 | $0.0398 | 01a1c6ba-d7b0-7a90-b6d6-53e347f956c9 | done | $0.0398 |
| 2 | 2026-11-10T18:32:19Z | fal-ai/nano-banana/edit | input image: warrior front v2 (remove second sword) | $0.0398 | $0.0398 | 01a1c6bb-8080-7d50-8eb3-7580ba3d742d | done | $0.0796 |
| 3 | 2026-11-10T18:32:59Z | fal-ai/nano-banana/edit | input image: warrior front v3 (one back sword + gourds added to v2) | $0.0398 | $0.0398 | 01a1c6bc-1f9a-7323-81db-38e1ca828afa | done | $0.1194 |
| 4 | 2026-11-10T18:33:43Z | fal-ai/nano-banana/edit | input image: warrior front v4 (gourds + hilt behind shoulder, no strap) | $0.0398 | $0.0398 | 01a1c6bc-ca0a-7d92-a932-c8aed82560f8 | done | $0.1592 |
| 5 | 2026-11-10T18:35:15Z | fal-ai/nano-banana/edit | input image: warrior-back v1 | $0.0398 | $0.0398 | 01a1c6be-319b-7d40-a954-701a79d4576a | done | $0.1990 |
| 6 | 2026-11-10T18:35:39Z | fal-ai/nano-banana/edit | input image: pine v1 | $0.0398 | $0.0398 | 01a1c6be-8ed1-7d93-a714-e0c9a8eb412e | done | $0.2388 |
| 7 | 2026-11-10T18:35:59Z | fal-ai/nano-banana/edit | input image: cliff v1 | $0.0398 | $0.0398 | 01a1c6be-ddc5-74a1-8c6c-7c868621459e | done | $0.2786 |
| 8 | 2026-11-10T18:36:23Z | fal-ai/nano-banana/edit | input image: boulder v1 | $0.0398 | $0.0398 | 01a1c6bf-3a74-7641-bc48-322a876f4e7c | done | $0.3184 |
| 9 | 2026-11-10T18:36:47Z | fal-ai/nano-banana/edit | input image: torii v1 | $0.0398 | $0.0398 | 01a1c6bf-97ce-7312-b895-540a41d98096 | done | $0.3582 |
| 10 | 2026-11-10T18:37:39Z | fal-ai/nano-banana/edit | input image: warrior-back2 v2 | $0.0398 | $0.0398 | 01a1c6c0-6324-7700-8126-a494c4200424 | done | $0.3980 |
| 11 | 2026-11-10T18:38:03Z | fal-ai/nano-banana/edit | input image: cliff2 v2 | $0.0398 | $0.0398 | 01a1c6c0-c378-75a2-9d0f-676ab0d59525 | done | $0.4378 |
| 12 | 2026-11-10T18:38:23Z | fal-ai/nano-banana/edit | input image: torii2 v2 | $0.0398 | $0.0398 | 01a1c6c1-10fc-7a01-8157-ca326c02b6e8 | done | $0.4776 |
| 13 | 2026-11-10T18:39:33Z | fal-ai/trellis | trellis test: warrior | $0.0200 | $0.0200 | 01a1c6c2-21ab-7aa3-9c02-fb8e24e67b7e | done | $0.4976 |
| 14 | 2026-11-10T18:39:57Z | fal-ai/trellis | trellis test: pine | $0.0200 | $0.0200 | 01a1c6c2-7e72-7ea3-b2a2-1119658fad44 | done | $0.5176 |
| 15 | 2026-11-10T18:40:37Z | fal-ai/trellis | trellis test: cliff | $0.0200 | $0.0200 | 01a1c6c3-1b17-7bd0-8582-55a9723415a3 | done | $0.5376 |
| 16 | 2026-11-10T18:41:13Z | fal-ai/trellis | trellis test: boulder | $0.0200 | $0.0200 | 01a1c6c3-a84a-7453-a0b1-af7454601a7b | done | $0.5576 |
| 17 | 2026-11-10T18:41:41Z | fal-ai/trellis | trellis test: torii | $0.0200 | $0.0200 | 01a1c6c4-14ea-7872-9327-4b7a90e1bdea | done | $0.5776 |
| 18 | 2026-11-10T18:43:31Z | fal-ai/nano-banana/edit | input image: pine3 v3 | $0.0398 | $0.0398 | 01a1c6c5-c1d2-7221-a584-ac02a893d5f2 | done | $0.6174 |
| 19 | 2026-11-10T18:43:46Z | fal-ai/nano-banana/edit | input image: boulder3 v3 | $0.0398 | $0.0398 | 01a1c6c5-fdf2-70f3-965d-7f1208fce64a | done | $0.6572 |
| 20 | 2026-11-10T18:44:30Z | fal-ai/nano-banana/edit | input image: pine4 v4 | $0.0398 | $0.0398 | 01a1c6c6-aab0-7513-bc0d-b95f2b53992e | done | $0.6970 |
| 21 | 2026-11-10T18:45:08Z | fal-ai/trellis | trellis test: pine | $0.0200 | $0.0200 | 01a1c6c7-3f37-7300-9a5c-295749e7c289 | done | $0.7170 |
| 22 | 2026-11-10T18:45:49Z | fal-ai/trellis | trellis test: boulder | $0.0200 | $0.0200 | 01a1c6c7-dc91-7330-871c-d9bd59f90ee1 | done | $0.7370 |
| 23 | 2026-11-10T18:47:07Z | fal-ai/nano-banana | input image: pine v5 (isometric, text-only) | $0.0398 | $0.0398 | 01a1c6c9-0de3-7283-bd85-a3b80bd44d41 | done | $0.7768 |
| 24 | 2026-11-10T18:47:36Z | fal-ai/trellis | trellis test: pine | $0.0200 | $0.0200 | 01a1c6c9-7f9a-7ad2-9cb1-65b0d39aeea1 | done | $0.7968 |
| 25 | 2026-11-10T18:48:22Z | fal-ai/hunyuan3d-v3/image-to-3d | final: warrior (Normal + PBR + back view) | $0.6750 | $0.6750 | 01a1c6ca-322a-7062-8dae-641d1d049d46 | done | $1.4718 |
| 26 | 2026-11-10T18:52:27Z | fal-ai/hunyuan3d-v3/image-to-3d | final: warrior, no PBR (PBR albedo came out de-lit and pale) + back view | $0.5250 | $0.5250 | 01a1c6cd-f12a-7b00-a006-0643216c132a | done | $1.9968 |
| 27 | 2026-11-10T18:55:36Z | fal-ai/hunyuan3d-v3/image-to-3d | final: cliff (Normal + PBR) | $0.5250 | $0.5250 | 01a1c6d0-d404-7ee2-b812-9ff2c0169fbe | submitted | $2.5218 |
