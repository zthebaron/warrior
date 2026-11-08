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

## OQ-017 — Patroller loop shape: what is "one loop" of an open path?
raised: 2026-11-08 by b12-b13-world-clock-patroller
options: A ping-pong, out and back | B cycle, end jumps to start | C cycle only when the path is closed
took: A
because: B teleports, and Q2a's rule is that nothing translates except the player and hazards, so
  a jump would be a move nobody can read. A is continuous for every path; check:patrol asserts no
  tick moves it more than speed*dt. Loop length = 2 x path length, so `phase` is a fraction of the
  round trip. (Numbered from 017: PR 3 holds OQ-010..016.)
status: PROVISIONAL

## OQ-018 — A patroller with no `size`: default it, or require it?
raised: 2026-11-08 by b12-b13-world-clock-patroller
options: A default volume in code | B mandatory in schema + lint error NO_PATROL_SIZE
took: B
because: a default is a number not in MEASUREMENTS.md, and the deadly volume is a level-design
  quantity. Strengthens the schema, never weakens it. The example level already sets it; the gym
  has no patroller.
status: PROVISIONAL

## OQ-019 — Patroller geometry conventions
raised: 2026-11-08 by b12-b13-world-clock-patroller
options: path point = box centre | path point = base centre (feet convention)
took: base centre; contact = the box widened by the capsule radius in x/z, overlapping the capsule's
  vertical span
because: matches the player's feet convention and the critical_path's y (ground level). The widened
  box is square at the four corners (conservative by at most r(sqrt2 - 1) = 0.145u diagonally);
  an exact capsule-box test can replace it inside capsuleTouches without touching any caller.
status: PROVISIONAL

## OQ-020 — Respawn on the render frame or on the fixed tick?
raised: 2026-11-08 by b12-b13-world-clock-patroller
options: A keep it in onRender (frame time) | B fixed tick
took: B
because: with the world ticking during death (D-004), a fixed-tick respawn makes the death interval
  exactly respawnDelaySec of world time, which is what the clock assertions and PHASE_SWEEP measure.
  Nominal duration unchanged (0.8 s); it is now tick-exact instead of frame-quantised.
status: PROVISIONAL

## OQ-021 — Debug frame-stepping in pause, and platform time
raised: 2026-11-08 by b12-b13-world-clock-patroller
options: A leave as is | B make moving platforms a pure function of the world clock too
took: A, for now
because: out of B-12's scope. Frame-stepping while paused (dev tool) ticks player, physics and
  platforms but not the world clock (D-004: pause is frozen), so platforms drift from runTimeSec
  by the stepped ticks — debug-only. Platforms keep per-instance `time`, which is the mutable
  per-object state B-12 just removed from hazards. Proposed as a backlog item: platforms as
  pathPosition(def, runTimeSec), which also makes them PHASE_SWEEP-able.
status: PROVISIONAL

## OQ-022 — Prove the patroller in the gym, or in a fixture?
raised: 2026-11-08 by b12-b13-world-clock-patroller
options: A add a patroller to 00-gym | B a harness-only fixture level (tools/harness/fixtures/)
took: B, via a harness-only startJson() that uses the same parseLevel/install path as levels/
because: A changes the gym's goldens and chaos stream, and a patroller near the path is B-7's job
  (PHASE_SWEEP). Merge note: PR 3 adds preloadLevelAssets() to startLevel; when both land,
  startJson must preload too, or a fixture placing a mesh asset will throw.
status: PROVISIONAL

## OQ-023 — Push this branch and open a PR?
raised: 2026-11-08 by b12-b13-world-clock-patroller
options: A push + draft PR | B local only
took: A
because: the reviewer reviews through PRs and CI, and asked for the accent work to be pushed.
  Branch push and draft PR are reversible (close the PR, delete the branch).
status: PROVISIONAL

