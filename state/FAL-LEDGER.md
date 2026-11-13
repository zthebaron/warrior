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
| 46 | 2026-11-10T19:42:09Z | fal-ai/meshy/rigging/multi-animation | animate: warrior, rig + 10 library clips (page 0.20 + 0.12 per clip = 1.40; pricing API 0.08 per generation; booked above both at 0.80 + 0.12 per clip) | $2.0000 | $2.0000 | 01a1c6fb-7230-7952-bbdc-8d3d7272c61d | done | $8.8306 |
| 47 | 2026-11-10T20:02:04Z | fal-ai/nano-banana/edit | backdrop card: cliff_a, 1K (resolution test) | $0.0398 | $0.0398 | 01a1c70d-ac85-7a62-96a1-84775e018fa3 | done | $8.8704 |
| 48 | 2026-11-10T20:02:20Z | fal-ai/nano-banana-2/edit | backdrop card: cliff_a, native 2K (resolution test) | $0.1200 | $0.1200 | 01a1c70d-eaaf-7f90-9d49-425e9f301993 | done | $8.9904 |
| 49 | 2026-11-10T20:03:16Z | fal-ai/nano-banana-2/edit | backdrop card: cliff_b, native 2K | $0.1200 | $0.1200 | 01a1c70e-c63a-7fb0-b794-e80b2092d3c0 | done | $9.1104 |
| 50 | 2026-11-10T20:03:40Z | fal-ai/nano-banana-2/edit | backdrop card: cliff_c, native 2K | $0.1200 | $0.1200 | 01a1c70f-2583-7c32-9d63-2d7ebea197c9 | done | $9.2304 |
| 51 | 2026-11-10T20:04:08Z | fal-ai/nano-banana-2/edit | backdrop card: pine_a, native 2K | $0.1200 | $0.1200 | 01a1c70f-9334-7b61-967a-adb06fe45114 | done | $9.3504 |
| 52 | 2026-11-10T20:04:35Z | fal-ai/nano-banana-2/edit | backdrop card: pine_b, native 2K | $0.1200 | $0.1200 | 01a1c70f-fc35-7d43-8582-c73010edbcf7 | done | $9.4704 |
| 53 | 2026-11-10T20:05:04Z | fal-ai/nano-banana-2/edit | backdrop card: pine_c, native 2K | $0.1200 | $0.1200 | 01a1c710-6b93-70c3-909e-2bf1b1ada021 | done | $9.5904 |
| 54 | 2026-11-10T20:05:27Z | fal-ai/nano-banana-2/edit | backdrop card: peaks_a, native 2K | $0.1200 | $0.1200 | 01a1c710-c7bb-7701-b6ae-e69357a22465 | done | $9.7104 |
| 55 | 2026-11-10T20:05:56Z | fal-ai/nano-banana-2/edit | backdrop card: peaks_b, native 2K | $0.1200 | $0.1200 | 01a1c711-3624-7c41-a159-eb92e0308a1a | done | $9.8304 |
| 56 | 2026-11-10T20:06:20Z | fal-ai/nano-banana-2/edit | backdrop card: peaks_c, native 2K | $0.1200 | $0.1200 | 01a1c711-9350-7881-8d3d-5c0595dd561a | done | $9.9504 |
| 57 | 2026-11-10T20:06:44Z | fal-ai/nano-banana-2/edit | backdrop card: mist_a, native 2K | $0.1200 | $0.1200 | 01a1c711-f207-7a43-8827-cb525a812c5e | done | $10.0704 |
| 58 | 2026-11-10T20:07:16Z | fal-ai/nano-banana-2/edit | backdrop card: mist_b, native 2K | $0.1200 | $0.1200 | 01a1c712-71a7-7b32-abbb-fb89adbc990e | done | $10.1904 |
| 59 | 2026-11-10T20:07:40Z | fal-ai/nano-banana-2/edit | backdrop card: wide_a, native 2K | $0.1200 | $0.1200 | 01a1c712-ceb7-7a13-b483-170951e8c56c | done | $10.3104 |
| 60 | 2026-11-10T20:08:04Z | fal-ai/nano-banana-2/edit | backdrop card: wide_b, native 2K | $0.1200 | $0.1200 | 01a1c713-2bc6-7410-bd47-48e5c6186c31 | done | $10.4304 |
| 61 | 2026-11-10T20:16:42Z | fal-ai/nano-banana/edit | input image: rock variant boulder-b (round 2, priority 3) | $0.0398 | $0.0398 | 01a1c71b-122f-70f2-8539-3a5d6917a21b | done | $10.4702 |
| 62 | 2026-11-10T20:17:22Z | fal-ai/nano-banana/edit | input image: rock variant spire (round 2, priority 3) | $0.0398 | $0.0398 | 01a1c71b-b072-7ff1-9c70-e03aef1d716c | done | $10.5100 |
| 63 | 2026-11-10T20:17:52Z | fal-ai/trellis | trellis test: boulder_b | $0.0200 | $0.0200 | 01a1c71c-261f-7923-91c3-22bb3e56617c | done | $10.5300 |
| 64 | 2026-11-10T20:18:49Z | fal-ai/trellis | trellis test: spire | $0.0200 | $0.0200 | 01a1c71d-029a-70c1-bd5a-462e0469cd85 | done | $10.5500 |
| 65 | 2026-11-10T20:19:48Z | fal-ai/hunyuan3d-v3/image-to-3d | final: boulder_b (Normal + PBR) | $0.5250 | $0.5250 | 01a1c71d-e7f9-7ee3-bfef-00be51509ba9 | done | $11.0750 |
| 66 | 2026-11-10T20:22:38Z | fal-ai/hunyuan3d-v3/image-to-3d | final: spire (Normal + PBR) | $0.5250 | $0.5250 | 01a1c720-81ea-7753-997e-d30ed1981934 | done | $11.6000 |
| 67 | 2026-11-11T00:21:39Z | fal-ai/elevenlabs/sound-effects/v3 | audio: jump | $0.0020 | $0.0020 | 01a1c7fb-562c-7a30-9d2d-5403ae54812d | done | $11.6020 |
| 68 | 2026-11-11T00:21:53Z | fal-ai/elevenlabs/sound-effects/v3 | audio: double_jump | $0.0020 | $0.0020 | 01a1c7fb-8a7d-7091-8ad1-571cf8875eed | done | $11.6040 |
| 69 | 2026-11-11T00:22:00Z | fal-ai/elevenlabs/sound-effects/v3 | audio: land_soft | $0.0020 | $0.0020 | 01a1c7fb-a7c1-7082-95b1-7fb84bf13fe3 | done | $11.6060 |
| 70 | 2026-11-11T00:22:06Z | fal-ai/elevenlabs/sound-effects/v3 | audio: land_hard | $0.0020 | $0.0020 | 01a1c7fb-be55-7770-886d-0def4854035e | done | $11.6080 |
| 71 | 2026-11-11T00:22:12Z | fal-ai/elevenlabs/sound-effects/v3 | audio: slash | $0.0020 | $0.0020 | 01a1c7fb-d4c9-74a1-a980-13d5807bc6cd | done | $11.6100 |
| 72 | 2026-11-11T00:22:17Z | fal-ai/elevenlabs/sound-effects/v3 | audio: dash | $0.0020 | $0.0020 | 01a1c7fb-ea8e-7901-bdb5-684201a7c7ee | done | $11.6120 |
| 73 | 2026-11-11T00:22:23Z | fal-ai/elevenlabs/sound-effects/v3 | audio: wall_grab | $0.0020 | $0.0020 | 01a1c7fc-00cd-7f93-956e-efe88b6a15d1 | done | $11.6140 |
| 74 | 2026-11-11T00:22:29Z | fal-ai/elevenlabs/sound-effects/v3 | audio: checkpoint | $0.0040 | $0.0040 | 01a1c7fc-177e-7b73-819a-2275d218db29 | done | $11.6180 |
| 75 | 2026-11-11T00:22:34Z | fal-ai/elevenlabs/sound-effects/v3 | audio: respawn | $0.0040 | $0.0040 | 01a1c7fc-2db7-7243-877f-379b4a21a0c1 | done | $11.6220 |
| 76 | 2026-11-11T00:22:40Z | fal-ai/stable-audio-25/text-to-audio | audio: music-s11 | $0.2000 | $0.2000 | 01a1c7fc-4455-74e3-a8cd-bc04683effe4 | done | $11.8220 |
| 77 | 2026-11-11T00:22:47Z | fal-ai/stable-audio-25/text-to-audio | audio: music-s29 | $0.2000 | $0.2000 | 01a1c7fc-600d-7062-aecc-e3f8c53fcd47 | done | $12.0220 |
| 78 | 2026-11-11T00:24:57Z | fal-ai/elevenlabs/sound-effects/v3 | audio: jump-b | $0.0020 | $0.0020 | 01a1c7fe-58a3-7c23-8f82-f7a59f323609 | done | $12.0240 |
| 79 | 2026-11-11T00:25:02Z | fal-ai/elevenlabs/sound-effects/v3 | audio: land_soft-b | $0.0020 | $0.0020 | 01a1c7fe-6eca-73f0-b03a-037160a8ad11 | done | $12.0260 |
| 80 | 2026-11-11T00:25:08Z | fal-ai/elevenlabs/sound-effects/v3 | audio: rain_wind | $0.0600 | $0.0600 | 01a1c7fe-84cc-7720-af21-29a2f9a82bca | done | $12.0860 |
| 81 | 2026-11-11T03:00:23Z | fal-ai/nano-banana/edit | input image: swordsman front v1 | $0.0398 | $0.0398 | 01a1c88c-a782-7b51-8046-332975d14bf9 | done | $12.1258 |
| 82 | 2026-11-11T03:01:09Z | fal-ai/nano-banana/edit | input image: swordsman front v2 (arms opened to an A-pose) | $0.0398 | $0.0398 | 01a1c88d-5c5e-7cb2-a87c-18262a361bc9 | done | $12.1656 |
| 83 | 2026-11-11T03:02:01Z | fal-ai/nano-banana/edit | input image: swordsman front v3 (blade in line with the arm) | $0.0398 | $0.0398 | 01a1c88e-256e-7a70-a191-3be024a11c01 | done | $12.2054 |
| 84 | 2026-11-11T03:02:40Z | fal-ai/nano-banana/edit | input image: swordsman front v4 (empty hands: the katana is attached to the hand bone in the game) | $0.0398 | $0.0398 | 01a1c88e-bd92-7763-85ec-eeca79171c45 | done | $12.2452 |
| 85 | 2026-11-11T03:03:45Z | fal-ai/nano-banana/edit | input image: swordsman back v1 | $0.0398 | $0.0398 | 01a1c88f-bc04-7632-899c-6fe5cbe6dc40 | done | $12.2850 |
| 86 | 2026-11-11T03:04:14Z | fal-ai/trellis | trellis test: swordsman | $0.0200 | $0.0200 | 01a1c890-2cd6-78c1-815a-045ca5d8d7c3 | done | $12.3050 |
| 87 | 2026-11-11T03:05:06Z | fal-ai/hunyuan3d-v3/image-to-3d | final: swordsman (Normal + back view, no PBR) | $0.5250 | $0.5250 | 01a1c890-f9d1-7fc2-b6c5-1fda2415747a | done | $12.8300 |
| 88 | 2026-11-11T03:08:23Z | fal-ai/meshy/rigging/multi-animation | animate: swordsman, rig + 8 library clips (Combat_Stance, Idle_3, Walk_Fight_Forward, Charged_Slash, Right_Hand_Sword_Slash, Hit_Reaction, dying_backwards, Knock_Down; booked at 0.80 + 0.12 per clip) | $1.7600 | $1.7600 | 01a1c893-fa97-75c1-b9c6-d6841e706de1 | done | $14.5900 |
| 89 | 2026-11-11T03:17:03Z | fal-ai/elevenlabs/sound-effects/v3 | audio: notice | $0.0020 | $0.0020 | 01a1c89b-e92c-7073-8a28-9a23e0d52891 | done | $14.5920 |
| 90 | 2026-11-11T03:17:08Z | fal-ai/elevenlabs/sound-effects/v3 | audio: hit | $0.0020 | $0.0020 | 01a1c89b-ff29-7b53-b7c0-1da56d852b4b | done | $14.5940 |
| 91 | 2026-11-11T03:17:14Z | fal-ai/elevenlabs/sound-effects/v3 | audio: fell | $0.0020 | $0.0020 | 01a1c89c-1606-7740-89d0-7d70133a65ab | done | $14.5960 |
| 92 | 2026-11-11T03:17:20Z | fal-ai/elevenlabs/sound-effects/v3 | audio: cut | $0.0020 | $0.0020 | 01a1c89c-2c98-77c1-8d83-1d65d0c8b356 | done | $14.5980 |
| 93 | 2026-11-11T03:17:46Z | fal-ai/elevenlabs/sound-effects/v3 | audio: hit-b | $0.0020 | $0.0020 | 01a1c89c-9165-7442-9ead-70321b43c967 | done | $14.6000 |
| 94 | 2026-11-13T02:02:56Z | fal-ai/nano-banana/edit | COURTYARD: the gate's input image, from the painting | $0.0398 | $0.0398 | 01a1d2a4-c866-7283-ad07-0a58a448d912 | done | $14.6398 |
| 95 | 2026-11-13T02:03:29Z | fal-ai/trellis | COURTYARD: trellis shape test: gate | $0.0200 | $0.0200 | 01a1d2a5-4827-7292-9a48-9f326786da88 | done | $14.6598 |
| 96 | 2026-11-13T02:04:24Z | fal-ai/hunyuan3d-v3/image-to-3d | COURTYARD: final: gate (Normal + PBR) | $0.5250 | $0.5250 | 01a1d2a6-1fb0-7691-848e-2fb6a637cec2 | done | $15.1848 |
