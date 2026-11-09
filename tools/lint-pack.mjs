#!/usr/bin/env node
// tools/lint-pack.mjs — UNMARKED_RETIRED: the prompt pack still instructs a concept a CLOSED decision
// retired, and nothing on the page says so.
//
// The class: PROMPT-00's DANGLING_INPUT, STALE_OPEN and UNCLOSED_OUTPUT all assume prompts with
// front-matter. The pack (00-start-here/AI-GAME-BUILD-PROMPT-PACK-v2.1.md) has none. It is one
// markdown file whose prompts are pasted whole, and CLAUDE.md says only sections marked SUPERSEDED
// or CLOSED are not live. So an unmarked section that still specifies scrolls, a localStorage save
// shape or a parry window is a live instruction to rebuild something Q1/Q3/Q6 refused. P9.2's save
// shape was exactly that (OQ-050 ruling, 2026-11-08). Nothing is wired up today, so it is latent.
//
// The terms come from SPEC.md's NOT table (its `src` rows), the same single source lint:not-list
// reads. They are not duplicated here.
//
// A passage is a list item (with its indented continuation) or a paragraph. It is exempt when:
//   - it sits under a heading carrying [SUPERSEDED ...] (until the next heading at that level or higher)
//   - it is in a blockquote that carries [SUPERSEDED ...]
//   - its first sentence carries [SUPERSEDED ...] (the whole item or paragraph is marked)
// and a single SENTENCE is exempt when it carries [SUPERSEDED ...] or cites a decision:
// PHASE-0-DECISIONS, Q1-Q7, D-0nn or OQ-0nn. A sentence that names the decision has been reconciled
// with it, e.g. "levels have NO par_time (PHASE-0-DECISIONS Q4)". Its neighbours have not.
// Anything else that contains a term is an error.
//
// Precision over recall, on purpose (a check nobody trusts is worse than none):
//   PROSE_AMBIGUOUS terms are skipped, because each is an ordinary English word with a live meaning
//   in the pack. Measured 2026-11-08: "score" is the music section (P10.3 — Score) and "Score each
//   1-5"; "lives" is "every magic number lives in TUNING". Skipping them is a known hole: a stale
//   "player has 3 lives" passes. Paraphrase also passes: "paper scroll being picked up" names no
//   term. This is a tripwire for the obvious names, like lint:not-list's src checks (Q7's limit).
//
// Usage: node tools/lint-pack.mjs [file.md]     default: the pack
//        node tools/lint-pack.mjs --self-test   proves the rule fails and exempts what it should
// Exit 0 clean · 1 UNMARKED_RETIRED · 2 unreadable

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPEC = path.join(ROOT, '00-start-here/SPEC.md');
const PACK = path.join(ROOT, '00-start-here/AI-GAME-BUILD-PROMPT-PACK-v2.1.md');

// English words with a live meaning in prose. Skipped in prose only; lint:not-list still checks them in src.
// The API names (NOT #19) split into English words that collide in prose: "zero text — geometry that
// forces a walk" (playbook Phase 11) is not TextGeometry.
const PROSE_AMBIGUOUS = new Set(['score', 'rank', 'lives', 'health', 'damage', 'attack', 'strike', 'chase*', 'unlock*', 'text_geometry', 'font_loader', 'css2_d', 'css3_d']);
const MARK = /\[(?:SUPERSEDED|CLOSED)\b/; // CLAUDE.md precedence 6: SUPERSEDED or CLOSED is not live
const CITE = /PHASE-0-DECISIONS|\bQ[1-7][a-c]?\b|\bD-0\d\d\b|\bOQ-0\d\d\b/;

function readTerms() {
  const md = fs.readFileSync(SPEC, 'utf8');
  const m = md.match(/<!-- NOT-LIST:BEGIN -->([\s\S]*?)<!-- NOT-LIST:END -->/);
  if (!m) throw new Error('SPEC.md has no NOT-LIST:BEGIN/END block');
  const terms = [];
  for (const l of m[1].split('\n')) {
    const c = l.split('|').slice(1, -1).map((x) => x.trim());
    if (c[3] !== 'src') continue;
    for (const t of c[4].matchAll(/`([^`]+)`/g)) {
      const expr = t[1].replace(/!$/, '');
      if (!PROSE_AMBIGUOUS.has(expr)) terms.push({ row: c[0], expr, parts: expr.replace(/\*$/, '').split('_'), prefix: expr.endsWith('*') });
    }
  }
  if (!terms.length) throw new Error('NOT table yielded no src terms');
  return terms;
}

const words = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[^A-Za-z0-9]+/).filter(Boolean).map((w) => w.toLowerCase());
function hit(text, t) {
  const w = words(text);
  for (let k = 0; k + t.parts.length <= w.length; k++) {
    if (t.parts.every((p, j) => (t.prefix && j === t.parts.length - 1 ? w[k + j].startsWith(p) : w[k + j] === p))) return true;
  }
  return false;
}

// Split into passages, each knowing whether a heading or blockquote above it marks it superseded.
function passages(md) {
  const lines = md.split('\n');
  const out = [];
  const heads = []; // stack of { level, marked }
  let cur = null;
  let quote = null; // { marked, lines[] } for the current blockquote run
  const flush = () => { if (cur) out.push(cur); cur = null; };
  const underMarked = () => heads.some((h) => h.marked);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const h = l.match(/^(#{1,6})\s/);
    if (h) {
      flush();
      while (heads.length && heads.at(-1).level >= h[1].length) heads.pop();
      heads.push({ level: h[1].length, marked: MARK.test(l) });
      continue;
    }
    if (/^\s*>/.test(l)) {
      if (!quote) {
        flush();
        let j = i, text = '';
        while (j < lines.length && /^\s*>/.test(lines[j])) text += lines[j++] + '\n';
        quote = { marked: MARK.test(text), end: j };
      }
    } else quote = null;
    if (!l.trim() || /^\s*```/.test(l) || /^\s*-{3,}\s*$/.test(l)) { flush(); continue; }
    const item = /^\s*(?:>\s*)?(?:[-*+]|\d+\.)\s/.test(l);
    if (!cur || item) { flush(); cur = { start: i + 1, text: '', marked: underMarked() || (quote?.marked ?? false) }; }
    cur.text += l + '\n';
  }
  flush();
  return out;
}

// Sentence scope: a cite or inline mark reconciles its own sentence, not its neighbours. Measured
// 2026-11-08: one paragraph-level "[SUPERSEDED — Q4] there is no par_time" in the playbook's Phase 9
// would otherwise have exempted the combo/parry/hitstop/localStorage sentences around it.
const sentences = (text) => text.split(/(?<=[.!?])\s+(?=[A-Z*~`[(])/);
function lint(md, terms) {
  const errs = [];
  for (const p of passages(md)) {
    if (p.marked) continue;
    const ss = sentences(p.text);
    if (MARK.test(ss[0])) continue; // an item or paragraph that opens with the mark is wholly marked
    const live = ss.filter((s) => !MARK.test(s) && !CITE.test(s));
    const found = terms.filter((t) => live.some((s) => hit(s, t))); // per sentence: a two-word term never spans a full stop
    if (found.length) errs.push({ line: p.start, terms: found.map((t) => `${t.expr} (NOT #${t.row})`), text: p.text.trim().split('\n')[0].slice(0, 100) });
  }
  return errs;
}

function selfTest(terms) {
  const cases = [
    ['unmarked bullet names a retired concept', '### P9.2 — Save\n```\n  - Save to localStorage, scrolls as collectibles.\n```\n', 1],
    ['heading marked SUPERSEDED covers its section', '### P9.2 — Save **[SUPERSEDED — Q3, OQ-050]**\n```\n  - Save to localStorage.\n```\n#### sub\nparry window\n', 0],
    ['the marked section ends at the next sibling heading', '### A **[SUPERSEDED — Q1]**\nparry\n### B\nhitstop on hit\n', 1],
    ['a passage that cites the decision is reconciled', '5. Do NOT add par_time — the schema rejects it\n   (PHASE-0-DECISIONS Q4).\n', 0],
    ['a citation in one bullet does not exempt its sibling', '- knockback on hit\n- no par_time (Q4)\n', 1],
    ['a cite exempts its own sentence, not the paragraph', 'Combat: two-hit combo, parry. Difficulty: no par_time (PHASE-0-DECISIONS Q4).\n', 1],
    ['an item that opens with the mark is wholly marked', '  - [SUPERSEDED — Q3] Save to localStorage. Then a chapter select.\n', 0],
    ['a CLOSED mark counts as SUPERSEDED does (CLAUDE.md)', '### P0.1 — Interview **[CLOSED — Q6]**\nFailure model: hp, knockback.\n', 0],
    ['a marked blockquote is exempt', '> **[SUPERSEDED — Q3]** a scroll pickup used to sit here\n> and a chapter select\n', 0],
    ['an unmarked blockquote is not', '> a scroll pickup and a chapter select\n', 1],
    ['prose-ambiguous words are skipped (known hole)', '### P10.3 — Score\nEvery magic number lives in TUNING.\n', 0],
    ['a two-word term does not span sentences', 'Teach it with ZERO text.\nGeometry carries the route.\n', 0],
    ['identifiers split on camelCase', 'player.invulnFrames = 30\n', 1],
  ];
  let bad = 0;
  for (const [name, md, want] of cases) {
    const got = lint(md, terms).length;
    const ok = got === want;
    if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${got} error(s), want ${want}`);
  }
  console.log(bad ? `\nself-test FAILED: ${bad}/${cases.length}` : `\nself-test passed: ${cases.length}/${cases.length}`);
  return bad ? 1 : 0;
}

let terms;
try { terms = readTerms(); } catch (e) { console.error(`UNREADABLE ${e.message}`); process.exit(2); }
if (process.argv.includes('--self-test')) process.exit(selfTest(terms));
const file = process.argv[2] ? path.resolve(process.argv[2]) : PACK;
let md;
try { md = fs.readFileSync(file, 'utf8'); } catch (e) { console.error(`UNREADABLE ${e.message}`); process.exit(2); }
const errs = lint(md, terms);
const rel = path.relative(ROOT, file);
for (const e of errs) console.log(`UNMARKED_RETIRED ${rel}:${e.line} ${e.terms.join(', ')} — "${e.text}"`);
console.log(errs.length
  ? `\n${errs.length} passage(s) instruct a retired concept with no [SUPERSEDED — <decision>] mark and no decision cited. Mark the section, or cite the decision that reconciles it.`
  : `lint:pack clean — ${rel}: no unmarked retired concepts (${terms.length} NOT-table terms; ${PROSE_AMBIGUOUS.size} prose-ambiguous terms skipped)`);
process.exit(errs.length ? 1 : 0);
