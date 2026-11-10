// tools/lint-self.mjs — the linter's own negative-space tests (D-015b, D-015c, D-016).
// A check that has never failed is not known to work. Each rule below is run against inputs it MUST
// reject and inputs it MUST accept; if a rule passes everything, this fails.
// Usage: node tools/lint-self.mjs   (npm run lint:self; runs in CI after lint:levels)
import fs from 'fs';
import { armAt, assistedPitchDeg, groundFaces, lintLevel, MOVE, obstaclesOf, readableBandDeg, riseViews, withColliders, READABLE_RISE, REST_EYE } from './lint-level.mjs';
import { readabilityFixtures } from './fixtures/readability.mjs';
import { CAMERA_TUNING } from '../src/engine/camera-tuning.ts';

const rawManifest = JSON.parse(fs.readFileSync('assets/dist/manifest.json', 'utf8'));
const manifest = await withColliders(rawManifest, 'assets/dist/manifest.json');
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

// ---- D-016b: READABLE_RISE models the ASSISTED pitch (D-015d, B-18) --------------------------------------
// assistedPitchDeg is the camera's own rule (src/engine/pitch-assist.ts), fed the depth the probe measures.
console.log('pitch assist (D-015d): the pitch the camera settles at, from rest, 2u off the face');
const aAccept = (rise, depth) => { const p = assistedPitchDeg(rise, depth); check(`assisted: reads +${rise.toFixed(2)} onto ${depth}u`, p !== null, p === null ? 'no pitch reads' : `${p}deg`); };
const aReject = (rise, depth) => { const p = assistedPitchDeg(rise, depth); check(`assisted: still cannot read +${rise.toFixed(2)} onto ${depth}u`, p === null, p === null ? 'no pitch reads' : `reads at ${p}deg`); };
// The exit criterion for the chapter 2 blocker: wall (3.50-4.00) and climb (4.00-4.50) at their
// characteristic rise, which the rest pose rejects for ANY depth (the ceiling above), now read.
for (const depth of [2.5, 6, 15]) { aAccept(3.5, depth); aAccept(4.0, depth); }
for (const depth of [6, 15]) aAccept(4.5, depth);
// ...and the assisted check still fails: too shallow for any pitch, too tall for any pitch, too low for the
// probe (it runs at pivot height, so a face that low gets no assist and keeps its rest-pose verdict).
aReject(4.5, 2.5);
aReject(3.5, 0.5);
aReject(5.0, 1e6);
aReject(1.25, 1.0);
// Assisted ceilings, per landing depth (0.01 u): pinned so a rig change turns this red rather than stale.
for (const [rise, depth] of [[4.48, 2.5], [4.62, 6], [4.67, 15]]) { aAccept(rise, depth); aReject(rise + 0.01, depth); }
check(`hard ceiling ${ceiling.toFixed(2)}u is below wall (${MOVE.wall.maxRise.toFixed(2)}) and climb (${MOVE.climb.maxRise.toFixed(2)}) maxRise, inside wall's band (${MOVE.double.maxRise.toFixed(2)}..${MOVE.wall.maxRise.toFixed(2)}] since D-017`, ceiling < MOVE.wall.maxRise && ceiling < MOVE.climb.maxRise && ceiling > MOVE.double.maxRise, `${ceiling.toFixed(3)}u`);

// ---- READABLE_RISE and CHAPTER_TEACH on whole levels ---------------------------------------------
console.log('levels');
const rr = (r) => ({ err: r.errors.filter((e) => e.startsWith('[READABLE_RISE]')), warn: r.warnings.filter((e) => e.startsWith('[READABLE_RISE]')) });
const preLevel = load('tools/fixtures/lint/01-lower-stair.pre-d015.json');
const pre = lintLevel(preLevel, manifest), preRR = rr(pre);
// Under Q5's current table climb is not a chapter-1 move (CHAPTER_MOVE fails the file), so neither 3.5 face
// is a teaching instance: both are flagged, as WARNINGS (D-016).
// D-016b: the assist exposes both angular bands. RB-003 visibility additionally finds the first
// obscured by a torii: the real-rig regression confirms it; the second still reads.
check('pre-D-015 chapter 1: sightline occlusion flags the first face; the second remains readable', preRR.err.length === 0 && preRR.warn.length === 1 && preRR.warn[0].includes('critical_path[9]'), `${preRR.err.length} errors, ${preRR.warn.length} warnings`);
check('pre-D-015 chapter 1 FAILS CHAPTER_TEACH on jump (first jump over the void)', pre.errors.some((e) => e.startsWith('[CHAPTER_TEACH]') && e.includes('"jump"')));

// ---- D-016: READABLE_RISE is an ERROR on a teaching instance and a WARNING on practice -------------------
// Both directions, on real faces: the same two 3.5 climbs relabelled into chapter 2, where climb is new.
// The first is climb's teaching instance and MUST error; the second is practice and MUST only warn.
console.log('D-016 teach/practice split');
// With the assist a 3.5 face reads onto any landing >= 0.55 u deep, so both landings are cut to 0.5 u (the
// waypoint stays on them), which no pitch reads.
const asCh2 = { ...structuredClone(preLevel), chapter: 2, moves_allowed: ['ground', 'jump', 'wall', 'double', 'climb'] };
for (const [gi, wp] of [[10, 9], [15, 16]]) { const x = asCh2.critical_path[wp].pos[0]; asCh2.geometry[gi].pos[0] = x; asCh2.geometry[gi].scale[0] = 0.5; }
const c2 = rr(lintLevel(asCh2, manifest));
check('ch2: climb teaching instance at +3.50 is an ERROR', c2.err.length === 1 && /critical_path\[9\]/.test(c2.err[0]) && /teaching instance of "climb"/.test(c2.err[0]), `${c2.err.length} errors`);
check('ch2: second climb at +3.50 is a WARNING, not an error', c2.warn.length === 1 && /critical_path\[16\]/.test(c2.warn[0]) && !c2.err.some((e) => /critical_path\[16\]/.test(e)), `${c2.warn.length} warnings`);
// And on jump in the shipped chapter 1: narrow a landing so +1.25/+1.75 cannot be read.
const shipped = load('levels/01-lower-stair.json');
const narrow = (gi, sx) => { const l = structuredClone(shipped); l.geometry[gi].scale[0] = sx; return l; };
const t = rr(lintLevel(narrow(31, 1.0), manifest)); // the teach step (jump's first use, cp[2]) cut to 1 u
check('ch1: jump teaching instance onto a 1 u step is an ERROR', t.err.length === 1 && /critical_path\[2\]/.test(t.err[0]), `${t.err.length} errors, ${t.warn.length} warnings`);
const p = rr(lintLevel(narrow(32, 0.5), manifest)); // shelf 1 (cp[11], a later jump) cut to 0.5 u: no pitch reads it
check('ch1: later jump onto a 0.5 u shelf is a WARNING, not an error', p.err.length === 0 && p.warn.length === 1 && /critical_path\[11\]/.test(p.warn[0]), `${p.err.length} errors, ${p.warn.length} warnings`);

const post = lintLevel(load('levels/01-lower-stair.json'), manifest);
check('shipped chapter 1 passes (READABLE_RISE and CHAPTER_TEACH can pass)', post.ok, post.errors.join(' ') || 'clean');

const neg = lintLevel(load('tools/fixtures/lint/ch1-unrecoverable-first-jump.json'), manifest);
const c = codes(neg);
check('fixture: first jump over the void FAILS CHAPTER_TEACH, and nothing else', c.length === 1 && c[0] === 'CHAPTER_TEACH', c.join(', ') || 'no errors: CHAPTER_TEACH is a tautology again');

// ---- B-23: READABLE_RISE evaluates the eye the camera actually gets (the arm collides) -------------------
// The pre-B-23 model put the eye where an unobstructed arm would. A wall jump's own wall sits 1 u behind the
// stand point (chapter 2's shape) and pushes the arm in to minDistance: the eye drops from +3.66 to +1.75,
// below the top of anything worth a wall jump. Measured in the real rig (tools/harness/pitch-assist.ts B-23
// proof, camera behind the facing): +1.76.
console.log('B-23: the collided arm');
{
  const fx = load('tools/harness/fixtures/wall-arm.json');
  const ob = obstaclesOf(fx, manifest);
  const a = armAt(ob, [8, 0, 0], [1, 0], CAMERA_TUNING.initialPitchDeg), free = armAt(ob, [8, 0, 10], [1, 0], CAMERA_TUNING.initialPitchDeg);
  check('a wall 1u behind the stand point pins the arm at minDistance', a.arm === CAMERA_TUNING.minDistance && a.by === 2, `arm ${a.arm.toFixed(2)}u, eye +${a.eye.toFixed(2)}, by geometry[${a.by}]`);
  check('nothing behind: the full arm, the rest eye', free.arm === CAMERA_TUNING.distance && Math.abs(free.eye - REST_EYE.aboveFeet) < 1e-9, `arm ${free.arm.toFixed(2)}u, eye +${free.eye.toFixed(2)}`);
  // The rule, both ways, on wall faces inside wall's D-016 band (+3.75) and below it (+2.50), each with its
  // wall behind and with nothing behind. Pre-B-23 the linter passed all four; the rig reads only the clear two.
  const r = lintLevel(fx, manifest), flagged = (i) => [...r.errors, ...r.warnings].filter((e) => e.startsWith(`[READABLE_RISE] critical_path[${i}] `));
  check('B-23 rejects +3.75 (in wall\'s band) with its wall 1u behind: an ERROR, the teaching instance', flagged(2).length === 1 && r.errors.some((e) => e.startsWith('[READABLE_RISE] critical_path[2] ')), flagged(2)[0]?.slice(0, 140));
  check('B-23 accepts +3.75 (in wall\'s band) with nothing behind: the assist reads it at 29deg', flagged(4).length === 0, flagged(4)[0]?.slice(0, 140) ?? 'not flagged');
  check('B-23 rejects +2.50 (below the band) with its wall 1u behind', flagged(6).length === 1, flagged(6)[0]?.slice(0, 140));
  check('B-23 accepts +2.50 (below the band) with nothing behind: it reads at rest', flagged(8).length === 0, flagged(8)[0]?.slice(0, 140) ?? 'not flagged');
  const v = Object.fromEntries(riseViews(fx, manifest).map((x) => [x.index, x]));
  check('B-23: the walled +3.75 is judged at the camera\'s own target (29deg) with the arm collided there', v[2]?.pitchDeg === 29 && v[2].eyeM < 3.75, `pitch ${v[2]?.pitchDeg}deg, eye +${v[2]?.eyeM.toFixed(2)}`);
  // The kit meshes collide as their real triangles, not their bbox: pre-D-015 chapter 1's first 3.5 climb
  // has a torii 5u behind its stand point, and the arm passes through the gate. With only the bbox envelope
  // (a manifest withColliders did not load) the same face is flagged: the soup is load-bearing, and the
  // fallback errs toward failing.
  const env = lintLevel(load('tools/fixtures/lint/01-lower-stair.pre-d015.json'), rawManifest).warnings.filter((e) => e.startsWith('[READABLE_RISE]'));
  check('envelope fallback (no collision soup): the torii\'s bbox blocks the arm, the face is flagged', env.some(w => /critical_path\[9\]/.test(w) && /pushed in by geometry\[9\]/.test(w)), env[0]?.slice(0, 160) ?? 'not flagged');
}

// RB-003/RB-004: independent reviewer constructions, plus controls, against the actual rule.
console.log('RB-003/RB-004: visibility, exact rotated boxes, geometry heights and depth edges');
for (const fx of readabilityFixtures(load('levels/02-cliff-seam.json'), load('tools/harness/fixtures/wall-arm.json'), preLevel)) {
  const result = lintLevel(fx.level, manifest);
  const flagged = [...result.errors, ...result.warnings].some(s => s.startsWith(`[READABLE_RISE] critical_path[${fx.index}] `));
  const v = riseViews(fx.level, manifest).find(v => v.index === fx.index);
  check(`${fx.name}: READABLE_RISE ${fx.reads ? 'accepts' : 'rejects'} waypoint ${fx.index}`, flagged === !fx.reads && v?.reads === fx.reads,
    `band ${v?.bandDeg.toFixed(3)}deg; flagged ${flagged}`);
  if (fx.name === 'rotated-clear' || fx.name === 'baseline' || fx.name === 'lifted-beam')
    check(`${fx.name}: no unrelated semantic errors`, result.ok, result.errors.join(' '));
  if (fx.name === 'rotated-clear') check('rotated slab clear of the true arm leaves the full camera distance', Math.abs(v.eyeM - (CAMERA_TUNING.pivotHeight + CAMERA_TUNING.distance * Math.sin(v.pitchDeg * Math.PI / 180))) < 1e-9);
}

const gym = lintLevel(load('levels/00-gym.json'), manifest);
check('gym (chapter 0) is exempt from READABLE_RISE', !codes(gym).includes('READABLE_RISE'));

// ---- FACE_RISE (B-19): a ground segment is bounded per face, not by slope x run ---------------------
console.log(`FACE_RISE (MOVE.ground.autostep ${MOVE.ground.autostep}u)`);
const bx = (x0, x1, top, bot = -8) => ({ gi: 0, x0, x1, z0: -3, z1: 3, top, bot });
const tallest = (boxes, a, c) => Math.max(0, ...groundFaces(boxes, a, c).map((f) => f.rise));
const A = MOVE.ground.autostep;
check(`a +${A.toFixed(2)} face (= autostep) is walkable`, tallest([bx(-10, 5, 0), bx(5, 10, A)], [0, 0, 0], [8, A, 0]) <= A + 1e-9);
check(`a +${(A + 0.01).toFixed(2)} face is found and too tall`, tallest([bx(-10, 5, 0), bx(5, 10, A + 0.01)], [0, 0, 0], [8, A + 0.01, 0]) > A);
check('one +0.50 face at the end of a 6.6u run is found (slope x run would allow 7.9u)', Math.abs(tallest([bx(-10, 4, 0), bx(4, 10, 0.5)], [0, 0, 0], [6.6, 0.5, 0]) - 0.5) < 1e-9);
check('a ceiling overhead is not a face', tallest([bx(-10, 10, 0), bx(2, 4, 3.0, 2.2)], [0, 0, 0], [8, 0, 0]) === 0);
check('six 0.333 risers: every face walkable', tallest([0, 1, 2, 3, 4, 5].map((k) => bx(k * 0.6 - (k ? 0 : 10), (k + 1) * 0.6, Math.round((k * 2) / 6 * 1e4) / 1e4)).concat([bx(3.6, 10, 2)]), [-1, 0, 0], [5, 2, 0]) <= A + 1e-9);
const lr = lintLevel(load('tools/fixtures/lint/ch1-long-run-one-face.json'), manifest);
check('fixture: one +0.50 face in a long ground run FAILS FACE_RISE, and nothing else', codes(lr).length === 1 && codes(lr)[0] === 'FACE_RISE', codes(lr).join(', ') || 'no errors: FACE_RISE measures slope x run again');
const gymFR = lintLevel(load('levels/00-gym.json'), manifest);
check('gym: its 0.40 risers are a FACE_RISE WARNING (B-20), not an error', !codes(gymFR).includes('FACE_RISE') && gymFR.warnings.some((w) => w.startsWith('[FACE_RISE]')));
check('shipped chapter 1 has no FACE_RISE (its stair is 6 x 0.333)', !post.errors.some((e) => e.startsWith('[FACE_RISE]')) && !post.warnings.some((w) => w.startsWith('[FACE_RISE]')));

// ---- MOVE budgets (D-017: every timing clean) ------------------------------------------------------------
// Each budget is pinned at its value and just above, with literal numbers from MEASUREMENTS "B-20 re-measure",
// so moving a MOVE number turns this red instead of silently re-budgeting every level. One shipped segment
// (02's first double, cp[9]) is re-aimed at the probe; only UNREACHABLE on that segment is read.
console.log('MOVE budgets (D-017: a budget is clean at EVERY press timing and approach in the window)');
const seam = load('levels/02-cliff-seam.json');
const probe = (via, h, rise, i = 9) => {
  const L = structuredClone(seam), a = L.critical_path[i - 1].pos;
  L.critical_path[i] = { ...L.critical_path[i], via, pos: [a[0] + h, a[1] + rise, a[2]] };
  const r = lintLevel(L, manifest), seg = (s) => s.includes(`seg ${i - 1}->${i} via`);
  return { unreach: r.errors.filter((e) => e.startsWith('[UNREACHABLE]') && seg(e)), tight: r.warnings.filter((w) => w.startsWith('[TIGHT]') && seg(w)) };
};
const unreach = (...a) => probe(...a).unreach;
const pin = (via, what, at, above) => {
  const [h0, r0, h1, r1] = what === 'maxH' ? [at, 0, above, 0] : [1.0, at, 1.0, above];
  check(`${via} ${what} ${at} is reachable`, unreach(via, h0, r0).length === 0, unreach(via, h0, r0).join(' ') || 'clean');
  check(`${via} ${what} ${above} is UNREACHABLE`, unreach(via, h1, r1).length === 1, unreach(via, h1, r1).join(' ') || 'not flagged');
  // A segment exactly AT the budget is legal and must still be flagged for review (float: 54.6 - 52 > 2.6).
  if (what === 'maxH') check(`${via} ${what} ${at} (at the budget) is TIGHT`, probe(via, h0, r0).tight.length === 1, probe(via, h0, r0).tight.join(' ') || 'silent at 100%');
};
pin('double', 'maxH', 8.4, 8.5);     // nav press clean k0-k5 to 8.4; 8.8 fails k0 (9.5 was a late-press-only value)
pin('double', 'maxRise', 2.9, 3.0);  // clean from every takeoff distance to 2.9; 3.2 fails d5 (3.5 was most-distances)
pin('dash', 'maxH', 2.6, 2.7);       // clean k0-k5 to 2.6; 2.8 fails k4, k5 (4.0 was k0-k1 only)

console.log(fails ? `LINT-SELF FAIL  (${fails})` : 'LINT-SELF PASS');
process.exit(fails ? 1 : 0);
