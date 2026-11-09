#!/usr/bin/env node
// B-22: merge the per-job harness reports of a split CI playtest into one verdict.
//
//   node tools/harness/merge-reports.mjs <dir> [--needs=<json>]   merge every harness-report.json under <dir>
//   node tools/harness/merge-reports.mjs --self-test               prove each coverage rule can fail
//
// The split (one CI job per level, one for the once-per-run stages) is only as good as its coverage. A
// matrix entry that never ran, or a job that was cancelled, must not read as green. So the merge is not
// "did every job that reported pass" but "does the union of reports cover everything a serial
// `npm run playtest` covers, and does all of it pass":
//   COVERAGE_LEVEL  every id in levels/ has a report that ran every per-level browser stage (BROWSER_STAGES)
//   COVERAGE_ONCE   every once-per-run stage (ONCE_STAGES: reachable, pitch-assist, ...) reported exactly once
//   JOB_RESULT      every upstream CI job (--needs, the GitHub `needs` context) concluded success
//   CLASS           every level and stage in every report is PASS
// Exit: the worst EXIT_CODE across reports (lib.ts); a coverage or job failure with no worse class is
// HARNESS_SETUP_FAILURE (4): something was not tested, which says nothing about a level.
// Writes the merged harness-report.json at the repo root, the same shape run.mjs writes.

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BROWSER_STAGES, EXIT_CODE, FAILURE, ONCE_STAGES, levelIds } from './lib.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ORDER = [FAILURE.ENVIRONMENT, FAILURE.BUILD, FAILURE.LEVEL, FAILURE.SETUP];

/** Pure: reports + expected level ids + needs context -> { class, problems, merged }. */
export function merge(reports, expectedLevels, needs = {}) {
  const problems = [];
  const classes = [];
  for (const [job, r] of Object.entries(needs)) {
    if (r?.result !== 'success') problems.push(`JOB_RESULT: CI job '${job}' concluded '${r?.result}', not success`);
  }
  const levels = [];
  for (const rep of reports) {
    for (const L of rep.report.levels ?? []) {
      levels.push({ ...L, from: rep.path });
      for (const s of L.stages ?? []) if (!s.ok) classes.push(s.failureClass ?? FAILURE.LEVEL);
      if (L.class !== 'PASS') {
        classes.push(L.class);
        problems.push(`CLASS: ${L.id} is ${L.class} in ${rep.path}`);
      }
    }
    if (rep.report.class !== 'PASS') classes.push(rep.report.class);
  }
  for (const id of expectedLevels) {
    const full = levels.filter((L) => L.id === id && BROWSER_STAGES.every((n) => L.stages?.some((s) => s.stage === n)));
    if (full.length === 0) {
      const partial = levels.filter((L) => L.id === id).map((L) => (L.stages ?? []).map((s) => s.stage).join(','));
      problems.push(`COVERAGE_LEVEL: ${id} has no report that ran all of ${BROWSER_STAGES.join(',')}${partial.length ? ` (saw only: ${partial.join(' | ')})` : ' (no report at all)'}`);
    }
  }
  for (const name of ONCE_STAGES) {
    const n = levels.filter((L) => L.id === '(game)' && L.stages?.some((s) => s.stage === name)).length;
    if (n !== 1) problems.push(`COVERAGE_ONCE: once-per-run stage '${name}' reported ${n} times, expected 1`);
  }
  const worst = ORDER.find((c) => classes.includes(c)) ?? (problems.length ? FAILURE.SETUP : 'PASS');
  return { class: worst, problems, levels };
}

function findReports(dir) {
  const out = [];
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f === 'harness-report.json') out.push({ path: p.replace(`${dir}/`, ''), report: JSON.parse(readFileSync(p, 'utf8')) });
    }
  };
  walk(dir);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

function selfTest() {
  const stage = (stage, ok = true, failureClass) => ({ stage, ok, ...(failureClass ? { failureClass } : {}), checks: [], ms: 0 });
  const levelRep = (id, cls = 'PASS') => ({
    path: `harness-report-${id}/harness-report.json`,
    report: { class: cls, levels: [{ id, class: cls, stages: ['schema', 'lint-level', 'preflight', ...BROWSER_STAGES].map((n) => stage(n, cls === 'PASS' || n !== 'nav', cls === 'PASS' ? undefined : cls)) }] },
  });
  const gameRep = (once = ONCE_STAGES) => ({
    path: 'harness-report-game/harness-report.json',
    report: {
      class: 'PASS',
      // the game job's per-level entries carry only static stages + preflight: they must NOT count as level coverage
      levels: [...['a', 'b'].map((id) => ({ id, class: 'PASS', stages: ['schema', 'lint-level', 'preflight'].map((n) => stage(n)) })), ...once.map((n) => ({ id: '(game)', class: 'PASS', stages: [stage(n)] }))],
    },
  });
  const okNeeds = { static: { result: 'success' }, level: { result: 'success' }, game: { result: 'success' } };
  const cases = [
    ['all present and green', [levelRep('a'), levelRep('b'), gameRep()], okNeeds, 'PASS', null],
    ['a level job missing', [levelRep('a'), gameRep()], okNeeds, FAILURE.SETUP, 'COVERAGE_LEVEL: b'],
    ['a level failed', [levelRep('a'), levelRep('b', FAILURE.LEVEL), gameRep()], okNeeds, FAILURE.LEVEL, 'CLASS: b'],
    ['reachable missing', [levelRep('a'), levelRep('b'), gameRep(ONCE_STAGES.filter((n) => n !== 'reachable'))], okNeeds, FAILURE.SETUP, "COVERAGE_ONCE: once-per-run stage 'reachable'"],
    ['once-stage reported twice', [levelRep('a'), levelRep('b'), gameRep(), gameRep(['pitch-assist'])], okNeeds, FAILURE.SETUP, "'pitch-assist' reported 2 times"],
    ['upstream job cancelled', [levelRep('a'), levelRep('b'), gameRep()], { ...okNeeds, level: { result: 'cancelled' } }, FAILURE.SETUP, "JOB_RESULT: CI job 'level'"],
    ['environment beats level', [levelRep('a', FAILURE.ENVIRONMENT), levelRep('b', FAILURE.LEVEL), gameRep()], okNeeds, FAILURE.ENVIRONMENT, 'CLASS: a'],
  ];
  let bad = 0;
  for (const [name, reps, needs, want, problem] of cases) {
    const r = merge(reps, ['a', 'b'], needs);
    const okProblem = problem === null ? r.problems.length === 0 : r.problems.some((p) => p.startsWith(problem) || p.includes(problem));
    const ok = r.class === want && okProblem;
    if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${r.class}${r.problems.length ? ` — ${r.problems.join('; ')}` : ''}`);
  }
  console.log(bad ? `\nmerge-reports self-test: ${bad} case(s) wrong` : `\nmerge-reports self-test: all ${cases.length} cases behave`);
  process.exit(bad ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  if (argv.includes('--self-test')) selfTest();
  const dir = argv.find((a) => !a.startsWith('--'));
  if (!dir) {
    console.error('usage: merge-reports.mjs <dir> [--needs=<json>] | --self-test');
    process.exit(EXIT_CODE[FAILURE.SETUP]);
  }
  const needsArg = argv.find((a) => a.startsWith('--needs='));
  const needs = needsArg ? JSON.parse(needsArg.slice('--needs='.length)) : {};
  const reports = findReports(resolve(dir));
  const expected = levelIds(ROOT);
  const r = merge(reports, expected, needs);
  console.log(`merge-reports: ${reports.length} report(s) under ${dir}`);
  for (const rep of reports) console.log(`  ${rep.path}: ${rep.report.class}, ${(rep.report.durationMs / 60000 || 0).toFixed(1)} min, ${(rep.report.levels ?? []).map((L) => L.id).join(' ')}`);
  console.log(`levels expected (levels/): ${expected.join(', ')}`);
  console.log(`once-per-run stages expected: ${ONCE_STAGES.join(', ')}`);
  for (const p of r.problems) console.log(`  ✗ ${p}`);
  const out = { harness: 'warrior-playtest/H3 (merged, B-22)', mergedAt: new Date().toISOString(), class: r.class, ok: r.class === 'PASS', problems: r.problems, parts: reports.map((p) => ({ path: p.path, class: p.report.class, durationMs: p.report.durationMs, environment: p.report.environment })), levels: r.levels };
  writeFileSync(join(ROOT, 'harness-report.json'), JSON.stringify(out, null, 2) + '\n');
  console.log(`\nRESULT: ${r.class}`);
  process.exit(EXIT_CODE[r.class]);
}
