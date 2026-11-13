#!/usr/bin/env node
// NO_GREYBOX_CHAPTER (D-030). Every chapter ships in the ink look; the gym is the one greybox level, because it
// is a test room and not a place in the game. A new chapter is authored in greybox, and nothing else would stop
// it shipping that way: a player would walk out of the painting into grey boxes at a chapter change, which is what
// D-028, D-029 and D-030 were written to end.
//
//   node tools/lint-no-greybox.mjs               every levels/[0-9]*.json; exit 1 if one but the gym is not `ink`
//   node tools/lint-no-greybox.mjs --self-test   the rule seen to fail (a greybox chapter, a chapter with no
//                                                palette) and to pass (the gym greybox, a chapter in ink)
//
// It is keyed on `palette`, which is what an ink level is (src/loaders/level.ts isInk), not on `lighting.preset`:
// chapter 1 is ink with the preset still named greybox. It is its own script, run by `npm run lint:levels`, and
// not a rule inside lint-level.mjs: the example level, the lint:self fixtures and the harness's clones are
// greybox on purpose.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/** The one level that stays greybox. */
export const GREYBOX_ALLOWED = ['00-gym'];

/** The ids of the levels that break the rule. `levels`: [{ id, palette }]. */
export function greyChapters(levels) {
  return levels.filter((l) => !GREYBOX_ALLOWED.includes(l.id) && l.palette !== 'ink').map((l) => `${l.id} (palette: ${JSON.stringify(l.palette)})`);
}

if (process.argv.includes('--self-test')) {
  const cases = [
    ['a greybox chapter fails', [{ id: '06-new', palette: 'greybox' }], 1],
    ['a chapter with no palette fails', [{ id: '06-new' }], 1],
    ['the gym may be greybox', [{ id: '00-gym', palette: 'greybox' }], 0],
    ['a chapter in ink passes', [{ id: '04-summit-ridge', palette: 'ink' }], 0],
  ];
  let bad = 0;
  for (const [name, levels, want] of cases) {
    const got = greyChapters(levels).length;
    if (got !== want) bad++;
    console.log(`${got === want ? 'ok  ' : 'FAIL'} ${name}: ${got} found, ${want} expected`);
  }
  process.exit(bad ? 1 : 0);
}

const levels = readdirSync(join(ROOT, 'levels'))
  .filter((f) => /^[0-9].*\.json$/.test(f))
  .map((f) => ({ id: f.replace(/\.json$/, ''), palette: JSON.parse(readFileSync(join(ROOT, 'levels', f), 'utf8')).palette }));
const grey = greyChapters(levels);
if (grey.length) {
  console.error(`NO_GREYBOX_CHAPTER: ${grey.join(', ')}. Every level but ${GREYBOX_ALLOWED.join(', ')} ships in the ink look (D-030).`);
  process.exit(1);
}
console.log(`NO_GREYBOX_CHAPTER: ${levels.length} levels, ${levels.length - GREYBOX_ALLOWED.length} in ink, greybox only ${GREYBOX_ALLOWED.join(', ')}`);
