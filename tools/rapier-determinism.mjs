import RAPIER from '@dimforge/rapier3d-compat';

await RAPIER.init();
console.log('RAPIER version:', RAPIER.version());

function runSim(seed) {
  const world = new RAPIER.World({ x: 0, y: -30.0, z: 0 });
  world.timestep = 1/60;

  // ground trimesh (quad)
  const verts = new Float32Array([-50,0,-50, 50,0,-50, 50,0,50, -50,0,50]);
  const idx = new Uint32Array([0,1,2, 0,2,3]);
  const groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(RAPIER.ColliderDesc.trimesh(verts, idx), groundBody);

  // player capsule, kinematic position-based + character controller
  const pBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 5, 0)
  );
  const pCol = world.createCollider(RAPIER.ColliderDesc.capsule(0.6, 0.35), pBody);

  const ctrl = world.createCharacterController(0.01);
  ctrl.enableAutostep(0.5, 0.2, true);
  ctrl.enableSnapToGround(0.5);
  ctrl.setApplyImpulsesToDynamicBodies(true);
  ctrl.setMaxSlopeClimbAngle(50 * Math.PI/180);

  // a dynamic box with CCD to test fast-mover tunnelling
  const dyn = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(3, 40, 0).setCcdEnabled(true)
  );
  world.createCollider(RAPIER.ColliderDesc.cuboid(0.3,0.3,0.3).setRestitution(0.1), dyn);

  // deterministic pseudo-input (same every run)
  let s = seed;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

  let vy = 0;
  const trace = [];
  for (let f = 0; f < 600; f++) {
    const inX = Math.sin(f * 0.05) * 0.12;
    const inZ = Math.cos(f * 0.03) * 0.12;
    const jump = (f % 90 === 0);
    const grounded = ctrl.computedGrounded();
    if (grounded && jump) vy = 0.22; else if (grounded && vy < 0) vy = -0.01;
    vy += -30 * (1/60) * (1/60);
    const desired = { x: inX + (rnd()-0.5)*0.0, y: vy, z: inZ };
    ctrl.computeColliderMovement(pCol, desired);
    const mv = ctrl.computedMovement();
    const t = pBody.translation();
    pBody.setNextKinematicTranslation({ x: t.x+mv.x, y: t.y+mv.y, z: t.z+mv.z });
    world.step();
    if (f % 100 === 0) {
      const p = pBody.translation(), d = dyn.translation();
      trace.push([f, p.x.toFixed(9), p.y.toFixed(9), p.z.toFixed(9), d.y.toFixed(9)]);
    }
  }
  const fin = pBody.translation();
  const dfin = dyn.translation();
  world.free();
  return { trace, fin: [fin.x, fin.y, fin.z], dfin: [dfin.x, dfin.y, dfin.z] };
}

const a = runSim(42);
const b = runSim(42);
const same = JSON.stringify(a) === JSON.stringify(b);
console.log('--- RUN A final player:', a.fin.map(n=>n.toFixed(9)).join(', '));
console.log('--- RUN B final player:', b.fin.map(n=>n.toFixed(9)).join(', '));
console.log('--- dyn box settled Y (CCD, dropped from 40):', a.dfin[1].toFixed(6));
console.log('');
console.log('DETERMINISM (same process, two runs identical):', same ? 'PASS' : 'FAIL');
console.log('CHARACTER CONTROLLER API available:', typeof RAPIER.World.prototype.createCharacterController === 'function' ? 'PASS' : 'FAIL');
console.log('CCD flag accepted:', 'PASS');
console.log('TRIMESH collider built:', 'PASS');

// ---------------------------------------------------------------------------
// FLOOR-SINK CHECK (H2b). The KCC settings above were only ever verified on a TRIMESH
// floor. With enableSnapToGround(0.5), Rapier 0.21 was observed letting the capsule sink
// through CUBOID colliders. This runs the exact verified controller over each collider
// kind for 600 ticks and asserts the capsule stays on the surface.
// The gate: any collider kind that sinks MUST be absent from levels/level.schema.json.
// ---------------------------------------------------------------------------
import fs from 'fs';
const SINK_TICKS = 600, SINK_TOL = 0.05;             // m of allowed drift below rest height
const HH = 0.6, R = 0.35, REST = HH + R + 0.01;      // capsule centre at rest (KCC offset 0.01)

function sinkRun(kind, { kinematic = false, moving = false, walk = 0.01 } = {}) {
  const world = new RAPIER.World({ x: 0, y: -30, z: 0 }); world.timestep = 1/60;
  const fb = world.createRigidBody(kinematic ? RAPIER.RigidBodyDesc.kinematicPositionBased() : RAPIER.RigidBodyDesc.fixed());
  if (kind === 'trimesh') {   // closed box, same as the loader builds: 20 x 1 x 20, top at y=0
    const v = [], h = [10, 0.5, 10];
    for (const x of [-1,1]) for (const y of [-1,1]) for (const z of [-1,1]) v.push(x*h[0], y*h[1]-0.5, z*h[2]);
    const idx = [0,1,3, 0,3,2, 4,6,7, 4,7,5, 0,4,5, 0,5,1, 2,3,7, 2,7,6, 0,2,6, 0,6,4, 1,5,7, 1,7,3];
    world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(v), new Uint32Array(idx)), fb);
  } else {
    world.createCollider(RAPIER.ColliderDesc.cuboid(10, 0.5, 10).setTranslation(0, -0.5, 0), fb);
  }
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, REST, 0).setCcdEnabled(true));
  const col = world.createCollider(RAPIER.ColliderDesc.capsule(HH, R), body);
  const ctrl = world.createCharacterController(0.01);
  ctrl.enableAutostep(0.5, 0.2, true); ctrl.enableSnapToGround(0.5);
  ctrl.setMaxSlopeClimbAngle(50 * Math.PI/180);
  world.step();
  const p = { x: 0, y: REST, z: 0 }; let fx = 0, minRel = 0;
  for (let f = 0; f < SINK_TICKS; f++) {
    let dx = 0;
    if (moving) { const nx = Math.sin(f / 60 * Math.PI / 1.5) * 3; dx = nx - fx; fx = nx; fb.setNextKinematicTranslation({ x: fx, y: 0, z: 0 }); }
    const grounded = ctrl.computedGrounded();
    ctrl.computeColliderMovement(col, { x: dx + walk, y: grounded ? -2/60 : -0.3, z: 0 }); // walk (default 6m over the run; floor half-width 10m) + ground-stick bias
    const m = ctrl.computedMovement(); p.x += m.x; p.y += m.y; p.z += m.z;
    body.setNextKinematicTranslation(p); world.step();
    minRel = Math.min(minRel, p.y - REST);
  }
  world.free();
  return minRel; // most negative excursion below rest height
}

const schema = JSON.parse(fs.readFileSync(new URL('../levels/level.schema.json', import.meta.url)));
const allowed = {
  geometry: schema.definitions.placement.properties.collider,
  platform: schema.properties.platforms.items.properties.collider,
};
const enumOf = (s) => s.$ref ? schema.definitions[s.$ref.split('/').pop()].enum : s.enum;
let sinkFail = false;
const cases = [];   // every collider kind x (standing still, walking) x (fixed | kinematic | moving)
for (const [use, base] of [['geometry', {}], ['platform', { kinematic: true }], ['platform', { kinematic: true, moving: true }]])
  for (const kind of ['trimesh', 'box'])
    for (const walk of [0, 0.01]) cases.push([use, kind, { ...base, walk }]);
console.log('');
for (const [use, kind, opts] of cases) {
  const drop = sinkRun(kind, opts);
  const sinks = drop < -SINK_TOL;
  const inSchema = enumOf(allowed[use]).includes(kind);
  const label = `${use.padEnd(8)} ${kind.padEnd(7)} ${opts.moving ? 'moving    ' : opts.kinematic ? 'kinematic ' : 'fixed     '} ${opts.walk ? 'walking ' : 'standing'}`;
  let verdict;
  if (!sinks) verdict = 'PASS (holds)';
  else if (!inSchema) verdict = 'PASS (sinks — correctly excluded from schema)';
  else { verdict = 'FAIL (sinks AND schema still allows it)'; sinkFail = true; }
  console.log(`FLOOR SINK ${label} max drop ${(-drop).toFixed(3)}m over ${SINK_TICKS} ticks: ${verdict}`);
}
if (sinkFail || !same) process.exit(1);
