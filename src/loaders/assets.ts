// Asset manifest + GLB loading. assets/dist/manifest.json is written by tools/build_assets.mjs
// (`npm run assets`); never hand-edit it. Two kinds:
//   primitive  unit box scaled per placement (greybox)
//   mesh       a Draco + KTX2 GLB holding ONE repeat unit; `instancing` says how many copies the
//              loader draws (InstancedMesh: one draw call) and the per-copy offset.
//
// Mesh assets are loaded before a level is built (preloadLevelAssets), so buildLevel stays
// synchronous. H4 has one mesh asset; when levels reference many, load per level, not per boot.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import manifestJson from '../../assets/dist/manifest.json';

export type Vec3 = [number, number, number];
export type AssetCollider = 'trimesh' | 'none'; // no 'box' — the capsule sinks (check:physics FLOOR SINK)

export interface PrimitiveAsset {
  name: string;
  kind: 'primitive';
  shape: 'box';
  size: Vec3;
  collider: AssetCollider;
}

export interface MeshAsset {
  name: string;
  kind: 'mesh';
  file: string;
  collider: AssetCollider;
  triangles: number; // one repeat unit
  bytes: number;
  bbox: { min: Vec3; max: Vec3 };
  instancing: { count: number; step: Vec3 }; // count 1 / step 0 when the asset is not repeated
}

export type ManifestAsset = PrimitiveAsset | MeshAsset;

const isVec3 = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number');

function parseManifest(json: unknown): Map<string, ManifestAsset> {
  const out = new Map<string, ManifestAsset>();
  const assets = (json as { assets?: unknown }).assets;
  if (!Array.isArray(assets)) throw new Error('[manifest] assets/dist/manifest.json: "assets" must be an array');
  assets.forEach((raw: unknown, i) => {
    const a = raw as Record<string, unknown>;
    const where = `[manifest] assets[${i}] "${String(a['name'])}"`;
    if (typeof a['name'] !== 'string') throw new Error(`[manifest] assets[${i}].name missing`);
    const name = a['name'];
    const collider = a['collider'] ?? 'trimesh';
    if (collider !== 'trimesh' && collider !== 'none') {
      throw new Error(`${where}: collider "${String(collider)}" not allowed (trimesh | none; box sinks — see check:physics)`);
    }
    if (a['kind'] === 'primitive') {
      if (a['shape'] !== 'box') throw new Error(`${where}: primitive shape must be "box"`);
      if (!isVec3(a['size'])) throw new Error(`${where}: size must be [x,y,z]`);
      out.set(name, { name, kind: 'primitive', shape: 'box', size: a['size'], collider });
    } else if (a['kind'] === 'mesh') {
      const bbox = a['bbox'] as { min?: unknown; max?: unknown } | undefined;
      const inst = a['instancing'] as { count?: unknown; step?: unknown } | undefined;
      if (typeof a['file'] !== 'string' || !a['file'].endsWith('.glb')) throw new Error(`${where}: file must be a .glb`);
      if (typeof a['triangles'] !== 'number' || typeof a['bytes'] !== 'number') throw new Error(`${where}: triangles/bytes missing`);
      if (!bbox || !isVec3(bbox.min) || !isVec3(bbox.max)) throw new Error(`${where}: bbox must be {min:[x,y,z], max:[x,y,z]}`);
      const count = inst?.count ?? 1;
      const step = inst?.step ?? [0, 0, 0];
      if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || !isVec3(step)) throw new Error(`${where}: bad instancing {count, step}`);
      out.set(name, {
        name, kind: 'mesh', file: a['file'], collider, triangles: a['triangles'], bytes: a['bytes'],
        bbox: { min: bbox.min, max: bbox.max }, instancing: { count, step },
      });
    } else {
      throw new Error(`${where}: kind "${String(a['kind'])}" unknown (primitive | mesh)`);
    }
  });
  return out;
}

export const MANIFEST = parseManifest(manifestJson);

export function manifestAsset(name: string, where: string): ManifestAsset {
  const a = MANIFEST.get(name);
  if (!a) throw new Error(`[level] ${where}: asset "${name}" is not in assets/dist/manifest.json`);
  return a;
}

// ---------- GLB loading ----------
export interface LoadedMesh {
  def: MeshAsset;
  geometry: THREE.BufferGeometry; // shared; owned by the cache, never disposed by a level
  material: THREE.Material;
}

const GLB_URLS = import.meta.glob<string>('../../assets/dist/*.glb', { query: '?url', import: 'default', eager: true });
const DECODERS = `${import.meta.env.BASE_URL}decoders/`;
const loaded = new Map<string, LoadedMesh>();
let gltf: GLTFLoader | null = null;

function loader(renderer: THREE.WebGLRenderer): GLTFLoader {
  if (gltf) return gltf;
  const draco = new DRACOLoader().setDecoderPath(`${DECODERS}draco/`);
  const ktx2 = new KTX2Loader().setTranscoderPath(`${DECODERS}basis/`).detectSupport(renderer);
  gltf = new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx2);
  return gltf;
}

async function loadMesh(def: MeshAsset, renderer: THREE.WebGLRenderer): Promise<LoadedMesh> {
  const url = GLB_URLS[`../../assets/dist/${def.file}`];
  if (!url) throw new Error(`[assets] ${def.name}: assets/dist/${def.file} is in the manifest but not on disk (run npm run assets)`);
  const g = await loader(renderer).loadAsync(url);
  const meshes: THREE.Mesh[] = [];
  g.scene.traverse((o) => {
    if (o instanceof THREE.Mesh) meshes.push(o);
  });
  const m = meshes[0];
  if (meshes.length !== 1 || !m) throw new Error(`[assets] ${def.name}: expected exactly 1 mesh (one repeat unit), found ${meshes.length}`);
  if (Array.isArray(m.material)) throw new Error(`[assets] ${def.name}: multi-material meshes are not supported`);
  const geometry = m.geometry;
  const tris = (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
  if (tris !== def.triangles) throw new Error(`[assets] ${def.name}: GLB has ${tris} triangles, manifest says ${def.triangles} — stale assets/dist?`);
  return { def, geometry, material: m.material };
}

/** Load every mesh asset `names` references (cached). Primitives need no loading. */
export async function preloadAssets(names: Iterable<string>, renderer: THREE.WebGLRenderer): Promise<void> {
  const want = [...new Set(names)]
    .map((n) => manifestAsset(n, 'preload'))
    .filter((a): a is MeshAsset => a.kind === 'mesh' && !loaded.has(a.name));
  const got = await Promise.all(want.map((a) => loadMesh(a, renderer)));
  for (const m of got) loaded.set(m.def.name, m);
}

export function loadedMesh(name: string, where: string): LoadedMesh {
  const m = loaded.get(name);
  if (!m) throw new Error(`[level] ${where}: mesh asset "${name}" was not preloaded (call preloadLevelAssets before buildLevel)`);
  return m;
}
