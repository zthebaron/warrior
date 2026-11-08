# DAY-0 PROOF SPIKE — EXECUTABLE
### Proofline Game Track (PGT-01) · go/no-go before committing the program

**Four hours. Four checks. Run them in order.** (Aligned to Playbook v2.1.)
Clear all four and the program's mechanical risk is gone — what remains is taste, which is
what Gates B and D are for. Fail any one and you have lost half a day instead of a week.

This spike builds nothing reusable on purpose, except the harness and tools, which survive
into the real build. Everything else is throwaway.

| | Check | Time | Kills which risk |
|---|---|---|---|
| **H1** | Seed video produces buildable geometry | 60 min | The one-video thesis itself |
| **H2** | Engine + schema + linter run together | 90 min | Stack compatibility, the level contract |
| **H3** | Harness catches a deliberate break | 60 min | The entire trust model for agent output |
| **H4** | One asset survives the full pipeline | 30 min | Loading, export and compression failures |

Run **H2 and H1 in parallel** — H1 is mostly waiting on generations.

---

## PRE-FLIGHT — one time, 5 minutes

Rename `game-01` to the real project name once H1 picks a direction.

**PASTE INTO TERMINAL**
```bash
mkdir -p ~/Code/game-01 && cd ~/Code/game-01
git init -b main
mkdir -p 00-start-here reference/seed/frames reference/concepts src/{engine,systems,entities,loaders,ui} \
         levels assets/{src,dist} tools/{blender,harness,replays} docs/build-log

# drop in the pre-verified tools from verified-tools.zip
unzip -o ~/Downloads/verified-tools.zip -d .
mv tools/level.schema.json levels/level.schema.json
ls tools/   # lint-level.mjs  webgl-preflight.mjs  rapier-determinism.mjs  headless-render.mjs  example-level.json

npm init -y
npm i three@0.187.0 @dimforge/rapier3d-compat@0.21.0 ajv@8
npm i -D vite@8 typescript@7 @playwright/test@1.65.0 pixelmatch@8
npx playwright install --with-deps chromium

gh repo create zthebaron/game-01 --private --source=. --remote=origin
git add -A && git commit -m "spike: scaffold + verified tools" && git push -u origin main
```

Sanity check the tools before trusting them:

**PASTE INTO TERMINAL**
```bash
cd ~/Code/game-01
node tools/rapier-determinism.mjs      # expect: DETERMINISM ... PASS
node tools/lint-level.mjs tools/example-level.json tools/manifest.example.json   # expect: LINT PASS
```

---

## H1 — SEED VIDEO · 60 min · *the thesis itself*

### H1.1 — Generate · ⛔ CLOSED — SEED LOCKED (fcf673a)

> **⛔ CLOSED — SEED LOCKED (fcf673a). Do not run this prompt.** The seed is
> `reference/seed/seed.mp4` (Runway sample 4, 12.097 s, LFS). It was locked in commit `fcf673a`,
> and two artifacts derive from it: `reference/palette.json` (k-means k=8 over its 36 frames)
> and `00-start-here/STYLE-BIBLE.md` (from its 6 hero frames). Generating variants now can only
> drift from the visual target or re-open it. Re-opening it invalidates both artifacts. Do that
> only by an explicit, committed decision. The prompt below is kept for the record and has no
> destination. It matches Prompt Pack §P1.1, which is closed the same way.

**⛔ CLOSED — DO NOT PASTE** *(was: PASTE INTO FAL · Flux 3 Max video / Veo / Runway · 6 variants, ~$40)*
```closed-do-not-run
A lone wandering <CHARACTER_ARCHETYPE> walks a narrow stone path along a sheer cliff face,
high above a sea of mist. Third-person camera, behind and slightly above the figure at
shoulder height, following smoothly — no crane moves, no cuts.

Art medium: <MEDIUM — e.g. traditional sumi-e ink wash on aged cream paper, visible brush
texture, heavy black ink for near forms, grey wash for mid-distance, pale paper-cream far>.

Palette: strictly limited — black ink, three greys, aged paper cream, one muted
<ACCENT_COLOUR> accent used sparingly.

Environment: vertical grey cliffs, horizontal cut-stone paths and stairs, twisted pine
silhouettes, a distant <LANDMARK> emerging from the mist.

Character: strong readable silhouette — <SILHOUETTE: e.g. wide conical hat disc, dark
layered robe, staff across the back, gourd at the hip>. Loose fabric moving with the walk.

Lighting: flat overcast, no harsh sun, no specular highlights. Depth by atmospheric fade only.

Mood: quiet, vast, solitary. Slow deliberate pace.

12 seconds. Continuous motion. No text, no UI, no logos, no cuts.
```

### H1.2 — Judge

**PASTE INTO CLAUDE CHAT** *(attach all 6)*
```
Judge these 6 candidate seed videos for a browser 3D action-platformer. Score each 1-5 on
exactly four criteria and nothing else:

1. READABLE SILHOUETTE — identifiable at 5% of screen height?
2. BUILDABLE GEOMETRY — blocky, reconstructable forms that can become collision geometry,
   or impressionistic mush that cannot?
3. PALETTE DISCIPLINE — under 8 dominant hues, consistent across the clip?
4. SHIPPABLE CAMERA — third-person, near-constant height, no impossible moves?

This is a go/no-go gate. Tell me plainly: do at least TWO candidates score 4+ on
BUILDABLE GEOMETRY? If not, say NO-GO and tell me which art direction would score better,
because the problem is the medium, not the prompt.

If GO: name the one to lock and what we give up by not taking the runner-up.
```

> **GO** if ≥2 candidates score 4+ on buildable geometry.
> **NO-GO** means this art direction can't be reconstructed in three.js. Change the art
> direction — harder edges, more architectural forms, less atmospheric wash — and rerun H1.
> The method is fine; the look isn't. This costs one hour, not one week.

---

## H2 — ENGINE + SCHEMA + LINTER · 90 min · *the level contract*

**PASTE INTO CLAUDE CODE**
```
Day-0 proof spike, check H2. Build the minimum that proves the stack and the level contract
work together. This is a spike — no polish, no art, no abstraction you don't need today.

VERSIONS ARE PINNED AND EXACT. Do not change, do not add a caret:
  three 0.187.0  ·  @dimforge/rapier3d-compat 0.21.0  ·  vite 8  ·  typescript 7  ·  ajv 8
three.js is pinned exactly because `postprocessing` supports three >=0.168.0 <0.188.0 — one
minor release away. If you need to touch the three version, stop and tell me instead.

BUILD:

1. src/engine/loop.ts
   Fixed timestep: physics 60Hz with an accumulator, render decoupled, accumulator capped.
   Expose onFixedUpdate(dt) and onRender(alpha).

2. src/engine/input.ts
   InputFrame { x:number; y:number; jump:boolean; dash:boolean; attack:boolean }
   Keyboard now. MUST expose record(): InputFrame[] and playback(frames) for deterministic
   replay. Build this now — retrofitting it later is painful.

3. src/engine/physics.ts
   Rapier world, fixed step tied to the loop. Use KinematicCharacterController with
   enableAutostep(0.5, 0.2, true), enableSnapToGround(0.5), setMaxSlopeClimbAngle(50deg),
   and CCD enabled on the player body. These exact values are already verified working and
   they MUST match the move budgets in tools/lint-level.mjs — the linter's `ground` slope
   limit is derived from maxSlopeClimbAngle. If you change one, change both.

4. src/engine/camera.ts
   Third-person spring arm, damping, raycast collision pushback, pitch clamp.

5. src/engine/state.ts
   GAME STATE MACHINE: boot -> menu -> loading -> play -> pause -> death -> results.
   Every system QUERIES this; no system keeps its own "am I paused?" flag. Build it now;
   retrofitting means auditing every system for pause behaviour.

6. src/entities/player.ts
   Capsule + character controller. States: idle, run, jump, double_jump, fall, dash, land.
   Coyote time ~120ms, jump buffering ~100ms, variable jump height, air control.
   ALL constants in one exported TUNING object with comments. No inline magic numbers.

7. src/loaders/level.ts
   Load levels/<id>.json, validate against levels/level.schema.json with ajv strict.
   On violation: fail loudly with a readable error naming the field. Never skip silently.

8. levels/00-gym.json
   Greybox test level, primitives only. Must contain:
   - flat spawn plane
   - gaps at 2, 3, 4, 5, 6 units so I can find the real max jump distance
   - a staircase (tests the slope rule)
   - a moving platform, pingpong, 3s
   - a fall hazard plane
   - a goal pad
   critical_path MUST use the v2 move-annotated format — every waypoint after spawn declares
   "via": ground | jump | double | dash | dashjump | wall | climb | platform.
   See tools/example-level.json for the shape.

9. Dev tools (behind the debug key) — build these BEFORE I feel-test, they turn each
   iteration from a minute into five seconds: free camera, frame stepping, teleport to
   cursor, level hot-reload, runtime TUNING editor.

10. package.json scripts:
   "dev", "build", "preview", "typecheck",
   "lint:levels": "node tools/lint-level.mjs levels/00-gym.json assets/dist/manifest.json"
   Create a stub assets/dist/manifest.json with an empty assets array for now.

CONSTRAINTS: no `any`, strict TS, every number in TUNING or level JSON.

THEN DO THIS AND REPORT NUMBERS:
  a) npm run typecheck && npm run build — both clean?
  b) npm run lint:levels — gym passes?
  c) Break the gym on purpose: set one critical_path waypoint 40 units from the previous one
     with "via":"jump". Run lint:levels. It MUST fail with UNREACHABLE. Paste the output,
     then restore.
  d) npm run dev, then tell me the maximum gap distance the player can actually clear with
     a single jump and with a double jump — measured, not guessed.
  e) Confirm the state machine exists and that pause actually stops physics and input.

Report a, b, c, d with actual output. Do not report done without (c) failing first.
```

> **GO** if typecheck + build are clean, the gym lints, the deliberate break produces
> `[UNREACHABLE]`, and pause works. Then write the measured jump distances into both `SPEC.md` and the
> `MOVE` table in `tools/lint-level.mjs` — those two must never disagree.

### H2.5 — The feel check (you, 10 minutes, no agent)

Play the gym. Chain six jumps. Ask one question: **does a missed jump feel like my fault?**
If it feels floaty, slippery or unresponsive, say so in plain language and let the agent
translate it into TUNING changes — one variable at a time. Do not move to H3 until the
movement feels good. There is no downstream fix for bad movement.

---

## H3 — HARNESS CATCHES A BREAK · 60 min · *the trust model*

This is the most important check in the spike. If the harness can't catch a real break, the
whole case for letting agents build levels collapses.

**PASTE INTO CLAUDE CODE**
```
Day-0 proof spike, check H3. Build the harness skeleton. Correctness over coverage — one
test mode that genuinely works beats five that half-work.

CRITICAL ENVIRONMENT FACTS — these are verified, do not rediscover them:
  - Serve over HTTP (vite preview), NEVER file:// — ES modules are CORS-blocked on file://
  - three.js r187 ships a split build (three.module.js imports ./three.core.js) and
    three/examples/jsm/* uses bare specifiers. Vite handles both. Hand-copying does not.
  - Headless Chromium renders on SwiftShader. Frame time measured there is MEANINGLESS.
    Do NOT assert on frame time. renderer.info counters ARE valid — assert on those.

BUILD:

1. Test API on window, ONLY when ?harness=1 is present (and stripped from prod builds):
   window.__GAME__ = { loadLevel, getState, setInput, stepFrames, getPlayerPos,
                       getPlayerVel, getMetrics, getConsoleErrors, startRecording,
                       stopRecording }
   ?harness=1 ALSO forces deterministic render mode: fixed simulated clock, animation driven
   by frame index not wall time, any noise seeded from a constant. Without this, golden-image
   comparison is worthless.

2. tools/harness/preflight.ts — runs FIRST, every time:
   - start vite preview, wait for ready
   - launch chromium headless with args:
     ['--enable-unsafe-swiftshader','--use-gl=swiftshader',
      '--disable-background-timer-throttling','--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows']
   - assert a webgl2 context exists; log the unmasked renderer string in every report
   - if no context: exit with HARNESS_ENVIRONMENT_FAILURE, a DISTINCT failure class.
     Never report it as a level failure — those look identical and cost a day to tell apart.

3. tools/harness/nav.ts — the navigation bot:
   Walks critical_path waypoint to waypoint. Uses each waypoint's "via" to pick the input:
     ground   -> hold movement toward the target
     jump     -> movement + single jump at the right distance
     double   -> movement + jump + second jump near apex
     dash     -> dash toward target
     dashjump -> dash then jump
     platform -> move onto the named platform, wait for it to carry you, step off
     wall/climb -> movement into the surface + jump
   It must use ONLY the public input API. No teleporting.
   ASSERTS: goal reached within par_time x3; never below bounds.min.y; waypoints in order.

4. tools/harness/counters.ts — Tier-1 budgets only:
   draw calls < 300, triangles < 500k, geometries < 400, textures < 120, zero console errors.
   NO frame-time assertion.

5. tools/harness/run.ts
   Order: schema -> lint-level -> preflight -> nav -> counters
   Emits harness-report.json plus a readable console table. Screenshot on failure.
   npm run playtest [-- --level=00-gym]

6. .github/workflows/ci.yml — runs npm run lint:levels && npm run playtest on every PR.

THEN PROVE IT — I will not accept this without the failure output:
  a) npm run playtest -- --level=00-gym  → paste the green report
  b) Delete one platform from levels/00-gym.json that the critical_path depends on.
     Run playtest again. Paste the FAILURE output.
  c) Restore it. Run again. Paste the green report.
  d) Temporarily force the preflight to find no WebGL context (fake it) and show me that it
     reports HARNESS_ENVIRONMENT_FAILURE, not a level failure. Then revert.

Report a, b, c, d with real output.
```

> **GO** if the harness is green, goes red on a real break, green again on restore, and
> distinguishes an environment failure from a level failure.
> **NO-GO** means you cannot trust agent-reported "done" and the fan-out must not happen.
> Fix the harness before anything else — it is the load-bearing wall of the whole program.

---

## H4 — ONE ASSET, FULL PIPELINE · 30 min · *the plumbing*

**PASTE INTO CLAUDE CODE**
```
Day-0 proof spike, check H4. Push ONE asset through the entire pipeline unattended. Pick
something trivial — a stone stair run of 12 treads. The asset does not matter; the pipeline does.

TWO RULES, both verified the hard way:
  - Do NOT bake Array modifiers on export. Applying them turns 1MB into tens of MB. Export
    ONE tread and repeat it at runtime with InstancedMesh. (Verified: 2000 instanced boxes
    render in 2 draw calls.)
  - Do NOT use Blender's Draco exporter. Export uncompressed, then run gltf-transform as a
    separate inspectable stage: resize -> ktx2 -> draco. Draco is last and irreversible.
  - Asset names are lower_snake_case. glTF rewrites spaces and strips dots.

BUILD:
1. tools/blender/stair_run_12.py — headless, procedural, exports assets/src/stair_run_12.glb
   uncompressed. Prints name, triangle count, file size. Fails if over its triangle budget.
2. tools/build_assets.mjs — runs every blender script, then gltf-transform
   (resize -> ktx2 -> draco) into assets/dist/, then writes assets/dist/manifest.json with
   every asset's name, triangles, bytes, collider type and bounding box. Fails the build if
   assets/dist/ exceeds budget.
3. npm run assets
4. Reference stair_run_12 in levels/00-gym.json geometry, with the staircase on the
   critical_path as a "via":"ground" segment.

THEN PROVE IT:
  a) rm -rf assets/dist && npm run assets  → regenerates from nothing? paste the report
  b) npm run lint:levels → the asset resolves against the manifest?
  c) npm run playtest -- --level=00-gym → bot still completes, with the stairs in the path?
  d) Show me the harness screenshot with the stairs visibly rendered.
  e) Report: raw GLB size, final compressed size, triangle count, draw calls in scene.

Report a-e with real numbers and the screenshot.
```

> **GO** if a clean-clone asset build reproduces, the manifest resolves, the bot still
> finishes and the stairs are visible in the screenshot.

---

## COLD VERIFICATION — run after H4, 15 min

**PASTE INTO CODEX**
```
You are the VERIFIER lane for a go/no-go spike. You did not write this code. Do not trust
the build agent's report and do not fix anything — report findings only.

Repo: ~/Code/game-01

1. Clone fresh into a new directory. npm ci. npm run assets. npm run build. Does it build
   from nothing? Record every warning.
2. npm run lint:levels && npm run playtest. Record pass/fail with numbers.
3. Verify three is pinned to EXACTLY 0.187.0 in package.json with no caret, and that the
   lockfile is committed.
4. Verify CODEOWNERS exists on src/engine/ and src/systems/, and that nothing in
   src/engine/** imports from src/entities/** or levels/** (the layer rule).
5. Verify the MOVE budget table in tools/lint-level.mjs matches the TUNING constants in
   src/entities/player.ts and the maxSlopeClimbAngle in src/engine/physics.ts. If the linter
   and the physics disagree, that is a FAIL — it means levels can lint clean and still be
   unplayable.
6. Verify window.__GAME__ is absent from a production build. Grep the output and prove it.
7. Read the diff cold. Flag any `any`, any @ts-ignore, any swallowed error, any magic number
   outside TUNING or level JSON.
8. Break it: malformed level JSON, a level referencing a missing asset, a critical_path with
   no "via". Report what happens for each.

Output a verdict table: PASS / FAIL / CONCERN per item with evidence. End with one line:
CLEAR THE SPIKE / DO NOT CLEAR, and the reason.
```

---

## THE GO/NO-GO CALL

```
☐ H1  two or more seed candidates score 4+ on buildable geometry
☐ H2  typecheck + build clean · gym lints · deliberate break fails with UNREACHABLE
☐ H2.5 the movement feels good to you, by hand
☐ H3  harness green → red on a real break → green on restore
☐ H3  environment failure reported distinctly from level failure
☐ H4  clean-clone asset build reproduces · bot completes · stairs visible
☐ CV  Codex clears it cold, including the linter/physics agreement check
```

**All seven → commit the program.** Start Phase 0 (`/grill-me` → SPEC.md) the same day.
The mechanical risk is gone; what remains is taste, and Gates B and D are where taste gets
settled — both before the expensive fan-out.

**Any one fails → stop and fix that one thing.** Do not proceed on three out of four. Each
of these exists because it catches a failure that is cheap now and expensive in week two.

---

*Companion files: `AI-GAME-BUILD-PLAYBOOK-v2.1.md` (the program), `AI-GAME-BUILD-PROMPT-PACK.md`
(all phases), `BLUEPRINT-VERIFICATION-REPORT.md` (why these checks exist).*
