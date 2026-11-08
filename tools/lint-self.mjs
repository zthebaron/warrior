// tools/lint-self.mjs — the linter's own negative-space tests (D-015b, D-015c, D-016).
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
// D-016's ceilings: the largest rise (0.01 u resolution) still readable at the rest pose, per landing depth.
// If the rig moves these move with it, and D-016's numbers are stale: re-derive them, do not re-type them.
for (const [rise, depth] of [[2.28, 2.5], [2.92, 6], [3.18, 15]]) { accept(rise, depth); reject(rise + 0.01, depth); }
// The hard ceiling: no landing, however deep, makes a rise above eye - (standoff+behind)*tan(minBand) readable.
const ceiling = REST_EYE.aboveFeet - (READABLE_RISE.standoffM + REST_EYE.behind) * Math.tan(READABLE_RISE.minBandDeg / 57.29577951308232);
reject(ceiling + 0.01, 1e6);
check(`hard ceiling ${ceiling.toFixed(2)}u is below wall (4.00) and climb (4.50) maxRise, inside double (2.00..3.50)`, ceiling < 3.5 && ceiling > 2.0, `${ceiling.toFixed(3)}u`);

// ---- READABLE_RISE and CHAPTER_TEACH on whole levels ---------------------------------------------
console.log('levels');
const rr = (r) => ({ err: r.errors.filter((e) => e.startsWith('[READABLE_RISE]')), warn: r.warnings.filter((e) => e.startsWith('[READABLE_RISE]')) });
const preLevel = load('tools/fixtures/lint/01-lower-stair.pre-d015.json');
const pre = lintLevel(preLevel, manifest), preRR = rr(pre);
// Under Q5's current table climb is not a chapter-1 move (CHAPTER_MOVE fails the file), so neither 3.5 face
// is a teaching instance: both are flagged, as WARNINGS (D-016).
check('pre-D-015 chapter 1 flags both 3.5 faces (as practice warnings: climb is not a chapter-1 move)', preRR.err.length === 0 && preRR.warn.length === 2 && /critical_path\[9\]/.test(preRR.warn[0] ?? '') && /critical_path\[16\]/.test(preRR.warn[1] ?? ''), `${preRR.err.length} errors, ${preRR.warn.length} warnings`);
check('pre-D-015 chapter 1 FAILS CHAPTER_TEACH on jump (first jump over the void)', pre.errors.some((e) => e.startsWith('[CHAPTER_TEACH]') && e.includes('"jump"')));

// ---- D-016: READABLE_RISE is an ERROR on a teaching instance and a WARNING on practice -------------------
// Both directions, on real faces: the same two 3.5 climbs relabelled into chapter 2, where climb is new.
// The first is climb's teaching instance and MUST error; the second is practice and MUST only warn.
console.log('D-016 teach/practice split');
const asCh2 = { ...preLevel, chapter: 2, moves_allowed: ['ground', 'jump', 'wall', 'double', 'climb'] };
const c2 = rr(lintLevel(asCh2, manifest));
check('ch2: climb teaching instance at +3.50 is an ERROR', c2.err.length === 1 && /critical_path\[9\]/.test(c2.err[0]) && /teaching instance of "climb"/.test(c2.err[0]), `${c2.err.length} errors`);
check('ch2: second climb at +3.50 is a WARNING, not an error', c2.warn.length === 1 && /critical_path\[16\]/.test(c2.warn[0]) && !c2.err.some((e) => /critical_path\[16\]/.test(e)), `${c2.warn.length} warnings`);
// And on jump in the shipped chapter 1: narrow a landing so +1.25/+1.75 cannot be read.
const shipped = load('levels/01-lower-stair.json');
const narrow = (gi, sx) => { const l = structuredClone(shipped); l.geometry[gi].scale[0] = sx; return l; };
const t = rr(lintLevel(narrow(31, 1.0), manifest)); // the teach step (jump's first use, cp[2]) cut to 1 u
check('ch1: jump teaching instance onto a 1 u step is an ERROR', t.err.length === 1 && /critical_path\[2\]/.test(t.err[0]), `${t.err.length} errors, ${t.warn.length} warnings`);
const p = rr(lintLevel(narrow(32, 1.5), manifest)); // shelf 1 (cp[11], a later jump) cut to 1.5 u
check('ch1: later jump onto a 1.5 u shelf is a WARNING, not an error', p.err.length === 0 && p.warn.length === 1 && /critical_path\[11\]/.test(p.warn[0]), `${p.err.length} errors, ${p.warn.length} warnings`);

const post = lintLevel(load('levels/01-lower-stair.json'), manifest);
check('shipped chapter 1 passes (READABLE_RISE and CHAPTER_TEACH can pass)', post.ok, post.errors.join(' ') || 'clean');

const neg = lintLevel(load('tools/fixtures/lint/ch1-unrecoverable-first-jump.json'), manifest);
const c = codes(neg);
check('fixture: first jump over the void FAILS CHAPTER_TEACH, and nothing else', c.length === 1 && c[0] === 'CHAPTER_TEACH', c.join(', ') || 'no errors: CHAPTER_TEACH is a tautology again');

const gym = lintLevel(load('levels/00-gym.json'), manifest);
check('gym (chapter 0) is exempt from READABLE_RISE', !codes(gym).includes('READABLE_RISE'));

console.log(fails ? `LINT-SELF FAIL  (${fails})` : 'LINT-SELF PASS');
process.exit(fails ? 1 : 0);
