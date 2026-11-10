# fal.ai ledger

Cap **$20.00** in total, absolute, across rounds 1 and 2 (raised from $10.00 by Tim at 11:29 am PST on
2026-11-10). No new call starts at or past **$19.50**. Written by `tools/gen/fal-call.mjs`
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
| 27 | 2026-11-10T18:55:36Z | fal-ai/hunyuan3d-v3/image-to-3d | final: cliff (Normal + PBR) | $0.5250 | $0.5250 | 01a1c6d0-d404-7ee2-b812-9ff2c0169fbe | done | $2.5218 |
| 28 | 2026-11-10T19:00:40Z | fal-ai/hunyuan3d-v3/image-to-3d | final: boulder (Normal + PBR) | $0.5250 | $0.5250 | 01a1c6d5-7877-7be0-81c2-5574a2d976e3 | done | $3.0468 |
| 29 | 2026-11-10T19:03:53Z | fal-ai/hunyuan3d-v3/image-to-3d | final: torii (Normal + PBR) | $0.5250 | $0.5250 | 01a1c6d8-69af-7550-b7dd-09e2e86e9130 | done | $3.5718 |
| 30 | 2026-11-10T19:06:14Z | fal-ai/hunyuan3d-v3/image-to-3d | final: pine (Normal + PBR) | $0.5250 | $0.5250 | 01a1c6da-90c8-78b1-ad59-09ae39bd1a65 | done | $4.0968 |
| 31 | 2026-11-10T19:09:49Z | fal-ai/nano-banana/edit | input image: cliff5 v5 | $0.0398 | $0.0398 | 01a1c6dd-d58c-7de0-b426-8799628c5773 | done | $4.1366 |
| 32 | 2026-11-10T19:10:08Z | fal-ai/nano-banana/edit | input image: pine-side v5 | $0.0398 | $0.0398 | 01a1c6de-22bc-7953-a141-9ae5d9c1aab5 | done | $4.1764 |
| 33 | 2026-11-10T19:11:03Z | fal-ai/nano-banana/edit | input image: cliff6 v6 | $0.0398 | $0.0398 | 01a1c6de-f926-7e82-b1a3-a9bc5163cf30 | done | $4.2162 |
| 34 | 2026-11-10T19:11:42Z | fal-ai/trellis | trellis test: cliff | $0.0200 | $0.0200 | 01a1c6df-9102-7130-8600-ba7bcf19724e | done | $4.2362 |
| 35 | 2026-11-10T19:12:48Z | fal-ai/trellis/multi | trellis test: pine, front + side view | $0.0400 | $0.0400 | 01a1c6e0-91a1-74d0-a895-72fe8a4a91b6 | done | $4.2762 |
| 36 | 2026-11-10T19:13:46Z | fal-ai/hunyuan3d-v3/image-to-3d | final: cliff (Normal + PBR) | $0.5250 | $0.5250 | 01a1c6e1-74f4-7c82-baaf-ec3daa4e9aab | done | $4.8012 |
| 37 | 2026-11-10T19:14:16Z | fal-ai/nano-banana | input image: stone lantern v1 (optional asset) | $0.0398 | $0.0398 | 01a1c6e1-eb00-7f02-9f2c-27b28dbe02ba | done | $4.8410 |
| 38 | 2026-11-10T19:14:59Z | fal-ai/trellis | trellis test: lantern | $0.0200 | $0.0200 | 01a1c6e2-90ec-7c20-9473-3f4eb95ad5cd | done | $4.8610 |
| 39 | 2026-11-10T19:15:52Z | fal-ai/hunyuan3d-v3/image-to-3d | final: lantern (Normal + PBR) | $0.5250 | $0.5250 | 01a1c6e3-617e-70f0-9913-7f54a2492104 | done | $5.3860 |
| 40 | 2026-11-10T19:16:01Z | fal-ai/meshy/rigging | auto-rig: warrior (Meshy; page lists 0.20, pricing API 0.80, booked at 0.80) | $0.8000 | $0.8000 | 01a1c6e3-846c-70d1-9cfa-a6a4bdf42a32 | done | $6.1860 |
| 41 | 2026-11-10T19:18:40Z | fal-ai/nano-banana | input image: pine v7 (chunky dome pads, seen from above) | $0.0398 | $0.0398 | 01a1c6e5-f0e8-70c3-8fae-f17e7562d4e0 | done | $6.2258 |
| 42 | 2026-11-10T19:19:11Z | fal-ai/trellis | trellis test: pine7 | $0.0200 | $0.0200 | 01a1c6e6-694f-70d2-b702-5eab4aebcc43 | done | $6.2458 |
| 43 | 2026-11-10T19:27:00Z | fal-ai/nano-banana/edit | input image: cliff variant b (optional asset) | $0.0398 | $0.0398 | 01a1c6ed-921e-7581-b639-eec41ae1baa6 | done | $6.2856 |
| 44 | 2026-11-10T19:27:33Z | fal-ai/trellis | trellis test: cliff_b | $0.0200 | $0.0200 | 01a1c6ee-11fa-7a61-9a8c-eaec4046aa87 | done | $6.3056 |
| 45 | 2026-11-10T19:28:23Z | fal-ai/hunyuan3d-v3/image-to-3d | final: cliff_b (Normal + PBR) | $0.5250 | $0.5250 | 01a1c6ee-d88e-7683-a2a2-b61b3d9b93c7 | done | $6.8306 |
| 46 | 2026-11-10T19:42:09Z | fal-ai/meshy/rigging/multi-animation | animate: warrior, rig + 10 library clips (page 0.20 + 0.12 per clip = 1.40; pricing API 0.08 per generation; booked above both at 0.80 + 0.12 per clip) | $2.0000 | $2.0000 | 01a1c6fb-7230-7952-bbdc-8d3d7272c61d | submitted | $8.8306 |
