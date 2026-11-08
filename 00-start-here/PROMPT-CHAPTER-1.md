# PROMPT — Chapter 1, the vertical slice

This is the most consequential item since the Day-0 spike, for two reasons that are easy to
conflate. It is **the first playable thing**, and it is **the measurement every schedule estimate
depends on**. Q4 deferred days-per-level to this build deliberately; until it exists, any date is
an unmeasured constant, and this repo does not accept those.

Greybox only. The Style Bible render — outlines, depth bands, palette quantisation — does not
exist in the renderer yet and is **not** in scope here. Chapter 1 ships as lit primitives plus the
kit assets. Judge it on whether it plays, not on whether it looks right.

## Read first

`CLAUDE.md` · `00-start-here/PHASE-0-DECISIONS.md` (Q3, Q4, Q5, Q6, D-004 to D-008) ·
`00-start-here/STYLE-BIBLE.md` §4, §5 · `00-start-here/MEASUREMENTS.md` ·
`levels/00-gym.json` as the only existing example · `state/BACKLOG.md`

## What chapter 1 is

| constraint | value | source |
|---|---|---|
| moves taught | ground, jump, climb — **and nothing else** | Q5 |
| signal taught | the crow cue: lift-off means *go now* | Q2, Q5 |
| checkpoint | a torii at each segment boundary | Q3 |
| win | arrive at the last torii; no score, no timer, no rank | Q4 |
| segment length | 25-35 s first-time human, ≤ 12 s nav bot | Q4 |
| chapter length | **deliberately unfixed** — see below | Q4 amendment 3 |
| composition | dark cliff mass one side, bright void the other, path on the seam | §5 |
| death | fall or hazard contact; respawn at furthest torii | Q6 |

**Do not fix the chapter at five segments.** Q4 amendment 3 left chapter 1's length as an *output*
of the teach rate, not an input. Author as many segments as teaching ground, jump, climb and the
crow cue actually requires, then report the number. That number sets the rule for chapters 2-4.

## Known dependency: the crow cue does not exist

Q5 requires chapter 1 to carry the crow cue, because the vertical slice should prove the riskiest
unproven part of the design, and movement is already proven by the gym. There is no crow system in
`src/`. Build the minimum that makes the signal legible:

- a crow perched near a timed hazard, which **lifts off** on a fixed lead time before the hazard's
  safe window opens
- it is keyed to the same world clock as the hazard (`phase + t·speed`), with no state of its own,
  so replays stay deterministic — see D-004 and B-12
- it never reacts to the player, and it is never coloured: vermilion is torii-only (Q2), so the
  crow signals through **motion alone**
- ambient crows, if any, **perch and never lift off** — Q2a makes any other translation a false
  positive in the one channel that means *go now*

## Everything must pass

```
npm run lint:levels      # NO_VIA, UNMEASURED_MOVE, HAZARD_ON_PATH, HAZARD_AT_CHECKPOINT,
                         # CHAPTER_LENGTH, NO_KILL_VOLUME, FALL_DAMAGE, NO_FALL_PLANE
npm run lint:not-list
npm run playtest         # nav 100%, replay determinism, chaos, visual, phase-sweep
```

`PHASE_SWEEP` is the one most likely to fail on real content, and that is the point: it proves
every segment is clearable from its checkpoint at eight hazard phases, which is the
unwinnable-after-death case D-004 exists to prevent. **A phase-sweep failure is a level bug, not a
harness bug.** Fix the level.

## Record the measurements — this is half the deliverable

Write `00-start-here/CHAPTER-1-MEASURED.md`:

1. **Wall-clock authoring time**, honestly, start to green.
2. **Segments authored**, and why that number — what each one teaches.
3. **Nav bot clear time per segment**, against the ≤ 12 s budget.
4. **Bot deaths per segment** from the harness counter (Q6 part 6) — this is the teach-rate proxy
   until a human plays it.
5. **Every linter rejection you hit while authoring**, with the fix. A rule that fires constantly
   on honest content is a rule that is wrong, and this is the first real test of whether the
   linter is usable or merely strict.
6. **Where the schema fought you.** `critical_path` move annotation, hazard authoring, anything
   that was harder than it should be.

Point 5 and 6 matter as much as the level. Every linter rule in this repo was written against
synthetic fixtures. This is the first time any of them meets content authored in earnest.

## Then

Report GREEN / AMBER / RED on one question: **can an agent author a chapter against these rules
without a human in the loop?** If AMBER, name exactly what needed a human.

Claim items with `tools/claim.mjs` before starting. Work in your own worktree. Push with
`git push origin HEAD:<branch>` and verify by comparing `rev-parse`. Never print a question and
wait — record it in `state/OPEN-QUESTIONS.md` as PROVISIONAL and keep going.
