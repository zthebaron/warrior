// Mesh assets built by tools/assets/build.mjs (Draco geometry, KTX2 textures, KHR_materials_unlit)
// -> decoded once, cached, handed to buildLevel synchronously. Levels never load files themselves:
// buildLevel only accepts a PreparedLevel, which only `await prepareLevel(data)` produces (B-16).
//
// Decoders come from the pinned three (vite.config.ts serves/emits them under /vendor/).

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import paletteJson from '../../reference/palette.json';
import accentJson from '../../assets/src/accent.json';

export const ASSET_LOADER_CONFIG = {
  dracoPath: '/vendor/draco/',
  basisPath: '/vendor/basis/',
};

/** A decoded mesh asset: render parts (geometry + material per primitive) and a collision soup. */
export interface LoadedAsset {
  name: string;
  parts: { geometry: THREE.BufferGeometry; material: THREE.Material }[];
  /** Collision triangles in asset-local space (the visual mesh: kit assets are their own collider). */
  collision: { positions: Float32Array; indices: Uint32Array };
}

/** What KTX2Loader.detectSupport found on this renderer — the transcode target depends on it. */
export interface Ktx2Support {
  astc: boolean;
  etc1: boolean;
  etc2: boolean;
  dxt: boolean;
  bptc: boolean;
  pvrtc: boolean;
}

// ---- accent switch (D-001): the H2.5 feel test toggles the torii between candidates in place ----
// The palette texture holds a cell per candidate, laid out exactly as tools/blender/lib.py does it:
// ramp (reference/palette.json), then accent.json candidates, then must_fail fixtures; 8px cells in a
// 32x32 texture, 4 per row, row 0 at Blender's v=0 (glTF v = 1 - v). The shipped torii samples the
// DEFAULT candidate's cell; choosing another moves those UVs to the other cell at decode time.
const TEX = 32;
const CELL = 8;
const PER_ROW = TEX / CELL;
export const ACCENT_CELLS: string[] = [
  ...paletteJson.colors.map((c) => c.name.replace(/-/g, '_')),
  ...Object.keys(accentJson.candidates),
  ...Object.keys(accentJson.must_fail),
];
export const ACCENT_HEX: Record<string, string> = { ...accentJson.candidates, ...accentJson.must_fail };
export const ACCENT_DEFAULT: string = accentJson.default;
const cellUv = (name: string): [number, number] => {
  const i = ACCENT_CELLS.indexOf(name);
  if (i < 0) throw new Error(`[assets] no palette cell "${name}"`);
  return [((i % PER_ROW) * CELL + CELL / 2) / TEX, 1 - (Math.floor(i / PER_ROW) * CELL + CELL / 2) / TEX];
};
let accentChoice: string = ACCENT_DEFAULT;

/** Pick the accent candidate (or a must_fail fixture, for comparison) before assets decode. */
export function setAccent(name: string): void {
  if (!(name in ACCENT_HEX)) throw new Error(`[assets] ?accent=${name}: not in assets/src/accent.json (${Object.keys(ACCENT_HEX).join(', ')})`);
  if (cache.size && name !== accentChoice) throw new Error('[assets] setAccent after assets decoded — call it at boot');
  accentChoice = name;
}
export function getAccent(): string {
  return accentChoice;
}

function remapAccent(geometry: THREE.BufferGeometry): void {
  if (accentChoice === ACCENT_DEFAULT) return;
  const uv = geometry.getAttribute('uv');
  if (!uv) return;
  const [u0, v0] = cellUv(ACCENT_DEFAULT);
  const [u1, v1] = cellUv(accentChoice);
  const half = CELL / 2 / TEX;
  for (let i = 0; i < uv.count; i++) {
    if (Math.abs(uv.getX(i) - u0) < half && Math.abs(uv.getY(i) - v0) < half) uv.setXY(i, uv.getX(i) + u1 - u0, uv.getY(i) + v1 - v0);
  }
  uv.needsUpdate = true;
}

const URLS = import.meta.glob<string>('../../assets/dist/*.glb', { query: '?url', import: 'default' });
const cache = new Map<string, LoadedAsset>();
const pending = new Map<string, Promise<LoadedAsset>>();
let loader: GLTFLoader | null = null;
let ktx2Support: Ktx2Support | null = null;

/** Once, at boot: KTX2 needs the renderer to pick a transcode target the GPU supports. */
export function configureAssetLoaders(renderer: THREE.WebGLRenderer): void {
  const draco = new DRACOLoader().setDecoderPath(ASSET_LOADER_CONFIG.dracoPath);
  const ktx2 = new KTX2Loader().setTranscoderPath(ASSET_LOADER_CONFIG.basisPath).detectSupport(renderer);
  // workerConfig is populated by detectSupport; it is the loader's own record of what it may target
  const wc = (ktx2 as unknown as { workerConfig: Record<string, boolean> }).workerConfig;
  ktx2Support = {
    astc: !!wc['astcSupported'],
    etc1: !!wc['etc1Supported'],
    etc2: !!wc['etc2Supported'],
    dxt: !!wc['dxtSupported'],
    bptc: !!wc['bptcSupported'],
    pvrtc: !!wc['pvrtcSupported'],
  };
  loader = new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx2);
}

export function getKtx2Support(): Ktx2Support | null {
  return ktx2Support;
}

export function getLoadedAsset(name: string): LoadedAsset | undefined {
  return cache.get(name);
}

export async function preloadAssets(assets: { name: string; file: string }[]): Promise<void> {
  await Promise.all(assets.map((a) => load(a.name, a.file)));
}

function load(name: string, file: string): Promise<LoadedAsset> {
  const hit = cache.get(name);
  if (hit) return Promise.resolve(hit);
  let p = pending.get(name);
  if (!p) {
    p = decode(name, file).finally(() => pending.delete(name));
    pending.set(name, p);
  }
  return p;
}

async function decode(name: string, file: string): Promise<LoadedAsset> {
  if (!loader) throw new Error('[assets] configureAssetLoaders(renderer) was not called at boot');
  const urlOf = URLS[`../../assets/dist/${file}`];
  if (!urlOf) throw new Error(`[assets] ${name}: assets/dist/${file} is not in the bundle — run npm run assets:build`);
  const gltf = await loader.loadAsync(await urlOf());
  gltf.scene.updateMatrixWorld(true);

  const parts: LoadedAsset['parts'] = [];
  const pos: number[] = [];
  const idx: number[] = [];
  const v = new THREE.Vector3();
  gltf.scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    // bake the node transform into the geometry so a placement only adds its own transform
    const geometry = (o.geometry as THREE.BufferGeometry).clone().applyMatrix4(o.matrixWorld);
    remapAccent(geometry);
    const materials = Array.isArray(o.material) ? o.material : [o.material];
    if (materials.length !== 1) throw new Error(`[assets] ${name}: multi-material meshes are not supported`);
    // Palette texels ARE display colours (STYLE-BIBLE section 2): exempt from the renderer's ACES
    // tone mapping, which would pull every ramp value off the ramp.
    materials[0]!.toneMapped = false;
    parts.push({ geometry, material: materials[0]! });
    const p = geometry.getAttribute('position');
    const base = pos.length / 3;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      pos.push(v.x, v.y, v.z);
    }
    const index = geometry.getIndex();
    if (index) for (let i = 0; i < index.count; i++) idx.push(base + index.getX(i));
    else for (let i = 0; i < p.count; i++) idx.push(base + i);
  });
  if (parts.length === 0) throw new Error(`[assets] ${name}: no renderable meshes`);
  const asset: LoadedAsset = { name, parts, collision: { positions: new Float32Array(pos), indices: new Uint32Array(idx) } };
  cache.set(name, asset);
  return asset;
}
