// Rigged characters (D-020): a GLB with a skeleton and named clips, loaded WHOLE. The kit path
// (src/loaders/assets.ts) bakes every node transform into cloned geometry, which is right for static dressing
// and destroys a skin; this keeps the scene graph, the skeleton and gltf.animations.
//
// A character is a painted thing: it keeps its own texture, takes the paint material (unlit, §1; the paper's
// grain, §6) and is drawn on the paint layer, after the ink pass. Its file is assets/char/<name>.glb, imported
// from assets/hero by `npm run assets:build` (unlit, base colour only, chroma capped, KTX2; skin and clips as
// delivered) and held by assets:budget.

import * as THREE from 'three';

import { PAINT_LAYER, paintMaterial } from '../engine/paint-layer';
import { assetLoader } from './assets';

export interface CharacterAsset {
  name: string;
  /** As delivered: its own scale, origin and facing. CharacterModel fits it to the player. One instance. */
  scene: THREE.Group;
  /** The delivered clips by name, plus `rest`: the bind pose, held. */
  clips: ReadonlyMap<string, THREE.AnimationClip>;
  /** The rest pose's bounds in the scene's own units, skin applied. */
  bounds: THREE.Box3;
  triangles: number;
}

const URLS = import.meta.glob<string>('../../assets/char/*.glb', { query: '?url', import: 'default', eager: true });
const cache = new Map<string, CharacterAsset>();
const pending = new Map<string, Promise<CharacterAsset>>();

export function getCharacter(name: string): CharacterAsset | undefined {
  return cache.get(name);
}

/** Decode a character. Awaited with every level (prepareLevel), so the player is never built without it. */
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
  if (!url) throw new Error(`[character] assets/char/${name}.glb is not in the bundle: run npm run assets:build`);
  const gltf = await assetLoader().loadAsync(url);
  let triangles = 0;
  const rest: THREE.KeyframeTrack[] = [];
  gltf.scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  gltf.scene.traverse((o) => {
    if ((o as THREE.Bone).isBone) {
      // the pose the file was delivered in, as a clip: what `idle` holds until an idle clip exists
      rest.push(
        new THREE.VectorKeyframeTrack(`${o.name}.position`, [0], o.position.toArray()),
        new THREE.QuaternionKeyframeTrack(`${o.name}.quaternion`, [0], o.quaternion.toArray()),
        new THREE.VectorKeyframeTrack(`${o.name}.scale`, [0], o.scale.toArray()),
      );
    }
    const mesh = o as THREE.SkinnedMesh;
    if (!mesh.isMesh) return;
    if (Array.isArray(mesh.material)) throw new Error(`[character] ${name}: "${mesh.name}" has several materials on one primitive`);
    const map = (mesh.material as THREE.MeshBasicMaterial).map;
    if (!map) throw new Error(`[character] ${name}: "${mesh.name}" has no base colour texture`);
    mesh.material.dispose();
    mesh.material = paintMaterial({ map });
    mesh.layers.set(PAINT_LAYER);
    mesh.frustumCulled = false; // a skinned mesh's bounds are its rest pose; the figure is always near the camera
    const g = mesh.geometry;
    triangles += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    if (mesh.isSkinnedMesh) mesh.skeleton.update();
    bounds.union(new THREE.Box3().setFromObject(mesh, true));
  });
  if (!rest.length) throw new Error(`[character] ${name}: no skeleton`);
  const clips = new Map(gltf.animations.map((c) => [c.name, c]));
  clips.set('rest', new THREE.AnimationClip('rest', 1, rest));
  const asset: CharacterAsset = { name, scene: gltf.scene, clips, bounds, triangles };
  cache.set(name, asset);
  return asset;
}
