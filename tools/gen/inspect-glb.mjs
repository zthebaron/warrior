#!/usr/bin/env node
// What is in a GLB: meshes, triangles, materials, textures, skins, animations, bounds.
//
//   node tools/gen/inspect-glb.mjs <model.glb> [--dump <dir>]     --dump writes each texture out
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const a = process.argv.slice(2);
const di = a.indexOf('--dump');
const dump = di === -1 ? null : a.splice(di, 2)[1];
const file = a[0];
if (!file) { console.error('usage: inspect-glb.mjs <model.glb> [--dump <dir>]'); process.exit(2); }

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(file);
const root = doc.getRoot();
let tris = 0, verts = 0, prims = 0;
for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) {
  prims++;
  const pos = p.getAttribute('POSITION');
  verts += pos.getCount();
  tris += (p.getIndices() ? p.getIndices().getCount() : pos.getCount()) / 3;
}
const scene = root.getDefaultScene() ?? root.listScenes()[0];
const b = getBounds(scene);
const out = {
  file, bytes: statSync(file).size,
  meshes: root.listMeshes().length, primitives: prims, triangles: tris, vertices: verts,
  min: b.min.map((v) => +v.toFixed(4)), max: b.max.map((v) => +v.toFixed(4)),
  size: b.max.map((v, i) => +(v - b.min[i]).toFixed(4)),
  materials: root.listMaterials().map((m) => ({
    name: m.getName(), baseColorFactor: m.getBaseColorFactor().map((v) => +v.toFixed(3)),
    metallic: m.getMetallicFactor(), roughness: m.getRoughnessFactor(), alphaMode: m.getAlphaMode(), doubleSided: m.getDoubleSided(),
    baseColor: !!m.getBaseColorTexture(), metallicRoughness: !!m.getMetallicRoughnessTexture(), normal: !!m.getNormalTexture(), occlusion: !!m.getOcclusionTexture(), emissive: !!m.getEmissiveTexture(),
  })),
  textures: root.listTextures().map((t) => ({ name: t.getName(), mime: t.getMimeType(), size: t.getSize(), bytes: t.getImage()?.byteLength })),
  skins: root.listSkins().map((s) => ({ joints: s.listJoints().length })),
  animations: root.listAnimations().map((x) => x.getName()),
  extensionsUsed: root.listExtensionsUsed().map((e) => e.extensionName),
};
console.log(JSON.stringify(out, null, 1));
if (dump) {
  mkdirSync(dump, { recursive: true });
  root.listTextures().forEach((t, i) => {
    const ext = t.getMimeType() === 'image/jpeg' ? 'jpg' : t.getMimeType() === 'image/webp' ? 'webp' : 'png';
    writeFileSync(join(dump, `tex${i}.${ext}`), t.getImage());
  });
}
