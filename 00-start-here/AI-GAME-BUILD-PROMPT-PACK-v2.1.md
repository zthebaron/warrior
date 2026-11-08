# AI GAME BUILD — PROMPT PACK
### Companion to `AI-GAME-BUILD-PLAYBOOK-v2.1.md`
Every prompt needed to run the program start to finish. Copy-paste ready.

Version 2.1 — 2026-11-07 · supersedes v1.0

**Why this was revised:** the v1.0 pack taught the bare-position `critical_path` that the
verification pass proved defective, and asserted frame time in CI where it is meaningless.
Pasting the old §P3 or §P6 would have rebuilt both faults. Every prompt below now matches
Playbook v2.1 and the verified tools.

---

## HOW TO USE THIS FILE

Each prompt is labelled with its **destination** in bold above the block. Paste the whole block.

| Destination label | Where it goes |
|---|---|
| **PASTE INTO CLAUDE CHAT (REVIEWER)** | This conversation or a new chat |
| **PASTE INTO CLAUDE CODE (BUILDER)** | Your Claude Code session in `~/Code/<project>` |
| **PASTE INTO CODEX (VERIFIER)** | Separate Codex session, same repo |
| **PASTE INTO FAL** | fal.ai playground / API call |
| **PASTE INTO GPT IMAGE** | ChatGPT image generation |
| **PASTE INTO TRIPO** | Tripo AI upload prompt field |
| **PASTE INTO ELEVENLABS / UDIO** | Audio generation |

Replace every `<ANGLE_BRACKET>` placeholder before pasting. `<PROJECT>` is your repo name, `<GAME>` your title.

---

# §P0 — SPEC & PREMISE

### P0.1 — The design interview

**PASTE INTO CLAUDE CHAT (REVIEWER)**
```
Run a design-tree interview with me to spec a browser 3D action-platformer before any
code exists. I am not a game developer — push back on anything that is unbuildable by a
one-person agent team in two weeks.

Ask me ONE question at a time. After each answer, tell me what that answer forecloses.

Cover in this order:
1. Premise in one sentence (who, where, why)
2. The single core verb the player does constantly
3. The 30-90 second core loop
4. Win condition and session length
5. Chapter list (4 for a sprint, 12 for production) — one line each
6. Failure model (checkpoints, lives, respawn)
7. The explicit NOT list — mechanics we are refusing

When we're done, output a complete 00-start-here/SPEC.md containing all of the above
plus a "Tuning Constants" section with placeholder values for: gravity, jump impulse,
double-jump impulse, air control, ground friction, coyote time, jump buffer, dash
distance, dash cooldown, sprint multiplier, terminal velocity.

Then output 00-start-here/AGENT-BRIEF.md — the standing preamble every build agent
will read first. It must state: the locked stack, the budgets, the level-schema rules,
the lane isolation rules, and the list of things agents may never do.
```

---

# §P1 — THE SEED VIDEO

### P1.1 — Seed video generation

**PASTE INTO FAL** *(model: Flux 3 Max video / Veo / Runway — generate 6–10 variants)*
```
A lone wandering <CHARACTER_ARCHETYPE> walks a narrow stone path along a sheer cliff
face, high above a sea of mist. Third-person camera, roughly behind and slightly above
the figure at shoulder height, following smoothly — no crane moves, no cuts.

Art medium: <MEDIUM — e.g. traditional sumi-e ink wash painting on aged cream paper,
visible brush texture, heavy black ink for near forms, grey wash for mid-distance,
pale paper-cream for far distance>.

Palette: strictly limited — black ink, three greys, aged paper cream, and a single
muted <ACCENT_COLOUR> accent used sparingly.

Environment: vertical grey cliffs, horizontal cut-stone paths and stairs, twisted
pine silhouettes, a distant <LANDMARK> emerging from the mist.

Character: strong readable silhouette — <SILHOUETTE DESCRIPTION, e.g. wide conical
hat disc, dark layered robe, long staff or sword across the back, gourd at the hip>.
Loose fabric moving with the walk.

Lighting: flat overcast, no harsh sun, no specular highlights, depth conveyed only
by atmospheric fade.

Mood: quiet, vast, solitary. Slow deliberate pace.

12 seconds. Continuous motion. No text, no UI, no logos, no cuts.
```

### P1.2 — Candidate judging

**PASTE INTO CLAUDE CHAT (REVIEWER)** *(attach all candidates)*
```
Here are <N> candidate seed videos for the game. Judge them against exactly four
criteria and nothing else. Score each 1-5 and give me a single recommendation.

1. READABLE SILHOUETTE — is the character identifiable at 5% of screen height?
2. BUILDABLE GEOMETRY — are the forms blocky and reconstructable in Blender, or
   impressionistic mush that cannot become collision geometry?
3. PALETTE DISCIPLINE — fewer than 8 dominant hues, consistent across the clip?
4. SHIPPABLE CAMERA — third-person, roughly constant height, no impossible moves?

Then tell me which ONE to lock, and specifically what we are giving up by not
choosing the runner-up.
```

### P1.3 — Frame extraction

**PASTE INTO CLAUDE CODE (BUILDER)**
```
Extract reference frames from the locked seed video.

1. mkdir -p reference/seed/frames
2. Put the video at reference/seed/seed.mp4
3. ffmpeg -i reference/seed/seed.mp4 -vf fps=3 reference/seed/frames/frame_%03d.png
4. Also extract 6 "hero" frames at the visually strongest moments — look at the set
   and pick them, copy to reference/seed/hero/
5. Write reference/seed/README.md listing each hero frame and what it establishes
   (character design / environment grammar / depth banding / camera language).
```

---

# §P2 — STYLE BIBLE

### P2.1 — Palette extraction

**PASTE INTO CLAUDE CODE (BUILDER)**
```
Write tools/extract_palette.py.

Input: all PNGs in reference/seed/frames/
Process: downsample each to 128px, pool all pixels, run k-means (k=8) in LAB colour
space for perceptual accuracy, sort clusters by pixel share.
Output: reference/palette.json in this shape:

{
  "source": "seed.mp4",
  "extracted": "<ISO date>",
  "colors": [
    { "name": "ink-black",   "hex": "#1a1a18", "share": 0.21, "role": "near-forms" },
    { "name": "paper-cream", "hex": "#e8e0cc", "share": 0.18, "role": "far-distance" }
  ]
}

Name each colour yourself from its role in the image. Then also emit
reference/palette-strip.png — a labelled swatch strip for the case study.

Add `npm run palette` to package.json.
```

### P2.2 — Style Bible authoring

**PASTE INTO CLAUDE CHAT (REVIEWER)** *(attach the 6 hero frames + palette.json)*
```
Write 00-start-here/STYLE-BIBLE.md from these reference frames and this palette.

This document is LAW for every build agent. An agent that has never seen the video
must be able to produce matching work from this text alone. Be specific and
prescriptive, not descriptive.

Required sections:

1. MEDIUM & RENDERING RULES — the exact visual treatment, stated as rules
   ("no specular highlights anywhere", "rim light only, from above-left")
2. PALETTE LAW — the locked hex values, what each is allowed to be used for,
   and the one accent colour's strict usage budget
3. DEPTH BANDING — the three depth bands, their value ranges, where the
   transitions sit in world units
4. SILHOUETTE RULES — character and landmark silhouette requirements
5. ENVIRONMENT GRAMMAR — the vocabulary of forms: what shapes exist in this
   world, their proportions, how they combine, what scale markers we use
6. FORBIDDEN LIST — explicit. Every thing an agent must never add. Be aggressive
   here; this section prevents more drift than all the others combined.
7. SHADER TARGET CARD — the 3-4 three.js post-processing passes needed to match
   the reference, named, with the parameter each one needs tuned and a starting
   value. Include fallbacks for low-end devices.

Write it so that every rule is testable by looking at a screenshot.
```

---

# §P3 — ENGINE SKELETON

### P3.1 — Scaffold

**PASTE INTO CLAUDE CODE (BUILDER)**
```
Scaffold the game engine. Read 00-start-here/AGENT-BRIEF.md and STYLE-BIBLE.md first
and follow them exactly.

STACK (locked, exact versions, do not substitute or add a caret):
  three 0.187.0  ·  @dimforge/rapier3d-compat 0.21.0  ·  vite 8  ·  typescript 7  ·  ajv 8
  No React, no game framework, no state library. Plain TS modules.
  three.js is pinned EXACTLY because `postprocessing` supports three >=0.168.0 <0.188.0 —
  one minor release away. If you think you need to change it, stop and tell me instead.
  Commit the lockfile.

CREATE:

src/engine/
  loop.ts        Fixed timestep: physics at 60Hz with an accumulator, render decoupled.
                 Expose onFixedUpdate(dt) and onRender(alpha) for interpolation.
                 Cap accumulator to avoid spiral of death.
  renderer.ts    WebGLRenderer, ACESFilmic, sRGB output, resize handling,
                 context-loss handler, device pixel ratio capped at 2.
  physics.ts     Rapier world init, fixed step tied to loop, collider helpers
                 (trimesh / box / capsule), CCD enabled for the player body.
                 KinematicCharacterController with enableAutostep(0.5, 0.2, true),
                 enableSnapToGround(0.5), setMaxSlopeClimbAngle(50deg).
                 These values are verified working and MUST match the MOVE budget table
                 in tools/lint-level.mjs — the linter's `ground` slope limit is derived
                 from maxSlopeClimbAngle. Change one, change both.
  state.ts       GAME STATE MACHINE: boot -> menu -> loading -> play -> pause -> death
                 -> results -> menu. Every system QUERIES this; no system keeps its own
                 "am I paused?" flag. Build it now — retrofitting means auditing every
                 system for pause behaviour and pause bugs surface late, under deadline.
  input.ts       CRITICAL: an input layer whose per-frame state is serialisable.
                 interface InputFrame { x:number; y:number; jump:boolean;
                 dash:boolean; attack:boolean; }
                 Provide record() → InputFrame[] and playback(frames) → deterministic
                 replay. Keyboard + gamepad now, touch stubbed.
  camera.ts      Third-person spring arm: target offset, damping, collision pushback
                 via raycast, velocity look-ahead, pitch clamp, no gimbal flip.
  debug.ts       Overlay toggled with `~`: fps, PER-SYSTEM frame times (gameplay,
                 physics, animation, render, audio — budgets 2/2/2/8/0.6 ms), draw calls,
                 triangles, texture MB, player pos/vel, collider wireframes.
  tools.ts       Dev tools, all behind the debug key. Build these BEFORE feel-tuning —
                 they turn each iteration from a minute into five seconds:
                   free camera (detach, fly anywhere)
                   frame stepping (advance one physics tick)
                   teleport to cursor
                   level hot-reload (edit JSON, see it, no restart)
                   runtime TUNING editor (set any constant live, print the good ones)

src/entities/player.ts
  Capsule rigidbody + kinematic character controller. States:
  idle, run, sprint, jump, double_jump, fall, wall_slide, wall_jump, ledge_grab,
  ledge_climb, dash, land, land_hard.
  Implement: coyote time, jump buffering, variable jump height (release = cut),
  air control factor, ledge detection raycasts, wall detection raycasts.
  Read ALL tuning constants from a single exported TUNING object — one place,
  commented, with the values from SPEC.md.

src/loaders/level.ts
  Loads levels/<id>.json validated against levels/level.schema.json (use ajv).
  Build the scene graph, instantiate colliders, wire interactables, place spawn.
  Fail loudly with a readable error on schema violation — never silently skip.

levels/level.schema.json
  USE THE SHIPPED FILE — it is already written and tested (8/9 structural attacks caught).
  Do not author a new schema. critical_path is REQUIRED and its waypoints after spawn are
  MOVE-ANNOTATED: { "pos":[x,y,z], "via":"ground|jump|double|dash|dashjump|wall|climb|platform" }
  Bare position arrays are the v1 format and are defective — a 41-unit gap is nonsense as a
  jump and normal as a run, and neither the linter nor the bot can tell which was meant.

levels/00-gym.json
  A greybox test level using only primitive placeholder assets:
  - flat spawn plane
  - a row of gaps at 2, 3, 4, 5, 6 units (find the max jumpable distance)
  - a wall to wall-run and wall-jump
  - a ledge to grab and climb
  - a moving platform (pingpong, 3s)
  - a fall hazard pit
  - a goal pad
  critical_path traverses every one of them in order, every waypoint after spawn
  declaring its "via". See tools/example-level.json for the exact shape.

index.html + src/main.ts  — boot, load gym level, start loop.

Scripts: dev, build, preview, typecheck, lint,
  "lint:levels": "node tools/lint-level.mjs levels/00-gym.json assets/dist/manifest.json"
Wire lint-level.mjs into a pre-commit hook. It is already written and verified (14/14
semantic defect classes caught) — use it, do not rewrite it.

CONSTRAINTS:
- No `any`. Strict TS.
- Every magic number lives in TUNING or the level JSON. None inline.
- Comment the WHY on anything physics-related, not the what.

When done: run typecheck, build and lint:levels; report all three. Then tell me the
measured max gap for a single jump and a double jump, and write those numbers into BOTH
SPEC.md and the MOVE table in tools/lint-level.mjs. Those two must never disagree.
```

### P3.2 — The feel tuning session

**PASTE INTO CLAUDE CODE (BUILDER)** *(after you have played the gym)*
```
Feel-tuning pass. I played the gym. Here is what's wrong:

<DESCRIBE IN PLAIN LANGUAGE — e.g.
 "jumps feel floaty at the top"
 "I keep missing the ledge grab by a frame"
 "stopping takes too long, it feels like ice"
 "the camera swings too hard when I turn">

Translate each of these into specific TUNING constant changes. For each change:
1. Name the constant and the old → new value
2. Explain in one line WHY that constant causes that feeling
3. Note the side effect of the change

Apply them, then give me a fresh build. Do not change anything I did not complain
about — feel tuning is a one-variable-at-a-time discipline.

Afterwards, write the final values back into 00-start-here/SPEC.md under
"Tuning Constants" with a dated note.
```

---

# §P4 — ASSET PIPELINE

### P4.1 — Kit definition

**PASTE INTO CLAUDE CHAT (REVIEWER)** *(attach hero frames)*
```
Define the asset kit for this game from these reference frames.

I want 12-20 REUSABLE pieces that the entire game can be built from — a kit, not
bespoke models. Think of it the way a model railway set is designed: a small number
of parts that combine into endless layouts.

For each asset give me:
  - name (snake_case, this becomes the filename and the schema key)
  - what it is, in one line
  - approximate dimensions in world units (1 unit = 1 metre; the player is 1.8)
  - collider type (trimesh / box / none)
  - how it tiles or combines with the others
  - triangle budget

Then show me three example level silhouettes built only from this kit, described in
words, to prove the kit has enough range.

Flag anything in the reference frames that the kit cannot build — I want to know what
we are giving up.
```

### P4.2 — Blender asset scripts

**PASTE INTO CLAUDE CODE (BUILDER)**
```
Build the asset pipeline. Reproducibility is the hard requirement: `npm run assets`
must regenerate every binary in assets/dist/ from scratch on a clean checkout.

CREATE tools/blender/<asset_name>.py for each asset in the kit, following
00-start-here/KIT.md and STYLE-BIBLE.md.

TWO RULES, both verified the hard way — do not deviate:
  - DO NOT bake Array modifiers on export (export_apply=False). Applying them turns 1MB
    into tens of MB. Pieces that repeat (stair treads, fence posts, railings) export as
    ONE unit and repeat at runtime with InstancedMesh. Verified: 2000 instanced boxes
    render in 2 draw calls.
  - DO NOT use Blender's Draco exporter. Export uncompressed, then run gltf-transform as
    a separate inspectable stage. Draco is last and irreversible.
  - Asset names are lower_snake_case. glTF rewrites spaces and strips dots.

Each script:
  - runs headless: blender --background --python tools/blender/<name>.py
  - builds geometry PROCEDURALLY where possible so parameters stay editable
  - triangulates, checks the triangle budget and FAILS if over
  - generates a second low-poly collision mesh named <name>_collider where the visual
    mesh is over 2k tris
  - exports UNCOMPRESSED GLB to assets/src/<name>.glb
  - prints a one-line report: name, tris, file size

CREATE tools/build_assets.mjs
  - runs every blender script in sequence (parallel where safe)
  - then gltf-transform, in this order: resize -> ktx2 -> draco (draco LAST)
  - converts textures to KTX2 via toktx/basisu
  - writes assets/dist/manifest.json: every asset, its tris, bytes, collider type,
    bounding box — this manifest is what level-building agents read to know what
    exists
  - FAILS the build if total assets/dist/ exceeds the budget

Add `npm run assets`.

Also create .gitattributes putting assets/dist/** behind Git LFS. Binaries do not merge
and a repo carrying every version of every .glb gets slow and stays slow.

Then run it and give me the manifest plus total size against the 60MB all-levels budget.
Then prove reproducibility: rm -rf assets/dist && npm run assets, and confirm identical
output from a clean state.
```

### P4.3 — Texture plates

**PASTE INTO GPT IMAGE**
```
Generate a seamless tileable texture plate for a 3D game asset.

Subject: <ASSET SURFACE — e.g. weathered grey granite cliff face with horizontal
strata and lichen patches>

Style: must match this reference exactly — <ATTACH 2 HERO FRAMES>. Traditional ink
wash painting treatment, visible brush texture, no photorealism.

Palette: restricted to these values only — <PASTE 4-5 HEX FROM palette.json>

Requirements:
- Perfectly seamless tiling on all four edges
- Flat, even lighting — no baked shadows, no directional light, no highlights
- No recognisable repeating landmarks or features that will reveal the tile
- 2048x2048, top-down orthographic view of the surface

Output the texture only, filling the full frame, no border, no presentation mockup.
```

### P4.4 — Post-processing stack

**PASTE INTO CLAUDE CODE (BUILDER)**
```
Implement the post-processing stack from STYLE-BIBLE.md §7 (Shader Target Card).

Use three.js EffectComposer. Build each pass as a separate module in
src/engine/post/ with its parameters exposed in a single POST_TUNING object.

Required passes (adapt to what the Style Bible actually specifies):
1. Depth-based desaturation / value compression — implements the three depth bands
2. Ink-edge outline pass — depth + normal discontinuity detection, ink-black lines,
   thickness scaling with distance so far geometry does not get noisy
3. Paper grain overlay — a static texture, screen-space, low opacity, with slight
   scroll disabled (static reads as paper; moving reads as film grain and is wrong)
4. Subtle vignette + paper warp at the edges

QUALITY TIERS: implement LOW / MED / HIGH, auto-detected from a one-second frame-time
probe on first load. LOW drops the outline pass and halves the composer resolution.
Expose a manual override in settings.

Then: screenshot the gym level with the stack on and off, put them side by side,
and tell me which Style Bible rules are now satisfied and which are not.
```

---

# §P5 — THE CHARACTER

### P5.1 — Character turnaround sheet

**PASTE INTO GPT IMAGE** *(attach the best character frame from the seed video)*
```
Create a character model sheet from this reference figure.

Output ONE image containing four orthographic views in a horizontal row, evenly
spaced, all the same scale, all feet on the same ground line:
FRONT view | LEFT SIDE view | BACK view | THREE-QUARTER view

Pose: A-pose — arms down and out at roughly 45 degrees, legs shoulder-width apart,
straight, symmetrical. No dynamic posing, no perspective, no foreshortening.

Background: flat neutral mid-grey (#808080), completely empty, no shadow, no ground
plane, no decoration.

Lighting: flat and even from the front. No cast shadows, no dramatic lighting, no
rim light. Every surface must be clearly readable.

The character must be IDENTICAL across all four views — same proportions, same
clothing details, same props in the same positions, same colours.

Preserve exactly from the reference: <LIST THE SIGNATURE ELEMENTS — e.g. the wide
conical straw hat, the layered dark blue-grey robe with frayed hem, the red-brown
sash, the gourd at the left hip, the sword across the back, the wrapped lower legs
and sandals>.

Render as a clean 3D-model-reference illustration — slightly more solid and
dimensional than the painterly reference, because this will be used to build a
3D model. Keep the colours and the design, lose the brush texture.
```

### P5.2 — Tripo conversion

**PASTE INTO TRIPO** *(upload the 4-view sheet)*
```
Humanoid character, A-pose, from a four-view orthographic model sheet.
Priority: clean topology and accurate silhouette over surface detail.
Keep the hat as separate geometry from the head.
Keep loose clothing (robe, sash, cloth wrap) as separate surfaces where possible —
these will be driven by secondary motion.
Target: game-ready, under 25k triangles before decimation.
```

### P5.3 — Rig, animate, wire

**PASTE INTO CLAUDE CODE (BUILDER)**
```
Process the character from Tripo into a game-ready animated asset.

INPUT: assets/src/character/raw_tripo.glb

Tripo now does mesh + Smart Mesh retopology + AUTO-RIGGING (it detects the skeleton and
computes skin weights) and exposes an API, so drive it by script rather than by hand.
Blender handles only what Tripo cannot: jiggle bones, foot-IK targets, and export.
Fallbacks: Meshy when the animation library is the bottleneck, Rodin when detail is.

PIPELINE (script it in tools/blender/character.py — reproducible, like every other
asset):
1. If Tripo's retopology left it over 15k triangles, decimate. Bake a normal map from
   the dense mesh so we keep the detail.
2. Separate meshes: body, hat, robe_lower, sash — we need these as distinct objects
   for secondary motion.
3. Rig with a standard humanoid skeleton (Rigify or a Mixamo-compatible bone naming
   scheme — compatibility matters more than elegance, we want library animations).
4. Add jiggle bones: 3 for the robe hem, 2 for the sash tails, 1 for the hat brim.
   Bone-driven spring physics ONLY. Do NOT use cloth simulation — it will not fit
   the frame budget at this silhouette size.
5. Weight paint, test deformation at extreme poses, fix candy-wrapper twisting at
   shoulders and hips.
6. Export assets/dist/character.glb with all animations embedded.

ANIMATION SET (minimum, all looping cleanly where applicable):
idle, walk, run, sprint, jump_start, jump_apex, fall, land, land_hard,
wall_slide, wall_jump, ledge_grab, ledge_climb, dash, strike_1, strike_2,
hit_react, death

Source from Mixamo where a good match exists and retarget; author by hand only
where nothing fits.

THEN in src/entities/player.ts:
- Wire an animation state machine to the existing movement state machine
- Blend times per transition (fast on jump_start ~0.05s, slow on idle↔walk ~0.2s)
- Root motion OFF — physics drives position, animation is cosmetic only
- Foot IK raycast so feet plant on uneven ground

VERIFY before you report done:
- Silhouette test: render at 64px tall against the sky, is it identifiable?
- Transition test: cycle every state transition, assert no T-pose frame, no NaN
  bone transform, foot slide under 8cm
- Draw calls for the character ≤ 3
Report all three results with numbers.
```

---

# §P6 — THE TEST HARNESS

### P6.1 — The harness (the single most important prompt in this pack)

**PASTE INTO CLAUDE CODE (BUILDER)**
```
Build the automated playtest harness. This is the system that lets us trust
agent-built levels, so build it properly — it is infrastructure, not a script.

CREATE tools/harness/ using Playwright + Chromium.

CRITICAL ENVIRONMENT FACTS — verified, do not rediscover them:
  - Serve over HTTP (vite preview), NEVER file:// — ES modules are CORS-blocked there.
  - three.js r187 ships a split build (three.module.js imports ./three.core.js) and
    three/examples/jsm/* uses bare specifiers. Vite handles both; hand-copying does not.
  - Headless Chromium renders on SwiftShader. FRAME TIME MEASURED THERE IS MEANINGLESS.
    Do NOT assert on frame time in CI. renderer.info counters ARE valid — assert those.
  - Pin launch args: ['--enable-unsafe-swiftshader','--use-gl=swiftshader',
    '--disable-background-timer-throttling','--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows']

The game must expose a test API on window when ?harness=1 is present:
  window.__GAME__ = {
    loadLevel(id), getState(), setInput(frame), stepFrames(n),
    getPlayerPos(), getPlayerVel(), getMetrics(), getConsoleErrors(),
    teleport(pos), startRecording(), stopRecording()
  }
Guard it so it never ships in a normal build — and prove it by grepping the production
bundle.

?harness=1 ALSO forces DETERMINISTIC RENDER MODE: fixed simulated clock, animation driven
by frame index not wall time, any noise or grain seeded from a constant, particles off.
Without this, golden-image comparison is worthless — the post stack's grain alone alters
100% of pixels between runs.

ZERO. tools/harness/preflight.ts — RUNS FIRST, EVERY TIME:
   start vite preview and wait for ready; launch chromium with the pinned args above;
   assert a webgl2 context exists and log the unmasked renderer string in every report.
   If no context: exit with HARNESS_ENVIRONMENT_FAILURE, a DISTINCT failure class.
   Never report it as a level failure — the two look identical and cost a day to tell apart.

FIVE TEST MODES:

1. NAVIGATION BOT  (tools/harness/nav.ts)
   Reads critical_path and uses each waypoint's "via" to choose the input — it does NOT
   infer intent from geometry:
     ground   -> hold movement toward the target
     jump     -> movement + single jump at the right distance
     double   -> movement + jump + second jump near apex
     dash     -> dash toward target
     dashjump -> dash then jump
     platform -> move onto the named platform, wait to be carried, step off
     wall/climb -> movement into the surface + jump
   Public input API only. No teleporting.
   ASSERTS: goal reached within par_time × 3; never falls below bounds.min.y;
   every waypoint reached in order.

2. REPLAY RUNNER  (tools/harness/replay.ts)
   Loads an InputFrame[] trace from tools/replays/ and plays it back.
   ASSERT ON OUTCOME WITHIN TOLERANCE, not exact position: goal reached, checkpoints hit
   in order, position within 0.5 units, frame count within 5%. Rapier is deterministic
   in-process (verified to 9 decimal places) but makes NO cross-machine guarantee —
   exact-match assertions are permitted only on a pinned runner image. A regression suite
   that cries wolf is one nobody reads.
   This is the regression suite. Every bug fix adds a trace here.

3. CHAOS BOT  (tools/harness/chaos.ts)
   60 seconds of seeded random input (seed logged so failures reproduce).
   ASSERTS: never leaves world bounds; never stuck (position variance over any
   10s window above threshold); zero console errors; |velocity| never exceeds the
   terminal-velocity cap × 2 (catches physics explosions); no NaN in any transform.

4. COUNTER PROBE  (tools/harness/counters.ts)  — Tier-1 budgets ONLY
   ASSERTS: draw calls < 300; triangles < 500k; geometries < 400; textures < 120;
   zero console errors. These are CPU-side counters and valid regardless of renderer.
   NO FRAME-TIME ASSERTION. Frame time belongs to the Tier-2 hardware job below.

5. VISUAL REGRESSION  (tools/harness/visual.ts)
   Screenshots at 6 fixed camera positions defined per level.
   Compares to tools/harness/golden/<level>/ with pixelmatch.
   FAILS over 2% drift. `--update-golden` to accept intentional changes.

6. TIER-2 HARDWARE JOB (separate workflow, self-hosted runner on the Mac Studio, nightly)
   p95 frame time ≤ 16.6ms desktop / 33ms mobile floor; time-to-interactive < 4s;
   GPU memory under real drivers; thermal stability over 10 minutes; input latency < 50ms.
   This job — not CI — is what clears the hardware perf gate.

RUNNER: tools/harness/run.ts
  Order: schema -> lint-level -> preflight -> nav -> replay -> chaos -> counters -> visual
  npm run playtest                      → all levels, all modes
  npm run playtest -- --level=02        → one level
  npm run playtest -- --mode=perf       → one mode
  Emits harness-report.json + a readable console table + screenshots on failure.

CI: GitHub Actions workflow running the full suite on every PR. Levels do not
merge without green.

FINALLY — PROVE IT WORKS:
Deliberately delete one platform from levels/00-gym.json, run the harness, and
show me the failure output. Then restore it and show me green. I will not accept
this phase until I see the failure.
```

### P6.3 — The level viewer **[new in v2.1]**

**PASTE INTO CLAUDE CODE**
```
Build tools/viewer/ — a level viewer, NOT an editor.

A studio would build an editor here. That is correct for human level designers and wrong
for ours: our level authors are agents, and they cannot use a visual editor. JSON plus the
schema plus the linter already gives an agent the feedback an editor gives a human. What
*I* need is a way to review an agent's level in ten seconds instead of playing it for five
minutes.

BUILD (a route in the dev server, not part of the shipped game):
  - load any level by id; free-fly camera with WASD + mouse, shift to boost
  - critical_path drawn as a coloured polyline, each segment labelled with its "via",
    colour-coded by move type, with the segment's distance and rise shown
  - checkpoints, hazards, enemy positions and aggro radii, platform paths and level
    bounds all drawn as wireframes
  - click any entity to see its JSON
  - scrub the nav bot along the critical path with a timeline slider, frame by frame
  - jump the camera to any waypoint
  - a side panel: level stats (placements, triangles, draw calls, JSON size, par_time)
    and the linter's current warnings for this level

Keep it ugly. It is a tool, not a product. It must never ship in a production build.
```

---

### P6.2 — Cold verification

**PASTE INTO CODEX (VERIFIER)**
```
You are the VERIFIER lane. You did not write this code and you must not trust the
build agent's report.

Repo: ~/Code/<PROJECT>  Branch: <BRANCH>

Do this, in order, and report findings only — do not fix anything:

1. Clean clone into a fresh directory. npm ci. npm run assets. npm run build.
   Does it build from nothing? Record every warning.
2. Run npm run playtest in full. Record pass/fail per level per mode with numbers,
   not adjectives.
3. Read the diff for this branch cold. Flag:
   - anything outside the lane's permitted paths
   - any magic number not in TUNING or level JSON
   - any `any`, any @ts-ignore, any silently swallowed error
   - any new entity type added to a level file (that is a hard violation)
   - any asset referenced that is not in assets/dist/manifest.json
4. Check the budgets in playbook §4 against the actual measured values.
5. Try to break it: load a malformed level JSON, kill the network mid-asset-load,
   resize the window to 320px wide, lose the WebGL context (there is a devtools
   extension for this). Report what happens.

Output a verdict table: PASS / FAIL / CONCERN per item, with evidence. End with a
single recommendation: CLEAR GATE / DO NOT CLEAR, and the reason in one line.
```

---

# §P7 — CONCEPT FACTORY

### P7.1 — Scene briefs

**PASTE INTO CLAUDE CHAT (REVIEWER)**
```
Write scene briefs for every remaining level from the chapter list in SPEC.md.

One paragraph each, covering:
  - Location and what makes it visually distinct from every other level
  - Vertical shape (does the player climb, descend, traverse flat, spiral?)
  - The landmark the player can see from the start that tells them where they are going
  - Hazard theme (what kills you here, and is it new or a remix?)
  - The ONE new idea in this level — a mechanic, a hazard, an enemy placement, or a
    traversal shape we have not used before
  - Mood in three words

Constraints: each level must be buildable from the kit in KIT.md. Flag any brief
that would need a new asset — I want those batched, not discovered one at a time.

Then order the levels into a difficulty and visual-variety curve, and tell me where
the curve has a problem.
```

### P7.2 — Concept art generation

**PASTE INTO GPT IMAGE** *(attach 3 hero frames + palette strip; run per level, 8 images)*
```
Generate concept art for a level in an existing game. The attached images define the
art style — match them exactly in medium, palette, line quality and atmosphere.
This is not a new style; it is the same world.

LEVEL: <LEVEL TITLE>
SCENE: <PASTE THE SCENE BRIEF PARAGRAPH>

Composition: wide establishing shot, third-person game camera height (roughly 3
metres above a 1.8m character), showing a traversable route through the space.
Include the player character small in frame for scale — a <SILHOUETTE DESCRIPTION>.

Must include visible: a clear path the player could run along, at least one vertical
element to climb or jump, and the landmark described in the brief.

Palette: restricted to <PASTE HEX VALUES>. The accent colour appears at most once.

Depth: three distinct bands — near forms in heavy ink, mid in grey wash, far in pale
paper-cream, separated by mist.

No text, no UI, no HUD, no logos, no characters other than the single player figure.

Generate 8 variations exploring different compositions and camera angles of this
same space.
```

### P7.3 — Curation and build notes

**PASTE INTO CLAUDE CHAT (REVIEWER)** *(attach the 8 per level)*
```
Curate these 8 concepts for <LEVEL ID> down to 3: one establishing shot, one
mid-traversal shot, one landmark/climax shot.

Then write the build note that the level-building agent will receive:

  - Which kit assets from assets/dist/manifest.json this level needs, and roughly
    how many of each
  - Approximate world dimensions and total vertical rise in units
  - The traversal spine in plain language: start → 4-6 beats → goal
  - Where checkpoints go and why
  - The hazard and enemy placement logic
  - The ONE new idea, stated as a concrete thing to build
  - Any asset this level needs that does NOT exist yet — list these loudly

Finally: put all curated concepts across all levels in front of you and tell me
whether this reads as ONE game. Name any outlier and say whether to regenerate it
or cut the level.
```

---

# §P8 — PARALLEL LEVEL BUILD

### P8.1 — Level agent prompt (one per level, run in parallel)

**PASTE INTO CLAUDE CODE (BUILDER)** *(one session per level — this is the fan-out)*
```
You are building ONE level. You are running in parallel with other agents building
other levels. Lane isolation is absolute.

READ FIRST, in this order:
  00-start-here/AGENT-BRIEF.md
  00-start-here/STYLE-BIBLE.md
  levels/level.schema.json
  assets/dist/manifest.json
  levels/01-<reference>.json        ← the hand-built reference level, match its quality
  reference/concepts/<LEVEL_ID>/    ← your 3 concepts
  docs/build-notes/<LEVEL_ID>.md    ← your build note

YOU MAY WRITE ONLY:
  levels/<LEVEL_ID>.json
  tools/replays/<LEVEL_ID>-*.json
  tools/harness/golden/<LEVEL_ID>/

LAYER RULE — enforced by CODEOWNERS, an import lint and a pre-commit path check, not by
your good intentions. Content depends on gameplay depends on engine. Nothing reaches up.

YOU MAY NOT:
  - touch src/ — if you believe you need engine work, STOP and write a note to
    docs/build-log/<DATE>-<LEVEL_ID>-blocked.md explaining exactly what is missing,
    then report blocked. Do not improvise around it.
  - touch assets/ — if you need an asset that is not in manifest.json, STOP and
    file it the same way. Never invent an asset name.
  - add a new entity `type` to the schema. New types are engine work.
  - read or modify another level file.

BUILD IT:
1. Lay out the traversal spine first — spawn, the 4-6 beats, the goal. Get the
   vertical shape right before adding anything decorative.
2. Place kit geometry to realise the concepts. Reuse and rotate aggressively;
   that is what the kit is for.
3. Place platforms, hazards, interactables, enemies, collectibles, checkpoints.
4. Write critical_path — the ordered waypoints a bot must traverse. This is your level's
   test spec and it is MOVE-ANNOTATED. Every waypoint after spawn declares how the player
   gets there:
     { "pos":[x,y,z], "via":"ground|jump|double|dash|dashjump|wall|climb|platform" }
   via:"platform" also needs "platform":"<that platform's id>".
   The linter checks each segment against that move's distance and rise budget, so an
   honest annotation is the only one that passes. Make it represent the real route.
5. Set par_time from your own playtesting, and difficulty 1-5.

VERIFY BEFORE REPORTING DONE — all of these, with numbers:
  npm run lint:levels                      (schema + semantic linter, must be clean)
  npm run playtest -- --level=<LEVEL_ID>
  All five modes green. Perf within budget. Zero console errors.
  Record one clean human-style replay trace into tools/replays/.
  Capture the 6 golden screenshots.

REPORT: level id, world dimensions, vertical rise, asset counts, par_time, bot completion
time, draw calls, triangles, JSON size, and a one-line self-assessment of how well it
matches the concepts. Do NOT report frame time — CI renders on a software rasteriser and
that number is meaningless.
```

### P8.2 — Fan-out orchestration

**PASTE INTO CLAUDE CHAT (REVIEWER)**
```
I am about to fan out <N> level-building agents in parallel. Before I do, run the
pre-flight:

1. Confirm the asset sprint is complete — every asset flagged across all build
   notes exists in assets/dist/manifest.json. List any that do not.
2. Confirm the engine is frozen — no uncommitted src/ changes, Gate C logged in
   GATES.md.
3. Confirm the harness is green on the reference level.
4. Confirm the layer rule is enforced MECHANICALLY, not by instruction:
     - CODEOWNERS on src/engine/ and src/systems/
     - pre-commit path check: a level agent may touch only its own level, replays, goldens
     - import lint: nothing in src/engine/** may import from src/entities/** or levels/**
   If any is missing, give me the config to add now. This is the blast wall that makes
   parallel agents safe; without it the fan-out is not safe to run.
5. Give me the per-agent launch checklist: which level, which concepts, which build
   note, which session.

Then tell me the order to launch them in — hardest first or easiest first — and why.
```

---

# §P9 — SYSTEMS

### P9.1 — Enemies and combat

**PASTE INTO CLAUDE CODE (BUILDER)**
```
Implement enemies and combat. Keep it shallow and readable — depth requires tuning
time we do not have, and a shallow system that feels good beats a deep one that
does not.

ENEMY TYPES (src/entities/enemies/), each with ONE verb:
  - charger   : patrols, sees player, closes distance, telegraphed lunge, recovers
  - ranged    : stationary, telegraphed projectile on a fixed cadence, no leading
  - blocker   : guards a choke point, must be struck from behind or dashed through
  - patroller : fixed route, damages on contact, never pursues

Each: state machine (idle → alert → attack → recover → stagger → dead), an aggro
radius read from the level JSON, hp, and a clear telegraph animation. The telegraph
is the whole design — a player must be able to react to every attack.

COMBAT (src/systems/combat.ts):
  - two-hit combo, second hit only within a 0.6s window
  - parry window: 0.15s at the start of block
  - i-frames during dash
  - hitstop: 60ms freeze on a connecting hit (this single effect does more for game
    feel than anything else in this phase)
  - knockback, screen shake (respecting the reduced-motion setting)
  - player has 3 hp, hearts in the HUD, no regeneration — checkpoints heal

All constants in a single COMBAT_TUNING object.

Then run the harness across all levels — enemy placement will break critical paths
that were authored without them. Report which levels now fail and why.
```

### P9.2 — Progression and save

**PASTE INTO CLAUDE CODE (BUILDER)**
```
Implement progression.

  - Chapter select screen, styled per STYLE-BIBLE. Locked chapters shown but not
    enterable. Completed chapters show scrolls found / total.
  - Collectibles: scrolls per level, counted, persisted.
  - Save to localStorage. WRAP EVERY READ AND WRITE IN TRY/CATCH — localStorage
    throws in several embedded and private-browsing contexts and an unhandled
    throw here takes down the whole game. Fall back to in-memory silently.
  - Save shape: { version, chaptersCompleted[], scrollsFound[], settings, totalTime }
  - Version the save and handle migration from an older version by resetting rather
    than crashing.
  - Death → respawn at last checkpoint in UNDER 1.2 SECONDS including the transition.
    Measure it and tell me the number. Slow respawn is the single biggest reason
    players quit a platformer.
  - Settings: master/sfx/music volume, quality tier override, reduced motion,
    key remapping.

Then: difficulty pass. Run the nav bot across every level, compare completion time
to par_time. Any level where the bot takes over 2× par is mistuned — list them with
the ratio and your diagnosis.
```

---

# §P10 — AUDIO

### P10.1 — SFX

**PASTE INTO ELEVENLABS** *(sound effects — one generation per line)*
```
Footstep on cut stone, single step, dry, slight grit, close-mic, no reverb, 0.3s
Footstep on gravel path, single step, loose small stones, close-mic, 0.3s
Footstep on wooden plank, single step, slight creak, hollow, 0.3s
Cloth and leather movement, a robed figure shifting weight, soft, 0.4s
Jump exertion, light fabric rustle and a soft breath, no voice, 0.3s
Landing on stone from a short fall, soft impact, cloth settle, 0.5s
Heavy landing on stone from height, deep impact, dust, slight grunt, 0.8s
Quick dash, sharp fabric whoosh, air movement, 0.4s
Katana unsheathing, metallic slide, bright, short, 0.6s
Sword cutting air, fast whoosh, 0.3s
Sword striking wood, sharp percussive impact, 0.4s
Large bronze temple bell struck once, deep fundamental, long natural decay, 8s
Heavy stone gate grinding open, low rumble, stone on stone, 3s
Paper scroll being picked up, soft parchment rustle, 0.5s
Low resonant chime, single tone, warm, checkpoint marker, 2s
```
*Generate 4 variations of every footstep. Randomise playback pitch ±8% in-engine or
it will sound like a machine gun.*

### P10.2 — Ambience

**PASTE INTO ELEVENLABS**
```
High-altitude wind across bare rock, continuous, no gusts, seamless loop, 60s
Interior of an empty stone temple, deep quiet room tone, faint distant drip, 60s
Low mist and distant valley wind, very soft, almost silent, seamless loop, 60s
```

### P10.3 — Score

**PASTE INTO UDIO**
```
MAIN THEME
Sparse traditional Japanese instrumentation — shakuhachi flute, koto, a single taiko
struck rarely. Slow, contemplative, melancholy but not sad. Lots of space and silence
between phrases. Minimal percussion. No Western harmony, no strings section, no
build to a climax. Should loop without the listener noticing. 2-3 minutes.

TENSION VARIANT
Same instrumentation, same key. Add a low sustained drone and sparse irregular taiko.
Tension without aggression. No melody — atmosphere only. 90 seconds, loopable.

SUMMIT / CREDITS
Same palette, resolving. The main theme's motif stated once, fully, with the koto
leading. Quiet, earned, final. Does not need to loop. 2 minutes.
```

### P10.4 — Audio integration

**PASTE INTO CLAUDE CODE (BUILDER)**
```
Implement the audio system.

  src/engine/audio.ts
  - Web Audio API via three.js Audio/PositionalAudio where 3D positioning helps
    (bells, gates, enemies), plain 2D for UI and footsteps
  - Buses: master → { sfx, music, ambience }, each with a gain node and a settings slider
  - Footstep system: surface detected from the collider's material tag, 4 variations
    per surface, random selection with no immediate repeat, pitch randomised ±8%,
    triggered from animation events not from a timer
  - Music: crossfade between main and tension based on an "alert" flag from the
    combat system, 2s fade
  - Ambience: crossfade by level zone, defined in the level JSON lighting block
  - Mute on tab blur (visibilitychange), resume on focus
  - Lazy-load audio — it must not block first paint
  - AudioContext must be created on first user gesture or Safari silently refuses

LOOP POINTS: generated music almost never loops cleanly. For each track, find the
true loop point and author it explicitly rather than relying on file length. A bad
loop point is the most noticeable flaw in the entire build.

Then run the counter probe with audio active (zero console errors, counters within Tier-1
budget), and run the Tier-2 hardware job on the Mac Studio runner to confirm audio causes
no main-thread frame spikes. Do NOT assert frame time in CI — SwiftShader makes it
meaningless.
```

---

# §P11 — HARDENING

### P11.1 — Release QA

**PASTE INTO CLAUDE CODE (BUILDER)**
```
Release hardening pass.

BROWSERS: Chrome, Firefox, Safari desktop, Safari iOS. Safari will break something
WebGL- or AudioContext-related; find it before a user does. Report each browser's
specific failures.

MOBILE: either a proper touch control scheme (virtual stick left, jump + dash/attack
right, both with generous touch targets and visual feedback) or an honest gate screen
saying desktop only. Half-working touch is worse than none — make the call and tell
me which you chose and why.

LOADING: chapter assets lazy-loaded, not all upfront. Loading screen is ART from the
reference set, not a spinner. Show real progress. Time-to-interactive under 4s on
a cold cable connection — measure it.

FIRST 30 SECONDS: the opening of level 01 must teach movement with ZERO text.
Geometry that forces, in order: a walk, a jump, a double-jump, a wall-run. If a new
player needs to be told anything, the level is wrong, not the player.

RESILIENCE:
  - WebGL context loss → handler that restores or shows a clean message
  - Malformed save → reset silently, never crash
  - Asset load failure → retry twice, then a readable error, never a white screen
  - Unsupported browser → a styled fallback page, not a stack trace

ACCESSIBILITY: remappable keys, reduced-motion toggle that kills camera shake and
screen warp, colourblind check on the accent colour (it is our only colour signal —
confirm it is also distinguishable by value), no required audio cues.

Then run Lighthouse and the full harness against the PRODUCTION build and give me
both reports.
```

---

# §P12 — SHIP & CASE STUDY

### P12.1 — Deploy

**PASTE INTO CLAUDE CODE (BUILDER)**
```
Ship it.

  - vercel.json: static build, correct cache headers (immutable long cache on hashed
    assets, no-cache on index.html), gzip/brotli on .glb and .json
  - Verify the harness test API is stripped from the production bundle — grep the
    output and prove it
  - OG image + meta tags using the best hero still, Twitter card, favicon
  - Deploy to production, custom domain
  - Run the full harness against the live production URL, not a local build
  - Report: production URL, bundle sizes per chunk, time-to-interactive, harness
    results, Lighthouse scores
```

### P12.2 — Demo capture

**PASTE INTO CLAUDE CHAT (REVIEWER)**
```
Plan the demo capture. Two distinct kinds of footage, used for opposite purposes:

HERO FOOTAGE — human-played. Agent-played footage looks stiff and audiences notice
immediately. Plan: which levels, which moments, what route, how many takes, what to
avoid showing.

HARNESS FOOTAGE — bot-played, deliberately. Used in the "how we tested it" section
where mechanical movement is the point and reads as rigour rather than as a flaw.

Give me a shot list:
  - 60 second hero cut: beat by beat, with timecodes
  - 15 second social loop: the single most arresting 15 seconds in the game
  - 6 still frames: exact level, camera position, and what each one proves
  - 1 terminal recording: the harness catching a real bug ← lead with this for
    a technical audience
  - 1 screen recording: N agent sessions running in parallel

For each, tell me what it proves to the viewer and where it goes in the write-up.
```

### P12.3 — Case study

**PASTE INTO CLAUDE CHAT (REVIEWER)**
```
Write docs/CASE-STUDY.md from everything in this repo.

Audience: technical operators and founders evaluating whether multi-agent builds
produce real work. They are sceptical and they have seen a dozen "AI made a game"
posts this month.

The angle is NOT "AI built a game." It is: "here is the program that made it safe
to let agents build it, and here is the evidence it caught their mistakes."

Structure:
  1. The result, immediately — playable link, hero video, the numbers
  2. The one-video thesis: why a generated clip is a better spec than a document
  3. The architecture decision that made parallelism possible (levels as data)
  4. The harness — lead with the terminal recording of it catching a real bug
  5. The gates: what each one caught, including anything it caught of mine
  6. Honest numbers: elapsed time, API spend, agent-hours, lines of engine code
     vs lines of level data, number of harness failures before green
  7. What broke, what I'd do differently, what the method cannot do
  8. The method, generalised — where else this applies

Pull real numbers from harness-report.json, the build log and the git history.
Do not round anything in our favour. Do not use the words "seamlessly",
"effortlessly", or "revolutionary". If a section needs a caveat, write the caveat.
```

---

# §PX — STANDING LANE PROMPTS (use throughout)

### PX.1 — Gate clearance request

**PASTE INTO CLAUDE CHAT (REVIEWER)**
```
Gate <X> clearance review.

BUILDER reports: <PASTE REPORT>
VERIFIER reports: <PASTE REPORT>

Give me:
1. Where the two reports disagree, and which one you believe and why
2. Every gate criterion, PASS / FAIL / CONCERN with evidence
3. Anything neither lane checked that should have been checked
4. Your recommendation: CLEAR / CLEAR WITH CONDITIONS / DO NOT CLEAR
5. If conditions: the exact list, each one testable

Then write the GATES.md entry for me to sign.
```

### PX.2 — Bug triage

**PASTE INTO CLAUDE CHAT (REVIEWER)**
```
Playtest bug report from my session:

<LEVEL> <TIMESTAMP>
What happened: <...>
What I expected: <...>
Reproducible: <yes/no/sometimes>

Triage it: BUG | TUNING | CONTENT | SCOPE-CREEP(reject).
Then give me the fix prompt for the BUILDER lane, scoped to one branch and one
change, including the replay trace that must be added to tools/replays/ so this
never regresses.
```

### PX.3 — Daily build log

**PASTE INTO CLAUDE CODE (BUILDER)** *(end of each session)*
```
Write docs/build-log/<YYYY-MM-DD>-<session>.md:
  - What was built, in plain language
  - Decisions made and what each one foreclosed
  - Numbers: harness results, budgets, bundle size, any budget now at risk
  - What is blocked and on whom
  - What the next session should start with
  - One screenshot or clip worth keeping for the case study

Then append any new tuning constants or schema changes to 00-start-here/SPEC.md, and if
this session crossed a milestone (vertical slice, first playable, alpha, beta, gold) note
it in GATES.md with the refusal it now carries — e.g. after alpha, no new systems.
```

---

*End of prompt pack. Phases, gates and tests are in `AI-GAME-BUILD-PLAYBOOK.md`.*
