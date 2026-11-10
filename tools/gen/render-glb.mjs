#!/usr/bin/env node
// Render a GLB to a strip of views, for looking at a model without opening the game.
//
//   node tools/gen/render-glb.mjs <model.glb> <out.png> [--views 0,45,90,180] [--modes unlit,clay]
//                                 [--size 512] [--elev 10] [--json]
//
// Rows are modes, columns are views. Azimuth 0 looks at the model's +Z face (glTF front), 180 at
// its back. `unlit` shows the base-colour texture exactly as painted, with no lighting, on paper
// colour. `clay` drops the texture and lights a grey surface, which is the only honest way to see
// whether the geometry is a real solid or a relief with a picture on it.
import { chromium } from 'playwright';
import sharp from 'sharp';
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const a = process.argv.slice(2);
const opt = (name, d) => { const i = a.indexOf(name); if (i === -1) return d; const v = a[i + 1]; a.splice(i, 2); return v; };
const has = (name) => { const i = a.indexOf(name); if (i === -1) return false; a.splice(i, 1); return true; };
const views = opt('--views', '0,45,90,180').split(',').map(Number);
const modes = opt('--modes', 'unlit,clay').split(',');
const size = Number(opt('--size', 512));
const elev = Number(opt('--elev', 10));
const asJson = has('--json');
const time = opt('--time', null);
const clipName = opt('--clip', '');
const PAPER = opt('--bg', '#cabfac'); // default: STYLE-BIBLE paper-cream
const [glb, out] = a;
if (!glb || !out) { console.error('usage: render-glb.mjs <model.glb> <out.png> [--views 0,45,90,180] [--modes unlit,clay] [--size 512] [--elev 10] [--bg #rrggbb]'); process.exit(2); }

const PAGE = `<!doctype html><meta charset="utf8"><body style="margin:0;background:${PAPER}">
<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
const q = new URLSearchParams(location.search);
const size = Number(q.get('size'));
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(size, size); renderer.setClearColor('${PAPER}');
document.body.appendChild(renderer.domElement);
const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync('/__glb');
const root = gltf.scene;
const t = q.get('time');
let duration = 0;
if (t !== null && gltf.animations.length) {
  // pose the first clip at t seconds, so a rigged model can be seen mid-stride
  const mixer = new THREE.AnimationMixer(root);
  const clip = gltf.animations.find((x) => x.name === q.get('clip')) ?? gltf.animations[0];
  duration = clip.duration;
  mixer.clipAction(clip).play();
  mixer.setTime(Number(t));
}
root.updateMatrixWorld(true);
root.traverse((o) => { if (o.isSkinnedMesh) { o.skeleton.update(); o.computeBoundingBox(); } });
const box = new THREE.Box3().setFromObject(root);
const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
const stats = { min: box.min.toArray(), max: box.max.toArray(), size: s.toArray(), meshes: 0, triangles: 0, textures: [], skinned: 0, animations: gltf.animations.map((x) => x.name), duration };
const mats = new Map();
root.traverse((o) => {
  if (!o.isMesh) return;
  stats.meshes++;
  if (o.isSkinnedMesh) stats.skinned++;
  const g = o.geometry;
  stats.triangles += (g.index ? g.index.count : g.attributes.position.count) / 3;
  if (!g.attributes.normal) g.computeVertexNormals();
  const m = o.material;
  if (m.map && m.map.image) stats.textures.push(m.map.image.width + 'x' + m.map.image.height);
  mats.set(o, {
    unlit: new THREE.MeshBasicMaterial({ map: m.map ?? null, color: m.color ?? 0xffffff, vertexColors: !!g.attributes.color, side: THREE.DoubleSide }),
    clay: new THREE.MeshStandardMaterial({ color: 0x9a948c, roughness: 0.95, metalness: 0, side: THREE.DoubleSide }),
  });
});
const scene = new THREE.Scene();
scene.add(root);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8478, 1.5));
const key = new THREE.DirectionalLight(0xffffff, 2.2); scene.add(key);
const r = 0.5 * Math.hypot(s.x, s.y, s.z) * 1.04;
const cam = new THREE.OrthographicCamera(-r, r, r, -r, 0.01, r * 20);
window.__stats = stats;
window.__shot = (mode, az, el) => {
  root.traverse((o) => { if (o.isMesh) o.material = mats.get(o)[mode]; });
  const A = az * Math.PI / 180, E = el * Math.PI / 180;
  const dir = new THREE.Vector3(Math.sin(A) * Math.cos(E), Math.sin(E), Math.cos(A) * Math.cos(E));
  cam.position.copy(c).addScaledVector(dir, r * 6); cam.lookAt(c);
  key.position.copy(cam.position).add(new THREE.Vector3(-r * 3, r * 4, 0).applyQuaternion(cam.quaternion));
  renderer.render(scene, cam);
  return renderer.domElement.toDataURL('image/png');
};
window.__ready = true;
</script>`;

const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(PAGE); }
  if (url.pathname === '/__glb') { res.writeHead(200, { 'Content-Type': 'model/gltf-binary' }); return res.end(readFileSync(resolve(glb))); }
  const f = join(ROOT, decodeURIComponent(url.pathname));
  if (!f.startsWith(join(ROOT, 'node_modules')) || !existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] ?? 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const port = server.address().port;

const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader', '--use-gl=swiftshader', '--ignore-gpu-blocklist'] });
let code = 0;
try {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(`http://127.0.0.1:${port}/?size=${size}${time === null ? '' : '&time=' + time}&clip=${encodeURIComponent(clipName)}`);
  try { await page.waitForFunction('window.__ready === true', { timeout: 120000 }); }
  catch { throw new Error('model did not load: ' + errs.join(' | ')); }
  const stats = await page.evaluate(() => window.__stats);
  const tiles = [];
  for (let m = 0; m < modes.length; m++) for (let v = 0; v < views.length; v++) {
    const data = await page.evaluate(([mode, az, el]) => window.__shot(mode, az, el), [modes[m], views[v], elev]);
    tiles.push({ input: Buffer.from(data.split(',')[1], 'base64'), left: v * size, top: m * size });
  }
  await sharp({ create: { width: views.length * size, height: modes.length * size, channels: 3, background: PAPER } }).composite(tiles).png().toFile(out);
  if (asJson) console.log(JSON.stringify(stats));
  else console.log(`${out}  ${stats.meshes} mesh(es), ${stats.triangles.toLocaleString()} tris, size ${stats.size.map((x) => x.toFixed(3)).join(' x ')}, y ${stats.min[1].toFixed(3)}..${stats.max[1].toFixed(3)}, textures ${stats.textures.join(',') || 'none'}${stats.skinned ? ', skinned' : ''}${stats.animations.length ? ', animations: ' + stats.animations.join(',') : ''}`);
} catch (e) { console.error('ERROR ' + e.message); code = 1; }
await browser.close();
server.close();
process.exit(code);
