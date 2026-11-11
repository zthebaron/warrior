// frame-hashes — what the harness sees of every level, as hashes, so two builds can be compared byte for byte.
// The visual stage passes a camera at up to 0.5% drift, and several Linux goldens already sit part of the way
// there, so "visual passes" cannot prove that a change left the picture alone. This can: it draws the same six
// frames a level as the visual stage (same page, same camera calls, same canvas screenshot) and prints the
// sha256 of each frame's pixels, with what else the page shows a harness run: the renderer's counters, every
// visible renderable, the paint layer, the page's text and the ids of the elements in it.
//
//   node tools/harness/frame-hashes.ts <out.json> [--build] [--level=<id>] [--frames=<dir>]   (--frames also saves each frame)
//   node tools/harness/frame-hashes.ts --diff <a.json> <b.json>     exit 1 if anything differs
//
// It judges nothing on its own. Take one before a change and one after, on the same machine, and --diff them.
// One playtest or frame tool at a time: it uses the preview port.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { levelIds } from './lib.ts';
import { preflight } from './preflight.ts';
import { cameras } from './visual.ts';

const ROOT = new URL('../..', import.meta.url).pathname;
const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const has = (name: string): boolean => argv.includes(`--${name}`);
const files = argv.filter((a) => !a.startsWith('--'));

interface LevelRecord {
  frames: Record<string, { sha256: string; calls: number; triangles: number }>;
  geometries: number;
  textures: number;
  renderables: number;
  renderablesSha256: string;
  paint: { painted: number; backdrop: number; drawn: boolean };
  clips: string[];
  text: string;
  ids: string[];
  canvases: number;
}
interface Report { platform: string; levels: Record<string, LevelRecord> }

if (has('diff')) {
  const [a, b] = files.map((f) => JSON.parse(readFileSync(f!, 'utf8')) as Report);
  if (!a || !b) { console.error('usage: frame-hashes.ts --diff <a.json> <b.json>'); process.exit(2); }
  const flat = (o: unknown, path = '', out = new Map<string, string>()): Map<string, string> => {
    if (o !== null && typeof o === 'object') for (const [k, v] of Object.entries(o)) flat(v, path ? `${path}.${k}` : k, out);
    else out.set(path, JSON.stringify(o));
    return out;
  };
  const fa = flat(a), fb = flat(b);
  let n = 0;
  for (const k of new Set([...fa.keys(), ...fb.keys()])) {
    if (fa.get(k) === fb.get(k)) continue;
    n++;
    console.log(`DIFFERS ${k}: ${fa.get(k) ?? '(absent)'} -> ${fb.get(k) ?? '(absent)'}`);
  }
  console.log(n ? `${n} values differ` : `IDENTICAL: ${fa.size} values, ${Object.keys(a.levels).length} levels`);
  process.exit(n ? 1 : 0);
}

const out = files[0];
if (!out) { console.error('usage: node tools/harness/frame-hashes.ts <out.json> [--build] [--level=<id>]'); process.exit(2); }
const pf = await preflight(ROOT, { skipBuild: !has('build') });
if (!pf.browser || !pf.baseUrl) {
  for (const c of pf.result.checks) if (!c.ok) console.error(`preflight: ${c.name}: ${c.detail}`);
  process.exit(1);
}
const sha = (data: Uint8Array | string): string => createHash('sha256').update(data).digest('hex');
const report: Report = { platform: process.platform, levels: {} };
let errors = 0;
for (const id of flag('level') ? [flag('level')!] : levelIds(ROOT)) {
  const level = JSON.parse(readFileSync(`${ROOT}levels/${id}.json`, 'utf8'));
  const page = await pf.browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error') { errors++; console.error(`${id} console error: ${m.text()}`); } });
  page.on('pageerror', (e) => { errors++; console.error(`${id} page error: ${e.message}`); });
  await page.goto(`${pf.baseUrl}/?harness=1&level=${id}`);
  await page.waitForFunction(() => window.__HARNESS__?.version === 'HARNESS_API_V1');
  const started = await page.evaluate(() => window.__HARNESS__!.start());
  if (!started.ok) { console.error(`${id} failed to load: ${started.error}`); process.exit(1); }
  const frames: LevelRecord['frames'] = {};
  for (const cam of cameras(level)) {
    const info = await page.evaluate((c) => {
      window.__HARNESS__!.setCamera(c.pos, c.target);
      window.__HARNESS__!.advance(1);
      return window.__HARNESS__!.rendererInfo();
    }, cam);
    const shot = PNG.sync.read(await page.locator('canvas').screenshot()); // strict, as the visual stage: a second canvas is an error
    frames[cam.name] = { sha256: sha(shot.data), calls: info.calls, triangles: info.triangles };
    if (flag('frames')) {
      mkdirSync(flag('frames')!, { recursive: true });
      writeFileSync(`${flag('frames')}/${id}-${cam.name}.png`, PNG.sync.write(shot));
    }
  }
  const rest = await page.evaluate(() => {
    const H = window.__HARNESS__!;
    const info = H.rendererInfo();
    return {
      geometries: info.geometries,
      textures: info.textures,
      renderables: H.translators().map((t) => `${t.name}|${t.tag}|${t.pos.map((v) => v.toFixed(4)).join(',')}`),
      paint: H.paintLayer(),
      clips: H.figureClips().map((c) => `${c.name}:${c.duration.toFixed(4)}`),
      text: `${document.title}\n${document.body.innerText}`,
      ids: [...document.querySelectorAll('[id]')].map((e) => `${e.tagName.toLowerCase()}#${e.id}`),
      canvases: document.querySelectorAll('canvas').length,
    };
  });
  report.levels[id] = { frames, ...rest, renderables: rest.renderables.length, renderablesSha256: sha(rest.renderables.join('\n')) };
  console.log(`${id}  ${Object.values(frames).map((f) => f.sha256.slice(0, 8)).join(' ')}  ${rest.renderables.length} renderables  ids: ${rest.ids.join(' ')}`);
  await page.close();
}
writeFileSync(out, JSON.stringify(report, null, 1) + '\n');
console.log(`${out}: ${Object.keys(report.levels).length} levels${errors ? `, ${errors} console errors` : ''}`);
await pf.browser.close();
pf.server?.kill();
process.exit(errors ? 1 : 0);
