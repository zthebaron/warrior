#!/usr/bin/env node
// Meshy's rigging call returns the skinned character and each clip as separate GLBs, every one
// carrying its own copy of the mesh and textures. This folds the clips into the skinned
// character so a2 loads one file: one mesh, one skin, named clips.
//
//   node tools/gen/merge-rig.mjs <rigged.glb> <out.glb> <clip name>=<clip.glb> [<clip name>=<clip.glb> ...]
//
// Clips are matched to the rig by joint name; a channel whose joint is missing is an error, not
// a skip. The rig's own placeholder clip is dropped.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup } from '@gltf-transform/functions';
import { statSync } from 'node:fs';

const [rigged, out, ...clips] = process.argv.slice(2);
if (!rigged || !out || !clips.length) { console.error('usage: merge-rig.mjs <rigged.glb> <out.glb> <name>=<clip.glb> ...'); process.exit(2); }
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const base = await io.read(rigged);
const root = base.getRoot();
for (const anim of root.listAnimations()) {
  for (const ch of anim.listChannels()) ch.dispose();
  for (const s of anim.listSamplers()) s.dispose();
  anim.dispose();
}
const buffer = root.listBuffers()[0];
const byName = new Map();
for (const n of root.listNodes()) {
  if (byName.has(n.getName())) { console.error(`ERROR rig has two nodes named "${n.getName()}"; cannot match clips by name`); process.exit(1); }
  byName.set(n.getName(), n);
}
const report = [];
for (const spec of clips) {
  const [name, file] = spec.split('=');
  const src = await io.read(file);
  const anim = src.getRoot().listAnimations()[0];
  if (!anim) { console.error(`ERROR ${file} has no animation`); process.exit(1); }
  const dst = base.createAnimation(name);
  let duration = 0;
  for (const ch of anim.listChannels()) {
    const target = byName.get(ch.getTargetNode().getName());
    if (!target) { console.error(`ERROR clip ${name}: joint "${ch.getTargetNode().getName()}" is not in the rig`); process.exit(1); }
    const s = ch.getSampler();
    const times = s.getInput().getArray();
    duration = Math.max(duration, times[times.length - 1]);
    const input = base.createAccessor().setType('SCALAR').setArray(times.slice()).setBuffer(buffer);
    const output = base.createAccessor().setType(s.getOutput().getType()).setArray(s.getOutput().getArray().slice()).setBuffer(buffer);
    const sampler = base.createAnimationSampler().setInput(input).setOutput(output).setInterpolation(s.getInterpolation());
    dst.addSampler(sampler).addChannel(base.createAnimationChannel().setTargetNode(target).setTargetPath(ch.getTargetPath()).setSampler(sampler));
  }
  report.push(`${name} ${duration.toFixed(3)}s ${anim.listChannels().length} channels`);
}
// One texture, as for the static models: Meshy hands back the normal and metallic-roughness maps
// it was given, and an unlit material reads neither.
for (const mat of root.listMaterials()) {
  mat.setNormalTexture(null).setMetallicRoughnessTexture(null).setOcclusionTexture(null).setEmissiveTexture(null);
  mat.setMetallicFactor(0).setRoughnessFactor(1);
  for (const ext of mat.listExtensions()) mat.setExtension(ext.extensionName, null);
}
await base.transform(dedup(), prune());
// every material extension was just removed, so no declared extension is still in use
for (const ext of root.listExtensionsUsed()) ext.dispose();
await io.write(out, base);
console.log(`${out}: ${root.listSkins()[0].listJoints().length} joints, clips: ${report.join('; ')}, ${(statSync(out).size / 1e6).toFixed(2)} MB`);
