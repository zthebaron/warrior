#!/usr/bin/env node
// Playtest harness. Order: schema -> lint-level -> preflight -> nav -> phase-sweep -> replay -> chaos -> counters -> assets -> accent -> visual
//
//   npm run playtest                          every level in levels/
//   npm run playtest -- --level=00-gym        one level
//     --record          after a green nav run, (re)write tools/harness/traces/<level>.json
//     --update-goldens  (re)write tools/harness/golden/<level>/camN.png
//     --seed=<n>        chaos seed (default fixed; always logged)
//     --only=nav,chaos  run a subset of the browser stages (preflight always runs)
//     --skip-build      reuse dist-harness/ and dist/ (local iteration only)
//
// Exit: 0 pass · 1 LEVEL_FAILURE · 2 BUILD_FAILURE · 3 HARNESS_ENVIRONMENT_FAILURE · 4 HARNESS_SETUP_FAILURE
// Writes harness-report.json at the repo root.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import AjvMod from 'ajv';
import { lintLevel, segmentsOf, RESPAWN_RULES } from '../lint-level.mjs';
import { EXIT_CODE, FAILURE, Stage } from './lib.ts';
import { launchBrowser, preflight, probeWebgl } from './preflight.ts';
import { nav } from './nav.ts';
import { phaseSweep } from './sweep.ts';
import { replay, writeTrace } from './replay.ts';
import { chaos } from './chaos.ts';
import { counters } from './counters.ts';
import { assets } from './assets.ts';
import { accent } from './accent.ts';
import { visual } from './visual.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  }),
);
const log = (m) => console.log(m);
const BROWSER_STAGES = ['nav', 'phase-sweep', 'replay', 'chaos', 'counters', 'assets', 'accent', 'visual'];
const only = typeof args.only === 'string' ? args.only.split(',') : BROWSER_STAGES;

const allLevels = readdirSync(join(ROOT, 'levels')).filter((f) => f.endsWith('.json') && !f.endsWith('.schema.json')).map((f) => f.replace(/\.json$/, ''));
const levels = typeof args.level === 'string' ? [args.level] : allLevels;

// ---------- static stages (no browser) ----------
const Ajv = AjvMod.default ?? AjvMod;
const validate = new Ajv({ strict: true, allErrors: true }).compile(JSON.parse(readFileSync(join(ROOT, 'levels/level.schema.json'), 'utf8')));
const manifest = JSON.parse(readFileSync(join(ROOT, 'assets/dist/manifest.json'), 'utf8'));

const ABSENT_FIELDS = ['score', 'par_time', 'rank'];

function schemaStage(id, text) {
  const st = new Stage('schema');
  let data = null;
  try {
    data = JSON.parse(text);
  } catch (e) {
    st.check('valid JSON', false, String(e));
    return { result: st.result(), data };
  }
  const ok = validate(data);
  st.check('level.schema.json', !!ok, ok ? `levels/${id}.json` : validate.errors.map((e) => `${e.instancePath || '(root)'} ${e.message}`).join('; '));
  // Q4 amendment 2: "no score" is structural. If any of these ever validates, someone added the
  // field to the schema, and an agent will wire it up. Fail here, not in review.
  if (ok) {
    const leaked = ABSENT_FIELDS.filter((f) => validate({ ...data, [f]: 1 }));
    st.check('schema rejects score/par_time/rank', leaked.length === 0, leaked.length ? `schema now accepts: ${leaked.join(', ')}` : ABSENT_FIELDS.join(', ') + ' rejected');
  }
  return { result: st.result(), data };
}

function lintStage(data) {
  const st = new Stage('lint-level');
  if (!data) {
    st.check('lint', false, 'skipped: level JSON unparseable');
    return st.result();
  }
  const r = lintLevel(data, manifest);
  st.check('lint-level.mjs', r.ok, r.ok ? `clean${r.warnings.length ? `, ${r.warnings.length} warnings: ${r.warnings.join(' ')}` : ''}` : r.errors.join(' '));
  return st.result();
}

// ---------- report ----------
const t0 = Date.now();
const report = { harness: 'warrior-playtest/H3', startedAt: new Date(t0).toISOString(), node: process.version, args, environment: {}, levels: [], class: 'PASS', ok: false };

function classify(stages) {
  const failed = stages.filter((s) => !s.ok);
  for (const c of [FAILURE.ENVIRONMENT, FAILURE.BUILD, FAILURE.LEVEL, FAILURE.SETUP]) if (failed.some((s) => s.failureClass === c)) return c;
  return 'PASS';
}

function printTable(levelId, stages) {
  const W = { stage: 11, res: 6 };
  console.log(`\n┌─ ${levelId} ${'─'.repeat(Math.max(0, 86 - levelId.length))}`);
  for (const s of stages) {
    const pass = s.checks.filter((c) => c.ok).length;
    const res = s.ok ? 'PASS' : 'FAIL';
    console.log(`│ ${s.stage.padEnd(W.stage)} ${res.padEnd(W.res)} ${String(pass).padStart(2)}/${String(s.checks.length).padEnd(2)} ${(s.ms / 1000).toFixed(1).padStart(5)}s${s.ok ? '' : `  ${s.failureClass}`}`);
    for (const c of s.checks) console.log(`│     ${c.ok ? '✓' : '✗'} ${c.name.padEnd(42)} ${c.detail}`);
  }
  console.log(`└${'─'.repeat(90)}`);
}

function finish(code) {
  report.durationMs = Date.now() - t0;
  report.ok = report.class === 'PASS';
  writeFileSync(join(ROOT, 'harness-report.json'), JSON.stringify(report, null, 2) + '\n');
  const env = report.environment;
  console.log(`\nwebgl renderer : ${env.webglRenderer ?? '(none)'}`);
  console.log(`chromium       : ${env.chromium ?? '(not launched)'}`);
  console.log(`report         : harness-report.json`);
  console.log(`\nRESULT: ${report.class}${report.class === FAILURE.ENVIRONMENT ? '  — the machine could not run the game. NO LEVEL WAS TESTED; this is not a level failure.' : ''}`);
  process.exit(code);
}

// ---------- run ----------
const statics = levels.map((id) => {
  const text = readFileSync(join(ROOT, 'levels', `${id}.json`), 'utf8');
  const s = schemaStage(id, text);
  return { id, data: s.data, stages: [s.result, lintStage(s.data)] };
});

console.log(`warrior playtest — levels: ${levels.join(', ')}`);
const pf = await preflight(ROOT, { skipBuild: args['skip-build'] === true });
report.environment = { webglRenderer: pf.webglRenderer, chromium: pf.browser?.version() ?? null, baseUrl: pf.baseUrl, preflight: pf.result };
const cleanup = async () => {
  await pf.browser?.close().catch(() => {});
  pf.server?.kill();
};

if (!pf.result.ok) {
  for (const L of statics) {
    const stages = [...L.stages, pf.result];
    report.levels.push({ id: L.id, class: classify(stages), stages });
    printTable(L.id, stages);
  }
  report.class = classify([pf.result]);
  await cleanup();
  finish(EXIT_CODE[report.class]);
}

for (const L of statics) {
  // Stage isolation: every browser stage gets a freshly launched Chromium (fresh GPU process).
  // Found on Linux CI: SwiftShader's GPU process wedged after chaos, and every later stage — even a
  // blank page — could not get a webgl2 context. A wedge is still reported, per stage, as an
  // environment failure; it just can no longer leak from one stage into the next.
  const ctx = { browser: pf.browser, baseUrl: pf.baseUrl, levelId: L.id, level: L.data, segments: segmentsOf(L.data), lintRules: RESPAWN_RULES, root: ROOT, args, log };
  const stages = [...L.stages, pf.result];
  console.log(`\n== ${L.id}`);
  for (const name of BROWSER_STAGES) {
    if (!only.includes(name)) continue;
    if (!L.data) break;
    log(`  ${name}…`);
    if (stages.length > L.stages.length + 1) {
      await ctx.browser.close().catch(() => {});
      ctx.browser = pf.browser = await launchBrowser();
      const gl = await probeWebgl(ctx.browser);
      if (!gl.webgl2) {
        const st = new Stage(name);
        st.failureClass = FAILURE.ENVIRONMENT;
        st.check('fresh browser has webgl2', false, `${gl.error} — no level was tested by this stage`);
        stages.push(st.result());
        break;
      }
    }
    let r;
    if (name === 'nav') {
      r = await nav(ctx);
      if (args.record === true) {
        if (r.ok && r.outcome) {
          const p = writeTrace(ROOT, {
            level: L.id,
            recordedAt: new Date().toISOString(),
            source: 'nav bot (tools/harness/nav.ts), green run',
            expect: { ticks: r.outcome.ticks, final: r.outcome.final.feet, checkpoints: r.outcome.final.checkpoints },
            frames: r.outcome.frames,
          });
          log(`    trace recorded -> ${p.replace(`${ROOT}/`, '')} (${r.outcome.frames.length} frames)`);
        } else log('    --record ignored: nav did not pass');
      }
      delete r.outcome;
    } else if (name === 'phase-sweep') r = await phaseSweep(ctx);
    else if (name === 'replay') r = await replay(ctx);
    else if (name === 'chaos') r = await chaos(ctx);
    else if (name === 'counters') r = await counters(ctx);
    else if (name === 'assets') r = await assets(ctx);
    else if (name === 'accent') r = await accent(ctx);
    else r = await visual(ctx);
    stages.push(r);
    if (r.failureClass === FAILURE.ENVIRONMENT) break;
  }
  const cls = classify(stages);
  report.levels.push({ id: L.id, class: cls, stages });
  printTable(L.id, stages);
}

report.class = classify(report.levels.flatMap((l) => l.stages));
await cleanup();
finish(EXIT_CODE[report.class]);
