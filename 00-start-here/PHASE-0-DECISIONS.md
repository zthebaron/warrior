# Phase 0 — Decisions (APPROVER: Tim, via REVIEWER)

Answered questions are CLOSED. Do not re-ask them. Record new answers here as they land.

## Q1 — Core verb: **A, leap / traversal.** CLOSED

Not combat, not a chase. The deciding argument is harness integrity, not taste: the moment an
enemy pursues the player with pathfinding, the nav bot's route stops being reproducible, and the
replay harness is the thing the whole build rests on. Traversal keeps every level's test a
deterministic path.

implemented_by: 1191a34 (NOT rows 1-3: no fighting or pursuing enemies, no combat verbs, no pursuit AI, enforced by lint:not-list), 19234ab (schema: `enemies` cut, the patroller lives in `hazards`)

## Q2 — No 9th move. **A.** CLOSED

Ruled out: glide, or any addition to the moveset. Every budget in the MOVE table was *measured*
against the current eight moves. Adding a move invalidates `MEASUREMENTS.md` wholesale and
re-opens the gym. The moveset is frozen.

Signal channels, locked:
- **Vermilion means WHERE.** Torii only, in sequence along the path as waypoint markers (§4).
  Never on a crow, never on a hazard. Under the 1% budget.
- **Crow motion means WHEN.** A lift-off is keyed to a hazard's timer.
- `speed` and `phase` on patrollers are mandatory linter errors, same severity as a missing `via`.
- `HAZARD_ON_PATH` stays a static check. Moving-hazard collisions are the nav bot's job, and the
  spec says so, so nobody expects the linter to catch them.

implemented_by: 1191a34 (NOT rows 4-5: no ninth move, schema and src), 19234ab (B-1: patroller `speed`/`phase` mandatory), f24a9ac (crow cue: a lift-off keyed to its hazard's timer, crow motion means WHEN)

## Q2a — Ambient crows: **confirmed, with a sharper rule.** CLOSED

Yes: if lift-off always means a timing cue, ambient crows can never lift off. A moving ambient
element is a false positive in the one channel the game uses to say "go now," and signal
exclusivity is worth more than ambience.

Write the rule as translation, not animation — it is lintable that way:

> **Nothing translates except the player and hazards.**

A perched crow's idle head-turn is rotation in place and is allowed. Distant flocks in the far
band (80u+) are painted in place. Mist and pines do not animate.

implemented_by: 18a3713 (B-15: harness stage `ambient-motion`, NOT row 18. Moving platforms are allowed as the `platform` move, a PROVISIONAL reading in OQ-054)

## Q2b — Landing readability: **do not amend the Style Bible yet.** CONDITIONAL

The conflict is real. §1 and §9 forbid cast and contact shadows, and with a fixed follow camera
(§8) over flat fills, jump depth is hard to read. The proposed ink dot does pass §10 test 1 — a
mark directly beneath the player implies no light direction — but "it's a brush mark, not a
shadow" is a rationalisation, so decide it on evidence instead of on the category.

The better objection is that the game may not need it. The composition rule (§5) puts the path on
the seam between a dark cliff mass and a bright void, which means a landing target is silhouetted
against the void — more readable than a shadow. Shadows solve landings on platforms floating in
open space. If no platform ever floats in open space, the problem does not arise.

So: **solve it with geometry first.** Keep every platform attached to the cliff mass. Implement
the landing mark behind a flag, **default off**, so the H2.5 feel test can toggle it in place.
If the feel test says depth is unreadable, the mark ships and §9 gets a documented exception.
Do not amend the Style Bible on a hypothesis — same discipline as not putting an unmeasured
number in the budget table.

implemented_by: bf19ded (the flagged mark, B-3), b20296d (shipped on: closed by D-010)

## Q2c — Schema cuts the Style Bible forces: **approved.** CLOSED

- Cut the fire hazard and the torch interactable. Both need either an off-ramp colour or a
  locatable light source; both are forbidden.
- Water hazard survives only as a flat wash.

implemented_by: 19234ab

## Q3 — End of segment: **A, progress only.** CLOSED

**Narrowed (2026-11-12, D-026).** Option C, the gate puzzle, is still refused as a kind of level. One gate now
exists, in chapter 5: it opens when every swordsman of the level is down, nothing is worked by the player, and
it keeps no state. D-026 says what of this entry's reason it keeps.

The torii is the checkpoint, the next torii comes into view, and the whole game is reading routes
and timing. Zero new systems; every hour of the sprint goes into level quality.

The costs of B and C are understated in the question:

- **B (pickups) is not 2-3 days.** It doubles the nav bot's proof obligation per segment. Each
  level needs a second proven route, which turns `critical_path` into `critical_paths` — a schema
  change to the one strict, load-bearing file — and the MOVE validation has to run across both.
  That is a change to the thing that makes fan-out safe, not a content feature.
- **C (gate puzzle) is worse in kind.** Ordered state turns a level's test from "can this route be
  walked" into "can this route be walked in this order." Every level author then has to reason
  about sequencing. That is precisely the complexity levels-as-data exists to exclude.

A does not foreclose B. Pickups are additive to level JSON and can land as a post-gold content
pass, once `critical_paths` is a considered change rather than a sprint-time one.

### Segment length: **30 seconds**, not 45

45s is too long for a *first-time* player when the torii is the checkpoint: a timing-based
traversal game kills first-timers often, and 45s is 45s of lost progress per death. Precision
platformers sit at 20-40s between checkpoints.

Make it a budget rather than a feeling, since the nav bot already times segments:

| measure | target |
|---|---|
| nav bot (expert, no deaths) | <= 12s per segment |
| first-time human | 25-35s per segment |
| core loop (2-3 segments) | 30-90s |

That reconciles the 30-90s core loop with a checkpoint interval short enough to stay fair, and it
is CI-checkable on the bot side.

implemented_by: 19234ab (schema: `collectibles` and `interactables` cut), 1191a34 (NOT rows 6-8 and 12: no pickups, no ordered-state puzzles, no second route)

## Q4 — Win condition and session length: **A, with three amendments.** CLOSED

**Narrowed (2026-11-12, D-026).** Win is still *arrive*. In chapter 5 the arrival counts once every swordsman of
the level is down (`goal.once_clear`); no other goal type exists, and there are five chapters, not four.

Win is *arrive*. No score, no par time, no rank screen, no unlocks in the sprint. The results state
reads `complete` and nothing else. 5 segments per chapter, ~20 segments, 8-12 minutes for a
first-time player.

The two arguments that decide it are both yours and both good: session length is a **content
budget, not a feel number** (five segments per chapter tells someone how much to build; "15-25
minutes" does not), and at a <= 12s bot budget a full end-to-end run is <= 4 minutes, which makes
one complete winnability run per CI pass realistic. *The game is winnable* becomes an assertion
rather than an opinion. B commits to a 2-2.5x authoring cost before the vertical slice has
measured days-per-level, which is the Q2b mistake. C ranks first-time players against a clock,
which fights the 30s checkpoint fairness rule.

Three amendments.

**1. Retire the playbook's 15-25 minute figure explicitly — don't just miss it.** You argued
against the number but left it sitting in the document. That is now the third instance of the same
failure in this build: §H1.1 told agents to generate a locked seed, §P3.1 pointed at a schema path
that never existed, and the playbook will tell the next agent the game should run 15-25 minutes.
A build agent reading it will see 8-12 and helpfully expand scope. Mark it superseded, in place,
with the arithmetic and the chapter-growth path (12 chapters x 5 segments is ~30 min, so
production grows by adding chapters, not stretching them).

**2. Make "no score" structural, not prose.** A commitment in a spec is not a constraint. The
results state and the level schema must simply *have no* `score`, `par_time` or `rank` field, under
`additionalProperties: false`. Your own line from the schema pushback was that a build agent that
sees a field will try to wire it up — the inverse is the enforcement mechanism. Absent field,
absent feature.

**3. Do not fix chapter 1's length.** 5 segments +/- 1 applies to chapters 2 and up. Chapter 1
teaches the primitives, and its length is an *output* of the teach rate, which has never been
measured. Fixing it now sets a number ahead of its measurement, which is what Q2b refused to do.
Let the vertical slice be as long as teaching requires, measure it, then set the rule from the
measurement.

Implementation note: the chapter-length rule needs a linter error code — `CHAPTER_LENGTH` or
similar — alongside `HAZARD_ON_PATH`, `FALL_DAMAGE`, `NO_FALL_PLANE` and `UNMEASURED_MOVE`. A rule
without a code does not get built.

Par time per chapter, taken from the bot's own runs, is deferred post-gold. Agreed as you framed it.

### Q4 — implemented

- **A segment is defined once:** segments = `checkpoints.length + 1`, so spawn → each torii →
  goal. It lives in `segmentsOf()` in `tools/lint-level.mjs`. The linter and the nav bot both
  call it, so there is only one count.
- **`par_time` was not just a display field.** It was the nav bot's timeout (`par_time × 3`). It
  is now removed from the schema, the gym, the example level and both TS types. The bot budget is
  **derived**, not authored: **12 s × segments** (Q3), asserted as its own check, with a 3× stall
  timeout behind it. Gym: 27.85 s / 36 s.
- **The absence is tested.** The harness schema stage now fails if the schema ever accepts
  `score`, `par_time` or `rank` on a level, so re-adding the property breaks CI.
- **Results HUD** reads `COMPLETE` plus the `Enter: menu` key hint. Elapsed time was removed;
  run time is still on the `~` debug overlay, which is dev tooling.
- **`CHAPTER_LENGTH`** is an error for chapter ≥ 2 outside 4–6 segments. Chapter 0 (the gym) is
  exempt. Chapter 1 gets a non-fatal **`CHAPTER_LENGTH_PENDING`** warning, so the rule's existence
  is visible without fixing the number. The example level (chapter 2) previously had 3 segments,
  which the new rule would fail. Two checkpoints were added on waypoints its path already passes
  (wp3, wp8), giving 5 segments.
- **Assumes one level file = one chapter.** The rule counts per file. Q5 confirms or changes this.
- **Docs superseded in place:** the playbook's 15–25 min line (with the arithmetic and the
  chapter-growth path), plus every live instruction that told an agent to set or compare against
  `par_time` (playbook ×3, prompt pack ×5, dashboard prompt ×2). `H3-HARNESS-PROOF.md` and
  `DAY-0-PROOF-SPIKE.md` are run records and were left as they are.
- **Seen, not fixed (out of Q4 scope):** playbook Phase 7 still lists combat, "scroll counts" and
  chapter select, which conflict with Q1/Q3.

implemented_by: afb3e4b

## Q5 — Chapter structure: **A, with the move order changed.** CLOSED

Four fixed chapters climbing one mountain, one level file each, per-chapter `moves_allowed`
declared in the level JSON and enforced by the linter. B and C are both rejected for the reasons
you gave, and the second one is the right reason: C would need a chapter manifest spanning files,
which is a schema change to the main level file — the same cost that ruled out B in Q3.

Your load-bearing argument is correct and worth restating because it generalises: **teaching order
has to live in the data, because chapter agents cannot see each other.** With fan-out, the chapter 2
agent never reads chapter 1, so without a declared move set every agent builds with everything the
gym proves and a first-time player meets dash-jump in the first minute. Same shape as `via`: the
agent declares, the linter checks.

Also right, and the best instinct in the question: **chapter 1 must contain a crow cue**, because
the vertical slice should prove the riskiest unproven thing in the design, and movement is already
proven by the gym. A chapter 1 without the crow proves nothing new.

### The move order — take your own alternative, not your primary

You offered wall and climb in place of dash in chapter 1 and flagged it as the part most worth
challenging. It is the better option, and the reason is §5: every chapter is a cliff seam, so
**climb and wall are what the architecture affords, and dash is the move that fights it.** Teaching
the incongruent move first teaches the player to read the level wrongly.

| chapter | moves added | running total | notes |
|---|---|---|---|
| 1 | ground, jump, climb | 3 | + the crow cue. Climb is slow and forgiving — ideal for teaching the seam read. |
| 2 | wall, double | 5 | airborne cliff work, still cliff-native |
| 3 | platform, dash | 7 | timing and gaps arrive together, after the crow cue is established |
| 4 | dashjump | 8 | densest timing; the last torii is the win |

`dashjump` is a **compound** of dash and jump, so it is never taught — it is discovered once both
components are fluent. Putting it alone in chapter 4 makes the final chapter a mastery beat rather
than a new-content beat, which is also cheaper to author.

This is 3/2/2/1 rather than a flat spread: chapter 1 carries 3 moves plus 1 signal, which is the
teach rate Q4 deliberately left unmeasured. Measure it in the vertical slice, then set the
chapter-length rule from the measurement.

implemented_by: cf642c7 (moves_allowed + MOVES_ALLOWED/CHAPTER_MOVE). Chapter levels, as content: 01-lower-stair (chapter 1; climb moved out by D-015a), 02-cliff-seam (chapter 2: wall, double, climb; 226c9ef, design calls OQ-056). Chapters 3-4 not yet authored.

## D-001 — The navigational accent is **authored, not measured.** DECIDED

H4 measured the reddest pixels across all 36 seed frames and found median `#603633` at 0.012% of
frame area, noting honestly that `palette.json` omits it *because it never clustered*. That
measurement is sound and stays in `MEASUREMENTS.md` as a fact about the seed.

**It is rejected as the accent colour.** `#603633` is RGB(96,54,51) — lightness ~29%, saturation
~31%. The palette ramp sits at lightness 50-80% with saturation ~12% in a warm yellow-orange hue.
A dark, muted brick reads as *another dark shape*: against the dark cliff mass of §5 it vanishes,
and against the bright void it is just a silhouette. Q2 locked "vermilion means WHERE." A colour
that does not separate cannot carry a navigational signal, and being under the 1% area budget is
the wrong test — the test is whether a player scanning the frame finds it.

The category error is instructive: the palette's job is to describe what the seed looks like. The
accent's job is to do something **the seed never needed to do.** Twelve seconds of
non-interactive footage had no reason to contain a waypoint signal, so measuring it for one cannot
work. This is the project's first authored colour, and it is recorded as a decision rather than
slipped in as a measurement.

Set it by function, then test it:

- new lint rule **`ACCENT_CONTRAST`** — the accent must exceed a minimum perceptual distance from
  *every* entry in `palette.json`. Use CIE Lab dE2000 with a stated threshold; failing that, a
  minimum delta in both chroma and lightness from the nearest entry.
- the 1% area budget and torii-only placement from Q2 are unchanged
- `#603633` stays recorded as the seed's measured red, explicitly NOT the accent

Do not pick the final hex by fiat. Generate two or three candidates that pass `ACCENT_CONTRAST`,
render them on the torii in the gym, and let the H2.5 feel test choose — the same mechanism Q2b
used for the landing mark. A real vermilion is near `#E34234`; expect the answer in that
neighbourhood, at palette lightness or above.

implemented_by: e8b0f8b (ACCENT_CONTRAST rule, accent.json, lib.py reads palette + candidates), 837c057 (?accent=<name> in-place switch), 31fb4a5 (candidate renders) — branch h4-asset-kit, PR 3. Choice of candidate: H2.5, open.

## Q6 — Failure model: **A, with one addition and one change.** CLOSED

All seven parts stand except the respawn time. The reasoning is good throughout; two parts are
better than good:

**"A hazard is just a moving fall plane"** is the right reduction, and the knockback argument is
the reason: knockback is a physics reaction that puts the player somewhere no level author planned,
sometimes off a ledge and sometimes not, which is precisely the non-reproducible route Q1 ruled
out. Treating a hazard touch as death adds *no new system at all*.

**Hidden per-segment death counts are the teach-rate measurement** Q4 and Q5 both left open. That
closes the loop: chapter 1's length rule comes from a number the harness already records, and a
visible counter would be a score by another name (Q4). Best idea in the answer.

The respawn bug at `src/main.ts` is confirmed — `respawn` is reassigned unconditionally for any
checkpoint in radius, so walking back through an earlier torii drags the respawn point backwards.
Note `checkpointLog` is already append-only, so the fix is to gate the assignment on a furthest-
index counter rather than add new state.

### ADDITION — `PHASE_SWEEP`, a new harness stage

Part 4 says hazards never reset and run on the world clock. That is correct, and it creates a
hole nothing currently checks. **A player who dies arrives back at the torii at an arbitrary
hazard phase.** With per-hazard `phase` and `speed`, two hazards on incommensurate periods can
produce arrival phases from which a segment is impassable, or passable only after an
unreasonable wait. Verified: `levels/level.schema.json` has no `phase`/`speed` yet, and
`tools/harness/` has no hazard-phase handling at all — `nav.ts`'s `phase` is its own
approach/air/done state machine, unrelated to hazard timing.

In a die-and-retry game, a segment that becomes unwinnable *after a death* is the worst defect
available, and it would be intermittent, which makes it nearly impossible to diagnose from a bug
report.

So: the nav bot must clear each segment **entering from its checkpoint at N evenly-spaced phase
offsets**, not only from the recorded start. Eight is a reasonable N. This is the dynamic
counterpart to `HAZARD_AT_CHECKPOINT`: the linter proves you cannot respawn *into* a hazard, the
sweep proves you can always get *out*.

### CHANGE — respawn target 0.5s, with 1.2s as the CI ceiling

Keep 1.2s as the hard assertion, but it is a ceiling, not a target. Deaths are the teaching
mechanism by part 6's own logic, so respawn latency is paid constantly by design. Precision
platformers sit at 0.3-0.5s. The usual argument for a longer respawn — letting the player
re-orient — does not apply here, because §5's dark-mass/bright-void composition makes the frame
read instantly. Target <= 0.5s, assert <= 1.2s, and let the H2.5 feel test pick the value, the
same mechanism as Q2b and D-001.

### Flagged, not acted on

"A reload restarts the game" is fine for the sprint, but it has a showcase consequence: anyone
trying the game from the case-study page who refreshes loses everything. Post-gold showcase item,
not a design change. Noted so it is a known trade rather than a surprise.

implemented_by: b5a1939 (respawn at the furthest torii reached, the furthest-index gate), 6dcc157 (touching a hazard is death; the world clock runs during death, D-004), 7fa2b70 (ADDITION: PHASE_SWEEP harness stage), 3c076da (CHANGE: respawn delay live for the feel test, CI ceiling 1.2 s), 4c167ef (hidden per-segment deaths recorded by the instrument, nothing rendered), 18a3713 (no visible death counter or run metric: harness stage `run-metric`, NOT row 20)

## D-002 — Decisions must name their implementing commit. DECIDED

This file now asserts properties the code does not have: Q2's mandatory `speed`/`phase` linter
errors, Q5's `moves_allowed` and its check, D-001's `ACCENT_CONTRAST`, and now `PHASE_SWEEP`,
`HAZARD_AT_CHECKPOINT` and the respawn fix.

That is the stale-prompt failure inverted — a document running *ahead* of reality rather than
behind it, and just as capable of misleading an agent that trusts it. Decisions are accumulating
faster than implementation, which is fine, but it has to be visible.

Every decision entry gains an `implemented_by:` field, empty until the commit lands. Add a lint
rule reporting any CLOSED decision with no implementing commit. Fold this into PROMPT 00's control
plane: `state/DECISIONS.md` gets the same field and the same check.

implemented_by: af219b2 (B-11: lint:decisions, in CI)

## D-003 — The 1% accent budget is withdrawn. My error. DECIDED

The kit session measured a single torii at **2.06% of the gameplay frame**, flagged it as
conflicting with a closed decision, and stopped rather than adjusting it. That was the correct
call and the finding is correct. The budget is what is wrong.

`STYLE-BIBLE.md` §2 says: *"the accent must not exceed 1% of frame area. This is measured, not a
guess — when the palette was extracted by k-means at k=8 across all 36 frames, the vermilion did
not form a cluster at all. It is that rare."*

That is a non-sequitur, and I wrote it. "It never clustered" establishes that the seed contains
**no** vermilion. It says nothing whatever about how much frame area the accent should occupy. An
absence was converted into a budget and then labelled measured.

It is the same category error diagnosed in D-001 four commits earlier, committed by the reviewer
rather than the agent: the palette describes the seed; the accent must do a job the seed never
needed done. Twelve seconds of non-interactive footage had no waypoint signal, so it cannot
source either the accent's hue *or* its area.

### What replaces it

Area alone cannot express the rule, because §4 places torii "in sequence, two or three receding
into mist." The same gate occupies a large fraction of the frame in the near band (0-25u) and
almost none at 80u+. A single percentage conflates distance with intent.

The real restraint is **what carries the accent**, which was always the load-bearing part and is
unchanged:

- the accent appears on torii and on nothing else, ever
- never on the character, terrain, stone, trees, mist, sky or UI

And the constraint nobody specified is a **floor**, not a ceiling. The accent's job is to be
findable. In a gameplay frame where the next torii is visible, it must occupy *at least* a minimum
area or it fails as a waypoint — which is exactly how `#603633` at 0.012% failed.

So: replace the fixed 1% with a **band, measured at the gameplay camera** — the `follow` framing
the session just built (`CAMERA_TUNING.distance`, ~7m behind the player, next torii ~6m ahead).
That is the frame where findability matters, and 2.06% there is evidence of a working waypoint, not
of excess. Derive the floor from the smallest area a player reliably finds while scanning, and the
ceiling from the point a gate starts to dominate the frame.

`ACCENT_CONTRAST` (D-001) gains a sibling: **`ACCENT_AREA`**, asserting the band at the gameplay
camera rather than a global percentage.

Amending a locked Gate B artifact is legitimate here, and only here, because the amendment rests on
a measurement. That is the distinction Q2b drew: do not amend the Style Bible on a hypothesis;
do amend it on evidence.

implemented_by: 1dc3a33 (ACCENT_AREA harness stage + band in accent.json), be27071 (STYLE-BIBLE §2 / §9 / §10 amended) — branch h4-asset-kit, PR 3. Floor provisional: state/OPEN-QUESTIONS.md OQ-020.

## Q7 — The NOT list: **A, with one addition.** Reversed for enemies only by D-023. CLOSED

**Superseded in part (2026-11-10, D-023).** Tim ruled enemies in: the schema has an `enemies` list again, for one
type, the swordsman. Everything else here stands: interactables and collectibles are still cut and still refused.

Cut the refused fields from the schema. B is what Q4 amendment 2 already rejected for `score`:
keeping a field and adding a linter error leaves it visible in the schema an agent reads, and turns
the linter into a second schema written in the opposite direction. C is the status quo, and the
example level is the evidence of what it produces.

Your strongest argument is one worth keeping as a general rule: **agents copy examples more
faithfully than they follow rules.** An example level containing a charger, a bell, a gate and a
scroll teaches all four refused mechanics regardless of what SPEC.md says. The example is the spec.

### ADDITION — every NOT row must name a mechanical check, or it is not enforced

An enforcement column is still a table someone has to read. Each row must resolve to one of exactly
two mechanical kinds:

1. **a schema field that must not exist** — checked against `level.schema.json` under
   `additionalProperties: false`; this covers everything being cut now
2. **an identifier that must not appear in `src/`** — checked by grep; this covers mechanics that
   were never schema fields at all, such as health, lives, damage or invulnerability frames

A row that is neither is unenforced, and the column must say so rather than implying coverage.
Add `lint:not-list` to run both checks in CI.

Kind 2 is the gap worth naming: the schema cut cannot protect against a concept that was never in
the schema. Nothing stops an agent adding `health` to the player entity, and no field was removed
to prevent it.

implemented_by: 1191a34 (lint:not-list), 19234ab (schema cut)

## D-004 — The world clock must advance during the death state. DECIDED

Found while verifying the ground for B-7, before the patroller runtime was written.

The good part first: `runTimeSec = 0` is inside `install()` in `src/main.ts`, which is called only
from `startLevel()` and `hotReload()`. The respawn path in `onRender` teleports the player and
nothing more. **The world clock is therefore not reset on death**, and Q6 part 4 is achievable by
reading it.

The problem: `runTimeSec += dt` is guarded by `if (!state.is('play')) return;`, so the clock
**freezes** for the whole death state. A hazard reading it would resume at exactly the phase it
held when the player died — every single time.

That is a third behaviour, and nobody chose it:

| behaviour | what the player sees | status |
|---|---|---|
| clock runs during death | you respawn at a new phase, wait for the crow, go | **Q6 part 4 as written** |
| clock resets to zero | every attempt identical from the start | Q6 option C, **rejected** |
| clock frozen at death | every attempt identical from the death phase | **what the code does today** |

Frozen is not a compromise between the other two — it delivers the *outcome* C was rejected for.
Q6 rejected C because per-respawn repeatability makes timing memorisable instead of readable, and
freezing reproduces that exactly while also giving each checkpoint a different fixed phase
depending on where the player happened to die.

It would also have made `PHASE_SWEEP` (B-7) a test of something the game never produces: the
sweep would exercise eight arrival phases while the running game only ever delivers one.

**Decision: advance `runTimeSec` during the `death` state.** Keep it frozen during `pause` —
pausing should not let the world move, and a play-time clock rather than a wall-time clock keeps
replays deterministic. The gate becomes "advance in `play` or `death`, not in `pause`, `menu`,
`loading` or `results`."

implemented_by: 6dcc157

## D-005 — `HAZARD_AT_CHECKPOINT` (B-8): the geometry, written before the code

B-8 is correctly the next item: `PHASE_SWEEP`'s wait arithmetic assumes standing at a torii is
safe, and nothing establishes that. But there is an implementation of this check that *passes* while
under-reporting, so the geometry goes on the record first.

Measured facts it must use (not invent):

| quantity | value | source |
|---|---|---|
| checkpoint activation radius | 2.0 m horizontal | `GAME_RULES.checkpointRadius` |
| goal height tolerance | 2.0 m | `GAME_RULES.goalHeightTolerance` |
| player capsule radius | 0.35 m | `TUNING.capsuleRadius` |
| player capsule half-height | 0.6 m → total height 1.9 m | `TUNING.capsuleHalfHeight` |
| patroller extent | `size` (vec3, **FULL** extents — halve it) | schema; `tools/lint-level.mjs` line 40 |
| patroller route | `path`, 2-12 points | schema |

### Four things the obvious implementation gets wrong

> **Correction (OQ-017).** This section originally called `size` *half-extents*. It is **full**
> extents — `lint-level.mjs` states so and halves it before use. The implementer trusted the code
> over this prose and got it right, which is `CLAUDE.md`'s precedence rule working as written:
> where prose and a linter disagree, the linter holds and the prose is the bug. Nothing shipped
> wrong; the spec above is corrected rather than the code.

**1. Both volumes need inflating, not just one.** The test is not "does the `path` polyline come
within 2.0 m of the torii." A patroller is a box, not a point on a line, and the player is a
capsule, not a point. The swept volume is `path ⊕ patroller half-extents`, and it is tested against
the player capsule, not against a bare position. Testing the polyline alone under-reports by
roughly `size + 0.35` in every direction.

**2. The vertical window is the player's body, not `goalHeightTolerance`.** `c.pos` is a *feet*
position — `main.ts` compares against `player.feet()`. So a player standing at a checkpoint occupies
y from `c.pos[1]` to `c.pos[1] + 1.9`. A patroller 1.5 m above the feet hits the player's head.
Using `goalHeightTolerance: 2.0` as the vertical window looks right and is wrong for a different
reason — it happens to be numerically close to 1.9, which is exactly what makes the mistake
invisible. Use the capsule extent.

**3. The check is 3D. A 2D xz test is worse than no check.** Activation requires horizontal
distance **and** `|Δy| < tolerance`, so a patroller crossing 5 m overhead is not a threat. An
xz-only test reports it as one, which blocks legitimate layouts, and a rule that produces false
positives gets weakened — which is how a real check dies.

**4. Error on the respawn point; warn on the activation disc.** Two different claims:

- **error** — the player capsule at `c.pos` intersects the swept volume. This is the unwinnable
  case: you respawn inside a hazard. Inflate by `capsuleRadius` plus a small margin.
- **warn** — the swept volume enters the activation disc (`2.0 + 0.35 = 2.35 m`) without touching
  the respawn point. A player waiting off-centre can be clipped, but it is a skill matter, not an
  unwinnable state. Demanding the whole disc be clear would forbid a lot of valid level geometry.

This mirrors the existing split: `NO_FALL_PLANE` and `FALL_DAMAGE` warn, structural faults error.

### Why it is static, and must stay static

Patrollers are periodic and the wait is unbounded, so **any** overlap at **any** phase will
eventually occur while the player stands there. Phase therefore does not enter this check — do not
evaluate it "at phase 0," which would miss most defects. That phase-independence is precisely what
makes it a linter rule rather than a harness stage, and it is why it complements `PHASE_SWEEP`
rather than duplicating it.

Conservatism is the correct bias: treat each path leg as an AABB expanded by the half-extents. It
over-reports slightly at corners. A false positive costs a level author one edit; a false negative
ships a checkpoint that kills the player on arrival.

### Scope

Apply to every place the player stands still: `spawn`, every entry in `checkpoints`, and `goal`
(using the goal's own `radius` where it is set).

implemented_by: c640e4b

## D-006 — `ACCENT_AREA` is a floor at scanning distance, not a ceiling. DECIDED

The accent renders (`docs/build-log/accent/`) and the area curve settle part of D-003 and expose
what the renders cannot settle.

### What the renders prove

`seed_red` (`#603633`) is visibly dead. In the contact sheet it reads as dark brown merging with
the rock mass and the ground slab, and in the goal shot it is an undifferentiated dark silhouette
against sky. D-001 rejected it by argument; this is the picture of that argument, and it fails
even against an *easy* background.

### What the renders cannot prove, and why

`accent-renders.json` flags it itself: *"grey-box gym (lit primitives, blue sky), not the
STYLE-BIBLE render."* The background is blue sky. Any red separates from blue sky. The question
D-001 actually asks is how the accent reads against the **eight-value warm-grey ramp** — which is
the single background these renders do not contain.

So the sheet is sound evidence for the rejection and no evidence at all for choosing among
`vermilion_a` / `_b` / `_c`. **Re-render the three survivors against the palette background
before the feel test**, or the test asks a human to judge the wrong image.

### The area band, from the curve rather than from taste

The curve shows accent area is a pure function of camera distance — it is geometry, not colour,
so it is identical for every candidate:

| player distance from torii | camera to torii | accent % of frame |
|---|---|---|
| 0 m (standing at it) | 7.6 m | **9.04%** |
| 2 m | 9.4 m | 5.14% |
| 4 m | 11.3 m | 3.31% |

The withdrawn 1% ceiling was being exceeded ninefold at the gate, which is further confirmation
that D-003 was right to withdraw it — but it also shows a ceiling is the wrong instrument
entirely. **Walking through a gate legitimately fills the frame.** A ceiling would forbid the one
moment the accent is supposed to dominate.

`ACCENT_AREA` is therefore a **floor measured at scanning distance**, not a ceiling at the gate:

> When the next torii is in frame at scanning distance, its accent must occupy at least the
> minimum area a player reliably finds while sweeping the frame.

Extend the curve past 4 m out to the distance at which the next gate first becomes visible, and
set the floor from where findability actually fails — the same way `#603633` failed at 0.012%.
Do not set it from the values above, which are all near-field.

implemented_by: 29b41c0 (floor at scanning distance in the `accent` stage; curve + swatches against the ramp, tools/harness/accent-floor.ts) — branch h4-asset-kit, PR 3 (folded in from b6-accent-floor). Floor provisional: OQ-026..028.


## D-007 — Landing mark (B-3): the constraints, before the code

Q2b put the landing mark behind a default-off flag so the H2.5 feel test decides it. Three things
are not obvious, and one of them breaks CI if missed.

**1. It must not imply a light source.** §10 test 1 is "can you tell where the light is?" So: a
hard-edged flat disc directly beneath the capsule, no softness, no penumbra, no directional
offset. The moment it has a soft edge or sits off-centre it is a shadow, and §1 and §9 forbid
shadows. Colour comes from the palette — `ink-black #20201e` or `ink-deep #383838` — never a new
value, and it is **not** the accent, so it does not touch `ACCENT_CONTRAST` or `ACCENT_AREA`.

**2. Turning it on changes `renderer.info` and will fail the Tier-1 budgets.** The harness
asserts draw calls, and adding a per-frame mesh adds one. Default-off keeps CI and the visual
goldens untouched, which is the mechanical reason default-off matters, not just the political one.
But the feel test runs with it **on**, so either batch it into an existing draw call or give the
budget assertion an explicit exemption when the flag is set. Decide that before writing it, or the
first toggled run reports a budget regression that is not one.

**3. It answers "how far down is the ground," not "where will I land."** Q2b specified a mark
*straight down under the player*, which reports current ground distance. A landing *predictor*
integrates ballistic motion and marks the arrival point — a different and stronger affordance.
Keep what Q2b specified. But record the distinction now, because if the feel test comes back
"still cannot judge depth," the correct next move is the predictor, **not a bigger dot.**

Flag convention: follow the accent's `?accent=<name>` precedent with `?landingmark=on`, plus a
`TUNING` constant so it is switchable in place during the feel test. Scale the disc by the
downward raycast distance — `physics.castRay` already exists for the camera rig, so no new system.

implemented_by: bf19ded

## D-008 — A water hazard needs a kill volume or it is not a hazard (OQ-016). DECIDED

`HazardDef` makes `y`, `pos` and `size` all optional, so a `water` hazard carrying only a height
has no kill volume and never kills anything. The schema currently permits a hazard that does
nothing, which is worse than forbidding it: a level author gets a water hazard that silently
isn't one, and the linter says nothing.

Q2c restricted water to a flat wash for a **visual** reason — §9.8 forbids a reflective surface —
not to demote it to decoration. It is still a hazard, rendered flat.

So water must carry one of two things, and the linter errors when it carries neither:

- a **plane**: `y`, behaving like `fall` — anything below it dies, which is what a flat wash at a
  fixed level naturally means; or
- a **volume**: `pos` + `size` (full extents), for a bounded pool.

New code `NO_KILL_VOLUME`, at error severity, alongside the existing `NO_PATROL_SIZE` — which
already applies the same principle to patrollers and whose message is the right precedent: *"its
kill volume. There is no default (no unmeasured numbers)."*

The general rule worth extracting: **a hazard type that can be authored with no effect is a
schema defect, not an author error.** Audit `spike` and `crush` for the same hole while
implementing this.

implemented_by: 6a88496

## D-009 — The harness has a feature cost, and it is now priced. FINDING

Reviewed the original Sumiro build thread (@xikhar) against this build. Their pipeline is the one
this playbook reconstructed — a single fal video as the reference for look, world and character;
screenshot it, rebuild in Blender, place in three.js; GPT Image for a 4-view character sheet, Tripo
for image→3D, Opus for cloth and animation; GPT Image for up to 8 concept images per level; build,
play, report bugs, agents fix, repeat.

### Two assumptions of ours that the thread refutes

**They have a bot.** *"The demo video in the post was recorded by claude so it's a bot playing in
them. Hence it looks a bit stiff."* And **they fan out**: *"dynamic workflows in Claude Code, so
agents build and check in parallel."* Neither a playing bot nor parallel agents is a differentiator
here.

The distinction that does survive is narrower and sharper. **Their bot is a demo recorder; ours is
an acceptance gate.** Theirs must complete a run once, well enough to film. Ours must prove every
route from every checkpoint at eight hazard phases, on every commit, so that agents can author
levels without a human playing each one.

### The finding

They ship **combat** — *"as the game progresses you fight different enemies"* — and
**collectibles**, visible in their menu as *"Scrolls: 1 of 12."*

Q1 rejected combat because chase AI breaks nav reproducibility. Q3 rejected pickups because they
double the bot's proof obligation per segment. Both decisions were correctly argued. So were
theirs.

The difference is not judgement. **Every feature our decisions cut was cut by the verification
architecture, not by taste or time.** A demo-recorder bot does not care whether an enemy's
pathfinding is deterministic. An acceptance-gate bot cannot function without it.

So the honest framing of this build versus that one is not careful-versus-fast. It is **more
features verified once, against fewer features verified continuously** — and the harness has a
feature cost that is now visible rather than implicit.

### What this does NOT mean

It is not an argument to reverse Q1 or Q3. The gate is what lets agents fan out, and that is the
thing being proven. But if enemies are ever wanted, the move is **not** to weaken Q1. It is a
second bot tier:

- **tier 1, deterministic** — traversal. Route identity asserted, replay byte-stable. Unchanged.
- **tier 2, non-deterministic** — combat encounters. Assert *survivability over N seeded runs*
  rather than route identity: the encounter must be winnable from its entry state in k of n runs.

Route identity and survivability are different claims, and only the first needs determinism. The
same split applies to pickups: a collectible route needs reachability, not identity.

### Also noted

- **Audio is unsolved in both builds, for the same reason** — *"I know music sucks. Claude cannot
  hear it."*
- **They played the prototype at step 4 of 6.** We have built a complete verification apparatus
  and have still never played the game. That is the real asymmetry, and it is not about speed.
- Lineage: their thread credits Video2Game by @OdinLovis.

implemented_by: n/a — finding, no code

## D-010 — The landing mark ships. Q2b resolved by the feel test. CLOSED

Tim ran the H2.5 comparison at `localhost:5173/` against `?landingmark=on` and the verdict is
unambiguous: **with the mark is better, and it works.** Q2b has been CONDITIONAL since this
morning; it is now closed.

This is the mechanism Q2b specified working exactly as intended. The mark was not argued in, it
was **built default-off and decided by playing**, which is the same discipline D-003 applied to the
accent budget and D-006 to the accent area: do not amend the Style Bible on a hypothesis, do amend
it on evidence. The evidence exists now.

Also settled by implication: the straight-down mark is sufficient. D-007 reserved a ballistic
landing *predictor* as the next move **if** depth stayed unreadable. It did not. The predictor is
dropped, not deferred — bringing it back would need a new decision and a new reason.

### Flipping the default is four changes, not one

`TUNING.landingMark` goes to on. Everything below follows from that and none of it is optional:

1. **The visual goldens move.** Every golden was recorded with the mark off. Re-record them
   deliberately, on both platforms, and say so in the commit — a golden re-record is how a visual
   regression test gets silently defeated, so it needs to be an announced act with a reason.
2. **The Tier-1 draw-call budget moves.** D-007 flagged this: the mark adds a per-frame mesh.
   Either batch it into an existing draw call or raise the asserted count by exactly one, with the
   new number recorded in `MEASUREMENTS.md` like every other budget. Do not let it ride as an
   unexplained +1.
3. **`STYLE-BIBLE.md` §9 needs the exception written in.** The forbidden list currently bans
   contact and cast shadows outright. The mark is neither — it is a hard-edged flat disc directly
   beneath the capsule with no softness, no offset and no implied light direction, which is why it
   passes §10 test 1. Write that distinction into §9 explicitly, because the next agent reading
   "no shadows" and seeing a disc under the player will otherwise file it as a violation.
4. **The flag inverts.** `?landingmark=off` becomes the comparison switch. Keep it: the ability to
   A/B this in place is worth more than a tidy constant, and it is how the decision gets revisited
   if a later level makes depth read differently.

implemented_by: b20296d (default on, flag inverted, Style Bible exception, scene ratchet, darwin goldens), c512c78 (linux goldens)

## OQ-034 — crow lead time: **CONFIRMED as taken (B).** CLOSED

Authored `lift` per crow, sufficiency proven by the harness, effective lead measured and reported.

Right for the reason given — no human-reaction number exists in `MEASUREMENTS.md` and `CLAUDE.md`
forbids one in code — but the stronger argument is the one not made: **the harness proves
sufficiency without knowing the correct value.** The bot departs on the lift-off edge and must
clear from all eight arrival phases, and a quarter-loop mistimed `lift` fails 0/8. That is a
property test standing in for a constant nobody can yet measure, which is the same move the MOVE
table makes and the opposite of guessing.

The number that matters most in the report is not the lead, it is the **slack**: departing up to
0.75 s (seg 3) and 0.95 s (seg 4) after lift-off still clears every phase. The window is forgiving,
so the cue can be late and still work.

**What H2.5 must measure for C to become possible**, stated now so the test is designed for it: not
"the right lead time" but **how late a human can depart after lift-off and still clear**, compared
against the bot's 0.75 s / 0.95 s. If human slack is comfortably inside the bot's, the cue is
sound and `lift` can be derived. If it is not, the problem is the cue's legibility, not its timing,
and a bigger lead will not fix it.

implemented_by: f24a9ac (authored `lift` per crow: schema, runtime, lint, bot departs on the lift-off edge, sweep), e973c6c (cue-window measurement: effective lead and slack reported)

## D-011 — Chapter length is derived, not ranged. OQ-037 **OVERRIDDEN.** DECIDED

The session took A: leave `CHAPTER_SEGMENTS` at 4-6 and record C as a description of what chapter 1
happened to do. **Adopt C as the rule instead.**

C: *one segment per new move or signal that can kill you, plus one transfer segment for the
riskiest.*

A range of 4-6 is a bound, not a reason. No agent can justify choosing 6 over 4 from it, so the
number becomes taste, and taste is what fan-out cannot share. C is a **derivation**: it produced 4
for chapter 1 without anyone picking 4, and it is computable from `moves_allowed`, which B-4 already
put in the schema. A rule that falls out of data an agent already has is worth more than a range it
has to feel its way inside.

It is also lintable in a way the range is not. The linter can count new killing moves plus new
signals in a chapter and assert the teaching-segment count. A range can only be checked for bounds,
never for correctness.

Two things to pin down while implementing:

- **"Practice segment" needs a definition**, since C says *plus practice* and leaves it open: a
  segment that introduces no new move and no new signal, and combines only moves already taught.
  Count them separately from teaching segments.
- **Keep 4-6 as a warn, not an error.** C is the error. The range stays as a sanity check that
  fires when a derivation produces something far outside it, which usually means the moveset
  changed rather than the rule failing.

`CHAPTER_LENGTH_PENDING` can be retired once C is implemented.

implemented_by: aa55016 (derivation lint CHAPTER_TEACH / CHAPTER_TRANSFER / SEGMENT_UNPLACED; 4-6 as a CHAPTER_LENGTH warn; CHAPTER_LENGTH_PENDING retired; example fixture fixed), c03fe4a (OQ-042 renaming: RECOVERABLE_MOVES, the reason in every message) — branch d011-d012, PR #8

## D-012 — `ACCENT_AREA` is measured at a reachable camera, not only at rest pitch. OQ-038. DECIDED

Chapter 1: **A was correct, ship it.** The level changed, the rule did not, and refusing to weaken
a measured rule to fit content is exactly right. That is not in question.

But the session found the real problem and was right to escalate it: with two stacked 3.5 m faces,
the upper lip hides everything below +8.4°, the previous gate's crossbeams cover +5..+14°, and the
frame tops out at +12°. Rendered accent: **0.0000% at both 21 m and 33 m.** The rule made a
two-climb segment impossible.

**This game climbs a mountain. A player looking up for the next gate is the normal case**, so a
floor evaluated only at the rig's rest pitch is measuring a frame the player does not use on a
vertical segment. D-006 said "measured at the gameplay camera"; the defect is in *which* gameplay
camera, not in the floor.

So before chapters 2-4 author vertical segments, amend the measurement frame — **not the floor**:

> The accent floor must be met in **some frame reachable by normal camera control**, within the
> pitch range the rig actually permits, not solely at rest pitch.

The guard that keeps this from being a weakening: the pitch range is bounded by what the camera can
physically do, and the floor itself is unchanged. A gate findable by looking up passes. A gate
findable from **no** reachable angle still fails, which is the case the rule exists to catch.

Implementation note: `tools/harness/scan-frame.ts` already renders the scan; it needs to sweep
pitch across the rig's range and take the best frame rather than the rest frame.

implemented_by: aa55016 (accent stage: best frame over the rig pitch clamp, arm pulled in by the shared allowedArm collision; harness rigCamera; scan-frame.ts sweeps the same pitches) — branch d011-d012, PR #8

## D-013 — The dominant failure of this build: success signals that measure the wrong thing. FINDING

Five instances in one day, across two actors and three layers. They were handled as separate
incidents. They are one bug.

| # | what reported success | what it actually measured | what it missed |
|---|---|---|---|
| 1 | `git push origin main` exited 0 | that the ref named `main` reached the remote | the committer was on another branch, so nothing was pushed |
| 2 | `do script` delivered text to the TUI | that characters reached the terminal | Claude Code showed `[Pasted text]` and waited; nothing was submitted |
| 3 | `rev-parse HEAD == rev-parse origin/main` | that the local tip matched the remote | the commit had failed on unmerged paths, so **conflict markers reached main** |
| 4 | a push step in a script | nothing — the result was never read | the push was refused; the script deleted the PR branch anyway, closed PR #7 unmerged, and waited for a CI run that could never come |
| 5 | `visual` stage, six Linux goldens | that two byte-identical files matched | the goldens were **copies of the macOS set**; a ±1-per-channel floor sat under tolerance, hiding any regression that size |

Four of the five are mine or the reviewer's. The fifth is a test that had passed every run since it
was written.

### The statement

**A success signal that does not measure the effect you care about is worse than no signal, because
it stops you looking.** Each of these was checked. Each check returned green. The check and the
effect had quietly come apart, and in every case they had come apart for a *mechanical* reason that
was obvious in hindsight and invisible at the time.

### The fix has one shape

Assert the **effect**, not the call:

- a push → compare SHAs *and* grep the content on the remote
- a commit → confirm it committed before acting as though it did
- an injection → confirm the token count moved and the input line cleared
- any scripted step after a fallible one → gate on the previous step's result, never proceed on
  assumption
- a test → **prove it can fail**

That last is the general form, and it is already written into `PROMPT-00-BOOTSTRAP-CONTROL-PLANE.md`:
*a linter that has never been shown to fail is not a linter.* Instance 5 is that principle applied
to visual tests, and it was violated for the entire life of those goldens. Before trusting any gate,
break it on purpose once and watch it go red.

### For the case study

This is the most repeated finding of the build and the most transferable, because it is not
game-specific and not AI-specific. It is the reason the method is worth selling: **the control
system kept catching itself, and the thing it kept catching was its own instrumentation.** Five
green lights that meant nothing, found and fixed in one day, is a stronger claim than any number of
tests that passed.

implemented_by: n/a — finding. The per-instance fixes are D-010, CLAUDE.md push rule, and dce7755.

## OQ-042 — **CONFIRMED with a renaming.** What earns a teaching segment. CLOSED

Took: every move except `ground` counts as able to kill you. The classification is right. **The
name is wrong and will be misused.**

`ground` can kill — walk off a narrow ledge and you die. It did not kill in chapter 1 because the
seam ledge was 7 m wide, which is a property of that *geometry*, not of the move. A future reader
applying "ground cannot kill you" to a one-metre catwalk will be wrong, and the linter will agree
with them.

What actually distinguishes the two is not lethality but **whether failing to understand the move
costs the player progress**. Misjudge a jump and you fall and lose the segment. Misjudge walking
and you stop, then walk again. That holds regardless of ledge width, which is why it is the better
rule.

So keep the classification exactly as taken — `ground` alone is exempt — and rename the concept to
what it is: a move earns a teaching segment when **misunderstanding it is unrecoverable within the
segment**. Carry that wording into the lint code's message so the next author reads the reason
rather than a claim that is sometimes false.

implemented_by: c03fe4a (RECOVERABLE_MOVES = [ground]; 'unrecoverable within the segment' carried into every D-011 lint message)

## OQ-043 — **CONFIRMED as taken.** The riskiest new thing per chapter. CLOSED

The crow in chapter 1, then the move Q5's table lists last in each chapter — double, dash,
dashjump.

Correct, and for a reason worth making explicit: Q5's ordering **already encodes difficulty**
(ground/jump/climb, then wall/double, then platform/dash, then dashjump as a mastery beat). So
"last in the chapter's list" is a *derivation* from a decision already made, not a fresh judgement
call. That is the same property that made D-011 preferable to a range — the number falls out of
data the agent already holds, so two agents reach it independently.

The crow is the one exception and it is the right one: Q5 named it the riskiest unproven element of
the whole design, which outranks any move.

implemented_by: c03fe4a (OQ-042: RECOVERABLE_MOVES = [ground], "unrecoverable within the segment" in the lint messages), aa55016 (OQ-043: CHAPTER_RISKIEST) — branch d011-d012, PR #8

## D-014 — Chapter 1 shipped unreachable. "Playable" was never defined. FINDING

Tim played the vertical slice, reported 15 s and "I don't see any crows." Both are explained by
one line:

```
src/main.ts:202
const levelId = (HARNESS_MODE && new URLSearchParams(location.search).get('level')) || GAME_RULES.startLevel;
```

`?level=` is honoured **only in harness mode**. Normal play always loads `GAME_RULES.startLevel`,
still `'00-gym'`. The menu even says so — *"WARRIOR — H2 gym"*. Chapter 1 merged to main and is
reachable by the nav bot and by nobody else.

So the 15 s was the gym, not chapter 1, and the crow comparison was never made. Both earlier
readings of that data were wrong.

### What let it through

Every gate passed, and each was measuring something true:

- `PHASE_SWEEP`, `HAZARD_AT_CHECKPOINT`, the linter, the visual goldens — all run the level
  **through the harness**, which sets `HARNESS_MODE` and therefore *can* reach it
- `CHAPTER-1-MEASURED.md` reports a real 19.75 s bot clear — also via the harness
- CI was green on both levels

Nothing in the stack asks **"can a person get to this level?"** The build verified the level
exhaustively and never verified that the level is reachable from the game's own front door. That
is D-013's pattern again — every signal green, measuring the wrong property — but at the level of
the *product* rather than a tool or a cue.

### The root cause is a missing definition

`PROMPT-CHAPTER-1.md` called chapter 1 "the first playable thing" and never said what playable
means. The harness definition — *the bot can complete it* — was the only one written down, so it
is the only one that got enforced.

**Define it:** a level is playable when a person who loads the game with no query string and no
documentation can reach it and finish it. Until that is true, a level is *authored*, not shipped.

### Fixes, smallest first

1. **Now:** honour `?level=` outside harness mode. A dev affordance, no effect on defaults,
   goldens or CI.
2. **Now:** `GAME_RULES.startLevel` → `01-lower-stair`. The gym is a test fixture; it should not
   be what a player meets. Update the menu string, which still says "H2 gym".
3. **Before chapter 2:** chapter progression — finishing a chapter loads the next. Without it,
   every future chapter ships unreachable by exactly this route.
4. **The gate that would have caught it:** a harness check that loads the game **with no query
   string**, plays to the end, and asserts which level it reached. Call it `REACHABLE`. It is the
   only check in the suite that would run as a player rather than as the harness.

implemented_by: ec87689 (fix 1: ?level= outside harness mode), 290cc37 (fix 2: startLevel 01-lower-stair, menu string), f79e500 (fix 4: REACHABLE stage, proven to fail with startLevel = 00-gym). Fix 3 (chapter progression): 2a6a351 (src/systems/progression.ts; Enter at results loads the next chapter by `chapter` number; REACHABLE follows the chain to the menu; check:progression in CI; OQ-050).

---

## D-015 — a 3.5m face is invisible to this camera rig, and CHAPTER_TEACH cannot fail

Reported from play, 2026-11-08: *"when I came up to the big block, it was hard to jump over. Also
it was all I could see. It took up the whole screen."* Both halves are the same two faces:
`01-lower-stair` critical_path wp8→9 and wp15→16, each `via: "climb"`, each a flush +3.50 rise.
Every other rise in the chapter is 0.00 or the 2.00 staircase.

### The camera measurement

The rig puts the eye `pivotHeight + distance*sin(pitch)` = `1.5 + 7*sin(18°)` = **3.66m above the
player's feet**, 6.66m behind. A face top at +3.50 therefore lands **0.16m below eye level**. You
are looking at the surface you need to reach from its own height, edge-on.

Standing 2m off the face, feet at 0, vfov 60°, measured across face heights:

| face height | lip elevation | top surface subtends | face % of frame |
|---|---|---|---|
| 2.00 | -10.9° | 6.9° | 62% |
| 3.00 |  -4.4° | 2.8° | 73% |
| **3.50** | **-1.1°** | **0.7°** | **78%** |
| 3.75 |  +0.6° | 0.4° | 81% |
| 4.50 |  +5.5° | 3.5° | 89% |

At 3.50 the top surface — the only thing in the frame that says *there is ground up there* — is
**0.7° tall, about 8px at 1080p**, above a featureless grey face filling 78% of the screen. The
pathological band is **3.25–4.00m**, where the lip crosses eye level; both authored faces sit in
it. Below ~3.0m you look down onto the top surface and it reads. The ledge never leaves the
frustum, so no framing check would have caught it: it is in frame and still carries no
information.

### Why the linter passed it

`CHAPTER_TEACH` (tools/lint-level.mjs:238) fires when `intro[it] < 0` — when a new move appears in
`CHAPTER_MOVES_ADDED[ch]` and **no segment uses it at all**. A move's first use is always in some
segment, so for any move that is used the check is a tautology and cannot fail. Chapter 1's climb
is "taught" by the segment that *is* the climb: teaching instance and gate are the same object.
The check is named for learnability and measures presence.

This is D-013's pattern for the eighth time, and the most expensive instance so far, because it is
the one check whose entire purpose was to prevent this.

### Rulings

- **D-015a (APPROVED 2026-11-08 by the chat REVIEWER, on a call Tim delegated to it):** chapter 1 drops `climb`. Each +3.50 face becomes a
  1.5-wide shelf at the midpoint — two +1.75 steps, both inside `MOVE.jump.maxRise` 2.00, both
  with a 5–7° readable top surface. `CHAPTER_MOVES_ADDED` becomes
  `{1:['ground','jump'], 2:['wall','double','climb']}`; climb debuts in chapter 2 beside wall and
  double, where Q5 already plans a teach beat. Data-only in the level; one table edit in the
  linter. **Chapter 1 ships `ground` + `jump`.** The alternative — keep climb and add a teach shelf before it — costs a segment, still
  needs the camera work to be readable, and introduces chapter 1's riskiest move twice.
- **D-015b:** `READABLE_RISE` (Tier-1, CI). For every critical_path rise, the top surface must
  subtend ≥ 2.0° from the eye at a 2m standoff. Derivable from the rig constants and the rise; no
  render needed. Rejects 3.25–4.00 faces and anything else that lands at eye level.
- **D-015c:** `CHAPTER_TEACH` is rewritten to be falsifiable: a teaching instance must be the
  move's first use **and** be bypassable or recoverable without losing the segment. Until the
  predicate is written down, the check is removed rather than left green — a tautological check is
  worse than no check, because it answers the question.
- **D-015d (backlog, engine):** camera pitch assist. A forward probe inside ~3m of a face whose
  top is within 0.5m of eye level blends pitch up until the top surface subtends ≥ 2.0°, released
  when the player turns away. Fixes the class; D-015a only fixes the two instances.

### The general rule

A budget says a move *can* clear a gap. It says nothing about whether the player can *see* that
it can. Both belong under CI, and until D-015b exists only one of them was.

implemented_by: 8b5a4ac (D-015b READABLE_RISE; D-015c CHAPTER_TEACH made falsifiable, kept live rather than deleted: OQ-047), 286259f (D-015a level data + move table, APPROVED by delegation 2026-11-08, still one revert; plus the D-015c teach step it forced), 05f3ffa (lint:self in CI: both checks proven to fail). D-015d: 440c982 + 4697475 (B-18; camera pitch assist ON by default, `?pitchassist=off`; harness stage pitch-assist runs the real rig; deviations OQ-052). Deviations from the text, recorded not edited: shelves 2.5 u not 1.5 (1.5 fails D-015b), the 4.50 row reads 0 not 3.5 (OQ-046).

---

## D-016 — the rest pose cannot present the rise that justifies wall or climb. Chapter 2 is blocked on D-015d

Surfaced by approving D-015a, 2026-11-08 (chat REVIEWER, delegated by Tim). Climb did not land in
chapter 1 by a pacing mistake. With the rig as it stands, it cannot be taught readably anywhere.

### The measurement (recomputed by the builder, not taken from the brief)

The figures come from `readableBandDeg()` and `REST_EYE` in `tools/lint-level.mjs`, using rig constants
imported from `src/engine/camera-tuning.ts` and `render-config.ts`:

- **Rest pose:** eye 3.663 u above the feet, 6.657 u behind them.
- **Standoff:** 2.0 u off the face.
- **Threshold:** a rise is readable if the landing's top surface subtends at least 2.0°.

The table gives the largest rise, at 0.01 u resolution, whose top surface still clears that threshold.

| landing depth | 2.5 | 5 | 6 | 15 | 41 | any (limit) |
|---|---|---|---|---|---|---|
| max readable rise | **2.28** | 2.83 | **2.92** | **3.18** | 3.29 | **3.36** |

- **The limit column:** this is the asymptote. As the landing deepens, the far edge tends to the horizon, so the band can never exceed `atan((eye - rise) / (standoff + behind))`. That gives `3.663 - 8.657 * tan 2°` = 3.361.
- **The brief's three figures:** all three (2.28, 2.92, 3.18) are confirmed.
- **The earlier figures were wrong:** the builder's own figures in OQ-046 and B-18 (3.19, 3.30, 2.29) were rounded *up*, and each of them fails. They are corrected in place.
- **Pinned in lint:self:** each ceiling is checked at its value and at +0.01. If the rig moves, the pinned values go red rather than stale.

### The consequence, with one correction to the brief

In chapter 2's set, a rise needs more than `jump` once it exceeds `MOVE.jump.maxRise` 2.00. By rise, each move's characteristic band is the range of rises where it is the cheapest move that clears the face:

| move | characteristic band | readable at the rest pose |
|---|---|---|
| `double` | (2.00, 3.50] | only (2.00, 3.18] onto a 15 u landing; (2.00, 2.28] onto a 2.5 u shelf |
| `wall` | (3.50, 4.00] | none, for any landing depth |
| `climb` | (4.00, 4.50] | none, for any landing depth |

- **Wall and climb:** both bands lie wholly above the 3.36 hard ceiling. Neither move can be presented readably at the height that justifies it existing.
- **Double:** this is the correction. The brief's "every one of those ranges sits above 3.18" is wrong for double. Only its top (3.36, 3.50] is unreadable everywhere. Double's other characteristic, horizontal reach (5.0, 9.5] at rise 0, is not a rise and READABLE_RISE never touches it. Double alone is teachable today.
- **The conclusion holds anyway:** chapter 2 adds wall and climb as well as double (Q5, D-015a). The claim offered for attack is the strong form, which follows from the ceiling: **no move can be taught above a 3.36 rise at the rest pose, nor above 3.18 onto a landing up to 15 u deep.**

### Rulings

- **D-016a: READABLE_RISE is an ERROR on a move's teaching instance and a WARNING elsewhere.**
  - **Why:** a practised move may legitimately ask the player to pitch the camera up. A move being taught may not, because the rest pose is what the player meets.
  - **Which instance teaches:** the teaching instance is the move's first critical_path use in the chapter that adds it (`CHAPTER_MOVES_ADDED`). It is the same `firstUse` index CHAPTER_TEACH uses, so the two checks cannot disagree about which segment teaches.
  - **Proven both ways in `npm run lint:self`:** the pre-D-015 faces were relabelled into chapter 2. In that fixture, climb's first +3.50 face ERRORs and the second only WARNs. On the shipped chapter 1 there are two mutations:
    - cutting the teach step to 1 u ERRORs the jump's teaching instance;
    - cutting shelf 1 to 1.5 u only WARNs.
  - **Mutation tests:** "always warn" turns lint:self red with 3 failures, "always error" with 4, so the split is load-bearing in both directions.
  - **Known edge, for the VERIFIER:** a move whose first use is a low rise makes every later, taller use "practice". Teaching climb on a 0.5 face and then gating on a 4.5 face passes with a warning.
- **D-016b: D-015d (camera pitch assist, B-18) is promoted from backlog to a BLOCKER on chapter 2.**
  - The brief gave this as "none of the three can be taught at its characteristic height". That holds for wall and climb. It holds for double only above 3.18 (above 3.36 for any landing); see the correction above. The blocker stands on wall and climb alone.
  - Once it lands, READABLE_RISE must model the assisted pitch rather than the rest pose. Otherwise the check keeps rejecting what the player can then see.
  - The claim is on the review board as RB-004.
- **The standing TIGHT warning:** it is on the gym, not chapter 1. It is accepted, with the reason on the waypoint (OQ-051). Chapter 1 lints with zero warnings.

implemented_by: 62ce5fc (D-016a in tools/lint-level.mjs; proven both ways in tools/lint-self.mjs; gym TIGHT note, OQ-051). D-016b is documentation: B-18 promoted to BLOCKER, RB-004 posted. D-015d: 440c982 + 4697475 (READABLE_RISE models the assisted pitch: wall +4.0 and climb +4.5 read onto landings >= 2.55 u; the chapter 2 blocker is lifted, pending APPROVER on OQ-052).

## D-017 — a MOVE budget is clean at EVERY press timing and approach in the window. OQ-063. DECIDED

**Ruled by Tim** (2026-11-09, via the chat REVIEWER): the rule below, and that it supersedes OQ-063 item 1.
**Applied by the builder, PROVISIONAL until Tim confirms (OQ-066):** every number, level re-shape, linter fix
and exception in this entry below "The rule". Tim ruled the rule, not the numbers derived from it.

**This supersedes OQ-063 item 1** ("double maxH 9.5
kept", Tim, 2026-11-09, the same day), and with it the "kept on item 1's logic" holds in OQ-063 items 2, 3
and 4a. Those texts stay where they are, marked SUPERSEDED, so the history reads.

**The rule.** A MOVE budget means that every press timing and every approach in the window clears it. It
does not mean that some timing does. "Some timing is clean" is not a budget.

**Why.** A budget that only a perfectly-timed press clears tells a level author that a gap is passable when
it is not. That is D-015 over again: a check passes and the player cannot do the thing. Under the old
reading, a double gap between 8.4 and 9.5 linted clean, and a player pressing at the nav bot's timing
missed it.

**The window, per measurement (B-20's grid, `npm run measure:b20`).** These are what "every" ranges over:

- **Gaps:** press timings k = 0..5 ticks after walk-off, all inside coyote time.
- **Rises:** takeoff distances d across a running takeoff.
- **Ground** (slope, stair, dash rise): the six approaches.
- **Every case:** 96 phases x 5 placements.
- **Out of the window, with its reason (MEASUREMENTS "B-20 re-measure"):** dash rise at 45 deg oblique, where
  the dash cannot reach the face at any height. That is geometry, not timing.

**What changes (builder-applied; B-20 data; MEASUREMENTS "D-017" has the tables):**

| budget | was | now | basis |
|---|---|---|---|
| double maxH | 9.5 | **8.4** | nav press clean k0-k5; 8.8 fails k0. 9.5 was clean only with a late second press |
| double maxRise | 3.5 | **2.9** | clean from every takeoff distance; 3.2 fails d5 |
| dash maxH | 4.0 | **2.6** | clean k0-k5, and 2.0-2.6 all clean, on two runs; 2.8 fails k4, k5. 4.0 was clean only for a press at k0-k1 |
| jump maxRise | 2.0 | 2.0, **CONFLICT** (below) | no grid value in 1.4..2.6 is clean at every distance |
| slope, dash maxRise, dashjump maxH/maxRise | 49, 0.34, 8.0, 2.6 | unchanged | already every-timing values (B-20) |

**Shipped levels re-shaped to fit, in the same change, so `lint:levels` never goes red on main:**
- **02-cliff-seam:** the first double goes from +3.0 to +2.8. geometry[5] top moves 7 -> 7.2, with its torii, checkpoint and cp 6-8. It was the only shipped double rise above 2.9; seg 9->10 is flat ground, not a second +3.0 as OQ-063 said.
- **00-gym seg 3->4 and 04-summit-ridge seg 9->10:** the "3.5 u" dash gaps are 2.0 u physical gaps, edge to edge. The 3.5 was waypoint span: 0.5 back from the near edge and 1.0 past the far one. Each pair is pulled in to 0.1 back and 0.4 past, which spans 2.5 u: TIGHT 96%, accepted with its reason on the waypoint (OQ-051's convention). No geometry moves. The nav traces are re-recorded, and so is one golden per level (gym cam1, 04 cam2), because visual cams aim at critical_path waypoints (`tools/harness/visual.ts`): the diff is a uniform re-aim, not a scene change. Linux cams for those two come from CI's `*.actual.png`, since gym and 04 Linux goldens are not byte-identical to Darwin. This is not a budget dodge: 2.0 u edge to edge is well inside the measured 2.6, which `measure:b20` also measures edge to edge.
- **Linter fix found by the pins:** a segment exactly at its budget errored ("2.6u > 2.6u": 54.6 - 52 is 2.6000000000000014). UNREACHABLE now compares with a 1e-9 tolerance. That loosens no budget; it only stops a float from failing the value itself.

**Not conforming, and recorded rather than forced:**
- **jump maxRise (B-30), and the dash tail:** dash shows the same shape above its new budget. 2.8-3.4 each fail at most 1 of 96, confined to k3-k5, and the count does not rise with distance (3.0 is clean at k4 while 2.8 is not). D-017 still sets 2.6 there, because 2.6 is clean. B-30 covers both patterns.
  - **The data:** 1.4 and 1.6 each fail 1 of 96 at d1.6 (5 placements, 2026-11-09). 1.8 is clean, and 2.0 is clean on this run, though B-20's run failed it once each at d0.8 and d1.6.
  - **What that means:** a failure that persists as the height drops, and moves between runs, is not a height limit. Lowering the number cannot satisfy the rule. 2.0 stays in code, PROVISIONAL, until B-30 diagnoses the failing phase.
- **Unmeasured under the rule (B-31):** wall (4.2 / 4.0) and climb (7.0 / 4.5) still rest on one sample each. `measure:b20` does not cover them. They do not yet meet D-017; they have not been shown to violate it.
- **double's second press (B-32):** it was sampled at two timings only, release at vy <= 0.5 (the nav press) and vy <= -6. An earlier second press is unmeasured. 8.4 is every-timing over the measured window, and the window is narrower than a player's.

**D-016's band table is amended by these numbers.** By rise, the cheapest move that clears is now: double
(jump.maxRise, 2.9], wall (2.9, 4.0], climb (4.0, 4.5]. Wall now picks up (2.9, 3.5], and the rest-pose hard
ceiling 3.36 sits inside wall's band, not double's. D-016's table is left as written; `lint:self` reads
these bounds from MOVE.

**Measurement conditions, disclosed.** The jump rise run (58 min) shared the machine with a playtest and,
for its whole length, with the second session's dash run. Physics is fixed-tick, but the jump result
already differs from B-20's run at 2.0, so contention is not ruled out as a factor (B-30).

**Executable half.** `npm run lint:self` pins each changed limit at its value (reachable) and just above
(UNREACHABLE), with literal numbers, so a MOVE edit turns it red. Reverting double to 9.5 / 3.5 fails 3 checks.

implemented_by: 47955d4 (double 8.4 / 2.9, 02-cliff-seam re-shape and re-record, lint:self pins), fc5682f (dash 2.6, gym and 04 dash waypoints, re-aimed cams, UNREACHABLE float tolerance). jump maxRise is NOT implemented: CONFLICT, B-30


## D-018 — the shipped look is a painting: no light, no lit material, §6 as a post pass, the seed as the target. B-34, B-35, B-36. DECIDED

**Ruled by Tim** (2026-11-09, in the CH1-ASSETS session, outranking the post-only task he had given minutes
earlier): STYLE-BIBLE §1 was violated at the MATERIAL level, not only in post. The shipped look must have zero
lit materials and zero DirectionalLight: flat unlit fill snapped to a palette step, plus the §6 ink edge on depth
and normal discontinuity, static seeded paper grain, and depth value compression as a post pass. The target is
`reference/` (the seed), not the builder's reading of sumi-e. PR #27 is held until this lands.
**Applied by the builder, PROVISIONAL until Tim confirms:** every number, map and threshold below "Built", and
the §3 departure in OQ-067 item 2.

**The finding, as measured.** On main d173785 the frame was a render of a painting. `src/` drew the level and
the player with `MeshStandardMaterial` under a `DirectionalLight` (elevation 50, azimuth 135) and a
`HemisphereLight`, so a stair tread's top and side, one material, rendered two values set by the light.
§10 test 1 ("can you tell where the light is?") failed in every frame. Neither this nor the unused reference
set was recorded anywhere as missing (B-35, B-36 now are).

**Measurement: before / after frames** (`docs/build-log/d018/`; `sheet-ch1-cam2.png` is
[seed hero_7s | before | after]). The metric is the share of non-accent, non-robe pixels OFF the §2 ramp
(more than grain + rounding from every step). Lit shading cannot stay on an 8-step ramp; flat fills do.

| Frame | Before (main d173785) | After (this entry) |
|---|---|---|
| 01-lower-stair cam2 | 65.5% off-ramp, 200 colours | 0.0%, 14 colours |
| 00-gym cam3 | 97.6% off-ramp, 178 colours | 0.0%, 12 colours |
| 02-cliff-seam cam2 | 67.9% off-ramp, 185 colours | 0.0%, 14 colours |

**Built.**
1. §1: zero lights, zero lit materials in `src/`. Every fill is an unlit `MeshBasicMaterial` of a NAMED ramp
   step (`src/engine/palette.ts`, read from palette.json). The paper is the sky on every level. The player is a
   flat robe #7d8590 (§2) with an ink-black nose; the per-state greybox hues are gone (§9 item 3). The fall
   plane is debug-overlay only.
2. §6: `src/engine/ink-post.ts` on every level: value_compression by depth band, ink_edge (screen-space Laplacian
   of 1/z: zero on any plane, so it marks silhouettes and convex creases; near 2px ink-black, mid 1px ink-grey,
   far none), paper_grain (static, seeded, 3/255). Nothing else: no bloom, vignette, grading, motion blur, SSR.
3. The gate: harness stage `post` (every level, six cameras) judges each pass from the pixels plus a per-pixel
   distance readback, and audits §1. It fails when a pass is ABSENT, not when a golden moves. Removing
   value_compression, ink_edge or paper_grain from the code, or adding a DirectionalLight, each turned it red
   (MEASUREMENTS "D-018 post gate").
4. The kit re-valued against `reference/seed/hero`: paper path tops; light walls cut by black strokes; a paper
   cloud sea with mist streaks; LOW horizon ridges, not peaks. kit_rock_mass changed COLOUR only: the geometry
   fingerprint is identical to main on all five levels.

**Departure, stated, not quiet (OQ-067 item 2).** §3 bounds the mid band at wash-light..ink-grey. Built
literally, it turned the paper cloud sea and paper path tops grey between 25 and 80 u: a dark ring the seed never
shows. Compression here only ever LIGHTENS. §3's dark bounds hold; its mid light bound does not. Amending §3 is
Tim's call (Q2b: on measured evidence only; the evidence is the first render and hero_3s/7s/11s).

**Not done, against the seed (B-36):** pines (in every hero frame; no kit asset), a tapered dry-brush ink line
(this one has constant weight), the §7 figure (B-33). **Accent:** the hue is untouched, as instructed; the ink
outline lowers ACCENT_AREA (ch1 0.103-0.243%, floor 0.0204%). To be re-judged with grain and edge in place.

implemented_by: 57c8c3c (§1 material/light purge, ink-post.ts, harness `post` stage, kit re-valuing, dress-01 --check in lint:levels, darwin goldens)


## D-019 — outlining everything is outlining nothing: the ink edge belongs to true silhouettes, and the near field goes dark. B-40, B-41. DECIDED

**Ruled by Tim** (2026-11-10), on `docs/build-log/d018/sheet-ch1-cam2.png`, seed left and D-018 right: the
shipped look "reads as a basic 3D paint stroke, not a painting". Four gaps, in order of cost. ONE: the ink edge
fires on every discontinuity, so every box edge and tile seam gets the same uniform line; in the seed almost
nothing is outlined, form comes from value masses and contour appears at a few silhouette boundaries only.
Suppress it on interior and coplanar seams and on distant forms, keep it on true silhouette boundaries, vary its
weight along the stroke. TWO: no value range: the frame uses the middle of the ramp and never the ends. Push
the near field dark, keep the far field pale, widen the spread. THREE (bare paper, ~40% of the seed frame) and
FOUR (slab silhouettes, B-37/B-38) are NOT in this entry: ONE and TWO first, no other post work until they land.
**Applied by the builder, PROVISIONAL until Tim confirms (OQ-068):** every number and threshold below "Built",
the never-break exception, and the top/face values of undressed boxes.

**The finding, as measured** (PR #27's shader under this entry's gate, all five levels): 100.0% of near
silhouette pixels inked and 56-70% of interior convex creases an ink line, at a constant 2px (1px share 0.0%);
69-82% of mid-distance silhouettes drawn; dark MASS 1.1-1.2% of the near field. In ch1 cam2, ink-deep was 0.0%
and ink-grey 1.8% of the frame, and its 10.9% ink-black was all line. Seed hero_7s: ink-grey 9.6%, ink-deep
8.0%, ink-black 5.4%, as mass.

**Built** (as it stands after an independent review, four lenses with every finding adversarially verified:
15 confirmed, 1 refuted; what it found is in OQ-068).
1. `ink_edge`: a line only on a TRUE SILHOUETTE, defined geometrically: each side of a pixel boundary is
   continued from its own two depth samples (1/z is linear across a plane), and a line is drawn only if the
   two surfaces stay 2% apart, on the near one. One plane at any grazing angle gives exactly 0; a crease's
   planes meet; a step-down between two tops is a gap. (The first cut, "a neighbour 1.2x farther", inked flat
   ground at a grazing angle and lost the gym's stair treads from above: review.) Near band only. Weight =
   base(distance: 3/2/1 px) x noise anchored in WORLD space, 0 (the brush lifts) to 4px.
2. `value_compression`: steps 2-7 in the near band are pushed dark with nearness (+3 inside 12 u at most, +2 to
   20 u, +1 to 24.9 u); paper and mist never. Each boundary is pulled inward by three octaves of world-anchored
   noise, so the push ends inside the band by construction. Mid and far unchanged (they only lighten, D-018).
   **Known limit (OQ-068 item 4, B-43):** it is per pixel by camera distance, so on one long flat wall its
   steps are still camera-relative bands. A push per form is the fix that respects flat fill.
3. **The exception to the break, mine and PROVISIONAL.** Where the form and what is behind it are shown at the
   SAME value (one platform top against the next one down), the line is the only thing that marks where the
   ground ends, so it holds a hairline: 96.4-100% of such pixels inked. The seed lets even that line break.
4. **Forced by ONE, mine and PROVISIONAL.** An undressed box of one flat value has no top once creases are not
   outlined. Its top is mist-pale (one step off the paper sky at any distance), its faces stone-mid; a tagged
   pad and a moving platform get a paper top. No walkable top is ever pushed. One unlit material, vertex
   colours; draw calls unchanged.
5. The gate: harness `post` gains eight D-019 checks and a grazing camera, each threshold between a measured
   wrong value and the shipped one. Ten mutations of the shader source turn it red; an eleventh (the first-cut
   ratio test) is NOT caught at the grazing pose and is recorded as a gate limit (MEASUREMENTS "D-019 ink edge
   and value range").

**Measurement: the same sheet, re-taken** (`docs/build-log/d019/sheet-ch1-cam2.png`: [seed hero_7s | D-018 |
D-019], same camera, same seed frame).

| | Seed hero_7s | ch1 cam2, D-018 | ch1 cam2, D-019 |
|---|---|---|---|
| ink-grey / ink-deep / ink-black, share of frame | 9.6 / 8.0 / 5.4% | 1.8 / 0.0 / 10.9% (line) | 12.9 / 6.2 / 4.4% |
| paper-cream | 37.2% | 26.1% | 28.3% |
| near silhouette px inked where value separates the forms (ch1) | | 100.0% | 65.9% (breaks) |
| interior creases that are an ink line | | 64.4% | 35.0% (the kit's own lips, B-38) |
| mid-distance silhouettes carrying a line | | 69.3% | 3.0% |
| near field that is dark mass | | 1.2% (ink-deep or darker) | 23.3% (ink-grey or darker; 1.0% with the push removed) |

**STYLE-BIBLE amended in place, marked D-019:** §1 (what "outline" means), §3's outline column (near:
silhouette boundaries only, weight varying; mid: none, was "grey, thin") and §6's ink-edge sentence (was "on depth
and normal discontinuity"; the never-break exception is marked there as the builder's, PROVISIONAL).

**Still off the seed, recorded not tuned away:** wash-mid 17.3% against 8.4% and the slab silhouettes (B-37,
B-38); paper 28.3% against 37.2% (B-42, gap THREE, not started). **Unchanged:** no level, asset or linter file;
every geometry fingerprint is PR #27's; replay passes against the committed traces; every scene ratchet holds.

implemented_by: 6474469 (first cut: silhouette-only ink_edge with world-anchored weight, the near value push, the D-019 gate checks, STYLE §3/§6, darwin goldens), c917b0f (review fixes: the two-surfaces silhouette test, whole-pixel steps, same-value never-break, mist tops, inward ragged push, grazing camera and the gate's added checks)

## D-020 — the look comes from painted things, not from more passes over boxes: a paint layer, a painted far field, hero assets and the rigged warrior. B-33, B-42, B-45 to B-50. DECIDED

**Ruled by Tim** (2026-11-10, after playing the D-018 and D-019 builds; three messages, relayed):
- "they still look really bad and nothing like the designs ... more shader or kit passes on 200-triangle boxes will
  not get there." Gap FOUR (the Blender-python silhouette rebuild, B-37, B-38) is DROPPED.
- Art pass 1. ONE: the far field as layered painted planes (paper sky, far peaks, mist sea, mid cliffs) textured
  from crops of the seed, with parallax by depth, replacing the kit_far_peak and kit_cloud_band geometry; "the mist
  must be bare paper". TWO: a hero asset class with real budgets ("about 30k triangles and a 1024 px texture per
  asset, plus a whole-scene cap you measure on this Mac"), a GLB import path, "light ink post on them"; colliders
  do not change. THREE: a model loader and animation state hookup so a rigged GLB replaces the capsule.
- On ART-GEN's delivery (assets/hero, branch art-gen 7bc5e85): the player is `warrior_rigged.glb`, "walk and run
  by speed, rest pose for idle, and hold a sensible frame for jump, fall, dash, wall and climb until more clips
  exist"; `torii.glb` in place of kit_torii; `lantern.glb` as dressing; `cliff.glb` and `boulder.glb`
  "sparingly with varied rotation and scale", the painted backdrop staying the main cliff mass; `pine.glb` not as a
  3D prop. The Blender stand-in figure is stopped and not shipped.
- `src/engine/ink-post.ts` and `src/engine/renderer.ts` are not edited (INK-HIRES owned them).
**Applied by the builder, PROVISIONAL until Tim confirms (OQ-070):** every number below "Built", the chroma cap,
the torii drawn as a skin of kit_torii, the held frames, where the dressing stands, and the Style Bible wording.

**The finding, as measured.** The §6 pass snaps every pixel to one of eight ramp steps and, beyond 80 u, to paper
or one flat mist tone (D-018). A painted texture drawn inside it is a posterisation: at 150 u two tones, at 60 u
six. So "painted" and "light ink post" cannot be had inside that pass, and that file was not this session's to
edit. On D-019, chapter 1 cam2 was 28.3% paper and 18.0% mist-pale against the seed's 37.2% and 9.5%; the
mist-pale was kit_cloud_band's strips (7.0% of the frame) and the kit's lower face bands.

**Built.**
1. **The paint layer** (`src/engine/paint-layer.ts`, hooked from `src/main.ts`). A painted mesh sits on three.js
   layer 1 in the same scene graph. Each frame the ink pass draws layer 0 as before; then the canvas depth is
   cleared, the ink geometry is drawn into it depth-only, and the painted meshes are drawn with the depth test on.
   A painted material is unlit and carries the ink pass's own static grain, and nothing else: that is the "light
   ink post". Nothing translates: painted planes are fixed in the world and parallax is perspective (Q2a).
2. **The far field of an ink level** (`src/loaders/backdrop.ts`, textures by `tools/art/backdrop-textures.mjs`
   from the seed): paper sky = no geometry; three rings of the seed's far ridge (hero_11s) at 300, 380 and 460 u;
   five mid cliffs carrying the seed's cliff brushwork (hero_9s) inside an authored ragged silhouette, re-coloured
   onto the ramp and lightened for distance; the mist = six sheets of paper-cream wash from y -7 to -3, so
   whatever stands in it thins into the paper. kit_mid_cliff, kit_far_peak and kit_cloud_band are no longer placed.
3. **A hero asset class** (`tools/assets/build.mjs`, `budgets.json` `classes.hero`, `assets/src/hero.json`):
   what `hero.json` names is imported from assets/hero as delivered: unlit, base colour only, chroma capped,
   1024 px KTX2, Draco; always collider none; drawn on the paint layer. Shipped: lantern, cliff, cliff_b, boulder
   (29,400 triangles each) and torii (9,510 after simplify, no texture).
4. **The torii** is kit_torii's SKIN: a kit_torii placement keeps kit_torii's own triangles as its collider and is
   drawn as the hero torii, fitted at load to kit_torii's bounding box, in the accent as a flat material (so
   `?accent=` and the accent gates keep working). No level file changed for it.
5. **The player** is `assets/char/warrior_rigged.glb` (`src/loaders/character.ts`,
   `src/entities/character-model.ts`): scaled to the capsule's 1.9 u, feet on the ground, turned to face -Z, on
   the paint layer. The twelve player states are unchanged and map onto the rig's two clips: stride on the ground
   (walk below half the run speed, else run, the run keeping pace with the ground), the rest pose for idle and
   land, a held frame for everything else. The capsule stays the collider.
6. **The gate.** The 17 D-018/D-019 `post` checks now judge the INK PASS ALONE, with the paint layer switched
   off, and `POST_GATE` is untouched. Six new checks judge the frame the player sees (`PAINT_GATE`): the layer is
   on as the game ships; the figure on every level and a painted far field on a dressed level only; the void is
   bare paper; no hue; static; no accent pixel hidden. Each was seen red (MEASUREMENTS "D-020 paint gate").
7. **Colliders did not change.** `tools/geometry-fingerprint.mjs --against` a dump taken before any edit:
   IDENTICAL on all five levels. The nine kit .glb files rebuild byte-identical. Replay passes against the
   committed, un-re-recorded traces.

**Measurement** (`docs/build-log/d020/sheet-ch1-cam2.png`: seed | D-019 | D-020, the camera and seed frame every
sheet since D-018 has used). Share of non-accent pixels nearest each ramp step:

| ch1 cam2 | paper | mist-pale | wash-light | stone-mid | wash-mid | ink-grey | ink-deep | ink-black |
|---|---|---|---|---|---|---|---|---|
| seed hero_7s | 37.2% | 9.5% | 16.1% | 5.8% | 8.4% | 9.6% | 8.0% | 5.4% |
| D-019 | 28.3% | 18.0% | 7.0% | 5.9% | 17.3% | 12.9% | 6.2% | 4.4% |
| D-020 | 40.4% | 7.1% | 6.0% | 6.4% | 17.5% | 12.8% | 6.3% | 3.6% |

cam2 pitches 28 degrees down with its horizon at row 13 and does not contain the player, so this sheet shows only
the void turning to paper. The far field, the figure and the torii are in `docs/build-log/d020/`
`art-pass-1-5120x1440-rig.png` (the player's own camera at spawn, real GPU). On an Apple M4 Max chapter 1 holds
144.9 fps at 2560x1440 and at 5120x1440; a frame costs 4.39 ms at 5120x1440 (1.4-1.7 ms before, INK-HIRES).

**STYLE-BIBLE amended in place, marked D-020:** §3 (a painted thing is not snapped to a band's steps; it must sit
in the band's range by construction and carry no hue the ramp lacks), §4 (the cloud sea is bare paper), §6
(painted things take the grain and nothing else).

**Still off the seed, and known limits (OQ-070):** the near rock is still kit slabs (B-46). The figure has two
clips; every other state holds a frame (B-45). A painted thing gets no ink edge, and its grain is per device
pixel where INK-HIRES draws the ink pass's grain in 360-line space (B-48). The depth-only pass draws the ink
geometry a second time. The delivered warrior differs from §7 (a pale hat, both gourds on one hip, trousers).

implemented_by: 611d70c (the paint layer, the seed ridge and the bare-paper mist, the paint checks), 19bbb8d (painted mid cliffs, the paint thresholds from measurement, backdrop budgets, the frame and sheet tools), bb5de28 (the hero asset class and its import path), f67d749 (the rigged warrior as the player, the torii skin, hero dressing, the shipped-state paint check, darwin goldens, scene ratchets)

## D-021 — art pass 2: the near rock is painted cards, the far field ART-GEN's paintings, the figure animated, the path brushed. B-45, B-46, B-47, B-49. DECIDED

**Ruled by Tim** (2026-11-10, after PR 31): "the left cliff wall in chapter 1 is still stacked dark slabs and is
the most game-like thing left in the frame. Merge the art-gen branch and use the painted cliff cards in
assets/backdrop/gen (cliff_a, cliff_b, cliff_c) as large painted planes standing along the cliff side,
overlapping, varied in scale and mirrored, with pine_a, pine_b and pine_c growing out of them, and hide the slab
visuals. Colliders do not change." "Use peaks_a/b/c, mist_a/b and wide_a/b in the backdrop layers wherever they
beat the seed crops." "Switch the player to assets/hero/warrior_anim.glb: nine clips ... judge each in motion in
the game and hold a good frame wherever a clip looks wrong; cross-fade between clips." "The path is flat blank
paper: give walkable tops a faint dry-brush texture. Do not touch ink-post.ts or renderer.ts without telling me."
**Applied by the builder, PROVISIONAL until Tim confirms (OQ-071):** every number below "Built", which frames are
held, the three thin mist bands, the gate's test frame, and the rule that nothing painted hides the player.

**The finding, as measured.** The rock is a straight wall 0.08 u from the path's edge, so a painting that stands
where the rock is has to lie parallel to the way the player walks, and the player's camera sees it at a grazing
angle. A first cut (large cards, three rows 2 u apart) read as a painted cliff from every fixed camera and as one
smeared plane with no top from the player's: four independent critiques against the seed said so. What changed
that was size and unevenness, not angle: small front cards, rows 5 and 11 to 14 u apart, heights from 13 to 64 u.

**Built.**
1. **The rock collides and is not drawn** (`src/loaders/level.ts` `INK.collideOnly`): in an ink level
   kit_rock_mass goes to the physics exactly as before (the same code, untouched) and its draw loop is skipped. It
   keeps a hidden mesh, shown only by the harness.
2. **The painted wall** (`src/loaders/cliff-wall.ts`), derived from the rock placements: three small front cards
   a mass just behind the collision front, a bay card at each join, a tall back card every second mass, pines
   rooted on ledges of the front cards. Where the rock has a gap at the path's height (x 36 to 40.5) no front
   or bay card stands, so it is an open cleft, not a painted cliff a player can walk through. All parallel to the path, front faces only, 12 draw calls. The three
   boulders that sat on the slab tops are gone (`tools/levelgen/dress-01.mjs`).
3. **Nothing painted hides the player** (`src/engine/paint-layer.ts` `paintLast`): the rock's ledges can be
   climbed, as they always could, and a card has no surface; the figure is drawn after every card.
4. **The cards** (`tools/art/backdrop-cards.mjs` -> `assets/backdrop/cards/`): ART-GEN's paintings resized,
   clamped to the paper's value and the ramp's chroma, colour bled under the cut, cliff feet faded. Held by
   `assets:budget` (`budgets.json` `cards`), pixel for pixel.
5. **The far field** (`src/loaders/backdrop.ts`): one horizon ring of the seed's ridge, six painted peaks laid
   low, six painted mid cliffs, three thin mist bands. The seed-crop mid cliffs are gone.
6. **The figure** is `assets/char/warrior_anim.glb` (`src/entities/character-model.ts`): idle, walk, run, land,
   dash and climb play; jump, fall and wall are held frames of the run, land and climb clips. Every change of
   pose is an eased, normalised cross-fade, a function of the player's state clock alone.
7. **The path** (`src/loaders/path-wash.ts`): one painted mesh over every walkable box top, a faint dry-brush
   in world x and z.
8. **The gate** (`tools/harness/post.ts`): `POST_GATE` untouched; the ink-only checks judge the ink pass with
   the undrawn rock shown; three new checks judge the player's frame (MEASUREMENTS "D-021 paint gate").
9. **Colliders did not change.** Replay passes against the committed, un-re-recorded traces on all five levels,
   with nav, phase-sweep and chaos. `tools/geometry-fingerprint.mjs --against` a dump taken before any edit:
   IDENTICAL on all five (it reads the level files and the kit, so it proves those, not the loader). The nine kit
   .glb files rebuild byte-identical. `src/engine/ink-post.ts` and `src/engine/renderer.ts` are not edited.

**Measurement** (`docs/build-log/d021/sheet-ch1-cam2.png`: seed | D-020 | D-021). Share of non-accent pixels
nearest each ramp step:

| ch1 cam2 | paper | mist-pale | wash-light | stone-mid | wash-mid | ink-grey | ink-deep | ink-black |
|---|---|---|---|---|---|---|---|---|
| seed hero_7s | 37.2% | 9.5% | 16.1% | 5.8% | 8.4% | 9.6% | 8.0% | 5.4% |
| D-020 | 40.4% | 7.1% | 6.0% | 6.4% | 17.5% | 12.8% | 6.3% | 3.6% |
| D-021 | 33.9% | 6.8% | 12.4% | 14.3% | 13.4% | 8.0% | 5.1% | 6.2% |

The player's own camera at spawn, real GPU: `docs/build-log/d021/ch1-player-5120x1440.png`. On an Apple M4 Max
chapter 1 holds 144.9 fps at 2560x1440 and 5120x1440; a frame costs 2.81 ms at 5120x1440 (4.39 ms on D-020).
The scene peak fell from 140 draw calls and 381,066 triangles to 127 and 287,036. The download grew by 8.3 MB
of cards and 0.15 MB of character, less 0.5 MB of seed mid cliffs.

**STYLE-BIBLE:** not amended. What the new art strains is recorded in OQ-071, for Tim.

**Still off the seed, and known limits (OQ-071):** from the player's camera the wall is still a wall beside the
path, seen along its length. The rock's ledges are climbable and not painted as ledges. A painted thing still
gets no ink edge (B-48). The two 3D cliff stacks in the void are now the most game-like things in the frame.

implemented_by: d03247e (the first cut: rock undrawn, the wall, the cards, the animated figure, the path wash), 50d9d8f (the paint gate's three checks, the wall as 12 meshes, cards re-encoded), 0908710 (the wall from the player's camera, low ridges, darwin goldens, scene ratchet, real-GPU measurement)

## D-022 — a title screen, a how-to-play page, sound, and a sword slash that cuts nothing. Narrows Q1 and NOT row 2 by one drawn move; Q7 stands. The slash's "drawn, never simulated" is superseded by D-023. DECIDED

**Extended (2026-11-12, D-027).** The game now has touch controls. "The game has no touch controls" under Known
limits, and the how-to-play page's line that a keyboard or a pad is needed, describe D-022 as it shipped.

**Extended (2026-11-12, D-025).** The title has a third button, Chapters, and so does the how-to-play page; Play
is always the first chapter; the pad's Y opens the chapter list; and the game now shows one line about a move
while playing. "SPEC §7 row 15 ... the lint and row 15 are unchanged" in item 5 describes D-022 as it shipped:
row 15 no longer refuses a chapter list. The cookie still holds only the two sound settings.

**Superseded in part (2026-11-10, D-023).** The slash now has a hit volume in the fixed tick and is in the input
frame, and Q7 no longer stands for enemies. Item 6 below and every sentence saying the slash cuts nothing, is
not simulated or is not recorded describe D-022 as it shipped, not the game now. The rest of D-022 stands.

**Ruled by Tim** (2026-11-10, `PROMPT-TITLE-AUDIO-SWORD.md`): "create a landing page with these graphics designed
by Tim de Vallée dedicated to Remi"; "add an instructions page and a sound track with sounds when jumping,
landing, fighting". The brief sets the fence for "fighting": an input and a slash on the warrior, with its sound
and one ink stroke, and "no enemies, nothing cuttable, no change to the level schema, no effect on movement. The
slash never touches velocity or the MOVE budgets. Decision Q7 stands." The game's public name is the one painted
on the art: Karasu: Flight of the Exile.
**Applied by the builder, PROVISIONAL until Tim confirms (OQ-072):** every key chosen, the cookie, the gamepad,
that the slash is animated in code, every number in MEASUREMENTS "D-022 ...", and the mix, which nobody has heard.

**What this narrows, and what it does not.** Q1 ("not combat, not a chase") and SPEC §7 row 2 ("combat verbs and
input") refused a sword input. Tim has now asked for one, fenced. So row 2 reads: combat verbs and input, except
the D-022 slash, which is drawn and never simulated. The five refused words stay refused in `src/`
(`lint:not-list` is unchanged, 22 rows enforced), which is why the move is a "slash" everywhere and never the
other word. Row 1 (no enemies), row 9 (the only win is arriving), row 14 (no health, no damage) and Q7 itself
are untouched. D-009 still holds: if enemies are ever wanted, that is a second bot tier and a new decision, not
something to grow out of this.

**Built.**
1. **The gate.** `index.html` decides once, from the URL: with a `harness`, `playtest`, `replay`, `instrument` or
   `level` parameter the page is `<html class="bare">` and the shell's template is dropped before anything in it
   exists. `src/` builds the shell and the sound only on a `shell` page that is not in the harness's test mode.
   (The harness's real marker is `harness=1`; `playtest` and `replay` are the brief's names and are honoured too.)
2. **The title screen.** Static markup, so the painting is on screen before the game's module has loaded; the
   first chapter decodes behind it. The painting is whole at every shape of screen down to its keep zone (the
   lettering, the seal, the boat), and on a screen wider than it stands between paper-toned extensions of
   itself. Play, Enter, Space and the pad's A start the game. A press made before the game is ready is kept and
   honoured. Nothing sets the name again in HTML. The two credit lines are the brief's, to the letter.
3. **The how-to-play page.** H, from the title or from the game (which it pauses); Esc, H or Back closes it. Its
   controls are read from `INPUT_CONFIG.bindings`, `GAME_RULES.keys`, `SHELL.keys`, `AUDIO.keys` and
   `GAMEPAD.labels`; its moves from each level file's `moves_allowed`, in chapter order. One line per move and
   three short paragraphs of rules are written by hand (`src/ui/howto.ts`).
4. **Sound.** `src/audio/audio.ts`: events in, sound out. `src/audio/tap.ts` reads the player after each tick
   and writes nothing; `player.ts` gained no event. Music (one 83.9 s loop) and eight effects, generated on fal
   through `tools/gen/fal-call.mjs` and cut by `tools/gen/build-audio.mjs`. The Play press opens the audio
   context. N mutes, - and = change the volume, and the how-to-play page has a slider. A hidden tab is silent.
5. **Mute and volume are remembered in one cookie** (`karasu_sound`, two values). SPEC §7 row 15 refuses the
   storage APIs in `src/`, to keep saves out; the brief asks that these two settings be remembered. A cookie
   holding only them does both: the lint and row 15 are unchanged, and nothing about a run is kept.
6. **The sword slash.** J, the pad's X, or the left button once the mouse is the camera's. It is not in
   `InputFrame`, is not a player state, and `fixedUpdate` does not read it: a render-time clock, an upper-body
   clip laid over whatever the legs are doing, one ink stroke on the paint layer, and its sound. It works on
   the ground and in the air.
7. **A gamepad**, on the standard mapping. The game had none and the brief asks for two pad buttons; a pad that
   could start the game and swing the sword but not walk would be no use. A stick past its dead zone is a
   direction at full deflection, so the simulation is never given a part speed.

**The clip was not bought.** The brief says to make the slash clip the way the nine were made, and to animate in
code if that fails. It fails three ways before any money is spent: (a) the nine came from one
`fal-ai/meshy/rigging/multi-animation` call, which rigs the model afresh, so buying the set again changes the
nine clips' bytes and the held frames chosen on them; (b) buying one clip on a new rig and copying its tracks
across is the mixing of rigs `tools/gen/build-anim.mjs` refuses (rest joints differ by up to 0.021 of the figure's
height between rig runs); (c) no library id for a slash is on record, and the wrapper makes one submit with no
retry, charged in full if it is wrong. So the slash is a clip made in code against the rig's bone names, as
`src/loaders/character.ts` makes `rest`.

**Proof the harness sees none of it** (MEASUREMENTS "D-022 the harness sees none of it"): `frame-hashes` gives the
same sha256 for all 30 frames, the same counters, the same renderables and the same element ids as main's build;
the one difference is the page's title. No golden was updated. `reachable` meets the title at the bare URL, holds
it and the sound to the brief by what the page does, and was mutated to show it fails when the title swallows
Enter.

**Known limits (OQ-072).** Nothing was judged by ear. The rig's sword is part of the body mesh and has no bone,
so it stays on the figure's back: the hand goes to the hilt and cuts, and the stroke is what reads as the blade
(B-45). The gamepad was not tried with a pad. The game has no touch controls: the title reads on a phone and the
how-to-play page says a keyboard or a pad is needed.

**STYLE-BIBLE:** not amended. §2 says the accent is never on UI: the buttons and text are ink and paper only. The
red seal is in Tim's painting, not in the UI drawn over it.

implemented_by: b483f1d (the gate, the title screen, the how-to-play page, reachable at the bare URL), 0c40975 (sound: the audio module, the tap, the files, the cookie, fal-call's audio endpoints and task ceiling), db5d964 (the sword slash and the gamepad), 10991df (five review findings a player hits, each with a reachable check, and the left click in the bindings table: OQ-073), f98e55a (B-59, B-60 and B-61: the title in near-square and upright-tablet windows, an early How to play, the mouse back at the title: OQ-074)

## D-023 — enemies: one swordsman, a slash that cuts, and a fight in the fixed tick. Reverses Q7 for enemies only and supersedes D-022's "drawn, never simulated". DECIDED

**Extended (2026-11-12, D-024).** "Three swordsmen in chapter 1 and none anywhere else" and "Only chapter 1 has
swordsmen" below are replaced: chapters 2, 3 and 4 have ten more. "His ground is ... cut back from anything
standing on it" was true of unturned boxes only until D-024's B-79. Everything else here stands.

**Ruled by Tim** (2026-11-10, 6:44 pm, `PROMPT-ENEMIES.md`): "No more chapters, just enemies." The brief names the
two rulings that change and says to record them here:
- **Q7** (the level schema refuses enemies) is reversed **for enemies only**. Interactables and collectibles stay
  refused.
- **D-022** (the slash is drawn, never simulated, and is not in recorded input) is superseded: the slash has a
  hit volume in the fixed-tick simulation and is part of recorded input, so replays stay exact.

The brief also fixes the rules: one enemy, the swordsman; he stands guard or walks a short patrol on flat ground,
notices the warrior inside a sight range, closes in, never leaves his own ground and never jumps; a wind-up the
player can read (near half a second), a short reach, a recovery in which he is open; he falls on the second hit
and the first staggers him; his slash sends the warrior to the last checkpoint as a hazard does, with no health
bar; a fallen swordsman stays down for the attempt and comes back when the warrior respawns; death is ink, not
blood; three swordsmen in chapter 1 and none anywhere else.
**Applied by the builder, PROVISIONAL until Tim confirms (OQ-075):** every number in `FIGHT` and `SWORDSMAN`, that
a swordsman has no physics body, where the three stand, the look of the death, the four sounds, the bot's way of
fighting, and that two of D-020's paint checks no longer judge the pixels a swordsman covers. **Nobody has played
it and nothing was judged by ear.**

**What this changes, and what it keeps.**
- **Q7.** The schema has an `enemies` list again: id, type (one value, `swordsman`), pos, facing, optional
  patrol points. A swordsman carries no stats in level data: how he fights is one table in code
  (`src/systems/fight.ts` `FIGHT`), the same for every one, so a level can place him and cannot tune him.
  `interactables` and `collectibles` are still rejected by the schema and by `lint:not-list`.
- **D-022.** `slash` is a field of the input frame. The slash's clock starts on a press and advances in the fixed
  tick; while the blade cuts, a swordsman inside its reach and arc is hit, once a slash. It is still not a player
  state and touches no velocity, timer or state. Everything else D-022 built stands.
- **Q1** said "not combat, not a chase", and gave its reason: an enemy that pursues with pathfinding makes the
  bot's route unreproducible. Tim has now asked for a fight, so "not combat" is narrowed by this entry. The
  reason is kept whole: a swordsman chooses no route. He walks straight at the warrior on one box top, is
  clamped to it, and uses no random number and no clock but the tick, so a recorded run replays to the same
  fight on the same ticks. "Not a chase" stands (SPEC §7 row 3). **D-009** said enemies would need a second bot
  tier: that was for enemies whose behaviour a trace cannot reproduce. This one can be, so the one bot fights
  and the one replay proves it; no second tier was built.
- **Q6** is unchanged: one way to die. A swordsman's cut is that death; nothing else happens on contact.
- **Q2a / NOT row 18** (nothing translates but the player and hazards): a swordsman translates. He is tagged
  `enemy` for the `ambient-motion` stage, as hazards and platforms are tagged.
- **The MOVE budgets** are untouched. A swordsman has no physics body and the warrior does not collide with
  him, so the physics world is the one main has. Proof below.

**Built.**
1. **The rules** (`src/systems/fight.ts`): pure functions with no import, run by the game, the level linter,
   `check:fight` and the harness alike. A swordsman is a state machine stepped once a tick after the warrior has
   moved: guard or patrol, close, wind-up, slash, recover, stagger, return, fallen. His ground is the top of the
   one unturned collision box he stands on, cut back from anything standing on it and drawn in by a margin
   (`groundRect`); he is clamped to it. The wind-up is run at `max(windupSec, windupMinSec)`.
2. **The warrior's cut** (`src/entities/player.ts`, `src/engine/input.ts`): the sword's key is in the input frame
   as a held state and a slash starts on its rising edge. A tap shorter than a tick, the mouse button and the
   pad button are latched for one tick. A trace recorded before this has no `slash` field, which reads as no
   slash, so the four older traces replay unchanged.
3. **The game's wiring** (`src/main.ts`, `src/entities/swordsmen.ts`): a cut that lands is `die()`, the same call
   a fall or a hazard makes. During the death the swordsmen are stepped with the warrior absent; at the respawn
   every one is put back on his post, on his feet. That is per-attempt state, unlike a hazard, which is a pure
   function of the world clock (Q6): the brief asks for exactly this.
4. **The figure** (`src/entities/swordsman-model.ts`, `assets/char/swordsman_anim.glb`): made the way the warrior
   was, from a clean image out of the courtyard painting: image to 3D, rigged, six clips (idle, walk, close,
   slash, hit, death). 14,700 triangles, 24 bones, on the paint layer. He was rigged empty-handed and his katana
   is a small mesh on the right hand's bone. The slash clip is not played at its own pace: the wind-up, the cut
   and the recovery are each mapped onto their part of it, so what is seen is the timing the rules run on.
5. **Death is ink.** The falling figure turns ink-black, a burst of ink is thrown at each hit, a splat stays on
   the ground, and all of it fades to paper. No red: STYLE §2 keeps colour to the torii.
6. **Sound** (`src/audio/tap.ts`): he notices, a hit lands, he falls, the warrior is cut. The tap reads what the
   tick reported and writes nothing; no sound feeds the simulation.
7. **The level format** (`levels/level.schema.json`, `tools/lint-level.mjs`): the `enemies` list and five rules,
   each seen to fail alone in `lint:self`: `ENEMY_OOB`, `ENEMY_OFF_GROUND`, `ENEMY_PATROL`, `ENEMY_AT_STAND`,
   `ENEMY_ON_LANDING`.
8. **Chapter 1** places three: `guard-first` alone on the first flat, `guard-patrol` walking the width of the
   second torii's approach, `guard-goal` in front of the goal torii. No other level has an `enemies` list.
9. **The harness fights.** The nav bot fights any standing swordsman near it on its own level, and `nav` fails
   unless every one is down at the goal. Chapter 1's trace was recorded again from that run and now carries the
   fight, change of mode by change of mode; `replay` holds a replay to it exactly. `chaos` presses the sword at
   random. Two checks of the four rules the brief names: `npm run check:fight` (Node, the pure functions) and the
   `fight` playtest stage (the real game, on a fixture). Each rule is also run against a broken fight, in CI,
   and must fail.
10. **How to play** has a short section on swordsmen: two cuts, read the wind-up, his blade sends you back.

**What the old gates needed.** Two of D-020's paint checks were written for painted scenery and fire on a painted
figure that moves and guards a gate: `static` (610 painted sky pixels changed between two ticks: his idle and his
patrol) and `hides no accent pixel` (47 pixels of the goal torii are behind `guard-goal` from one camera). Both
now leave out the pixels a swordsman covers, found by drawing the same frame without the swordsmen, and say how
many they left out. Everything else in the frame is judged as before. This narrows a gate, so it is the first
thing in OQ-075 for Tim to overrule; MEASUREMENTS "D-023 the paint gate" has the numbers.

**Proof.** MEASUREMENTS "D-023 ...". In short: with the fight code in and no level placing a swordsman, CI ran
every older trace and golden untouched and `frame-hashes` matched main's build on all 191 values; with the three
placed, every level but chapter 1 still matches. Chapter 1's four segments still clear from all eight phases
inside 12 s each with the bot fighting.

**Known limits (OQ-075).** A player can run or jump past a swordsman: nothing blocks the path. Two quick cuts
fell him before any wind-up can finish, because the first hit staggers him out of it; the wind-up matters only
to a player who is slow, misses, or meets him mid-swing. The HUD says "fell" when the warrior is cut. The
warrior's own sword is still on his back (B-45). Only chapter 1 has swordsmen.

**STYLE-BIBLE:** not amended. The swordsman is toned by a ramp step and carries no hue; the accent stays on the
torii alone.

implemented_by: 522ff13 (the figure and the four sounds), ffd9116 (the fight in the fixed tick, the slash in the input frame, the figure in the game), dca879e (the level format, the lint rules, chapter 1's three swordsmen, the bot that fights), fdd96f1 (the four fight checks, each seen to fail; chapter 1's trace, scene budget and darwin goldens; the paint gate's swordsman mask; how to play; a slash dropped at death), a289651 (chapter 1's Linux goldens from CI's own frames; the fight stage in a fresh browser per page; "J or Left click")

## D-024 — swordsmen in chapters 2, 3 and 4: ten of them, the same swordsman and the same fight. Extends D-023's "none anywhere else". DECIDED

**Ruled by Tim** (2026-11-12, `PROMPT-ENEMIES-CH2-4.md`, after playing chapter 1's fight and putting it live:
"continue"). D-023 placed three swordsmen in chapter 1 "and none anywhere else"; that clause is replaced by this
entry. Everything else in D-023 stands: one enemy type, one `FIGHT` table, no physics body, no retuning.

The brief fixes: 3 in chapter 2 (one on a patrol), 3 in chapter 3 (none on a moving platform), 4 in chapter 4
(two of them a pair, the first the player faces), none in the gym; wide flat ground only, never where a chapter
first teaches a move, never where a required jump lands; one guards the approach to each goal torii; the first a
player meets in each chapter stands alone, in the open; B-79 first; B-78 if `run-metric` allows.
**Applied by the builder, PROVISIONAL until Tim confirms (OQ-077):** where each of the ten stands, that a
collider on a swordsman's ground is cut out by its bounding box, that a turned box is never ground, and the word
`cut down`. **Nobody has played chapters 2 to 4 with swordsmen.**

**Built.**
1. **B-79** (`src/systems/fight.ts` `risers`, `groundRect`): every collider standing on a swordsman's ground
   is cut out of it, not only unturned boxes. Red first on a fixture, against the colliders' real triangles.
   Chapter 1's file is unchanged; two of its three grounds now stop short of a torii they ran through.
2. **The ten** (`levels/02-cliff-seam.json`, `03-drifting-stones.json`, `04-summit-ridge.json`): all five
   `ENEMY_*` rules pass. The bot fells every one and is never cut; the three traces were recorded again with
   their fight logs; every segment stays inside `PHASE_SWEEP`'s 12 s. The pair stand 3.86 m apart.
3. **B-78**: the HUD says `cut down` when a swordsman's cut ends the attempt.

**What it keeps.** The MOVE budgets, `FIGHT`, `SWORDSMAN` and `NAV_CONFIG` are untouched. Chapter 1 and the
gym are byte-identical to main in every frame the harness draws. The scene budgets of chapters 2 to 4 are raised
to their measured peaks (MEASUREMENTS "ENEMIES-CH2-4 where the ten stand"); Tier 1 is not approached.

**STYLE-BIBLE:** not amended.

implemented_by: 525faac (B-79 red: the fixture, check:fight rule 5 and the lint:self cases, failing on main's ground), 06cf80b (B-79: risers, groundRect, the game and the linter on one function), 1e0036b (B-78: the HUD word), a9670a8 (the ten swordsmen, the three traces, the scene budgets, the darwin goldens)

## D-025 — a move's line on screen where a chapter first needs it, and a chapter list on the title. Narrows NOT rows 15 and 20; extends D-022. DECIDED

**Ruled by Tim** (2026-11-12, `PROMPT-TEACH-AND-CHAPTER-SELECT.md`, from play on the live site): "level 2 can't
jump the wall, when do i go to level in the square?" The brief fixes: reproduce the wall as a player would before
changing anything; the first time a chapter's path needs a move not used before in this visit, one short line on
screen as he approaches, "with the real keys read from the binding tables (not typed in)", the spots found "from
each level's `critical_path` (`via`) so they cannot drift from the level"; "The line goes when he does the move.
If he fails at the same spot twice, or stands near it for several seconds without doing it, show it again"; the
ledge-grab line rewritten to say what works, the same wording on the how-to-play page; a fight line at chapter
1's first swordsman; every other move's line checked on the rig. And: "A **Chapters** button on the title screen,
beside Play and How to play: the four chapters by name; choosing one starts it with sound, the same as Play.
Play still starts chapter 1"; reachable from the how-to-play page in the game; keyboard and gamepad; "Nothing is
locked. This is a showcase." No change to movement numbers, levels, the fight or the camera; "Same gate as the
title screen: none of this exists under the harness, and every golden stays byte-identical."
**Applied by the builder, PROVISIONAL until Tim confirms (OQ-078):** every wording, the three numbers (6 m, 5 s,
2 misses), what counts as a miss, the hang's second line, where the line sits on screen, the list's keys and its
pad button, and the two NOT rows as reworded. **Nobody has read these lines in the game.**

**What this narrows, and what it does not.** SPEC §7 row 15 refused "saves, unlocks, chapter select" and row 20
says visible text must not depend on run history. Tim has now asked for a chapter list with nothing locked, and
for a line that comes back after two misses. So row 15 reads: saves and unlocks, and no chapter is ever locked;
the list is allowed because it is neither. Its check `chapter_select` is replaced by `chapter_lock*`; the storage
checks and `unlock*` stand, and nothing about a run is stored ("this visit" is memory: a reload forgets it). Row
20 keeps its stage and gains one sentence: a move's line may come back at a place where he has missed twice or
stood; it shows how the move is made and never a count. Row 19 (no text in the world) is untouched: the line is
DOM over the canvas, as the HUD's word is. Q4 (the only win is arriving; no score, no rank) and Q6 (one way to
die, nothing kept) stand.

**Built.**
1. **Step 1, before anything else** (`tools/harness/teach-probe.ts`): at chapter 2's first face a tapped jump
   pushing in never catches the ledge, a held jump pushing in catches it every time, and a held jump without
   pushing in never does. The move is sound; nothing told the player. MEASUREMENTS "D-025 the wall".
2. **The rule** (`src/systems/teach.ts`, pure, no import): the places are read from a level's `critical_path`
   and `enemies`. A place's line is up from 6 m short of where its move is made while the move is unmade in
   this visit; it goes when the move is made; it comes back after two misses or 5 s of standing there, and then
   stays until he is past. One line at a time. Told what happened after each tick, as the sound tap is; it
   writes nothing back. `check:teach` runs it on `levels/` under Node, in CI's static job.
3. **The lines** (`src/ui/howto.ts`): one table for the how-to-play page and the screen. Rewritten where the rig
   showed them wrong: the ledge grab, the double jump (at a face it is a kick), the wall jump (the kick needs no
   slide), the dash jump (it is not the widest). New: the fight's line, and the hang's.
4. **The chapter list** (`index.html`, `src/ui/shell.ts`): a card over the title or over the how-to-play page,
   the chapters by name from the level files. Choosing one starts it as Play starts the first: the press wakes
   the sound and is not a jump. From a game it leaves that game. Play is always the first chapter.
5. **The checks.** `reachable` holds the list (mouse, keys, a faked pad, an early press, three window shapes)
   and the line at the wall, as a player, on the production page; it was mutated to show it bites.

**What it keeps.** `TUNING`, `MOVE`, `FIGHT`, the camera and every level file are untouched. `player.ts` gained
nothing. `frame-hashes` is IDENTICAL to main over 191 values: no golden was updated, no trace recorded again.

**Known limits (OQ-078).** The first face is still the tightest catch the rig has (B-89); the line carries it.
Four first-use places can be cleared without their move (B-92). There is no line for the crow (B-94). "The level
in the square" (the courtyard of Tim's painting) does not exist and is a separate task.

**STYLE-BIBLE:** not amended. §2: the accent is never on UI; the line and the list are ink and paper. §9.10
(no text in the world): the line is on the page, not in the scene.

implemented_by: 7cd56eb (step 1 and the move check: the probe), 3caf66b (the rule, the lines, the chapter list, check:teach, the reachable checks), 7399844 (a dash jump made off an edge counts as made), a35952b (what the list stands over is inert while it is open)

## D-026 — chapter 5, the courtyard of the painting: three swordsmen at once, and a goal that waits until the yard is clear. Narrows NOT rows 8 and 9 and Q3's refusal of a gate; extends D-024 and D-025. DECIDED

**Ruled by Tim** (2026-11-12, `PROMPT-COURTYARD.md`, from play on the live site: "when do i go to level in the
square?"). The brief fixes: `05-courtyard`, "The Courtyard", chapter 5; "A short walk in through a gate, then one
walled, flat, square courtyard of stone flags, about the proportions in the painting. The far side has the tiled
gate"; three swordsmen "placed as the painting has them: one to the left, one to the right, one nearer the middle.
They come at the warrior together"; a checkpoint torii just inside the entrance; the goal is the far gate. One
new rule: "a level flag meaning the goal does not count until every swordsman in the level is down, and show it:
the far gate is visibly shut, and visibly opens when the third one falls", with schema, lint ("a level with the
flag has at least one swordsman; the goal is reachable once clear") and a check seen to fail; "Chapters 1 to 4 do
not get the flag." The look: ink, "recognisably the painting", painted cards and textures, "a generated 3D model
only for a compact object (the gate)", the far field "from the painting itself where you can", fal at most $4.00.
"Chapter 4's goal leads to chapter 5. Chapter 5's goal ends the run the way chapter 4's does today"; the existing
swordsman, fight rules and `FIGHT` table: "Do not retune. No new enemy type."
**Applied by the builder, PROVISIONAL until Tim confirms (OQ-079):** the flag's name and where it lives, that the
door is level geometry with a tag, every size of the yard, where the three stand, `GATE.openSec`, every value of
the look, that the way in is not the gate model, the rose of the sky, and the two NOT rows as reworded.
**Nobody has played it, and the look has been judged only from frames.**

**What this narrows, and what it does not.**
- **Q3** refused option C, the gate puzzle, because "ordered state turns a level's test from 'can this route be
  walked' into 'can this route be walked in this order'". Tim has now asked for exactly one ordered thing: fell
  them, then the gate. The reason is kept as far as it can be: the order is the one the bot already walks (`nav`
  has failed since D-023 unless every swordsman is down at the goal), the gate keeps no state (it is asked of who
  is standing, every tick), and nothing is worked by the player. No bell, plate, lever, rope or torch exists.
- **SPEC §7 row 8** refused "interactables (bell, gate, plate, lever, door, ...)". It now names a gate or door
  *the player works*; the gate of a goal that waits is allowed because nothing is worked. Its two schema checks
  stand: `interactables` and a triggered platform are still rejected.
- **Q4 / row 9**: win is still *arrive*, and `goal.type` is still `reach` alone (`defeat_all` is still rejected).
  `goal.once_clear` says when the arrival counts. Row 9 gains a check: the flag on a level with no swordsman must
  be rejected by the schema.
- **Row 18** (nothing translates but the player, hazards and swordsmen): a door leaf turns about its hinge; its
  position never changes. `ambient-motion` passes, but it idles at the spawn and never sees the gate open: that
  the leaves only turn is how they are built (`src/loaders/courtyard.ts`), not something that stage measured.
- **D-025** said "the four chapters by name": the list is built from the level files and now has five.
- **Q5 / SPEC §5**: a fifth row. `CHAPTER_LENGTH` and the teach rules run on chapters 1 to 4 only; chapter 5
  teaches nothing new and is two segments.

**Built.**
1. **The rule** (`src/systems/fight.ts`): `goalCounts(once_clear, swordsmen)` and `stepGate(share, clear, dt)`,
   pure, beside the fight they depend on. `src/main.ts` asks both after each tick's fight and before the goal is
   tested; nothing is latched, so a respawn, which stands every swordsman up, shuts the goal and the gate with no
   state to undo. The gate swings open over `GATE.openSec` and is shut at once.
2. **The door** (`src/loaders/level.ts`): a placement tagged `gate_door` is a collision box like any other whose
   collider is switched off once the gate stands open. A door on a level without the flag never opens.
3. **The level format** (`levels/level.schema.json`, `tools/lint-level.mjs`): `goal.once_clear`, refused by the
   schema on a level with no swordsman. Lint: `CLEAR_NO_ENEMY`, `CLEAR_NO_DOOR`, `DOOR_NO_CLEAR`, `BAD_DOOR`,
   `DOOR_OFF_PATH`, `CLEAR_FOE_OFF_PATH`, `CLEAR_BLOCKED`, each seen to fail alone in `lint:self`. `FACE_RISE`
   walks the path as it is once the level is clear, with the doors out of the gateway: that is a lint exemption
   for a tagged door, and it is the meaning of "reachable once clear"; without the flag the same box fails it.
4. **The checks.** `check:fight` rule 6: three swordsmen stepped together, the goal and the gate asked every
   tick, five broken versions each seen to fail. The `fight` playtest stage plays the rule in the real game on
   `tools/harness/fixtures/clear-goal.json` (on the goal with him standing: still `play`; the shut door holds;
   open 72 ticks after he falls; shut again after a respawn; then `results` through the gateway) and sees it
   fail with `once_clear` taken out. `nav` holds the gate on the level itself.
5. **The level** (`levels/05-courtyard.json`, laid out by `tools/levelgen/courtyard-05.mjs`, which `lint:levels`
   holds it to): a terrace over the mist, an open post-and-beam gateway, the torii, one yard 22 by 16 m on one
   box, walls 4.8 m with nothing standing on the yard's own box, the far gate and its door, the goal beyond it.
6. **Three at once.** `guard-left`, `guard-right`, `guard-middle`. The bot fells all three and is never cut:
   they notice on ticks 138, 156 and 163, all roused together; all are down 76 ticks after the first notice
   with four presses. `FIGHT`, `SWORDSMAN` and `NAV_CONFIG` are untouched.
7. **The look** (`src/loaders/courtyard.ts`, `tools/art/courtyard-cards.mjs`, `assets/courtyard/`): an ink level
   whose `lighting.ambienceZone` is `courtyard` is dressed by its boxes' tags. The ink pass draws pale, simple
   forms; the paint layer lays flagstones, plaster stains, tile rows and the door's planks over them. What
   stands beyond the walls and the sky are cut from Tim's painting. The far gate is the hero asset `gate`,
   generated from the painting's own gate.
8. **The game.** Chapter 4's goal leads here and this goal returns to the title, by the level's `chapter` alone;
   the Chapters list has a fifth row; `check:teach` covers five chapters; how to play says the gate's rule.

**What it keeps.** `TUNING`, `MOVE`, `FIGHT`, `SWORDSMAN`, `NAV_CONFIG`, the camera and chapters 1 to 4 are
untouched: `frame-hashes` against origin/main is IDENTICAL over 191 values with the engine change alone, and
with the level in differs on `05-courtyard` only. No older trace or golden was written again.
`src/engine/ink-post.ts` and `src/engine/renderer.ts` are not edited.

**Known limits (OQ-079).** With his sight fixed at 4.5 m, three who are roused together stand within about 5 m
of each other: nearer the middle of the yard than the painting has them. The harness's six cameras hang over the
side wall's cap. Against a wall with the camera turned into it the arm is still pulled in (B-82). The painting's
red sky, red timbers and cast shadows are not reproduced: the hue gate and STYLE §1 forbid them. The opening
gate has no sound. The warrior passes through a swordsman still (B-77), but no longer through the level.

**STYLE-BIBLE:** not amended. §2: the sky's wash has the paper's own value and chroma and is not the accent;
recorded as a strain in OQ-079 for Tim to rule on.

implemented_by: 9711fa0 (the rule, the door, the schema, the lint rules, check:fight rule 6, the fight stage's gate run), dc85f2a (the level, the three swordsmen, the ink forms, the painted cards and what stands beyond the walls), 1c48278 (the gate model, the door's planks, nav's gate check, the scene budget, the trace), 61aff4d (the mountains over the far wall, the darwin goldens)

## D-027 — the game plays on a phone: a stick, three buttons, a pause button, and a page that behaves under a thumb. Closes B-56; extends D-022 and D-025. DECIDED

**Ruled by Tim** (2026-11-12, `PROMPT-MOBILE-TOUCH.md`, after the courtyard went live): "Make it work on mobile
and add a joystick control circle to move around and buttons for jump and fight." The brief fixes: the controls
only on a touch device; a joystick circle bottom left with a knob that springs back; Jump (the largest), Sword and
Dash bottom right in a thumb's arc; sprint as the stick at its outer ring; a drag anywhere else turns the camera
"through the same call the mouse uses"; a pause button, and everything the keyboard can leave a finger can leave;
ink on paper, drawn in CSS or SVG, never over the warrior, a teach line or the HUD line. Touch is "one more live
source beside the keyboard and the pad, in the shape `PadSource` already has. `InputFrame` does not change";
"past the dead zone the move intent has length 1"; real multi-touch where nothing sticks; no pointer lock on
touch. No scroll, zoom, selection or callout during play; safe areas respected; landscape is how it is played,
and upright play waits under a plain notice. The words name the touch controls "from one table". Desktop
untouched: `frame-hashes` IDENTICAL, no golden rewritten. No level, movement number, camera rule or `FIGHT` change.
**Applied by the builder, PROVISIONAL until Tim confirms (OQ-080):** every size, place and number in `TOUCH`, the
fixed stick, the kept tap for Jump and Dash, the cards, the hidden hint and the teach line at the top, the
pixel-ratio cap, the upright pause and resume, and the chapter list's two columns. **Nobody has held it on a
phone** (B-106).

**What this changes, and what it keeps.** No NOT row and no closed ruling is narrowed. D-022's known limit "The
game has no touch controls ... the how-to-play page says a keyboard or a pad is needed" is ended here, and that
line of the page is gone. D-025's teach lines are written in a third hand: a finger's, beside the keyboard's and
the pad's. `InputFrame`, `TUNING`, `MOVE`, `FIGHT`, the camera, every level and every trace are untouched.

**Built.**
1. **The source** (`src/engine/touch.ts`): `TOUCH`, the one table, and `TouchSource`, the held states a thumb
   makes, read by `InputSystem.setTouch` in the pad's shape on the live path only. The stick past its dead zone
   is a direction of length 1; at its outer ring it is sprint. Jump and Dash are held states, and a press shorter
   than a tick made while playing is kept for the one tick that reads it (OQ-080 item 3). The Sword is
   `pressSlash`, as the pad's is.
2. **The page** (`src/ui/touch-ui.ts`, `index.html`): every touch followed by its identifier from where it begins;
   a touch begun outside play is nothing until it lifts; a second finger on a held control is swallowed; a finger
   sliding off a button lets it go; `touchcancel`, a vanished touch, leaving play, a hidden tab and a lost focus
   let go of everything. A page button is pressed by a touch that lifts on it unmoved, because the browser makes
   no click of a tap while another finger is down (OQ-080 item 4). The pause and results cards; the upright
   notice; no scroll, bounce, zoom, selection, callout or long-press menu during play; safe-area insets.
3. **The game's wiring** (`src/main.ts`): the controls are built where the main pointer is a finger, on a first
   touch, or with `?touch=on`; never under `?harness=1`, and on a bare page only when asked. A drag calls
   `camRig.addLook`. No pointer lock is asked for by a touch. A phone's canvas is capped at a pixel ratio of 1.5
   (`Renderer.setPixelRatioCap`); every other page keeps `RENDER_CONFIG`'s 2. Sound wakes on the Play tap.
4. **The words** (`src/ui/howto.ts`): the teach lines and the how-to-play page name the stick, Jump, Sword and
   Dash from `TOUCH.labels`, once a finger has touched; the controls table becomes the touch controls' table.
5. **The proof** (`tools/harness/touch.ts`, the `touch` once-stage, its own CI job): the real page in 844x390 and
   932x430 landscape with touch on, played by real touch events through Chrome's own input pipeline, several
   fingers at once. Start by tap; the stick (dead zone, run, sprint ring); a held Jump to the measured 2.34 m and
   a tap to a low hop; Dash with the stick held; a swordsman felled by the Sword button; the camera turned by a
   drag, and three fingers at once; pause, how to play and resume by tap; a goal reached and the next chapter
   taken by tap; chapter 2's first face caught and climbed; a chapter chosen from the list by tap; back to the
   title. Each seen to fail with its control broken from outside, and a stuck-input check after every release
   path. Upright, the pixel-ratio cap, and that a page with a mouse has none of it. 60 of 60.
6. **Frames** for Tim: `docs/build-log/mobile-touch/` (`node tools/harness/touch-shots.ts`).

**Found and fixed on the way (B-105).** A click on the chapter list's gap between two rows started the current
chapter again: the list looked for any `[data-level]` and found `<body>`'s. On main since D-025, on desktop too.

**Proof the desktop is untouched** (MEASUREMENTS "D-027 desktop is untouched"): `frame-hashes` against origin/main
IDENTICAL over 229 values and 6 levels, after the first page change and on the finished source; no golden written;
every static check and every existing stage green.

**Known limits (OQ-080).** Only emulated: headless Chromium, SwiftShader, touch on. Not tried on a phone, in Safari,
with a notch, or by a thumb (B-106). The stage does not play the double jump, wall jump or dash jump by thumb
(B-107). It is slow: 28 minutes in CI, the slowest job (B-108). The controls have no settings (B-109).

**STYLE-BIBLE:** not amended. §2: the controls are ink and paper, part see-through; no accent on UI.

implemented_by: 2df48b3 (the touch source, the controls, the cards, the words, the cap), d9019eb (the touch stage and its CI job, a page button pressed with a thumb on the stick, the chapter list's gap)
