# Handoff — kit session (2026-11-08 08:30)

Only what the repo cannot tell you. Claims, decisions, OQs and backlog status are in their own files.

## Where the work sits

| branch | head | state | next action |
|---|---|---|---|
| `h4-asset-kit` (PR 3) | `15d1385` | CI green, marked ready | merge with a MERGE COMMIT. Squash orphans every `implemented_by` hash it cites |
| `b6-accent-floor` | `c4311ad` | pushed, **no PR** (PR creation was denied to this session) | base on `h4-asset-kit`, or rebase onto main once PR 3 lands. Until it lands, PR 3 enforces the D-003 band that D-006 withdrew. Folding it into PR 3 before merge is the clean option |
| `b12-harvest` | `7c4a8ac` | pushed, **no PR**, 4 ledger commits behind main (no code) | open the PR against main. It supersedes `b12-b13-proofs` and `b12-b13-world-clock-patroller`; delete both once it lands |
| `b11-implemented-by-lint` | = main at `e51d389` | **empty**, nothing written | delete the branch; B-11 is released, with notes in the release commit `ae03a74` |

Local worktrees under `.claude/worktrees/` (h4-kit, b6, b12-b13, b11, ledger) are all clean. Everything is pushed.

## Half-done or deliberately not done

- **PR 3 after it merges.** `b6-accent-floor` and `b12-harvest` both touch `src/main.ts` harness APIs and `tools/harness/lib.ts`. Expect a union conflict in the `rules` object, which merges main's checkpoint constants with `respawnDelaySec` and `fixedDt`. Also expect one in the `HarnessApi` interface.
- **Two `startJson`s exist.** PR 3 has one built on `prepareLevel` (decodes mesh assets). `b12-harvest` has one built on `install(parseLevel(...))` (no decode). Once PR 3 is on main, `b12-harvest`'s version will **fail typecheck**. That is intended (the B-16 gate). Resolve it to PR 3's version and keep the `rules`/`teleportPlayer` APIs `b12-harvest` adds.
- **D-006 floor (0.0204%)** is measured at 640x360. The largest-blob test is resolution-dependent; the percentage is not, quite. If the harness viewport ever changes, rerun `node tools/harness/accent-floor.ts` and re-derive the floor. Do not rescale the old number.
- **The H2.5 feel test** needs `docs/build-log/accent/palette/swatches-floor.png` viewed at **full resolution** (5120x1440). At any preview scale the 90 m gates are sub-pixel and the comparison is meaningless.

## Tried, did not work — do not repeat

- **`git cat-file -e <hash>` to validate `implemented_by`.** It passes for orphaned pre-rebase commits still in the local object store. Use `git merge-base --is-ancestor <hash> HEAD`.
- **BSD `sed -E` with `\b`** (macOS) silently replaces nothing. Use python for word-boundary rewrites.
- **`cmd | head` then `echo ok`** reported typecheck success while it was failing. Check `$?` of the command itself, not of the pipe.
- **A claim pushed while main moved** was rejected, yet my script printed "pushed". Pushes now use `if git push ...; then` plus a HEAD == origin/main comparison.
- **Screenshotting the canvas while the game is in `menu`** captures the HUD text overlay. Hide `#hud` (see `accent-floor.ts`). In `play` the HUD is empty, so in-level stages are fine.
- **ACCENT_AREA counting all accent pixels in the frame** credits the near gate to the far one (9.04% "for" the x=88 gate). Count one placement by rendering with and without it.
- **A cache-warm page for the B-16 check.** Any earlier decode masks a loader that skips its own. That check must run on a cold page.
- **Force-pushing a rebased branch** was denied by the permission classifier unless Tim had explicitly asked for that rebase in the same turn. A fresh branch name avoids it.

## Judgements I was about to make

- PR 3's `ACCENT_AREA` docs (Style Bible §2, MEASUREMENTS "D-003 accent area") still describe the band. The D-006 rewrite is on `b6-accent-floor` only. If PR 3 merges alone, main's Style Bible says "band" while D-006 says "floor" for a while. Prefer merging b6 first or together.
- `b12-harvest`'s `hazards` fixture puts patroller path points at the volume **centre** (main's D-005 convention). The old `b12-b13-world-clock-patroller` fixture used **base** centre. Do not copy from the old branch.

## Live claims

Held, and still live: **OQ-019..028, OQ-030, OQ-031** (reservations, ttl ~10 h). Those numbers are in use on `h4-asset-kit` (019..025) and `b6-accent-floor` (026..028), and on `b12-harvest` (030, 031). They can lapse once those branches merge, because main then shows them. No backlog-item claims are held. B-6, B-11, B-16, PR3-rebase and B12-harvest are all released.
