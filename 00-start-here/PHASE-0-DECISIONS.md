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

implemented_by:

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
