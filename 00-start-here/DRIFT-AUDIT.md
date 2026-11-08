# DRIFT AUDIT
### Reusable prompt — run after any spec, standard, plan or decision changes

**What it is for:** when you change how something is done, the document that *describes*
the change is rarely the document you'll *execute* from later. The paste-block, the script,
the runbook and the checklist are what a tired person actually uses at 4am — and those drift
silently. This prompt finds them.

**The technique:** negative-space checking. Most review asks "is what's here correct?",
which reads fine in isolation and finds nothing. This asks "what should be here and isn't?"

---

## THE PROMPT

**PASTE INTO CLAUDE CHAT (or CLAUDE CODE for a repo)**

```
Run a drift audit.

WHAT CHANGED: <the decision, spec, standard or plan that just changed — and what it
replaced. Be specific about the OLD way, not just the new one.>

Do NOT re-read my documents and tell me they look consistent. Reading finds typos; it
does not find drift. Audit by evidence:

1. INVENTORY. List every artifact downstream of this change, and rank them by whether a
   tired person EXECUTES from them or merely reads them. Executables first: prompts I
   paste, scripts, CI config, runbooks, checklists, templates, skills, saved memory,
   dashboards. Specs and explainers last — they are the least dangerous when stale.

2. GREP BOTH DIRECTIONS. For each artifact:
   - search for the OLD pattern — the thing that is now wrong
   - search for the ABSENCE of the NEW pattern — the thing that should now be there
   Absence is the one people miss. Report hit counts per file, with line numbers.

3. VERDICT PER FILE: CURRENT / STALE / DANGEROUS.
   DANGEROUS = executing it would silently reproduce the exact fault the change fixed.
   Say plainly which files are dangerous and what specifically would go wrong if I used
   them today.

4. FIX IN BLAST-RADIUS ORDER. Executables first. For each fix, show me the change, not a
   description of the change.

5. MARK, DON'T DELETE. Put a superseded banner at the top of anything replaced, naming
   the successor. A superseded file with no banner is a trap for future me.

6. RE-GREP and show me the before/after counts as proof the drift is gone.

End with one line: anything still inconsistent that you chose not to fix, and why.
```

---

## WHEN TO RUN IT

- After any version bump to a plan, playbook, spec or standard
- After a verification pass changes a decision
- After a postmortem changes a procedure
- Before handing a project to someone else — or to an agent
- When returning to a project after two weeks away

## WHAT IT TYPICALLY FINDS

| Artifact | Why it drifts |
|---|---|
| Prompt packs / paste blocks | Updated the spec, never reopened the prompts |
| CI config and test assertions | Thresholds outlive the reasoning that set them |
| Runbooks and checklists | Copied from an earlier version, never re-derived |
| Saved memory / agent briefs | Still points at the superseded file by name |
| Templates and scaffolds | The starting point everyone inherits, nobody reviews |
| READMEs and onboarding docs | Last read by the person who wrote them |

## THE TWO RULES WORTH KEEPING

1. **Search for absence, not just presence.** Everything present reads fine in isolation.
   The fault is what is missing.
2. **Rank by executed, not by importance.** A stale spec is a documentation problem.
   A stale paste-block is a shipped bug.
