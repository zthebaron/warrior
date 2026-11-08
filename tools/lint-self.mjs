// tools/lint-self.mjs — the linter's own negative-space tests (D-015b, D-015c).
// A check that has never failed is not known to work. Each rule below is run against inputs it MUST
// reject and inputs it MUST accept; if a rule passes everything, this fails.
// Usage: node tools/lint-self.mjs   (npm run lint:self; runs in CI after lint:levels)
import fs from 'fs';
import { lintLevel, readableBandDeg, READABLE_RISE, REST_EYE } from './lint-level.mjs';

const manifest = JSON.parse(fs.readFileSync('assets/dist/manifest.json', 'utf8'));
const load = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const codes = (r) => r.errors.map((e) => e.match(/^\[([A-Z_]+)\]/)?.[1]);
let fails = 0;
const check = (name, ok, detail) => { console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? `  (${detail})` : ''}`); if (!ok) fails++; };

// ---- READABLE_RISE: the rule itself, by vector -------------------------------------------------
// Depths: 15 is the nominal landing D-015's table used; 2.5 is the shelves' real readable depth; 41
// and 14 are the two pre-split faces' real landings (geometry[10], geometry[15]).
console.log(`READABLE_RISE vectors (eye ${REST_EYE.aboveFeet.toFixed(2)}u above the feet, ${READABLE_RISE.standoffM}u standoff, needs >= ${READABLE_RISE.minBandDeg}deg)`);
const accept = (rise, depth) => { const b = readableBandDeg(rise, depth); check(`accepts +${rise.toFixed(2)} onto ${depth}u`, b >= READABLE_RISE.minBandDeg, `${b.toFixed(2)}deg`); };
const reject = (rise, depth) => { const b = readableBandDeg(rise, depth); check(`rejects +${rise.toFixed(2)} onto ${depth}u`, b < READABLE_RISE.minBandDeg, `${b.toFixed(2)}deg`); };
for (const depth of [15, 41, 14, 2.5]) { reject(3.5, depth); reject(3.75, depth); }
for (const depth of [15, 2.5]) { accept(1.75, depth); accept(2.0, depth); }
reject(4.5, 15); // top above the eye: back-facing, whatever D-015's table row says (OQ-046)
reject(1.75, 1.5); // D-015a's "1.5-wide shelf" as written: too shallow to read (OQ-046)

// ---- READABLE_RISE and CHAPTER_TEACH on whole levels ---------------------------------------------
console.log('levels');
const pre = lintLevel(load('tools/fixtures/lint/01-lower-stair.pre-d015.json'), manifest);
const preRR = pre.errors.filter((e) => e.startsWith('[READABLE_RISE]'));
check('pre-D-015 chapter 1 FAILS READABLE_RISE at both 3.5 faces', preRR.length === 2 && /critical_path\[9\]/.test(preRR[0] ?? '') && /critical_path\[16\]/.test(preRR[1] ?? ''), `${preRR.length} READABLE_RISE errors`);
check('pre-D-015 chapter 1 FAILS CHAPTER_TEACH on jump (first jump over the void)', pre.errors.some((e) => e.startsWith('[CHAPTER_TEACH]') && e.includes('"jump"')));

const post = lintLevel(load('levels/01-lower-stair.json'), manifest);
check('shipped chapter 1 passes (READABLE_RISE and CHAPTER_TEACH can pass)', post.ok, post.errors.join(' ') || 'clean');

const neg = lintLevel(load('tools/fixtures/lint/ch1-unrecoverable-first-jump.json'), manifest);
const c = codes(neg);
check('fixture: first jump over the void FAILS CHAPTER_TEACH, and nothing else', c.length === 1 && c[0] === 'CHAPTER_TEACH', c.join(', ') || 'no errors: CHAPTER_TEACH is a tautology again');

const gym = lintLevel(load('levels/00-gym.json'), manifest);
check('gym (chapter 0) is exempt from READABLE_RISE', !codes(gym).includes('READABLE_RISE'));

console.log(fails ? `LINT-SELF FAIL  (${fails})` : 'LINT-SELF PASS');
process.exit(fails ? 1 : 0);
