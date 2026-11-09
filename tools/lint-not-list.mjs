// tools/lint-not-list.mjs — enforces the NOT list in 00-start-here/SPEC.md (PHASE-0-DECISIONS Q7).
//
// The table between the NOT-LIST markers in SPEC.md is the single source; this reads it, it does
// not duplicate it. Every row resolves to exactly one kind:
//
//   schema      `path=JSON` mutations of levels/00-gym.json. Each mutated level MUST FAIL
//               level.schema.json — the field or value does not exist (additionalProperties:false).
//   src         identifier words that MUST NOT appear in src/**/*.ts. Comments are stripped;
//               identifiers are split on camelCase and snake_case, so `playerHealth` trips `health`.
//               `par_time` means the consecutive words par,time. A trailing * is a prefix match.
//   harness     `stage` names: a playtest stage that must exist (tools/harness/<stage>.ts), be registered
//               in tools/harness/run.mjs and run in CI (`npm run playtest`). This linter cannot run a
//               browser, so it checks the wiring; the stage does the enforcing, and was shown to fail
//               before it was listed here (B-15). Used where the refusal is behaviour, not a name:
//               `deaths` may exist (the harness reads it) but must not reach the screen.
//   unenforced  no mechanical check exists. Listed so the gap is visible, never implied covered.
//
// Known-open checks carry a trailing `!` (e.g. `damage!`): violated today, fix queued. The mark is
// per check, so a pending row still guards its other checks. A row is honest in both directions:
//   unmarked check violated        -> error (a new violation, even inside a pending row)
//   `!` check now holds            -> error (the fix landed: drop the `!`)
//   Status column                  -> must say `pending` iff any check carries `!`, else `enforced`
//
// Known limit (Q7): a src check is a tripwire for the obvious name, not a proof. An agent that
// calls health `vitality` passes. The schema checks have no such hole.
//
// Usage: node tools/lint-not-list.mjs   (exit 0 clean, 1 errors, 2 table unreadable)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AjvMod from 'ajv';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPEC = path.join(ROOT, '00-start-here/SPEC.md');
const BASE_LEVEL = path.join(ROOT, 'levels/00-gym.json');
const SCHEMA = path.join(ROOT, 'levels/level.schema.json');
const SRC = path.join(ROOT, 'src');

// ---------- read the table ----------
function readRows() {
  const md = fs.readFileSync(SPEC, 'utf8');
  const m = md.match(/<!-- NOT-LIST:BEGIN -->([\s\S]*?)<!-- NOT-LIST:END -->/);
  if (!m) throw new Error('SPEC.md has no NOT-LIST:BEGIN/END block');
  const lines = m[1].split('\n').filter((l) => l.trim().startsWith('|'));
  const head = lines[0].split('|').slice(1, -1).map((c) => c.trim().toLowerCase());
  const col = (n) => { const i = head.indexOf(n); if (i < 0) throw new Error(`NOT table has no "${n}" column`); return i; };
  const [cId, cWhat, cKind, cCheck, cStatus] = ['#', 'refused', 'kind', 'check', 'status'].map(col);
  return lines.slice(2).map((l) => {
    const c = l.split('|').slice(1, -1).map((x) => x.trim());
    const checks = [...c[cCheck].matchAll(/`([^`]+)`/g)].map((x) => ({ expr: x[1].replace(/!$/, ''), open: x[1].endsWith('!') }));
    return { id: c[cId], what: c[cWhat].replace(/\*\*/g, ''), kind: c[cKind], checks, status: c[cStatus].split(/\s/)[0] };
  });
}

// ---------- schema checks ----------
const Ajv = AjvMod.default ?? AjvMod;
let validate, base; // compiled inside the try below: a broken schema is UNREADABLE (exit 2), not a crash

function mutate(level, expr) {
  const eq = expr.indexOf('=');
  if (eq < 0) throw new Error(`schema check "${expr}" is not path=JSON`);
  const keys = expr.slice(0, eq).match(/[^.[\]]+/g);
  const value = JSON.parse(expr.slice(eq + 1));
  const out = structuredClone(level);
  let o = out;
  for (const k of keys.slice(0, -1)) {
    if (o[k] === undefined) throw new Error(`schema check "${expr}": base level has no "${k}" to mutate`);
    o = o[k];
  }
  o[keys.at(-1)] = value;
  return out;
}
// holds = the schema rejects it
const schemaHolds = (expr) => !validate(mutate(base, expr));

// ---------- src checks ----------
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
const words = (ident) => ident.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').split(/[\s_$]+/).filter(Boolean).map((w) => w.toLowerCase());

function srcIndex() {
  const hits = []; // { file, line, words }
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx|js|mjs)$/.test(e.name)) {
        stripComments(fs.readFileSync(p, 'utf8')).split('\n').forEach((line, i) => {
          for (const id of line.match(/[A-Za-z_$][\w$]*/g) ?? []) hits.push({ file: path.relative(ROOT, p), line: i + 1, id, words: words(id) });
        });
      }
    }
  };
  walk(SRC);
  return hits;
}
const SRC_IDS = srcIndex();

function srcViolations(token) {
  const want = token.split('_').map((w) => w.toLowerCase());
  const prefix = want.at(-1).endsWith('*');
  if (prefix) want[want.length - 1] = want.at(-1).slice(0, -1);
  return SRC_IDS.filter(({ words: w }) => {
    for (let i = 0; i + want.length <= w.length; i++) {
      if (want.every((x, k) => (prefix && k === want.length - 1 ? w[i + k].startsWith(x) : w[i + k] === x))) return true;
    }
    return false;
  });
}

// ---------- harness checks ----------
const RUN_MJS = path.join(ROOT, 'tools/harness/run.mjs');
const CI = path.join(ROOT, '.github/workflows/ci.yml');
// holds = the stage file exists, run.mjs registers it by name, and CI runs the playtest
function harnessViolation(stage) {
  if (!fs.existsSync(path.join(ROOT, 'tools/harness', `${stage}.ts`))) return `tools/harness/${stage}.ts does not exist`;
  if (!fs.readFileSync(RUN_MJS, 'utf8').includes(`['${stage}', `)) return `stage "${stage}" is not registered in tools/harness/run.mjs`;
  if (!/run:\s*npm run playtest\b/.test(fs.readFileSync(CI, 'utf8'))) return 'CI does not run `npm run playtest`';
  return null;
}

// ---------- run ----------
let rows;
try {
  rows = readRows();
  validate = new Ajv({ strict: true, allErrors: true }).compile(JSON.parse(fs.readFileSync(SCHEMA, 'utf8')));
  base = JSON.parse(fs.readFileSync(BASE_LEVEL, 'utf8'));
  if (!validate(base)) throw new Error(`base level ${path.relative(ROOT, BASE_LEVEL)} does not validate, so every schema check would pass vacuously`);
} catch (e) {
  console.error(`NOT-LIST UNREADABLE  ${e.message}`);
  process.exit(2);
}

const errors = [];
const tally = { enforced: 0, pending: 0, unenforced: 0 };
for (const r of rows) {
  const tag = `#${r.id} ${r.what}`;
  if (!['schema', 'src', 'harness', 'unenforced'].includes(r.kind)) { errors.push(`${tag}: kind "${r.kind}" must be schema, src, harness or unenforced`); continue; }
  if (r.kind === 'unenforced') {
    tally.unenforced++;
    if (r.checks.length) errors.push(`${tag}: unenforced rows carry no checks`);
    console.log(`  UNENFORCED  ${tag}`);
    continue;
  }
  if (!r.checks.length) { errors.push(`${tag}: ${r.kind} row with no checks`); continue; }
  const expected = r.checks.some((c) => c.open) ? 'pending' : 'enforced';
  if (r.status !== expected) errors.push(`${tag}: status says "${r.status}" but its checks say "${expected}" (a trailing ! marks a known-open check)`);
  tally[expected]++;
  const fresh = [], stillOpen = [], closed = [];
  for (const c of r.checks) {
    let violation = null;
    if (r.kind === 'schema') { if (!schemaHolds(c.expr)) violation = `schema accepts ${c.expr}`; }
    else if (r.kind === 'harness') violation = harnessViolation(c.expr);
    else { const v = srcViolations(c.expr); if (v.length) violation = `"${c.expr}" in ${v.slice(0, 3).map((h) => `${h.file}:${h.line} (${h.id})`).join(', ')}${v.length > 3 ? ` +${v.length - 3}` : ''}`; }
    if (violation && !c.open) fresh.push(violation);
    else if (violation) stillOpen.push(violation);
    else if (c.open) closed.push(c.expr);
  }
  if (fresh.length) errors.push(`${tag}: VIOLATED: ${fresh.join('; ')}`);
  if (closed.length) errors.push(`${tag}: ${closed.join(', ')} marked open (!) but now hold; drop the !`);
  const label = fresh.length ? 'VIOLATED' : stillOpen.length ? 'PENDING' : 'ok';
  console.log(`  ${label.padEnd(10)}  ${tag}${stillOpen.length ? `  (${stillOpen.length}/${r.checks.length} open: ${stillOpen.join('; ')})` : ''}`);
}
for (const e of errors) console.error(`  ERROR ${e}`);
console.log(`${errors.length ? 'NOT-LIST FAIL' : 'NOT-LIST PASS'}  ${rows.length} rows: ${tally.enforced} enforced, ${tally.pending} pending, ${tally.unenforced} unenforced${errors.length ? `, ${errors.length} errors` : ''}`);
process.exit(errors.length ? 1 : 0);
