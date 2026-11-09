// run-metric (B-15, SPEC §7 NOT row 20): no run metric is shown to the player.
//
// Q4 and Q6 refuse a death counter or any run metric shown to the player. `deaths` and the
// instrument's segment times exist legitimately for the harness, so a src name check cannot express
// this row: the metric is allowed to exist, but it must not reach the screen. So the check is
// behavioural. Play the same level twice with very different histories and require the
// player-visible text to be identical, state by state.
//
//   run A  clean: start, one death, finish
//   run B  heavy: idle 15 s, die 3 times, idle again, finish, then wait 10 s on the results screen
//
// "Player-visible text" is document.body.innerText (which skips display:none, so the ~ debug overlay
// and the hidden error banner are excluded) plus document.title. A text that differs between runs in
// the same state, or changes within one state of run B, depends on run history. That is a run metric
// shown to the player, whatever it is called.
//
// Known limits, stated so they are not implied covered:
//   - Text drawn into the WebGL canvas is not read (NOT row 19's src check refuses world text APIs).
//   - The ~ overlay shows fps and timings, and it is excluded on purpose: it is dev tooling, toggled
//     by a key the menu names. If it ever ships open by default, this stage reads it and fails.
//   - Only the entry chapter is played. The HUD is per-state, not per-level, so another level adds
//     nothing unless a level-specific UI appears.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIXED_HZ, Stage, guard, openGame, type Ctx, type StageResult } from './lib.ts';
import { NAV_CONFIG, walk } from './nav.ts';
import { entryLevel } from './reachable.ts';

type Sample = { state: string; text: string; at: string };

export async function runMetric(ctx: Omit<Ctx, 'levelId' | 'level' | 'segments'>): Promise<StageResult> {
  const st = new Stage('run-metric');
  return guard(st, async () => {
    const want = entryLevel(ctx.root);
    if (!st.check('an entry chapter exists', !!want, want ? want.id : 'no chapter >= 1 in levels/')) return;
    const file = readdirSync(join(ctx.root, 'levels')).find((f) => f === `${want!.id}.json`)!;
    const level = JSON.parse(readFileSync(join(ctx.root, 'levels', file), 'utf8'));
    const lctx = { ...ctx, levelId: want!.id, level, segments: (level.checkpoints?.length ?? 0) + 1 } as Ctx;
    const fall = (level.hazards as { type: string; y?: number }[]).find((h) => h.type === 'fall')?.y;
    if (!st.check('the level has a fall plane to die on', typeof fall === 'number', `fall y ${fall}`)) return;
    const tickLimit = Math.round(lctx.segments * NAV_CONFIG.segmentBudgetSec * NAV_CONFIG.stallMultiplier * FIXED_HZ);

    const play = async (heavy: boolean): Promise<{ samples: Sample[]; deaths: number; errors: string[]; failure: string | null }> => {
      const g = await openGame(lctx);
      const samples: Sample[] = [];
      const H = <T>(fn: () => T): Promise<T> => g.page.evaluate(fn);
      const sample = async (at: string): Promise<void> => {
        const s = await g.page.evaluate(() => ({ state: window.__HARNESS__!.snapshot().state, text: `${document.title}\n${document.body.innerText}`.trim() }));
        samples.push({ ...s, at });
      };
      const idle = async (n: number, at: string): Promise<void> => {
        for (let k = 0; k < n; k += 60) {
          await g.page.evaluate((m) => { window.__HARNESS__!.setInput(null); window.__HARNESS__!.advance(m, 0); }, Math.min(60, n - k));
          await sample(`${at} +${Math.min(k + 60, n)} ticks`);
        }
      };
      const die = async (k: number): Promise<string | null> => {
        await g.page.evaluate(([y, sp]) => window.__HARNESS__!.teleportPlayer([sp[0], y - 2, sp[2]]), [fall!, level.spawn.pos] as const);
        for (let t = 0; t < 120; t++) {
          const s = await H(() => window.__HARNESS__!.advance(1, 0).state);
          if (s === 'death') break;
        }
        await sample(`death ${k}`);
        for (let t = 0; t < 600; t++) {
          const s = await H(() => window.__HARNESS__!.advance(1, 0).state);
          if (s !== 'death') break;
          if (t % 15 === 0) await sample(`death ${k} +${t}`);
        }
        const s = await H(() => window.__HARNESS__!.snapshot().state);
        await sample(`after death ${k}`);
        return s === 'play' ? null : `death ${k} did not return to play (state ${s})`;
      };
      try {
        await sample('start');
        if (heavy) await idle(900, 'idle');
        for (let k = 1; k <= (heavy ? 3 : 1); k++) {
          const f = await die(k);
          if (f) return { samples, deaths: 0, errors: g.errors, failure: f };
        }
        if (heavy) await idle(300, 'idle after deaths');
        const w = await walk(lctx, g.page, { startIndex: 1, tickLimit, quiet: true });
        if (w.failure || w.snap.state !== 'results') return { samples, deaths: 0, errors: g.errors, failure: w.failure ?? `ended in ${w.snap.state}` };
        await sample('results');
        if (heavy) await idle(600, 'results');
        const deaths = await H(() => window.__HARNESS__!.snapshot().deaths);
        return { samples, deaths, errors: g.errors, failure: null };
      } finally {
        await g.close();
      }
    };

    const a = await play(false);
    const b = await play(true);
    if (!st.check('run A (clean) plays: one death, then finish', !a.failure, a.failure ?? `${a.deaths} death(s), ${a.samples.length} samples`)) return;
    if (!st.check('run B (heavy) plays: 15 s idle, 3 deaths, finish, 10 s on results', !b.failure, b.failure ?? `${b.deaths} death(s), ${b.samples.length} samples`)) return;
    st.check('the two runs have different histories (else the comparison proves nothing)', b.deaths > a.deaths, `deaths A ${a.deaths}, B ${b.deaths}`);

    const byState = (xs: Sample[]): Map<string, Map<string, string>> => {
      const m = new Map<string, Map<string, string>>();
      for (const x of xs) {
        if (!m.has(x.state)) m.set(x.state, new Map());
        if (!m.get(x.state)!.has(x.text)) m.get(x.state)!.set(x.text, x.at);
      }
      return m;
    };
    const A = byState(a.samples), B = byState(b.samples);
    const show = (t: string): string => JSON.stringify(t.length > 80 ? `${t.slice(0, 80)}…` : t);
    for (const s of ['play', 'death', 'results']) {
      st.check(`state "${s}" was seen in both runs`, A.has(s) && B.has(s), `A ${A.has(s)}, B ${B.has(s)}`);
    }
    for (const [s, texts] of B) {
      st.check(`"${s}": visible text is constant within run B`, texts.size === 1, texts.size === 1 ? show([...texts.keys()][0] ?? "") : [...texts].slice(0, 3).map(([t, at]) => `${show(t)} at ${at}`).join(' | '));
    }
    for (const [s, ta] of A) {
      const tb = B.get(s);
      if (!tb) continue;
      const same = ta.size === tb.size && [...ta.keys()].every((t) => tb.has(t));
      st.check(`"${s}": visible text is identical across runs (no run metric on screen)`, same, same ? show([...ta.keys()][0] ?? "") : `A ${[...ta.keys()].map(show).join(', ')} vs B ${[...tb.keys()].map(show).join(', ')}`);
    }
    st.check('zero console errors', a.errors.length + b.errors.length === 0, [...a.errors, ...b.errors].slice(0, 5).join(' | ') || 'none');
  });
}
