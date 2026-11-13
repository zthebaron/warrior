// The courtyard of Tim's painting (D-026): what an ink level whose ambience zone is `courtyard` is drawn as.
//
// Chapter 1's look is rock: kit ledges over the boxes, a painted cliff wall, a dry-brushed path. A walled yard has
// none of those, so its boxes are dressed here instead, straight from the level's own placements by their tags:
//
//   causeway, yard, landing   a stone floor: paper on top, stone on its faces (ink pass), and over the top the
//                             painted flagstones (paint layer, as the path's dry-brush is laid in chapter 1)
//   wall                      a plastered wall: a flat fill, paler on the side the light is (ink pass), a painted
//                             wash of stains on its two long faces, and a tiled cap along its top
//   gate_door                 two leaves on hinges in the doorway, swung by the gate's own state (D-026)
//
//   gate_frame (a pair)       the way in: two tall posts, drawn as timber, and a beam across them far overhead
//
// The far gate itself is not drawn here: it is the hero asset `gate` (a painted model, placed by the level as
// any hero asset is), and the boxes tagged gate_post are its posts' collision and nothing more. The way in is
// ink and not that model, because a painted thing may not stand in front of a torii (D-020: paint hides no
// accent), and the checkpoint torii is just inside it.
//
// RENDER ONLY. Not one collider is made or changed here: every box above collides exactly as src/loaders/level.ts
// built it, and is simply drawn as what it stands for. Nothing here translates: a leaf turns about its hinge.
// Every number is in MEASUREMENTS.md "D-026 the courtyard's look".

import * as THREE from 'three';

import { paint, paintMaterial } from '../engine/paint-layer';
import { ramp, type RampName } from '../engine/palette';

type Vec3 = [number, number, number];

export const COURTYARD = {
  /** `lighting.ambienceZone` of a level drawn this way */
  zone: 'courtyard',
  floorTags: ['causeway', 'yard', 'landing'],
  wallTags: ['wall'],
  frameTag: 'gate_frame',
  /** the way in: a beam across its two posts: how far under the post tops it hangs, its depth, how far past them it runs; a tie under it (m) */
  frame: { beamDrop: 0.5, beam: 0.45, past: 0.9, tieDrop: 1.5, tie: 0.3, timber: 'stone-mid' },
  yardTag: 'yard',
  // ramp steps (STYLE §2). A wall is a flat fill (§4 Buildings); the side the light is on is paper.
  floor: { top: 'paper-cream', side: 'wash-mid' },
  // The ink pass is kept to pale, simple forms: the post gate reads the dark edge of a dark form as a drawn line
  // (D-019), so the darks of this place, its tiles, stains and joints, are laid on by the paint layer instead.
  // outer: a side wall's face toward the mist is plaster in the light, the paper's own tone. end: the faces that
  // look back down the way in, and on past the far gate, are a step down, so that the walls stand against the sky.
  wall: { lit: 'paper-cream', shade: 'mist-pale', near: 'paper-cream', outer: 'paper-cream', end: 'mist-pale', top: 'wash-light' },
  /** the tiled cap along a wall: how far it overhangs each face, how high its ridge stands, its eave's depth (m) */
  cap: { overhang: 0.4, rise: 0.75, eave: 0.14, slope: 'wash-light', under: 'wash-mid' },
  // ---- the paint layer (cards from tools/art/courtyard-cards.mjs, in assets/courtyard) ----
  /** flagstones over every floor top: the card covers this many metres before it repeats; how much of its ink is laid */
  flags: { card: 'yard_flags', metres: 16, ink: 0.9 },
  /** stains on a wall's long faces: the card covers this many metres of wall; one card for the lit face, one for the rest */
  plaster: { lit: 'yard_plaster_lit', shade: 'yard_plaster_shade', metres: 12, ink: 0.9 },
  /** tile rows on every roof slope: the card covers this many metres along the roof */
  tiles: { card: 'yard_tiles', metres: 4, ink: 0.85 },
  // What stands beyond the walls: the painting's own mountains and pines, five times round the yard, each on
  // an arc of a cylinder about the yard's centre. bearing: degrees from +x (the way in) toward +z; radius, top y,
  // height: m; arc: degrees; ink; mirrored. The first faces the way in, with the painting's valley behind the gate
  // and its two mountains rising over the far wall to either side of it, as the painting has them.
  far: {
    card: 'yard_far', radius: 70, topY: 21, height: 27, arc: 72, segments: 16,
    arcs: [[0, 0.85, false], [72, 0.7, true], [144, 0.6, false], [216, 0.6, true], [288, 0.7, false]] as [number, number, boolean][],
  },
  // The sky's rose wash, low over the mountains: the same three arcs, farther out.
  sky: { card: 'yard_sky', radius: 300, baseY: 12, height: 62, arc: 120, segments: 16, ink: 1, arcs: [0, 120, 240] },
  /** draw order on the paint layer: the sky before the far ring's own layers (0 up), the mountains after its mist, then the yard's washes */
  order: { sky: -10, far: 90, flags: 110, plaster: 120, tiles: 130 },
  /** a door leaf: thickness (m), the height it reaches (under the gate model's tie beam), how far it swings (degrees), its fill */
  leaf: { thick: 0.14, top: 4.15, openDeg: 100, fill: 'stone-mid', planks: 'yard_tiles', plankMetres: 4, ink: 0.8, order: 140 },
} as const;

/** A level placement this file dresses: a collision box, by its corners, and its tag. */
export interface YardBox { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number; tag: string }

const col = (name: RampName): THREE.Color => new THREE.Color(ramp(name));

/** Triangles with one flat colour each, gathered into one geometry. */
class Flats {
  private readonly pos: number[] = [];
  private readonly rgb: number[] = [];
  /** A quad a-b-c-d, counter-clockwise seen from its front. */
  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, c0: THREE.Color): void {
    this.tri(a, b, c, c0);
    this.tri(a, c, d, c0);
  }
  tri(a: Vec3, b: Vec3, c: Vec3, c0: THREE.Color): void {
    this.pos.push(...a, ...b, ...c);
    for (let k = 0; k < 3; k++) this.rgb.push(c0.r, c0.g, c0.b);
  }
  /** An axis-aligned box; `face` gives each face's colour by its outward normal. */
  box(b: Omit<YardBox, 'tag'>, face: (n: Vec3) => THREE.Color): void {
    const { x0, x1, y0, y1, z0, z1 } = b;
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], face([1, 0, 0]));
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], face([-1, 0, 0]));
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], face([0, 1, 0]));
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], face([0, -1, 0]));
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], face([0, 0, 1]));
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], face([0, 0, -1]));
  }
  /**
   * A roof: a ridge along one axis from `a0` to `a1`, centred at `mid` on the other, `half` wide each side, from
   * `eaveY` up to `ridgeY`, with an eave board `eave` deep. along: 'x' or 'z'.
   */
  roof(along: 'x' | 'z', a0: number, a1: number, mid: number, half: number, eaveY: number, ridgeY: number, eave: number, slope: THREE.Color, under: THREE.Color): void {
    const p = (a: number, u: number, y: number): Vec3 => (along === 'x' ? [a, y, mid + u] : [mid + u, y, a]);
    // for a ridge along z the cross axis is x, and the winding flips with it
    const q = (a: Vec3, b: Vec3, c: Vec3, d: Vec3, c0: THREE.Color): void => (along === 'x' ? this.quad(a, b, c, d, c0) : this.quad(d, c, b, a, c0));
    const t = (a: Vec3, b: Vec3, c: Vec3, c0: THREE.Color): void => (along === 'x' ? this.tri(a, b, c, c0) : this.tri(c, b, a, c0));
    const lo = eaveY - eave;
    q(p(a0, half, eaveY), p(a1, half, eaveY), p(a1, 0, ridgeY), p(a0, 0, ridgeY), slope);     // the +u slope
    q(p(a1, -half, eaveY), p(a0, -half, eaveY), p(a0, 0, ridgeY), p(a1, 0, ridgeY), slope);   // the -u slope
    q(p(a0, half, lo), p(a1, half, lo), p(a1, half, eaveY), p(a0, half, eaveY), slope);       // eave boards: the slope's own value
    q(p(a1, -half, lo), p(a0, -half, lo), p(a0, -half, eaveY), p(a1, -half, eaveY), slope);
    q(p(a0, -half, lo), p(a1, -half, lo), p(a1, half, lo), p(a0, half, lo), under);           // underside
    for (const [a, flip] of [[a0, false], [a1, true]] as const) {                             // the two gable ends
      const A = p(a, -half, lo), B = p(a, half, lo), C = p(a, half, eaveY), D = p(a, 0, ridgeY), E = p(a, -half, eaveY);
      if (flip) { t(A, B, C, under); t(A, C, D, under); t(A, D, E, under); }
      else { t(C, B, A, under); t(D, C, A, under); t(E, D, A, under); }
    }
  }
  geometry(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.rgb, 3));
    geo.computeVertexNormals();
    return geo;
  }
}

const URLS = import.meta.glob<string>('../../assets/courtyard/*.png', { query: '?url', import: 'default', eager: true });
const textures = new Map<string, THREE.Texture>();
const REPEATS = new Set<string>([COURTYARD.flags.card, COURTYARD.plaster.lit, COURTYARD.plaster.shade, COURTYARD.tiles.card]);

/** Decode the courtyard's cards. Awaited by prepareLevel for a courtyard level only: no other level loads them. */
export async function preloadCourtyard(): Promise<void> {
  const loader = new THREE.TextureLoader();
  await Promise.all(Object.entries(URLS).map(async ([file, url]) => {
    const name = file.slice(file.lastIndexOf('/') + 1, -'.png'.length);
    if (textures.has(name)) return;
    const t = await loader.loadAsync(url);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = REPEATS.has(name) ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    textures.set(name, t);
  }));
}
function texture(name: string): THREE.Texture {
  const t = textures.get(name);
  if (!t) throw new Error(`[courtyard] "${name}" was not preloaded: prepareLevel must await preloadCourtyard()`);
  return t;
}

/** Painted quads that share one card, gathered into one mesh. */
class Washes {
  private readonly pos: number[] = [];
  private readonly uv: number[] = [];
  private readonly idx: number[] = [];
  /** a-b-c-d counter-clockwise seen from its front, with a texture coordinate at each corner */
  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, ua: [number, number], ub: [number, number], uc: [number, number], ud: [number, number]): void {
    const i = this.pos.length / 3;
    this.pos.push(...a, ...b, ...c, ...d);
    this.uv.push(...ua, ...ub, ...uc, ...ud);
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
  get empty(): boolean { return this.idx.length === 0; }
  geometry(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    geo.setIndex(this.idx);
    geo.computeVertexNormals();
    return geo;
  }
}

export interface Courtyard {
  root: THREE.Group;
  /** The gate as it is drawn: 0 shut to 1 open (the leaves' swing is eased here; the rule is src/systems/fight.ts). */
  setGate(share: number): void;
  dispose(): void;
}

/**
 * Dress a courtyard level's boxes. `boxes`: every tagged collision box of the level; `doors`: the gate_door ones.
 * Static but for the leaves, which turn about their hinges.
 */
export function buildCourtyard(boxes: YardBox[], doors: YardBox[]): Courtyard {
  const C = COURTYARD;
  const root = new THREE.Group();
  root.name = 'courtyard';
  const yard = boxes.find((b) => b.tag === C.yardTag);
  if (!yard) throw new Error(`[courtyard] the level has no box tagged "${C.yardTag}": the walls are lit by which side of it they stand on`);
  const cx = (yard.x0 + yard.x1) / 2, cz = (yard.z0 + yard.z1) / 2;
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const inkMat = new THREE.MeshBasicMaterial({ vertexColors: true }); // D-018: unlit, flat, ramp steps only
  mats.push(inkMat);
  const addInk = (name: string, f: Flats): THREE.Mesh => {
    const geo = f.geometry();
    geos.push(geo);
    const mesh = new THREE.Mesh(geo, inkMat);
    mesh.name = name;
    root.add(mesh);
    return mesh;
  };

  const flagW = new Washes(), litW = new Washes(), shadeW = new Washes(), tileW = new Washes();

  // ---- floors ----
  const floors = new Flats();
  const fTop = col(C.floor.top), fSide = col(C.floor.side);
  for (const b of boxes) {
    if (!(C.floorTags as readonly string[]).includes(b.tag)) continue;
    floors.box(b, (n) => (n[1] > 0 ? fTop : fSide));
    const m = C.flags.metres; // the flags lie in the world, not on a box: they run on unbroken from one floor to the next
    flagW.quad([b.x0, b.y1, b.z1], [b.x1, b.y1, b.z1], [b.x1, b.y1, b.z0], [b.x0, b.y1, b.z0], [b.x0 / m, b.z1 / m], [b.x1 / m, b.z1 / m], [b.x1 / m, b.z0 / m], [b.x0 / m, b.z0 / m]);
  }
  addInk('courtyard:floor', floors);
  /** Tile rows on a roof's two slopes (the same roof Flats.roof draws). */
  const tileRoof = (along: 'x' | 'z', a0: number, a1: number, mid: number, half: number, eaveY: number, ridgeY: number): void => {
    const p = (a: number, u: number, y: number): Vec3 => (along === 'x' ? [a, y, mid + u] : [mid + u, y, a]);
    const m = C.tiles.metres, u0 = a0 / m, u1 = a1 / m;
    for (const s of [1, -1]) {
      const A = p(a0, s * half, eaveY), B = p(a1, s * half, eaveY), R1 = p(a1, 0, ridgeY), R0 = p(a0, 0, ridgeY);
      // wound so that each slope faces up and out, whichever way the roof runs
      if ((s > 0) === (along === 'x')) tileW.quad(A, B, R1, R0, [u0, 0], [u1, 0], [u1, 1], [u0, 1]);
      else tileW.quad(B, A, R0, R1, [u1, 0], [u0, 0], [u0, 1], [u1, 1]);
    }
  };

  // ---- walls and their caps ----
  const walls = new Flats(), caps = new Flats();
  const W = C.wall, K = C.cap;
  const lit = col(W.lit), shade = col(W.shade), near = col(W.near), outer = col(W.outer), end = col(W.end), wTop = col(W.top);
  const slope = col(K.slope), under = col(K.under);
  for (const b of boxes) {
    if (!(C.wallTags as readonly string[]).includes(b.tag)) continue;
    const wx = (b.x0 + b.x1) / 2, wz = (b.z0 + b.z1) / 2;
    walls.box(b, (n) => {
      if (n[1] > 0) return wTop;
      if (n[2] > 0) return wz < yard.z0 ? lit : outer;      // the far-left wall's inner face takes the light
      if (n[2] < 0) return wz > yard.z1 ? shade : outer;
      if (n[0] < 0) return wx > yard.x1 ? shade : end;
      if (n[0] > 0) return wx < yard.x0 ? near : end;
      return outer;
    });
    // the stains: on both long faces, from the ground to the cap. The lit face (it looks toward +z) has its own card.
    const alongX = b.x1 - b.x0 >= b.z1 - b.z0, y0 = Math.max(b.y0, 0), pm = C.plaster.metres;
    if (alongX) {
      (wz < yard.z0 ? litW : shadeW).quad([b.x0, y0, b.z1], [b.x1, y0, b.z1], [b.x1, b.y1, b.z1], [b.x0, b.y1, b.z1], [b.x0 / pm, 0], [b.x1 / pm, 0], [b.x1 / pm, 1], [b.x0 / pm, 1]);
      shadeW.quad([b.x1, y0, b.z0], [b.x0, y0, b.z0], [b.x0, b.y1, b.z0], [b.x1, b.y1, b.z0], [b.x1 / pm, 0], [b.x0 / pm, 0], [b.x0 / pm, 1], [b.x1 / pm, 1]);
    } else {
      shadeW.quad([b.x1, y0, b.z1], [b.x1, y0, b.z0], [b.x1, b.y1, b.z0], [b.x1, b.y1, b.z1], [b.z1 / pm, 0], [b.z0 / pm, 0], [b.z0 / pm, 1], [b.z1 / pm, 1]);
      shadeW.quad([b.x0, y0, b.z0], [b.x0, y0, b.z1], [b.x0, b.y1, b.z1], [b.x0, b.y1, b.z0], [b.z0 / pm, 0], [b.z1 / pm, 0], [b.z1 / pm, 1], [b.z0 / pm, 1]);
    }
    const a0 = alongX ? b.x0 : b.z0, a1 = alongX ? b.x1 : b.z1;
    const mid = alongX ? wz : wx, half = (alongX ? b.z1 - b.z0 : b.x1 - b.x0) / 2 + K.overhang;
    caps.roof(alongX ? 'x' : 'z', a0 - K.overhang, a1 + K.overhang, mid, half, b.y1, b.y1 + K.rise, K.eave, slope, under);
    tileRoof(alongX ? 'x' : 'z', a0 - K.overhang, a1 + K.overhang, mid, half, b.y1, b.y1 + K.rise);
  }
  addInk('courtyard:wall', walls);
  addInk('courtyard:cap', caps);


  // ---- the way in: each pair of frame posts on one wall line, and the beam across them ----
  const E = C.frame, eTimber = col(E.timber);
  const posts = boxes.filter((b) => b.tag === C.frameTag);
  const postLines = new Map<number, YardBox[]>();
  for (const s of posts) {
    const x = (s.x0 + s.x1) / 2;
    postLines.set(x, [...(postLines.get(x) ?? []), s]);
  }
  const frames = new Flats();
  for (const [x, pair] of postLines) {
    if (pair.length !== 2) throw new Error(`[courtyard] a way in is two "${C.frameTag}" boxes on one wall line: found ${pair.length} at x ${x}`);
    const [a, b] = pair[0]!.z0 < pair[1]!.z0 ? [pair[0]!, pair[1]!] : [pair[1]!, pair[0]!];
    for (const s of [a, b]) frames.box({ ...s, y0: Math.max(s.y0, 0) }, () => eTimber);
    const top = Math.min(a.y1, b.y1);
    frames.box({ x0: x - E.beam / 2, x1: x + E.beam / 2, y0: top - E.beamDrop - E.beam, y1: top - E.beamDrop, z0: a.z0 - E.past, z1: b.z1 + E.past }, () => eTimber);
    frames.box({ x0: x - E.tie / 2, x1: x + E.tie / 2, y0: top - E.tieDrop - E.tie, y1: top - E.tieDrop, z0: a.z0, z1: b.z1 }, () => eTimber);
  }
  if (posts.length) addInk('courtyard:frame', frames);

  // ---- the doors: two leaves to a doorway, each turning about its own hinge ----
  const L = C.leaf, fill = col(L.fill);
  const leaves: { mesh: THREE.Mesh; sign: number }[] = [];
  for (const d of doors) {
    const x = (d.x0 + d.x1) / 2, zm = (d.z0 + d.z1) / 2, t = L.thick / 2;
    for (const [hinge, sign] of [[d.z0, 1], [d.z1, -1]] as const) {
      const f = new Flats();
      // modelled from its hinge: it reaches from 0 to the middle of the doorway along +z or -z
      const reach = (zm - hinge);
      f.box({ x0: -t, x1: t, y0: 0, y1: L.top - d.y0, z0: Math.min(0, reach), z1: Math.max(0, reach) }, () => fill);
      const mesh = addInk('courtyard:leaf', f);
      mesh.position.set(x, d.y0, hinge); // the hinge: this never changes, the leaf only turns
      leaves.push({ mesh, sign });
      // its planks and rails, painted on both faces: a child of the leaf, so it turns with it about the same hinge
      const w = new Washes(), h = L.top - d.y0, z0 = Math.min(0, reach), z1 = Math.max(0, reach), e = t + 0.004, m = L.plankMetres;
      w.quad([e, 0, z1], [e, 0, z0], [e, h, z0], [e, h, z1], [z1 / m, 0], [z0 / m, 0], [z0 / m, 1], [z1 / m, 1]);
      w.quad([-e, 0, z0], [-e, 0, z1], [-e, h, z1], [-e, h, z0], [z0 / m, 0], [z1 / m, 0], [z1 / m, 1], [z0 / m, 1]);
      const pg = w.geometry();
      geos.push(pg);
      const pm = paintMaterial({ map: texture(L.planks), opacity: L.ink, wash: true });
      pm.polygonOffset = true;
      pm.polygonOffsetFactor = -1;
      pm.polygonOffsetUnits = -1;
      mats.push(pm);
      const planks = paint(new THREE.Mesh(pg, pm));
      planks.name = 'courtyard:planks';
      planks.renderOrder = L.order;
      mesh.add(planks);
    }
  }

  // ---- the paint layer: the yard's washes, and what stands beyond the walls ----
  const painted = new THREE.Group();
  painted.name = 'courtyard:paint';
  const addWash = (name: string, w: Washes, card: string, ink: number, order: number): void => {
    if (w.empty) return;
    const geo = w.geometry();
    geos.push(geo);
    const mat = paintMaterial({ map: texture(card), opacity: ink, wash: true });
    mat.polygonOffset = true; // it lies ON an ink surface: drawn a hair nearer, as the path's wash is (path-wash.ts)
    mat.polygonOffsetFactor = -1;
    mat.polygonOffsetUnits = -1;
    mats.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name;
    mesh.renderOrder = order;
    painted.add(mesh);
  };
  addWash('courtyard:flags', flagW, C.flags.card, C.flags.ink, C.order.flags);
  addWash('courtyard:plaster', litW, C.plaster.lit, C.plaster.ink, C.order.plaster);
  addWash('courtyard:plaster', shadeW, C.plaster.shade, C.plaster.ink, C.order.plaster);
  addWash('courtyard:tiles', tileW, C.tiles.card, C.tiles.ink, C.order.tiles);
  /** A card on an arc of a cylinder about the yard's centre, seen from inside it. */
  const arcCard = (name: string, card: string, bearing: number, arc: number, radius: number, baseY: number, height: number, segments: number, ink: number, mirror: boolean, order: number): void => {
    // CylinderGeometry's angle runs from +z toward +x; a bearing is from +x toward +z
    const mid = Math.PI / 2 - (bearing * Math.PI) / 180, len = (arc * Math.PI) / 180;
    const geo = new THREE.CylinderGeometry(radius, radius, height, segments, 1, true, mid - len / 2, len);
    // seen from inside, the angle runs right to left: the card is turned so its left is the viewer's left
    const uv = geo.getAttribute('uv');
    if (!mirror) for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
    geos.push(geo);
    const mat = paintMaterial({ map: texture(card), opacity: ink, wash: true, side: THREE.BackSide });
    mats.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name;
    mesh.position.set(cx, baseY + height / 2, cz);
    mesh.renderOrder = order;
    painted.add(mesh);
  };
  for (const bearing of C.sky.arcs) arcCard('backdrop:yard-sky', C.sky.card, bearing, C.sky.arc, C.sky.radius, C.sky.baseY, C.sky.height, C.sky.segments, C.sky.ink, false, C.order.sky);
  for (const [bearing, ink, mirror] of C.far.arcs) arcCard('backdrop:yard-far', C.far.card, bearing, C.far.arc, C.far.radius, C.far.topY - C.far.height, C.far.height, C.far.segments, ink, mirror, C.order.far);
  root.add(paint(painted));

  return {
    root,
    setGate(share) {
      const u = share * share * (3 - 2 * share); // eased: it starts and stops gently
      for (const l of leaves) l.mesh.rotation.y = l.sign * u * C.leaf.openDeg * (Math.PI / 180);
    },
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
    },
  };
}
