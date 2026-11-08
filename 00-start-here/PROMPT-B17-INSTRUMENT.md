# B-17 — the play instrument (Q6 part 6, finally)

Tim played chapter 1 and it worked, but he could not report the numbers, which is the correct
answer to being asked to count things while playing a game. **Instrument it instead.**

This is the teach-rate proxy Q6 part 6 promised and never delivered. It is also the only way the
H2.5 measurements get taken, because every one of them asks a human to notice something while
doing something else.

## The constraint that shapes it

Q4 forbids a player-visible timer, score, par time or rank. NOT-list row **#20** bans *"a death
counter or any run metric shown to the player."* So this is a **dev instrument**, not a feature:

- behind a flag — `?instrument=on`, following the `?landingmark` and `?accent` precedent
- **nothing rendered in game**, ever. No overlay, no HUD, no end screen. `lint:not-list` row #20
  must still pass, and if it does not, the instrument is wrong, not the rule
- output to console and a downloadable JSON at run end

## What it records, per segment

Segment boundaries are the torii — `checkpoints` in the level data, which the game already tracks.

| field | why |
|---|---|
| `segment_time_s` | wall-clock torii to torii. Q4's target is 25-35 s first-time; the bot does 3.63-6.57 s |
| `deaths` | per segment, not the single total the harness has today. **This is the teach rate.** |
| `first_clear_attempt` | how many tries before the segment was first completed |
| `retry_times_s[]` | every attempt, so a segment that gets *harder* on retry is visible |

## And the measurement that answers OQ-034

Segment 3 is the crow segment. D-034's ruling says H2.5 must measure **how late a human can depart
after lift-off and still clear**, against the bot's slack of 0.75 s (seg 3) and 0.95 s (seg 4).

So for every crow-gated segment also record:

| field | why |
|---|---|
| `crow_lift_t` | world-clock time of lift-off |
| `player_depart_t` | when the player committed to the crossing |
| `depart_after_lift_s` | the difference — **the number OQ-034 needs** |
| `cleared` | did that attempt survive |

That turns "did the crow read?" from a question Tim has to introspect about into a measurement.
If `depart_after_lift_s` clusters just after `crow_lift_t`, the cue is being used. If it clusters
on the hazard's own period instead, the player is timing the slab and **the crow is decoration** —
which is the single most important thing to learn before chapters 2-4 are built around it.

## Output

At run end, write `instrument-<level>-<timestamp>.json` via a download, and print a compact table
to the console. Tim hands either one over; neither needs him to have noticed anything.

## Checks

- `npm run lint:not-list` still passes, row #20 included
- with the flag off, `renderer.info` draw calls and the visual goldens are **unchanged** — same
  constraint D-007 put on the landing mark, and for the same reason
- the harness can read the same instrument, so bot runs produce comparable numbers

Claim `B-17` with `tools/claim.mjs` first. Record anything you would have asked in
`state/OPEN-QUESTIONS.md` as PROVISIONAL and keep going.

---

## URGENT addition — Tim cleared chapter 1 in **15 s**. The bot takes 19.75 s.

The bot's 19.75 s **includes waiting for the crow** on segments 3 and 4. A first-time human beating
it by 25% should be impossible if the hazards gate the route. Three candidates, and they must be
separated before chapters 2-4 are built on the crow:

1. **Hazard windows too generous** — the gaps can be threaded without ever waiting.
2. **Patrollers do not actually intersect the critical path**, so nothing blocks the player.
3. Not all four segments were cleared.

If it is 1 or 2, **the crow is decoration** — the single riskiest unproven element of the design
(Q5), silently failing while every gate stays green.

### The harness gap this exposes

`PHASE_SWEEP` proves a segment is **clearable from every arrival phase**. It does not prove any
phase **requires waiting**. A hazard that never blocks anyone passes it perfectly. So the harness
has no assertion that a hazard is doing its job at all.

Add the missing check, as a new harness assertion:

> **`HAZARD_INERT`** — for each crow-gated segment, a bot that departs **immediately on arrival,
> ignoring the cue**, must FAIL from at least one of the 8 arrival phases.

If the ignore-the-crow bot clears from all 8, the cue gates nothing and the segment is a lie. That
is the inverse of `PHASE_SWEEP` and both are needed: one proves the segment is always *possible*,
the other proves it is sometimes *refused*.

Run it against chapter 1 immediately and report the result before doing anything else — it answers
Tim's 15 s directly, without waiting for him to play again.
