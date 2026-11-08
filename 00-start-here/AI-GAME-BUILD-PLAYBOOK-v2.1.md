# AI GAME BUILD PLAYBOOK — v2.1 (VERIFIED + PRO PRACTICE)
### Proofline Program — Game Track (PGT-01)

Version 2.1 · 2026-11-07 · Supersedes v1.0 and v2.0
**Status: mechanically verified, then checked against professional game-development practice.**
All ten corrections from `BLUEPRINT-VERIFICATION-REPORT.md` are applied (marked **[V2]**),
plus eight practices a working studio would insist on (marked **[V2.1]**).

**What v2.1 adds:** the four-layer architecture and how it is enforced · a game state machine
in Phase 3 · per-system frame budgets · a level viewer as a first-class tool · Git LFS for
binaries · industry milestone names mapped onto the gates · a weekly fresh-eyes playtest ·
an explicit tools budget.

---

## 0. THE THESIS

A game is not built by describing a game. It is built by generating **one 12-second video**
that fixes the look, the world and the character — then forcing every downstream agent to
reconstruct from that single reference. The video is the spec.

```
   ONE SEED VIDEO  →  STYLE BIBLE  →  ENGINE (greybox)  →  ASSET KIT  →  CHARACTER
          │                                                                  │
          └──────────────────────────→  VERTICAL SLICE + HARNESS  ←──────────┘
                                                  │
                           CONCEPT FACTORY  →  PARALLEL LEVEL BUILD
                                                  │
                            SYSTEMS → AUDIO → HARDEN → SHIP → CASE STUDY
```

**What makes agent parallelism safe** — three mechanisms, all now verified:
1. **Levels are data, not code.** Agents write JSON against a strict schema.
2. **Every level declares its own test** — a move-annotated `critical_path` the bot must walk.
3. **Two gates before the browser:** schema (structure) then semantic linter (meaning).
   Verified to catch 8/9 and 14/14 defect classes respectively.

---

## 1. LANES

| Lane | Who | Owns | Never |
|---|---|---|---|
| **BUILDER** | Claude Code, Opus, high effort | Engine code, level JSON, assets | Approves own work; merges |
| **VERIFIER** | Codex, separate context | Cold re-runs, diff review, budget audit | Writes feature code |
| **REVIEWER** | Claude chat | Art direction, scope, gate calls, prompts | Touches the repo |
| **APPROVER** | Tim | Gate clearance, deploy, publish | — |

**Parallelism rule:** fan-out is permitted only after **Gate C2**. **[V2]** — v1 allowed it
after Gate C; verification showed the asset pipeline must also be proven end to end first,
or every agent hits the same loading failures independently.

---

## 2. LAYER ARCHITECTURE — THE SEAM THAT MAKES FAN-OUT SAFE **[V2.1]**

Four layers. Dependencies point **down only**. Nothing ever reaches back up.

```
   CONTENT     levels, assets, tuning tables          ← agents write here
      │ depends on
   GAMEPLAY    player, enemies, puzzles, progression   ← one lane, gated
      │ depends on
   ENGINE      render, physics, loop, audio, state     ← frozen at Gate C
      │ depends on
   PLATFORM    window, input devices, file loading
```

**The test a professional applies:** could you build a *different* game on this engine
without editing a line of it? If yes, the seams are in the right place. The engine must not
know your game exists; gameplay must not know which levels exist.

For a human team this is about maintainability. For you it is about **safety** — an agent
confined to the content layer physically cannot break the engine, which is the entire reason
eight of them can run at once. The layer rule is not style; it is the blast wall.

**Enforced mechanically, never by instruction alone:**

| Mechanism | What it stops |
|---|---|
| `CODEOWNERS` — `src/engine/` and `src/systems/` owned by the approver | an agent quietly changing the engine to make its level work |
| Pre-commit path check — level agents may touch only their own files | cross-level edits and `src/` drift |
| Lint rule: no import from `src/engine/**` reaching into `src/entities/**` or `levels/**` | upward dependencies, which look harmless and destroy the seam |
| Level schema `additionalProperties: false` + the semantic linter | content inventing engine concepts |

If an agent believes it needs engine work, it **stops and files a note**. It does not improvise
and it does not work around the wall. That rule is the difference between a program and a mess.

---

## 2A. TOOLS ARE ~30% OF THE WORK — BUDGET THEM **[V2.1]**

Professional game developers spend roughly a third of their time building tools, and they do
not apologise for it, because the iteration loop *is* the product. Build these as you need
them; each pays back within days:

- **Free camera** — detach from the player, fly anywhere, screenshot anything
- **Frame stepping** — advance one physics tick at a time (how you debug a bad jump)
- **Teleport to cursor** — stop replaying the first two minutes to reach the bug
- **Level hot-reload** — edit level JSON, see it without restarting
- **Entity inspector** — click anything, see its state live
- **God mode / noclip** — reach a broken part of a level without solving it
- **Cheat console** — set any TUNING value at runtime, then write the good ones back
- **Level viewer** — see Phase 6; the highest-value one for an agent-built game

A debug overlay alone is not a toolset. Put a tools line item in every phase.

---

## 3. STACK — VERIFIED VERSIONS

```jsonc
{
  "three":                        "0.187.0",   // EXACT. No caret. See [V2] note below.
  "@dimforge/rapier3d-compat":    "0.21.0",    // character controller + CCD verified
  "postprocessing":               "6.39.6",    // peer range: three >=0.168.0 <0.188.0
  "three-mesh-bvh":               "0.9.18",
  "vite":                         "8.3.6",
  "typescript":                   "7.0.2",
  "ajv":                          "8.20.0",
  "@playwright/test":             "1.65.0",    // Chromium Headless Shell 158.x
  "pixelmatch":                   "8.0.0"
}
```

**[V2] three.js is pinned exactly.** `postprocessing` supports `three < 0.188.0` and three is
at 0.187.0 — one minor release from breaking the post stack that carries the art direction.
A `^` range plus a routine `npm update` would silently destroy the look mid-build. Commit the
lockfile. Add a CI guard that fails if the installed three version leaves the peer range.

Everything else unchanged from v1: Blender 4.x headless for geometry, GPT Image for concepts
and texture plates, fal for the seed video, Tripo for image→3D, ElevenLabs + Udio for audio,
Vercel static hosting, repo under `zthebaron`, projects in `~/Code`.

**Deliberately excluded:** game-engine GUI, asset store, multiplayer, backend. Each costs a
week and removes the "one person, one link" story.

---

## 4. BUDGETS — NOW IN TWO TIERS **[V2]**

v1 listed frame time as a CI assertion. Verification proved that wrong: CI renders on
SwiftShader, a CPU software rasteriser, where frame times are meaningless in both directions.
`renderer.info` counters, by contrast, are CPU-side bookkeeping and fully valid in CI.

### Tier 1 — CI-enforceable (every PR, GitHub Actions)

| Budget | Limit | Source |
|---|---|---|
| Draw calls | < 300 | `renderer.info.render.calls` |
| Triangles | < 500,000 | `renderer.info.render.triangles` |
| Geometries / textures | < 400 / < 120 | `renderer.info.memory` |
| Initial download (gzip) | 12 MB | build report |
| All levels (lazy) | 60 MB | build report |
| Level JSON | 120 KB | linter |
| Console errors, full playthrough | 0 | harness |
| Level completable | nav bot reaches goal | harness |
| Visual drift vs golden | < 2% | pixelmatch |

### Tier 1A — Per-system frame budget **[V2.1]**

An aggregate budget tells you that you are slow. A per-system budget tells you *which system
to open*. Instrument each with `performance.now()` and show them in the debug overlay.

| System | Budget (of 16.6 ms) |
|---|---|
| Gameplay logic (AI, puzzles, progression) | 2.0 ms |
| Physics step | 2.0 ms |
| Animation + skinning + IK | 2.0 ms |
| Render + post-processing | 8.0 ms |
| Audio + UI | 0.6 ms |
| Slack (GC, spikes, browser overhead) | 2.0 ms |

Measured on hardware, not in CI (see F5). The slack line is not optional — a budget with no
headroom is a budget you blow on the first frame that allocates.

### Tier 2 — Hardware-only (nightly, self-hosted runner on the Mac Studio + a real phone)

| Budget | Limit |
|---|---|
| p95 frame time | 16.6 ms desktop (60 fps) / 33 ms mobile floor |
| Time to interactive | < 4 s cold |
| GPU / texture memory under real drivers | < 256 MB |
| Thermal stability | no sustained throttle over 10 min |
| Input latency | < 50 ms press→response |

Tier 2 runs on a **self-hosted GitHub Actions runner on his own Mac Studio**. Without it the
program ships a performance guarantee it never measured. **Gate E2 cannot be cleared by CI.**

**Cost:** ~$180–340 API spend for the full case-study build. Agent compute on existing Max accounts.

**Time:** 10–14 working days for the production version (12 levels, 4 enemy types, audio,
mobile). Capture the first 24 hours separately and publish *that* as the sprint story.

---

## 5. REPO LAYOUT

```
~/Code/<project>/
├─ 00-start-here/   SPEC.md · STYLE-BIBLE.md · KIT.md · AGENT-BRIEF.md · GATES.md
├─ reference/       seed/ (video + frames) · concepts/<level-id>/ · palette.json
├─ src/
│  ├─ engine/       loop · renderer · physics · input(+record/replay) · camera · audio · post/ · debug
│  ├─ systems/      movement · combat · puzzle · checkpoint · progression
│  ├─ entities/     player · enemies/ · interactables
│  ├─ loaders/      level.ts (schema-validated)
│  └─ ui/           menus · HUD · chapter select
├─ levels/          level.schema.json · 00-gym.json · 01-*.json …
├─ assets/          src/ (.blend + .py) · dist/ (.glb/.ktx2 + manifest.json)
├─ tools/
│  ├─ blender/      headless asset scripts
│  ├─ lint-level.mjs        ← VERIFIED, ships with this playbook
│  ├─ level.schema.json     ← VERIFIED
│  ├─ webgl-preflight.mjs   ← VERIFIED
│  ├─ harness/      nav · replay · chaos · counters · visual · run
│  ├─ viewer/       level viewer — fly through, see critical_path drawn   [V2.1]
│  └─ replays/      recorded input traces (regression suite)
├─ .gitattributes   assets/dist/** under Git LFS                          [V2.1]
└─ docs/            CASE-STUDY.md · build-log/ · build-notes/
```

---

## 6. THE LEVEL SCHEMA — **[V2] MOVE-ANNOTATED CRITICAL PATH**

This is the contract that makes parallel agents possible. The v1 version was defective and
the verification pass caught it: bare position waypoints are ambiguous — a 41-unit gap is
nonsense as a jump and normal as a run, and neither the linter nor the bot could tell which
was meant. An agent hitting that would have loosened the check until it passed, silently
removing the only proof that levels are completable.

> **[SUPERSEDED — PHASE-0-DECISIONS Q7]** An inline example level used to sit here. It taught
> four refused mechanics at once (a charger enemy, a struck bell opening a gate, a scroll pickup,
> a directional sun) plus `par_time`, and agents copy examples more faithfully than they follow
> rules. The one example is now **`tools/example-level.json`**, an honest chapter-3 level that
> `npm run lint:example` checks. It is not reproduced here, so it cannot drift. See SPEC.md §7 for
> what the schema refuses.

### Move budgets — derived from the gym, enforced by the linter

| `via` | Max horizontal | Max rise | Notes |
|---|---|---|---|
| `ground` | ∞ | `max(0.5, run × tan(50°))` | **[V2]** slope-based, not a flat cap. 50° matches Rapier's `maxSlopeClimbAngle`, so linter and physics cannot disagree. 0.5 is the autostep height. |
| `jump` | 5.2 | 3.1 | |
| `double` | 8.4 | 5.6 | |
| `dash` | 7.0 | 0.8 | |
| `dashjump` | 12.6 | 3.1 | |
| `wall` | 3.0 | 6.2 | wall-run into wall-jump |
| `climb` | 1.5 | 2.4 | ledge grab + mantle |
| `platform` | ∞ | ∞ | requires a valid `"platform"` id |

Numbers are placeholders until Phase 3 measures them in the gym — then they are written back
into `SPEC.md` **and** `lint-level.mjs`, which must stay the single source of truth.

### Three rules that keep this working

1. **`critical_path` is mandatory and every segment declares its `via`.** It is the level's
   own test. A level whose path does not lint and whose bot cannot walk it does not merge.
2. **Asset names must exist in `assets/dist/manifest.json`.** An invented asset name is a
   hard lint failure.
3. **No level may add a new entity `type`.** New types are engine work, a different lane, a
   different gate.

Benefit of the v2 design beyond linting: **the bot knows which input to press.** It no longer
infers intent from geometry, which was the weakest part of the v1 harness.

---

## 7. TWO GATES BEFORE THE BROWSER **[V2]**

Both ship verified with this playbook. Together they run in under a second and catch most of
what an agent gets wrong, before the expensive browser stage.

**Gate 1 — `level.schema.json` (structure).** ajv strict, `additionalProperties:false`
everywhere. Verified to catch 8/9 attacks: missing required fields, unknown keys at any
depth, unknown entity types, malformed vec3s, out-of-range numbers, short arrays.

**Gate 2 — `lint-level.mjs` (meaning).** Verified to catch **14/14**:

```
DUP_ID              an id reused across any two entity arrays   ← schema cannot express this
UNKNOWN_ASSET       asset not in the build manifest
DANGLING_TARGET     an action points at an id that does not exist
OOB                 spawn/goal/waypoint/checkpoint/patrol outside bounds
NO_VIA              a waypoint with no declared move
BAD_VIA             an unknown move name
UNREACHABLE         segment exceeds the budget for its declared move
BAD_PLATFORM_REF    via:platform with a missing or wrong-typed platform id
PATH_START          critical_path[0] is not at spawn
PATH_END            path does not end inside the goal radius
HAZARD_ON_PATH      a hazard sits on a waypoint — the bot dies every run
SIZE                level JSON over 120 KB
FALL_DAMAGE (warn)  drop exceeds safe-fall height
CHECKPOINT_GAP (warn) punishing spacing
TIGHT (warn)        segment within 10% of its move limit
NO_FALL_PLANE (warn) no fall hazard — leaving the world never respawns
```

Wire both into a pre-commit hook and CI. `npm run lint:levels` must be green before any
browser test runs.

---

## 8. MILESTONES — THE INDUSTRY NAMES, MAPPED ONTO YOUR GATES **[V2.1]**

Studios run on six named milestones. The milestone is not the point — the **refusal attached
to it** is. "No new systems after alpha" is what stops a project growing a third act in month
nine. Use the names; other people know what they mean, and the case study reads better.

| Milestone | What it means | Your gate | The refusal it carries |
|---|---|---|---|
| **Pre-production** | Kill risk, find the fun, expect to throw prototypes away | Day-0 spike + Gates A, B | Nothing is precious yet |
| **Vertical slice** | ONE level at final quality, every system represented | Gate D | No second level until this one is good |
| **First playable** | Start to finish, rough, all levels traversable | Gate E | No polish while any level is unfinishable |
| **Alpha** | **Feature complete** — every system exists | After Phase 9 | **No new systems.** Ever. From here it's tuning |
| **Beta** | **Content complete** — every level, asset and sound in | Gate E2 | **No new content.** Bugs only |
| **Gold** | Shippable | Gate F | No changes without a named approver |

**Scope creep is the number-one killer of game projects**, and milestones are the mechanism
that stops it. Every scope change after a milestone goes in `GATES.md` with a cost estimate
and your signature. Not to create bureaucracy — to make the cost visible at the moment of
the decision, which is the only moment it can change anything.

**The schedule is driven by content throughput, not features. [V2.1]** After the vertical
slice, measure days-per-level on the first two levels, multiply by the remainder, add 40%.
That is your date. The engine is a fixed cost; content is the variable one, and it is where
every honest estimate comes from.

---

## 9. THE PHASES

### ☐ PHASE 0 — SPEC & PREMISE · *half a day*
Run `/grill-me` in REVIEWER. Produce `SPEC.md` (premise, core verb, core loop, win condition,
session length ~~15–25 min~~ *(superseded, see below)*, chapter list, failure model, the explicit **NOT** list, and a Tuning
Constants section) and `AGENT-BRIEF.md` (stack, budgets, schema rules, lane isolation, the
list of things agents may never do).
**Test:** describe the game in 20 seconds. If you can't, it isn't scoped.

> **[SUPERSEDED — PHASE-0-DECISIONS Q4]** **Session length is a content budget, not a minute target.** The 15–25 min
> figure above is retired; do not scope toward it. The sprint is **4 chapters × 5 segments = 20
> segments**. At 25–35 s per segment for a first-time player (Q3), that is **8–12 minutes**.
> Hitting 15–25 min in the sprint would take 30–50 segments, 2–2.5× the level-authoring work,
> committed before the vertical slice has measured days-per-level. **Production grows by adding
> chapters, not by stretching them:** 12 chapters × 5 segments ≈ 30 min, with the same segment
> length and the same chapter shape. Chapters 2+ are 5 ± 1 segments (linter `CHAPTER_LENGTH`).
> Chapter 1 has no fixed length until the vertical slice measures the teach rate. If you see
> 8–12 min and think "too short", read this note before adding scope.

**🚦 GATE A — SCOPE LOCKED.**

### ☐ PHASE 1 — THE SEED VIDEO · *2–3 hours*
6–10 candidates on fal (~$40). Judge on four criteria only: readable silhouette at 5% screen
height · buildable (blocky, reconstructable) geometry · under 8 dominant hues · shippable
third-person camera. Pick **one**, commit to `reference/seed/`, no backup. Extract frames at
3 fps plus 6 hero frames.
**Test:** three people watch it and say what you do in the game. Divergent answers → regenerate.
**🚦 GATE B — LOOK LOCKED.** *Highest remaining unverified risk in the program — this gate is
where it gets settled.*

### ☐ PHASE 2 — STYLE BIBLE · *2 hours*
k-means palette extraction → `palette.json` (6–8 named hexes) + a labelled strip. Write
`STYLE-BIBLE.md`: medium and rendering rules · palette law · three depth bands with world-unit
transitions · silhouette rules · environment grammar · **forbidden list** (the section that
prevents the most drift) · shader target card with starting parameters and low-end fallbacks.
**Test:** an agent that has never seen the video describes a scene from the bible alone and it
matches.

### ☐ PHASE 3 — ENGINE SKELETON (GREYBOX) · *1 day. No art.*
Vite + TS strict + three.js (pinned) + Rapier. Fixed 60 Hz timestep with accumulator, decoupled
render. **Serialisable input layer with record/playback — build it now, retrofitting is painful.**
Character controller: run, sprint, jump, double-jump, coyote time ~120 ms, jump buffering
~100 ms, variable jump height, wall-slide, wall-jump, ledge grab, dash. CCD on the player body;
minimum collider thickness 0.3 units. Spring-arm camera with raycast pushback. Schema-validated
level loader. Debug overlay on `~`. `00-gym.json` exercising every mechanic in isolation.

**[V2.1] Build the game state machine now, on day one.** `boot → menu → loading → play →
pause → death → results → menu`. Every system queries the state; no system keeps its own
"am I paused?" flag. This is the single most-regretted omission in amateur game projects —
retrofitting it means auditing every system for pause behaviour, and pause bugs surface late,
in QA, under deadline. One file, two hours, now.

**[V2.1] Tools pass before the feel test:** free camera, frame stepping, teleport-to-cursor,
level hot-reload. You are about to spend hours tuning movement constants — these four turn
each iteration from a minute into five seconds.

**The feel test (human, 10 minutes) — the one that matters.** Can you chain six jumps without
thinking about the controls? Does a missed jump feel like your fault? Tune one constant at a
time. **Write the final numbers into `SPEC.md` and into the linter's move budgets.**
**🚦 GATE C — ENGINE FROZEN.**

### ☐ PHASE 3.5 — PIPELINE PROOF **[V2 — NEW]** · *2 hours*
Before any kit work, push **one** asset through the entire pipeline unattended:
Blender script → `gltf-transform` → `manifest.json` → referenced in a level JSON → passes
schema + linter → renders in-engine → appears in a harness screenshot.

This gate exists because verification found three loading failures that would otherwise hit
every agent independently: `file://` is CORS-blocked for ES modules; three.js r187 ships a
split build (`three.module.js` imports `./three.core.js`); and `three/examples/jsm/*` uses bare
specifiers that need a bundler or an import map.
**🚦 GATE C2 — PIPELINE PROVEN.** *Fan-out is not permitted before this gate.*

### ☐ PHASE 4 — ASSET KIT · *1–2 days*
Define 12–20 **reusable** kit pieces from the seed frames — a kit, not bespoke models. This is
why one person can build twelve levels. For each: a headless Blender Python script building it
procedurally, a low-poly collider where the visual mesh exceeds 2k triangles, a triangle-budget
check that fails the build.

**[V2] Two corrections:**
- **Do not bake Array modifiers on export.** Applying them turns 1 MB into tens of MB. Pieces
  that repeat (stair treads, fence posts, railings) export as a single unit and repeat at
  runtime via `InstancedMesh` — verified: 2,000 instanced boxes render in **2 draw calls**.
- **Do not use Blender's Draco exporter.** Export uncompressed, then run `gltf-transform` as a
  separate inspectable stage: `resize → ktx2/webp → draco` (draco last, irreversible). Keeps
  compression settings versioned in the repo instead of buried in a Python call.

Asset names are `lower_snake_case` — glTF rewrites spaces and strips dots, and the schema's
`assetRef` pattern enforces it.

**[V2.1] Binary assets go behind Git LFS** (`assets/dist/** filter=lfs` in `.gitattributes`).
Binaries do not merge, and a repo that accumulates every version of every `.glb` gets slow
and stays slow. Your pipeline already sidesteps the worst of this — assets are *generated*
from Python, so the real source is text and merges cleanly — but the built artefacts still
need LFS or a CI regeneration step.

`npm run assets` must regenerate everything from a clean checkout. Hand-build Level 01 yourself
— you need to feel the schema once. Add the post stack from the shader card with LOW/MED/HIGH
quality tiers auto-selected from a one-second frame-time probe.

### ☐ PHASE 5 — THE CHARACTER · *half a day* **[V2 — shortened]**
Best character frame → GPT Image **4-view orthographic sheet** (front/side/back/¾, A-pose, flat
grey background, flat even lighting, identical across views).

**[V2]** Sheet → **Tripo API**: mesh + Smart Mesh retopology + **auto-rigging** (it detects the
skeleton and computes skin weights). v1 routed this through manual Blender retopo and Mixamo;
the API path is scriptable and roughly half a day shorter. *Fallbacks: Meshy when the animation
library is the bottleneck (500+ motions), Rodin when character detail is.*

Blender then handles only: jiggle bones (3 robe hem, 2 sash, 1 hat brim — **bone-driven spring
physics, never cloth simulation**, which will not fit the frame budget at this silhouette size),
foot-IK targets, and export.

Animations: `idle, walk, run, sprint, jump_start, jump_apex, fall, land, land_hard, wall_slide,
wall_jump, ledge_grab, ledge_climb, dash, strike_1, strike_2, hit_react, death`. Root motion OFF
— physics drives position.

**Tests:** silhouette identifiable at 64 px · every state transition with no T-pose frame, no NaN
bone, foot slide under 8 cm · character ≤ 3 draw calls.

### ☐ PHASE 6 — VERTICAL SLICE + HARNESS · *1–2 days. The phase people skip.*

Level 01 to ship quality. Then `tools/harness/`:

**[V2] Environment preflight runs first, every time.** Serve over **HTTP** (`vite preview`),
never `file://`. Pin launch args. Assert WebGL2 exists and log the renderer string in every
report. A missing context fails as `HARNESS_ENVIRONMENT_FAILURE` — never as a level failure,
because those look identical and cost a day to tell apart. Verified capabilities under the
pinned config: `MAX_TEXTURE_SIZE 8192`, float colour buffers, S3TC/ETC/ASTC — KTX2 loads in CI.

Expose `window.__GAME__` only when `?harness=1`, and **[V2]** have that flag also force a
**deterministic render mode**: fixed simulated clock, animation driven by frame index not wall
time, grain seeded from a constant, particles off. Without it, golden-image comparison is
meaningless — the post stack's grain alters 100% of pixels between runs.

Five modes:
1. **Nav bot** — walks `critical_path`, using each waypoint's `via` to choose the input. Asserts
   goal reached within **12 s × segments** (the Q3 bot budget; levels have no `par_time`,
   see PHASE-0-DECISIONS Q4), never below `bounds.min.y`, waypoints hit in order.
2. **Replay runner** — plays back recorded traces. **[V2] asserts on outcome within tolerance**
   (goal reached, checkpoints in order, position ±0.5u, frames ±5%) — not exact position. Rapier
   is deterministic in-process (verified to 9 decimal places) but makes no cross-machine
   guarantee; exact-match assertions are permitted only on a pinned runner image. A regression
   suite that cries wolf is a regression suite nobody reads.
3. **Chaos bot** — 60 s seeded random input (seed logged). Asserts: in bounds, not stuck,
   zero console errors, velocity under cap × 2, no NaN transforms.
4. **[V2] Counter probe** (was "perf probe") — asserts Tier-1 budgets only: draw calls,
   triangles, geometries, textures. **Frame time is not asserted in CI.**
5. **Visual regression** — 6 fixed cameras, pixelmatch against goldens, fail over 2% drift.

Plus **[V2] Tier-2 hardware job** on the self-hosted Mac Studio runner, nightly: frame time,
TTI, GPU memory, thermals, input latency.

**[V2.1] Build the level viewer — `tools/viewer/`.** A professional team would build a level
*editor* here: two days of work, and levels get authored in hours with visual feedback. That
is correct for human designers and wrong for yours — agents cannot use a visual editor, and
JSON plus a schema plus a linter gives an agent exactly the feedback an editor gives a human.

Build the **viewer** instead — half the value, a fifth of the cost:
  - load any level, free-fly through it
  - `critical_path` drawn as a coloured polyline, each segment labelled with its `via`
  - checkpoints, hazards, enemy aggro radii and bounds shown as wireframes
  - scrub the nav bot along the path, frame by frame
  - jump straight to any waypoint

This turns reviewing an agent's level from "play it for five minutes" into "look at it for
ten seconds", which is what makes a twelve-level fan-out reviewable by one person.

CI: schema → linter → nav → replay → chaos → counters → visual. No level merges without green.

**Prove the harness works:** delete a platform from the gym, confirm the failure, restore,
confirm green. An untested test suite is decoration.
**🚦 GATE D — SLICE SHIPPABLE.** Approver plays Level 01 on a phone and a laptop. *This gate is
also the real test of whether an agent can build a good level — the second-highest unverified
risk. If Level 01 needed heavy human correction, fan out to two agents, not eight.*

### ☐ PHASE 7 — CONCEPT FACTORY · *4 hours*
Scene brief per chapter (location, vertical shape, landmark, hazard theme, the ONE new idea,
mood). GPT Image style-locked to seed frames + palette, 8 per level. Curate to 3: establishing,
mid-traversal, landmark. Write a build note per level: kit assets needed, vertical rise, the
traversal spine, checkpoint logic, the new idea. **Flag every concept needing a new kit asset
and batch them** — do not let eight agents each invent geometry.
**Test:** all concepts in one grid. Does it read as one game? Outliers get regenerated or cut.

### ☐ PHASE 8 — PARALLEL LEVEL BUILD · *2–4 days*
Asset sprint first — the kit must be complete before fan-out. Then one agent per level, each
receiving AGENT-BRIEF + STYLE-BIBLE + schema + **the move budget table** + its 3 concepts +
build note + manifest.

**Isolation, enforced by CODEOWNERS and a pre-commit path check** (not by instruction alone):
an agent writes only its own `levels/<id>.json`, `tools/replays/<id>-*.json` and
`tools/harness/golden/<id>/`. Needs engine work or a missing asset → it **stops** and files a
note in `docs/build-log/`. It does not improvise.

Each agent self-verifies green before reporting. VERIFIER re-runs cold — agent-reported green
is not green. REVIEWER does the art-direction pass against the concepts.
**🚦 GATE E — CONTENT COMPLETE.**

### ☐ PHASE 9 — SYSTEMS · *2 days, after the fan-out*
Four enemy types, one verb each (charger, ranged, blocker, patroller), each with a readable
telegraph — the telegraph is the whole design. Combat: two-hit combo, 0.15 s parry window,
dash i-frames, **60 ms hitstop** (does more for game feel than anything else in this phase).
Progression: chapter select, scroll counts, `localStorage` **wrapped in try/catch** (it throws
in embedded and private-browsing contexts), versioned saves that reset rather than crash.
**Respawn under 1.2 s** — the number-one reason players quit platformers. Difficulty pass:
~~bot completion time vs `par_time`~~ **[SUPERSEDED — PHASE-0-DECISIONS Q4]** there is no `par_time`. The bot budget
(12 s/segment) is already a CI assertion, so the difficulty pass is about humans: first-time
players should land at 25–35 s per segment (Q3). A segment far outside that range is mistuned.
*Note: adding enemies will break critical paths authored without them. Expect a re-lint pass.*

### ☐ PHASE 10 — AUDIO · *1 day. Budget it properly.*
10% of the work, 40% of perceived quality, and where AI-built games are weakest.
SFX via ElevenLabs — footsteps (3 surfaces × 4 variations, pitch randomised ±8% on playback,
triggered from animation events not a timer), jump, land, land_hard, dash, strike, hit, bell,
gate, death, pickup, checkpoint. Three ambience loops crossfaded by level zone. Score via Udio:
main theme, tension variant, summit piece. **Author loop points by hand** — generated music
almost never loops cleanly and a bad loop point is the most noticeable flaw in the build.
Audio bus with per-channel sliders, mute on tab blur, `AudioContext` created on first gesture
(Safari refuses otherwise), lazy-loaded so it never blocks first paint.

### ☐ PHASE 11 — HARDENING · *1–2 days*
Browser matrix: Chrome, Firefox, Safari desktop + iOS (Safari will break something WebGL- or
AudioContext-related — assume it). Mobile: proper touch controls or an honest desktop-only gate;
half-working touch is worse than none. Progressive loading with an art loading screen. **First
30 seconds teach movement with zero text** — geometry that forces a walk, a jump, a double-jump,
a wall-run. WebGL context-loss handler, save-corruption reset, asset retry, styled unsupported
fallback. Remappable keys, reduced-motion toggle, colourblind check on the single accent colour.
Lighthouse + full harness on the production build.
**🚦 GATE E2 — HARDWARE PERF [V2]** (Tier-2 budgets on real devices) **then 🚦 GATE F — SHIP.**

### ☐ PHASE 12 — DEPLOY, DEMO, CASE STUDY · *1 day*
Deploy to Vercel; verify the harness API is stripped from the production bundle by grepping the
output. **Record the hero footage human-played** — agent-played footage reads as stiff and
audiences notice immediately; use bot footage only in the "how we tested it" section where
mechanical movement is the point. Capture: 60 s hero cut, 15 s social loop, 6 stills, a terminal
recording of the harness catching a real bug, a screen recording of N agents running in parallel.

Write `CASE-STUDY.md` from artifacts collected throughout, not reconstructed at the end. **Lead
with the harness catching a bug** for a technical audience. Honest numbers: elapsed time, API
spend, agent-hours, lines of engine code vs lines of level data, harness failures before green.
What broke, what you'd do differently, what the method cannot do.

---

## 10. THE ITERATION LOOP

```
PLAY (human, 15 min) → TRIAGE (bug|tuning|content|scope-creep:reject) → FIX (one agent,
one bug, one branch) → VERIFY (harness green + the specific repro passes) → REGRESS (add
the repro as a replay trace) → MERGE (approver)
```

**Every bug fix adds a replay trace.** After two weeks you have a regression suite nobody had
to sit down and write.

**[V2.1] Fresh eyes, once a week — the one thing no agent can do for you.** Put the build in
front of someone who has never played it and say nothing. Watch where they stop, where they
look lost, where they repeat a jump four times. Do not explain, do not help, write it down.
A solo-plus-agents build has no natural source of this and it is the biggest blind spot in
the whole program: you and your agents will both become blind to the first-thirty-seconds
problem within a week of looking at it. Remi is a playtester, and a seven-year-old who cannot
get past your tutorial geometry is telling you something true.

---

## 11. FAILURE MODES

| Symptom | Real cause | Fix |
|---|---|---|
| Levels look like different games | Style Bible too thin; agents fill gaps with their own taste | Expand the forbidden list; regenerate, don't patch |
| Frame rate collapses around level 6 | Budget enforced per-level, never on the aggregate | Tier-2 job runs on the full build, not one level |
| Agents keep editing `src/` | Isolation stated but not enforced | CODEOWNERS + pre-commit path check |
| Player falls through floors | Tunnelling: fast movement, thin colliders | CCD on the player body (verified working), min collider thickness 0.3u |
| "Works on my machine" | Asset build not reproducible | Clean-clone test in CI (Gate C2) |
| A level can't be finished | Path authored without reachability checking | The linter. This is exactly what F3 caught. |
| Replay tests fail randomly | Exact-position assertions across machines | Tolerance-based outcome assertions |
| Visual regression always fails | Non-deterministic render (grain, time-driven animation) | `?harness=1` deterministic mode |
| Harness reports "level broken" when it isn't | WebGL context missing — looks identical to a level failure | `HARNESS_ENVIRONMENT_FAILURE` as a distinct class |
| Post stack breaks after a routine update | three.js drifted out of `postprocessing`'s peer range | Exact pin + CI guard |
| Pause bugs everywhere in month two | No state machine; every system kept its own flag | Build it in Phase 3. There is no cheap retrofit |
| An agent "fixed" its level by editing the engine | Layer rule enforced by instruction, not mechanism | CODEOWNERS + import lint + path check |
| Repo clone takes ten minutes by week three | Binary `.glb` history in plain git | Git LFS from day one, not after |
| Reviewing twelve agent levels takes a whole day | No viewer — every review means playing | `tools/viewer/`, Phase 6 |
| Scope grew a third act | Milestone refusals never written down | `GATES.md` entry with a cost estimate per change |
| Nobody can finish the first level but you | No fresh-eyes playtest | Weekly, silent, write it down |
| The game is not fun | Gate C was waved through | No downstream fix. Go back to greybox. |
| Audio is what everyone mentions | Phase 10 compressed into an hour | Budget the full day |

---

## 12. MASTER CHECKLIST

```
PRE-FLIGHT
  ☐ DAY-0 PROOF SPIKE cleared (H1 seed · H2 engine · H3 harness · H4 asset)
  ☐ Repo at ~/Code/<project>, pushed to zthebaron
  ☐ API keys: fal · OpenAI · Tripo · ElevenLabs · Udio
  ☐ Blender 4.x callable headless · Vercel linked
  ☐ Self-hosted GitHub Actions runner on the Mac Studio (Tier-2)   [V2]
  ☐ Verified tools dropped into tools/ (schema, linter, preflight)  [V2]

0  ☐ SPEC.md ☐ AGENT-BRIEF.md ☐ chapter list ☐ NOT list        → GATE A
1  ☐ 6-10 candidates ☐ one locked ☐ frames extracted            → GATE B
2  ☐ palette.json ☐ STYLE-BIBLE.md ☐ forbidden list ☐ shader card
3  ☐ scaffold (three pinned) ☐ input record/replay ☐ controller
   ☐ camera ☐ GAME STATE MACHINE ☐ tools pass (freecam, step,
   teleport, hot-reload) ☐ gym ☐ FEEL TEST
   ☐ constants → SPEC.md + linter                                → GATE C
3.5☐ one asset end-to-end unattended                             → GATE C2  [V2]
4  ☐ kit defined ☐ blender scripts ☐ gltf-transform stage ☐ Git LFS
   ☐ npm run assets from clean clone ☐ Level 01 by hand ☐ post stack
5  ☐ 4-view sheet ☐ Tripo mesh+autorig ☐ jiggle bones ☐ 18 anims
   ☐ silhouette ☐ transitions ☐ ≤3 draw calls
6  ☐ Level 01 ship quality ☐ HTTP serve ☐ WebGL preflight
   ☐ deterministic mode ☐ nav ☐ replay(tolerance) ☐ chaos
   ☐ counters ☐ visual ☐ LEVEL VIEWER ☐ Tier-2 nightly
   ☐ CI ☐ BREAK TEST                           → GATE D / VERTICAL SLICE
7  ☐ scene briefs ☐ 8/level ☐ curated to 3 ☐ build notes ☐ asset list
8  ☐ asset sprint ☐ CODEOWNERS + import lint + path check live
   ☐ N agents ☐ all green ☐ VERIFIER cold re-run ☐ art pass
   ☐ days-per-level measured → schedule                → GATE E / FIRST PLAYABLE
9  ☐ enemies ☐ combat ☐ hitstop ☐ progression ☐ save
   ☐ re-lint paths ☐ difficulty ☐ respawn <1.2s          → ALPHA (no new systems)
10 ☐ SFX ☐ ambience ☐ score ☐ loop points ☐ mix ☐ gesture-gated ctx
11 ☐ browsers ☐ mobile call ☐ loading ☐ first 30s ☐ resilience
   ☐ a11y ☐ lighthouse               → GATE E2 / BETA → GATE F / GOLD  [V2]

WEEKLY, FROM GATE D ONWARDS
   ☐ fresh-eyes playtest — someone new, you say nothing, write it down
12 ☐ deploy ☐ API stripped ☐ human hero capture ☐ stills
   ☐ harness-catches-bug recording ☐ CASE-STUDY.md ☐ publish
```

---

## 13. FOR SOMEONE WHO HAS NEVER BUILT A GAME

1. **A game is a feeling encoded as numbers** — gravity, jump height, air control, coyote time.
   Phase 3 finds them. They matter more than every asset combined.
2. **Content is data, engine is code.** Mixed, every level is a merge conflict.
3. **Testing a game means playing it automatically.** The harness is why you can let eight
   agents loose and still sleep.
4. **Kits beat bespoke.** Twenty reusable pieces look intentional; twelve unique level sets look
   like twelve different games and cost twelve times as much.
5. **The demo is a deliverable.** The build is 90% of the work and 10% of the reach.
6. **[V2] Verify assumptions by running them.** This playbook's own example level was
   unbuildable until a linter that took twenty minutes to write caught it.
7. **[V2.1] Layers point one way.** It reads like architecture hygiene. It is actually the
   blast wall that lets eight agents work at once without one of them breaking the game.
8. **[V2.1] Copy a professional practice only once you can name the constraint behind it.**
   Studios build level editors because human hands are slow at typing coordinates. Your
   builders have no hands. Inherit the reasoning, not the bottleneck.

---

## 14. WHAT THIS BECOMES

The case study is not "AI built a game" — everyone is posting that. It is: **here is the program
that made it safe to let agents build it, and here is the recording of that program catching
their mistakes.** A dashboard needs explaining. A game does not — you click the link and you
know within ten seconds whether it is real.

The generalised method applies to any interactive 3D deliverable: product configurators,
training simulations, spatial dashboards, client showpieces.

---

*v2.1 — verified by execution, then checked against professional practice. Evidence in
`BLUEPRINT-VERIFICATION-REPORT.md`. Tested tools in `tools/`. Prompts in
`AI-GAME-BUILD-PROMPT-PACK.md`. Go/no-go in `DAY-0-PROOF-SPIKE.md`.*
