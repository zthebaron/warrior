// Level loading: levels/<id>.json -> ajv (strict) validation against levels/level.schema.json
// -> build meshes + Rapier colliders. Any violation throws, naming the field. Nothing is
// skipped silently.

import * as THREE from 'three';
import { Ajv, type ErrorObject } from 'ajv';
import type { RigidBody, Collider } from '@dimforge/rapier3d-compat';
import schema from '../../levels/level.schema.json';
import manifestJson from '../../assets/dist/manifest.json';
import manifestSchema from '../../assets/manifest.schema.json';
import { RAPIER, type Physics, type Vec3Like } from '../engine/physics';
import { getLoadedAsset, preloadAssets } from './assets';

// ---------- types (mirror levels/level.schema.json; ajv is the source of truth) ----------
export type Vec3 = [number, number, number];
export type Move = 'ground' | 'jump' | 'double' | 'dash' | 'dashjump' | 'wall' | 'climb' | 'platform';
export type ColliderKind = 'trimesh' | 'capsule' | 'sphere' | 'none'; // no 'box' — see schema + check:physics FLOOR SINK

export interface Placement {
  asset: string;
  pos: Vec3;
  rot?: Vec3; // degrees, XYZ Euler
  scale?: number | Vec3;
  collider?: ColliderKind;
  tag?: string;
}

export interface PlatformDef {
  id?: string;
  asset: string;
  path: Vec3[];
  duration: number; // seconds per leg
  easing?: 'linear' | 'sine' | 'ease-in-out' | 'step';
  loop?: 'pingpong' | 'cycle' | 'once';
  collider?: ColliderKind;
  startDelay?: number;
}

export interface HazardDef {
  type: 'fall' | 'spike' | 'crush' | 'water' | 'patroller';
  y?: number;
  pos?: Vec3;
  size?: Vec3;
  period?: number;
  path?: Vec3[];  // patroller (schema makes path/speed/phase mandatory for it)
  speed?: number; // patroller, u/s
  phase?: number; // patroller, [0,1)
}

export type Waypoint = Vec3 | { pos: Vec3; via: Move; platform?: string; note?: string };

export interface LevelData {
  id: string;
  title: string;
  chapter: number;
  palette: string;
  spawn: { pos: Vec3; facing: number };
  goal: { type: 'reach'; pos: Vec3; radius?: number };
  bounds: { min: Vec3; max: Vec3 };
  fog?: { color?: string; near?: number; far?: number };
  geometry: Placement[];
  platforms?: PlatformDef[];
  hazards?: HazardDef[];
  checkpoints: { pos: Vec3; facing?: number }[];
  lighting?: { preset?: string; ambienceZone?: string };
  cameras?: unknown[];
  critical_path: Waypoint[];
  difficulty: number;
}

// mirror assets/manifest.schema.json (ajv is the source of truth; the manifest is a build output)
export interface PrimitiveAsset {
  name: string;
  kind: 'primitive';
  shape: 'box';
  size: Vec3;
  collider: 'trimesh' | 'none';
}

/** A compressed glb from tools/assets/build.mjs. Only the fields the loader uses are typed. */
export interface MeshAsset {
  name: string;
  kind: 'mesh';
  file: string;
  collider: 'trimesh' | 'none';
  triangles: number;
  draw_calls: number;
  materials: number;
  textures: { name: string; mime: string; width: number; height: number }[];
  bbox: { min: Vec3; max: Vec3 };
}

export type ManifestAsset = PrimitiveAsset | MeshAsset;

export const LEVEL_VISUAL = {
  defaultColor: 0xb8b2a6,
  platformColor: 0x8fa3b8,
  hazardColor: 0x2a2622,   // greybox: patrollers and hazard volumes read as dark ink masses
  tagColors: { goal_pad: 0x3fd08f, spawn: 0xd9c27a, test: 0xa89a8a } as Record<string, number>,
  checkpointColor: 0x6fb3ff,
  checkpointSize: [1.2, 0.06, 1.2] as const,
  fallPlaneColor: 0xff3030,
  fallPlaneOpacity: 0.15,
  pathLineColor: 0xffee00,
  pathLiftY: 0.15, // draw the critical path slightly above the surface
  hemiSky: 0xdfe8f0,
  hemiGround: 0x5a5248,
  hemiIntensity: 0.9,
  sunColor: 0xffffff,
  // Greybox light only: an engine constant, never level data (STYLE §1 forbids a locatable light;
  // the ink shader replaces this). [50,135] is what 00-gym carried, so the goldens do not move.
  greyboxSunAngleDeg: [50, 135] as const, // [elevation, azimuth]
  greyboxSunIntensity: 1.6,
  sunDistance: 100,
  stepLegs: 0.5, // easing 'step' switches halfway
};

const DEG2RAD = Math.PI / 180;

// ---------- validation ----------
export class LevelValidationError extends Error {
  constructor(source: string, details: string[]) {
    super(`LEVEL INVALID: ${source}\n${details.map((d) => `  - ${d}`).join('\n')}`);
    this.name = 'LevelValidationError';
  }
}

const ajv = new Ajv({ strict: true, allErrors: true });
const validateLevel = ajv.compile<LevelData>(schema);

function describe(e: ErrorObject): string {
  const params: Record<string, unknown> = e.params;
  const field = e.instancePath === '' ? '(root)' : e.instancePath;
  let detail = e.message ?? 'invalid';
  if (e.keyword === 'additionalProperties') detail += ` — unexpected "${String(params['additionalProperty'])}"`;
  if (e.keyword === 'enum') detail += ` ${JSON.stringify(params['allowedValues'])}`;
  return `field ${field}: ${detail}`;
}

/** Parse + validate raw JSON text. Throws LevelValidationError naming every bad field. */
export function parseLevel(text: string, source: string): LevelData {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new LevelValidationError(source, [`malformed JSON: ${err instanceof Error ? err.message : String(err)}`]);
  }
  if (!validateLevel(raw)) {
    throw new LevelValidationError(source, (validateLevel.errors ?? []).map(describe));
  }
  return raw;
}

const validateManifest = ajv.compile<{ assets: ManifestAsset[] }>(manifestSchema);

function parseManifest(json: unknown): Map<string, ManifestAsset> {
  if (!validateManifest(json)) {
    throw new Error(`[manifest] assets/dist/manifest.json fails assets/manifest.schema.json:\n${(validateManifest.errors ?? []).map(describe).join('\n')}`);
  }
  return new Map(json.assets.map((a) => [a.name, a]));
}

export const MANIFEST = parseManifest(manifestJson);

/** Decode every mesh asset the level places. Must complete before buildLevel(data). */
export async function preloadLevelAssets(data: LevelData): Promise<void> {
  const names = new Set(data.geometry.map((p) => p.asset));
  const meshes = [...names].map((n) => MANIFEST.get(n)).filter((a): a is MeshAsset => a?.kind === 'mesh');
  await preloadAssets(meshes.map((a) => ({ name: a.name, file: a.file })));
}

// ---------- loading ----------
const SOURCES = import.meta.glob<string>(['../../levels/*.json', '!../../levels/*.schema.json'], { query: '?raw', import: 'default' });

export async function loadLevel(id: string): Promise<LevelData> {
  const key = `../../levels/${id}.json`;
  const loader = SOURCES[key];
  if (!loader) {
    const have = Object.keys(SOURCES).map((k) => k.replace('../../levels/', '').replace('.json', ''));
    throw new Error(`[level] no level "${id}" — available: ${have.join(', ')}`);
  }
  return parseLevel(await loader(), `levels/${id}.json`);
}

/** Dev only: read the file fresh from disk via the dev server (bypasses the module cache). */
export async function fetchLevelFresh(id: string): Promise<LevelData> {
  const res = await fetch(`/levels/${id}.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`[level] fetch levels/${id}.json failed: HTTP ${res.status}`);
  return parseLevel(await res.text(), `levels/${id}.json`);
}

export function waypointPos(w: Waypoint): Vec3 {
  return Array.isArray(w) ? w : w.pos;
}

// ---------- building ----------
interface PlatformInstance {
  def: PlatformDef;
  body: RigidBody;
  collider: Collider;
  mesh: THREE.Mesh;
  // prev/curr are a per-tick cache derived from the world clock (render interpolation and the
  // carry delta). Neither is authoritative: both are recomputed from t every tick (B-12, D-004).
  prev: THREE.Vector3;
  curr: THREE.Vector3;
  delta: THREE.Vector3;
}

export interface LevelInstance {
  data: LevelData;
  root: THREE.Group;
  /** Debug-only visuals (critical path line). */
  debugRoot: THREE.Group;
  /** Meshes for ray picking (teleport-to-cursor). */
  pickables: THREE.Object3D[];
  fallY: number | null;
  /**
   * Pose every moving thing (platforms, patrollers) at world time `t`. Pure in t: nothing moving
   * keeps state of its own, so a level's motion is fully determined by the clock (B-12, Q6 part 4).
   * Call once per fixed tick, before the player moves.
   */
  fixedUpdate(t: number, dt: number): void;
  /** Pose at world time t AND place kinematic bodies there immediately (respawn at a chosen tick). */
  snapTo(t: number, dt: number): void;
  /** Interpolate visuals between the last two posed ticks. */
  render(alpha: number): void;
  /**
   * Index of the hazard whose volume the player's capsule box overlaps at the last posed tick, or
   * -1. Q6 part 1: touching a hazard is death, exactly like falling. Fall planes are not volumes.
   */
  hazardHit(feet: Vec3Like, radius: number, height: number): number;
  /** Per-tick displacement of a platform collider, or null if it is not a platform. */
  platformDelta(collider: Collider): Vec3Like | null;
  /** Current platform centres by id (debug / harness). */
  platformPositions(): { id: string; pos: Vec3 }[];
  /** Current hazard-volume centres by hazard index (debug / harness; PHASE_SWEEP reads these). */
  hazardPositions(): { index: number; type: HazardDef['type']; pos: Vec3 }[];
  dispose(): void;
}

function scaleOf(scale: Placement['scale']): THREE.Vector3 {
  if (typeof scale === 'number') return new THREE.Vector3(scale, scale, scale);
  return scale ? new THREE.Vector3(...scale) : new THREE.Vector3(1, 1, 1);
}

function sizeOf(asset: PrimitiveAsset, scale: Placement['scale']): THREE.Vector3 {
  const s = new THREE.Vector3(...asset.size);
  if (typeof scale === 'number') s.multiplyScalar(scale);
  else if (scale) s.multiply(new THREE.Vector3(...scale));
  return s;
}

function asset(name: string, where: string): ManifestAsset {
  const a = MANIFEST.get(name);
  if (!a) throw new Error(`[level] ${where}: asset "${name}" is not in assets/dist/manifest.json`);
  return a;
}

function ease(kind: PlatformDef['easing'], u: number): number {
  switch (kind ?? 'linear') {
    case 'sine': return (1 - Math.cos(Math.PI * u)) / 2;
    case 'ease-in-out': return u * u * (3 - 2 * u);
    case 'step': return u < LEVEL_VISUAL.stepLegs ? 0 : 1;
    default: return u;
  }
}

/**
 * Patroller position at world time t: a pure function of (path, speed, phase, t), with no stored
 * state. It ping-pongs along the polyline at `speed` u/s; one loop (out and back) is 2·length, and
 * `phase` is the start offset as a fraction of that loop (OQ-012).
 */
export function patrollerAt(path: Vec3[], speed: number, phase: number, t: number, out: THREE.Vector3): THREE.Vector3 {
  const lens = path.slice(1).map((b, i) => Math.hypot(b[0] - path[i]![0], b[1] - path[i]![1], b[2] - path[i]![2]));
  const total = lens.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return out.set(...path[0]!);
  const s = (((phase + (t * speed) / (2 * total)) % 1) + 1) % 1; // [0,1) around the loop
  let d = s < 0.5 ? s * 2 * total : (1 - s) * 2 * total; // distance from path[0]
  for (let i = 0; i < lens.length; i++) {
    const len = lens[i]!;
    if (d <= len || i === lens.length - 1) {
      const a = path[i]!, b = path[i + 1]!;
      const u = len > 0 ? Math.min(d / len, 1) : 0;
      return out.set(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u);
    }
    d -= len;
  }
  return out.set(...path[0]!);
}

function pointOnPath(path: Vec3[], u: number, out: THREE.Vector3): THREE.Vector3 {
  const segs = path.length - 1;
  const f = THREE.MathUtils.clamp(u, 0, 1) * segs;
  const i = Math.min(Math.floor(f), segs - 1);
  const a = path[i];
  const b = path[i + 1];
  if (!a || !b) throw new Error('[level] platform path needs >= 2 points');
  return out.set(...a).lerp(new THREE.Vector3(...b), f - i);
}

function platformParam(def: PlatformDef, time: number): number {
  const t = Math.max(0, time - (def.startDelay ?? 0));
  const phase = t / def.duration;
  switch (def.loop ?? 'pingpong') {
    case 'pingpong': {
      const leg = Math.floor(phase);
      const u = phase - leg;
      return leg % 2 === 0 ? u : 1 - u;
    }
    case 'cycle': return phase - Math.floor(phase);
    case 'once': return Math.min(phase, 1);
  }
}

/**
 * Trimesh collider for a primitive box of `size`. Cuboid colliders are banned by the schema:
 * with the verified KCC (snapToGround 0.5) a standing capsule sinks through them
 * (npm run check:physics, FLOOR SINK).
 */
function colliderDesc(kind: ColliderKind, size: THREE.Vector3, where: string): InstanceType<typeof RAPIER.ColliderDesc> {
  if (kind !== 'trimesh') throw new Error(`[level] ${where}: collider "${kind}" not supported yet (trimesh only)`);
  const g = new THREE.BoxGeometry(size.x, size.y, size.z);
  const index = g.getIndex();
  if (!index) throw new Error(`[level] ${where}: trimesh needs indexed geometry`);
  const desc = RAPIER.ColliderDesc.trimesh(new Float32Array(g.getAttribute('position').array), new Uint32Array(index.array));
  g.dispose();
  return desc;
}

export function buildLevel(data: LevelData, physics: Physics): LevelInstance {
  const root = new THREE.Group();
  root.name = `level:${data.id}`;
  const debugRoot = new THREE.Group();
  const pickables: THREE.Object3D[] = [];
  const V = LEVEL_VISUAL;
  const matCache = new Map<number, THREE.MeshStandardMaterial>();
  const mat = (c: number): THREE.MeshStandardMaterial => {
    let m = matCache.get(c);
    if (!m) matCache.set(c, (m = new THREE.MeshStandardMaterial({ color: c })));
    return m;
  };
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);

  // lighting
  const sun = V.greyboxSunAngleDeg;
  const [elev, azim] = [sun[0] * DEG2RAD, sun[1] * DEG2RAD];
  const dir = new THREE.DirectionalLight(V.sunColor, V.greyboxSunIntensity);
  dir.position.set(Math.cos(elev) * Math.sin(azim), Math.sin(elev), Math.cos(elev) * Math.cos(azim)).multiplyScalar(V.sunDistance);
  root.add(new THREE.HemisphereLight(V.hemiSky, V.hemiGround, V.hemiIntensity), dir);

  // static geometry: one fixed body, one collider per placement
  const fixed = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());

  // mesh placement: one THREE.Mesh per part (the kit is one part = one draw call) sharing the cached
  // geometry/material, and one trimesh collider built from the asset's own triangles
  const placeMesh = (a: MeshAsset, p: Placement, q: THREE.Quaternion, where: string): void => {
    const loaded = getLoadedAsset(a.name);
    if (!loaded) throw new Error(`[level] ${where}: asset "${a.name}" not preloaded — call preloadLevelAssets(data) before buildLevel`);
    const scale = scaleOf(p.scale);
    for (const part of loaded.parts) {
      const mesh = new THREE.Mesh(part.geometry, part.material);
      mesh.name = a.name;
      mesh.userData['sharedAsset'] = true; // owned by the asset cache: never dispose with the level
      mesh.position.set(...p.pos);
      mesh.quaternion.copy(q);
      mesh.scale.copy(scale);
      root.add(mesh);
      pickables.push(mesh);
    }
    const kind = p.collider ?? a.collider;
    if (kind === 'none') return;
    if (kind !== 'trimesh') throw new Error(`[level] ${where}: collider "${kind}" not supported (trimesh only)`);
    const src = loaded.collision.positions;
    const verts = new Float32Array(src.length);
    for (let j = 0; j < src.length; j += 3) {
      verts[j] = src[j]! * scale.x;
      verts[j + 1] = src[j + 1]! * scale.y;
      verts[j + 2] = src[j + 2]! * scale.z;
    }
    const desc = RAPIER.ColliderDesc.trimesh(verts, loaded.collision.indices).setTranslation(...p.pos).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    physics.world.createCollider(desc, fixed);
  };

  data.geometry.forEach((p, i) => {
    const a = asset(p.asset, `geometry[${i}]`);
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler((p.rot?.[0] ?? 0) * DEG2RAD, (p.rot?.[1] ?? 0) * DEG2RAD, (p.rot?.[2] ?? 0) * DEG2RAD),
    );
    if (a.kind === 'mesh') {
      placeMesh(a, p, q, `geometry[${i}]`);
      return;
    }
    const size = sizeOf(a, p.scale);
    const mesh = new THREE.Mesh(boxGeo, mat((p.tag && V.tagColors[p.tag]) || V.defaultColor));
    mesh.position.set(...p.pos);
    mesh.quaternion.copy(q);
    mesh.scale.copy(size);
    root.add(mesh);
    pickables.push(mesh);

    const kind = p.collider ?? a.collider;
    if (kind === 'none') return;
    const desc = colliderDesc(kind, size, `geometry[${i}]`);
    desc.setTranslation(...p.pos).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    physics.world.createCollider(desc, fixed);
  });

  // moving platforms
  const platforms: PlatformInstance[] = (data.platforms ?? []).map((def, i) => {
    const a = asset(def.asset, `platforms[${i}]`);
    if (a.kind !== 'primitive') throw new Error(`[level] platforms[${i}]: "${a.name}" is a ${a.kind} asset — moving platforms are primitive-only for now`);
    const size = new THREE.Vector3(...a.size);
    const start = pointOnPath(def.path, platformParam(def, 0), new THREE.Vector3());
    const body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(start.x, start.y, start.z));
    const kind = def.collider ?? a.collider;
    if (kind === 'none') throw new Error(`[level] platforms[${i}]: a platform needs a collider`);
    const collider = physics.world.createCollider(colliderDesc(kind, size, `platforms[${i}]`), body);
    const mesh = new THREE.Mesh(boxGeo, mat(V.platformColor));
    mesh.scale.copy(size);
    mesh.position.copy(start);
    root.add(mesh);
    pickables.push(mesh);
    return { def, body, collider, mesh, prev: start.clone(), curr: start.clone(), delta: new THREE.Vector3() };
  });

  // hazard volumes: patrollers (moving, posed from the clock) and static boxes (pos + size)
  interface HazardVolume { index: number; def: HazardDef; half: THREE.Vector3; prev: THREE.Vector3; curr: THREE.Vector3; mesh: THREE.Mesh }
  const volumes: HazardVolume[] = [];
  (data.hazards ?? []).forEach((def, index) => {
    if (def.type === 'fall' || !def.size) return;
    const isPatroller = def.type === 'patroller';
    if (!isPatroller && !def.pos) return;
    const start = isPatroller ? patrollerAt(def.path!, def.speed!, def.phase!, 0, new THREE.Vector3()) : new THREE.Vector3(...def.pos!);
    const mesh = new THREE.Mesh(boxGeo, mat(V.hazardColor));
    mesh.scale.set(...def.size);
    mesh.position.copy(start);
    root.add(mesh);
    volumes.push({ index, def, half: new THREE.Vector3(...def.size).multiplyScalar(0.5), prev: start.clone(), curr: start.clone(), mesh });
  });

  // checkpoints (visual only)
  for (const c of data.checkpoints) {
    const m = new THREE.Mesh(boxGeo, mat(V.checkpointColor));
    m.scale.set(...V.checkpointSize);
    m.position.set(c.pos[0], c.pos[1] + V.checkpointSize[1] / 2, c.pos[2]);
    root.add(m);
  }

  // fall plane (visual)
  const fall = (data.hazards ?? []).find((h) => h.type === 'fall');
  const fallY = fall?.y ?? null;
  if (fallY !== null) {
    const { min, max } = data.bounds;
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(max[0] - min[0], max[2] - min[2]),
      new THREE.MeshBasicMaterial({ color: V.fallPlaneColor, transparent: true, opacity: V.fallPlaneOpacity, side: THREE.DoubleSide }),
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.set((min[0] + max[0]) / 2, fallY, (min[2] + max[2]) / 2);
    root.add(plane);
  }

  // critical path (debug)
  const pts = data.critical_path.map((w) => {
    const p = waypointPos(w);
    return new THREE.Vector3(p[0], p[1] + V.pathLiftY, p[2]);
  });
  debugRoot.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: V.pathLineColor, depthTest: false })));

  const byHandle = new Map<number, PlatformInstance>(platforms.map((p) => [p.collider.handle, p]));

  return {
    data,
    root,
    debugRoot,
    pickables,
    fallY,
    fixedUpdate(t, dt) {
      for (const p of platforms) {
        pointOnPath(p.def.path, ease(p.def.easing, platformParam(p.def, t - dt)), p.prev);
        pointOnPath(p.def.path, ease(p.def.easing, platformParam(p.def, t)), p.curr);
        p.delta.subVectors(p.curr, p.prev);
        p.body.setNextKinematicTranslation(p.curr);
      }
      for (const h of volumes) {
        if (h.def.type !== 'patroller') continue;
        patrollerAt(h.def.path!, h.def.speed!, h.def.phase!, t - dt, h.prev);
        patrollerAt(h.def.path!, h.def.speed!, h.def.phase!, t, h.curr);
      }
    },
    snapTo(t, dt) {
      this.fixedUpdate(t, dt);
      for (const p of platforms) p.body.setTranslation(p.curr, true);
      physics.syncColliders();
    },
    render(alpha) {
      for (const p of platforms) p.mesh.position.lerpVectors(p.prev, p.curr, alpha);
      for (const h of volumes) h.mesh.position.lerpVectors(h.prev, h.curr, alpha);
    },
    hazardHit(feet, radius, height) {
      for (const h of volumes) {
        const c = h.curr, e = h.half;
        if (feet.x + radius > c.x - e.x && feet.x - radius < c.x + e.x &&
            feet.z + radius > c.z - e.z && feet.z - radius < c.z + e.z &&
            feet.y + height > c.y - e.y && feet.y < c.y + e.y) return h.index;
      }
      return -1;
    },
    platformDelta(collider) {
      return byHandle.get(collider.handle)?.delta ?? null;
    },
    platformPositions() {
      return platforms.map((p, i) => ({ id: p.def.id ?? `platforms[${i}]`, pos: [p.curr.x, p.curr.y, p.curr.z] }));
    },
    hazardPositions() {
      return volumes.map((h) => ({ index: h.index, type: h.def.type, pos: [h.curr.x, h.curr.y, h.curr.z] }));
    },
    dispose() {
      physics.removeBody(fixed);
      for (const p of platforms) physics.removeBody(p.body);
      root.removeFromParent();
      debugRoot.removeFromParent();
      root.traverse((o) => {
        if (o instanceof THREE.Mesh && o.geometry !== boxGeo && !o.userData['sharedAsset']) o.geometry.dispose();
      });
      boxGeo.dispose();
      for (const m of matCache.values()) m.dispose();
    },
  };
}
