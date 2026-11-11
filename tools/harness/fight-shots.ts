// fight-shots — the swordsman's clip sheet (D-023), taken in the game: every tile is the real figure, with his
// katana and his ink, doing what the fight's own state machine made him do. For looking at; it judges nothing.
//
//   node tools/harness/fight-shots.ts <out.png> [--level=01-lower-stair] [--foe=<id>] [--size=WxH] [--build]
//
// One fixed camera beside the level's first swordsman (or --foe). The warrior is put in front of him and the
// game is stepped tick by tick through the public input API; a tile is taken where the snapshot says he is in
// the mode the tile is for. Rows, top to bottom: standing guard and closing in; the wind-up, the cut and the
// recovery (the warrior stands still and is cut); a hit that staggers him; the hit that fells him, to paper.
// One playtest or frame tool at a time: it uses the preview port.
import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { preflight } from './preflight.ts';
import { NEUTRAL, type InputFrame, type Snapshot, type Vec3 } from './lib.ts';

const ROOT = new URL('../..', import.meta.url).pathname;
const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const out = argv.find((a) => !a.startsWith('--'));
if (!out) { console.error('usage: node tools/harness/fight-shots.ts <out.png> [--level=<id>] [--foe=<id>] [--size=WxH] [--build]'); process.exit(2); }
const lvl = flag('level') ?? '01-lower-stair';
const [W, H] = (flag('size') ?? '300x300').split('x').map(Number) as [number, number];

const pf = await preflight(ROOT, { skipBuild: !argv.includes('--build') });
if (!pf.browser || !pf.baseUrl) { for (const c of pf.result.checks) if (!c.ok) console.error(`preflight: ${c.name}: ${c.detail}`); process.exit(1); }
const page = await pf.browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errors: string[] = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
await page.goto(`${pf.baseUrl}/?harness=1&level=${lvl}`);
await page.waitForFunction(() => window.__HARNESS__?.version === 'HARNESS_API_V1');
const started = await page.evaluate(() => window.__HARNESS__!.start());
if (!started.ok) { console.error(`level failed to load: ${started.error}`); process.exit(1); }

let snap: Snapshot = await page.evaluate(() => window.__HARNESS__!.advance(60, 0));
const foe0 = snap.enemies.find((e) => e.id === (flag('foe') ?? snap.enemies[0]?.id));
if (!foe0) { console.error(`${lvl} has no swordsman${flag('foe') ? ` "${flag('foe')}"` : ''}`); process.exit(1); }
const id = foe0.id, post = foe0.pos;
const foe = (): Snapshot['enemies'][number] => snap.enemies.find((e) => e.id === id)!;
// in front of him, the way he faces: forward is (-sin, -cos) of his facing
const fwd: [number, number] = [-Math.sin((foe0.facing * Math.PI) / 180), -Math.cos((foe0.facing * Math.PI) / 180)];
const front = (m: number): Vec3 => [post[0] + fwd[0] * m, post[1], post[2] + fwd[1] * m];
const yawToFoe = (Math.atan2(fwd[0], fwd[1]) * 180) / Math.PI; // the warrior faces back along his forward
// the camera: off to one side of the line between them, a little above
const side: [number, number] = [fwd[1], -fwd[0]];
const cam: Vec3 = [post[0] + fwd[0] * 1.6 + side[0] * 5.6, post[1] + 1.7, post[2] + fwd[1] * 1.6 + side[1] * 5.6];
const target: Vec3 = [post[0] + fwd[0] * 1.6, post[1] + 0.9, post[2] + fwd[1] * 1.6];
await page.evaluate(([c, t]) => window.__HARNESS__!.setCamera(c, t), [cam, target] as const);

const step = async (f: InputFrame = NEUTRAL): Promise<Snapshot> => (snap = await page.evaluate((fr) => window.__HARNESS__!.step(fr, true), f));
const tiles: { label: string; png: Buffer }[] = [];
const shot = async (label: string): Promise<void> => { tiles.push({ label, png: await page.locator('canvas').first().screenshot() }); console.log(`  ${label.padEnd(26)} ${foe().mode} ${foe().modeTime.toFixed(3)}s`); };
/** Step until he is in `mode` and `sec` into it (or give up after `limit` ticks). */
const until = async (mode: string, sec: number, f: InputFrame = NEUTRAL, limit = 600): Promise<boolean> => {
  for (let i = 0; i < limit; i++) { if (foe().mode === mode && foe().modeTime >= sec - 1e-6) return true; await step(f); }
  console.error(`  never reached ${mode} at ${sec}s (he is in ${foe().mode})`);
  return false;
};
const put = async (m: number): Promise<void> => { await page.evaluate(([p, y]) => window.__HARNESS__!.teleportPlayer(p, y), [front(m), yawToFoe] as const); };
const F = await page.evaluate(() => ({ s: window.__HARNESS__!.fight.swordsman, windup: window.__HARNESS__!.windupSec(), again: window.__HARNESS__!.fight.warrior['againSec']! }));

// row 1: guard, then the warrior appears in front of him and he closes in
await put(F.s['sightRange']! + 1); // out of sight, and still on his ground
for (let i = 0; i < 40; i++) await step();
await shot('guard');
await put(F.s['sightRange']! - 0.3);
if (await until('close', 0.2)) await shot('notices, closes in');
if (await until('close', 0.45)) await shot('closing in');
// row 2: the warrior stands still: wind-up, cut, recovery
if (await until('windup', 0.02)) await shot('wind-up starts');
if (await until('windup', F.windup * 0.5)) await shot('wind-up, half');
if (await until('windup', F.windup - 0.02)) await shot('wind-up, end');
if (await until('slash', F.s['slashSec']! * 0.5)) await shot('the cut');
if (await until('recover', 0.15)) await shot('recovering (open)');
if (await until('recover', F.s['recoverSec']! * 0.7)) await shot('recovering, late');
// the warrior was cut: wait for the respawn, which puts the swordsman back on his post
for (let i = 0; i < 120 && snap.state !== 'play'; i++) await step();
// row 3 and 4: the warrior cuts him twice
await put(1.3);
for (let i = 0; i < 6; i++) await step(); // land
await step({ ...NEUTRAL, slash: true });
if (await until('stagger', 0.03)) await shot('first hit: staggered');
if (await until('stagger', F.s['staggerSec']! * 0.5)) await shot('staggered, half');
while (snap.slash !== null && snap.slash < F.again) await step();
await step({ ...NEUTRAL, slash: true });
if (await until('fallen', 0.05)) await shot('second hit: falls');
for (const t of [0.3, 0.7, 1.2, 2.2]) if (await until('fallen', t)) await shot(`fallen ${t}s`);

// ---- the sheet: tiles in rows of `cols`, a paper band under each for its label (drawn as a tick pattern-free bar) ----
const cols = 5, rows = Math.ceil(tiles.length / cols);
const sheet = new PNG({ width: cols * W, height: rows * H });
sheet.data.fill(255);
tiles.forEach((t, i) => {
  const img = PNG.sync.read(t.png);
  PNG.bitblt(img, sheet, 0, 0, Math.min(W, img.width), Math.min(H, img.height), (i % cols) * W, Math.floor(i / cols) * H);
});
writeFileSync(out, PNG.sync.write(sheet));
console.log(`${out}: ${tiles.length} tiles, ${cols} x ${rows}, ${W}x${H} each, in order: ${tiles.map((t) => t.label).join(' | ')}`);
if (errors.length) console.error(`console errors: ${errors.slice(0, 5).join(' | ')}`);
await pf.browser.close();
pf.server?.kill();
process.exit(errors.length ? 1 : 0);
