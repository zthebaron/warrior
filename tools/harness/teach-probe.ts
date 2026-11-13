// teach-probe — the moves as a player makes them, on the real rig, at the places the levels teach them
// (TEACH-AND-CHAPTER-SELECT). Every line the game shows a player about a move is a claim about what the rig
// does; this runs each claim, and its opposite, and prints what happened. Nothing here judges a level: it is
// a measuring tool, like shell-shots, and MEASUREMENTS.md "TEACH the moves as the rig makes them" is its output.
//
//   node tools/harness/teach-probe.ts [--build] [--only=wall,jump,...] [--json=<file>]
//
// It serves the HARNESS bundle (dist-harness/) on its own port and drives the game through the same public
// input API the nav bot uses (window.__HARNESS__.step -> the InputSystem override): held states, one frame a
// fixed tick, exactly what a keyboard gives. The player is PUT at the start of an attempt (teleportPlayer, as a
// respawn puts him) and never moved again during it. One playtest or frame tool at a time.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { CHROMIUM_ARGS, VIEWPORT, type InputFrame, type Vec3 } from './lib.ts';

const ROOT = new URL('../..', import.meta.url).pathname;
const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const PORT = 4331; // beside preflight's 4317, reachable's 4318 and shell-shots' 4319
const ONLY = flag('only')?.split(',') ?? null;
const wants = (name: string): boolean => !ONLY || ONLY.includes(name);

const run = (cmd: string, args: string[]): Promise<number> => new Promise((res) => spawn(cmd, args, { cwd: ROOT, stdio: 'inherit' }).on('exit', (c) => res(c ?? 1)));
if (argv.includes('--build') && (await run(join(ROOT, 'node_modules/.bin/vite'), ['build', '--mode', 'harness', '--outDir', 'dist-harness', '--emptyOutDir', '--logLevel', 'error'])) !== 0) process.exit(2);
const server = spawn(join(ROOT, 'node_modules/.bin/vite'), ['preview', '--outDir', 'dist-harness', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: ROOT });
await new Promise<void>((res, rej) => {
  let buf = '';
  const t = setTimeout(() => rej(new Error(`preview not ready: ${buf}`)), 20000);
  const on = (d: Buffer): void => { buf += d.toString(); if (buf.includes(String(PORT))) { clearTimeout(t); res(); } };
  server.stdout.on('data', on);
  server.stderr.on('data', on);
});

/**
 * One stretch of held input: this frame for this many ticks, or until something is true of the player, whichever
 * comes first: 'apex' (rising has stopped), 'air', 'ground', 'wall' (touching one: wall_slide, or stopped dead in
 * the air), 'dashend' (was dashing, is not), 's:<state>', 'x>=<n>'. What a player's eyes and thumbs do.
 */
type Hold = [Partial<InputFrame>, number, string?];
/** What an attempt did, tick by tick, boiled down. */
interface Trace {
  /** every state the player was in, in order, each once per run of ticks */
  states: string[];
  /** the highest the feet got, and where they ended */
  peak: number;
  end: Vec3;
  endState: string;
  /** the first tick (from the start of the attempt) the player was in each state */
  first: Record<string, number>;
  /** feet when each state was first entered */
  at: Record<string, Vec3>;
  deaths: number;
  /** the furthest the feet got along +x */
  far: number;
  grounded: boolean;
  /** how many ticks each hold lasted, and the feet when it ended */
  holds: { ticks: number; feet: Vec3 }[];
  /** the swordsmen at the end: id, mode, hits */
  foes: { id: string; mode: string; hits: number }[];
  /** the game's state at the end, and the feet at the first tick after a death (where he was sent back to) */
  game: string;
  back: Vec3 | null;
}

const browser = await chromium.launch({ args: CHROMIUM_ARGS }).catch((e: unknown) => { server.kill(); throw e; }); // never leave the preview behind
const out: Record<string, unknown> = {};

async function open(levelId: string): Promise<Page> {
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error(`PAGEERROR ${e.message}`));
  await page.goto(`http://127.0.0.1:${PORT}/?harness=1&level=${levelId}`);
  await page.waitForFunction(() => window.__HARNESS__?.version === 'HARNESS_API_V1', null, { timeout: 30000 });
  const started = await page.evaluate(() => window.__HARNESS__!.start());
  if (!started.ok) throw new Error(`${levelId} did not start: ${started.error}`);
  return page;
}

/** Put the player at `feet` facing +x (as a respawn does), let him land, then play `holds`. */
async function attempt(page: Page, feet: Vec3, holds: Hold[], settle = 30): Promise<Trace> {
  return page.evaluate(([pos, hs, settleTicks]) => {
    const H = window.__HARNESS__!;
    const neutral = { x: 0, y: 0, jump: false, dash: false, sprint: false, slash: false };
    H.teleportPlayer(pos as [number, number, number], -90);
    const deaths0 = H.snapshot().deaths;
    for (let i = 0; i < (settleTicks as number); i++) H.step(neutral, false);
    const states: string[] = [];
    const first: Record<string, number> = {};
    const at: Record<string, [number, number, number]> = {};
    let peak = -Infinity, far = -Infinity, tick = 0;
    let s = H.snapshot();
    let back: [number, number, number] | null = null, wasDead = false;
    const holds: { ticks: number; feet: [number, number, number] }[] = [];
    for (const [f, n, until] of hs as [Record<string, unknown>, number, string | undefined][]) {
      let k = 0, rose = false, dashed = false;
      for (; k < n; k++) {
        const before = s;
        s = H.step({ ...neutral, ...f }, false);
        tick++;
        if (s.state !== 'play') { wasDead = true; continue; } // between a death and the respawn the player is not stepped
        if (wasDead) { wasDead = false; back = [...s.feet] as [number, number, number]; }
        if (states[states.length - 1] !== s.pstate) states.push(s.pstate);
        if (first[s.pstate] === undefined) { first[s.pstate] = tick; at[s.pstate] = [...s.feet] as [number, number, number]; }
        peak = Math.max(peak, s.feet[1]);
        far = Math.max(far, s.feet[0]);
        if (s.vel[1] > 0) rose = true;
        if (s.pstate === 'dash') dashed = true;
        if (!until) continue;
        const stopped = !s.grounded && k > 0 && Math.abs(s.feet[0] - before.feet[0]) < 1e-4 && Math.abs(s.feet[2] - before.feet[2]) < 1e-4;
        if ((until === 'apex' && rose && s.vel[1] <= 0)
          || (until === 'air' && !s.grounded)
          || (until === 'ground' && s.grounded)
          || (until === 'wall' && (s.pstate === 'wall_slide' || stopped))
          || (until === 'dashend' && dashed && s.pstate !== 'dash')
          || (until.startsWith('p<=') && (s.platforms[0]?.pos[0] ?? Infinity) <= Number(until.slice(3)))
          || (until.startsWith('p>=') && (s.platforms[0]?.pos[0] ?? -Infinity) >= Number(until.slice(3)))
          || (until.startsWith('foe:') && s.enemies[0]?.mode === until.slice(4))
          || (until.startsWith('s:') && s.pstate === until.slice(2))
          || (until.startsWith('x>=') && s.feet[0] >= Number(until.slice(3)))) { k++; break; }
      }
      holds.push({ ticks: k, feet: [...s.feet] as [number, number, number] });
    }
    H.setInput(null);
    return { states, peak, end: s.feet, endState: s.pstate, first, at, deaths: s.deaths - deaths0, far, grounded: s.grounded, holds,
      foes: s.enemies.map((e) => ({ id: e.id, mode: e.mode, hits: e.hits })), game: s.state, back };
  }, [feet, holds, settle] as const);
}

const r2 = (n: number): string => n.toFixed(2);
const seq = (t: Trace): string => t.states.join(' > ');
const PUSH = { x: 1 };           // the level runs along +x: this is "into the wall", and "forward"
const level = (id: string): { critical_path: ({ pos: Vec3; via?: string; platform?: string } | Vec3)[]; spawn: { pos: Vec3 } } => JSON.parse(readFileSync(join(ROOT, 'levels', `${id}.json`), 'utf8'));
const wpos = (w: { pos: Vec3 } | Vec3): Vec3 => (Array.isArray(w) ? w : w.pos);

try {
  // ------------------------------------------------------------------ the wall: chapter 2's first face
  if (wants('wall')) {
    const L = level('02-cliff-seam');
    const i = L.critical_path.findIndex((w) => !Array.isArray(w) && w.via === 'climb');
    const foot = wpos(L.critical_path[i - 1]!), top = wpos(L.critical_path[i]!);
    const page = await open('02-cliff-seam');
    const tun = await page.evaluate(() => window.__HARNESS__!.tuning);
    // where the wall is: walk into it and see where the feet stop
    const walked = await attempt(page, foot, [[PUSH, 120]]);
    const stopX = walked.end[0];
    const face = top[1] - foot[1];
    console.log(`\n== the wall: 02-cliff-seam step ${i}, from (${foot.join(', ')}) to (${top.join(', ')}): a +${face} face. Walking in stops the feet at x ${r2(stopX)} (the face is at x ${r2(stopX + tun['capsuleRadius']!)}).`);
    console.log(`   the rig: a held jump peaks at ${r2((tun['jumpVelocity']! ** 2) / (2 * tun['gravity']!))} m (v^2/2g); the grab window is a ledge top ${r2(tun['ledgeProbeTopAboveFeet']! - tun['ledgeProbeLength']!)}..${r2(tun['ledgeProbeTopAboveFeet']!)} m above the feet,`);
    console.log(`   so on this face the feet must be ${r2(face - tun['ledgeProbeTopAboveFeet']!)}..${r2(face - (tun['ledgeProbeTopAboveFeet']! - tun['ledgeProbeLength']!))} m up, falling, touching the wall, with the stick into it.`);
    const atWall: Vec3 = [stopX, foot[1], foot[2]];
    const rows: Record<string, unknown>[] = [];
    const show = (name: string, t: Trace): void => {
      const caught = t.first['ledge_grab'] !== undefined;
      rows.push({ name, caught, peak: Number(r2(t.peak)), states: seq(t), end: t.end.map((n) => Number(r2(n))) });
      console.log(`   ${caught ? 'CAUGHT' : 'no    '}  ${name.padEnd(64)} peak ${r2(t.peak)}  ${seq(t)}`);
    };

    console.log('\n   -- the three the brief names, standing at the foot of the face');
    // a tapped jump: the key down for 1..N ticks (a quick tap on a keyboard is 3 to 6 ticks), pushing in throughout
    for (const n of [1, 2, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24]) show(`jump held ${n} tick(s) (${(n / 60 * 1000).toFixed(0)} ms), pushing in`, await attempt(page, atWall, [[PUSH, 20], [{ ...PUSH, jump: true }, n], [PUSH, 90]]));
    show('jump HELD, pushing in', await attempt(page, atWall, [[PUSH, 20], [{ ...PUSH, jump: true }, 90]]));
    show('jump HELD, NOT pushing in (standing against the wall)', await attempt(page, atWall, [[PUSH, 20], [{}, 10], [{ jump: true }, 90]]));
    show('jump HELD, pushing in only on the way up (let go at the peak)', await attempt(page, atWall, [[PUSH, 20], [{ ...PUSH, jump: true }, 22], [{ jump: true }, 70]]));
    show('jump HELD, pushing in only on the way down', await attempt(page, atWall, [[PUSH, 20], [{ jump: true }, 22], [{ ...PUSH, jump: true }, 70]]));

    console.log('\n   -- "every time": a held jump, pushing in, from a run. Takeoff d metres short of where the feet stop.');
    const grid: { sprint: boolean; d: number; z: number; caught: boolean; peak: number }[] = [];
    for (const sprint of [false, true]) {
      for (const z of [-1.5, 0, 1.5]) {
        let line = `   ${sprint ? 'sprint' : 'run   '} z ${String(z).padStart(4)}: `;
        for (let d = 0; d <= 7.001; d += 0.25) {
          // start far enough back to be at full speed at the takeoff, then jump (held) when the feet pass it
          const start: Vec3 = [stopX - d - 4, foot[1], foot[2] + z];
          const t = await page.evaluate(([pos, takeoffX, sp]) => {
            const H = window.__HARNESS__!;
            const neutral = { x: 0, y: 0, jump: false, dash: false, sprint: false, slash: false };
            H.teleportPlayer(pos as [number, number, number], -90);
            for (let k = 0; k < 30; k++) H.step(neutral, false);
            let s = H.snapshot(), jumped = false, caught = false, peak = -Infinity;
            for (let k = 0; k < 400 && !caught; k++) {
              if (!jumped && s.feet[0] >= (takeoffX as number) - 1e-6) jumped = true;
              s = H.step({ ...neutral, x: 1, sprint: sp as boolean, jump: jumped }, false);
              peak = Math.max(peak, s.feet[1]);
              if (s.pstate === 'ledge_grab') caught = true;
              if (jumped && s.grounded && k > 0 && s.feet[1] < 0.01 && s.vel[1] === 0 && peak > 0.5) break; // back on the floor
            }
            H.setInput(null);
            return { caught, peak };
          }, [start, stopX - d, sprint] as const);
          grid.push({ sprint, d, z, caught: t.caught, peak: t.peak });
          line += t.caught ? 'C' : '.';
        }
        console.log(`${line}   (d = 0, 0.25, ... 7.0)`);
      }
    }
    const reach = (sprint: boolean): number => Math.max(...grid.filter((g) => g.sprint === sprint && g.caught).map((g) => g.d));
    const holes = grid.filter((g) => !g.caught && g.d < reach(g.sprint));
    console.log(`   caught from every takeoff out to ${reach(false)} m at a run and ${reach(true)} m at a sprint; ${holes.length ? `MISSES INSIDE THAT: ${holes.map((h) => `${h.sprint ? 'sprint' : 'run'} d ${h.d} z ${h.z}`).join(', ')}` : 'no miss inside either'}.`);

    console.log('\n   -- what a player who does not know the move tries');
    show('jump tapped, then jump again at the wall (pushing in)', await attempt(page, atWall, [[PUSH, 20], [{ ...PUSH, jump: true }, 4], [PUSH, 6], [{ ...PUSH, jump: true }, 4], [PUSH, 120]]));
    show('jump held, then jump again at the peak (pushing in)', await attempt(page, atWall, [[PUSH, 20], [{ ...PUSH, jump: true }, 20], [PUSH, 2], [{ ...PUSH, jump: true }, 30], [PUSH, 120]]));
    show('jump mashed: 4 ticks down, 6 up, eight times (pushing in)', await attempt(page, atWall, [[PUSH, 20], ...Array.from({ length: 8 }, (): Hold[] => [[{ ...PUSH, jump: true }, 4], [PUSH, 6]]).flat(), [PUSH, 120]]));
    show('jump tapped away from the wall, then the air jump, pushing in', await attempt(page, [stopX - 3, foot[1], foot[2]], [[{ ...PUSH, jump: true }, 4], [PUSH, 14], [{ ...PUSH, jump: true }, 30], [PUSH, 120]]));

    console.log('\n   -- the hang');
    const hang: Hold[] = [[PUSH, 20], [{ ...PUSH, jump: true }, 60]];
    show('caught, then every key let go for 3 s', await attempt(page, atWall, [...hang, [{}, 180]]));
    show('caught, jump still held for 3 s (no second press)', await attempt(page, atWall, [...hang, [{ ...PUSH, jump: true }, 180]]));
    const up = await attempt(page, atWall, [...hang, [{}, 6], [{ jump: true }, 4], [{}, 60]]);
    show('caught, let go, jump pressed again', up);
    console.log(`          ... which ends ${up.grounded ? 'standing' : 'NOT standing'} at (${up.end.map(r2).join(', ')}): the top of the face is y ${top[1]}`);
    show('caught, then pushing away from the wall', await attempt(page, atWall, [...hang, [{}, 6], [{ x: -1 }, 60]]));
    out['wall'] = { step: i, foot, top, face, stopX, rows, grid, reachRun: reach(false), reachSprint: reach(true), holes };
    await page.close();
  }

  /** One line of a section: what was tried, whether it did what the game's line says, and the trace. */
  const line = (rows: Record<string, unknown>[], name: string, ok: boolean, t: Trace, extra = ''): void => {
    rows.push({ name, ok, peak: Number(r2(t.peak)), far: Number(r2(t.far)), end: t.end.map((n) => Number(r2(n))), states: seq(t), deaths: t.deaths, note: extra });
    console.log(`   ${ok ? 'yes' : 'no '}  ${name.padEnd(66)} ${extra ? `${extra}  ` : ''}end (${t.end.map(r2).join(', ')})${t.deaths ? ` DIED x${t.deaths}` : ''}  ${seq(t)}`);
  };
  const J = { jump: true };
  const firstVia = (L: ReturnType<typeof level>, via: string): { i: number; a: Vec3; b: Vec3 } => {
    const i = L.critical_path.findIndex((w) => !Array.isArray(w) && w.via === via);
    return { i, a: wpos(L.critical_path[i - 1]!), b: wpos(L.critical_path[i]!) };
  };
  /** Standing on the target's floor: grounded, at its height, and past where the run to it began. */
  const landedOn = (t: Trace, b: Vec3, a: Vec3): boolean => t.grounded && t.deaths === 0 && Math.abs(t.end[1] - b[1]) < 0.3
    && (b[1] - a[1] > 0.3 || Math.hypot(t.end[0] - a[0], t.end[2] - a[2]) > 0.5 * Math.hypot(b[0] - a[0], b[2] - a[2])); // up a rise: its height says it; across a gap: past half of it

  // ------------------------------------------------------------------ the fight and the jump: chapter 1
  if (wants('fight') || wants('jump')) {
    const L = level('01-lower-stair') as ReturnType<typeof level> & { enemies: { id: string; pos: Vec3 }[] };
    const page = await open('01-lower-stair');
    const fight = await page.evaluate(() => window.__HARNESS__!.fight);
    const foe = L.enemies[0]!;
    const spawn = L.spawn.pos;
    const rows: Record<string, unknown>[] = [];
    console.log(`\n== the fight: 01-lower-stair, ${foe.id} at (${foe.pos.join(', ')}), ${r2(foe.pos[0] - spawn[0])} m from the spawn. He sees ${fight.swordsman['sightRange']} m; the warrior's blade reaches ${fight.warrior['reach']} m, his ${fight.swordsman['reach']} m; he falls on hit ${fight.swordsman['hitsToFall']}.`);
    const reachX = foe.pos[0] - fight.warrior['reach']! * 0.85;
    const mode = (t: Trace): string => { const f = t.foes.find((e) => e.id === foe.id); return f ? `${f.mode}, ${f.hits} hit(s)` : 'gone'; };
    // every attempt in this section starts with him on his feet: a death resets him, and so does this
    const fresh = async (): Promise<void> => { await page.evaluate(() => { const H = window.__HARNESS__!; const s = H.snapshot(); H.respawnAt([0, 0, 0], -90, s.tick); }); };
    let t = await attempt(page, spawn, [[{}, 300]]);
    line(rows, 'stand at the spawn for 5 s', t.deaths === 0, t, `he is ${mode(t)}`);
    await fresh();
    t = await attempt(page, spawn, [[PUSH, 200, `x>=${reachX}`], [{}, 400, 'foe:slash'], [{}, 120]]);
    line(rows, 'walk up to him and stand there', t.deaths === 1, t, `cut down after ${t.holds[1]!.ticks} ticks of standing; sent back to (${t.back?.map(r2).join(', ') ?? 'nowhere'})`);
    await fresh();
    t = await attempt(page, spawn, [[{ slash: true }, 2], [{}, 40]]);
    line(rows, 'slash from the spawn (out of reach)', t.foes[0]!.hits === 0, t, `he is ${mode(t)}`);
    await fresh();
    t = await attempt(page, spawn, [[PUSH, 200, `x>=${reachX}`], [{ slash: true }, 2], [{}, 20]]);
    line(rows, 'walk up, one slash', t.foes[0]!.hits === 1 && t.foes[0]!.mode !== 'fallen', t, `he is ${mode(t)}`);
    await fresh();
    t = await attempt(page, spawn, [[PUSH, 200, `x>=${reachX}`], [{ slash: true }, 2], [{}, 15], [{ slash: true }, 2], [{}, 30]]);
    line(rows, 'walk up, slash, slash again', t.foes[0]!.mode === 'fallen' && t.deaths === 0, t, `he is ${mode(t)}`);
    await fresh();
    t = await attempt(page, spawn, [[PUSH, 200, `x>=${reachX}`], [{ slash: true }, 40]]);
    const held = t.foes[0]!.hits;
    t = await attempt(page, spawn, [[PUSH, 200, `x>=${reachX}`], [{ slash: true }, 300]]);
    line(rows, 'walk up, hold the sword key down for 5 s', held === 1 && t.deaths === 1, t, `a held key is one slash: ${held} hit after 40 ticks; then he recovers and cuts: sent back to (${t.back?.map(r2).join(', ') ?? 'nowhere'})`);
    out['fight'] = { foe, rows };

    // the jump: the path's first is the +1.25 step he guards, so he is felled first (he stays down until a death)
    await fresh();
    t = await attempt(page, spawn, [[PUSH, 200, `x>=${reachX}`], [{ slash: true }, 2], [{}, 15], [{ slash: true }, 2], [{}, 30]]);
    const jrows: Record<string, unknown>[] = [];
    const s1 = firstVia(L, 'jump');
    console.log(`\n== the jump: 01-lower-stair step ${s1.i}, from (${s1.a.join(', ')}) to (${s1.b.join(', ')}): +${s1.b[1] - s1.a[1]}. (${foe.id} is ${mode(t)}.)`);
    // the jump, then forward until he is down again, then nothing: he ends standing where the jump put him
    const hop = (n: number): Hold[] => [[PUSH, 200, `x>=${s1.a[0]}`], [{ ...PUSH, ...J }, n, 'ground'], [PUSH, 90, 'ground'], [{}, 20]];
    for (const n of [1, 2, 3, 4, 6]) {
      t = await attempt(page, [s1.a[0] - 2, s1.a[1], s1.a[2]], hop(n), 20);
      line(jrows, `run, jump at the takeoff, key down ${n} tick(s) (${(n / 60 * 1000).toFixed(0)} ms)`, landedOn(t, s1.b, s1.a), t, `peak +${r2(t.peak - s1.a[1])}`);
    }
    t = await attempt(page, [s1.a[0] - 2, s1.a[1], s1.a[2]], hop(90), 20);
    line(jrows, 'run, jump at the takeoff, key HELD', landedOn(t, s1.b, s1.a), t, `peak +${r2(t.peak - s1.a[1])}`);
    // the +1.75 shelf, the tallest single jump on chapter 1's path
    const cp = L.critical_path.map(wpos);
    const k = L.critical_path.findIndex((w, idx) => idx > s1.i && !Array.isArray(w) && w.via === 'jump' && wpos(w)[1] - cp[idx - 1]![1] > 1.5);
    const a2 = cp[k - 1]!, b2 = cp[k]!;
    console.log(`   -- step ${k}, from (${a2.join(', ')}) to (${b2.join(', ')}): +${b2[1] - a2[1]}`);
    const hop2 = (n: number): Hold[] => [[PUSH, 200, `x>=${a2[0]}`], [{ ...PUSH, ...J }, n], [PUSH, 90, 'ground'], [{}, 20]];
    for (const n of [1, 2, 4, 5, 6, 8]) {
      t = await attempt(page, [a2[0] - 0.4, a2[1], a2[2]], hop2(n), 20);
      line(jrows, `run, jump at the takeoff, key down ${n} tick(s) (${(n / 60 * 1000).toFixed(0)} ms)`, landedOn(t, b2, a2), t, `peak +${r2(t.peak - a2[1])}${t.endState === 'ledge_grab' ? '; HANGING from the shelf, a move chapter 1 does not teach' : ''}`);
    }
    t = await attempt(page, [a2[0] - 0.4, a2[1], a2[2]], hop2(90), 20);
    line(jrows, 'run, jump at the takeoff, key HELD', landedOn(t, b2, a2), t, `peak +${r2(t.peak - a2[1])}`);
    out['jump'] = { step: s1.i, rows: jrows };
    await page.close();
  }

  // ------------------------------------------------------------------ the wall jump and the double: chapter 2
  if (wants('kick') || wants('double')) {
    const L = level('02-cliff-seam');
    const page = await open('02-cliff-seam');
    if (wants('kick')) {
      const { i, a, b } = firstVia(L, 'wall');
      const rows: Record<string, unknown>[] = [];
      // "into the wall" comes from the waypoints, as the bot takes it: the wall lies beyond a on the side away from b
      const dz = Math.sign(a[2] - b[2]) || -1;
      const IN = { y: dz }, OUT = { y: -dz };
      console.log(`\n== the wall jump: 02-cliff-seam step ${i}, from (${a.join(', ')}) to (${b.join(', ')}): +${b[1] - a[1]}, the wall on the z ${dz < 0 ? '-' : '+'} side.`);
      let t = await attempt(page, a, [[{ ...IN, ...J }, 120, 'ground']]);
      line(rows, 'jump at the wall, keep pushing in, do nothing else', t.first['wall_slide'] !== undefined, t, `slides: ${t.first['wall_slide'] !== undefined}; peak +${r2(t.peak - a[1])}`);
      t = await attempt(page, a, [[{ ...IN, ...J }, 60, 's:wall_slide'], [IN, 4], [{ ...IN, ...J }, 3], [{ ...OUT, ...J }, 120, 'ground']]);
      line(rows, 'jump at the wall, slide, press jump, steer away', landedOn(t, b, a), t, `peak +${r2(t.peak - a[1])}`);
      t = await attempt(page, a, [[{ ...IN, ...J }, 60, 'wall'], [IN, 2], [{ ...IN, ...J }, 3], [{ ...OUT, ...J }, 120, 'ground']]);
      line(rows, 'jump at the wall, press jump again as he touches it, steer away', landedOn(t, b, a), t, `peak +${r2(t.peak - a[1])}; kicked: ${t.first['wall_jump'] !== undefined}`);
      t = await attempt(page, a, [[{ ...IN, ...J }, 60, 'wall'], [{}, 2], [J, 3], [{ ...OUT, ...J }, 120, 'ground']]);
      line(rows, 'the same, letting go of the stick before the second press', landedOn(t, b, a), t, `peak +${r2(t.peak - a[1])}; kicked: ${t.first['wall_jump'] !== undefined}`);
      t = await attempt(page, a, [[{ ...IN, ...J }, 60, 'wall'], [IN, 2], [{ ...IN, ...J }, 3], [IN, 120, 'ground']]);
      line(rows, 'jump at the wall, press jump again, keep pushing INTO the wall', landedOn(t, b, a), t, `peak +${r2(t.peak - a[1])}`);
      // not the wall at all: the shelf's own face is a ledge within the grab's reach
      t = await attempt(page, a, [[{ ...OUT, ...J }, 120, 's:ledge_grab'], [OUT, 6], [{ ...OUT, ...J }, 4], [{}, 40]]);
      line(rows, 'NO wall jump: a held jump at the shelf\'s own face, pushing in, then jump from the hang', landedOn(t, b, a), t, `peak +${r2(t.peak - a[1])}; a ledge grab, not a wall jump`);
      out['kick'] = { step: i, rows };
    }
    if (wants('double')) {
      const { i, a, b } = firstVia(L, 'double');
      const rows: Record<string, unknown>[] = [];
      console.log(`\n== the double jump: 02-cliff-seam step ${i}, from (${a.join(', ')}) to (${b.join(', ')}): +${b[1] - a[1]}.`);
      const from: Vec3 = [a[0] - 2, a[1], a[2]];
      const runTo = (x: number): Hold => [PUSH, 300, `x>=${x}`];
      let t = await attempt(page, from, [runTo(a[0]), [{ ...PUSH, ...J }, 90, 'ground']], 20);
      line(rows, 'run, one held jump at the takeoff', landedOn(t, b, a), t, `peak +${r2(t.peak - a[1])}`);
      t = await attempt(page, from, [runTo(a[0]), [{ ...PUSH, ...J }, 60, 'apex'], [PUSH, 2], [{ ...PUSH, ...J }, 120, 'ground']], 20);
      line(rows, 'run, held jump at the takeoff, jump again at the peak', landedOn(t, b, a), t, `peak +${r2(t.peak - a[1])}`);
      t = await attempt(page, from, [runTo(a[0]), [{ ...PUSH, ...J }, 4], [PUSH, 4], [{ ...PUSH, ...J }, 4], [PUSH, 120, 'ground']], 20);
      line(rows, 'run, tap, tap (4 ticks each)', landedOn(t, b, a), t, `peak +${r2(t.peak - a[1])}`);
      const faceX = b[0] - 2; // the face stands 2 short of the waypoint on it
      t = await attempt(page, from, [runTo(faceX - 1.2), [{ ...PUSH, ...J }, 60, 'wall'], [PUSH, 2], [{ ...PUSH, ...J }, 120, 'ground']], 20);
      line(rows, 'run to the face, jump, jump again touching it', landedOn(t, b, a), t, `peak +${r2(t.peak - a[1])}; it was a ${t.first['wall_jump'] !== undefined ? 'WALL JUMP (kicked away)' : 'double jump'}`);
      t = await attempt(page, from, [runTo(faceX - 1.2), [{ ...PUSH, ...J }, 60, 'wall'], [PUSH, 2], [{ ...PUSH, ...J }, 14], [PUSH, 2], [{ ...PUSH, ...J }, 120, 'ground']], 20);
      line(rows, '... and a third press after the kick', landedOn(t, b, a), t, `peak +${r2(t.peak - a[1])}`);
      t = await attempt(page, from, [runTo(a[0]), [{ ...PUSH, ...J }, 120, 's:ledge_grab'], [PUSH, 6], [{ ...PUSH, ...J }, 4], [{}, 40]], 20);
      line(rows, 'NO double: one held jump at the takeoff, pushing in, then jump from the hang', landedOn(t, b, a), t, `peak +${r2(t.peak - a[1])}; a ledge grab, not a double jump`);
      t = await attempt(page, [a[0] - 6, a[1], a[2]], [[J, 60, 'apex'], [{}, 2], [J, 120, 'ground']], 20);
      line(rows, 'standing: held jump, held jump at the peak', true, t, `peak +${r2(t.peak - a[1])}`);
      t = await attempt(page, [a[0] - 6, a[1], a[2]], [[J, 60, 'apex'], [{}, 2], [J, 60, 'apex'], [{}, 2], [J, 120, 'ground']], 20);
      line(rows, 'standing: a third press in the air', t.states.filter((s) => s === 'double_jump').length === 1, t, `${t.states.filter((s) => s === 'double_jump').length} double jump(s)`);
      out['double'] = { step: i, rows };
    }
    await page.close();
  }

  // ------------------------------------------------------------------ the stone and the dash: chapter 3
  if (wants('platform') || wants('dash') || wants('range')) {
    const L = level('03-drifting-stones') as ReturnType<typeof level> & { platforms: { id: string; path: Vec3[] }[] };
    const page = await open('03-drifting-stones');
    if (wants('platform')) {
      const { i, a, b } = firstVia(L, 'platform');
      const rows: Record<string, unknown>[] = [];
      const stone = L.platforms[0]!;
      const torii = wpos(L.critical_path[i - 2]!);
      const [p0, p1] = [stone.path[0]![0], stone.path[1]![0]];
      console.log(`\n== the drifting stone: 03-drifting-stones step ${i}, ${stone.id} from x ${p0} to x ${p1}; boarded at (${a.join(', ')}), left at (${b.join(', ')}).`);
      let t = await attempt(page, torii, [[{}, 600, `p<=${p0 + 0.3}`], [PUSH, 120, `x>=${a[0]}`], [{}, 600, `p>=${p1 - 0.3}`], [PUSH, 120, `x>=${b[0] + 2.2}`], [{}, 20]]);
      const rode = t.holds[2]!.feet[0] - t.holds[1]!.feet[0];
      line(rows, 'wait for it, step on, stand still, step off at the far side', t.deaths === 0 && t.grounded && t.end[0] > b[0], t, `carried ${r2(rode)} m in ${t.holds[2]!.ticks} ticks without a key down`);
      out['platform'] = { step: i, rows };
    }
    if (wants('range')) {
      // how far each move carries over flat ground at a run: chapter 3's second floor (x 33..48.3, y 1), which has
      // no swordsman, no sweep and no torii before x 48. From the takeoff to where the feet come down.
      const y = 1, x0 = 33.4, take = 34.2;
      console.log(`\n== how far each move carries on the flat at a run (03-drifting-stones, y ${y}, takeoff x ${take}; a torii stands at x 48)`);
      const rows: Record<string, unknown>[] = [];
      const moves: [string, Hold[]][] = [
        ['jump (held)', [[{ ...PUSH, ...J }, 200, 'ground']]],
        ['jump, air jump at the peak', [[{ ...PUSH, ...J }, 60, 'apex'], [PUSH, 2], [{ ...PUSH, ...J }, 200, 'ground']]],
        ['dash', [[{ ...PUSH, dash: true }, 60, 'dashend']]],
        ['dash, jump as it ends', [[{ ...PUSH, dash: true }, 60, 'dashend'], [{ ...PUSH, ...J }, 200, 'ground']]],
        ['dash, jump as it ends, air jump at the peak', [[{ ...PUSH, dash: true }, 60, 'dashend'], [{ ...PUSH, ...J }, 60, 'apex'], [PUSH, 2], [{ ...PUSH, ...J }, 200, 'ground']]],
      ];
      for (const [name, holds] of moves) {
        const t = await attempt(page, [x0, y, 0], [[PUSH, 300, `x>=${take}`], ...holds, [{}, 1]], 20);
        const d = t.end[0] - t.holds[0]!.feet[0];
        rows.push({ name, metres: Number(r2(d)), peak: Number(r2(t.peak - y)) });
        console.log(`   ${name.padEnd(46)} ${r2(d).padStart(6)} m   peak +${r2(t.peak - y)}   ${seq(t)}`);
      }
      out['range'] = rows;
    }
    if (wants('dash')) {
      const { i, a, b } = firstVia(L, 'dash');
      const rows: Record<string, unknown>[] = [];
      console.log(`\n== the dash: 03-drifting-stones step ${i}, from (${a.join(', ')}) to (${b.join(', ')}): a gap under a lintel.`);
      const from: Vec3 = [a[0] - 3, a[1], a[2]];
      const edge = a[0] + 0.3;
      let t = await attempt(page, from, [[PUSH, 300, `x>=${edge}`], [{ ...PUSH, dash: true }, 30, 'dashend'], [PUSH, 30]], 20);
      line(rows, 'run, dash at the edge', t.deaths === 0 && t.grounded && t.end[0] > b[0] - 0.5, t);
      t = await attempt(page, from, [[PUSH, 300, `x>=${edge}`], [{ ...PUSH, ...J }, 120, 'ground'], [PUSH, 60]], 20);
      line(rows, 'run, held jump at the edge', t.deaths === 0 && t.grounded && t.end[0] > b[0] - 0.5, t, `peak +${r2(t.peak - a[1])}`);
      t = await attempt(page, from, [[PUSH, 300]], 20);
      line(rows, 'run off the edge', t.deaths === 0 && t.grounded && t.end[0] > b[0] - 0.5, t);
      t = await attempt(page, from, [[PUSH, 300, 's:ledge_grab'], [PUSH, 6], [{ ...PUSH, ...J }, 4], [{}, 40]], 20);
      line(rows, 'NO dash: run off the edge, keep pushing, then jump from the hang', t.deaths === 0 && t.grounded && t.end[0] > b[0] - 0.5, t, 'he catches the far side as he falls: a ledge grab, not a dash');
      const flat: Vec3 = [b[0] + 1, b[1], b[2]];
      t = await attempt(page, flat, [[{ dash: true }, 30, 'dashend'], [{}, 30]], 20);
      line(rows, 'standing, dash with no direction held', t.first['dash'] !== undefined, t, `moved ${r2(t.end[0] - flat[0])} m the way he faces`);
      t = await attempt(page, flat, [[{ x: 0, y: 1, dash: true }, 30, 'dashend'], [{}, 30]], 20);
      line(rows, 'standing, dash with the stick to the side', t.first['dash'] !== undefined, t, `moved ${r2(t.end[2] - flat[2])} m sideways`);
      t = await attempt(page, flat, [[{ dash: true }, 30, 'dashend'], [{}, 2], [{ dash: true }, 4], [{}, 30]], 20);
      line(rows, 'dash, and again at once', t.states.filter((s) => s === 'dash').length === 1, t, `${t.states.filter((s) => s === 'dash').length} dash(es): the second is refused for ${r2((await page.evaluate(() => window.__HARNESS__!.tuning))['dashCooldownSec']!)} s`);
      t = await attempt(page, flat, [[J, 60, 'apex'], [{ ...J, dash: true }, 4], [J, 22], [{ ...J, dash: true }, 4], [{}, 120, 'ground']], 20);
      line(rows, 'jump, dash at the peak, dash again in the air', t.states.filter((s) => s === 'dash').length === 1, t, `${t.states.filter((s) => s === 'dash').length} dash(es) in the air`);
      out['dash'] = { step: i, rows };
    }
    await page.close();
  }

  // ------------------------------------------------------------------ the dash jump: chapter 4
  if (wants('dashjump')) {
    const L = level('04-summit-ridge');
    const page = await open('04-summit-ridge');
    const { i, a, b } = firstVia(L, 'dashjump');
    const rows: Record<string, unknown>[] = [];
    console.log(`\n== the dash jump: 04-summit-ridge step ${i}, from (${a.join(', ')}) to (${b.join(', ')}): +${b[1] - a[1]} over a gap.`);
    const from: Vec3 = [a[0] - 4, a[1], a[2]];
    const runTo = (x: number): Hold => [PUSH, 300, `x>=${x}`];
    const over = (t: Trace): boolean => t.deaths === 0 && t.grounded && Math.abs(t.end[1] - b[1]) < 0.3;
    let t = await attempt(page, from, [runTo(a[0]), [{ ...PUSH, dash: true }, 30, 'dashend'], [{ ...PUSH, ...J }, 200, 'ground']], 20);
    line(rows, 'run, dash at the torii, jump as the dash ends (held)', over(t), t, `peak +${r2(t.peak - a[1])}`);
    console.log('   -- the timing: the jump key goes down k ticks after the dash key (the dash lasts 10 ticks)');
    let window = '';
    for (let k = 1; k <= 24; k++) {
      t = await attempt(page, from, [runTo(a[0]), [{ ...PUSH, dash: true }, k], [{ ...PUSH, ...J }, 200, 'ground']], 20);
      window += over(t) ? 'C' : '.';
    }
    console.log(`      k = 1..24: ${window}   (C clears the gap)`);
    rows.push({ name: 'dash, jump k ticks later, k = 1..24', window });
    t = await attempt(page, from, [runTo(a[0] + 0.5), [{ ...PUSH, ...J }, 200, 'ground']], 20);
    line(rows, 'run, one held jump at the lip', over(t), t, `peak +${r2(t.peak - a[1])}`);
    t = await attempt(page, from, [runTo(a[0] + 0.5), [{ ...PUSH, ...J }, 60, 'apex'], [PUSH, 2], [{ ...PUSH, ...J }, 200, 'ground']], 20);
    line(rows, 'run, held jump at the lip, air jump at the peak', over(t), t, `peak +${r2(t.peak - a[1])}`);
    t = await attempt(page, from, [runTo(a[0] + 0.5), [{ ...PUSH, sprint: true, ...J }, 60, 'apex'], [PUSH, 2], [{ ...PUSH, ...J }, 200, 'ground']], 20);
    t = await attempt(page, from, [[{ ...PUSH, sprint: true }, 300, `x>=${a[0] + 0.5}`], [{ ...PUSH, sprint: true, ...J }, 60, 'apex'], [{ ...PUSH, sprint: true }, 2], [{ ...PUSH, sprint: true, ...J }, 200, 'ground']], 20);
    line(rows, 'sprint, held jump at the lip, air jump at the peak', over(t), t, `peak +${r2(t.peak - a[1])}`);
    t = await attempt(page, from, [runTo(a[0] + 0.3), [{ ...PUSH, dash: true }, 30, 'dashend'], [PUSH, 120]], 20);
    line(rows, 'run, dash at the lip, no jump', over(t), t);
    t = await attempt(page, from, [runTo(a[0] + 0.5), [{ ...PUSH, ...J }, 60, 'apex'], [{ ...PUSH, ...J, dash: true }, 200, 'ground']], 20);
    line(rows, 'run, held jump at the lip, dash at the peak', over(t), t, `peak +${r2(t.peak - a[1])}`);
    out['dashjump'] = { step: i, rows };
    await page.close();
  }

  // ------------------------------------------------------------------ running: chapter 1's stair landing, nobody near
  if (wants('ground')) {
    const page = await open('01-lower-stair');
    console.log('\n== running (01-lower-stair, the long floor after the shelf)');
    const rows: Record<string, unknown>[] = [];
    for (const [name, f] of [['a direction held', PUSH], ['a direction and sprint held', { ...PUSH, sprint: true }]] as const) {
      const speed = await page.evaluate(([frame]) => {
        const H = window.__HARNESS__!;
        const neutral = { x: 0, y: 0, jump: false, dash: false, sprint: false, slash: false };
        H.teleportPlayer([58, 5.5, 0], -90);
        for (let k = 0; k < 30; k++) H.step(neutral, false);
        let s = H.snapshot();
        for (let k = 0; k < 40; k++) s = H.step({ ...neutral, ...(frame as object) }, false);
        H.setInput(null);
        return s.vel[0];
      }, [f] as const);
      rows.push({ name, speed });
      console.log(`   ${name.padEnd(32)} ${r2(speed)} m/s`);
    }
    out['ground'] = rows;
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}
const json = flag('json');
if (json) writeFileSync(json, JSON.stringify(out, null, 2) + '\n');
