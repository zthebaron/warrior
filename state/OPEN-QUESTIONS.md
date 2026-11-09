# Open questions — the non-blocking protocol

**Agents must never print a question and wait.** The reviewer is asynchronous and may be minutes
away. A blocking question does not get answered faster by being asked; it just transfers the wait
to whoever happens to be in the room, which is how a human ends up hand-relaying A/B/C answers
between terminals.

## The protocol

When you hit a decision you would have asked about:

1. **Decide it.** Take the most reasonable reading.
2. **Append an entry here** — the question, the options you saw, the option you took, and the
   argument for it. Status `PROVISIONAL`.
3. **Keep working** on that basis. Do not stop, do not ask, do not idle.

The reviewer reads this file, then either sets `status: CONFIRMED` or writes an override as a new
decision entry in `PHASE-0-DECISIONS.md`. Re-read this file at every natural checkpoint and
reconcile.

Overriding a provisional decision costs one commit. Blocking on it costs a person's morning. The
asymmetry is the whole reason for this file.

## The one exception

Stop and wait **only** when a decision is both irreversible and could reasonably go either way —
a destructive migration, a production deploy, a financial commitment, publishing something
externally. Then do the preparatory work, set out the decision clearly, and stop there.

"I would like a second opinion" is not that exception. Decide, record, continue.

## Entry format

```
## OQ-001 — <the question in one line>
raised: <date> by <session/branch>
options: A <...> | B <...> | C <...>
took: B
because: <the argument, two or three lines>
status: PROVISIONAL        # PROVISIONAL | CONFIRMED | OVERRIDDEN by D-0NN
```

---

## OQ-001 — SPEC needs a premise sentence, but the interview never asked the premise question
raised: 2026-11-08 by phase0-spec
options: A draft it from locked artifacts | B leave it blank, blocking Gate A | C ask
took: A
because: Gate A's test is "describe the game in 20 seconds", and that can't run with a blank
premise. The sentence uses only what is already locked: the title, STYLE-BIBLE §7's exile, Q5's
ascent, Q2's torii and crow channels. No mechanic hangs off it, so overriding it costs one line.
status: PROVISIONAL

## OQ-002 — Where does the machine-checked NOT table live?
raised: 2026-11-08 by phase0-spec
options: A in SPEC.md between markers, parsed by the lint | B a JSON file that SPEC.md copies | C both
took: A
because: one copy. SPEC.md is what agents read, and tools/lint-not-list.mjs parses that exact table.
A JSON file plus a prose table is two sources, which is the drift class D-002 exists to stop.
status: PROVISIONAL

## OQ-003 — The NOT list has rows that are violated today, before the schema cut. Is CI red until it lands?
raised: 2026-11-08 by phase0-spec
options: A CI red | B rows marked pending, CI green | C per-check `!` marks for known-open checks, CI green
took: C
because: A blocks every PR on queued work. B lets a pending row absorb new violations: row 14 was
pending only for `damage`, so a new `playerHealth` would have passed. Tested: it slipped through
under B and is caught under C. A `!` check that starts holding also fails the lint, so the marks
can't go stale.
status: PROVISIONAL

## OQ-004 — How does a `src` NOT check match identifiers?
raised: 2026-11-08 by phase0-spec
options: A plain grep | B whole identifiers only | C comments stripped, identifiers split on camelCase/snake_case, word match
took: C
because: A fires on comments ("number lives in TUNING") and on substrings (`hp` inside unrelated
words). B misses `playerHealth`. C catches compound names and ignores prose. String literals are
still scanned, deliberately: `'collect_all'` in a type union is a real reference.
status: PROVISIONAL

## OQ-005 — P0.1 asks for placeholder tuning constants. The engine already has measured ones.
raised: 2026-11-08 by phase0-spec
options: A placeholders as written | B the measured values, each citing its source constant
took: B
because: placeholders in SPEC.md would disagree with TUNING and the MOVE table on day one, which is
the drift MEASUREMENTS.md warns about. The prompt predates the gym measurements.
status: PROVISIONAL

## OQ-006 — Q7 is half built (lint:not-list exists, the schema cut does not). What goes in its implemented_by?
raised: 2026-11-08 by phase0-spec
options: A this commit | B leave empty until the cut lands
took: B
because: D-002 says the field stays empty until the commit implementing the decision lands. A
partial fill would assert the code has properties it lacks. The open part is tracked visibly by the
`!` checks in SPEC §7. Q4 got `afb3e4b` because it is fully built.
status: PROVISIONAL

## OQ-007 — Cutting `lighting.sunAngle`/`intensity` from level data moves the greybox light (gym [50,135] vs engine default [45,135])
raised: 2026-11-08 by phase0-spec
options: A accept the light change, re-record goldens | B make the gym's value the engine's greybox constant | C keep the fields
took: B
because: re-recording goldens to absorb a refactor is exactly what the never-list forbids, and C keeps
a STYLE §1 violation in the schema. The greybox DirectionalLight is engine-only until the ink shader
replaces it; with the constant at the gym's old value the goldens stay byte-identical.
status: PROVISIONAL

## OQ-008 — What does "water restricted to flat wash" (Q2c, B-2) mean as a schema rule?
raised: 2026-11-08 by phase0-spec
options: A water requires `y` (a still plane) and forbids period/path/speed/phase | B also forbid pos/size | C leave it to the shader
took: A
because: "flat" is a horizontal plane at a height. "Wash" means it never animates (Q2a: nothing
translates except the player and hazards, and a wave is translation). pos/size stay allowed so a
pool can be bounded. Reflectivity is a rendering property (STYLE §9.8) the schema cannot express.
status: PROVISIONAL

## OQ-009 — CLAUDE.md's precedence order does not mention SPEC.md or AGENT-BRIEF.md
raised: 2026-11-08 by phase0-spec
options: A rank them above the decisions | B rank them between the linters and the playbook | C leave them out
took: B
because: both are derived from the decisions, measurements, style bible and linters, and say so in
their own first paragraphs. Leaving them out (C) is how a conflict ends up resolved by whichever was
read last. SPEC §7 is the one exception, because lint:not-list executes it.
status: PROVISIONAL

## OQ-010 — D-004 says the clock runs during death, but the respawn delay was counted in render-frame time
raised: 2026-11-08 by phase0-spec
options: A advance the clock by render frameDt during death | B keep ticking the world in fixed ticks during death; respawn becomes a tick countdown
took: B
because: A makes hazard phase at respawn depend on frame rate, which is exactly the
nondeterminism D-004 protects against, and the harness could never reproduce it. In B the loop
ticks while `worldRunning()` (play or death): it poses the world and steps physics, but does not
advance the player or sample input, so recorded traces stay aligned. Respawn becomes
round(respawnDelaySec × 60) = 48 ticks, using the existing constant (no new number).
status: PROVISIONAL

## OQ-011 — Platforms kept their own `p.time += dt` clock. Do they move onto the world clock too?
raised: 2026-11-08 by phase0-spec
options: A only hazards use the world clock | B platforms and hazards both pure in world time
took: B
because: under A, platforms freeze during death while hazards keep moving, so their relative timing
drifts with every death. B-7 would then be sweeping a combination the game never holds still. B also
removes the last per-entity mutable clock. Identical with no deaths: replay is still 1671/1671 ticks
and goldens still 0.000%.
status: PROVISIONAL

## OQ-012 — What motion does a patroller follow, and what is `phase` a fraction of?
raised: 2026-11-08 by phase0-spec
options: A ping-pong along the polyline, phase = fraction of one out-and-back loop | B cycle (wrap to start) | C a `loop` field like platforms
took: A
because: "patrol" reads as back and forth, and wrapping (B) teleports a hazard from end to start, which
is translation the player cannot read. One loop is 2·length/speed seconds, so phase ∈ [0,1) covers
every pose exactly once: the set PHASE_SWEEP's 8 offsets sample. C adds a field nobody asked for.
status: PROVISIONAL

## OQ-013 — A patroller kills on contact, but with what volume?
raised: 2026-11-08 by phase0-spec
options: A required `size` (schema + lint NO_PATROL_SIZE) | B an engine default size
took: A
because: a default would be an unmeasured number (CLAUDE.md). Static hazards with pos+size (spike,
crush, bounded water) use the same box-vs-capsule test. Crush's `period` still has no runtime meaning,
so it is treated as a static volume until something decides what crush does.
status: PROVISIONAL

## OQ-014 — The gym fails PHASE_SWEEP's 12 s per-segment budget (13.2 s and 18.7 s). Fix the gym, or exempt it?
raised: 2026-11-08 by phase0-spec
options: A add checkpoints to the gym | B exempt chapter 0 from the 12 s (still assert every phase clears) | C raise the budget
took: B
because: Q4 says chapter 0 is the gym, not a chapter, and Q3's per-segment budget is about game
segments. The gym is a move fixture, never built to it. A changes the gym's visuals (checkpoint
meshes move the goldens) to satisfy a rule that does not apply to it. C weakens a decided budget.
Under B the gym still must clear from every arrival phase, and its worst time is printed in the
check, not hidden. nav's aggregate 12 s × segments check would never have caught this; per-segment
assertion now exists for chapters 1+.
status: PROVISIONAL

## OQ-015 — Q6 says "8 evenly spaced phase offsets" of what, when hazards can have incommensurate periods?
raised: 2026-11-08 by phase0-spec
options: A the longest timed loop in the level (patroller 2·len/speed, platform pingpong 2·duration / cycle duration) | B the LCM of all periods | C a fixed window
took: A
because: B does not exist for incommensurate periods, which is the case Q6 is worried about. C needs an
unmeasured number. A covers every pose of the slowest element, and the other elements are sampled at
their own phases within that span. Wait cost is quantised to P/8, so it overestimates the true
minimum wait: conservative toward failing. Increase N if a level ever needs finer resolution.
status: PROVISIONAL

## OQ-016 — Finding: a water hazard with only `y` (the flat-wash form B-2 allows) never kills at runtime
raised: 2026-11-08 by phase0-spec
options: A treat a pos/size-less water plane like a fall plane (below y = death) | B leave it until a level uses water
took: B, recorded here as a proposed backlog item rather than built
because: found while writing B-8. hazardHit() only tests volumes (pos+size or patroller), and only the
`fall` plane is checked by height, so a bare `{type:"water", y}` is inert. No level uses water yet, and
whether water is "below y = death" or a surface you can wade in is a design call Q2c did not make. B-8
already treats the fall plane as a respawn hazard; when water's meaning is decided, it should be added
there too.
status: PROVISIONAL

## OQ-017 — D-005's table says hazard `size` is half-extents; every executable use treats it as full extents
raised: 2026-11-08 by phase0-spec
options: A follow D-005 (size = half-extents) | B follow the code (size = full extents)
took: B, and recorded the conflict here as CLAUDE.md requires
because: HAZARD_ON_PATH halves it (`s[0]/2`), the runtime mesh scales by it, and hazardHit() halves
it. Under A the linter would check a volume twice the size of what actually kills, disagreeing with
the runtime. The schema does not say either way; it should get a description ("full extents").
D-005's geometry is otherwise implemented as written.
status: PROVISIONAL

## OQ-018 — D-005 says inflate the capsule by "capsuleRadius plus a small margin". What margin?
raised: 2026-11-08 by phase0-spec
options: A 0, relying on the AABB-per-leg over-approximation | B a chosen number
took: A
because: no margin value is measured anywhere, and CLAUDE.md forbids unmeasured numbers in code.
Treating each leg as an AABB already over-reports (by up to the full leg's bounding box on diagonal
legs), so the error is biased the right way. A measured margin, if one is ever wanted, goes in
MEASUREMENTS.md first.
status: PROVISIONAL

## OQ-019 — Push the D-001 / D-003 / stair commits to PR 3?
raised: 2026-11-08 by h4-asset-kit (H4 follow-up session)
options: A push to origin/h4-asset-kit so PR 3's CI checks them | B commit locally only
took: B
because: the original H4 instruction was an explicit "Do not push", and the reviewer pushed PR 3
  themselves. Pushing is reversible, but an explicit instruction outranks the protocol default.
status: OVERRIDDEN by the reviewer, 2026-11-08 07:38: "push it to PR 3" (after a rebase onto main). Done.

## OQ-020 — ACCENT_AREA floor: what anchors "findable"?
raised: 2026-11-08 by h4-asset-kit
options: A share of a torii at the near-band edge, 25 u from camera (0.505%) | B the seed's
  measured red share (0.012%) | C wait for H2.5 player data before asserting any floor
took: A, frozen as a number in assets/src/accent.json, labelled PROVISIONAL in the Style Bible
because: B is the value D-001 showed fails, so it cannot be a findability floor; C leaves the
  floor D-003 asked for unenforced. A rests on a STYLE-BIBLE §3 rule (the next waypoint reads as
  a near form) plus a measurement, and H2.5 can replace it with one number in accent.json.
status: OVERRIDDEN by D-006 (no ceiling; a floor measured at scanning distance — see OQ-026..028)

## OQ-021 — ACCENT_AREA ceiling: what anchors "dominates"?
raised: 2026-11-08 by h4-asset-kit
options: A ink-black's seed share, the least-used ramp value (5.08%) | B a multiple of the
  measured torii share | C the old 1%
took: A, read from reference/palette.json at run time
because: C is the withdrawn number; B is circular (the asset sets its own limit). A says the
  accent may never cover more of the frame than any structural value of the ramp does, so it
  stays a signal. Crossed only with the player within ~2 m of the gate (5.14% at 2 m).
status: OVERRIDDEN by D-006 (no ceiling; a floor measured at scanning distance — see OQ-026..028)

## OQ-022 — ACCENT_AREA: assert at one framing or along the whole approach?
raised: 2026-11-08 by h4-asset-kit
options: A only at the canonical framing, 6 m before each torii (D-003's "next torii ~6m ahead")
  | B at every distance along the approach
took: A
because: share is ~inverse-square in distance (9% at 0 m, 0.15% at 40 m), so B fails every gate
  at both ends by construction. The rule is about the frame in which the player looks FOR the
  next gate; walking through one is not a violation. The full curve is recorded, not asserted.
status: OVERRIDDEN by D-006 (no ceiling; a floor measured at scanning distance — see OQ-026..028)

## OQ-023 — ACCENT_CONTRAST: add a lightness floor beyond D-001's dE2000 + chroma?
raised: 2026-11-08 by h4-asset-kit
options: A dE2000 + chroma only, as D-001 worded it | B also require L* >= wash-mid (42.7)
took: B
because: measured: dark #5a0000 clears dE2000 (24.5) and chroma (45) yet is exactly D-001's
  "another dark shape". dE2000 also compresses large chroma gaps, so a flat dE can't separate
  the two cases. Thresholds are derived from palette.json (2x ramp step, 3x max chroma).
status: PROVISIONAL

## OQ-024 — Which accent candidate ships until H2.5?
raised: 2026-11-08 by h4-asset-kit
options: vermilion_a #e34234 | vermilion_b #ef5b3b | vermilion_c #c8371f
took: vermilion_a
because: it is the reference vermilion D-001 named. All three pass, and `?accent=<name>` switches
  them in place, so the default only decides what CI goldens show. Changing it is one line in
  assets/src/accent.json plus re-recorded goldens.
status: PROVISIONAL

## OQ-025 — Merge origin/main into h4-asset-kit?
raised: 2026-11-08 by h4-asset-kit
options: A merge (picks up PHASE-0-DECISIONS, Q4 par_time removal, this file) | B stay on the old base
took: A (merge commits 3f89647, 86be6b4; both clean, playtest green after)
because: PR 3 targets main, implemented_by has to be written in PHASE-0-DECISIONS (only on main),
  and testing against main's Q4 schema is what CI will run once merged.
status: PROVISIONAL

## OQ-026 — ACCENT_AREA floor: where does findability "actually fail" without a person to ask?
raised: 2026-11-08 by b6-accent-floor (kit)
options: A the share where the accent vanishes (200 m) | B the share where its largest connected blob
  falls below the seed red's observed failure area (0.012% = 27.6 px at 640x360) | C wait for H2.5
took: B, the last sample above it: 90 m, 0.0204%
because: A is visibility, not findability: one pixel is not found. B anchors on the only observed failure
  (D-006 names it), and measures the blob, not total pixels, because at 100 m the posts fracture into
  18 px pieces while the total stays higher (52 px). C leaves D-006's floor unenforced. H2.5 can replace
  the number in accent.json; the curve gives it the distances to show.
status: PROVISIONAL

## OQ-027 — ACCENT_AREA: from where is the next gate scanned for?
raised: 2026-11-08 by b6-accent-floor (kit)
options: A a fixed distance before each gate | B the previous anchor (previous torii, else spawn), camera
  facing the gate | C every point along the approach
took: B
because: Q3 makes the torii the checkpoint, so the previous torii is where a player arrives and looks for
  the next one; that is the hardest real scanning distance, and it turns the rule into a level-design check
  on gate spacing. A is what D-006 replaced. C fails by construction at the far end of any long segment.
status: PROVISIONAL

## OQ-028 — ACCENT_AREA: count the whole frame's accent, or only the target gate's?
raised: 2026-11-08 by b6-accent-floor (kit)
options: A all accent pixels in the frame | B only the target gate's (render with and without it)
took: B
because: measured, A is wrong. Scanning from the x=50 gate puts that gate in the frame, so A reported 9.04%
  for the x=88 gate, which is the near gate's area. B keeps real occlusion (a nearer gate hiding it counts
  against it) and credits no other gate. Cost: two renders per gate.
status: PROVISIONAL

## OQ-029 — D-007: batch the landing mark into an existing draw call, or exempt the budget under the flag?
raised: 2026-11-08 by phase0-spec
options: A batch | B exempt the Tier-1 assertion when the flag is set | C neither: show it stays under budget
took: C
because: the Tier-1 draw-call budget is an absolute ceiling (300), not a baseline, and the gym peaks
at 30, so one extra disc cannot fail it. Measured with the flag on: 31 calls, PASS. B would put a
hole in a budget for no reason, and A couples a moving ground mark to geometry it does not share.
Off, the mesh is `visible=false`, which three.js neither draws nor uploads: goldens and counters
are byte-identical. If a real level ever runs near 300, revisit; the flag makes it a 1-call question.
Feel-test note: on the gym's checkpoint pads (visual-only, 6 cm thick) the disc is hidden underneath,
because the ray passes through the pad to the floor. Real torii are not floor tiles.
status: PROVISIONAL

## OQ-030 — B-12/B-13 were implemented twice, in parallel. Which lands?
raised: 2026-11-08 by b12-b13-world-clock-patroller
options: A open a PR with this session's runtime | B drop it; land only what main lacks
took: B
because: 6dcc157 landed first and does more (platforms on the same clock, static hazard volumes).
  Two runtimes for one decision is the drift D-002 exists to stop. What main lacked, and this branch
  adds: (1) CI proof — harness stage `hazards` (fixture level; runtime vs an independent oracle to
  1.8e-15u; touch = death; +0.8000s across death; new phase at respawn; pause frozen); (2) chaos
  asserts the clock across every gym death; (3) a chaos bug D-004 exposed: it counted death ticks
  as input, reporting "3600/3600" while playing 3360 frames (5 deaths x 48). The superseded runtime
  commits were force-replaced on this branch (with lease). Cause: no claim on backlog items;
  state/CLAIMS.jsonl is unbuilt, and claiming in a first commit message is only visible after the work.
  (Raised as OQ-014; renumbered OQ-030, reserved in state/CLAIMS.jsonl — main had its own OQ-014.)

## OQ-032 — Hazard `period` is accepted on every hazard type and nothing at runtime reads it. Give it a meaning or remove it?
raised: 2026-11-08 by phase0-spec
options: A remove it from the schema | B define crush as cycling on `period` | C keep it, documented as unused
took: A
because: same class as D-008 (a field that can be authored with no effect is a schema defect) and as
Q4 amendment 2 (a field an agent sees gets wired up). B would be a design decision about what crush
does, and no decision covers it. C is the defect itself. Neither level used it. If crush cycling is
decided later, `period` returns as a schema addition with its runtime and a decision entry.
status: PROVISIONAL

## OQ-034 — The crow's lead time: a fixed constant, or authored per crow?
raised: 2026-11-08 by kit (CHAPTER-1)
options: A one fixed lead constant in code, lift = window_open - lead | B `lift` authored per crow as a loop fraction, sufficiency proven by the harness, the effective lead measured and reported | C as A, with the window computed from the patroller's geometry against the cue path
took: B
because: PROMPT-CHAPTER-1 says "lifts off on a fixed lead time before the safe window opens", but no
lead is in MEASUREMENTS.md, and CLAUDE.md forbids a number in code that is not there. The right lead
is a human-reaction number, and only H2.5 can measure it. So under B the crow carries `lift`, and the
harness proves it is a sufficient "go now": the bot departs on the lift-off edge and must clear from
all 8 arrival phases. A quarter-loop mistimed `lift` fails 0/8 (verified). Measured in chapter 1: lift
to window-open is 0.83 s (seg 3) and 1.19 s (seg 4), and departing up to 0.75 s / 0.95 s after
lift-off still clears every phase (tools/harness/cue-window.ts). C is the upgrade once H2.5 picks a
lead: a lint rule then derives `lift` and the authored field goes away.
status: CONFIRMED (Tim, 2026-11-08). Stronger argument than the one made: the harness proves sufficiency without knowing the correct value, a property test standing in for a constant nobody can measure yet. The number that matters is the SLACK, not the lead: H2.5 must measure how late a HUMAN can depart after lift-off and still clear, against the bot's 0.75 s / 0.95 s. If human slack falls outside bot slack, the problem is cue legibility, and a bigger lead will not fix it.

## OQ-035 — Where does a crow live in the level schema?
raised: 2026-11-08 by kit (CHAPTER-1)
options: A a top-level `crows` array, each referencing a hazard | B a `crow` block inside the patroller it cues
took: B
because: Q2a: "nothing translates except the player and hazards." Under B the only crow that can move
is part of a hazard, and a crow keyed to anything but a timed hazard cannot be represented: the schema
allows `crow` on `type: patroller` only, so there is no rule to lint. Ambient crows cannot be authored
at all yet; chapter 1 needs none. If they are wanted, they get their own array with no motion fields,
which makes NOT row 18 enforceable as a schema check. A waypoint's `cue: <hazard index>` says where
the player waits for it, and lint checks that it waits at a torii (BAD_CUE, CUE_NOT_AT_TORII).
NO_CROW_CUE makes Q5's "chapter 1 carries the crow" executable.
status: PROVISIONAL

## OQ-036 — Q6 part 6 (per-segment death counts) does not exist. What stands in for the teach-rate proxy?
raised: 2026-11-08 by kit (CHAPTER-1)
options: A build the per-segment counter first | B report PHASE_SWEEP "blind" departures (the bot ignoring the crow) as deaths per segment, labelled as a proxy | C report nothing
took: B
because: the harness has only a total `deaths` counter, and nav fails on the first death, so the expert
bot always shows 0. That measures nothing. A blind departure is exactly a first-time player who does
not read the crow, so its failure count is a direct per-segment death measure for the one unproven
mechanic. It is report-only and never fails CI. A is real work owed to Q6, now B-17 in the backlog.
status: PROVISIONAL

## OQ-037 — Chapter 1 is 4 segments. What does that set for chapters 2-4?
raised: 2026-11-08 by kit (CHAPTER-1)
options: A leave CHAPTER_SEGMENTS (4-6, chapter 2+) as it is; chapter 1 needs no rule of its own | B tighten to 4-5 | C set a per-move rule, "one segment per new move or signal that can kill you, plus one transfer segment for the riskiest"
took: A, recording C as what chapter 1 actually did
because: four came from C: ground cannot kill on a 7 m seam ledge, so it shares a segment with jump;
climb gets one; the crow gets two (introduce it alone, then transfer it to a jump), because Q5 calls it
the riskiest unproven element. Bot time is 19.75 s total, inside 12 s per segment. Chapters 2-4 add
2/2/1 moves and no new signal, so C predicts 2-4 teaching segments plus practice: that lands in 4-6.
The lint warning CHAPTER_LENGTH_PENDING stays until Tim sets the rule. The number is an input to
that decision, not the decision.
status: OVERRIDDEN by D-011 (C is the rule, not a description; 4-6 is a warn)

## OQ-038 — ACCENT_AREA (D-006) made a two-climb segment impossible. Is the scanning frame right for a climbing game?
raised: 2026-11-08 by kit (CHAPTER-1)
options: A keep the rule; author one climb per torii-to-torii rise | B scan with the rig pitched toward the gate | C exempt gates above the anchor
took: A (the level was changed, the rule was not)
because: the scan stands 6.7 m behind the previous torii, at the rig's rest pitch, facing the next one,
so the previous torii is always dead centre. With two stacked 3.5 m faces in between, the upper lip
hides everything below +8.4 degrees, and the previous gate's crossbeams cover +5..14 (frame top +12). Rendered with
tools/harness/scan-frame.ts: 0.0000% at 21 m and at 33 m. Weakening a measured rule to fit content is
forbidden. But this game climbs a mountain, so a player looking up for the next gate is the normal
case. B is worth Tim's decision before chapters 2-4 author more vertical segments.
status: OVERRIDDEN by D-012 (the frame was the defect, not the floor; A stands for chapter 1)

## OQ-039 — `npm run lint:levels` never validates the schema
raised: 2026-11-08 by kit (CHAPTER-1)
options: A add ajv validation to lint:levels | B leave the schema to the playtest/game load
took: B for now (out of CHAPTER-1 scope); recorded as a finding
because: lint-level.mjs is semantic only. A level can print LINT PASS and still fail
level.schema.json; only `npm run playtest` or a game load catches it. While authoring, a schema
error (strict-mode `if/required`) crashed the harness at compile, and LINT PASS had already been
printed. The cheapest fix is a few lines in the lint:levels loop.

## OQ-040 — D-010: batch the landing mark into an existing draw call, or raise the asserted count by one?
raised: 2026-11-08 by phase0-spec
options: A batch | B raise "the asserted count" by one | C there is no per-scene count asserted: add a measured scene ratchet and set it
took: C
because: the only draw-call assertion was the Tier-1 ceiling (< 300). The gym's 30 -> 33 history lived
in MEASUREMENTS prose, so there was no asserted count to raise, and a +1 under a 300 ceiling cannot
fail anything. That is exactly how it would "ride as an unexplained +1". So the asset ratchet
discipline now covers scenes: tools/assets/budgets.json `scenes["00-gym"]` = 34 calls / 1,104 tris,
set AT the measurement, asserted by `counters`, history in MEASUREMENTS 'Scene budgets'. A not
possible in practice: the disc moves every frame on its own and shares no geometry or material.
status: PROVISIONAL

## OQ-041 — D-010 says "the visual goldens all moved" with the mark on. Measured: they did not fail
raised: 2026-11-08 by phase0-spec
options: A re-record anyway, saying why | B leave them (they pass)
took: A, with the premise corrected (recorded here as CLAUDE.md requires)
because: with the mark on, cam0 drifts 7 px and cam1 17 px, under the 0.5% tolerance; cams 2-5 are
byte-identical (they frame the level, the player is a few px at spawn). So the suite would have stayed
green. But left un-recorded, that drift becomes permanent baseline noise eating into the tolerance:
a real regression of the same size would then pass. Re-recorded deliberately: on darwin only cam0
(8 px, a 4x3 patch at the feet) and cam1 (29 px, 11x5) changed, both to near-black ink, nothing
else. Linux regenerated by CI from scratch (the missing-golden mechanism) and checked byte-equal.
status: PROVISIONAL

## OQ-031 — Harvest from b12-b13-world-clock-patroller: what moves to main, and in what form?
raised: 2026-11-08 by b12-b13-proofs (kit), asked for by the reviewer
options: A port the old src/systems/patrol.ts (base-centre convention, its own algorithm) | B move main's
  patrollerAt algorithm VERBATIM into src/systems/patrol.ts and test that | C leave tests against an oracle only
took: B
because: two algorithms for one decision is the drift this repo keeps paying for; A would replace a landed,
  reviewed runtime with a different one. B makes the runtime itself Node-importable, so check:patrol (65
  properties: period, purity, periodicity, phase = time offset, ping-pong endpoints, no teleport across the
  wrap, agreement with the independent oracle, zero-length segments) tests what the game runs. It also
  removes sweep.ts's second definition of the patroller period: sweep now calls patrolPeriod().
  Harvested from the old branch: check-patrol.ts (properties, retargeted), hazards.ts + fixtures/patroller.json
  (already adapted in 463a696). Not harvested: the old patrol.ts algorithm and its capsuleTouches — main's
  hazardHit and D-005 own contact. After this lands the old branch holds nothing main lacks; safe to delete.

## OQ-042 — D-011 counts "new moves that can kill you". Which moves can?
raised: 2026-11-08 by kit (D-011)
options: A every move but ground | B every move | C derive it per level from geometry (does the edge cross the void?)
took: A (`NON_LETHAL_MOVES = ['ground']` in tools/lint-level.mjs)
because: this is what chapter 1's 4 segments came from, and D-011 adopted that derivation. Ground never
leaves the support surface. Walking off an edge is a risk every segment carries, so it needs no segment
of its own. B would demand a segment that teaches walking. C is honest but needs a geometry model the
linter does not have, and it would make the count depend on layout rather than on the moveset, which
is the opposite of D-011's point.
status: CONFIRMED with a renaming (PHASE-0-DECISIONS "OQ-042"): the concept is "misunderstanding the move is unrecoverable within the segment", not "can kill you". Same classification; RECOVERABLE_MOVES = [ground]

## OQ-045 — b12-harvest has been rebased three times; should it have been split into PRs that land as they finish?
raised: 2026-11-08 by phase0-spec (PR4-REBASE-2)
options: A keep long-lived feature branches, rebase as needed | B split along independently-testable commits and land each as soon as it is green | C keep one branch but rebase it daily
took: B, for future branches
because: PR 4's three commits were each independently landable (the hazards CI proof, the pure patrol
module, a docs note), yet it waited for PR 3, then PR 8, then PR 6, and each merge invalidated it again.
The cost is not the textual conflicts, which are mechanical. It is that rebases 2 and 3 each needed a
SEMANTIC decision made by someone without the author's context:
  - rebase 2: a duplicate `rules` member (B-8's vs PR 4's), declared outside the conflict hunk, so
    taking both hunks would not have shown a conflict but would not have compiled;
  - rebase 3: chapter 1's crow cue derives from `loopFraction` ("the ONE definition"), and PR 4 moved
    the same math into src/systems/patrol.ts. Taking both sides would have compiled cleanly and left
    TWO loop-fraction definitions, the crow's and the patroller's: exactly the drift a crow cue cannot
    afford. Resolved by making patrol.ts's `patrolFraction` the single source.
Had the pure-module commit landed on its own the morning it went green, chapter 1 would have been built
on it and neither decision would have existed. C only shrinks the gap between invalidations. Proposed
rule: a branch lands within the session that made it, or is split so that each green, independently
testable commit lands alone. A branch that must wait on another PR says so in its first line.
status: PROVISIONAL
*(Placed out of numeric order on purpose: appended at the end, it collided with PR 4's own end-of-file entry and made PR 4 conflict again, the exact failure it describes.)*

## OQ-046 — READABLE_RISE (D-015b): four places the ruling's arithmetic and the geometry disagree
raised: 2026-11-08 by builder-d015 (D-015-BUILD)
options: A implement the prompt's formula verbatim (fixed 15 u landing, band for any rise) | B implement what D-015b says the check is for ("the top surface must subtend >= 2.0 deg"), with the landing measured from the level
took: B
because: the four test vectors (reject 3.50, 3.75; accept 1.75, 2.00) agree under both, so the choice
only shows where they diverge, and every divergence is a counter-example the VERIFIER was invited to find:
  1. **A top at or above the eye has no visible top surface.** D-015's table gives +4.50 a 3.5 deg band:
     that is the angle between the lip and the far edge of a surface the eye is UNDER. The player sees
     the face and a silhouette, never ground. `readableBandDeg` returns 0 when rise >= eye (3.66 u). D-015
     is not edited (the APPROVER's table stands as written); this records that its 4.50 row is wrong.
  2. **The +15 is in no measured source** and hides the narrow-landing case. The landing depth is now
     measured: from where the approach ray enters the prim_box under the landing waypoint to where it
     leaves, or to where a taller box (the next riser) begins. Adjacent boxes at the same top are not
     merged: conservative, a false fail costs one edit. A landing that is not an axis-aligned prim_box
     is an ERROR ("cannot be measured"), not a pass.
  3. **D-015a's "1.5-wide shelf" fails D-015b** (1.75 onto 1.5 u = 1.79 deg). The shelves are 2.5 u
     readable (2.73 deg). The prompt's suggested boxes already gave 2.5; D-015's prose said 1.5.
  4. **Scope.** Chapters only (`chapter >= 1`): the gym is a budget rig authored AT the move limits
     (3.5 climb, 3.5 wall) and fails by design. `ground` rises are skipped (stairs/slopes, read face by face:
     a 0.5 autostep face reads at >= 9 deg). That ASSUMES the geometry under a ground via is steps or a
     slope; the linter only bounds a ground rise by run*tan(50 deg), so one tall face authored as
     `ground` skips this check and is caught only by nav failing to walk it. RB-003 names it.
     `platform` rides have no face.
  5. **Consequence for chapter 2+ (not a choice, a result): at the rest pose the highest readable rise
     is 3.18 u onto a 15 u landing** (3.29 onto 41 u, 2.83 onto 5 u, 2.28 onto 2.5 u; bisected with
     `readableBandDeg`). `MOVE.climb.maxRise` 4.5, `wall` 4.0 and `double` 3.5 exist for faces a jump
     cannot clear, and READABLE_RISE rejects that whole range. D-015a moves climb into chapter 2 beside
     wall and double, so **chapter 2 cannot be authored against this linter until D-015d (B-18) lands**
     and the check models a pitch the player can actually be at. This is D-015b's stated intent
     ("rejects ... anything at eye level"); it is written here so the APPROVER rules on D-015a knowing it.
     *[Corrected under D-016: this item first said 3.19 / 3.30 / 2.29. Those were the bisection rounded to
     the nearest 0.01, and each rounded value itself FAILS; the figures above are the largest passing value at
     0.01 u. The hard ceiling for any landing depth is 3.36 u. D-016 rules on the consequence.]*
Also: CAMERA_TUNING and RENDER_CONFIG moved into import-free modules (`src/engine/camera-tuning.ts`,
`render-config.ts`) because Node's type stripping rejects the parameter properties in camera.ts /
renderer.ts; both re-export them, and `tools/harness/accent.ts` (which regex-reads the rig) now reads
the new files. Not covered: pitch (the check is the REST pose; the player can look down, which is
D-015d's subject), lateral approach angle (the ray is the a->c line), and drops (no face to read).
status: PROVISIONAL

## OQ-047 — CHAPTER_TEACH (D-015c) made falsifiable: it fails main's chapter 1 on its first jump
raised: 2026-11-08 by builder-d015 (D-015-BUILD)
options: A express the predicate and fix the level it fails | B express it, leave chapter 1 red | C delete the check and leave this entry (D-015c's allowance) | D keep it as a WARN
took: A, with the data change under D-015a's APPROVER flag
because: the predicate is expressible from linter data. A new move's FIRST use is its teaching
instance; it is recoverable iff (a) its approach waypoint is a torii (RESPAWN_RULES radius/height), so a
death respawns you AT the approach, or (b) every point of the span, sampled each `bodyRadius`, has
prim_box floor no lower than approach minus `MOVE.ground.autostep`, so a miss leaves you standing.
Both numbers already exist. "Bypassable" (D-015c's other branch) is NOT credited: it needs an
alternate route, which the data does not express.
Wired, it failed main's chapter 1 on **jump**, not on climb: the first jump was gap 2 (x 12 -> 14),
over the void, 12 u past spawn. A miss there cost the segment. (Climb's first use was over floor, and
crow's is from a torii, so both would have passed: the shipped D-015 defect was READABLE_RISE's, and
CHAPTER_TEACH's tautology was hiding a different one.) D is the tautology with another label
(warnings never fail the build); B blocks every PR; C throws away a check that works.
The fix is data-only: one prim_box, a **+1.25 step at x 6-10** before gap 2, reached by jump (above
a tapped jump's 0.995 peak, under MOVE.jump.maxRise 2.00), over floor, reading 4.78 deg. Gap 2 is
unchanged. Proof it is not rebuilt as a tautology: `npm run lint:self` (CI) asserts a fixture that is
the shipped level minus that step FAILS with exactly one error, CHAPTER_TEACH, and that neutering the
predicate turns that check red (mutation-tested by hand).
Side effects, recorded: chapter 1 now classifies 2 teaching (jump, crow) + 1 transfer + 1 practice
(climb left chapter 1), 0 warnings. Seg 3's crow gate still holds but blind departures fail 2/8 (main:
4/8): the shelf-2 approach (x 89.5) sits inside the sweep lane, crossed on the crow like the run it
replaces; it is 2 u short of the riser because 1 u was measured too short (the bot bonked the face).
The nav bot needed one fix: it held jump from one rising jump into the next, and jump is
edge-triggered, so it stood at the second riser; it now releases for one tick (`heldIn`, nav.ts).
`npm run lint:example` (not in CI) now fails: its landings are kit meshes (unmeasurable) and its first
dash is over the void. Both are true of that file; chapter 3 is not authored here.
status: PROVISIONAL (needs APPROVER with D-015a)
D-015a (the data change this took A under) was APPROVED 2026-11-08 by the chat REVIEWER on a call Tim
delegated; see D-015. This entry's own status is unchanged.

## OQ-043 — D-011's transfer segment is for "the riskiest". Which is the riskiest in chapters 2-4?
raised: 2026-11-08 by kit (D-011)
options: A a per-chapter table: chapter 1 crow (Q5), then the move Q5's table lists last (2 double, 3 dash, 4 dashjump) | B declared per level | C every new item gets a transfer
took: A (`CHAPTER_RISKIEST` in tools/lint-level.mjs)
because: Q5 names the crow as chapter 1's riskiest. For 2-4 its notes single out the later move: airborne
cliff work and double; "timing and gaps arrive together" and dash; dashjump alone. B puts the choice back
in an agent's hands, which is the taste D-011 removes. C turns "plus one" into "times two" and
contradicts D-011's text. One table, five entries, overridable in one commit.
status: CONFIRMED (PHASE-0-DECISIONS "OQ-043"): Q5's order already encodes difficulty, so "last in the chapter's list" is a derivation, not a judgement

## OQ-044 — PR6-REBASE asked for a rebase of chapter-1 onto main. Rebase, or merge main in?
raised: 2026-11-08 by kit (PR6-REBASE)
options: A rebase chapter-1 onto origin/main and force-push | B merge origin/main into chapter-1 (fast-forward push) | C nothing (it was already clean)
took: B
because: PR 8 merged INTO chapter-1 (bfc6a3f), so none of either PR's commits were on main, and
`git merge-tree origin/main chapter-1` showed no conflicts: main was 3 claim-ledger commits ahead.
A rebase would have rewritten every chapter-1 commit, orphaning the hashes that implemented_by and
BACKLOG cite (f24a9ac, aa55016, c03fe4a, ...). The handoff lists that as a dead end, and the brief
said to keep every filled implemented_by. The instructed `git push origin HEAD:chapter-1` (no force)
only accepts a fast-forward anyway. B gives the same result (PR 6 MERGEABLE, CI on the exact tree
that lands) with every hash intact. D-011 checked rather than assumed: chapter 1 lints with 0
errors, 0 warnings, as 3 teaching (jump, climb, crow) + 1 transfer + 0 practice.
status: PROVISIONAL

## OQ-048 — B-17's brief says segment_time_s is "wall-clock torii to torii". Which clock?
raised: 2026-11-08 by kit (B-17)
options: A the world clock (D-004: play + death time, frozen in pause) | B performance.now() wall clock | C both
took: A
because: the world clock is what the hazards run on, so `crow_lift_t` and `player_depart_t` are only
comparable on it; a wall clock would put a crow lift-off and a departure on two different time bases.
It also excludes pause (a player who pauses mid-segment is not slower) and is deterministic, so a bot run
(`--instrument=on`) and a human run give comparable numbers, which the brief asks for. The brief's
"wall-clock" reads as "real seconds, not ticks", which the world clock is (fixed 60 Hz step, seconds).
Cost: a tab that loses focus and stalls the loop is not counted either; for Q4's 25-35 s target that is
the right side to err on. C was rejected as a second number nobody asked for.
Known limit, for whoever reads the numbers: one `depart_after_lift_s` cannot say whether the crow was
read. `crow_lift_t` is the most recent lift-off at or before departure, so ANY departure lands between 0
and one loop period after it; the blind bot shows 0.48 s and 0.97 s by chance. Only the spread across
many attempts separates reading (clustered just after 0, inside the 0.75 s / 0.95 s slack of OQ-034)
from timing the slab (spread across the period, or clustered on the patroller's other safe window).
status: CONFIRMED (chat REVIEWER, by delegation from Tim, 2026-11-08): A, the world clock. crow_lift_t and
player_depart_t are only comparable on the clock the hazards run on, and determinism is what makes a bot run and a
human run comparable at all.
ruling, implemented: the known limit above is the finding, so it is now structural rather than prose. A single
value that looks like it measures crow-reading and does not would repeat D-013. The per-attempt field is renamed
`depart_after_lift_s` -> `since_last_lift_s`, and its type says it is not evidence. No per-run figure is emitted.
Each crow segment carries `lift_timing` instead: `attempts_n`, every value, `spread_s` (null under 2 attempts),
`loop_s`, and `spread_of_loop`. The console table shows "n=1: too few to read" or "n=K, spread X s of a Y s loop",
never a lone value. Code: `src/systems/instrument.ts` (`LiftTiming`).

## OQ-033 — b12-harvest conflicts with main and with PR 3. Resolve now, or after PR 3 lands?
raised: 2026-11-08 by kit (PR 4)
options: A merge main in now, so PR 4 gets CI | B leave it conflicting until PR 3 is on main, then merge once | C stack PR 4 on h4-asset-kit
took: B
because: the five conflicts (ci.yml, level.ts, main.ts, harness lib.ts, run.mjs) are the same against
main and against PR 3. If PR 4 merged main now, it would have to resolve `startJson` against main's
no-decode version, and then again against PR 3's `prepareLevel` version once PR 3 lands. That is two
resolutions of the same function, and the first one is thrown away. B does it once. On PR 3's base
this branch's `startJson` fails TS2345, which is the intended B-16 gate: take PR 3's `startJson`, and
keep `teleportPlayer` plus `rules.respawnDelaySec`/`fixedDt`. C would couple PR 4's review to PR 3's.
Cost: PR 4 shows no CI until PR 3 merges.
status: PROVISIONAL

## OQ-050 — D-014 fix 3 says "finishing a chapter loads the next". What decides "next", and what happens around it?
raised: 2026-11-08 by kit (D-014-PROGRESSION)
options: A derive from each level's `chapter` (lowest chapter above this one) | B a hand-kept ordered list in GAME_RULES | C file-name order
took: A (`src/systems/progression.ts`: entryLevel / nextLevel / chapterChain, one copy shared by the game, REACHABLE and check:progression)
because: chapter agents cannot see each other (the reason MOVES_ALLOWED lives in the data), so a list
someone must remember to extend is exactly how chapter 1 shipped unreachable. `chapter` is already a
required schema field. C would make an id prefix carry meaning nothing enforces.
Sub-choices taken, each the smallest that keeps a player moving:
- Enter at results loads the next chapter directly (results -> loading -> play). The HUD says
  `COMPLETE / Enter: next chapter`, or `COMPLETE / Enter: menu` after the last. Still no time, score,
  par or rank (Q4, NOT-list #20 passes).
- After the last chapter, Enter returns to the menu, and the menu starts from the front door again
  (the entry chapter). Quitting mid-chapter (pause, M) keeps that chapter, so Enter at the menu resumes it.
  There is no save: a reload starts at chapter 1. Persistence is not asked for anywhere and would be new
  state, so it is not built.
- A gap in the numbering is skipped, not a dead end. The gym (chapter 0, reached only by `?level=00-gym`)
  leads to chapter 1.
- Two files on one chapter: the tie breaks on id, so the order is total, and the losing file is then
  unreachable. REACHABLE fails on it ("every chapter is on the progression chain"), and so does
  check:progression on levels/, instead of a schema rule.
Cost: REACHABLE now plays EVERY chapter end to end, about 20 s each on CI.
status: CONFIRMED (chat REVIEWER, by delegation from Tim, 2026-11-08): A, derive "next" from each level's `chapter`.
A hand-kept list is how chapter 1 shipped unreachable, which is sufficient. Every sub-choice is approved as taken,
including no save.
SUPERSEDES the prompt pack's persistence spec. `AI-GAME-BUILD-PROMPT-PACK-v2.1.md` lines 915-925 specify a save shape
`{ version, chaptersCompleted[], scrollsFound[], settings, totalTime }`, collectibles counted and persisted, and a
chapter select showing scrolls found / total. Line 959 adds a scroll pickup sound. Q3 CLOSED that system (A: progress
only, no pickups), and OQ-050 settles progression. Whoever builds persistence later builds it from Q3 and OQ-050,
never from the pack: no scrolls, no collectibles, no scroll count. Nothing reads or writes storage today (no
localStorage anywhere in src/), so this is latent, not broken. A separate session is marking the pack itself.

## OQ-051 — The standing TIGHT warning (gym seg 14->15, jump at 100% of maxH): accept, with the reason written down
raised: 2026-11-08 by builder-d016 (D-016)
options: A accept it, reason on the waypoint and here | B shorten the gap to <= 4.5 (90%) | C suppress TIGHT on chapter 0
took: A
because: the brief placed this on "a shipped chapter 1 segment". It is not: `lint:levels` prints it for
`levels/00-gym.json` (chapter 0), critical_path[14]->[15], a 5.0 u gap via jump, i.e. exactly
`MOVE.jump.maxH` 5.0 (MEASUREMENTS: "clears 5.0, fails 6.0"). Chapter 1 lints with zero warnings. The gym
is the budget rig, authored AT the move limits on purpose (OQ-046 item 4 exempts it from READABLE_RISE for
the same reason): nav clearing a 5.0 gap on every CI run is the only standing evidence that 5.0 is still
a true ceiling for the current physics. B would remove that evidence and leave the limit untested; C
would hide the warning for any future gym edit that is tight by accident. Zero margin is the point of
this segment, so the warning stays visible and the waypoint's `note` now says why ("TIGHT accepted
(D-016, OQ-051)"). Any TIGHT on a chapter (>= 1) segment remains a level fix, not this.
status: PROVISIONAL

## OQ-049 — B-14: the autostep "ceiling" is a stall rate, not an edge. Which number goes in MOVE.ground.autostep?
raised: 2026-11-08 by phase0-spec (B-14)
options: A keep 0.5 and set a per-field `measured: false` on it (the backlog's alternative) | B the largest height with zero stalls under a stated coverage protocol (0.34) | C a head-on value (~0.42: run and sprint barely stall below it) | D raise Rapier's autostepMaxHeight until the effective ceiling reaches 0.5
took: B, 0.34
because: measured, not configured. `npm run measure:autostep` walks the real game into risers with no
jump: 6 approaches x 96 sub-tick phases x 5 placements = 2,880 trials per height. 0.30-0.34 have zero
stalls; 0.35 has one (30 deg oblique); 0.50, the old value, stalls 17-24 of 24 even head-on. So the old
`measured: true` on a 0.5 field certified a height the player usually cannot walk up. A would be honest
but leaves UNMEASURED_MOVE reading a guess. C fails the RUN-not-sprint argument already in MEASUREMENTS:
the linter cannot see the approach, so the worst approach sets the budget. D is an engine change to
src/engine/physics.ts (approver-owned, and TUNING-class values are frozen together), not a measurement.
Disclosed weaknesses, so a reviewer can attack them:
  1. The value depends on coverage. It fell 0.40 -> 0.39 -> 0.37 -> 0.34 as phases rose 24 -> 96 and
     placements 1 -> 5. More coverage could lower it again; MEASUREMENTS says so next to the number.
  2. The protocol (6 approaches, 150-tick stall, one-tick phase spread) is mine. 30 and 45 deg obliques
     set the ceiling; a 60 deg approach was not tested.
  3. Changing the value changed NO lint verdict on any level (A/B at 0.5 vs 0.34: identical apart from
     one printed number), because a `ground` rise is bounded by slope x run and autostep never binds a
     riser. That gap is B-19. Fixing the number is still right: CHAPTER_TEACH's floor-within-reach and
     READABLE_RISE's landing tolerance read it.
  4. The gym's 0.40 stair risers are above the clean ceiling and stall at 45 deg (up to 17 of 48); CI
     passes them because the nav bot walks head-on. Not changed here: gym geometry change = golden +
     trace re-record (B-20).
  5. I edited a comment in src/engine/physics.ts (approver-owned): its `<->` said kcc.autostepMaxHeight
     equals MOVE.ground.autostep, which is now false. Comment only; no value changed.
  6. The tool's runs slowed ~25x on later placements under machine load, and one multi-minute
     page.evaluate left the browser unable to load the next page. Fixed by one short evaluate per
     (approach, height) and a fresh page per placement; stall counts were identical before and after
     (placement (17.37,0,4.61): 6/12 at 30/45 deg whether run first or third).
status: PROVISIONAL

## OQ-052 — B-18 (D-015d) as built: where it departs from D-015d's text
raised: 2026-11-08 by kit (B-18)
took, each PROVISIONAL:
1. **Trigger.** D-015d says the assist engages on "a face whose top is within 0.5 m of eye level". The build
   keeps 0.5 as the **lower** bound only: the probe casts at rest eye - 0.5 = 3.16 u, and the assist engages
   when that top does not read at the current pitch (READABLE_RISE's own predicate). With no upper bound,
   anything above the eye is assisted. Read as a two-sided band (3.16 to 4.16 u), it would exclude climb's
   4.00-4.50 tops and leave chapter 2 blocked.
   The lower bound is measured, not assumed. With the probe at pivot height (1.5 u), the assist swung the
   camera +27.8 deg on chapter 1's staircase and engaged on 90 ticks of a nav run. At 3.16 u it engages on
   0 of 1,161. The cost: a top below 3.16 that does not read, such as +3.0 onto a 2.5 u shelf, gets no help,
   so READABLE_RISE still rejects it at the rest pose.
2. **Direction.** The probe runs along the player's `facing`, not the camera yaw. That is what "released when
   the player turns away" requires. Pitch never feeds movement (`input.sample` reads only `camRig.yaw`), so
   replay and chaos are untouched.
3. **Probe height.** This follows from 1. The linter models the same cutoff (`probeHeight`), so a +1.25 step
   onto a 1 u landing still errors.
4. **Blend.** The blend rate is `followDamping`, so no new number. `snap()` jumps straight to the target.
5. **Default.** The assist ships ON. `?pitchassist=off` is the comparison, as `?landingmark=off` is. Leaving it
   off by default would leave chapter 2 blocked, which defeats D-016b.
6. **For RB-004.** The board entry's premise ("no move can be taught above 3.18") now holds only at the rest
   pose. Under the assist the ceilings are 4.48, 4.62 and 4.67 (MEASUREMENTS "D-015d pitch assist"). That is
   recorded here, not answered there: RB-004 is the reviewer's to close.
7. **ASSIST_CASE (replaces the "should" this item first said; not approved as written).** The linter models an
   unobstructed arm. An overhang behind the player pulls the arm in and lowers the eye, so a face can pass the
   linter and still be unreadable in play. This is now a check that fails.
   - **B-23 (OQ-062):** the linter now models the collided arm too, so it rejects such a face itself. The real
     rig remains the check on that model. `assistCases` now takes the manifest.
   - **The cases.** `assistCases(level)` (tools/lint-level.mjs) derives every critical_path waypoint that passes
     READABLE_RISE only because of the assist (rest band below minBandDeg, an assisted pitch exists). It uses the
     same test that certified the waypoint, so no such waypoint can be missing a case.
   - **The harness.** The `pitch-assist` stage runs each case in its real level. A case fails unless it reads
     (>= 2.0 deg in the real rig) and the real probe settles at the pitch the linter modelled.
   - **The count.** The stage asserts it ran exactly the derived set. A waypoint without a case is a failure,
     not a warning.
   - **Proven** on `tools/harness/fixtures/assist-cases.json`, the same +4.0 wall twice. Clean, it reads 2.33 deg
     at 28 deg. Under an overhang behind the approach, the linter passes it and the real rig reads 0.00 deg, so
     the check FAILS it. With the harness made to skip one case, the stage fails "ran every derived case: 1 of 2".
   - **Today:** the gym and chapter 1 have 0 assist-dependent waypoints.
8. **Feel, for H2.5.** While the assist holds, pulling the mouse down has no visible effect, because the
   offset absorbs it. On release, the view blends from the assisted pitch to wherever the player's own pitch
   ended up, which can be a large swing if they fought it. This is untested by any player.
9. **Spawn and respawn.** `snap()` now raycasts the arm, which it did not before, so a spawn against a wall
   starts with the arm already pulled in.
status: CONFIRMED items 1-6 (chat REVIEWER, by delegation from Tim, 2026-11-08). Item 7 was not approved as a
"should"; it is replaced by the ASSIST_CASE check above. Items 8 (feel) and 9 (snap raycast) were not ruled on and
stay PROVISIONAL.
Item 1 corrects a spec error; it is not a liberty taken. D-015d's two-sided 0.5 m band was wrong: it excludes climb's
4.00-4.50 tops, so the trigger as written would have left chapter 2 blocked, which is the thing the item existed to
lift. The substitution is right for the better reason that it reuses READABLE_RISE's own predicate: one definition
instead of two that can drift.

## OQ-053 — PACK-LINT: can "the pack instructs a retired concept" be checked without crying wolf on historical prose?
raised: 2026-11-08 by phase0-spec (PACK-MARK, PACK-LINT)
input: the brief reached this session cut off at "...EN, UNCLOSED_OUTPUT. Add one for this class." Only its
last paragraph arrived. Recovered from the kit session's rulings (same paste, 01:45Z): "A separate session
is marking the pack itself", over P9.2's save shape, scrolls and chapter select and the scroll SFX at
l.959. So I read step 1 as "mark the pack's superseded sections" and the visible step as "add a lint
rule, next to PROMPT-00's DANGLING_INPUT / STALE_OPEN / UNCLOSED_OUTPUT, for unmarked retired
instructions". Step 2 never arrived and was NOT done. If it was something else, say so and I'll do it.
options: A ship no rule; raise only this OQ (the brief's sanctioned outcome if it can't be precise) | B a bag-of-words rule over every NOT-table term | C NOT-table terms minus prose-ambiguous English words, scoped per sentence, exempt where marked or where the decision is cited | D a structural rule: every `### Px.y` must carry LIVE or SUPERSEDED
took: C, shipped as `npm run lint:pack` (tools/lint-pack.mjs, code UNMARKED_RETIRED), in CI
because: measured, both ways.
  - B cries wolf. On today's pack, "score" hits the music section (P10.3 — Score) and "Score each 1-5";
    "lives" hits "every magic number lives in TUNING"; and refusals like "levels have NO par_time
    (PHASE-0-DECISIONS Q4)" flag. That is 6 of 27 hits false.
  - C skips 9 ambiguous words (score, rank, lives, health, damage, attack, strike, chase*, unlock*).
    On the pack it found 11 passages, 0 false (P6.3, P8.1, P9.1, P9.2). On the playbook, which was
    never used to tune it, 5 passages, 0 false. Those 5 are B-21.
  - The per-sentence scope came from that out-of-sample run. At paragraph scope, the playbook's one
    "[SUPERSEDED — Q4] there is no par_time" exempted the combo, parry, hitstop and localStorage
    sentences around it. A self-test case now holds that shut.
  - D is precise but it checks bookkeeping, not the class. A section marked LIVE that later goes
    stale passes it.
  Proof: before PACK-MARK the pack exits 1 with 11 UNMARKED_RETIRED. After it, the pack exits 0. Removing
  one bullet's mark brings back 1 error, and unmarking P9.1's heading brings back 6. Self-test: 12/12 cases (a CLOSED mark counts, per CLAUDE.md precedence 6).
Disclosed weaknesses, so a reviewer can attack them:
  1. Recall is partial by design. A stale "player has 3 lives" or "attack input" passes (skipped words),
     and so does paraphrase ("Paper scroll being picked up" names no term; neither do bell, gate or
     sword). PACK-MARK marked those by reading, not because the rule caught them.
  2. A cited decision exempts its sentence on the assumption that a sentence naming the decision has been
     reconciled with it. "Implement scrolls (Q3)" would pass.
  3. Sentence splitting is a regex: `. ` + capital. An abbreviation followed by a capital splits early,
     which can only narrow an exemption, never widen one.
  4. The terms are SPEC §7's `src` checks, written as identifier tripwires. Adding a NOT row changes
     what this rule looks for. That is intended (one source), but it is a coupling.
  5. Marking choices that are mine: I left the sword on the character's back (P1.1, P5.1) as costume,
     not combat. I removed six SFX lines from the ElevenLabs paste block into a marked blockquote below
     it, rather than marking them in place, because a mark inside that block would be pasted into
     ElevenLabs. And I left P0.1's interview topic "lives" unmarked: it is a question, already answered.
status: PROVISIONAL

## OQ-054 — B-15: how the 5 unenforced NOT rows became checks, and where each is weaker than its row's words
raised: 2026-11-08 by phase0-spec (B-15)
options: per row, either an enforced check proven by making it fail, or a recorded reason it can't be enforced. The brief allowed no row to stay green and unenforced
took: all five enforced. `lint:not-list` reports `22 enforced, 0 unenforced`
because: each row had a check that can be shown to fail, so none had to stay a recorded gap:
  - #20 run metric shown to the player → `harness: run-metric`. A src name check can't express it,
    because `deaths` and the instrument's segment times must exist. So the check is behaviour. Play
    the entry chapter twice, clean (1 death) and heavy (15 s idle, 3 deaths, 10 s on results). The
    player-visible text (body.innerText, which skips the hidden ~ overlay, plus document.title) must
    match state by state and stay constant within a state. Failed on `fell (${deaths})` and on
    `COMPLETE ${t}s`.
  - #18 ambient motion → `harness: ambient-motion`. Every level idles 10 s, every visible renderable is
    sampled, and anything that moves without a `userData.translates` tag fails. Failed on a bobbing
    checkpoint.
  - #19, #21, #22 → `src` tripwires, the standard Q7 accepted for src rows: dialogue/cutscene/subtitle
    and the three.js text and CSS2D/3D APIs; procedural_level/perlin/simplex/level_gen/generate_level;
    difficulty_mode/easy/hard_mode/normal_mode/assist_mode. Each failed on planted identifiers.
  - New kind `harness` in lint-not-list: it checks that the stage file exists, that run.mjs registers
    it and that CI runs the playtest. Failed when the registration was renamed.
Disclosed weaknesses, so a reviewer can attack them:
  1. PLATFORMS. Q2a says "nothing translates except the player and hazards". Moving platforms translate,
     and I tagged them allowed. The reason: `platform` is one of the eight moves Q2 closed, so a moving
     platform is the move's affordance, not ambience. That reads Q2a less literally than it is written.
     Tim may rule that platforms must be hazards, or that Q2a's text needs amending.
  2. #18 does not see shader or texture-offset motion, anything that moves only near the player or after
     10 s, or an ambient prop tagged `hazard`. The tag is trusted.
  3. #20 reads DOM text only. A metric drawn into the canvas is not read, and #19's src check is what
     refuses world-text APIs. It plays only the entry chapter, because the HUD is per state, not per
     level. The ~ debug overlay shows run time and is excluded as dev tooling; the menu names its key.
     Checked: the overlay is built into PRODUCTION too, and its player row prints `world <t>s`. So a
     player who presses the key the menu names sees run time. If that counts as player-visible, #20 is
     violated today. The fix is to construct the overlay only under import.meta.env.DEV or harness mode
     (src/main.ts), at the cost of the overlay on a deployed phone build. That costs the hardware perf
     gate, so it is Tim's call and I made no change. The row text names this boundary.
  4. #19, #21 and #22 are name tripwires. `vitality` beats `health` (Q7's limit), and `proceduralLevel` is
     caught but a generator called `buildWorld` is not. #21 was narrowed from `procedural*` because
     procedural ASSET authoring (tools/blender) is allowed, and the pack says so ("builds geometry
     PROCEDURALLY").
  5. lint:pack reads the same terms, so the new ones reached prose. The API names (text_geometry,
     font_loader, css2_d, css3_d) are prose-skipped after "zero text — geometry that forces a walk"
     matched; and a two-word term must now sit inside one sentence. Self-test 13/13. Playbook still 5
     true, 0 false (B-21).
  6. src/main.ts gained a harness-only `translators()` API and userData tags on the player and landing
     mark. src/loaders/level.ts gained tags on platform, hazard and crow meshes. Neither file is in
     src/engine/ or src/systems/. Rendering is unchanged.

## OQ-056 — Chapter 2 (`02-cliff-seam`) as built: the design calls the brief left open, and one it got wrong
raised: 2026-11-08 by builder-ch2 (CHAPTER-2)
took, each PROVISIONAL:
1. **Segment order: climb, wall, double, then transfer, then practice.** The level has 5 segments (4 torii), which is D-011's derived minimum: 3 teaching segments, 1 transfer and 1 practice.
   - **Climb first:** Q5 calls climb "slow and forgiving, ideal for teaching the seam read", so it opens the chapter.
   - **Double last:** it is the riskiest move (`CHAPTER_RISKIEST[2]`), so it is taught last, directly before its transfer segment.
   - **Transfer (segment 3):** a crow-cued run, double over a 6 u void, then a +1.5 jump.
   - **Practice (segment 4):** a second crow-cued run, a +4.0 climb, then double over another 6 u gap.
   - **Every teaching instance is over floor** (D-015c). A miss leaves the player standing where they started.
2. **Teaching heights.**

   | move | taught at | how it reads |
   |---|---|---|
   | climb | +4.50, the top of its band (= `MOVE.climb.maxRise`) | with the pitch assist |
   | double | +3.00 rising, inside (2.00, 3.18] | at rest, onto a 26 u landing |
   | wall | +2.50, **below** its D-016 band (3.50, 4.00] | at rest (item 3) |

   - **Climb at +4.50:** TIGHT does not cover rise, so this zero margin is deliberate. The bot clears it every run.
   - **Wall at +2.50:** still above `jump.maxRise` 2.0, so a jump cannot do it. A climb could; see item 3.
3. **Finding: a wall jump's teaching face cannot be assisted, so the wall is taught at a height that reads at rest.**
   - **First build:** +3.75, inside the band. The linter passed it (assisted, 29°). ASSIST_CASE in the real rig read **0.00°**, with no probe target.
   - **Why it cannot read:** a wall jump needs the wall beyond the approach, on the far side from the landing (nav.ts). So standing 2 u off the ledge and facing it puts the player 1 u in front of the wall they kick off. The camera arm, about 6 u behind, is pushed into that wall.
   - **Argued from geometry, measured once:** this should hold for every wall jump within `MOVE.wall.maxH` 4.2, not just this level.
     - The stand point is at most about 3 u in front of the wall.
     - At a 29° pitch the arm is about 3.2 u above the feet by then.
     - A wall tall enough to wall-jump +3.5 to +4.0 off rises higher than that.
     It is the same failure as kit's overhung-wall proof case.
   - **So D-016b's "wall unblocks with the assist" holds only where the arm is free behind the player,** and a wall jump's own wall almost always blocks it.
   - **The fix:** a rise that reads at the rest pose. The ledge is 3.5 u deep, which caps it at 2.60, so the wall is +2.50 and there is no assist case.
   - **The cost is RB-004 item 3's loophole, taken knowingly.** The chapter's wall is taught below wall's band, and climb could clear the same face. A future chapter that gates on a 3.5-4.0 wall only gets a READABLE_RISE warning, and ASSIST_CASE would fail it anyway unless the arm is clear.
   - **For the verifier:** RB-004 should now carry "wall's characteristic band is unteachable even with the assist".
   - **Correction (B-23, OQ-062):** the diagnosis held, but the 0.00° reading that seemed to prove it did not measure it. Superseded by the rebuild in OQ-062: +3.75 off a 3.25 wall 1.5 u back, onto a 1 u shelf. The harness's `respawnAt` moves the player, not the camera. So ASSIST_CASE measured this +z-facing case with the camera still at spawn yaw (+x), side-on, and the centre column never crossed the ledge. With the camera behind the facing, the real rig reads 0.00° for the reason given above: the eye is pulled in to +1.91 at 29°. It also reads 0.00° for the shipped +2.50 (eye +1.76): **the fix in this item does not read either.**
4. **T1's torii stands 18 u past the first climb face** (x 30, face at x 12), outside the probe's 15 u depth range.
   - **What went wrong at x 22:** the real probe's depth rays hit the torii, reported a shallower landing, and settled at 31° where the linter models 30°. ASSIST_CASE fails on that mismatch.
   - **Rule of thumb:** keep tall props more than `PITCH_ASSIST.depthMaxM` past an assisted face, or the linter's slab model and the real probe disagree.
5. **The rising double's approach is 4 u short of the face, not 2.** From 2 u the first jump met the face at +2.3, still rising, so the wall slide and wall jump took over (`--trace-seg=9`).
6. **The crow runs copy chapter 1's first one exactly:** a torii, then a 15 u ground run, with the patroller lane 9 u out. Patroller: speed 5, phase 0, size 2. Crow: perch on a knob 6 u out, lift 0.11, away 0.45.
   - **Result:** HAZARD_INERT blind departures fail 4/8 on both runs, and the cued runs clear 8/8.
   - **No new crow timing is introduced.**
7. **Gaps are 6 u.** That is past `jump.maxH` 5.0, so only a double clears them. Run 8 u of `double.maxH` 9.5 (84%, under TIGHT).
8. **The seam:** 18 `kit_rock_mass` along z -5.7, set 2 u below each floor, with the bright void on the open side, as in chapter 1.
9. **Harness trap, for the next level builder:** `--skip-build` plays the level JSON bundled at the last build (levels are Vite chunks) against the waypoints on disk. After any level edit, rebuild. Two of this build's diagnoses were briefly wrong because of it. *B-24 (branch `b24-stale-bundle`): preflight now fails a run whose bundled levels differ from disk, so this trap is a BUILD_FAILURE, not a habit.*
10. **The CI job timeout is raised from 20 to 40 minutes** (`.github/workflows/ci.yml`).
    - **The old 20:** set in H3 (`e99d5d1`) when the harness ran one level. It is in no decision and not in MEASUREMENTS, so it is not a budget. A guess the harness outgrew.
    - **Main with two levels** (runs 42552389070 to 42554509191): 9.5 to 16.0 min.
    - **This branch with chapter 2:** one pass at 17.6 min (42551964229). Two runs were cut off at the 20-min cap mid-playtest (42549986444, 42553653599), and neither had failed a check.
    - **Why chapter 2 costs that much:** about 5 min of CI per chapter, from its phase-sweep (8 arrivals x 5 segments, plus blind runs) and REACHABLE now playing it too.
    - **Why 40:** at roughly 5 min per chapter, chapters 3 and 4 still fit with runner-variance headroom.
    - **The proper fix** is a faster or parallel playtest (levels are independent until the run-once stages), not more minutes. Not done here.
status: PROVISIONAL

## OQ-057 — B-11: what "CLOSED with no implementing commit" means precisely, and the 8 entries I backfilled
raised: 2026-11-08 by phase0-spec (B-11)
took:
  - Closed means the heading's LAST status word is CLOSED or DECIDED. DECIDED entries (D-001..D-012)
    are decisions made, so the code is owed; D-002's own wording says "any CLOSED decision". FINDING,
    CONDITIONAL and entries with no status word are not owed. D-005, D-007, D-015 and D-016 carry no
    status word in their heading, so they are not checked; all four record commits anyway.
  - A commit is a 7-40 hex token containing a digit that `git merge-base --is-ancestor` finds on HEAD's
    history. Prose ("see PR 3") is empty. A sha from a branch that never merged is UNKNOWN_COMMIT. That
    is why CI now checks out with fetch-depth 0, and a shallow clone exits 2 instead of passing blind.
  - `n/a` on a CLOSED/DECIDED entry is an error (NA_ON_CLOSED). If a closed decision has nothing to
    build, it is a FINDING, and the heading should say so.
because: D-002's failure is a document running ahead of the code. A rule that accepted prose or a
  dangling sha would recreate that failure in the field meant to catch it.
Backfilled. These are my attributions, traced through git history; the approver may correct any of them:
  Q1 1191a34, 19234ab · Q2 1191a34, 19234ab, f24a9ac · Q2a 18a3713 · Q3 19234ab, 1191a34 ·
  Q6 b5a1939, 6dcc157, 7fa2b70, 3c076da, 4c167ef, 18a3713 (it had an empty field) · D-002 af219b2
  (this rule) · OQ-034 f24a9ac, e973c6c · OQ-042 c03fe4a (OQ-043's field already named it for OQ-042)
Disclosed weaknesses:
  1. The rule proves that a commit is NAMED and exists, not that it implements the decision. A wrong but
     real sha passes. The parentheses after each sha say what it did, so a reviewer can check.
  2. Q2a cites 18a3713, which rests on OQ-054's PROVISIONAL platform reading. If Tim rules platforms
     must be hazards, Q2a's implementation changes and so does that citation.
  3. D-002 also asks for "state/DECISIONS.md gets the same field and the same check" in PROMPT 00's
     control plane. This repo has no state/DECISIONS.md. Its decisions live in PHASE-0-DECISIONS.md,
     which this rule reads. I did not create a second file.
  4. CI's fetch-depth 0 costs a full-history clone on every run (LFS goldens are fetched as before).
  5. It depends on PRs landing as merge commits, as they do here. A squash or rebase merge rewrites the
     branch shas a decision cites, and this rule would then report them UNKNOWN_COMMIT, correctly. The
     fix there is to cite the merged sha.

## OQ-055 — B-19 (FACE_RISE) as built: the shipped stairs were above the bound, so which gives?
raised: 2026-11-08 by kit (B-19)
finding: the per-face rule caught the levels, not just the fixture. Chapter 1's only staircase (seg 7->8) and
the gym's (seg 18->19) use **0.40 risers**. MOVE.ground.autostep is 0.34, the measured clean ceiling.
MEASUREMENTS "Autostep" shows 0.40 stalling on oblique approaches (up to 17 of 48 phases at 45 deg) while
head-on is clean. CI passed them only because the nav bot walks head-on (OQ-049 weakness 4).
options: A bound faces at a head-on number (~0.42) so the shipped stairs pass | B bound at MOVE.ground.autostep
and fix chapter 1's stair; the gym warns until B-20 | C bound at autostep and error on the gym too
took: B
because:
- A weakens a measured budget to make geometry fit (CLAUDE.md). MEASUREMENTS already argues that the linter cannot
  see the approach angle, so the worst approach sets the budget. That is why 0.34 and not 0.42.
- Chapter 1's stair is rebuilt as six risers of 0.333: the same five boxes and the same 0.6 treads, only their
  heights changed, so the stair still climbs 2.0 to the same landing. Every face is now inside the clean band
  (0.30-0.34, 0 stalls in 2,880 trials). Its goldens were re-recorded on Darwin and copied to linux (byte-identical
  before), following D-015a's precedent. cam0-2 changed, the nav trace was re-recorded, and the scene budget is
  unchanged.
- The gym is chapter 0, a test rig. It already has an owner for exactly this (B-20 (a): re-measure and rebuild its
  0.40 risers, with goldens and trace). So FACE_RISE is a WARNING there, the same exemption shape READABLE_RISE
  uses. C would block every PR on B-20.
how: `groundFaces()` in tools/lint-level.mjs walks a->c exactly, between box entry and exit points, with no
sampling step. The support is the highest axis-aligned prim_box top whose box reaches down to the feet (a
ceiling overhead is not a face). Every upward change is a face.
proof: `tools/fixtures/lint/ch1-long-run-one-face.json` is chapter 1 with one +0.50 face 3.6 u from the end of a
6.6 u ground run, where slope x run allows 7.9 u. The pre-B-19 linter PASSES it; the new one fails it with
FACE_RISE and nothing else (lint:self). lint:self also pins +0.34 (walkable), +0.35 (too tall), a ceiling
(not a face) and the 0.333 stair. The gym warns; chapter 1 and chapter 2 (PR #12's 02-cliff-seam) lint clean.
known limits, for a reviewer:
1. Rotated boxes and kit meshes are not measured, so a face inside one is missed. The gym's two rotated prim
   boxes are ramps.
2. The check follows the straight line a->c. A face beside that line, which a player cutting a corner meets,
   is not checked.
3. 0.333 sits 0.007 under the bound. MEASUREMENTS warns that the clean ceiling has fallen as coverage widened, so
   a wider protocol could put this stair back over it.
status: PROVISIONAL

## OQ-060 — Chapter 3: the chapter 1/2 rock layout is a chaos wedge once climb and wall exist
raised: 2026-11-08 by kit (CHAPTER-3)
finding: the chaos stage, random input for 300-tick windows, wedged the player at (4.0, 8.2, -4.7) and later
(1.0, 8.2, -4.5): on top of the kit_rock_mass pair at x -2 / 6.5, z -5.7. That layout is copied from chapters 1
and 2. The rocks are 8.56 u wide and spaced 8.5 u, so neighbours overlap by 0.06 u and leave a narrow notch
along the top. The rocks' inner faces sit at z -3.6, flush with the path edge at -3.5, so a player with climb or
wall can get onto them. In chapter 1 you cannot (no climb), so the wedge is unreachable there. Chapter 2 has climb
and wall and the same layout, and passes chaos only because its random walk has not found the notch.
took (chapter 3 only): rocks at z -8 (inner face at -5.9, a 2.4 u void off the path edge) and spaced 7 u (no notch).
Chaos then passes. Cost: 21 rocks instead of about 17, so the scene budget is 50 draw calls / 5,664 tris, recorded.
open: whether chapter 2 (PR #12) should take the same layout. Not changed from here: it is another session's
branch. A chaos run with a different seed on 02-cliff-seam is the test.
status: PROVISIONAL

## OQ-061 — B-22: how the CI playtest is split, and why per level rather than per stage
raised: 2026-11-08 by ci-parallel (B-22)
took, each PROVISIONAL:
1. **The premise was half right.** The brief named REACHABLE as the bottleneck. On the 28.0 min run (PR #16, 42561268355, four levels), reachable took 108 s.
   - **The real cost is phase-sweep:** 234 / 281 / 367 / 304 s per level, which is 70-84% of each level's 289-437 s.
   - **Where the run's time went:** level stages 1,434 s, once-per-run stages 197 s (reachable 108, run-metric 65, pitch-assist 16, ambient-motion 8), setup about 50 s.
   - **So the split is per level.** Splitting off reachable alone would have saved about 2 min.
2. **The jobs:**

   | job | does | count |
   |---|---|---|
   | `static` | typecheck, all lints, assets:budget, and `check:merge-reports` | one |
   | `matrix` | emits the level ids from `levelIds()` in `tools/harness/lib.ts` | one |
   | `level` | `playtest --level=<id>`, `fail-fast: false` | one per level |
   | `game` | `playtest --only=reachable,pitch-assist,run-metric,ambient-motion` | one |
   | `playtest` | merges the reports | one |

   - **Why `levelIds()`:** run.mjs and merge-reports use the same function. A new chapter gets a job with no workflow edit, and a hand-kept list cannot silently skip it.
   - **Why the merge job is named `playtest`:** watchers that look for the old check name keep working.
3. **The REACHABLE guarantee is unchanged, not re-derived.** The `game` job builds the whole game and runs the same `reachable` stage the serial job ran: bare URL, then the entry chapter, then every chapter's goal, then the menu, as a player. No chapter is proven only in isolation.
4. **A split is only as good as its coverage, so the gate is coverage, not "every job that reported passed".** `merge-reports.mjs` fails:
   - COVERAGE_LEVEL, if a level in `levels/` has no report that ran all nine browser stages. The game job's per-level entries only hold schema, lint and preflight, so they do not count.
   - COVERAGE_ONCE, if a once-per-run stage was reported other than exactly once.
   - JOB_RESULT, if any upstream job concluded anything but success. A cancelled matrix entry is not green.
   - CLASS, if any report is not PASS.

   The exit code is the worst class across reports. A coverage failure with nothing worse is HARNESS_SETUP_FAILURE (4).

   `npm run check:merge-reports` runs 7 cases in CI, one per rule. Each was shown to fail when its rule is removed.
5. **Timeouts are anchored to measured runs:**
   - **Level, 20 min:** 02-cliff-seam's stages take 7.3 min. The slowest runner seen ran the same content 1.8x slower (42559866641 took 25.3 min against 13.8 min for 42563854654), which gives about 13 min.
   - **Game, 20 min:** 3.3 min of stages, about 6 min on a slow runner, and reachable grows with each chapter.
   - **Static, 10 min.**
6. **The costs, disclosed:**
   - **Wall-clock against billed minutes.** Projected wall-clock falls from 28 to about 9 min: the slowest level job plus the matrix job ahead of it and the merge job after it. Billed minutes rise because each job pays its own setup (about 50 s: checkout, npm ci, Chromium) and GitHub rounds each job up to a whole minute.
   - **Billed minutes, worked out.** About 44 billed minutes per run against 28 before, for four levels. That matters because Actions is refusing jobs for billing as this is written (42567459368).
   - **Concurrency ceiling.** The free plan runs 20 jobs at once. With static, matrix, game and merge that holds about 17 levels in parallel, after which they queue.
   - **Builds.** Every browser job builds the game itself (the preflight build, about 10-20 s). Sharing one build artifact would save little and add a failure mode.
7. **Not done here: sharding phase-sweep within a level.** After this change, wall-clock is the slowest single level, so a longer chapter grows it and more chapters do not. That is B-26 (B-25 was taken by kit for the stale src/ guard).
8. **Measured on CI** after the outage (repo public, 2026-11-09):

   | | run | wall-clock |
   |---|---|---|
   | Split | PR #18, 42628995213 | **4.9 min** (13:50:24-13:55:16Z) |
   | Serial | PR #21, 42629083300 | **19.3 min** |

   - **Same conditions:** the serial run went over the same four levels in the same minutes.
   - **Split job times:** static 0.4, matrix 0.2, game 2.9, levels 3.2-4.3 (00-gym 3.9, 01-lower-stair 4.3, 02-cliff-seam 3.3, 03-drifting-stones 3.2), merge 0.2.
   - **Item 6's projection was pessimistic:** it said about 9 min. The CI runners were faster that hour than on 42561268355.
status: PROVISIONAL

## OQ-065 — Audit of the #18 split CI: does the per-level coverage gate hold?
raised: 2026-11-09 by ci-gate-audit (claim CI-GATE-AUDIT), verified independently of the session that wrote B-22
took, each PROVISIONAL:
1. **Every level has a job.** `levels/` holds 00-gym, 01-lower-stair, 02-cliff-seam, 03-drifting-stones (the schema file is excluded by `levelIds()`). The green #18 run 42628995213 has one `level` job for each, all success.
2. **A dropped level job fails the run, in CI.** Throwaway draft PR #24 (closed unmerged, branch deleted) filtered 02-cliff-seam out of the `matrix` output and changed nothing else. Run 42634366050: static, matrix, game and the three remaining level jobs all succeeded. `playtest` failed with `COVERAGE_LEVEL: 02-cliff-seam has no report that ran all of nav,…,visual (saw only: schema,lint-level,preflight)`, `RESULT: HARNESS_SETUP_FAILURE`, exit 4, and the run concluded failure. The game job's partial 02-cliff-seam entry was correctly not counted as coverage.
3. **A level file with no job fails the gate.** Real per-job reports from 42628995213 were merged locally with `levels/04-orphan.json` added and no report for it: `COVERAGE_LEVEL: 04-orphan … (no report at all)`, exit 4. The same reports with 02-cliff-seam's removed also gave exit 4, and the unmodified set gave PASS, exit 0. In CI an orphan can only arise through the same matrix/levelIds divergence that item 2 exercised, because both read `levelIds()`.
4. **Verdict: the coverage gate holds.** No change to the workflow or to `merge-reports.mjs` is needed.
5. **The gap is outside the gate: `main` has no branch protection and no rulesets.** `gh api repos/zthebaron/warrior/branches/main/protection` returns 404, and the rulesets list is `[]`. A red `playtest` marks the PR but does not block a merge, and pushes to `main` (`git push origin HEAD:main`, which the rules prescribe) bypass PR CI entirely. To make the gate binding, Tim would add a ruleset requiring the `playtest` check on PRs to `main`. That conflicts with the direct-push workflow for `state/` and claim commits, so the ruleset would need a bypass for those or a different flow. **This is Tim's call. Nothing was changed.**
status: PROVISIONAL

## OQ-062 — B-23: a wall jump's teaching face cannot be read at READABLE_RISE's pose, at ANY height, and shipped chapter 2 now fails
raised: 2026-11-08 by kit (B-23)

**What changed.** READABLE_RISE used to put the eye where an unobstructed arm would (OQ-052 item 7's
assumption). It now predicts the eye the camera produces, in the camera's own two steps:
1. The assist picks its target with the free-arm rig.
2. The arm collides: a ray from the pivot back along the view, shortened by `allowedArm`, the camera's
   own function, moved into `camera-tuning.ts` so the linter imports it.

The ray is cast against every static collider. Prim boxes are exact. Kit meshes are their real collision
triangles, read from `assets/dist`. A torii's bbox would block an arm that really passes through the gate:
pre-D-015 chapter 1 is flagged with the bbox and is clean with the triangles. It is pinned in lint-self.
MEASUREMENTS "B-23: the collided arm" has the linter-against-rig table. The two agree to within 0.03° on all
six fixture rises.

**Harness bug found on the way.** `respawnAt` never turned the camera, so every real-rig check measured from
spawn yaw. For a case facing any other way the camera was side-on: OQ-056 item 3's 0.00° was that. The fix is
a new harness call, `cameraYaw(facing)`, made in `measureAt` before the rig settles. Every existing fixture
faces spawn's yaw and reads as before, and both chapter 2 climb cases pass again at 30° and 26°.

**The finding.** On a 3.5 u ledge (chapter 2's), at READABLE_RISE's pose (2 u off the face, facing it, camera
behind), each cell is the band from the eye the camera actually gets, at the pitch it chooses:

| wall behind | +2.10 | +2.50 | +3.00 | +3.50 | +3.75 | +4.00 |
|---|---|---|---|---|---|---|
| 1 u | no 0.00° @18° | no 0.00° @18° | no 0.00° @18° | no 0.00° @27° | no 0.00° @29° | no 0.00° @31° |
| 2 u | no 0.00° @18° | no 0.00° @18° | no 0.00° @18° | no 0.00° @27° | no 0.00° @29° | no 0.00° @31° |
| 3 u | no 1.46° @18° | no 0.00° @18° | no 0.00° @18° | no 0.00° @27° | no 0.00° @29° | no 0.00° @31° |
| 5 u | **reads** 2.69° @18° | no 1.55° @18° | no 0.09° @18° | no 1.19° @27° | no 1.09° @29° | no 1.01° @31° |
| 7 u | **reads** 2.91° @18° | **reads** 2.19° @18° | no 1.26° @18° | **reads** 2.41° @27° | **reads** 2.39° @29° | **reads** 2.38° @31° |

- **Where it reads:** only once the wall is about 7 u back, where the arm (7 cos 18° = 6.66 u) is free.
- **Why that is never a wall jump:** you kick off the wall and land on the ledge. The wall is then about 9 u
  from the landing, past `MOVE.wall.maxH` 4.2.
- **So the unteachable region is not wall's band 3.50-4.00.** It is every `wall` teaching face this camera
  can be asked to show from this pose.
- **Chapter 2's shipped +2.50 is in it.** The wall is 1 u behind (`geometry[3]`), the eye is +1.75 against
  +1.76 in the rig, and the band is 0.00°.

**What I did.** The rule is enforced as written. READABLE_RISE is an ERROR on a teaching instance (D-016). It
now rejects `02-cliff-seam` `critical_path[5]`, so `lint:levels` and the playtest fail on exactly that one
error. Things I did NOT do:
- exempt `wall`;
- add a band-only carve-out;
- weaken the model;
- move chapter 2's geometry. Nothing in the table is a wall jump to move it to.

**Why this waits for Tim.** Every way to green amends D-015 or D-016:
1. **A different readability pose for `wall`.** The player sees the ledge on the approach, before turning
   into the wall: chapter 2's corridor runs along +x with the ledge to the side. READABLE_RISE would then
   judge `wall` from the approach waypoint along its own heading, not from 2 u off the face. This amends
   D-015b's pose.
2. **A camera change.** The assist could search pitches with the collided arm, or the arm could swing aside
   rather than shortening. This amends D-015d.
   - An unpinned search over every pitch 18-70° with the collided arm finds **nothing** that reads with the
     wall 1 u behind, at any rise from 2.1 to 4.0. The pitches steep enough to lift the eye above the top
     put that top outside the 60° frustum.
   - With the wall 2 u behind, rises up to +3.0 read at 70°, which is the rig's `pitchMaxDeg`. That is not
     yet a design.
3. **An exemption.** D-016 would say `wall` is taught without a readable top, and why.

PROVISIONAL pick: **none.** None of the three is mine to take, and each changes a CLOSED decision. Until Tim
rules, PR `b23-wall-eye` stays red on that one error. This is the task's fallback, "record the unteachable
band as an enforced error rather than a note", landing where the measurement puts it.
status: OPEN (blocks merging B-23; Tim's ruling)

