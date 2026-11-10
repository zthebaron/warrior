#!/usr/bin/env node
// Builds assets/hero/rigged/warrior_anim.glb: ONE skinned warrior with the nine clips the game's states
// map onto, named exactly idle, walk, run, jump, fall, land, dash, wall, climb.
//
//   node tools/gen/build-anim.mjs <dir with the multi-animation download> <out.glb> [--probe]
//
// Everything comes from ONE fal request (fal-ai/meshy/rigging/multi-animation, ledger row 46):
// the rig, its own walk and run, and ten library clips. Clips from a different rig request are
// not mixed in: two rig runs of the same mesh do not give the same skeleton (the round 1 rig's
// rest joints sit up to 0.021 of the figure's height away from this one's).
//
// The library clips are not usable as delivered, so they are cut here, locally and for free:
//   * The game owns all movement (src/entities/player.ts), so every clip is put IN PLACE: travel
//     along the ground is removed from the Hips, and so is flight (a jump's rise, a drop's fall).
//   * A state map plays jump, land and climb once and loops the rest (src/entities/character-model.ts
//     on art-pass-1), so one-shots are sliced to the part the state shows and loops are closed.
//   * `climb` does not exist in the library as the game needs it: 0.35 s, starting in a ledge hang
//     (its first frame is the held ledge_grab pose) and ending crouched on top. It is composed
//     from three poses of clips that were bought, joined by spherical interpolation.
//
// Units: the Armature node carries a scale of 0.01, so joint translations are in centimetres and
// the figure is 170 tall. Heights below are in those centimetres.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup } from '@gltf-transform/functions';
import { statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const probe = argv.includes('--probe');
const [dir, out] = argv.filter((x) => !x.startsWith('--'));
if (!dir || !out) { console.error('usage: build-anim.mjs <download dir> <out.glb> [--probe]'); process.exit(2); }
const FPS = 30;
const NAMES = ['idle', 'walk', 'run', 'jump', 'fall', 'land', 'dash', 'wall', 'climb'];

// The ten library clips of the request, in request order (tools/gen/payloads/anim-warrior.json).
const LIB = { Idle_3: 0, Regular_Jump: 1, Fall2: 2, Jumping_Down: 3, Lean_Forward_Sprint_inplace: 4, Jump_and_Grab_Wall: 5, Grab_Wall_Midair_Idle: 6, Ladder_Climb_Finish: 7, Bar_Hang_Idle: 8, Wall_Support_Jump_to_Ground: 9 };
const fileOf = (name) => name === 'walking' || name === 'running' ? join(dir, `warrior.basic_animations_${name}_glb.glb`) : join(dir, `warrior.animations_${LIB[name]}_animation_glb.glb`);

// ---- small maths -------------------------------------------------------------------------------
const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const qrot = (q, v) => { const u = [q[0], q[1], q[2]], s = q[3]; const d = u[0] * v[0] + u[1] * v[1] + u[2] * v[2], uu = u[0] * u[0] + u[1] * u[1] + u[2] * u[2]; const c = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; return [0, 1, 2].map((k) => 2 * d * u[k] + (s * s - uu) * v[k] + 2 * s * c[k]); };
const slerp = (a, b, t) => {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const bb = d < 0 ? b.map((x) => -x) : b; d = Math.abs(d);
  let wa, wb;
  if (d > 0.9995) { wa = 1 - t; wb = t; } else { const th = Math.acos(d), s = Math.sin(th); wa = Math.sin((1 - t) * th) / s; wb = Math.sin(t * th) / s; }
  const q = [0, 1, 2, 3].map((k) => wa * a[k] + wb * bb[k]); const n = Math.hypot(...q); return q.map((x) => x / n);
};
const lerp = (a, b, t) => a.map((x, k) => x + (b[k] - x) * t);
const smooth = (t) => t * t * (3 - 2 * t);

// ---- the rig -----------------------------------------------------------------------------------
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const base = await io.read(join(dir, 'warrior.rigged_character_glb.glb'));
const root = base.getRoot();
if (root.listSkins().length !== 1 || root.listMeshes().length !== 1) { console.error('ERROR the rig is not one mesh on one skin'); process.exit(1); }
const joints = root.listSkins()[0].listJoints();
const jointNames = joints.map((j) => j.getName());
const parentOf = new Map();
for (const n of root.listNodes()) for (const c of n.listChildren()) parentOf.set(c.getName(), n);
const rest = new Map(joints.map((j) => [j.getName(), { t: j.getTranslation(), r: j.getRotation(), s: j.getScale() }]));
// joints in an order where a parent always comes before its children
const order = []; const seen = new Set();
const visit = (name) => { if (seen.has(name)) return; const p = parentOf.get(name); if (p && rest.has(p.getName())) visit(p.getName()); seen.add(name); order.push(name); };
jointNames.forEach(visit);

/** A pose is Map(joint -> {t, r, s}) in joint-local terms. World positions in armature space (cm). */
const fk = (pose) => {
  const world = new Map();
  for (const name of order) {
    const l = pose.get(name) ?? rest.get(name);
    const p = parentOf.get(name);
    const pw = p && world.get(p.getName());
    if (!pw) { world.set(name, { p: l.t.slice(), r: l.r.slice() }); continue; }
    world.set(name, { p: qrot(pw.r, l.t).map((v, k) => v + pw.p[k]), r: qmul(pw.r, l.r) });
  }
  return world;
};
const measure = (pose) => {
  const w = fk(pose);
  const y = (n) => w.get(n).p[1];
  return { hips: y('Hips'), hands: (y('LeftHand') + y('RightHand')) / 2, handsMax: Math.max(y('LeftHand'), y('RightHand')), feet: Math.min(y('LeftToeBase'), y('RightToeBase'), y('LeftFoot'), y('RightFoot')), head: y('head_end'), handZ: (w.get('LeftHand').p[2] + w.get('RightHand').p[2]) / 2, hipsZ: w.get('Hips').p[2] };
};

// ---- clips -------------------------------------------------------------------------------------
/** Read a raw clip into frames at 30 fps: frames[i] is a pose. Raw keys run 1/30, 2/30, ...; they are re-based to start at 0. */
const cache = new Map();
const load = async (name) => {
  if (cache.has(name)) return cache.get(name);
  const f = fileOf(name);
  if (!existsSync(f)) { console.error(`ERROR missing download ${f}`); process.exit(1); }
  const doc = await io.read(f);
  const anim = doc.getRoot().listAnimations()[0];
  const tracks = new Map(); let n = 0;
  for (const ch of anim.listChannels()) {
    const jn = ch.getTargetNode().getName();
    if (!rest.has(jn)) { console.error(`ERROR clip ${name}: joint "${jn}" is not in the rig`); process.exit(1); }
    const s = ch.getSampler();
    if (s.getInterpolation() !== 'LINEAR') { console.error(`ERROR clip ${name}: ${s.getInterpolation()} sampler, expected LINEAR`); process.exit(1); }
    const times = s.getInput().getArray();
    for (let i = 1; i < times.length; i++) if (Math.abs(times[i] - times[i - 1] - 1 / FPS) > 1e-3) { console.error(`ERROR clip ${name}: keys are not at ${FPS} fps`); process.exit(1); }
    n = Math.max(n, times.length);
    if (!tracks.has(jn)) tracks.set(jn, {});
    tracks.get(jn)[ch.getTargetPath()] = { a: s.getOutput().getArray(), size: ch.getTargetPath() === 'rotation' ? 4 : 3, n: times.length };
  }
  const frames = [];
  for (let i = 0; i < n; i++) {
    const pose = new Map();
    for (const jn of jointNames) {
      const tr = tracks.get(jn) ?? {}, r0 = rest.get(jn);
      const get = (path, key, d) => { const c = tr[path]; if (!c) return d.slice(); const k = Math.min(i, c.n - 1) * c.size; return Array.from(c.a.subarray(k, k + c.size)); };
      pose.set(jn, { t: get('translation', 't', r0.t), r: get('rotation', 'r', r0.r), s: get('scale', 's', r0.s) });
    }
    frames.push(pose);
  }
  cache.set(name, frames);
  return frames;
};
const clonePose = (p) => new Map([...p].map(([k, v]) => [k, { t: v.t.slice(), r: v.r.slice(), s: v.s.slice() }]));
const blendPose = (a, b, t) => new Map(jointNames.map((jn) => { const x = a.get(jn), y = b.get(jn); return [jn, { t: lerp(x.t, y.t, t), r: slerp(x.r, y.r, t), s: lerp(x.s, y.s, t) }]; }));
/** Pose at a time in seconds, interpolated between frames. */
const at = (frames, sec) => { const f = Math.max(0, Math.min(frames.length - 1, sec * FPS)); const i = Math.floor(f), j = Math.min(frames.length - 1, i + 1); return i === j ? clonePose(frames[i]) : blendPose(frames[i], frames[j], f - i); };
const slice = (frames, t0, t1) => { const n = Math.round((t1 - t0) * FPS) + 1; return Array.from({ length: n }, (_, i) => at(frames, t0 + i / FPS)); };
const hips = (pose) => pose.get('Hips').t;
const REST_HIPS = rest.get('Hips').t;

/** Remove travel along the ground: the Hips keep their quick sway but not their slow drift, and sit over the origin. */
const inPlaceXZ = (frames, windowSec = 0.5) => {
  const w = Math.max(1, Math.round(windowSec * FPS / 2));
  const src = frames.map((p) => hips(p).slice());
  frames.forEach((p, i) => {
    for (const k of [0, 2]) {
      let sum = 0, c = 0;
      for (let j = i - w; j <= i + w; j++) { sum += src[Math.max(0, Math.min(src.length - 1, j))][k]; c++; }
      hips(p)[k] = src[i][k] - sum / c + REST_HIPS[k];
    }
  });
  return frames;
};
/** Remove flight: the Hips never go above `ceil`. A crouch (below it) is kept. */
const noFlight = (frames, ceil) => { frames.forEach((p) => { hips(p)[1] = Math.min(hips(p)[1], ceil); }); return frames; };
/** Move a pose up or down so that a measured point sits at a height. */
const place = (pose, key, y) => { const m = measure(pose); hips(pose)[1] += y - m[key]; return pose; };
/** Close a loop whose last frame is not its first: the tail is cross-faded into the head. */
const closeLoop = (frames, fadeFrames) => {
  const n = frames.length, out = frames.slice(0, n - fadeFrames).map(clonePose);
  for (let i = 0; i < fadeFrames; i++) { const t = (i + 1) / (fadeFrames + 1); out.push(blendPose(frames[n - fadeFrames + i], frames[i], smooth(t))); }
  out.push(clonePose(out[0]));
  return out;
};
/** How far apart two poses are: the largest joint rotation between them, in degrees. */
const poseGap = (a, b) => { let w = 0; for (const jn of jointNames) { const qa = a.get(jn).r, qb = b.get(jn).r; w = Math.max(w, (2 * Math.acos(Math.min(1, Math.abs(qa[0] * qb[0] + qa[1] * qb[1] + qa[2] * qb[2] + qa[3] * qb[3]))) * 180) / Math.PI); } return w; };
/**
 * Make a library loop close exactly. Meshy's loops repeat their first key as their last, but not
 * always exactly (Fall2 comes back 2 degrees off). If the last frame is already near the first it
 * is eased onto it over the final frames; if it is not, the clip has no repeated key and the tail
 * is cross-faded into the head instead.
 */
const asLoop = (frames, name) => {
  const n = frames.length;
  const gap = poseGap(frames[0], frames[n - 1]);
  // the clip's own pace: the median step from one frame to the next
  const steps = Array.from({ length: n - 1 }, (_, i) => poseGap(frames[i], frames[i + 1])).sort((x, y) => x - y);
  const step = steps[steps.length >> 1];
  if (gap <= Math.max(0.5, 0.4 * step)) {
    // the last key is the first key again, give or take: ease the final frames exactly onto it
    const k = Math.min(5, n - 2), out = frames.map(clonePose);
    for (let j = 0; j <= k; j++) out[n - 1 - k + j] = blendPose(frames[n - 1 - k + j], frames[0], smooth(j / k));
    out[n - 1] = clonePose(frames[0]);
    loopHow[name] = gap < 0.01 ? 'closed as delivered' : `sealed: last key came back ${gap.toFixed(2)} deg from the first (a frame step is ${step.toFixed(2)})`;
    return out;
  }
  if (gap <= 1.8 * step) {
    // an open cycle: last -> first is one more ordinary step, so the first frame is repeated after it
    loopHow[name] = `open cycle: last -> first is ${gap.toFixed(2)} deg, an ordinary step (${step.toFixed(2)}); first frame repeated at the end`;
    return frames.map(clonePose).concat([clonePose(frames[0])]);
  }
  loopHow[name] = `cross-faded: ends ${gap.toFixed(1)} deg from its start (a frame step is ${step.toFixed(2)})`;
  return closeLoop(frames, 3);
};
const loopHow = {};
/** Start a closed loop (last frame == first) somewhere else in its cycle. */
const rotateLoop = (frames, startSec) => { const body = frames.slice(0, -1), k = Math.round(startSec * FPS) % body.length; const r = body.slice(k).concat(body.slice(0, k)); r.push(clonePose(r[0])); return r; };
// every frame of the result is its own pose: a later edit must not land twice on a shared one
const pingPong = (frames) => frames.map(clonePose).concat(frames.slice(1, -1).reverse().map(clonePose)).concat([clonePose(frames[0])]);
/** Key poses joined by eased spherical interpolation: [[sec, pose], ...]. */
const fromKeys = (keys) => {
  const end = keys[keys.length - 1][0], n = Math.round(end * FPS) + 1, out = [];
  for (let i = 0; i < n; i++) {
    const t = i / FPS; let k = 0; while (k < keys.length - 2 && t > keys[k + 1][0]) k++;
    const [t0, p0] = keys[k], [t1, p1] = keys[k + 1];
    out.push(blendPose(p0, p1, smooth(Math.max(0, Math.min(1, (t - t0) / (t1 - t0))))));
  }
  return out;
};

// ---- the nine clips ----------------------------------------------------------------------------
const standing = measure(at(await load('Idle_3'), 0));
const STAND_HIPS = standing.hips;   // Hips height standing, feet on the ground
const built = {};
const note = {};

// idle: the whole library idle; it already ends where it starts.
built.idle = asLoop(await load('Idle_3'), 'idle');
note.idle = 'Idle_3 (243), whole clip';
// walk, run: the rig's own two clips, from this request (not round 1's).
built.walk = asLoop(await load('walking'), 'walk'); note.walk = "the rig's basic walking clip";
built.run = asLoop(await load('running'), 'run'); note.run = "the rig's basic running clip";
// jump: plays once and holds its last frame through jump, double_jump and wall_jump. The library
// clip is crouch, spring, tuck, land, recover; the state only wants spring to tuck.
built.jump = noFlight(inPlaceXZ(slice(await load('Regular_Jump'), 0.47, 0.87)), STAND_HIPS);
note.jump = 'Regular_Jump (466), 0.47-0.87 s: the spring and the tuck; rise removed';
// fall: a loop, already in place along the ground. The library clip carries the Hips low (the body
// pitches forward), which would drop the figure a quarter of a metre inside the capsule each time
// jump blends into fall: every airborne clip holds the Hips at standing height.
{
  const fall = asLoop(await load('Fall2'), 'fall');
  const dy = STAND_HIPS - measure(fall[0]).hips;
  fall.forEach((p) => { hips(p)[1] += dy; });
  built.fall = fall;
  note.fall = 'Fall2 (503), whole clip, raised so the Hips sit at standing height';
}
// land: the state lasts 0.08 s, so the clip opens on the impact crouch and then stands up.
built.land = inPlaceXZ(noFlight(slice(await load('Jumping_Down'), 1.55, 2.45), STAND_HIPS), 0.3);
note.land = 'Jumping_Down (470), 1.55-2.45 s: impact crouch, then standing up; drop and forward travel removed';
// dash: the state lasts 0.16 s, so the loop is turned to start on its widest stride.
built.dash = rotateLoop(asLoop(await load('Lean_Forward_Sprint_inplace'), 'dash'), 0.43);
note.dash = 'Lean_Forward_Sprint_inplace (644), turned to start on the widest stride';
// wall: the cling at the end of the grab, breathing: the last quarter second played forward and back.
{
  const cling = pingPong(slice(await load('Jump_and_Grab_Wall'), 1.03, 1.27));
  inPlaceXZ(cling, 5);
  const m0 = measure(cling[0]);
  // the tucked body sits in the upper part of the capsule: Hips at standing height
  const dy = STAND_HIPS - m0.hips;
  cling.forEach((p) => { hips(p)[1] += dy; });
  built.wall = cling;
  note.wall = 'Jump_and_Grab_Wall (448), 1.03-1.27 s forward then back: the cling against the wall';
}
// climb: composed. The game hangs the feet 160 below the ledge top (ledgeHangFeetBelowTop) and
// then lifts the capsule itself: up for the first 60% of 0.35 s, forward for the rest. So in the
// figure's own space the hands start 160 above the origin and must come down to the ground.
//   0.00 s  the ledge hang, held as ledge_grab: half the straight bar hang, half the wall cling,
//           which puts the hands at 160 with the knees a little bent and the feet inside the capsule
//   0.24 s  a deep crouch on top, hands low
//   0.35 s  rising out of the crouch; held to 0.40 s
{
  const centre = (p) => { hips(p)[0] = REST_HIPS[0]; hips(p)[2] = REST_HIPS[2]; return p; };
  const hang = centre(place(blendPose(at(await load('Bar_Hang_Idle'), 0), at(await load('Jump_and_Grab_Wall'), 1.2), 0.5), 'hands', 160));
  const down = await load('Jumping_Down');
  const crouch = centre(at(down, 1.68)), rising = centre(at(down, 1.92));
  for (const p of [crouch, rising]) hips(p)[1] = Math.min(hips(p)[1], STAND_HIPS);
  built.climb = fromKeys([[0, hang], [0.24, crouch], [0.35, rising], [0.4, rising]]);
  note.climb = 'composed: a hang (Bar_Hang_Idle 478 blended with the Jump_and_Grab_Wall 448 cling) -> Jumping_Down (470) crouch -> rising, 0.40 s';
}

if (probe) {
  const show = (label, pose) => { const m = measure(pose); console.log(`${label.padEnd(34)} hips ${m.hips.toFixed(0)} feet ${m.feet.toFixed(0)} hands ${m.hands.toFixed(0)} (max ${m.handsMax.toFixed(0)}) hat top ${m.head.toFixed(0)}  hands-feet ${(m.hands - m.feet).toFixed(0)}  hand z-hips z ${(m.handZ - m.hipsZ).toFixed(0)}`); };
  show('rest', new Map());
  show('Idle_3 @0', at(await load('Idle_3'), 0));
  show('Bar_Hang_Idle @0', at(await load('Bar_Hang_Idle'), 0));
  for (const t of [0.9, 1.0, 1.1, 1.2, 1.27]) show(`Jump_and_Grab_Wall @${t}`, at(await load('Jump_and_Grab_Wall'), t));
  for (const t of [0, 0.2, 0.4]) show(`Wall_Support_Jump @${t}`, at(await load('Wall_Support_Jump_to_Ground'), t));
  for (const t of [1.3, 1.6, 2.0]) show(`Grab_Wall_Midair_Idle @${t}`, at(await load('Grab_Wall_Midair_Idle'), t));
  for (const t of [1.4, 1.5, 1.55, 1.6, 1.65, 1.7, 1.8, 2.0, 2.45]) show(`Jumping_Down @${t}`, at(await load('Jumping_Down'), t));
  for (const t of [0.3, 0.4, 0.45, 0.5, 0.6, 0.7, 0.8, 0.87, 0.95]) show(`Regular_Jump @${t}`, at(await load('Regular_Jump'), t));
  for (const [name, frames] of Object.entries(built)) { show(`BUILT ${name} first`, frames[0]); show(`BUILT ${name} last`, frames[frames.length - 1]); }
}

// ---- loops must close ---------------------------------------------------------------------------
// The state map loops everything but jump, land and climb. A loop whose last frame is not its
// first pops once per cycle, so that is checked here on every joint, not by eye.
const LOOPS = ['idle', 'walk', 'run', 'fall', 'dash', 'wall'];
for (const name of LOOPS) {
  const f = built[name], a = f[0], b = f[f.length - 1];
  let worstDeg = 0, worstCm = 0;
  for (const jn of jointNames) {
    const qa = a.get(jn).r, qb = b.get(jn).r;
    const d = Math.min(1, Math.abs(qa[0] * qb[0] + qa[1] * qb[1] + qa[2] * qb[2] + qa[3] * qb[3]));
    worstDeg = Math.max(worstDeg, (2 * Math.acos(d) * 180) / Math.PI);
    worstCm = Math.max(worstCm, Math.hypot(...a.get(jn).t.map((v, k) => v - b.get(jn).t[k])));
  }
  if (worstDeg > 0.5 || worstCm > 0.2) { console.error(`ERROR loop "${name}" does not close: last frame is ${worstDeg.toFixed(2)} degrees / ${worstCm.toFixed(2)} cm from the first`); process.exit(1); }
  note[name] += ` [loop: ${loopHow[name] ?? 'built closed'}]`;
}

// ---- write -------------------------------------------------------------------------------------
for (const anim of root.listAnimations()) { for (const ch of anim.listChannels()) ch.dispose(); for (const s of anim.listSamplers()) s.dispose(); anim.dispose(); }
const buffer = root.listBuffers()[0];
const nodeOf = new Map(joints.map((j) => [j.getName(), j]));
const report = [];
for (const name of NAMES) {
  const frames = built[name];
  const anim = base.createAnimation(name);
  const input = base.createAccessor().setType('SCALAR').setArray(Float32Array.from(frames, (_, i) => i / FPS)).setBuffer(buffer);
  let channels = 0;
  for (const jn of jointNames) {
    const r0 = rest.get(jn);
    for (const [path, key, size, type] of [['translation', 't', 3, 'VEC3'], ['rotation', 'r', 4, 'VEC4'], ['scale', 's', 3, 'VEC3']]) {
      const arr = new Float32Array(frames.length * size);
      let moves = false;
      frames.forEach((p, i) => { const v = p.get(jn)[key]; for (let k = 0; k < size; k++) { arr[i * size + k] = v[k]; if (Math.abs(v[k] - r0[key][k]) > (key === 't' ? 1e-3 : 1e-5)) moves = true; } });
      // a track that never leaves the rig's rest value says nothing: leave the joint at rest
      if (!moves) continue;
      const output = base.createAccessor().setType(type).setArray(arr).setBuffer(buffer);
      const sampler = base.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
      anim.addSampler(sampler).addChannel(base.createAnimationChannel().setTargetNode(nodeOf.get(jn)).setTargetPath(path).setSampler(sampler));
      channels++;
    }
  }
  report.push({ name, seconds: +((frames.length - 1) / FPS).toFixed(3), frames: frames.length, channels, from: note[name] });
}
// One texture, as for the static models (a2's hero class, D-020): an unlit material reads only base colour.
for (const mat of root.listMaterials()) {
  mat.setNormalTexture(null).setMetallicRoughnessTexture(null).setOcclusionTexture(null).setEmissiveTexture(null);
  mat.setMetallicFactor(0).setRoughnessFactor(1);
  for (const ext of mat.listExtensions()) mat.setExtension(ext.extensionName, null);
}
await base.transform(dedup(), prune());
for (const ext of root.listExtensionsUsed()) ext.dispose();
await io.write(out, base);

// ---- check what was written, from the file ------------------------------------------------------
const check = (await io.read(out)).getRoot();
const got = check.listAnimations().map((x) => x.getName());
const fail = (m) => { console.error('ERROR ' + m); process.exit(1); };
if (got.join() !== NAMES.join()) fail(`clips are [${got}], expected exactly [${NAMES}]`);
if (check.listSkins().length !== 1) fail(`${check.listSkins().length} skins, expected 1`);
if (check.listMeshes().length !== 1 || check.listMeshes()[0].listPrimitives().length !== 1) fail('expected one mesh with one primitive');
if (check.listSkins()[0].listJoints().length !== 24) fail('expected 24 joints');
if (check.listTextures().length !== 1 || check.listMaterials().length !== 1) fail('expected one texture and one material');
for (const r of report) console.log(`${r.name.padEnd(6)} ${String(r.seconds).padStart(6)} s  ${String(r.frames).padStart(3)} frames  ${String(r.channels).padStart(2)} channels   ${r.from}`);
console.log(`${out}: 9 clips, 1 skin of 24 joints, 1 mesh, 1 texture, ${(statSync(out).size / 1e6).toFixed(2)} MB`);
