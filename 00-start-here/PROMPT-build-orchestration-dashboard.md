# BUILD PROMPT — PGT-01 MISSION CONTROL
### The dashboard that manages, monitors and orchestrates the whole game build

One Claude Code prompt. Produces a self-hosted dashboard that reads the real repo and the
real harness output, so it reports what *is* rather than what someone remembered to tick.

**Deploy target:** standalone at first; designed to mount as a module in the Build Command
Center (build.dbai.agency) later.

---

**PASTE INTO CLAUDE CODE**

```
Build PGT-01 Mission Control — the orchestration dashboard for the game build program.

STACK (locked, my standard):
  Next.js (latest, App Router) + TypeScript + Tailwind + Neon Postgres + Drizzle ORM
  Deployed to Vercel. Repo under the zthebaron org. Build it in ~/Code/pgt-01-control.

THE DESIGN RULE THAT MATTERS MOST:
Anything that CAN be derived from the repo or from harness output MUST be derived, never
hand-ticked. A dashboard of self-reported checkboxes is a feelings tracker. Manual ticks
are only for steps no machine can observe — my own judgement calls and approvals.
Every derived row shows its source and the timestamp it was read.

── DATA SOURCES (read, do not duplicate) ───────────────────────────────────────────
1. GitHub (octokit, PAT in env): the game repo zthebaron/<game-repo>
     - levels/*.json                → level inventory, par_time, difficulty, JSON size
     - assets/dist/manifest.json    → asset count, triangles, bytes vs budget
     - 00-start-here/GATES.md       → gate ledger (parse the signed entries)
     - docs/build-log/*.md          → session feed
     - commits + open PRs           → activity, who/what is moving
2. Harness artifacts: harness-report.json uploaded by CI per run
     - per level × per mode: schema, lint, preflight, nav, replay, chaos, counters, visual
     - Tier-1 counters: draw calls, triangles, geometries, textures
3. Tier-2 nightly hardware job (self-hosted Mac Studio runner): p95 frame time, TTI,
   GPU memory, thermals, input latency. Keep Tier-1 and Tier-2 VISUALLY SEPARATE and
   label Tier-2 "hardware only" — CI renders on SwiftShader and its frame times are
   meaningless. Never show a CI frame time as if it were real.
4. Postgres (Drizzle): only what cannot be derived —
   manual_checks, gate_signoffs, agent_sessions, notes, playtest_sessions.

── VIEWS ───────────────────────────────────────────────────────────────────────────

A. PROGRAM — the landing view
   - Overall completion %, derived + manual combined, with the two counted separately
   - Phase rail: Day 0 → Phase 12, each with its own progress and current status
   - The six milestones (pre-production, vertical slice, first playable, alpha, beta,
     gold) as a horizontal ribbon with the refusal each one carries written under it
   - "Blocked on me" panel: every step only I can do that is still open, newest first
   - Next action: the single highest-priority open step

B. CHECKLIST — every step, with a checkbox
   Seed it from 00-start-here/CHECKLIST.json in the game repo (I will commit that file;
   if it is absent, scaffold it from the playbook's master checklist and tell me).
   Each step row carries:
     - id, phase, label
     - kind: derived | manual | gate | milestone
     - for derived: the check that satisfies it, its live result, source, and read time
     - for manual: a checkbox, who ticked it, when
     - for gate: blocked until all its prerequisites pass; signing writes a GATES.md entry
       back to the repo via a PR, never a direct push to main
   Filters: open only · gates and milestones · only-I-can-do · by phase.
   A derived row MUST NOT be tickable by hand. If I disagree with it, the fix is the repo.

C. LEVELS — the fan-out board
   One card per level: id, title, chapter, owning agent session, harness status per mode,
   bot completion time vs par_time, draw calls, triangles, JSON size, last green run,
   and the 3 concept thumbnails. Red border on any failing mode.
   Sort by status so failures float to the top.

D. AGENTS — who is running what
   agent_sessions table: session label, lane (builder/verifier/reviewer), assigned level
   or task, started, last heartbeat, state (running | blocked | reported done | verified).
   Flag any session blocked over 2 hours, and any that reported done but has no cold
   VERIFIER re-run. Agent-reported green is not green — show both columns side by side.

E. BUDGETS
   Tier-1 (every PR): draw calls, triangles, geometries, textures, bundle bytes, level
   JSON sizes — each as a bar against its limit, aggregate across all levels not per level.
   Tier-2 (nightly, hardware): frame time p95, TTI, GPU memory, thermals, input latency.
   Sparkline per metric over the last 30 runs so I can see drift before it becomes a wall.

F. LOG — reverse-chronological feed
   Commits, PRs, harness runs, gate signings, build-log entries, playtest notes,
   manual ticks. Filterable by kind. This is the case-study raw material; make it
   exportable to markdown.

── BEHAVIOUR ───────────────────────────────────────────────────────────────────────
- Refresh derived data every 60s while the tab is focused; show "as of HH:MM".
- Optimistic UI on manual ticks, reconcile on response.
- An open gate with everything green shows a prominent SIGN button. Signing requires my
  typed confirmation, writes to gate_signoffs, and opens a PR adding the GATES.md entry.
- Mobile-first: I will check this from my phone. The Program view must be useful on a
  narrow screen without horizontal scrolling.
- Dark mode by default, light mode available, both legible.
- No auth beyond a single shared secret in env for now; design so Clerk drops in later.

── OUT OF SCOPE (do not build) ─────────────────────────────────────────────────────
Editing levels, launching agents, running the harness. This observes and records.
It does not drive. Driving stays in Claude Code and CI.

── DELIVER ─────────────────────────────────────────────────────────────────────────
Scaffold, schema + migrations, the six views, the GitHub and harness readers, seed data
so every view renders before the game repo exists, and a README covering env vars and
the CHECKLIST.json contract.

Then report: routes built, tables created, which views run on seed data vs live data,
and anything in the data sources you could not reach.
```

---

## FOLLOW-UP PROMPTS

**PASTE INTO CLAUDE CODE** — once the game repo exists
```
Wire PGT-01 Mission Control to the live game repo. Point the GitHub reader at
zthebaron/<game-repo>, commit 00-start-here/CHECKLIST.json generated from the playbook
master checklist, and add a CI step that uploads harness-report.json after every run.
Then show me the Program view reading live data, and list every step still on seed data.
```

**PASTE INTO CLAUDE CODE** — to mount it in the Build Command Center
```
Extract PGT-01 Mission Control into a mountable module for the Build Command Center at
build.dbai.agency: a route group plus a self-contained data layer, no global state, its
own env namespace. Keep the standalone deploy working from the same source.
```
