# Chapter 1 — measured (the vertical slice)

Level `levels/01-lower-stair.json`, "The Lower Stair". Greybox. Authored by one agent (kit session),
2026-11-08, against `PROMPT-CHAPTER-1.md`. These are measurements, not estimates; where something
was not measured, it says so.

## Verdict: AMBER

**Can an agent author a chapter against these rules without a human in the loop? AMBER.** The
level itself needed no human. Every rejection was diagnosable from the tools and fixable by the
agent, and the harness caught a mistimed crow on its own. But three things in this run did need,
or still need, a human:

1. **The Chromium launch wedge.** `npm run playtest` hung at `chromium.launch` four times this
   session, even for a bare launch, with no orphan processes. Twice it cleared on its own; at the
   end it did not, so the final full-suite verification came from CI, not from this machine. A
   human may need to restart something. An agent can only wait, or route through CI.
2. **Two decisions only Tim can make**, both blocking chapters 2-4 rather than chapter 1:
   - OQ-038, whether ACCENT_AREA's scanning frame should look up for a climbing game;
   - OQ-034, the crow's lead-time constant, which only H2.5 can measure.
3. **Nobody has played it.** The bot proves it is clearable, deterministic and readable by
   rule. Whether a human reads a lift-off as "go now" is H2.5's question, and D-009's point stands.

## 1. Wall-clock authoring time

| | time | elapsed |
|---|---|---|
| claim taken (`CHAPTER-1`) | 08:47:30 | — |
| crow system built (schema, runtime, lint, bot, sweep) and first draft level green on nav + phase-sweep | ~09:00 | 13 min |
| concept step added mid-run (D-009); concepts generated, reviewed, regenerated | 09:01-09:08 | 7 min |
| level re-authored against concepts; ACCENT_AREA failures diagnosed and fixed; **all 11 stages green locally** | 09:12 | **25 min** |
| measurements (reaction window), OQs, backlog, this file; CI | 09:12-CI_DONE | — |

**25 minutes from claim to green on every stage**, including building the crow system. The level
data alone, excluding the crow system, took about 15 minutes. That is one data point from one agent
on the easiest chapter, with the gym as a template. Treat it as a floor, not a rate.

## 2. Segments authored: 4

| seg | torii → torii | teaches | why it is its own segment |
|---|---|---|---|
| 1 | spawn → T1 | **ground, jump**: the seam ledge, 2 u then 3 u gaps over the void, a straight 5-step stair | Ground cannot kill you on a 7 m seam ledge, so it is not worth a segment of its own. Jump is the first move that can kill, so the segment ends after it |
| 2 | T1 → T2 | **climb**: one 3.5 u face | Slow and forgiving (Q5). One face, not two: see §5, ACCENT_AREA |
| 3 | T2 → T3 | **the crow, alone**: a slab sweeps out of the cliff across a flat ledge; the crow on the void edge lifts off; go | Ground-only, so timing is the only new demand. The riskiest unproven element gets a segment where nothing else can kill you |
| 4 | T3 → goal | **the crow, transferred**: it times a jump onto a swept landing, then the final climb | One exposure cannot show that "lift-off means go" generalises; the second puts it on a different move |

The rule chapter 1 actually followed: **one segment per new move or signal that can kill you, plus
one transfer segment for the riskiest.** Chapters 2-4 add 2/2/1 moves and no new signal, so this
predicts 4-6 segments there, consistent with today's `CHAPTER_SEGMENTS`. The chapter-1 rule stays
unset (`CHAPTER_LENGTH_PENDING`); OQ-037 records the proposal for Tim.

## 3. Nav bot clear time per segment (budget ≤ 12 s)

From spawn, no deaths, one continuous run (CI log, NAV_SOURCE):

NAV_TABLE

From each respawn point at all 8 arrival phases (PHASE_SWEEP), the worst case, counting the wait
for the crow:

| seg | worst arrival (wait + run) | budget |
|---|---|---|
| 1 spawn → T1 | 5.48 s | 12 s |
| 2 T1 → T2 | 3.38 s | 12 s |
| 3 T2 → T3 | 6.85 s | 12 s |
| 4 T3 → goal | 7.17 s | 12 s |

The first-time-human 25-35 s target **cannot be measured here.** No human has played it.

## 4. Deaths per segment (the teach-rate proxy)

**Q6 part 6 is not implemented.** The harness has one total `deaths` counter, and nav fails on the
first death, so the expert bot reports 0 by construction. That measures nothing. It is now backlog
**B-17**.

The proxy used instead (OQ-036): PHASE_SWEEP's **blind departures**. The same bot, from the same
torii, at the same 8 arrival phases, leaves without reading the crow. That is a first-time player
who has not learned the signal.

| seg | blind: deaths / 8 arrivals | reading the crow: clears / 8 | time incl. wait |
|---|---|---|---|
| 1 | 0 (no timed hazard) | 8 | — |
| 2 | 0 (no timed hazard) | 8 | — |
| 3 | **4** | 8 | 3.35-6.85 s |
| 4 | **2** | 8 | 3.67-7.17 s |

The crow takes a blind player's death rate from 4/8 and 2/8 to 0/8. Why seg 4's blind rate is lower:
a pingpong patroller has **two** safe windows per loop (box retracted into the cliff, box out over the
void), and the crow marks one. Seg 4's run-up lands more arbitrary departures in either window.

**How late can you react?** (`tools/harness/cue-window.ts`: the bot holds d seconds past lift-off)

| seg | lift-off → window opens (analytic) | latest departure that clears all 8 phases | first that fails |
|---|---|---|---|
| 3 | 0.83 s | **0.75 s** after lift-off | 0.80 s (0/8) |
| 4 | 1.19 s | **0.95 s** after lift-off | 1.00 s (0/8) |

Typical human visual reaction is ~0.25 s, so the window is generous. Its edge is a cliff, though, not
a slope (8/8, then 0/8), so a player who misses it misses it every time. Whether 0.75 s *feels* right
is H2.5's question.

**Proof the sweep tests the crow:** with `lift` moved a quarter loop, reading the crow clears **0/8**
in both segments and PHASE_SWEEP fails. A first negative test moved it half a loop and still passed,
because that lands on the patroller's other safe window. Lesson for authors: a pingpong patroller has
two windows per loop.

## 5. Every rejection hit while authoring, with the fix

Every rule that fired, in order. **The linter proper fired once.** The expensive rejections came
from the harness and the schema compiler.

| # | where | rejection | cause | fix | rule wrong? |
|---|---|---|---|---|---|
| 1 | schema (ajv strict) | `strict mode: required property "crow" is not defined at …/allOf/5/if (strictRequired)` | the new `if: {required: ["crow"]}` without a matching `properties.crow` in the same subschema. Crashed the whole harness at compile time | `if: {properties: {crow: true}, required: ["crow"]}` | No. But it surfaces as a stack trace, not a level error |
| 2 | lint | `[MOVES_ALLOWED] chapter 1 declares no "moves_allowed"; it must be [ground, jump, climb]` | B-4 (`cf642c7`) landed on main **mid-authoring** | added the field | No. Right rule, cheap fix |
| 3 | harness `accent` | `ACCENT_AREA torii (55, 9, 0) 0.0000% of frame … scanned from (34, 2, 0), 21.0m away (floor 0.0204%)` | two stacked 3.5 u climbs between T1 and T2 | first tried: move T2 to 33 m. **Still 0.0000%** | see below |
| 4 | harness `accent` | same, at 33 m | the scan stands 6.7 m behind the previous torii and faces the next, so the previous gate is always dead centre. The upper lip hides everything below +8.4°; the previous gate's crossbeams cover +5..14°; the frame top is +12° | one climb per torii-to-torii rise; seg 2 has one face | **Probably wrong for this game (OQ-038)**: see below |

Never fired, and why that is informative: `NO_VIA`, `UNMEASURED_MOVE`, `UNREACHABLE`, `HAZARD_ON_PATH`,
`HAZARD_AT_CHECKPOINT` (error and warn), `NO_KILL_VOLUME`, `FALL_DAMAGE`, `NO_FALL_PLANE`, `CHAPTER_MOVE`,
and the new `BAD_CUE` / `CUE_NOT_AT_TORII` / `NO_CROW_CUE`. Authoring copied the gym's proven
patterns (gap spacing, the climb approach 2 u short of a 3.5 u face, the 0.4/0.6 stair), so the
reachability rules had nothing to catch. That says the gym is a good template, not that the rules
are slack: none of them fired falsely on honest content.

**On rejections 3-4.** ACCENT_AREA was right that the gate was invisible from the rest pose. A render
(`tools/harness/scan-frame.ts`, written for this) confirmed it. But the fix it forces is
"never put two climbs between torii", and in a game about climbing a mountain, a player tilting
the camera up to find the next gate is the normal case, not the exception. The rule was not
weakened; the level changed. Whether the scan should pitch toward the gate is OQ-038, for Tim.
Without the render, the 0.0000% figure gave no hint of the cause, and the first fix (more distance)
was wrong. **Pair every visibility rule with a way to see its frame.**

## 6. Where the schema fought, and what was harder than it should be

1. **No crow existed anywhere**: not in the schema, the runtime or the bot. Building it was most of
   the session: a `crow` block on the patroller it cues (OQ-035), a waypoint `cue` field, three lint
   codes, a bot hold, and a sweep report. All additive; the gym is byte-identical in behaviour.
2. **`critical_path` cannot say "wait".** Every waypoint is a move (`via`). Waiting for a cue is not a
   move, so it needed a new field, `cue`, which makes the *previous* waypoint the wait point. That
   works, but an author must know the wait happens at `i-1`, not `i`. Lint now enforces that it is a
   torii.
3. **`lint:levels` does not validate the schema** (OQ-039). It printed LINT PASS on a level the game
   could not load. Only `npm run playtest` catches a schema error.
4. **Hazard timing is invisible in the data.** Nothing in the JSON tells an author *when* a
   patroller's crossing is clear. I worked it out by hand: the pingpong loop has two windows, at
   loop fractions 0.3175-0.6825 and 0.8175-1.1825 for the chapter's ±5 u sweep at 5 u/s. Then I
   verified it with the bot. A small tool printing each patroller's safe windows against each cued
   segment would turn an analysis into a lookup. The analytic leads in §4 come from that hand
   calculation.
5. **Composition is not checked by anything.** §5's dark wall and bright void are honoured here
   because the concepts said so (see below), but no rule or stage would notice a level that broke them.

## 7. The concept step (D-009): what it changed

Seven images were generated, three were rejected and **four kept**: one per segment, in
`docs/build-log/chapter-1/concepts/`, with prompts, parameters and the generator beside them. The
endpoint (`fal-ai/gpt-image-1.5/edit`, style-locked to two seed hero frames) takes **no seed**, so
a rerun gives a different image from the same brief; `prompts.json` says so.

Rejected against the Style Bible, which wins (kept as `*.rejected-v*.png`):
- seg 1 v1: **a crow in flight** over the void, a translation that breaks Q2a.
- seg 2 v1: drew a stair, not climb faces; two ambient crows.
- seg 4 v1 and v2: **the summit as a free-standing pillar reached by a bridge**, which breaks §5 / Q2b
  (no floating platforms). v3 passed on composition after the prompt described the frame layout
  explicitly; it underdraws the gap and the slab.

What the pictures changed in the level, which schema-only authoring had not:
- **The crow moved from the cliff face to the void edge.** An ink-black crow perched on dark rock is
  invisible; both crow concepts silhouette it against the bright void. This is the most important
  thing the concept step caught: a signal that only works through motion has to move against
  contrast.
- Segment 1's order became gaps → stair → torii.

Where a concept lost to a rule: seg 2's concept shows two stacked faces, and ACCENT_AREA made that
impossible (§5). The concept is subordinate, and that is the precedence order working as intended.

The greybox renders from each segment's scanning view match their concepts on the one testable
property: dark cliff mass left, bright void right, path on the seam, torii in sequence.
