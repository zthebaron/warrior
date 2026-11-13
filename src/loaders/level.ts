// Level loading: levels/<id>.json -> ajv (strict) validation against levels/level.schema.json
// -> build meshes + Rapier colliders. Any violation throws, naming the field. Nothing is
// skipped silently.

import type { LevelRef } from '../systems/progression';
import * as THREE from 'three';
import { Ajv, type ErrorObject } from 'ajv';
import type { RigidBody, Collider } from '@dimforge/rapier3d-compat';
import schema from '../../levels/level.schema.json';
import manifestJson from '../../assets/dist/manifest.json';
import manifestSchema from '../../assets/manifest.schema.json';
import paletteJson from '../../reference/palette.json';
import { ramp } from '../engine/palette';
import { RAPIER, type Physics, type Vec3Like } from '../engine/physics';
import { getLoadedAsset, preloadAssets } from './assets';
import { buildBackdrop, preloadBackdrop } from './backdrop';
import { buildCliffWall, type RockMass } from './cliff-wall';
import { COURTYARD, buildCourtyard, preloadCourtyard, type YardBox } from './courtyard';
import { DRIFT, buildDrift, buildDriftStone, type DriftTravel } from './drift';
import { buildPathWash, type WalkTop } from './path-wash';
import { SEAM, buildSeam, preloadSeam, type SeamBox, type SeamRock } from './seam';
import { preloadCharacter } from './character';
import { CHARACTER } from '../entities/character-model';
import { PAINT_LAYER } from '../engine/paint-layer';
import { patrolFraction, patrolPosition } from '../systems/patrol';
import { GATE, type EnemyDef } from '../systems/fight';
import { SWORDSMAN } from '../entities/swordsman-model';

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
  crow?: CrowDef; // patroller only: the timing cue keyed to this hazard's loop (Q2, Q5)
}

/**
 * The crow cue (Q2: "crow motion means WHEN"; Q5: chapter 1 carries it). A crow belongs to ONE
 * patroller and reads that patroller's loop fraction, the same `phase + t·speed` expression, so it
 * has no clock and no state of its own and replays stay deterministic (D-004, B-12). It never reads
 * the player. Every number is level data: none is invented here.
 *   perched  at `perch`, for loop fractions outside [lift, lift + away)
 *   lift-off at loop fraction `lift` it leaves the perch: the signal is the motion, never a colour
 *   away     for `away` of the loop it travels perch -> `to` -> perch, displacement sin(pi·u/away)
 */
export interface CrowDef {
  perch: Vec3;
  to: Vec3;
  size: Vec3;
  lift: number; // [0,1) loop fraction of lift-off
  away: number; // (0,1) fraction of the loop spent off the perch
}

export type Waypoint = Vec3 | { pos: Vec3; via: Move; platform?: string; note?: string; cue?: number };

export interface LevelData {
  id: string;
  title: string;
  chapter: number;
  palette: string;
  spawn: { pos: Vec3; facing: number };
  /** once_clear (D-026): arriving does not count while a swordsman of the level stands */
  goal: { type: 'reach'; pos: Vec3; radius?: number; once_clear?: boolean };
  bounds: { min: Vec3; max: Vec3 };
  fog?: { color?: string; near?: number; far?: number };
  geometry: Placement[];
  platforms?: PlatformDef[];
  hazards?: HazardDef[];
  /** D-023: swordsmen. Stateful, unlike a hazard: src/entities/swordsmen.ts owns them, not the level instance. */
  enemies?: EnemyDef[];
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
  /** D-020: absent = a kit asset; 'hero' = an imported painted model, always collider none, drawn on the paint layer */
  class?: 'hero';
  file: string;
  collider: 'trimesh' | 'none';
  triangles: number;
  draw_calls: number;
  materials: number;
  textures: { name: string; mime: string; width: number; height: number }[];
  bbox: { min: Vec3; max: Vec3 };
}

export type ManifestAsset = PrimitiveAsset | MeshAsset;

/**
 * D-018 (STYLE §1): the shipped look has NO lit material and NO light. Every surface is a flat unlit fill
 * of one §2 ramp step, named here, never a hex literal. Form comes from the §6 ink edge (src/engine/
 * ink-post.ts), not from shading. The greybox's own hues (blue platforms, green goal pad, blue checkpoint
 * pads, a red fall plane) were off the ramp and are gone; the fall plane is drawn only in the debug overlay.
 */
export const LEVEL_VISUAL = {
  // D-019: an undressed walkable box. The ink edge no longer outlines creases (it is silhouette-only), so a
  // box of one flat value would have no top at all, and READABLE_RISE is about seeing that there is ground
  // up there. Form from value (STYLE §4 Paths: lighter than the face beside them):
  //   top   mist-pale: one step off the paper sky at ANY distance (the post pass never pushes steps 0-1), so
  //         the extent of the ground reads by value even past 25u, where no line is drawn
  //   faces stone-mid: two steps below the top, darker still when near (the D-019 push)
  // A tag colours the TOP (goal pad, spawn pad): it marks ground, so it is a top value.
  topColor: ramp('mist-pale'),
  defaultColor: ramp('stone-mid'),
  // Only paper and mist are exempt from the near push, and a walkable top must never be pushed (it would put
  // camera-relative value bands on the ground). So anything that MARKS ground is paper on the mist ground:
  platformTopColor: ramp('paper-cream'), // a moving platform's top: distinct from static ground
  platformColor: ramp('stone-mid'),
  hazardColor: ramp('ink-deep'),    // patrollers and hazard volumes read as dark ink masses
  crowColor: ramp('ink-black'),     // a crow is never coloured (Q2), it signals by motion
  waterColor: ramp('mist-pale'),    // water is a flat wash (Q2c)
  tagColors: { goal_pad: ramp('paper-cream'), spawn: ramp('paper-cream') } as Record<string, number>, // pad TOPS
  checkpointColor: ramp('ink-grey'),
  checkpointSize: [1.2, 0.06, 1.2] as const,
  fallPlaneColor: ramp('ink-grey'), // debug overlay only
  fallPlaneOpacity: 0.15,
  pathLineColor: 0xffee00,          // debug overlay only (debugRoot, hidden unless the dev overlay is open)
  pathLiftY: 0.15, // draw the critical path slightly above the surface
  stepLegs: 0.5, // easing 'step' switches halfway
};

/**
 * CH1-ASSETS: `palette: "ink"` is a level whose art is the kit, not the greybox. RENDER ONLY — not
 * one collider changes: every prim_box keeps its trimesh collider exactly as under greybox and is
 * simply not drawn (its kit dressing, a collider-none placement over it, is). The directional sun
 * is not added (STYLE §1: no locatable light; kit materials are unlit anyway). Patroller and crow
 * draw their kit meshes in place of the cube, at the same pose and `size`, so the kill volume (an
 * AABB from `size`, never a mesh) is untouched. Checkpoint pads and the fall plane are greybox
 * debug colours, off the §2 ramp: the torii marks a checkpoint and the cloud sea is the boundary.
 * The background is paper-cream, read from palette.json, never retyped.
 */
export const INK = {
  palette: 'ink',
  patroller: 'kit_slide_stone',
  crow: 'kit_crow',
  background: 'paper-cream',
  // D-021 (B-46): collides exactly as placed and is NOT drawn. The painted cliff wall (cliff-wall.ts) is
  // built from these same placements and stands in front of them.
  collideOnly: ['kit_rock_mass'],
} as const;
/** Name prefix of the hidden mesh an undrawn collider keeps (D-021). */
export const UNDRAWN = 'undrawn:';
const isInk = (data: Pick<LevelData, 'palette'>): boolean => data.palette === INK.palette;
const inkBackground = (): number => {
  const c = paletteJson.colors.find((x) => x.name === INK.background);
  if (!c) throw new Error(`[level] palette.json has no "${INK.background}"`);
  return parseInt(c.hex.slice(1), 16);
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

// B-16: decoding mesh assets is async; building a level is sync. A level can only be BUILT from a
// PreparedLevel, and the only way to get one is `await prepareLevel(data)`, which decodes every mesh
// asset the level places. A load path that skips the decode is a TYPE ERROR (npm run typecheck, CI),
// not a runtime throw the first time a test level happens to place a mesh.
declare const PREPARED: unique symbol;
export type PreparedLevel = LevelData & { readonly [PREPARED]: true };

/** Decode every mesh asset the level places, then hand back a level that buildLevel accepts. */
export async function prepareLevel(data: LevelData): Promise<PreparedLevel> {
  const names = new Set(data.geometry.map((p) => p.asset));
  if (isInk(data) && (data.hazards ?? []).some((h) => h.type === 'patroller')) {
    names.add(INK.patroller);
    if ((data.hazards ?? []).some((h) => h.type === 'patroller' && h.crow)) names.add(INK.crow);
  }
  const meshes = [...names].map((n) => MANIFEST.get(n)).filter((a): a is MeshAsset => a?.kind === 'mesh');
  // D-020: the player's figure is decoded with the level, so no level is ever installed without it
  await Promise.all([
    preloadAssets(meshes.map((a) => ({ name: a.name, file: a.file, painted: a.class === 'hero' }))),
    isInk(data) ? preloadBackdrop() : null,
    isInk(data) && data.lighting?.ambienceZone === COURTYARD.zone ? preloadCourtyard() : null, // D-026: its own cards, for it alone
    isInk(data) && data.lighting?.ambienceZone === SEAM.zone ? preloadSeam() : null, // D-028: likewise
    isInk(data) && data.lighting?.ambienceZone === DRIFT.zone ? preloadSeam() : null, // D-029: the drift lays the seam's two cards
    preloadCharacter(CHARACTER.asset),
    // D-023: the swordsman is decoded only for a level that places one, so every other level loads what it did
    data.enemies?.length ? preloadCharacter(SWORDSMAN.asset) : null,
  ]);
  return data as PreparedLevel;
}

// ---------- loading ----------
const SOURCES = import.meta.glob<string>(['../../levels/*.json', '!../../levels/*.schema.json'], { query: '?raw', import: 'default' });

/** D-014 fix 3: every level's id and chapter, for progression (src/systems/progression.ts). Reads only
 *  those two fields; a level is still fully validated by parseLevel when it is actually loaded. */
let INDEX: Promise<LevelRef[]> | null = null;
export function levelIndex(): Promise<LevelRef[]> {
  INDEX ??= Promise.all(
    Object.entries(SOURCES).map(async ([key, loader]) => {
      const j = JSON.parse(await loader()) as { id?: unknown; chapter?: unknown };
      const id = typeof j.id === 'string' ? j.id : key.replace('../../levels/', '').replace('.json', '');
      return { id, chapter: typeof j.chapter === 'number' ? j.chapter : -1 };
    }),
  );
  return INDEX;
}

/** B-24: every level file's text exactly as this bundle carries it, keyed by file name (levels/<key>.json).
 *  The harness compares it byte for byte with levels/ on disk, so a stale bundle cannot pass silently. */
export async function bundledLevelSources(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [key, loader] of Object.entries(SOURCES)) out[key.replace('../../levels/', '').replace('.json', '')] = await loader();
  return out;
}

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
  /**
   * The kill plane: feet below this y is death (Q6 part 1). It is the HIGHEST of the fall plane and
   * any water plane (D-008), so no authored plane is silently ignored. null = no plane.
   */
  killPlaneY: number | null;
  /** Scene background for this level (INK: paper-cream), or null for the renderer's default. */
  background: number | null;
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
  /** Crow cues by hazard index at the last posed tick: perched or airborne (harness; the bot reads lift-off). */
  crows(): { index: number; airborne: boolean; pos: Vec3 }[];
  /** D-026: how many doors the level's gate has (placements tagged GATE.doorTag). 0: the level has no gate. */
  readonly doors: number;
  /**
   * D-026: the gate as it stands after this tick, 0 shut to 1 open (src/systems/fight.ts stepGate). The doors
   * collide until it is fully open. The level keeps no gate state of its own: src/main.ts tells it every tick.
   * snap: no swing is drawn between the last tick and this one (a level's start, a respawn).
   */
  setGate(share: number, snap?: boolean): void;
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
 * Where a patroller is in its loop at world time t: [0,1). Re-exported from src/systems/patrol.ts, which
 * holds the ONE definition: the patroller's position and its crow cue both derive from it.
 */
export const loopFraction = (path: Vec3[], speed: number, phase: number, t: number): number => patrolFraction(path, speed, phase, t);

/** Crow pose at world time t, from its patroller's loop (see CrowDef). Pure in t. */
export function crowAt(h: HazardDef, t: number, out: THREE.Vector3): { airborne: boolean } {
  const c = h.crow!;
  const u = (((loopFraction(h.path!, h.speed!, h.phase!, t) - c.lift) % 1) + 1) % 1;
  const airborne = u < c.away;
  const k = airborne ? Math.sin((Math.PI * u) / c.away) : 0;
  out.set(c.perch[0] + (c.to[0] - c.perch[0]) * k, c.perch[1] + (c.to[1] - c.perch[1]) * k, c.perch[2] + (c.to[2] - c.perch[2]) * k);
  return { airborne };
}

/** Patroller position at world time t, written into `out`. The motion itself lives in src/systems/patrol.ts. */
export function patrollerAt(path: Vec3[], speed: number, phase: number, t: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set(...patrolPosition(path, speed, phase, t));
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

export function buildLevel(data: PreparedLevel, physics: Physics): LevelInstance {
  const root = new THREE.Group();
  root.name = `level:${data.id}`;
  const debugRoot = new THREE.Group();
  const pickables: THREE.Object3D[] = [];
  const V = LEVEL_VISUAL;
  const matCache = new Map<number, THREE.MeshBasicMaterial>();
  const mat = (c: number): THREE.MeshBasicMaterial => { // D-018: unlit, flat, one ramp step
    let m = matCache.get(c);
    if (!m) matCache.set(c, (m = new THREE.MeshBasicMaterial({ color: c })));
    return m;
  };
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  // a walkable box: top face V.topColor, the other five the box's own value. Vertex colours on ONE unlit
  // material, so it is still one draw call per box (D-019).
  const walkMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const walkGeos = new Map<string, THREE.BoxGeometry>();
  const walkGeo = (topC: number, sideC: number): THREE.BoxGeometry => {
    const key = `${topC}:${sideC}`;
    let geo = walkGeos.get(key);
    if (!geo) {
      geo = new THREE.BoxGeometry(1, 1, 1);
      const top = new THREE.Color(topC), side = new THREE.Color(sideC), n = geo.getAttribute('normal');
      const col = new Float32Array(n.count * 3);
      for (let k = 0; k < n.count; k++) { const u = n.getY(k) > 0.5 ? top : side; col.set([u.r, u.g, u.b], k * 3); }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      walkGeos.set(key, geo);
    }
    return geo;
  };

  const ink = isInk(data);
  // D-026: an ink level in the courtyard is dressed by its boxes' tags (courtyard.ts), not by kit pieces
  const yardLook = ink && data.lighting?.ambienceZone === COURTYARD.zone;
  const yardBoxes: YardBox[] = [], doorBoxes: YardBox[] = [];
  // D-028: an ink level in the cliff seam has no dressing placed over its boxes: they are the rock, and seam.ts draws them
  const seamLook = ink && data.lighting?.ambienceZone === SEAM.zone;
  // D-029: an ink level in the drift is drawn from its own boxes too (drift.ts), and its moving stones with them
  const driftLook = ink && data.lighting?.ambienceZone === DRIFT.zone;
  const rockLook = seamLook || driftLook; // either way: every unturned box is drawn as rock, by its own loader
  const seamBoxes: SeamBox[] = [];
  const seamRocks: SeamRock[] = [];
  // a kit mesh drawn in place of a hazard cube (INK): same pose and scale, so `size` stays the volume
  const inkMesh = (name: string): THREE.Mesh => {
    const part = getLoadedAsset(name)?.parts[0];
    if (!part) throw new Error(`[level] "${name}" not decoded — buildLevel needs await prepareLevel(data) first`);
    const m = new THREE.Mesh(part.geometry, part.material);
    m.userData['sharedAsset'] = true;
    return m;
  };

  // no lights (D-018, STYLE §1): every material is unlit, so there is nothing for a light to do


  // static geometry: one fixed body, one collider per placement
  const fixed = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());

  // D-026: the gate's doors. Each is a collision box like any other, on the same fixed body, but its collider is
  // kept so it can be switched off while the gate stands open. Greybox: its box is drawn while it collides.
  const doors: { collider: Collider; mesh: THREE.Mesh | null }[] = [];
  let gatePrev = 0, gateCurr = 0;
  const rockMasses: RockMass[] = []; // D-021: ink levels' undrawn rock, for the painted wall
  const walkTops: WalkTop[] = [];    // D-021: ink levels' box tops, for the path's dry-brush
  // mesh placement: one THREE.Mesh per part (the kit is one part = one draw call) sharing the cached
  // geometry/material, and one trimesh collider built from the asset's own triangles
  const placeMesh = (a: MeshAsset, p: Placement, q: THREE.Quaternion, where: string): void => {
    const loaded = getLoadedAsset(a.name);
    if (!loaded) throw new Error(`[level] ${where}: asset "${a.name}" not decoded — buildLevel needs await prepareLevel(data) first`);
    const scale = scaleOf(p.scale);
    const undrawn = ink && (INK.collideOnly as readonly string[]).includes(a.name);
    if (undrawn) {
      // where the collision stands, for the painted wall: the soup's own bounds, placed (rotation about y only)
      const src = loaded.collision.positions;
      let frontZ = -Infinity, baseY = Infinity, topY = -Infinity, minX = Infinity, maxX = -Infinity;
      const v = new THREE.Vector3();
      for (let j = 0; j < src.length; j += 3) {
        v.set(src[j]! * scale.x, src[j + 1]! * scale.y, src[j + 2]! * scale.z).applyQuaternion(q);
        frontZ = Math.max(frontZ, v.z + p.pos[2]);
        baseY = Math.min(baseY, v.y + p.pos[1]);
        topY = Math.max(topY, v.y + p.pos[1]);
        minX = Math.min(minX, v.x + p.pos[0]);
        maxX = Math.max(maxX, v.x + p.pos[0]);
      }
      rockMasses.push({ x: p.pos[0], baseY, topY, frontZ, minX, maxX });
      if (rockLook) seamRocks.push({ positions: src, indices: loaded.collision.indices, matrix: new THREE.Matrix4().compose(new THREE.Vector3(...p.pos), q, scale) });
    }
    if (undrawn) {
      // Kept in the scene, never visible in the game: the harness shows it for the frame that tests the ink
      // pass alone (tools/harness/post.ts), and to ask whether the paint covers it (B-46).
      for (const part of loaded.drawn) {
        const mesh = new THREE.Mesh(part.geometry, part.material);
        mesh.name = `${UNDRAWN}${a.name}`;
        mesh.userData['sharedAsset'] = true;
        mesh.position.set(...p.pos);
        mesh.quaternion.copy(q);
        mesh.scale.copy(scale);
        mesh.visible = false;
        root.add(mesh);
      }
    }
    for (const part of undrawn ? [] : loaded.drawn) { // D-020: what the asset is drawn as (itself, or its skin); collision below is always its own
      const mesh = new THREE.Mesh(part.geometry, part.material);
      mesh.name = a.name;
      mesh.userData['sharedAsset'] = true; // owned by the asset cache: never dispose with the level
      mesh.position.set(...p.pos);
      mesh.quaternion.copy(q);
      mesh.scale.copy(scale);
      if (loaded.painted) mesh.layers.set(PAINT_LAYER); // D-020: drawn after the ink pass, with its own texture
      root.add(mesh);
      pickables.push(mesh);
    }
    const kind = p.collider ?? a.collider;
    if (a.class === 'hero' && kind !== 'none') throw new Error(`[level] ${where}: "${a.name}" is a hero asset and is placed with collider "${kind}": art never becomes collision`);
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
    const door = p.tag === GATE.doorTag; // D-026
    let boxMesh: THREE.Mesh | null = null;
    if (!ink) { // INK: the box is collision only; its collider-none kit dressing is what is drawn
      const mesh = new THREE.Mesh(walkGeo((p.tag && V.tagColors[p.tag]) || V.topColor, V.defaultColor), walkMat);
      mesh.position.set(...p.pos);
      mesh.quaternion.copy(q);
      mesh.scale.copy(size);
      root.add(mesh);
      pickables.push(mesh);
      boxMesh = mesh;
    }

    if (yardLook && p.tag && !(p.rot ?? []).some((v) => v !== 0)) {
      const b: YardBox = { x0: p.pos[0] - size.x / 2, x1: p.pos[0] + size.x / 2, y0: p.pos[1] - size.y / 2, y1: p.pos[1] + size.y / 2, z0: p.pos[2] - size.z / 2, z1: p.pos[2] + size.z / 2, tag: p.tag };
      (door ? doorBoxes : yardBoxes).push(b);
    }
    const kind = p.collider ?? a.collider;
    if (kind === 'none') {
      // D-028: in the seam every unturned box is drawn as rock, with or without a collider: READABLE_RISE counts a
      // render-only box as something that hides a top (B-23), and a box an ink level did not draw would not
      if (rockLook && !(p.rot ?? []).some((v) => v !== 0)) seamBoxes.push({ x0: p.pos[0] - size.x / 2, x1: p.pos[0] + size.x / 2, y0: p.pos[1] - size.y / 2, y1: p.pos[1] + size.y / 2, z0: p.pos[2] - size.z / 2, z1: p.pos[2] + size.z / 2 });
      if (door) throw new Error(`[level] geometry[${i}]: a "${GATE.doorTag}" is what stands in the gateway while the gate is shut: it needs a collider`);
      return;
    }
    // D-021: a top a player can stand on is brushed (an unturned box only: a turned one has no level top).
    // D-026: a door is not ground: nothing is brushed onto the top of it.
    if (ink && !door && !(p.rot ?? []).some((v) => v !== 0)) {
      walkTops.push({ x0: p.pos[0] - size.x / 2, x1: p.pos[0] + size.x / 2, z0: p.pos[2] - size.z / 2, z1: p.pos[2] + size.z / 2, y: p.pos[1] + size.y / 2 });
      if (rockLook) seamBoxes.push({ x0: p.pos[0] - size.x / 2, x1: p.pos[0] + size.x / 2, y0: p.pos[1] - size.y / 2, y1: p.pos[1] + size.y / 2, z0: p.pos[2] - size.z / 2, z1: p.pos[2] + size.z / 2 });
    }
    const desc = colliderDesc(kind, size, `geometry[${i}]`);
    desc.setTranslation(...p.pos).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    const collider = physics.world.createCollider(desc, fixed);
    if (door) doors.push({ collider, mesh: boxMesh });
  });

  // moving platforms
  const stones: { dispose(): void }[] = [];
  const travels: DriftTravel[] = [];
  const platforms: PlatformInstance[] = (data.platforms ?? []).map((def, i) => {
    const a = asset(def.asset, `platforms[${i}]`);
    if (a.kind !== 'primitive') throw new Error(`[level] platforms[${i}]: "${a.name}" is a ${a.kind} asset — moving platforms are primitive-only for now`);
    const size = new THREE.Vector3(...a.size);
    const start = pointOnPath(def.path, platformParam(def, 0), new THREE.Vector3());
    const body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(start.x, start.y, start.z));
    const kind = def.collider ?? a.collider;
    if (kind === 'none') throw new Error(`[level] platforms[${i}]: a platform needs a collider`);
    const collider = physics.world.createCollider(colliderDesc(kind, size, `platforms[${i}]`), body);
    // D-029: in the drift a moving stone is drawn as one (drift.ts): the same slab, at its own size, in the ink pass
    const stone = driftLook ? buildDriftStone(size) : null;
    if (stone) stones.push(stone);
    const mesh = stone ? stone.mesh : new THREE.Mesh(walkGeo(V.platformTopColor, V.platformColor), walkMat);
    mesh.userData['translates'] = 'platform'; // NOT #18: a moving platform is the `platform` move (Q2), not ambience
    if (!stone) mesh.scale.copy(size);
    travels.push({ from: def.path[0]!, to: def.path[def.path.length - 1]!, size: a.size });
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
    const mesh = ink && isPatroller ? inkMesh(INK.patroller) : new THREE.Mesh(boxGeo, mat(def.type === 'water' ? V.waterColor : V.hazardColor));
    mesh.userData['translates'] = 'hazard'; // NOT #18 (Q2a): hazards may translate
    mesh.scale.set(...def.size);
    mesh.position.copy(start);
    root.add(mesh);
    volumes.push({ index, def, half: new THREE.Vector3(...def.size).multiplyScalar(0.5), prev: start.clone(), curr: start.clone(), mesh });
  });

  // crow cues: render-only (no collider, never pickable, never a kill volume). Ink-black, never the
  // accent (Q2: vermilion is torii-only), so the crow can signal through motion alone.
  interface CrowInstance { index: number; def: HazardDef; prev: THREE.Vector3; curr: THREE.Vector3; airborne: boolean; mesh: THREE.Mesh }
  const crows: CrowInstance[] = [];
  (data.hazards ?? []).forEach((def, index) => {
    if (def.type !== 'patroller' || !def.crow) return;
    const start = new THREE.Vector3();
    const { airborne } = crowAt(def, 0, start);
    const mesh = ink ? inkMesh(INK.crow) : new THREE.Mesh(boxGeo, mat(V.crowColor));
    mesh.name = 'crow';
    mesh.userData['translates'] = 'hazard'; // the patroller's own timing cue (Q2, Q2a), not an ambient crow
    mesh.scale.set(...def.crow.size);
    mesh.position.copy(start);
    root.add(mesh);
    crows.push({ index, def, prev: start.clone(), curr: start.clone(), airborne, mesh });
  });

  // checkpoints (visual only; INK: the torii is the marker, the greybox pad colour is off-ramp)
  if (!ink) for (const c of data.checkpoints) {
    const m = new THREE.Mesh(boxGeo, mat(V.checkpointColor));
    m.scale.set(...V.checkpointSize);
    m.position.set(c.pos[0], c.pos[1] + V.checkpointSize[1] / 2, c.pos[2]);
    root.add(m);
  }

  // fall plane (visual)
  const fall = (data.hazards ?? []).find((h) => h.type === 'fall');
  const fallY = fall?.y ?? null;
  // water as a plane (D-008): a still flat wash at y; below it is death, like fall. Drawn as an
  // opaque flat fill in palette mist-pale: no reflection, no animation (Q2c, STYLE §9.8).
  const waterYs = (data.hazards ?? []).filter((h) => h.type === 'water' && typeof h.y === 'number' && !h.pos).map((h) => h.y!);
  for (const y of waterYs) {
    const { min, max } = data.bounds;
    const wash = new THREE.Mesh(new THREE.PlaneGeometry(max[0] - min[0], max[2] - min[2]), new THREE.MeshBasicMaterial({ color: V.waterColor, side: THREE.DoubleSide }));
    wash.rotation.x = -Math.PI / 2;
    wash.position.set((min[0] + max[0]) / 2, y, (min[2] + max[2]) / 2);
    root.add(wash);
  }
  const planes = [...(fallY !== null ? [fallY] : []), ...waterYs];
  const killPlaneY = planes.length ? Math.max(...planes) : null;
  if (fallY !== null && !ink) { // INK: the cloud sea (kit_cloud_band) is the boundary; the plane is unchanged
    const { min, max } = data.bounds;
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(max[0] - min[0], max[2] - min[2]),
      new THREE.MeshBasicMaterial({ color: V.fallPlaneColor, transparent: true, opacity: V.fallPlaneOpacity, side: THREE.DoubleSide }),
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.set((min[0] + max[0]) / 2, fallY, (min[2] + max[2]) / 2);
    debugRoot.add(plane); // D-018: debug overlay only, never the shipped look
  }

  // critical path (debug)
  const pts = data.critical_path.map((w) => {
    const p = waypointPos(w);
    return new THREE.Vector3(p[0], p[1] + V.pathLiftY, p[2]);
  });
  debugRoot.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: V.pathLineColor, depthTest: false })));

  const byHandle = new Map<number, PlatformInstance>(platforms.map((p) => [p.collider.handle, p]));

  // D-020: an ink level's far field is painted (paint layer), under root so it leaves with the level
  const backdrop = ink ? buildBackdrop(data.bounds, Math.min(...data.critical_path.map((w) => waypointPos(w)[1])), yardLook ? [] : seamLook ? SEAM.cliffs : driftLook ? DRIFT.cliffs : undefined, driftLook ? DRIFT.mist : undefined) : null;
  if (backdrop) root.add(backdrop.root);
  // D-021: the near rock is painted too, from the placements that collide and are not drawn
  const cliffWall = ink && rockMasses.length ? buildCliffWall(rockMasses, driftLook) : null; // D-029: the drift's wall keeps its paintings' proportion
  if (cliffWall) root.add(cliffWall.root);
  const pathWash = ink && !yardLook && walkTops.length ? buildPathWash(walkTops) : null; // the yard's floor is flags, not a brushed path
  if (pathWash) root.add(pathWash.root);
  const courtyard = yardLook ? buildCourtyard(yardBoxes, doorBoxes) : null;
  if (courtyard) root.add(courtyard.root);
  const seam = seamLook ? buildSeam(seamBoxes, seamRocks) : null; // D-028
  if (seam) root.add(seam.root);
  const drift = driftLook ? buildDrift(seamBoxes, seamRocks, travels) : null; // D-029
  if (drift) root.add(drift.root);

  return {
    data,
    root,
    debugRoot,
    pickables,
    killPlaneY,
    background: ink ? inkBackground() : null,
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
      for (const c of crows) {
        crowAt(c.def, t - dt, c.prev);
        c.airborne = crowAt(c.def, t, c.curr).airborne;
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
      for (const c of crows) c.mesh.position.lerpVectors(c.prev, c.curr, alpha);
      if (courtyard && doors.length) courtyard.setGate(gatePrev + (gateCurr - gatePrev) * alpha);
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
    crows() {
      return crows.map((c) => ({ index: c.index, airborne: c.airborne, pos: [c.curr.x, c.curr.y, c.curr.z] }));
    },
    doors: doors.length,
    setGate(share, snap = false) {
      gatePrev = snap ? share : gateCurr;
      gateCurr = share;
      const shut = share < 1; // the doors stand in the gateway until the leaves have swung right back
      for (const d of doors) {
        if (d.collider.isEnabled() !== shut) d.collider.setEnabled(shut);
        if (d.mesh) d.mesh.visible = shut; // greybox: the box is the door
      }
      if (snap) courtyard?.setGate(share);
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
      for (const geo of walkGeos.values()) geo.dispose();
      walkMat.dispose();
      for (const m of matCache.values()) m.dispose();
      backdrop?.dispose();
      cliffWall?.dispose();
      pathWash?.dispose();
      courtyard?.dispose();
      seam?.dispose();
      drift?.dispose();
      for (const st of stones) st.dispose();
    },
  };
}
