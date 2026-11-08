# Phase 0 — Decisions (APPROVER: Tim, via REVIEWER)

Answered questions are CLOSED. Do not re-ask them. Record new answers here as they land.

## Q1 — Core verb: **A, leap / traversal.** CLOSED

Not combat, not a chase. The deciding argument is harness integrity, not taste: the moment an
enemy pursues the player with pathfinding, the nav bot's route stops being reproducible, and the
replay harness is the thing the whole build rests on. Traversal keeps every level's test a
deterministic path.

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

## Q2a — Ambient crows: **confirmed, with a sharper rule.** CLOSED

Yes: if lift-off always means a timing cue, ambient crows can never lift off. A moving ambient
element is a false positive in the one channel the game uses to say "go now," and signal
exclusivity is worth more than ambience.

Write the rule as translation, not animation — it is lintable that way:

> **Nothing translates except the player and hazards.**

A perched crow's idle head-turn is rotation in place and is allowed. Distant flocks in the far
band (80u+) are painted in place. Mist and pines do not animate.

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

## Q4 — Win condition and session length: **A, with three amendments.** CLOSED

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

implemented_by: cf642c7 (moves_allowed + MOVES_ALLOWED/CHAPTER_MOVE). The four chapter levels themselves are content, not yet authored.

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

implemented_by:

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

## Q7 — The NOT list: **A, with one addition.** CLOSED

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

implemented_by: ec87689 (fix 1: ?level= outside harness mode), 290cc37 (fix 2: startLevel 01-lower-stair, menu string), f79e500 (fix 4: REACHABLE stage, proven to fail with startLevel = 00-gym). Fix 3 (chapter progression) NOT done: due before chapter 2.

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

- **D-015a (PROVISIONAL, needs APPROVER):** chapter 1 drops `climb`. Each +3.50 face becomes a
  1.5-wide shelf at the midpoint — two +1.75 steps, both inside `MOVE.jump.maxRise` 2.00, both
  with a 5–7° readable top surface. `CHAPTER_MOVES_ADDED` becomes
  `{1:['ground','jump'], 2:['wall','double','climb']}`; climb debuts in chapter 2 beside wall and
  double, where Q5 already plans a teach beat. Data-only in the level; one table edit in the
  linter. The alternative — keep climb and add a teach shelf before it — costs a segment, still
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

implemented_by: 8b5a4ac (D-015b READABLE_RISE; D-015c CHAPTER_TEACH made falsifiable, kept live rather than deleted: OQ-047), 286259f (D-015a level data + move table, PROVISIONAL, one revert; plus the D-015c teach step it forced), 05f3ffa (lint:self in CI: both checks proven to fail). D-015d NOT done: B-18. Deviations from the text, recorded not edited: shelves 2.5 u not 1.5 (1.5 fails D-015b), the 4.50 row reads 0 not 3.5 (OQ-046).
