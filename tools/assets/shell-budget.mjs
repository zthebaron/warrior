// Budgets for what D-022 ships outside the 3D scene: the title and how-to-play paintings (assets/ui/) and the
// sound (assets/audio/). Same discipline as the other budgets: every shipped file has a line in
// tools/assets/budgets.json, a file with no line fails, a line with no file fails, and a file over its line
// fails. Run by `npm run assets:budget` (tools/assets/budget.mjs), so CI holds it.
//
// The lines are byte ceilings. Where D-022's brief set one (the title painting, the music loop, an effect) the
// line is the brief's number; every other line is the file's measured size. The files are not rebuilt here: an
// image or audio encoder does not give the same bytes on every platform, so what is checked is what is shipped.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** section in budgets.json -> the directory it holds, and which files in it ship */
const SECTIONS = {
  ui: { dir: 'assets/ui', ships: (f) => /\.(webp|jpg|png)$/.test(f) },
  audio: { dir: 'assets/audio', ships: (f) => /\.(mp3|m4a|ogg|wav)$/.test(f) },
};

export function checkShellBudgets(root) {
  const budgets = JSON.parse(readFileSync(join(root, 'tools/assets/budgets.json'), 'utf8'));
  const errors = [];
  const rows = [];
  for (const [section, { dir, ships }] of Object.entries(SECTIONS)) {
    const lines = budgets[section] ?? {};
    const abs = join(root, dir);
    const files = existsSync(abs) ? readdirSync(abs).filter((f) => statSync(join(abs, f)).isFile() && ships(f)).sort() : [];
    for (const name of Object.keys(lines)) if (!files.includes(name)) errors.push(`budgets.json ${section} has "${name}" but ${dir}/${name} does not exist: stale budget line`);
    for (const f of files) {
      const bytes = statSync(join(abs, f)).size;
      const limit = lines[f]?.bytes;
      if (typeof limit !== 'number') { errors.push(`${dir}/${f}: no ${section} budget in tools/assets/budgets.json (measured ${bytes} B)`); continue; }
      const ok = bytes <= limit;
      if (!ok) errors.push(`${dir}/${f}: bytes ${bytes} > budget ${limit}`);
      rows.push({ name: `${dir}/${f}`, checks: [{ label: 'bytes', value: bytes, limit, ok }] });
    }
  }
  return { ok: errors.length === 0, rows, errors };
}
