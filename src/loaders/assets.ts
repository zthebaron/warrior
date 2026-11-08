// glTF assets built by tools/build_assets.mjs (Draco geometry, KTX2 textures) -> decoded once,
// cached, then handed to buildLevel synchronously. Levels never load files themselves: call
// preloadAssets() first (main.ts does, on every load path), or buildLevel throws.
//
// Decoders come from the pinned three (vite.config.ts serves/emits them under /vendor/).

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

export const ASSET_LOADER_CONFIG = {
  dracoPath: '/vendor/draco/',
  basisPath: '/vendor/basis/',
};

/** A decoded glTF asset: render parts (geometry + material per primitive) and a collision soup. */
export interface LoadedAsset {
  name: string;
  parts: { geometry: THREE.BufferGeometry; material: THREE.Material }[];
  /** Collision triangles in asset-local space (the asset's collision mesh, else its visual mesh). */
  collision: { positions: Float32Array; indices: Uint32Array };
}

const URLS = import.meta.glob<string>('../../assets/dist/*.glb', { query: '?url', import: 'default' });
const cache = new Map<string, LoadedAsset>();
const pending = new Map<string, Promise<LoadedAsset>>();
let loader: GLTFLoader | null = null;

/** Once, at boot: KTX2 needs the renderer to pick a transcode target the GPU supports. */
export function configureAssetLoaders(renderer: THREE.WebGLRenderer): void {
  const draco = new DRACOLoader().setDecoderPath(ASSET_LOADER_CONFIG.dracoPath);
  const ktx2 = new KTX2Loader().setTranscoderPath(ASSET_LOADER_CONFIG.basisPath).detectSupport(renderer);
  loader = new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx2);
}

export function getLoadedAsset(name: string): LoadedAsset | undefined {
  return cache.get(name);
}

export async function preloadAssets(assets: { name: string; file: string; collisionMesh: string | null }[]): Promise<void> {
  await Promise.all(assets.map((a) => load(a.name, a.file, a.collisionMesh)));
}

function load(name: string, file: string, collisionMesh: string | null): Promise<LoadedAsset> {
  const hit = cache.get(name);
  if (hit) return Promise.resolve(hit);
  let p = pending.get(name);
  if (!p) {
    p = decode(name, file, collisionMesh).finally(() => pending.delete(name));
    pending.set(name, p);
  }
  return p;
}

async function decode(name: string, file: string, collisionMesh: string | null): Promise<LoadedAsset> {
  if (!loader) throw new Error('[assets] configureAssetLoaders(renderer) was not called at boot');
  const urlOf = URLS[`../../assets/dist/${file}`];
  if (!urlOf) throw new Error(`[assets] ${name}: assets/dist/${file} is not in the bundle — run npm run assets`);
  const gltf = await loader.loadAsync(await urlOf());
  gltf.scene.updateMatrixWorld(true);

  const parts: LoadedAsset['parts'] = [];
  const colPos: number[] = [];
  const colIdx: number[] = [];
  const visualSoup = { pos: [] as number[], idx: [] as number[] };
  const v = new THREE.Vector3();
  const addSoup = (mesh: THREE.Mesh, soup: { pos: number[]; idx: number[] }): void => {
    const g = mesh.geometry;
    const pos = g.getAttribute('position');
    const base = soup.pos.length / 3;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      soup.pos.push(v.x, v.y, v.z);
    }
    const index = g.getIndex();
    if (index) for (let i = 0; i < index.count; i++) soup.idx.push(base + index.getX(i));
    else for (let i = 0; i < pos.count; i++) soup.idx.push(base + i);
  };

  let sawCollision = false;
  gltf.scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    if (collisionMesh && (o.name === collisionMesh || o.geometry.name === collisionMesh || o.parent?.name === collisionMesh)) {
      sawCollision = true;
      addSoup(o, { pos: colPos, idx: colIdx });
      return; // never rendered
    }
    // bake the node transform into the geometry so instancing only adds the per-instance offset
    const geometry = (o.geometry as THREE.BufferGeometry).clone().applyMatrix4(o.matrixWorld);
    const materials = Array.isArray(o.material) ? o.material : [o.material];
    if (materials.length !== 1) throw new Error(`[assets] ${name}: multi-material meshes are not supported yet`);
    parts.push({ geometry, material: materials[0]! });
    addSoup(o, visualSoup);
  });
  if (collisionMesh && !sawCollision) throw new Error(`[assets] ${name}: manifest names collision mesh "${collisionMesh}" but the glb has none`);
  if (parts.length === 0) throw new Error(`[assets] ${name}: no renderable meshes`);

  const soup = sawCollision ? { pos: colPos, idx: colIdx } : visualSoup;
  const asset: LoadedAsset = { name, parts, collision: { positions: new Float32Array(soup.pos), indices: new Uint32Array(soup.idx) } };
  cache.set(name, asset);
  return asset;
}
