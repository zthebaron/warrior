#!/usr/bin/env node
// tools/lint-decisions.mjs — D-002 (B-11): a CLOSED decision must name the commit that implemented it.
//
// D-002: "This file now asserts properties the code does not have ... a document running ahead of
// reality. Every decision entry gains an `implemented_by:` field, empty until the commit lands. Add a
// lint rule reporting any CLOSED decision with no implementing commit."
//
// An entry is a `## ` section of 00-start-here/PHASE-0-DECISIONS.md. Its status is the LAST status word
// in its heading, so "OQ-037 **OVERRIDDEN.** DECIDED" is DECIDED and "**CONFIRMED as taken (B).** CLOSED"
// is CLOSED. CLOSED and DECIDED are closed: the decision is made, so the code is owed.
//
//   UNIMPLEMENTED_DECISION  closed, and no `implemented_by:` line names a commit (missing or empty)
//   NA_ON_CLOSED            closed, and `implemented_by:` says n/a. n/a is for a FINDING; a closed
//                           decision with nothing to build is a finding, and its heading should say so
//   UNKNOWN_COMMIT          any entry (closed or not) cites a sha that is not a commit on this branch's
//                           history. A typo, or a branch commit that never merged, certifies nothing
//
// A sha is 7-40 hex characters with at least one digit, so English hex-words ("defaced") are not shas.
//
// Usage: node tools/lint-decisions.mjs [file.md]   default: PHASE-0-DECISIONS.md
//        node tools/lint-decisions.mjs --self-test proves each code fires on a crafted entry
// Exit 0 clean · 1 errors · 2 environment (not a git checkout, or a SHALLOW clone: CI needs fetch-depth 0)

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, '00-start-here/PHASE-0-DECISIONS.md');
const STATUS = /\b(CLOSED|DECIDED|FINDING|CONDITIONAL|OVERRIDDEN|PROVISIONAL|SUPERSEDED|OPEN)\b/g;
const CLOSED = new Set(['CLOSED', 'DECIDED']);
const SHA = /\b(?=[0-9a-f]*[0-9])[0-9a-f]{7,40}\b/g;

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const known = new Map();
function onHistory(sha) {
  if (!known.has(sha)) {
    let ok = false;
    try { git('cat-file', '-e', `${sha}^{commit}`); git('merge-base', '--is-ancestor', sha, 'HEAD'); ok = true; } catch { ok = false; }
    known.set(sha, ok);
  }
  return known.get(sha);
}

export function entries(md) {
  const out = [];
  let cur = null;
  md.split('\n').forEach((l, i) => {
    if (/^## /.test(l)) {
      if (cur) out.push(cur);
      const st = [...l.matchAll(STATUS)].map((m) => m[1]);
      cur = { line: i + 1, heading: l.replace(/^## /, ''), status: st.at(-1) ?? null, fields: [] };
    } else if (cur) {
      const m = l.match(/^implemented_by:(.*)$/);
      if (m) cur.fields.push({ line: i + 1, value: m[1].trim() });
    }
  });
  if (cur) out.push(cur);
  return out;
}

export function lint(md, isCommit = onHistory) {
  const errs = [];
  for (const e of entries(md)) {
    const id = e.heading.split(/\s+—\s+/)[0];
    const shas = e.fields.flatMap((f) => [...f.value.matchAll(SHA)].map((m) => ({ sha: m[0], line: f.line })));
    for (const s of shas) if (!isCommit(s.sha)) errs.push({ code: 'UNKNOWN_COMMIT', line: s.line, msg: `${id}: ${s.sha} is not a commit on this branch's history` });
    if (!CLOSED.has(e.status ?? '')) continue;
    const na = e.fields.some((f) => /^n\/a\b/i.test(f.value));
    if (na && !shas.length) errs.push({ code: 'NA_ON_CLOSED', line: e.line, msg: `${id} is ${e.status} but implemented_by says n/a. A closed decision owes code; if there is none, it is a FINDING` });
    else if (!shas.length) errs.push({ code: 'UNIMPLEMENTED_DECISION', line: e.line, msg: `${id} is ${e.status} with ${e.fields.length ? 'an empty' : 'no'} implemented_by: name the commit that implemented it (D-002)` });
  }
  return errs;
}

function selfTest() {
  const head = git('rev-parse', '--short=7', 'HEAD');
  const cases = [
    ['CLOSED with an empty implemented_by', `## Q9 — crafted. CLOSED\n\ntext\n\nimplemented_by:\n`, ['UNIMPLEMENTED_DECISION']],
    ['CLOSED with no implemented_by line at all', `## Q9 — crafted. CLOSED\n\ntext\n`, ['UNIMPLEMENTED_DECISION']],
    ['DECIDED counts as closed', `## D-099 — crafted. DECIDED\nimplemented_by:\n`, ['UNIMPLEMENTED_DECISION']],
    ['the last status word wins (OVERRIDDEN ... DECIDED)', `## D-099 — OQ-1 **OVERRIDDEN.** DECIDED\n`, ['UNIMPLEMENTED_DECISION']],
    ['prose instead of a commit is still empty', `## Q9 — crafted. CLOSED\nimplemented_by: the schema cut, see PR 3\n`, ['UNIMPLEMENTED_DECISION']],
    ['n/a on a CLOSED decision', `## Q9 — crafted. CLOSED\nimplemented_by: n/a — nothing to build\n`, ['NA_ON_CLOSED']],
    ['a sha that is not a commit', `## Q9 — crafted. CLOSED\nimplemented_by: 0badc0d\n`, ['UNKNOWN_COMMIT']],
    ['a bad sha on a FINDING is still reported', `## D-099 — crafted. FINDING\nimplemented_by: 1234567\n`, ['UNKNOWN_COMMIT']],
    ['CLOSED with a real commit passes', `## Q9 — crafted. CLOSED\nimplemented_by: ${head} (the thing)\n`, []],
    ['FINDING with n/a passes', `## D-099 — crafted. FINDING\nimplemented_by: n/a — finding, no code\n`, []],
    ['CONDITIONAL / no status: not owed', `## Q9 — crafted. CONDITIONAL\n\n## D-099 — no status word\n`, []],
    ['a hex-word is not a sha', `## Q9 — crafted. CLOSED\nimplemented_by: defaced\n`, ['UNIMPLEMENTED_DECISION']],
  ];
  let bad = 0;
  for (const [name, md, want] of cases) {
    const got = lint(md).map((e) => e.code);
    const ok = got.length === want.length && want.every((c, i) => got[i] === c);
    if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: [${got.join(', ')}]${ok ? '' : ` want [${want.join(', ')}]`}`);
  }
  console.log(bad ? `\nself-test FAILED: ${bad}/${cases.length}` : `\nself-test passed: ${cases.length}/${cases.length}`);
  return bad ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (git('rev-parse', '--is-shallow-repository') === 'true') throw new Error('shallow clone: commits cannot be checked (CI: actions/checkout with fetch-depth: 0)');
  } catch (e) {
    console.error(`DECISIONS ENVIRONMENT ${e.message ?? e}`);
    process.exit(2);
  }
  if (process.argv.includes('--self-test')) process.exit(selfTest());
  const file = process.argv[2] ? path.resolve(process.argv[2]) : FILE;
  const md = fs.readFileSync(file, 'utf8');
  const errs = lint(md);
  const rel = path.relative(ROOT, file);
  for (const e of errs) console.log(`${e.code} ${rel}:${e.line} ${e.msg}`);
  const all = entries(md);
  const closed = all.filter((e) => CLOSED.has(e.status ?? '')).length;
  console.log(errs.length ? `\nDECISIONS FAIL  ${all.length} entries, ${closed} closed, ${errs.length} errors` : `DECISIONS PASS  ${all.length} entries, ${closed} closed, every closed one names an implementing commit on this history`);
  process.exit(errs.length ? 1 : 0);
}
