// chaos — 60s of seeded random input (since D-023 the sword too, so a level's swordsmen are fought at random). Not per-tick noise (that averages to neutral jitter): random
// action sets HELD for 5-40 ticks, like a player mashing. The seed is logged; rerun any failure
// with --seed=<n>. ASSERTS: in bounds, not stuck, zero console errors, velocity under cap x2,
// no NaN transforms.

import { FIXED_HZ, Stage, fmt, guard, openGame, type Ctx, type InputFrame, type StageResult } from './lib.ts';

export const CHAOS_CONFIG = {
  durationSec: 60,
  defaultSeed: 20261107,
  holdTicks: [5, 40] as const,
  stuckWindowSec: 5,
  stuckMinMove: 0.5,        // m: must move at least this far within every window...
  stuckActiveFraction: 0.5, // ...in which at least this fraction of ticks had movement input
  capMultiplier: 2,
  p: { move: 0.85, jump: 0.35, dash: 0.12, sprint: 0.3, slash: 0.3 },
};

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function chaosFrames(seed: number, ticks: number): InputFrame[] {
  const r = mulberry32(seed);
  const C = CHAOS_CONFIG;
  const out: InputFrame[] = [];
  while (out.length < ticks) {
    const hold = C.holdTicks[0] + Math.floor(r() * (C.holdTicks[1] - C.holdTicks[0] + 1));
    const ang = r() * Math.PI * 2;
    const mag = r() < C.p.move ? 0.5 + r() * 0.5 : 0;
    const f: InputFrame = {
      x: Math.cos(ang) * mag,
      y: Math.sin(ang) * mag,
      jump: r() < C.p.jump,
      dash: r() < C.p.dash,
      sprint: r() < C.p.sprint,
    };
    // D-023: the sword. This is the draw the old attack input took (cut by Q1/Q7, and consumed unused since, so
    // that a fixed seed kept its stream): every other field of every frame is what it was before the sword.
    const slash = r() < C.p.slash;
    // jump/dash held for the whole segment would only fire once; release halfway for a second edge
    for (let k = 0; k < hold && out.length < ticks; k++) {
      const half = k === Math.floor(hold / 2);
      out.push({ ...f, jump: f.jump && !half, dash: f.dash && !half, slash: slash && !half });
    }
  }
  return out;
}

export async function chaos(ctx: Ctx): Promise<StageResult> {
  const st = new Stage('chaos');
  return guard(st, async () => {
    const C = CHAOS_CONFIG;
    const seed = ctx.args['seed'] !== undefined ? Number(ctx.args['seed']) : C.defaultSeed;
    const ticks = C.durationSec * FIXED_HZ;
    const frames = chaosFrames(seed, ticks);
    st.data['seed'] = seed;
    ctx.log(`    chaos seed ${seed}  (rerun: npm run playtest -- --level=${ctx.levelId} --seed=${seed})`);
    const g = await openGame(ctx);
    try {
      const r = await g.page.evaluate(
        ([fr, b]) => {
          const H = window.__HARNESS__!;
          const T = H.tuning;
          H.setInput(null);
          H.playback(fr);
          const feet: number[][] = [];
          const active: boolean[] = [];
          let maxH = 0;
          let maxV = 0;
          let oob: string | null = null;
          let nan: string | null = null;
          let s = H.snapshot();
          let lastInput = s.inputTicks;
          let guardFrames = 0;
          // D-004: the world keeps ticking during `death`, so world ticks != input frames. Count a chaos
          // frame consumed only when inputTicks advances; and measure the world clock across each death.
          const deathSpans: number[] = [];
          let deathAt: number | null = null;
          let lastDeaths = s.deaths;
          while ((H.isPlayingBack() || s.inputTicks === lastInput) && guardFrames < fr.length * 3) {
            s = H.advance(1, 60);
            guardFrames++;
            if (s.deaths > lastDeaths) {
              lastDeaths = s.deaths;
              deathAt = s.runTime;
            }
            if (deathAt !== null && s.state === 'play') {
              deathSpans.push(s.runTime - deathAt);
              deathAt = null;
            }
            if (s.inputTicks === lastInput) continue; // a `death` tick: the world moved, no input consumed
            const idx = feet.length;
            lastInput = s.inputTicks;
            const f = fr[idx];
            active.push(!!f && Math.hypot(f.x, f.y) > 0.15);
            feet.push(s.feet);
            const nums = [...s.feet, ...s.vel, ...s.platforms.flatMap((p) => p.pos)];
            if (!nan && nums.some((n) => !Number.isFinite(n))) nan = `tick ${idx}: feet ${JSON.stringify(s.feet)} vel ${JSON.stringify(s.vel)}`;
            const inB = s.feet.every((v, k) => v >= b.min[k]! && v <= b.max[k]!);
            if (!oob && !inB) oob = `tick ${idx}: feet ${JSON.stringify(s.feet.map((n) => +n.toFixed(2)))} outside ${JSON.stringify(b)}`;
            maxH = Math.max(maxH, Math.hypot(s.vel[0], s.vel[2]));
            maxV = Math.max(maxV, Math.abs(s.vel[1]));
            if (feet.length >= fr.length) break;
          }
          return { feet, active, maxH, maxV, oob, nan, deathSpans, rules: H.rules, deaths: s.deaths, capH: Math.max(T['dashSpeed']!, T['sprintSpeed']!), capV: Math.max(T['maxFallSpeed']!, T['jumpVelocity']!) };
        },
        [frames, ctx.level.bounds] as const,
      );

      // stuck: any window with mostly-active input and almost no movement
      const W = C.stuckWindowSec * FIXED_HZ;
      let stuck: string | null = null;
      for (let s0 = 0; s0 + W <= r.feet.length && !stuck; s0 += W / 2) {
        const act = r.active.slice(s0, s0 + W).filter(Boolean).length / W;
        if (act < C.stuckActiveFraction) continue;
        const o = r.feet[s0]!;
        let far = 0;
        for (let k = s0; k < s0 + W; k++) far = Math.max(far, Math.hypot(r.feet[k]![0]! - o[0]!, r.feet[k]![1]! - o[1]!, r.feet[k]![2]! - o[2]!));
        if (far < C.stuckMinMove) stuck = `ticks ${s0}-${s0 + W}: ${(act * 100).toFixed(0)}% input active, moved only ${far.toFixed(3)}u from ${fmt(o as [number, number, number])}`;
      }
      const capH = r.capH * C.capMultiplier;
      const capV = r.capV * C.capMultiplier;
      st.check('ran full duration', r.feet.length >= ticks, `${r.feet.length}/${ticks} ticks, ${r.deaths} deaths/respawns`);
      st.check('in bounds', !r.oob, r.oob ?? 'every tick inside level.bounds');
      st.check('not stuck', !stuck, stuck ?? `moved >= ${C.stuckMinMove}u in every active ${C.stuckWindowSec}s window`);
      st.check('zero console errors', g.errors.length === 0, g.errors.slice(0, 5).join(' | ') || 'none');
      st.check(`velocity under cap x${C.capMultiplier}`, r.maxH <= capH && r.maxV <= capV, `|h| max ${r.maxH.toFixed(2)} <= ${capH} ; |v| max ${r.maxV.toFixed(2)} <= ${capV}`);
      st.check('no NaN transforms', !r.nan, r.nan ?? 'feet, velocity, platforms finite every tick');
      // D-004 / B-13: the world clock runs through death. Every death -> respawn interval must show the
      // clock advancing by the respawn delay (to within one tick), never frozen at the death phase.
      const want = r.rules.respawnDelaySec;
      const bad = r.deathSpans.filter((d) => d < want - 1e-9 || d > want + r.rules.fixedDt + 1e-9);
      st.check(
        'world clock runs through death',
        r.deathSpans.length > 0 && bad.length === 0,
        r.deathSpans.length === 0
          ? 'no death in this run — the D-004 gate was not exercised'
          : `${r.deathSpans.length} deaths, clock advanced ${[...new Set(r.deathSpans.map((d) => d.toFixed(4)))].join('/')}s across each (respawn delay ${want}s)${bad.length ? `; WRONG: ${bad.map((d) => d.toFixed(4)).join(', ')}` : ''}`,
      );
    } finally {
      await g.close();
    }
  });
}
