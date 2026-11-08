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

## OQ-032 — Hazard `period` is accepted on every hazard type and nothing at runtime reads it. Give it a meaning or remove it?
raised: 2026-11-08 by phase0-spec
options: A remove it from the schema | B define crush as cycling on `period` | C keep it, documented as unused
took: A
because: same class as D-008 (a field that can be authored with no effect is a schema defect) and as
Q4 amendment 2 (a field an agent sees gets wired up). B would be a design decision about what crush
does, and no decision covers it. C is the defect itself. Neither level used it. If crush cycling is
decided later, `period` returns as a schema addition with its runtime and a decision entry.
status: PROVISIONAL
