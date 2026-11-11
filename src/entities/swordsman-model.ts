// The swordsman as he is drawn (D-023). What he does is decided in src/systems/fight.ts; this file only shows
// it, and nothing here is read back by the simulation.
//
//   the figure    one skinned copy of the rigged swordsman a man (the asset is decoded once; three swordsmen
//                 are three skeletons over one geometry and one texture), on the paint layer like the warrior
//   the katana    a small rigid mesh on his right hand's bone. The figure was rigged empty-handed: a blade
//                 skinned to a hand bends, and one fused to the hand is the auto-rig's to misread
//                 (tools/gen/swordsman-input.mjs). So the blade's angle in the grip is a number here.
//   the clips     six (tools/gen/build-swordsman.mjs): idle, walk, close, slash, hit, death. The slash clip is
//                 not played at its own pace: the fight's wind-up, cut and recovery are each mapped onto
//                 their part of it, at the two marks the build measured, so what the player reads on screen
//                 is exactly the timing the rules run on, whatever FIGHT is tuned to.
//   the splatter  ink, never blood (the brief; STYLE §2 keeps colour to the torii). A hit throws a burst of
//                 ink off him. The hit that fells him turns the whole figure to ink as it drops, leaves a
//                 splat on the ground, and both fade to paper.
//
// Time comes only from the swordsman's own clocks, which the fixed tick advances: the pose is a function of the
// tick, so a harness frame cannot depend on how often a frame was drawn.
//
// Every number is in MEASUREMENTS.md "D-023 the swordsman".

import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

import { paint, paintLast, paintMaterial, PAINT_LAST } from '../engine/paint-layer';
import { ramp } from '../engine/palette';
import type { CharacterAsset } from '../loaders/character';
import { FIGHT, windupSec, type SwordsmanMode } from '../systems/fight';
import { SlashArc } from './slash';

type Clip = 'idle' | 'walk' | 'close' | 'slash' | 'hit' | 'death';
type V3 = readonly [number, number, number];

export const SWORDSMAN = {
  asset: 'swordsman_anim',
  /** m he stands: bare-headed, a little under the warrior's 1.9 with his hat */
  height: 1.8,
  /** The delivered model looks down +Z; a swordsman's forward is -Z, as the player's. */
  faceTurn: Math.PI,
  /** a change of clip is faded over this long */
  blendSec: 0.12,
  /** the slash clip: where the cut starts and ends in it, and its length, s (printed by build-swordsman.mjs) */
  slashMarks: { cutFrom: 0.433, cutTo: 0.667, seconds: 1.5 },
  /** a one-shot clip is never evaluated AT its end, which a looping action reads as its start */
  lastFrameShy: 1e-3,
  /** below this speed (m/s) he is standing, and shows the stance and not a stride */
  movingAbove: 0.2,
  /** the walk clips, played at this many times their own pace */
  walkRate: 1,
  closeRate: 1.3,
  katana: {
    blade: 0.74,         // m, guard to tip
    bladeWidth: 0.034,   // m, edge to back
    bladeThick: 0.012,   // m
    curve: 0.045,        // m the tip sits behind a straight line from the guard
    hilt: 0.25,          // m
    hiltWidth: 0.03,     // m
    guard: 0.045,        // m, radius
    guardThick: 0.012,   // m
    grip: 0.07,          // m from the guard back to the middle of the fist
    // Where it sits in the hand, given in the model's own frame as delivered and in its rest pose (a T-pose:
    // x his LEFT, y up, z the way he faces; his right arm lies along -x), then carried by the hand's bone.
    bladeDir: [0.1, 0.5, 0.86] as V3,   // up and forward out of the fist: a blade carried ready
    edgeDir: [0, -0.86, 0.5] as V3,     // the cutting edge turned down and forward
    inHand: [-0.07, -0.02, 0.02] as V3, // m from the hand joint (the wrist) to the middle of the fist
  },
  /** his own cut, as an ink stroke along the blade's path: the warrior's stroke, a little larger */
  arcScale: 1.15,
  fall: {
    inkBy: 0.3,      // s: by now the falling figure is all ink
    fadeFrom: 0.9,   // s: it starts to go ...
    fadeTo: 1.6,     // ... and is gone
  },
  burst: {
    seconds: 0.32,                 // a burst of ink thrown off him by a hit
    from: 0.5, to: 1.9,            // m across, as it opens
    hitShare: 0.6,                 // the burst of a hit that only staggers him, against the one that fells him
    height: 1.15,                  // m above his feet
    opacity: 0.9,
  },
  splat: {
    size: 2.6,       // m across, on the ground where he fell
    growSec: 0.2,    // it spreads over this long
    holdSec: 1.4,    // stays
    fadeSec: 1.6,    // and fades to paper
    opacity: 0.85,
  },
  /** the splatter's texture: one blot with a ragged edge and thrown droplets, the same every time */
  ink: { px: 128, lobes: 7, ragged: 0.28, blot: 0.42, droplets: 26, dropMin: 0.012, dropMax: 0.05, seed: 23 },
  /** rad: each swordsman's splatter is turned this much from the last one's (the golden angle: no two alike) */
  inkTurn: 2.399963,
  /** drawn after every card and the warrior's stroke, before the figures */
  order: 600,
};

const S = SWORDSMAN;
const CLIPS: readonly Clip[] = ['idle', 'walk', 'close', 'slash', 'hit', 'death'];

/** mulberry32, as the slash stroke's: the splatter is the same every time, not a noise that shimmers. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let inkTexture: THREE.DataTexture | null = null;
/** The splatter: white with the ink's shape in its alpha. Made once, on the first hit of the page. */
function splatterTexture(): THREE.DataTexture {
  if (inkTexture) return inkTexture;
  const I = S.ink, n = I.px, rand = seeded(I.seed);
  const lobes = Array.from({ length: I.lobes }, (_, k) => ({ k: k + 2, a: (I.ragged * rand()) / (k + 1), p: rand() * Math.PI * 2 }));
  const drops = Array.from({ length: I.droplets }, () => {
    const ang = rand() * Math.PI * 2, d = I.blot * (0.75 + 0.55 * rand()) + 0.04;
    return { x: 0.5 + Math.cos(ang) * d * 0.9, y: 0.5 + Math.sin(ang) * d * 0.9, r: I.dropMin + (I.dropMax - I.dropMin) * rand() * rand() };
  });
  const data = new Uint8Array(n * n * 4);
  const soft = 1.5 / n; // one and a half texels of edge
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = (x + 0.5) / n, v = (y + 0.5) / n, dx = u - 0.5, dy = v - 0.5;
    const ang = Math.atan2(dy, dx), d = Math.hypot(dx, dy);
    let edge = I.blot * 0.62;
    for (const l of lobes) edge *= 1 + l.a * Math.sin(l.k * ang + l.p);
    let a = Math.min(1, Math.max(0, (edge - d) / soft));
    for (const p of drops) a = Math.max(a, Math.min(1, Math.max(0, (p.r - Math.hypot(u - p.x, v - p.y)) / soft)));
    const i = (y * n + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = 255;
    data[i + 3] = Math.round(255 * a);
  }
  inkTexture = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  inkTexture.magFilter = inkTexture.minFilter = THREE.LinearFilter;
  inkTexture.needsUpdate = true;
  return inkTexture;
}

/** The katana: +Z from the guard to the tip, +Y toward its back, the hilt along -Z. One mesh, vertex colours. */
function katanaGeometry(): THREE.BufferGeometry {
  const K = S.katana;
  const tint = (g: THREE.BufferGeometry, c: number): THREE.BufferGeometry => {
    const col = new THREE.Color(c), n = g.getAttribute('position').count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([col.r, col.g, col.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g.index ? g.toNonIndexed() : g;
  };
  const blade = new THREE.BoxGeometry(K.bladeThick, K.bladeWidth, K.blade, 1, 1, 8);
  const bp = blade.getAttribute('position');
  for (let i = 0; i < bp.count; i++) {
    const t = bp.getZ(i) / K.blade + 0.5; // 0 at the guard, 1 at the tip
    const narrow = t > 0.86 ? 1 - (t - 0.86) / 0.14 : 1; // the last of it comes to a point
    bp.setXYZ(i, bp.getX(i) * narrow, bp.getY(i) * Math.max(0.08, narrow) + K.curve * t * t, t * K.blade);
  }
  const hilt = new THREE.BoxGeometry(K.hiltWidth * 0.8, K.hiltWidth, K.hilt).translate(0, 0, -K.hilt / 2);
  const guard = new THREE.CylinderGeometry(K.guard, K.guard, K.guardThick, 10).rotateX(Math.PI / 2);
  const parts = [tint(blade, ramp('wash-light')), tint(hilt, ramp('ink-black')), tint(guard, ramp('ink-deep'))];
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'color'] as const) {
    const all = new Float32Array(parts.reduce((n, p) => n + p.getAttribute(name).array.length, 0));
    let o = 0;
    for (const p of parts) { all.set(p.getAttribute(name).array as Float32Array, o); o += p.getAttribute(name).array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(all, 3));
  }
  for (const p of [blade, hilt, guard, ...parts]) p.dispose();
  return out;
}

interface Track { action: THREE.AnimationAction; duration: number; time: number; weight: number }

/** What the model is told once a fixed tick. */
export interface SwordsmanPose {
  mode: SwordsmanMode;
  /** seconds in the mode */
  modeTime: number;
  /** m/s over the ground this tick */
  speed: number;
  /** how many hits he has taken */
  hits: number;
}

export class SwordsmanModel {
  /** Feet at the origin, facing -Z. The owner places and turns it. */
  readonly root = new THREE.Group();
  private readonly mixer: THREE.AnimationMixer;
  private readonly tracks = new Map<Clip, Track>();
  private readonly figure: THREE.Object3D;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly katana: THREE.Mesh;
  private readonly katanaMaterial: THREE.MeshBasicMaterial;
  private readonly white = new THREE.Color(0xffffff);
  private readonly ink = new THREE.Color(ramp('ink-black'));
  private shown: Clip = 'idle';
  private pose: SwordsmanPose = { mode: 'guard', modeTime: 0, speed: 0, hits: 0 };
  /** seconds a stride has been walked, for the two walk loops; and seconds stood, for the stance */
  private stride = 0;
  private stood = 0;
  /** the hit that threw the last burst: seconds since it, and how large; null when there is none */
  private burstAge: number | null = null;
  private burstShare = 1;
  // made on first need, so a swordsman nobody has fought is the figure and the blade and nothing else
  private arc: SlashArc | null = null;
  private burst: THREE.Mesh | null = null;
  private splat: THREE.Mesh | null = null;

  constructor(asset: CharacterAsset, private readonly spin: number) {
    const figure = cloneSkinned(asset.scene);
    const size = asset.bounds.getSize(new THREE.Vector3());
    const k = S.height / size.y;
    figure.scale.multiplyScalar(k);
    figure.position.y -= asset.bounds.min.y * k; // feet on the ground
    const turned = new THREE.Group();
    turned.rotation.y = S.faceTurn;
    turned.add(figure);
    this.root.add(turned);
    this.figure = figure;

    // his own material: three swordsmen share one texture, and each fades alone
    let material: THREE.MeshBasicMaterial | null = null;
    figure.traverse((o) => {
      const mesh = o as THREE.SkinnedMesh;
      if (!mesh.isMesh) return;
      const map = (mesh.material as THREE.MeshBasicMaterial).map;
      if (!map) throw new Error(`[swordsman] ${asset.name}: "${mesh.name}" has no base colour texture`);
      material = paintMaterial({ map });
      mesh.material = material;
      paintLast(mesh);
      mesh.frustumCulled = false; // a skinned mesh's bounds are its rest pose
    });
    if (!material) throw new Error(`[swordsman] ${asset.name} has no mesh`);
    this.material = material;

    // the katana, placed against the rest pose (the copy is still in it: no clip has run) and then the hand's
    this.root.updateMatrixWorld(true);
    const hand = figure.getObjectByName('RightHand');
    if (!hand) throw new Error(`[swordsman] ${asset.name} has no "RightHand" bone`);
    const K = S.katana;
    this.katanaMaterial = paintMaterial({});
    this.katanaMaterial.vertexColors = true;
    this.katana = new THREE.Mesh(katanaGeometry(), this.katanaMaterial);
    this.katana.name = 'swordsman:katana';
    paintLast(this.katana);
    this.katana.frustumCulled = false;
    const z = new THREE.Vector3(...K.bladeDir).normalize();
    const y = new THREE.Vector3(...K.edgeDir).normalize().negate(); // the back of the blade is away from its edge
    const x = new THREE.Vector3().crossVectors(y, z).normalize();
    y.crossVectors(z, x); // square with the blade
    // the model's own frame -> the page's: the figure's root carries the fit and nothing else has turned yet
    const toWorld = new THREE.Matrix4().extractRotation(figure.matrixWorld);
    const basis = new THREE.Matrix4().makeBasis(x, y, z).premultiply(toWorld);
    const scale = figure.getWorldScale(new THREE.Vector3());
    const at = new THREE.Vector3().setFromMatrixPosition(hand.matrixWorld)
      .add(new THREE.Vector3(...K.inHand).multiply(scale).applyMatrix4(toWorld))
      .add(new THREE.Vector3(0, 0, K.grip).multiplyScalar(scale.y).applyMatrix4(basis));
    const world = basis.clone().scale(scale).setPosition(at);
    new THREE.Matrix4().copy(hand.matrixWorld).invert().multiply(world).decompose(this.katana.position, this.katana.quaternion, this.katana.scale);
    hand.add(this.katana);

    paint(this.root);

    this.mixer = new THREE.AnimationMixer(figure);
    for (const name of CLIPS) {
      const clip = asset.clips.get(name);
      if (!clip) throw new Error(`[swordsman] ${asset.name} has no "${name}" clip (it has: ${[...asset.clips.keys()].join(', ')})`);
      const action = this.mixer.clipAction(clip.clone());
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.enabled = true;
      action.setEffectiveWeight(0);
      action.play();
      this.tracks.set(name, { action, duration: clip.duration, time: 0, weight: name === 'idle' ? 1 : 0 });
    }
    this.apply();
  }

  /** As the level placed him: nothing thrown, nothing fallen. */
  reset(): void {
    for (const [name, t] of this.tracks) { t.weight = name === 'idle' ? 1 : 0; t.time = 0; }
    this.shown = 'idle';
    this.pose = { mode: 'guard', modeTime: 0, speed: 0, hits: 0 };
    this.stride = this.stood = 0;
    this.burstAge = null;
  }

  /** Once a fixed tick, after the swordsman has been stepped. Numbers only: nothing is drawn or evaluated. */
  tick(p: SwordsmanPose, dt: number): void {
    if (p.hits > this.pose.hits) { // a hit landed this tick
      this.burstAge = 0;
      this.burstShare = p.mode === 'fallen' ? 1 : S.burst.hitShare;
    } else if (this.burstAge !== null) {
      this.burstAge += dt;
      if (this.burstAge >= S.burst.seconds) this.burstAge = null;
    }
    this.pose = { ...p };
    const moving = p.speed > S.movingAbove;
    if (moving) this.stride += dt; else this.stood += dt;

    const M = S.slashMarks, F = FIGHT.swordsman;
    const share = (sec: number): number => Math.min(1, sec > 0 ? p.modeTime / sec : 1);
    let clip: Clip, time: number;
    switch (p.mode) {
      case 'windup': clip = 'slash'; time = share(windupSec()) * M.cutFrom; break;
      case 'slash': clip = 'slash'; time = M.cutFrom + share(F.slashSec) * (M.cutTo - M.cutFrom); break;
      case 'recover': clip = 'slash'; time = M.cutTo + share(F.recoverSec) * (M.seconds - M.cutTo); break;
      case 'stagger': clip = 'hit'; time = share(F.staggerSec) * this.tracks.get('hit')!.duration; break;
      case 'fallen': clip = 'death'; time = p.modeTime; break;
      case 'close': clip = moving ? 'close' : 'idle'; time = moving ? this.stride * S.closeRate : this.stood; break;
      case 'patrol': case 'return': clip = moving ? 'walk' : 'idle'; time = moving ? this.stride * S.walkRate : this.stood; break;
      default: clip = 'idle'; time = this.stood;
    }
    this.shown = clip;
    const step = S.blendSec > 0 ? dt / S.blendSec : 1;
    for (const [name, t] of this.tracks) {
      const wanted = name === clip;
      t.weight = Math.min(1, Math.max(0, t.weight + (wanted ? step : -step)));
      if (wanted) t.time = time;
    }
  }

  /** Hand the mixer every clip's weight and time, and evaluate. Changes no state. */
  private apply(): void {
    let sum = 0;
    for (const t of this.tracks.values()) sum += t.weight;
    for (const [name, t] of this.tracks) {
      const w = sum > 0 ? t.weight / sum : name === this.shown ? 1 : 0;
      t.action.setEffectiveWeight(w);
      if (w <= 0) continue;
      const loops = name === 'idle' || name === 'walk' || name === 'close';
      t.action.time = loops ? (t.duration > 0 ? t.time % t.duration : 0) : Math.min(t.time, t.duration - S.lastFrameShy);
    }
    this.mixer.update(0); // evaluate at the times just set; the mixer's own clock never runs
  }

  private inkMesh(name: string, opacity: number, flat: boolean): THREE.Mesh {
    const mat = paintMaterial({ map: splatterTexture(), color: ramp('ink-black'), opacity, wash: true, side: THREE.DoubleSide });
    if (flat) { // on the ground: kept above the floor it lies on without inventing a lift (as the landing mark is)
      mat.polygonOffset = true;
      mat.polygonOffsetFactor = -1;
      mat.polygonOffsetUnits = -1;
    }
    const mesh = paint(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat));
    mesh.name = name;
    mesh.renderOrder = Math.min(S.order, PAINT_LAST - 1);
    mesh.frustumCulled = false;
    mesh.visible = false;
    return mesh;
  }

  /** Draw him as the last tick left him. Call once a render frame, after the camera has been placed. */
  render(camera: THREE.Camera): void {
    const p = this.pose, fallen = p.mode === 'fallen';
    // --- the figure: falling, it turns to ink and then goes ---
    const F = S.fall;
    const inked = fallen ? Math.min(1, p.modeTime / F.inkBy) : 0;
    const gone = fallen ? Math.min(1, Math.max(0, (p.modeTime - F.fadeFrom) / (F.fadeTo - F.fadeFrom))) : 0;
    for (const m of [this.material, this.katanaMaterial]) {
      m.color.copy(this.white).lerp(this.ink, inked);
      m.opacity = 1 - gone;
      m.blending = gone > 0 ? THREE.NormalBlending : THREE.NoBlending; // solid until it starts to go (paintLast)
    }
    this.figure.visible = gone < 1;
    if (this.figure.visible) this.apply();

    // --- his cut: an ink stroke where the blade passes ---
    const cutting = p.mode === 'slash' || p.mode === 'recover';
    if (cutting && !this.arc) {
      this.arc = new SlashArc();
      this.arc.mesh.scale.setScalar(S.arcScale);
      this.arc.mesh.position.y = S.height / 2; // the stroke is measured from a body's centre, as the warrior's is
      this.root.add(this.arc.mesh);
    }
    if (this.arc) {
      // the warrior's stroke runs on his slash's clock; this one runs on the same clock, fed from the fight's
      const W = FIGHT.warrior, Fs = FIGHT.swordsman;
      const t = p.mode === 'slash' ? W.cutFrom + Math.min(1, p.modeTime / Fs.slashSec) * (W.cutTo - W.cutFrom)
        : p.mode === 'recover' ? W.cutTo + p.modeTime : null;
      this.arc.update(t !== null && t < W.slashSec ? t : null, camera);
    }

    // --- ink thrown by a hit ---
    if (this.burstAge !== null && !this.burst) {
      this.burst = this.inkMesh('swordsman:burst', S.burst.opacity, false);
      this.burst.position.y = S.burst.height;
      this.root.add(this.burst);
    }
    if (this.burst) {
      const b = this.burst;
      b.visible = this.burstAge !== null;
      if (b.visible) {
        const u = this.burstAge! / S.burst.seconds, open = 1 - (1 - u) * (1 - u);
        b.scale.setScalar((S.burst.from + (S.burst.to - S.burst.from) * open) * this.burstShare);
        (b.material as THREE.MeshBasicMaterial).opacity = S.burst.opacity * (1 - u * u);
        // face the camera: the root is turned, so the camera's turn is taken in the root's own frame
        this.root.updateWorldMatrix(true, false);
        b.quaternion.copy(this.root.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(camera.quaternion);
        b.rotateZ(this.spin);
      }
    }

    // --- the splat where he fell ---
    if (fallen && !this.splat) {
      this.splat = this.inkMesh('swordsman:splat', S.splat.opacity, true);
      this.splat.rotation.set(-Math.PI / 2, 0, this.spin);
      this.root.add(this.splat);
    }
    if (this.splat) {
      const P = S.splat, t = p.modeTime;
      const fade = Math.min(1, Math.max(0, (t - P.growSec - P.holdSec) / P.fadeSec));
      this.splat.visible = fallen && fade < 1;
      if (this.splat.visible) {
        const g = Math.min(1, t / P.growSec);
        this.splat.scale.setScalar(P.size * (1 - (1 - g) * (1 - g)));
        (this.splat.material as THREE.MeshBasicMaterial).opacity = P.opacity * (1 - fade);
      }
    }
  }

  /** Harness: every clip's name and length. */
  clips(): { name: string; duration: number }[] {
    return [...this.tracks].map(([name, t]) => ({ name, duration: t.duration }));
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.material.dispose();
    this.katana.geometry.dispose();
    this.katanaMaterial.dispose();
    for (const m of [this.arc?.mesh, this.burst, this.splat]) {
      if (!m) continue;
      m.geometry.dispose();
      (m.material as THREE.MeshBasicMaterial).dispose();
      if (m === this.arc?.mesh) (m.material as THREE.MeshBasicMaterial).map?.dispose(); // the stroke's own dry-brush; the splatter's texture is shared
    }
  }
}
