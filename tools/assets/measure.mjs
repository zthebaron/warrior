// Measure a .glb as it actually ships. The ONE place asset numbers come from: build.mjs writes
// them into the manifest, budget.mjs re-measures the committed file and compares, so a manifest
// that was hand-edited or left stale after a rebuild fails CI.
//
// Renderer-independent only: triangles, bytes, bbox, materials, primitives (= draw calls when
// placed once, uninstanced), texture count/mime/dimensions. Nothing here needs a GPU.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';

let ioPromise = null;
/** NodeIO with every extension and the Draco decoder registered (shipped files are Draco). */
export function io() {
  ioPromise ??= (async () =>
    new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
      'draco3d.decoder': await draco3d.createDecoderModule(),
      'draco3d.encoder': await draco3d.createEncoderModule(),
    }))();
  return ioPromise;
}

/** KTX2 header: 12-byte identifier, vkFormat u32, typeSize u32, pixelWidth u32, pixelHeight u32. */
const KTX2_ID = Buffer.from([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]);
export function imageSize(bytes, mime) {
  const b = Buffer.from(bytes);
  if (mime === 'image/ktx2') {
    if (!b.subarray(0, 12).equals(KTX2_ID)) throw new Error('texture claims image/ktx2 but has no KTX2 identifier');
    return { width: b.readUInt32LE(20), height: b.readUInt32LE(24) };
  }
  if (mime === 'image/png') return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  throw new Error(`no size reader for ${mime}`);
}

const r5 = (v) => Math.round(v * 1e5) / 1e5;

export async function measure(path) {
  const buf = readFileSync(path);
  const doc = await (await io()).readBinary(new Uint8Array(buf));
  const root = doc.getRoot();
  let triangles = 0;
  let primitives = 0;
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  const v = [0, 0, 0];
  // walk the scene graph so node transforms count toward the bbox and unreferenced meshes do not
  const visit = (node) => {
    const mesh = node.getMesh();
    if (mesh) {
      const m = node.getWorldMatrix();
      for (const prim of mesh.listPrimitives()) {
        if (prim.getMode() !== 4) throw new Error(`${path}: primitive mode ${prim.getMode()} — TRIANGLES only`);
        primitives++;
        const pos = prim.getAttribute('POSITION');
        const idx = prim.getIndices();
        triangles += (idx ? idx.getCount() : pos.getCount()) / 3;
        for (let i = 0; i < pos.getCount(); i++) {
          pos.getElement(i, v);
          for (let k = 0; k < 3; k++) {
            const w = m[k] * v[0] + m[4 + k] * v[1] + m[8 + k] * v[2] + m[12 + k];
            lo[k] = Math.min(lo[k], w);
            hi[k] = Math.max(hi[k], w);
          }
        }
      }
    }
    for (const c of node.listChildren()) visit(c);
  };
  for (const scene of root.listScenes()) for (const n of scene.listChildren()) visit(n);
  const textures = root.listTextures().map((t) => ({ name: t.getName(), mime: t.getMimeType(), ...imageSize(t.getImage(), t.getMimeType()) }));
  return {
    sha256: createHash('sha256').update(buf).digest('hex'),
    bytes: buf.length,
    triangles,
    draw_calls: primitives,
    materials: root.listMaterials().length,
    bbox: { min: lo.map(r5), max: hi.map(r5) },
    textures,
    extensions: root.listExtensionsUsed().map((e) => e.extensionName).sort(),
  };
}
