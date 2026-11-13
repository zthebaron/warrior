# HANDOFF-CH3-INK (written 2026-11-13 by session `ch3-ink`, for a fresh session with zero memory)

Written because this session's context was near 75 percent, as `00-start-here/PROMPT-CH3-INK.md` asks. **The look,
the two checks, the darwin goldens and D-029 / OQ-083 / the backlog rows are built and pushed; what is left is the
close-out in section 2.** If the session that wrote this finished it too, the last line of this file says COMPLETE.

## 1. Where things stand

- Worktree `/Users/timdevallee/Code/warrior/.claude/worktrees/ch3-ink`, branch `ch3-ink`, no upstream: push with
  `git push origin HEAD:refs/heads/ch3-ink`. Cut from origin/main at 584a9d4. NEVER `HEAD:main` from here.
- **PR #45** https://github.com/zthebaron/warrior/pull/45, "CH3-INK: the drifting stones, painted", a DRAFT.
- Claim `CH3-INK` held by agent `ch3-ink` on main (ea29a8e, 600 min from 2026-11-13T21:14Z).
- Commits: 568fab4 the level to ink in the `drift` zone and `src/loaders/drift.ts`; 8cf74d3 the stone's mist-pale
  top and the stone check; 4b437bf the far peaks, the proportion check, darwin goldens, the scene ratchet; then
  the records (D-029, OQ-083, B-110 rewritten, B-116 to B-121) and this file.
- **What is built** (D-029 has it in full): `levels/03-drifting-stones.json` changes in three lines. `drift.ts`
  draws the level's boxes with a dark 0.5 u brink (no paper lip: the chapter is read from above), the lintels as
  hanging rock, each moving stone in the INK PASS (mist-pale top, dark sides, a keel), a mist streak under each
  stone's travel, five rocks adrift. `buildCliffWall(masses, proportion)` and `buildBackdrop(..., mistY,
  peakSquash)` take the drift's arguments; chapters 1 and 2 pass none. `tools/harness/post.ts` has two new
  checks (`STONE_GATE`, `PROPORTION_GATE`) and `src/main.ts` the harness function `paintStretch`.
- **Measured so far, darwin:** chapter 3's 14 stages PASS, `post` 28/28; scene peak 80 draw calls and 171,044
  triangles (the ratchet is set there). The stone check red four ways and the proportion check red three ways,
  each source restored byte-identical (numbers are in the comments of the two gates in `post.ts`).
  `frame-hashes` against origin/main: 25 values, 24 chapter 3's, 1 chapter 1's cam3 (B-115's flipping pixel:
  881620c4 on main's run, c7b29bc6 on the branch's, both on record in D-028); gym, 2, 4, 5 identical.
- **fal: $0.00 spent; the ledger stands at $15.1968.**

## 2. What is left, in order

1. **The whole playtest**, `npm run playtest` (about 15 min; one at a time; never edit `src/` or `levels/` during
   it). It was started at the time of writing. Every stage of every level and the game stages must PASS
   (`reachable`, `fight`, the three touch stages, `pitch-assist`, `ambient-motion`). Then the static checks:
   `npm run typecheck`, `lint:levels`, `lint:decisions`, `lint:not-list`, `lint:self`, `assets:budget`,
   `check:teach`, `check:fight`.
2. **MEASUREMENTS**: four sections to append, "D-029 the drift's look" (every `DRIFT` constant with its basis,
   then the gates' numbers on the shipped look from the playtest's `post` lines for chapter 3), "D-029 the stone
   check" (`STONE_GATE`: shipped 2,908 / 2,890 px near and 1,346 / 1,332 px far, 100% off paper, 93.1 / 92.5%
   and 29.7 / 29.2% light top; not drawn 0 px; greybox slab 6.3 / 4.8% off paper docked; paper on paper 6.0 /
   3.7%; dark all over 0.0 to 0.8% top), "D-029 proportion" (`PROPORTION_GATE`: shipped worst 1.003, the far
   ridge; old wall 2.035 / 1.815 / 1.342 back, bay, front; squashed peaks 1.667; a 7 x 9 tile 1.286; plus what
   `post` reports for chapters 1, 2 and 5 in the playtest log), "D-029 every other level" (frame hashes above,
   the playtest's totals, the Linux goldens, frame rate if measured with `tools/measure-display.mjs`).
3. **The build log**, `docs/build-log/ch3-ink/`: six pairs, greybox beside ink, at 1920x1080 (the harness's
   Chromium) and 5120x1440 (`--gpu`, JPEG quality 92 through `tools/art/beside.mjs`), and one pair beside
   chapter 2, with a README as `docs/build-log/ch2-ink/README.md`. Poses, all `--yaw=-90`:
   start `--at=2,0,0`; the first stone before the jump `--at=44.5,1,0`; riding it `--at=49.8,1,0 --settle=75`;
   the first dash gap `--at=62.5,1,0`; a swordsman `--at=10.5,0,0`; the goal `--at=123.5,2.5,0`.
   `node tools/harness/frame.ts 03-drifting-stones <out> --size=WxH --at=... --yaw=-90 [--gpu]`. The greybox
   halves come from origin/main's source: a scratch checkout (`git worktree add --detach <dir> 584a9d4`, link
   `node_modules`) and the same commands there with `--build`.
4. **Linux goldens for chapter 3**, the documented way (HANDOFF-CH2-INK section 2 item 1, with `03-drifting-stones`
   and PR 45): CI on the head is red at `level (03-drifting-stones)` `visual` only; download
   `harness-report-03-drifting-stones`, copy each `camN.actual.png` over
   `tools/harness/golden/linux/03-drifting-stones/camN.png`, compare with darwin (pixelmatch 0.1, expect a few
   px), commit, push, wait for 13 jobs green. No other level's golden may be written.
5. **One self-review as a player** of the frames at 5120x1440 (the brief's one review): add what it finds to
   OQ-083 as item 16.
6. PR body: the report of at most 12 lines the brief asks for (reused and made; how a moving stone is drawn and
   why it reads; stretch and surfaces, and that chapter 2 did NOT take it; where it falls short; fal $0.00 and
   $15.1968; what chapter 4 needs (B-110); what Tim should judge by eye). `gh pr edit 45 --body-file`, then
   `gh pr ready 45` only if every `post` check is green without a gate changed.
7. Release the claim from a detached origin/main in a scratch worktree, never from `ch3-ink`:
   `node tools/claim.mjs release CH3-INK --agent ch3-ink`, commit the ledger line alone,
   `git log --oneline origin/main..HEAD` must show exactly one commit, `git push origin HEAD:main`.

## 3. Gotchas this task met

- This session's shell guard refuses `git -C`, a `git worktree add` into the shared checkout, and any compound
  command it cannot verify (a heredoc with a redirect, several `&&` with git): a refused command runs NOTHING.
  Put edits in a script file and run it alone. A scratch worktree under the job's tmp directory is allowed.
- Nothing painted may move: `post` advances the world one tick between two frames and fails if a painted pixel
  over the sky changed. Anything that rides a platform must be ink-pass geometry.
- An apostrophe inside a single-quoted check title breaks the harness build; a broken build runs no check.
- After a mutation run the bundle is stale: the next `frame.ts` needs `--build`.
- `--update-goldens --level=03-drifting-stones` only. Never `--record`.
