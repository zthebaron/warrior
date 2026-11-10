#!/usr/bin/env node
// What is in a clip GLB: duration, sampling, which joints move, and how far the Hips travel.
//   node tools/gen/clip-info.mjs <clip.glb> [<clip.glb> ...]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const f of process.argv.slice(2)) {
  const d = await io.read(f);
  const root = d.getRoot();
  const skin = root.listSkins()[0];
  for (const anim of root.listAnimations()) {
    let dur = 0, keys = 0; const paths = {}; let hips = null; const interp = new Set();
    for (const ch of anim.listChannels()) {
      const s = ch.getSampler(), t = s.getInput().getArray();
      dur = Math.max(dur, t[t.length - 1]); keys = Math.max(keys, t.length); interp.add(s.getInterpolation());
      paths[ch.getTargetPath()] = (paths[ch.getTargetPath()] ?? 0) + 1;
      if (ch.getTargetNode().getName() === 'Hips' && ch.getTargetPath() === 'translation') hips = s.getOutput().getArray();
    }
    let hipsTxt = 'no Hips translation';
    if (hips) {
      const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; const n = hips.length / 3;
      for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], hips[i * 3 + k]); mx[k] = Math.max(mx[k], hips[i * 3 + k]); }
      const first = [hips[0], hips[1], hips[2]], last = [hips[(n - 1) * 3], hips[(n - 1) * 3 + 1], hips[(n - 1) * 3 + 2]];
      hipsTxt = `Hips range x ${(mx[0] - mn[0]).toFixed(1)} y ${(mx[1] - mn[1]).toFixed(1)} z ${(mx[2] - mn[2]).toFixed(1)}; first ${first.map((v) => v.toFixed(1))} last ${last.map((v) => v.toFixed(1))}`;
    }
    console.log(`${f.split('/').pop().padEnd(46)} "${anim.getName()}" ${dur.toFixed(3)}s ${keys} keys ${[...interp]} ${JSON.stringify(paths)} joints ${skin ? skin.listJoints().length : 0}\n    ${hipsTxt}`);
  }
}
