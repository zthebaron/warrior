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

### Q4 — implemented (branch `phase0-q4-amendments`)

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

## Q5-Q7 — outstanding

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
