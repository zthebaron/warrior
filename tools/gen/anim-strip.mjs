#!/usr/bin/env node
// Frames of animation clips, as rows of tiles: the way to look at a clip without the game.
//
//   node tools/gen/anim-strip.mjs <out.png> [--frames 3] [--size 300] [--az 35] [--elev 8] [--bg #cabfac]
//                                 <label>=<file.glb>[#<clip name>][@<t0>-<t1>] ...
//
// One row per item, --frames tiles per row, evenly spaced from t0 to t1 (default: the whole clip,
// the last tile just short of the end so a loop's last tile is not its first). With no #clip the
// GLB's first clip is used. Every tile in a row shares one camera, fitted to the figure across
// that row's frames, so travel that is still in the clip shows as the figure moving in its tile.
// A thin line marks the ground (y = 0) and a tick marks the origin: a clip that is truly in place
// keeps its feet on that line and over that tick.
import { chromium } from 'playwright';
import sharp from 'sharp';
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const a = process.argv.slice(2);
const opt = (name, d) => { const i = a.indexOf(name); if (i === -1) return d; const v = a[i + 1]; a.splice(i, 2); return v; };
const frames = Number(opt('--frames', 3));
const size = Number(opt('--size', 300));
const az = Number(opt('--az', 35));
const elev = Number(opt('--elev', 8));
const PAPER = opt('--bg', '#cabfac');
const title = opt('--title', '');
const [out, ...specs] = a;
if (!out || !specs.length) { console.error('usage: anim-strip.mjs <out.png> [--frames 3] [--size 300] [--az 35] <label>=<file.glb>[#clip][@t0-t1] ...'); process.exit(2); }
const items = specs.map((s) => {
  const m = /^([^=]+)=([^#@]+)(?:#([^@]+))?(?:@([\d.]+)-([\d.]+))?$/.exec(s);
  if (!m) { console.error(`bad item "${s}"`); process.exit(2); }
  return { label: m[1], file: resolve(m[2]), clip: m[3] ?? '', t0: m[4] === undefined ? null : Number(m[4]), t1: m[5] === undefined ? null : Number(m[5]) };
});

const PAGE = `<!doctype html><meta charset="utf8"><body style="margin:0;background:${PAPER}">
<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const size = ${size};
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(size, size); renderer.setClearColor('${PAPER}');
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
let root = null, mixer = null, clip = null, action = null;
const marks = new THREE.Group(); scene.add(marks);
const pose = (t) => {
  mixer.setTime(0); action.time = t; mixer.update(0);
  root.updateMatrixWorld(true);
  root.traverse((o) => { if (o.isSkinnedMesh) { o.skeleton.update(); o.computeBoundingBox(); } });
};
const boundsNow = () => {
  const box = new THREE.Box3();
  root.traverse((o) => { if (o.isSkinnedMesh) { const b = o.boundingBox.clone().applyMatrix4(o.matrixWorld); box.union(b); } else if (o.isMesh) box.expandByObject(o); });
  return box;
};
window.__load = async (url, clipName) => {
  if (root) { scene.remove(root); }
  const gltf = await new GLTFLoader().loadAsync(url);
  root = gltf.scene;
  root.traverse((o) => { if (o.isMesh) { const m = o.material; o.material = new THREE.MeshBasicMaterial({ map: m.map ?? null, color: m.color ?? 0xffffff, side: THREE.DoubleSide }); o.frustumCulled = false; } });
  scene.add(root);
  clip = gltf.animations.find((x) => x.name === clipName) ?? (clipName ? null : gltf.animations[0]);
  if (!clip) return { error: 'no clip "' + clipName + '"; it has: ' + gltf.animations.map((x) => x.name).join(', ') };
  mixer = new THREE.AnimationMixer(root);
  action = mixer.clipAction(clip); action.play();
  return { name: clip.name, duration: clip.duration, clips: gltf.animations.map((x) => x.name) };
};
window.__fit = (times, az, el) => {
  const box = new THREE.Box3();
  for (const t of times) { pose(t); box.union(boundsNow()); }
  box.expandByPoint(new THREE.Vector3(0, 0, 0));
  const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
  const r = 0.5 * Math.max(s.y, Math.hypot(s.x, s.z)) * 1.08;
  cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r; cam.near = 0.01; cam.far = r * 40; cam.updateProjectionMatrix();
  const A = az * Math.PI / 180, E = el * Math.PI / 180;
  cam.position.copy(c).add(new THREE.Vector3(Math.sin(A) * Math.cos(E), Math.sin(E), Math.cos(A) * Math.cos(E)).multiplyScalar(r * 8)); cam.lookAt(c);
  marks.clear();
  const mat = new THREE.LineBasicMaterial({ color: 0x8a8478 });
  const L = Math.max(s.x, s.z, 1) * 1.5;
  const pts = [[-L, 0, 0], [L, 0, 0], [0, 0, -L], [0, 0, L]].map((p) => new THREE.Vector3(...p));
  marks.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), mat));
  return { size: s.toArray(), min: box.min.toArray(), max: box.max.toArray() };
};
window.__shot = (t) => { pose(t); const b = boundsNow(); renderer.render(scene, cam); return { png: renderer.domElement.toDataURL('image/png'), minY: b.min.y, maxY: b.max.y, cx: (b.min.x + b.max.x) / 2, cz: (b.min.z + b.max.z) / 2 }; };
window.__ready = true;
</script>`;

const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(PAGE); }
  if (url.pathname === '/__glb') {
    const i = Number(url.searchParams.get('i'));
    res.writeHead(200, { 'Content-Type': 'model/gltf-binary' }); return res.end(readFileSync(items[i].file));
  }
  const f = join(ROOT, decodeURIComponent(url.pathname));
  if (!f.startsWith(join(ROOT, 'node_modules')) || !existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] ?? 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const port = server.address().port;

const LAB = 190, HEAD = title ? 34 : 0;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader', '--use-gl=swiftshader', '--ignore-gpu-blocklist'] });
let code = 0;
try {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction('window.__ready === true', { timeout: 120000 });
  const comps = [];
  let lastFile = null;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const info = await page.evaluate(([i, clip]) => window.__load('/__glb?i=' + i, clip), [i, it.clip]);
    if (info.error) throw new Error(`${it.label}: ${info.error}`);
    lastFile = it.file;
    const t0 = it.t0 ?? 0, t1 = it.t1 ?? info.duration;
    const whole = it.t1 === null;
    // the last tile of a whole clip sits one step short of the end, so a loop does not show its first frame twice
    const times = Array.from({ length: frames }, (_, k) => t0 + ((t1 - t0) * k) / (whole ? frames : Math.max(1, frames - 1)));
    await page.evaluate(([times, az, el]) => window.__fit(times, az, el), [times, az, elev]);
    const y = HEAD + i * size;
    const notes = [];
    for (let k = 0; k < frames; k++) {
      const shot = await page.evaluate((t) => window.__shot(t), times[k]);
      comps.push({ input: Buffer.from(shot.png.split(',')[1], 'base64'), left: LAB + k * size, top: y });
      comps.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="90" height="20"><text x="4" y="15" font-family="Helvetica" font-size="13" fill="#3a3632">${times[k].toFixed(2)} s</text></svg>`), left: LAB + k * size + 4, top: y + 2 });
      notes.push(`${times[k].toFixed(2)}s feet y ${shot.minY.toFixed(2)} centre x ${shot.cx.toFixed(2)} z ${shot.cz.toFixed(2)}`);
    }
    comps.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${LAB}" height="${size}"><text x="10" y="${size / 2 - 8}" font-family="Helvetica" font-size="19" font-weight="bold" fill="#26231f">${esc(it.label)}</text><text x="10" y="${size / 2 + 14}" font-family="Helvetica" font-size="13" fill="#4a4540">${esc(info.name === it.label ? '' : info.name.replace(/^Armature\|/, '').replace(/\|baselayer$/, ''))}</text><text x="10" y="${size / 2 + 32}" font-family="Helvetica" font-size="13" fill="#4a4540">${info.duration.toFixed(2)} s${whole ? '' : `, ${t0.toFixed(2)}-${t1.toFixed(2)}`}</text></svg>`), left: 0, top: y });
    console.log(`${it.label.padEnd(10)} ${info.name} ${info.duration.toFixed(3)}s | ${notes.join(' | ')}`);
  }
  if (title) comps.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${LAB + frames * size}" height="${HEAD}"><text x="10" y="23" font-family="Helvetica" font-size="17" fill="#26231f">${esc(title)}</text></svg>`), left: 0, top: 0 });
  if (errs.length) console.error('page errors: ' + errs.join(' | '));
  await sharp({ create: { width: LAB + frames * size, height: HEAD + items.length * size, channels: 3, background: PAPER } }).composite(comps).png().toFile(out);
  console.log(`wrote ${out}`);
} catch (e) { console.error('ERROR ' + e.message); code = 1; }
await browser.close();
server.close();
process.exit(code);
