# H3 harness — proof runs (2026-11-07)

Re-run with `npm run playtest -- --level=00-gym`.
Exit codes: 0 pass · 1 LEVEL_FAILURE · 2 BUILD_FAILURE · 3 HARNESS_ENVIRONMENT_FAILURE · 4 HARNESS_SETUP_FAILURE.

## b0 — organic break found on the harness's first run (the level linted clean)

The gym staircase (critical_path 11->12, `via: ground`) was unwalkable. Fixed in commit 2e7e6d3;
details in MEASUREMENTS.md.

```
│ nav         FAIL    3/5    3.8s  LEVEL_FAILURE
│     ✗ goal reached                               stuck: seg 11->12 (via ground, "staircase: 8 x 0.4 rise / 0.6 tread") not completed in 20s, player at (57.64, 0.01, -0.00) state=idle
│     ✓ within par_time x3                         28.23s / 90s
│     ✓ never below bounds.min.y                   min feet y -0.19 vs -15
│     ✗ waypoints reached in order                 12/16: [0,1,2,3,4,5,6,7,8,9,10,11]
│     ✓ zero console errors                        none
probe at the riser (hold +x, 7 m/s):
24 x=57.560 y=0.010 vx=7.00 run g=true
25 x=57.598 y=0.048 vx=0.00 idle g=true   <- autostep lifts, wall-cancel zeroes vx
26 x=57.618 y=0.010 vx=1.17 run g=true   <- snapped back down
27 x=57.640 y=0.010 vx=0.00 idle g=true
```

## a — green

```
┌─ 00-gym ────────────────────────────────────────────────────────────────────────────────
│ schema      PASS    1/1    0.0s
│     ✓ level.schema.json                          levels/00-gym.json
│ lint-level  PASS    1/1    0.0s
│     ✓ lint-level.mjs                             clean, 1 warnings: [TIGHT] seg 7->8 via jump is at 100% of the limit
│ preflight   PASS    7/7    0.9s
│     ✓ build harness bundle                       dist-harness/
│     ✓ build production bundle                    dist/
│     ✓ harness API stripped from production bundle 0/3 sentinels in dist/, 3/3 in dist-harness/
│     ✓ vite preview serving over HTTP             http://127.0.0.1:4317
│     ✓ chromium launched with pinned args         158.0.8127.18  --enable-unsafe-swiftshader --use-gl=swiftshader --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows
│     ✓ webgl2 context on about:blank              renderer: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)
│     ✓ harness API exposed with ?harness=1        HARNESS_API_V1
│ nav         PASS    5/5    2.9s
│     ✓ goal reached                               results at 21.87s (par 30s, limit 90s)
│     ✓ within par_time x3                         21.87s / 90s
│     ✓ never below bounds.min.y                   min feet y -0.19 vs -15
│     ✓ waypoints reached in order                 16/16: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]
│     ✓ zero console errors                        none
│ replay      PASS    5/5    0.4s
│     ✓ goal reached                               results after 1312 ticks
│     ✓ checkpoints in order                       got [0,1], expected [0,1]
│     ✓ position within 0.5u                       final (90.50, 3.21, -0.01) vs (90.50, 3.21, -0.01): 0.000u
│     ✓ frames within 5%                           1312 vs 1312 ticks (0.00%, 21.87s)
│     ✓ zero console errors                        none
│ chaos       PASS    6/6    2.3s
│     ✓ ran full duration                          3600/3600 ticks, 5 deaths/respawns
│     ✓ in bounds                                  every tick inside level.bounds
│     ✓ not stuck                                  moved >= 0.5u in every active 5s window
│     ✓ zero console errors                        none
│     ✓ velocity under cap x2                      |h| max 20.00 <= 40 ; |v| max 35.00 <= 70
│     ✓ no NaN transforms                          feet, velocity, platforms finite every tick
│ counters    PASS    5/5    6.9s
│     ✓ draw calls < 300                           peak 29
│     ✓ triangles < 500,000                        peak 628
│     ✓ geometries < 400                           peak 4
│     ✓ textures < 120                             peak 1
│     ✓ zero console errors                        none (51 samples over trace playback (1312 frames) + 6 cameras)
│ visual      PASS    7/7    0.9s
│     ✓ cam0 drift <= 2%                           0.000% (0 px)
│     ✓ cam1 drift <= 2%                           0.000% (0 px)
│     ✓ cam2 drift <= 2%                           0.000% (0 px)
│     ✓ cam3 drift <= 2%                           0.000% (0 px)
│     ✓ cam4 drift <= 2%                           0.000% (0 px)
│     ✓ cam5 drift <= 2%                           0.000% (0 px)
│     ✓ zero console errors                        none
└──────────────────────────────────────────────────────────────────────────────────────────

webgl renderer : ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)
chromium       : 158.0.8127.18
report         : harness-report.json

RESULT: PASS
```

## b — geometry[1] deleted: the x=14 landing box for critical_path 1->2. Exit 1.

Schema and lint PASS: they cannot see this. nav and replay catch it.

```
┌─ 00-gym ────────────────────────────────────────────────────────────────────────────────
│ schema      PASS    1/1    0.0s
│     ✓ level.schema.json                          levels/00-gym.json
│ lint-level  PASS    1/1    0.0s
│     ✓ lint-level.mjs                             clean, 1 warnings: [TIGHT] seg 7->8 via jump is at 100% of the limit
│ preflight   PASS    7/7    0.9s
│     ✓ build harness bundle                       dist-harness/
│     ✓ build production bundle                    dist/
│     ✓ harness API stripped from production bundle 0/3 sentinels in dist/, 3/3 in dist-harness/
│     ✓ vite preview serving over HTTP             http://127.0.0.1:4317
│     ✓ chromium launched with pinned args         158.0.8127.18  --enable-unsafe-swiftshader --use-gl=swiftshader --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows
│     ✓ webgl2 context on about:blank              renderer: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)
│     ✓ harness API exposed with ?harness=1        HARNESS_API_V1
│ nav         FAIL    3/5    0.8s  LEVEL_FAILURE
│     ✗ goal reached                               FELL on seg 1->2 (via jump, "gap 2") — died at (16.72, -10.10, 0.00), target was (12.00, 0.00, 0.00), last reached waypoint 1
│     ✓ within par_time x3                         2.68s / 90s
│     ✓ never below bounds.min.y                   min feet y -10.10 vs -15
│     ✗ waypoints reached in order                 2/16: [0,1]
│     ✓ zero console errors                        none
│ replay      FAIL    1/5    0.4s  LEVEL_FAILURE
│     ✗ goal reached                               state=play after 1432 ticks (trace has 1312); player at (-0.00, 0.00, -0.00), deaths=5 (last at (14.03, -10.38, 0.06))
│     ✗ checkpoints in order                       got [0], expected [0,1]
│     ✗ position within 0.5u                       final (-0.00, 0.00, -0.00) vs (90.50, 3.21, -0.01): 90.560u
│     ✗ frames within 5%                           1432 vs 1312 ticks (9.15%, 23.87s)
│     ✓ zero console errors                        none
│ chaos       PASS    6/6    3.2s
│     ✓ ran full duration                          3600/3600 ticks, 6 deaths/respawns
│     ✓ in bounds                                  every tick inside level.bounds
│     ✓ not stuck                                  moved >= 0.5u in every active 5s window
│     ✓ zero console errors                        none
│     ✓ velocity under cap x2                      |h| max 20.00 <= 40 ; |v| max 35.00 <= 70
│     ✓ no NaN transforms                          feet, velocity, platforms finite every tick
│ counters    PASS    5/5    7.0s
│     ✓ draw calls < 300                           peak 28
│     ✓ triangles < 500,000                        peak 616
│     ✓ geometries < 400                           peak 4
│     ✓ textures < 120                             peak 1
│     ✓ zero console errors                        none (51 samples over trace playback (1312 frames) + 6 cameras)
│ visual      PASS    7/7    0.9s
│     ✓ cam0 drift <= 2%                           0.000% (0 px)
│     ✓ cam1 drift <= 2%                           1.010% (2328 px)
│     ✓ cam2 drift <= 2%                           0.909% (2095 px)
│     ✓ cam3 drift <= 2%                           0.000% (0 px)
│     ✓ cam4 drift <= 2%                           0.000% (0 px)
│     ✓ cam5 drift <= 2%                           0.000% (0 px)
│     ✓ zero console errors                        none
└──────────────────────────────────────────────────────────────────────────────────────────

webgl renderer : ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)
chromium       : 158.0.8127.18
report         : harness-report.json

RESULT: LEVEL_FAILURE
```

Visual drift for this deletion was 1.01% / 0.91%, under the 2% gate: a missing 4x4 pad does
not trip the visual stage on its own at 640x360.

## c — restored, green. Exit 0.

```
┌─ 00-gym ────────────────────────────────────────────────────────────────────────────────
│ schema      PASS    1/1    0.0s
│     ✓ level.schema.json                          levels/00-gym.json
│ lint-level  PASS    1/1    0.0s
│     ✓ lint-level.mjs                             clean, 1 warnings: [TIGHT] seg 7->8 via jump is at 100% of the limit
│ preflight   PASS    7/7    0.9s
│     ✓ build harness bundle                       dist-harness/
│     ✓ build production bundle                    dist/
│     ✓ harness API stripped from production bundle 0/3 sentinels in dist/, 3/3 in dist-harness/
│     ✓ vite preview serving over HTTP             http://127.0.0.1:4317
│     ✓ chromium launched with pinned args         158.0.8127.18  --enable-unsafe-swiftshader --use-gl=swiftshader --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows
│     ✓ webgl2 context on about:blank              renderer: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)
│     ✓ harness API exposed with ?harness=1        HARNESS_API_V1
│ nav         PASS    5/5    2.9s
│     ✓ goal reached                               results at 21.87s (par 30s, limit 90s)
│     ✓ within par_time x3                         21.87s / 90s
│     ✓ never below bounds.min.y                   min feet y -0.19 vs -15
│     ✓ waypoints reached in order                 16/16: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]
│     ✓ zero console errors                        none
│ replay      PASS    5/5    0.4s
│     ✓ goal reached                               results after 1312 ticks
│     ✓ checkpoints in order                       got [0,1], expected [0,1]
│     ✓ position within 0.5u                       final (90.50, 3.21, -0.01) vs (90.50, 3.21, -0.01): 0.000u
│     ✓ frames within 5%                           1312 vs 1312 ticks (0.00%, 21.87s)
│     ✓ zero console errors                        none
│ chaos       PASS    6/6    2.2s
│     ✓ ran full duration                          3600/3600 ticks, 5 deaths/respawns
│     ✓ in bounds                                  every tick inside level.bounds
│     ✓ not stuck                                  moved >= 0.5u in every active 5s window
│     ✓ zero console errors                        none
│     ✓ velocity under cap x2                      |h| max 20.00 <= 40 ; |v| max 35.00 <= 70
│     ✓ no NaN transforms                          feet, velocity, platforms finite every tick
│ counters    PASS    5/5    6.9s
│     ✓ draw calls < 300                           peak 29
│     ✓ triangles < 500,000                        peak 628
│     ✓ geometries < 400                           peak 4
│     ✓ textures < 120                             peak 1
│     ✓ zero console errors                        none (51 samples over trace playback (1312 frames) + 6 cameras)
│ visual      PASS    7/7    0.9s
│     ✓ cam0 drift <= 2%                           0.000% (0 px)
│     ✓ cam1 drift <= 2%                           0.000% (0 px)
│     ✓ cam2 drift <= 2%                           0.000% (0 px)
│     ✓ cam3 drift <= 2%                           0.000% (0 px)
│     ✓ cam4 drift <= 2%                           0.000% (0 px)
│     ✓ cam5 drift <= 2%                           0.000% (0 px)
│     ✓ zero console errors                        none
└──────────────────────────────────────────────────────────────────────────────────────────

webgl renderer : ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)
chromium       : 158.0.8127.18
report         : harness-report.json

RESULT: PASS
```

## d — no WebGL (`--disable-webgl` temporarily added to the launch args, then reverted). Exit 3.

```
┌─ 00-gym ────────────────────────────────────────────────────────────────────────────────
│ schema      PASS    1/1    0.0s
│     ✓ level.schema.json                          levels/00-gym.json
│ lint-level  PASS    1/1    0.0s
│     ✓ lint-level.mjs                             clean, 1 warnings: [TIGHT] seg 7->8 via jump is at 100% of the limit
│ preflight   FAIL    5/6    0.6s  HARNESS_ENVIRONMENT_FAILURE
│     ✓ build harness bundle                       dist-harness/
│     ✓ build production bundle                    dist/
│     ✓ harness API stripped from production bundle 0/3 sentinels in dist/, 3/3 in dist-harness/
│     ✓ vite preview serving over HTTP             http://127.0.0.1:4317
│     ✓ chromium launched with pinned args         158.0.8127.18  --enable-unsafe-swiftshader --use-gl=swiftshader --disable-webgl --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows
│     ✗ webgl2 context on about:blank              getContext("webgl2") returned null — no level was tested
└──────────────────────────────────────────────────────────────────────────────────────────

webgl renderer : (none)
chromium       : 158.0.8127.18
report         : harness-report.json

RESULT: HARNESS_ENVIRONMENT_FAILURE  — the machine could not run the game. NO LEVEL WAS TESTED; this is not a level failure.
```
