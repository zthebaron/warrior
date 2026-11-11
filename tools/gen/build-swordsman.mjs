#!/usr/bin/env node
// Builds assets/hero/rigged/swordsman_anim.glb (D-023): ONE skinned swordsman with the six clips the game
// plays, named exactly idle, walk, close, slash, hit, death.
//
//   node tools/gen/build-swordsman.mjs <dir with the multi-animation download> <out.glb> [--probe]
//
// Everything comes from ONE fal request (fal-ai/meshy/rigging/multi-animation, ledger row 88,
// tools/gen/payloads/anim-swordsman.json): the rig, its own walk, and eight library clips. As for the
// warrior (tools/gen/build-anim.mjs, whose pose maths this repeats), clips from another rig request are
// never mixed in.
//
//   idle    Combat_Stance (89): the guard he stands in, a loop
//   walk    the rig's own walk: on patrol and going back to his post, a loop
//   close   Walk_Fight_Forward (21): closing in on the warrior, a loop
//   slash   Right_Hand_Sword_Slash (219), whole: the draw-back, the cut and the recovery. The game does not
//           play it at its own pace: it maps the fight's three timings (src/systems/fight.ts FIGHT.swordsman
//           windupSec, slashSec, recoverSec) onto the three parts of the clip, at the two marks printed here.
//   hit     Hit_Reaction (178), its first 0.9 s: the reel. The game fits it to FIGHT.swordsman.staggerSec.
//   death   dying_backwards (189), 0.30 to 1.50 s: buckling, then down on his back. Its fall backward is kept.
//
// Bought and not used: Idle_3 (243, a civilian's idle: he holds a drawn blade), Charged_Slash (242, a 0.9 s
// charge, half as long again as the wind-up asked for), Knock_Down (187, a somersault through the air).
//
// The game owns where he stands (src/systems/fight.ts), so every clip but `death` is put in place.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup } from '@gltf-transform/functions';
import { statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const probe = argv.includes('--probe');
const [dir, out] = argv.filter((x) => !x.startsWith('--'));
if (!dir || !out) { console.error('usage: build-swordsman.mjs <download dir> <out.glb> [--probe]'); process.exit(2); }
const FPS = 30;
const NAMES = ['idle', 'walk', 'close', 'slash', 'hit', 'death'];
const LOOPS = ['idle', 'walk', 'close'];

// The eight library clips of the request, in request order (tools/gen/payloads/anim-swordsman.json).
const LIB = { Combat_Stance: 0, Idle_3: 1, Walk_Fight_Forward: 2, Charged_Slash: 3, Right_Hand_Sword_Slash: 4, Hit_Reaction: 5, dying_backwards: 6, Knock_Down: 7 };
const fileOf = (name) => name === 'walking' ? join(dir, 'swordsman.basic_animations_walking_glb.glb') : join(dir, `swordsman.animations_${LIB[name]}_animation_glb.glb`);

// ---- small maths (as tools/gen/build-anim.mjs) -------------------------------------------------
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
const base = await io.read(join(dir, 'swordsman.rigged_character_glb.glb'));
const root = base.getRoot();
if (root.listSkins().length !== 1 || root.listMeshes().length !== 1) { console.error('ERROR the rig is not one mesh on one skin'); process.exit(1); }
const joints = root.listSkins()[0].listJoints();
const jointNames = joints.map((j) => j.getName());
const parentOf = new Map();
for (const n of root.listNodes()) for (const c of n.listChildren()) parentOf.set(c.getName(), n);
const rest = new Map(joints.map((j) => [j.getName(), { t: j.getTranslation(), r: j.getRotation(), s: j.getScale() }]));
const order = []; const seen = new Set();
const visit = (name) => { if (seen.has(name)) return; const p = parentOf.get(name); if (p && rest.has(p.getName())) visit(p.getName()); seen.add(name); order.push(name); };
jointNames.forEach(visit);

/** World positions in armature space (cm) for a pose: Map(joint -> {t, r, s}) in joint-local terms. */
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

// ---- clips -------------------------------------------------------------------------------------
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
      const get = (path, d) => { const c = tr[path]; if (!c) return d.slice(); const k = Math.min(i, c.n - 1) * c.size; return Array.from(c.a.subarray(k, k + c.size)); };
      pose.set(jn, { t: get('translation', r0.t), r: get('rotation', r0.r), s: get('scale', r0.s) });
    }
    frames.push(pose);
  }
  cache.set(name, frames);
  return frames;
};
const clonePose = (p) => new Map([...p].map(([k, v]) => [k, { t: v.t.slice(), r: v.r.slice(), s: v.s.slice() }]));
const blendPose = (a, b, t) => new Map(jointNames.map((jn) => { const x = a.get(jn), y = b.get(jn); return [jn, { t: lerp(x.t, y.t, t), r: slerp(x.r, y.r, t), s: lerp(x.s, y.s, t) }]; }));
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
/** Start over the origin and keep what travel follows (a fall backward is part of the fall). */
const fromOrigin = (frames) => { const [x0, , z0] = hips(frames[0]); frames.forEach((p) => { hips(p)[0] += REST_HIPS[0] - x0; hips(p)[2] += REST_HIPS[2] - z0; }); return frames; };
const poseGap = (a, b) => { let w = 0; for (const jn of jointNames) { const qa = a.get(jn).r, qb = b.get(jn).r; w = Math.max(w, (2 * Math.acos(Math.min(1, Math.abs(qa[0] * qb[0] + qa[1] * qb[1] + qa[2] * qb[2] + qa[3] * qb[3]))) * 180) / Math.PI); } return w; };
const loopHow = {};
/** Make a library loop close exactly (build-anim.mjs asLoop). */
const asLoop = (frames, name) => {
  const n = frames.length;
  const gap = poseGap(frames[0], frames[n - 1]);
  const steps = Array.from({ length: n - 1 }, (_, i) => poseGap(frames[i], frames[i + 1])).sort((x, y) => x - y);
  const step = steps[steps.length >> 1];
  if (gap <= Math.max(0.5, 0.4 * step)) {
    const k = Math.min(5, n - 2), o = frames.map(clonePose);
    for (let j = 0; j <= k; j++) o[n - 1 - k + j] = blendPose(frames[n - 1 - k + j], frames[0], smooth(j / k));
    o[n - 1] = clonePose(frames[0]);
    loopHow[name] = gap < 0.01 ? 'closed as delivered' : `sealed: last key came back ${gap.toFixed(2)} deg from the first (a frame step is ${step.toFixed(2)})`;
    return o;
  }
  if (gap <= 1.8 * step) {
    loopHow[name] = `open cycle: last -> first is ${gap.toFixed(2)} deg, an ordinary step (${step.toFixed(2)}); first frame repeated at the end`;
    return frames.map(clonePose).concat([clonePose(frames[0])]);
  }
  const fade = 3, o = frames.slice(0, n - fade).map(clonePose);
  for (let i = 0; i < fade; i++) o.push(blendPose(frames[n - fade + i], frames[i], smooth((i + 1) / (fade + 1))));
  o.push(clonePose(o[0]));
  loopHow[name] = `cross-faded: ends ${gap.toFixed(1)} deg from its start (a frame step is ${step.toFixed(2)})`;
  return o;
};

const built = {}, note = {};
built.idle = asLoop(inPlaceXZ(await load('Combat_Stance'), 30), 'idle');
note.idle = 'Combat_Stance (89), whole clip, centred over the origin';
built.walk = asLoop(inPlaceXZ(await load('walking'), 30), 'walk');
note.walk = "the rig's basic walking clip";
built.close = asLoop(inPlaceXZ(await load('Walk_Fight_Forward'), 30), 'close');
note.close = 'Walk_Fight_Forward (21), whole clip';
built.slash = inPlaceXZ(await load('Right_Hand_Sword_Slash'), 30);
note.slash = 'Right_Hand_Sword_Slash (219), whole clip, centred over the origin';
built.hit = inPlaceXZ(slice(await load('Hit_Reaction'), 0, 0.9), 0.5);
note.hit = 'Hit_Reaction (178), 0-0.9 s: the reel; its metre of sideways stumble removed';
built.death = fromOrigin(slice(await load('dying_backwards'), 0.3, 1.5));
note.death = 'dying_backwards (189), 0.30-1.50 s: buckling, then down on his back; the fall backward kept';

// ---- the slash's marks: where the sword hand is fastest -------------------------------------------
// The cut is the stretch of the clip in which the right hand moves fastest. The marks are where its speed
// crosses half its peak, either side of the peak. The game reads them from SWORDSMAN.slashMarks
// (src/entities/swordsman-model.ts), which must say what is printed here.
const handAt = (pose) => fk(pose).get('RightHand').p;
const speeds = built.slash.map((p, i, all) => (i === 0 ? 0 : Math.hypot(...handAt(p).map((v, k) => v - handAt(all[i - 1])[k])) * FPS / 100)); // m/s
const peak = speeds.indexOf(Math.max(...speeds));
let a = peak, b = peak;
while (a > 1 && speeds[a - 1] >= speeds[peak] / 2) a--;
while (b < speeds.length - 1 && speeds[b + 1] >= speeds[peak] / 2) b++;
const marks = { cutFrom: +((a - 1) / FPS).toFixed(3), cutTo: +(b / FPS).toFixed(3), seconds: +((built.slash.length - 1) / FPS).toFixed(3) };
if (probe) {
  for (const [i, v] of speeds.entries()) console.log(`slash ${(i / FPS).toFixed(3)} s  hand ${v.toFixed(2)} m/s  at ${handAt(built.slash[i]).map((x) => x.toFixed(0)).join(', ')}${i >= a && i <= b ? '  <- cut' : ''}`);
  for (const name of ['hit', 'death']) for (const [i, p] of built[name].entries()) if (i % 3 === 0) console.log(`${name} ${(i / FPS).toFixed(3)} s  hips ${hips(p).map((x) => x.toFixed(0)).join(', ')}`);
}

// ---- loops must close ---------------------------------------------------------------------------
for (const name of LOOPS) {
  const f = built[name], p = f[0], q = f[f.length - 1];
  let worstDeg = 0, worstCm = 0;
  for (const jn of jointNames) {
    const qa = p.get(jn).r, qb = q.get(jn).r;
    worstDeg = Math.max(worstDeg, (2 * Math.acos(Math.min(1, Math.abs(qa[0] * qb[0] + qa[1] * qb[1] + qa[2] * qb[2] + qa[3] * qb[3]))) * 180) / Math.PI);
    worstCm = Math.max(worstCm, Math.hypot(...p.get(jn).t.map((v, k) => v - q.get(jn).t[k])));
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
      if (!moves) continue; // a track that never leaves the rig's rest value says nothing
      const output = base.createAccessor().setType(type).setArray(arr).setBuffer(buffer);
      const sampler = base.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
      anim.addSampler(sampler).addChannel(base.createAnimationChannel().setTargetNode(nodeOf.get(jn)).setTargetPath(path).setSampler(sampler));
      channels++;
    }
  }
  report.push({ name, seconds: +((frames.length - 1) / FPS).toFixed(3), frames: frames.length, channels, from: note[name] });
}
// One texture, as for the static models (the hero class, D-020): an unlit material reads only base colour.
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
if (!check.listSkins()[0].listJoints().some((j) => j.getName() === 'RightHand')) fail('no RightHand joint: the katana hangs on it');
if (check.listTextures().length !== 1 || check.listMaterials().length !== 1) fail('expected one texture and one material');
for (const r of report) console.log(`${r.name.padEnd(6)} ${String(r.seconds).padStart(6)} s  ${String(r.frames).padStart(3)} frames  ${String(r.channels).padStart(2)} channels   ${r.from}`);
console.log(`slash marks: the cut runs ${marks.cutFrom} s to ${marks.cutTo} s of ${marks.seconds} s (the sword hand above half its peak speed, ${speeds[peak].toFixed(1)} m/s)`);
console.log(`${out}: ${NAMES.length} clips, 1 skin of 24 joints, 1 mesh, 1 texture, ${(statSync(out).size / 1e6).toFixed(2)} MB`);
