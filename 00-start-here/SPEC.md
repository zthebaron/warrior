# SPEC — Karasu: Flight of the Exile

The output of Phase 0 (P0.1). Every line below traces to a closed entry in
[`PHASE-0-DECISIONS.md`](PHASE-0-DECISIONS.md), cited as `Q#` or `D-###`. When this file and that
one disagree, that one wins and this one has a bug. The look is governed by
[`STYLE-BIBLE.md`](STYLE-BIBLE.md); movement numbers by [`MEASUREMENTS.md`](MEASUREMENTS.md).

**The 20-second test:** *A browser platformer in sumi-e ink. You climb a cliff mountain in four
chapters, running and jumping along the seam between dark rock and bright cloud. Vermilion torii
show you where to go; a crow lifting off tells you when. Die, and you are back at the last torii in
under a second. Reach the summit and you have won. About ten minutes.*

---

## 1. Premise

> A ragged exile in a straw hat climbs a mountain of ink and mist toward the fortress at its
> summit, reading the vermilion torii for where to go and the crows for when.

*PROVISIONAL (OQ-001): the interview never asked the premise question, so this sentence is drafted
from what is already locked: the title, the character in STYLE-BIBLE §7, and the ascent in Q5.
No story systems hang off it. It is framing, not a mechanic.*

## 2. Core verb: leap / traversal (Q1)

Not a chase, and not combat beyond one fenced exception (D-023, ruled by Tim): the swordsman, fought with the
sword slash in the fixed tick, on his own ground, with no route to choose and no random number. Every level's
test stays a deterministic, replayable path, the fight included. The moveset is
frozen at the eight measured moves (Q2):
`ground · jump · double · dash · dashjump · wall · climb · platform`.

**Signal channels (Q2, Q2a):**
- **Vermilion means WHERE.** It appears only on torii, set in sequence along the path as waypoints.
  It never appears on a crow, a hazard, the character, terrain or UI (D-003).
- **A crow lifting off means WHEN.** A lift-off is keyed to a hazard's timer.
- **Nothing translates except the player and hazards.** A perched crow may turn its head (rotation
  in place). Far flocks are painted in place. Mist and pines do not animate.

## 3. Core loop: 30–90 s (Q3)

Arrive at a torii. Read the route along the seam. Wait for the crow. Go. The next torii comes
into view, and that one is the checkpoint. A core loop is 2–3 segments.

| measure | target | enforced by |
|---|---|---|
| nav bot (expert, no deaths) | ≤ 12 s per segment | harness `nav`: `12s × segments` |
| first-time human | 25–35 s per segment | playtest observation |
| core loop | 30–90 s | — |

A **segment** is the run between consecutive torii: spawn → each checkpoint → goal. So
**segments = `checkpoints.length + 1`**. There is one definition, `segmentsOf()` in
`tools/lint-level.mjs`, and both the linter and the bot use it.

## 4. Win condition and session length (Q4)

- **You win by arriving** at the last torii of the last chapter. There is no score, par time, rank
  or unlock. The results state reads `COMPLETE` and nothing else.
- **Session length is a content budget:** 4 chapters × 5 segments = **20 segments, 8–12 min** for
  a first-time player. Production grows by adding chapters, not by stretching them: 12 × 5 ≈ 30 min.
- Chapters 2 and up are **5 ± 1 segments** (linter `CHAPTER_LENGTH`). Chapter 1's length is not
  fixed. It is an output of the teach rate, which the vertical slice will measure
  (`CHAPTER_LENGTH_PENDING`).

## 5. Chapter list (Q5)

Four chapters climbing one mountain, **one level file per chapter**. Each chapter declares
`moves_allowed`, and the linter rejects any `via` outside it, because chapter agents cannot see
each other. Teaching order has to live in the data.

| ch | title | moves added | running total | one line |
|---|---|---|---|---|
| 1 | The Lower Stair | ground, jump, climb | 3 | Cut-stone paths and straight stairs at the cliff base, plus the first crow cue. **This is the vertical slice.** |
| 2 | Fracture Wall | wall, double | 5 | Sheer faces and narrow ledges. Airborne cliff work, still native to the cliff. |
| 3 | The Hanging Shrines | platform, dash | 7 | Shrines built against the cliff, lifts that run along the cliff face, gaps and timing arriving together. |
| 4 | The Summit Fortress | dashjump | 8 | Pagoda roofs, densest timing, a mastery beat rather than new content. The last torii is the win. |

Climb and wall are what the §5 cliff seam affords. Dash is the move that fights it, so it comes
late. `dashjump` combines two moves the player already knows, so it is never taught: the player
discovers it. Every platform attaches to the cliff mass (Q2b).

## 6. Failure model (Q6)

1. **One way to die.** Falling below the fall plane and touching a hazard both enter `death`.
   A hazard is a moving fall plane.
2. **No lives, no game over.** A death costs only the current segment.
3. **Respawn at the furthest torii reached**, never an earlier one.
4. **Hazards are a pure function of the world clock** (`phase + t·speed`) and never reset. You
   respawn, wait for the crow, then go.
5. **Respawn:** target ≤ 0.5 s; the CI ceiling is 1.2 s. The H2.5 feel test picks the value.
6. **Deaths are counted per segment and never shown.** That count is the teach-rate measurement
   that sets chapter 1's length.
7. **`HAZARD_AT_CHECKPOINT`** (lint): no torii radius intersects any hazard's sweep.
   **`PHASE_SWEEP`** (harness stage `phase-sweep`): the bot clears every segment from its
   checkpoint at 8 evenly spaced phase offsets, within 12 s counting the wait. The first proves you can't respawn *into* a hazard; the second proves you
   can always get *out*.

A reload restarts the game. That is a known trade-off, and a showcase item after gold.

## 7. The NOT list (Q7)

Every row resolves to one mechanical check, or says that it has none:

- **`schema`**: a `path=JSON` change to `levels/00-gym.json` that `level.schema.json` must
  **reject**. The field or value does not exist, under `additionalProperties: false`.
- **`src`**: identifier words that must not appear in `src/`. Comments are stripped and
  identifiers are split on camelCase and snake_case, so `playerHealth` trips `health`.
- **`harness`**: a playtest stage that must exist, be registered in `tools/harness/run.mjs` and
  run in CI. It is used where the refusal is behaviour, not a name: `deaths` must exist for the
  harness but must not reach the screen (#20), and things may exist but must not translate (#18).
  The linter checks the wiring. The stage enforces the rule, and was shown to fail on a planted
  violation before the row was listed (B-15).
- **`unenforced`**: nothing checks it. The row exists so the gap is visible.

`npm run lint:not-list` reads this table directly and runs in CI. A trailing **`!`** marks one
check as known to be violated today, with its fix queued (the Q7 schema cut); its row reads
`pending`. The mark is per check, so a pending row still guards every unmarked check. A `!` check
that starts holding fails the lint until the `!` is dropped, so the table can't lag the code.

**The named gap (Q7):** a `src` check is a tripwire for the obvious name, not a proof. An agent
that calls health `vitality` passes. The schema checks have no such hole, because they enumerate
what *does* exist.

<!-- NOT-LIST:BEGIN -->
| # | Refused | Decision | Kind | Check | Status |
|---|---|---|---|---|---|
| 1 | Enemies other than the swordsman (D-023 allows him, as the `enemies` list): charger, ranged, blocker. Any stat on an enemy in level data (`hp`, `aggroRadius`): how he fights is one table in code, not level data. The patroller lives in `hazards`. | Q1, Q7, D-023 | schema | `enemies=[{"id":"a","type":"charger","pos":[0,0,0],"facing":0}]` `enemies=[{"id":"a","type":"swordsman","pos":[0,0,0],"facing":0,"hp":2}]` `enemies=[{"id":"a","type":"swordsman","pos":[0,0,0],"facing":0,"aggroRadius":5}]` | enforced |
| 2 | Combat verbs and input. One exception: the sword slash (D-022), which since D-023 has a hit volume in the fixed tick, and is named `slash` | Q1, D-022, D-023 | src | `attack` `strike` `combo` `parry` `hitstop` | enforced |
| 3 | Pursuit AI: choosing a route, or following the player off a swordsman's own ground. A swordsman walks straight at the warrior on one box top and stops at its edge (D-023) | Q1, D-023 | src | `aggro*` `pathfind*` `navmesh` `chase*` | enforced |
| 4 | A ninth move | Q2 | schema | `critical_path[1].via="glide"` | enforced |
| 5 | A ninth move, in code | Q2 | src | `glide*` | enforced |
| 6 | Pickups and collectibles | Q3 | schema | `collectibles=[]` | enforced |
| 7 | Pickups, in code | Q3 | src | `collectible*` `pickup*` | enforced |
| 8 | Ordered-state puzzles and interactables (bell, gate, plate, lever, door, rope, torch), and triggered platforms | Q3, Q2c | schema | `interactables=[]` `platforms[0].loop="triggered"` | enforced |
| 9 | Any win but arriving | Q4 | schema | `goal.type="collect_all"` `goal.type="defeat_all"` `goal.type="strike"` | enforced |
| 10 | Score, par time, rank | Q4 | schema | `score=1` `par_time=1` `rank=1` | enforced |
| 11 | Score, par time, rank, in code | Q4 | src | `score` `par_time` `rank` | enforced |
| 12 | A second route or branching path | Q3, Q5 | schema | `critical_paths=[]` | enforced |
| 13 | Fire hazard, and any hazard that does damage | Q2c, Q6 | schema | `hazards[0].type="fire"` `hazards[0].damage=1` | enforced |
| 14 | Health, lives, damage, knockback, invulnerability, game over. A swordsman's cut is a death like a fall (D-023); he falls on a counted hit, which is not a health bar | Q6, D-023 | src | `health` `hp` `lives` `damage` `knockback` `invuln*` `iframe*` `game_over` | enforced |
| 15 | Saves, unlocks, chapter select | Q4, Q6 | src | `local_storage` `session_storage` `indexed_db` `unlock*` `chapter_select` | enforced |
| 16 | A light with a direction | STYLE §1 | schema | `lighting.sunAngle=[0,0]` `lighting.intensity=1` | enforced |
| 17 | Multiplayer or a backend | playbook §3 | src | `web_socket` `rtc_peer_connection` | enforced |
| 18 | Ambient motion: anything translating except the player, hazards and swordsmen (D-023). Moving platforms are allowed as the `platform` move (Q2; OQ-054). Shader-only motion is not seen | Q2a | harness | `ambient-motion` | enforced |
| 19 | Dialogue, cutscenes, text in the world (three.js text and DOM-in-world APIs) | STYLE §9.10 | src | `dialogue*` `cutscene*` `subtitle*` `text_geometry` `font_loader` `css2_d` `css3_d` | enforced |
| 20 | A death counter or any run metric shown to the player. `deaths` exists legitimately for the harness, so the check is behaviour: visible text must not depend on run history. Out of scope: the `~` dev overlay, which shows world time in production too (OQ-054 #3) | Q4, Q6 | harness | `run-metric` | enforced |
| 21 | Procedurally generated levels (Blender assets authored as code are not this) | playbook | src | `procedural_level*` `perlin*` `simplex*` `level_gen*` `generate_level*` | enforced |
| 22 | Difficulty modes (a level's `difficulty` 1-5 is a rating, not a mode) | Q6 | src | `difficulty_mode*` `easy*` `hard_mode` `normal_mode` `assist_mode` | enforced |
<!-- NOT-LIST:END -->

## 8. Tuning constants

These are measured values, not placeholders. **Source of truth:** `TUNING` in
`src/entities/player.ts`, `GAME_RULES` in `src/main.ts`, and `MOVE` in `tools/lint-level.mjs`.
A change made in only one of those places is a bug (MEASUREMENTS.md). The engine is frozen at
Gate C, so a change here is a decision, not a tweak.

| constant | value | source |
|---|---|---|
| gravity (rising) | 32 m/s² (×1.5 falling, ×2.5 rising with jump released) | `TUNING.gravity`, `fallGravityMult`, `jumpCutGravityMult` |
| jump impulse | 12.5 m/s (peak ≈ 2.34 u held, ≈ 1.0 u tapped) | `TUNING.jumpVelocity` |
| double-jump impulse | 11.0 m/s (replaces vertical velocity) | `TUNING.doubleJumpVelocity` |
| air control | 28 m/s² with input · 6 m/s² drag without | `TUNING.airAccel`, `airDecel` |
| ground friction | accel 70 m/s² · decel 55 m/s² | `TUNING.groundAccel`, `groundDecel` |
| coyote time | 0.12 s | `TUNING.coyoteTimeSec` |
| jump buffer | 0.1 s nominal, **5 ticks (83 ms) effective** | `TUNING.jumpBufferSec`; MEASUREMENTS |
| dash distance | 20 m/s × 0.16 s = 3.2 u in the dash, **4.0 u measured clear** | `TUNING.dashSpeed`, `dashDurationSec`; `MOVE.dash` |
| dash cooldown | 0.35 s · 1 air dash per airtime | `TUNING.dashCooldownSec`, `airDashes` |
| sprint multiplier | 10 / 7 ≈ 1.43 (run 7.0, sprint 10.0 m/s) | `TUNING.runSpeed`, `sprintSpeed` |
| terminal velocity | 35 m/s | `TUNING.maxFallSpeed` |
| respawn delay | **0.8 s today → target ≤ 0.5 s, ceiling 1.2 s** (Q6) | `GAME_RULES.respawnDelaySec` |
| checkpoint radius | 2.0 u horizontal | `GAME_RULES.checkpointRadius` |

**Linter move budgets** (running approach, from MEASUREMENTS.md; every press timing and approach clean, D-017; the `TIGHT` warning fires at 90%):

| via | max horizontal | max rise |
|---|---|---|
| ground | ∞ | slope 49°, autostep 0.34 |
| jump | 5.0 | 2.00 |
| double | 8.4 | 2.90 |
| dash | 2.6 | 0.34 |
| dashjump | 8.0 | 2.60 |
| wall | 4.2 | 4.00 |
| climb | 7.0 | 4.50 |
| platform | carried | carried |

## 9. Decided but not built (D-002)

This file must not claim properties the code lacks. The list of decided-but-unbuilt rules lives in
one place, **[`state/BACKLOG.md`](../state/BACKLOG.md)**, each with how its absence was verified.
It is not copied here, so it cannot drift. Each decision's `implemented_by:` stays empty until its
commit lands.
