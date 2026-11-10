// Rigged characters (D-020): a GLB with a skeleton and named clips, loaded WHOLE. The kit path
// (src/loaders/assets.ts) bakes every node transform into cloned geometry, which is right for static dressing
// and destroys a skin; this keeps the scene graph, the skeleton and gltf.animations.
//
// A character GLB carries no colour the game trusts. Its materials are NAMES, and each name is replaced at
// load by an unlit fill from the palette (§1: zero lit materials; §2: nothing off the ramp but the robe and
// the accent). A material name that is not in FILLS is an error, not a default.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { ROBE, ramp } from '../engine/palette';

/** Material name in the GLB -> the fill it is drawn with. */
const FILLS: Record<string, () => number> = {
  robe: () => ROBE,                 // §2: the one named colour that is neither ramp nor accent
  ink: () => ramp('ink-black'),     // hat, sword, hair
  wash: () => ramp('wash-mid'),     // wraps, belt, the hat's underside
  paper: () => ramp('paper-cream'), // hands, face, feet
};

export interface CharacterAsset {
  name: string;
  /** Feet at the origin, facing -Z, 1 unit = 1 m. Not in any scene: one character, one instance. */
  scene: THREE.Group;
  clips: ReadonlyMap<string, THREE.AnimationClip>;
  triangles: number;
}

const URLS = import.meta.glob<string>('../../assets/char/*.glb', { query: '?url', import: 'default', eager: true });
const cache = new Map<string, CharacterAsset>();
const pending = new Map<string, Promise<CharacterAsset>>();

export function getCharacter(name: string): CharacterAsset | undefined {
  return cache.get(name);
}

/** Decode a character. Awaited before the first level is installed, so the player is never built without it. */
export function preloadCharacter(name: string): Promise<CharacterAsset> {
  const hit = cache.get(name);
  if (hit) return Promise.resolve(hit);
  let p = pending.get(name);
  if (!p) {
    p = decode(name).finally(() => pending.delete(name));
    pending.set(name, p);
  }
  return p;
}

async function decode(name: string): Promise<CharacterAsset> {
  const url = Object.entries(URLS).find(([path]) => path.endsWith(`/${name}.glb`))?.[1];
  if (!url) throw new Error(`[character] assets/char/${name}.glb is not in the bundle`);
  const gltf = await new GLTFLoader().loadAsync(url);
  const fills = new Map<string, THREE.MeshBasicMaterial>();
  let triangles = 0;
  gltf.scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (Array.isArray(mesh.material)) throw new Error(`[character] ${name}: "${mesh.name}" has several materials on one primitive`);
    const key = mesh.material.name;
    const fill = FILLS[key];
    if (!fill) throw new Error(`[character] ${name}: material "${key}" is not one of ${Object.keys(FILLS).join(', ')}`);
    let m = fills.get(key);
    if (!m) fills.set(key, (m = new THREE.MeshBasicMaterial({ color: fill(), name: key })));
    mesh.material.dispose();
    mesh.material = m;
    mesh.frustumCulled = false; // a skinned mesh's bounds are its rest pose; the figure is always near the camera
    const g = mesh.geometry;
    triangles += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
  });
  if (!gltf.animations.length) throw new Error(`[character] ${name}: no animation clips`);
  const asset: CharacterAsset = { name, scene: gltf.scene, clips: new Map(gltf.animations.map((c) => [c.name, c])), triangles };
  cache.set(name, asset);
  return asset;
}
