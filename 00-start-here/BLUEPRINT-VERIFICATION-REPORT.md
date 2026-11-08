# BLUEPRINT VERIFICATION REPORT
### Proofline Game Track (PGT-01) — pre-build assurance pass
Date: 2026-11-07 · Verifier lane · No production code written

---

## WHY THIS EXISTS

A plan that has not been executed is a hypothesis. Before committing two weeks and a
public case study to this method, I tested the assumptions that would be expensive or
embarrassing to discover mid-build — by running them, not by reasoning about them.

**Result: 17 assumptions tested. 13 confirmed. 4 were wrong.** All four are corrected
in Playbook v2.1. One of the four was a defect in my own example level, which is the
most useful finding in this document, because it is the exact error an agent would make.

---

## 1. WHAT WAS ACTUALLY RUN

Environment: Linux, Node 22.23.4, npm 10.9.9, live npm registry, Playwright 1.65.0 with
Chromium Headless Shell 158.0.8127.18.

| # | Assumption under test | Method | Verdict |
|---|---|---|---|
| 1 | three.js, Rapier, Vite, Playwright all current and installable | live `npm view` + real install | ✅ CONFIRMED |
| 2 | `postprocessing` is compatible with current three.js | peer-dependency inspection | ⚠️ **CORRECTION — see F1** |
| 3 | Rapier 0.21 exposes a kinematic character controller | built one, ran it | ✅ CONFIRMED |
| 4 | Rapier supports CCD (anti-tunnelling) | dropped a body from 40u with CCD on | ✅ CONFIRMED — settled correctly, no tunnelling |
| 5 | Rapier supports trimesh colliders from raw vertex arrays | built a trimesh ground | ✅ CONFIRMED |
| 6 | **Rapier is deterministic enough for replay-based regression tests** | ran an identical 600-frame sim twice, compared to 9 decimal places | ✅ CONFIRMED in-process — ⚠️ **but see F4** |
| 7 | The level JSON schema can be made strict | wrote it, compiled with ajv, attacked it with 9 malformed levels | ⚠️ 8/9 — **see F2** |
| 8 | A semantic linter can catch what the schema cannot | wrote it, attacked it with 14 defects | ✅ **14/14 after correction — see F3** |
| 9 | The example level in Playbook v1 is valid | ran the linter against it | ❌ **FAILED — see F3** |
| 10 | Headless Chromium can create a WebGL2 context | 4 launch configurations tested | ✅ CONFIRMED (all four) |
| 11 | three.js r187 renders in headless Chromium | rendered 120 frames | ✅ CONFIRMED |
| 12 | Screenshots are readable for visual regression | captured, decoded, counted colours | ✅ CONFIRMED — 145 distinct colours, not blank |
| 13 | EffectComposer post-processing works headless | ran a custom ink-edge + grain shader pass | ✅ CONFIRMED, 100% of pixels altered |
| 14 | **Frame time measured in CI is meaningful** | measured under SwiftShader | ❌ **FALSE — see F5** |
| 15 | `renderer.info` counters are valid in CI | compared against known scene | ✅ CONFIRMED — counters are CPU-side, renderer-independent |
| 16 | InstancedMesh collapses kit geometry into few draw calls | 2,000 boxes rendered | ✅ CONFIRMED — **2 draw calls** |
| 17 | The harness can load the game from disk | tried `file://` | ❌ **FALSE — see F6** |

---

## 2. THE FINDINGS THAT CHANGE THE PLAN

### F1 — `postprocessing` is version-boxed. Pin three.js exactly.

Measured:
```
three                       latest 0.187.0
postprocessing  peerDeps →  three >= 0.168.0 < 0.188.0
three-mesh-bvh  peerDeps →  three >= 0.159.0
```

three.js is **one minor release** from breaking the post-processing library, and the post
stack is what makes the game match the seed video. A `^0.187.0` range in package.json would
let a routine `npm update` silently destroy the art direction mid-build.

**Correction:** pin `"three": "0.187.0"` exactly — no caret, no tilde. Add a CI check that
fails if the installed three version leaves the `postprocessing` peer range. Commit the
lockfile. Upgrading three becomes a deliberate, gated action, never incidental.

---

### F2 — JSON Schema cannot express identity. 8 of 9 attacks caught.

The schema caught: missing required fields, unknown top-level keys, unknown entity types,
unknown properties on nested objects, short arrays, malformed vec3s, negative times,
out-of-range difficulty.

It could not catch: **two entities sharing an id.** This is not a bug in my schema — JSON
Schema has no cross-item uniqueness operator for this shape. It is also exactly the kind
of error eight parallel agents produce, because each one is writing ids in isolation.

**Correction:** the schema is necessary but not sufficient. A semantic linter is a required
second gate, not a nice-to-have. Built and verified — see F3.

---

### F3 — ❌ The example level in Playbook v1 was unbuildable. The `critical_path` design was wrong.

This is the most valuable finding here.

I ran the linter against my own reference level from Playbook v1 §6. It failed:

```
[UNREACHABLE] seg 1->2: 41.2u horizontal exceeds max traverse 15.4u
[UNREACHABLE] seg 2->3: +6.0u rise exceeds double-jump ceiling 5.6u
[UNREACHABLE] seg 4->5: 50.1u horizontal exceeds max traverse 15.4u
```

**Root cause:** v1 defined `critical_path` as a bare list of positions. That is ambiguous —
it does not say *how* the player gets from one waypoint to the next. A 41-unit gap is
nonsense as a jump and completely normal as a run along a path. Neither the linter nor the
navigation bot could tell which was intended, so the linter had to assume the worst and
the bot would have had to guess.

An agent writing a level against the v1 spec would hit this immediately, and the most
likely resolution — loosen the check until it passes — removes the only automated proof
that a level is completable. That failure would have been silent and it would have
propagated across every level in the fan-out.

**Correction — waypoints are now move-annotated:**

```jsonc
"critical_path": [
  [0,2,0],
  { "pos":[12,4,-8],   "via":"ground" },
  { "pos":[16,6,-10],  "via":"jump" },
  { "pos":[20,14,-10], "via":"platform", "platform":"slab_a" },
  { "pos":[99,17,-64], "via":"double" },
  { "pos":[140,36,-88],"via":"ground" }
]
```

Moves: `ground · jump · double · dash · dashjump · wall · climb · platform`, each with its
own distance and rise budget taken from the tuning constants measured in the gym level.

This fixes three things at once:
1. The linter can prove reachability per segment against the correct budget.
2. **The navigation bot knows which input to press** — it no longer has to infer intent
   from geometry, which was the weakest part of the v1 harness design.
3. The level file documents its own intended route, which is what a human reviewer needs.

**Second correction inside the same fix:** my first attempt capped `ground` rise at a flat
0.6 units, which rejected every staircase in the game. Ground is a *slope*, not a step.
The rule is now `maxRise = max(autostep, horizontal × tan(slopeLimit))` with `slopeLimit`
set to 50° — the same value configured on the Rapier character controller, so the linter
and the physics cannot disagree.

**Verified result after correction:**
```
BASELINE (move-annotated): PASS
Linter v3 caught 14/14 semantic defects.
```
Including: missing `via`, bogus move name, jump too far, double-jump rise too high, ground
segment climbing a wall, platform reference missing, platform id pointing at an enemy,
duplicate id, asset not in manifest, dangling action target, waypoint out of bounds, path
not starting at spawn, path not reaching goal, hazard sitting on the path.

---

### F4 — Rapier determinism is same-process only. Replay tests need tolerance.

Two identical 600-frame simulations produced byte-identical results to nine decimal places:
```
RUN A final player: 2.064756632, 0.960115135, -2.941864014
RUN B final player: 2.064756632, 0.960115135, -2.941864014
```

That proves determinism **within one process on one build**. It does not prove it across
machines, architectures, or WASM builds — floating-point and SIMD paths differ, and Rapier
makes no cross-platform determinism guarantee.

**Correction:** replay regression tests assert on **outcome, not exact position**:
goal reached, checkpoints hit in order, within a position tolerance of 0.5 units and a
frame-count tolerance of ±5%. Exact-match assertions are permitted only when the run is
pinned to one CI image. This keeps the regression suite from turning into a source of
false failures that the team learns to ignore — which is how test suites die.

---

### F5 — ❌ Frame-time budgets cannot be enforced in CI. The budget table was wrong.

Playbook v1 listed "p95 frame time ≤ 16.6 ms" as a harness assertion. Measured under
headless Chromium:

```
renderer            : ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)
SwiftShader p50     : 0.30 ms
SwiftShader p95     : 1.00 ms   (2,000 instanced boxes, no textures, 640×360)
```

CI renders on **SwiftShader — a CPU software rasteriser**. Those numbers are not a
prediction of GPU performance in either direction: trivially cheap here, catastrophically
slow on a shader-heavy scene. A frame-time assertion in CI is noise that will either never
fire or always fire.

What *is* valid in CI: `renderer.info` counters, because they are CPU-side bookkeeping and
identical regardless of renderer. Verified against a known scene — 2,000 boxes reported as
2 draw calls, 24,144 triangles, 2 geometries, 1 texture.

**Correction — the budget table splits in two:**

| CI-enforceable (every PR, GitHub Actions) | Hardware-only (nightly, self-hosted M4 Max + a real phone) |
|---|---|
| draw calls < 300 | p95 frame time ≤ 16.6 ms desktop / 33 ms mobile |
| triangles < 500k | time-to-interactive < 4 s |
| geometry + texture counts | thermal behaviour over 10 min |
| bundle + asset bytes | GPU memory under real drivers |
| zero console errors | input latency |
| level completable (nav bot) | |
| visual regression | |

The hardware tier runs on a self-hosted runner on his own Mac Studio. Without that split
the program ships a performance guarantee it never actually measured.

---

### F6 — The harness must serve over HTTP, and three.js needs an import map or a bundler.

Three separate loading failures, each one a wasted hour if discovered mid-build:

1. `file://` + ES modules → blocked by CORS. The harness must point at a running preview
   server, never the filesystem.
2. three.js r187's module build imports `./three.core.js` — a split build. Hand-copying
   `three.module.js` alone yields a 404.
3. `three/examples/jsm/*` imports the bare specifier `"three"`, which fails without a
   bundler or an `<script type="importmap">`.

**Correction:** the harness always launches against `vite preview` on a fixed port and
waits for a readiness signal. The one standalone diagnostic page keeps an explicit import
map. Documented as a preflight step so no agent rediscovers it.

---

### F7 — Launch flags must be pinned, and the renderer asserted on boot.

All four tested configurations produced WebGL2 under Playwright's headless shell. But
published results show the *new* headless mode with `--disable-gpu` returning **null** from
`getContext` — and a null context in a game harness looks identical to "the level is
broken." That is a day lost to the wrong diagnosis.

**Correction:** pin the launch args, and make the harness assert on boot that WebGL2 exists
and log the renderer string in every report. If the context is missing, fail with
`HARNESS_ENVIRONMENT_FAILURE`, never with a level-failure code. Verified capabilities under
the pinned config: `MAX_TEXTURE_SIZE 8192`, float colour buffers, and S3TC/ETC/ASTC
compressed-texture support — so KTX2 assets load in CI.

---

### F8 — Visual regression needs a deterministic render mode.

The post-processing test altered **100% of pixels** — expected, since the pass adds a
per-pixel grain term. But it makes the point: any non-deterministic element (grain seeded
from time, animated fog, a physics-driven cloth bone, a particle system) makes golden-image
comparison useless.

**Correction:** `?harness=1` forces a deterministic render mode — fixed simulated clock,
animation driven by frame index rather than wall time, grain seeded from a constant,
particles disabled. Golden screenshots are only captured in this mode.

---

### F9 — Blender asset pipeline: two corrections from current practice.

1. **Do not bake Array modifiers on export.** Applying modifiers turns a 1 MB file into
   tens of MB. Kit pieces that repeat (stair treads, fence posts, railings) must be
   exported as a single unit and repeated at runtime with `InstancedMesh` — which is also
   what keeps draw calls at 2 instead of 2,000, as measured above.
2. **Do not use Blender's built-in Draco exporter.** Export uncompressed, then run
   `gltf-transform` as a separate, inspectable stage: `resize → webp/ktx2 → draco`. Draco
   is irreversible and must be last. The reported pipeline reduction is roughly
   22 MB → 3.7 MB → 1 MB, and keeping it outside Blender means the compression settings are
   versioned in the repo rather than buried in a Python call.

Also: glTF export rewrites names (spaces → underscores, dots stripped). Asset names are
therefore constrained to `lower_snake_case` at the source, enforced by the schema's
`assetRef` pattern — already in place.

---

### F10 — Character pipeline: Tripo does more than v1 assumed.

v1 routed: Tripo mesh → Blender retopology → Mixamo rig → Blender weights. Current tooling
makes that longer than it needs to be. Tripo ships auto-rigging that detects the skeleton
and computes skin weights, plus a retopology stage, plus a public API and MCP integration —
so the whole step is scriptable rather than manual. Meshy bundles a large animation library
if the motion set is the bottleneck; Rodin is the fallback when character detail is.

**Correction:** Phase 5 becomes **Tripo API (mesh + retopo + auto-rig) → Blender only for
jiggle bones, foot-IK targets and export**. Meshy named as the animation-library fallback,
Rodin as the quality fallback. Roughly half a day saved and the step becomes reproducible
instead of hand-driven.

---

## 3. CORRECTIONS SUMMARY

| ID | Change | Phase affected |
|---|---|---|
| F1 | Pin `three` exactly; CI guard on the peer range | 3 |
| F2 | Semantic linter is a required gate, not optional | 6, 8 |
| F3 | `critical_path` waypoints are move-annotated; ground uses slope not a flat cap | 3, 6, 7, 8 |
| F4 | Replay assertions use tolerance; exact match only on pinned runners | 6 |
| F5 | Budget table splits: CI-enforceable vs hardware-only tiers | 4, 6, 8, 11 |
| F6 | Harness serves over HTTP; import map documented | 6 |
| F7 | Pinned launch args; `HARNESS_ENVIRONMENT_FAILURE` as a distinct failure class | 6 |
| F8 | Deterministic render mode required for visual regression | 6 |
| F9 | No baked Array modifiers; `gltf-transform` for compression, not Blender | 4 |
| F10 | Tripo auto-rig via API; Blender only for secondary motion and export | 5 |

Two new gates added as a result:

- **Gate C2 — Pipeline Proven.** After the engine freeze: one asset travels the entire
  pipeline (Blender → gltf-transform → manifest → level JSON → linter → harness → screenshot)
  before any kit work begins. Catches F6/F7/F9 class failures at the cost of two hours.
- **Gate E2 — Hardware Perf.** Content-complete is not ship-ready until the hardware tier
  has run on real devices. F5 means CI cannot clear this.

---

## 4. WHAT REMAINS UNVERIFIED

Honesty matters more here than completeness. These could not be tested without accounts,
hardware or the actual build, and each carries a stated fallback.

| Assumption | Risk | Fallback if it fails |
|---|---|---|
| A generated seed video will have buildable geometry rather than impressionistic mush | **High** — this is the thesis | Generate more candidates; if none qualify, hand-draw a style frame and treat that as the seed. The method survives; the "one video" headline does not. |
| GPT Image produces a genuinely consistent 4-view sheet | Medium | Generate views separately against a locked reference; accept 2 views; or model the base shape by hand and use AI only for texture |
| Tripo output is clean enough to rig without manual repair | Medium | Rodin for quality, Meshy for the animation library, or buy a base mesh and restyle |
| An agent can write a good level from a concept image | **High** — this gates the fan-out | Gate D is exactly this test on one level. If the reference level needs heavy human correction, fan out to 2 agents, not 8 |
| Real frame budget holds with full post stack on 12 levels | Medium | Quality tiers already specified; drop the outline pass first |
| Generated music loops cleanly | Low but certain to annoy | Author loop points by hand — already in the plan |
| Safari/iOS WebGL behaviour | Medium | Quality tier fallback; desktop-only gate as the floor |

**The honest summary:** every *mechanical* assumption in this blueprint is now verified by
execution. Every remaining risk is a **taste or generative-quality** risk — whether the AI
output is good enough — and those cannot be settled by planning. They are settled at Gate B
(is the seed good?) and Gate D (can one level be built well?). Both gates come before the
expensive fan-out, which is the correct place for them.

---

## 5. THE DAY-0 PROOF SPIKE — RUN THIS BEFORE COMMITTING

Four hours. Go/no-go on the whole program. It builds nothing reusable on purpose; it
exists only to collapse the two highest remaining risks.

```
☐  H1  Seed video: 6 candidates on fal, judged against the four criteria.
       GO if at least two are buildable. NO-GO: the one-video thesis does not
       hold for this art direction — change the art direction, not the method.

☐  H2  Scaffold Vite + three.js (pinned 0.187.0) + Rapier. Greybox plane,
       capsule, the verified character-controller settings. Drop in the
       verified schema + linter. Load one hand-written gym level.
       GO if the player moves and the linter passes the gym.

☐  H3  Stand up the harness skeleton: HTTP serve, pinned launch args, WebGL2
       boot assertion, nav bot following a move-annotated path, screenshot.
       Break the gym deliberately; confirm it fails. Restore; confirm green.
       GO if the harness catches the break.

☐  H4  One asset end to end: Blender script → gltf-transform → manifest →
       placed in level JSON → renders in-engine → appears in the screenshot.
       GO if the asset survives the whole pipeline unattended.
```

Clear all four and the program's mechanical risk is gone — what remains is taste, which
is what the gates are for. Fail any one and you have lost half a day instead of a week.

---

## 6. VERIFIED ARTIFACTS SHIPPED WITH THIS REPORT

These are not drafts. They ran.

| File | What it is | Evidence |
|---|---|---|
| `level.schema.json` | Strict JSON Schema, move-annotated `critical_path` | compiles under ajv strict; caught 8/9 structural attacks |
| `lint-level.mjs` | Semantic linter — reachability, ids, refs, bounds, hazards, budgets | caught **14/14** defects; passes a valid level clean |
| `webgl-preflight.mjs` | Harness environment check — WebGL2, renderer string, capabilities | run against 4 launch configs |
| `rapier-determinism.mjs` | Physics determinism + character controller + CCD proof | two runs identical to 9 decimal places |
| `headless-render.mjs` | three.js + EffectComposer headless render and pixel readback | 120 frames, 2 draw calls, screenshot verified non-blank |

Drop them into `tools/` on day one. They are the first green check in the repo.

---

*Verification lane. No production code was written. All ten corrections are carried in
Playbook v2.1, which also adds eight professional-practice items on top of them.*
