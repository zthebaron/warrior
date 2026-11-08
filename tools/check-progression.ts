#!/usr/bin/env node
// check:progression — the chapter-order rule (D-014 fix 3), run under Node with no browser.
// Tests the REAL function the game and REACHABLE use (src/systems/progression.ts), on synthetic level
// lists (so the multi-chapter paths are exercised before a second chapter exists) and on levels/ itself.
//
//   npm run check:progression      exit 0 every property holds · 1 a property failed

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chapterChain, entryLevel, nextLevel, type LevelRef } from '../src/systems/progression.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const fails: string[] = [];
let checks = 0;
const ok = (name: string, cond: boolean, detail = ''): void => {
  checks++;
  if (!cond) fails.push(`${name}${detail ? `: ${detail}` : ''}`);
};
const ids = (l: readonly LevelRef[]): string => l.map((x) => x.id).join(' > ') || '(none)';
const L = (id: string, chapter: number): LevelRef => ({ id, chapter });

// synthetic: gym + four chapters, listed out of order
const four = [L('03-c', 3), L('00-gym', 0), L('01-a', 1), L('04-d', 4), L('02-b', 2)];
ok('entry skips the gym', entryLevel(four)?.id === '01-a', String(entryLevel(four)?.id));
ok('1 -> 2', nextLevel(four, L('01-a', 1))?.id === '02-b');
ok('3 -> 4', nextLevel(four, L('03-c', 3))?.id === '04-d');
ok('nothing after the last chapter', nextLevel(four, L('04-d', 4)) === null);
ok('the gym leads to chapter 1 (?level=00-gym is a dev route in)', nextLevel(four, L('00-gym', 0))?.id === '01-a');
ok('chain visits every chapter in order', ids(chapterChain(four)) === '01-a > 02-b > 03-c > 04-d', ids(chapterChain(four)));

// a gap in the numbering is not a dead end
const gap = [L('01-a', 1), L('03-c', 3)];
ok('a missing chapter is skipped, not a dead end', nextLevel(gap, L('01-a', 1))?.id === '03-c');

// only the gym: nothing for a player to meet
ok('no chapter >= 1: no entry', entryLevel([L('00-gym', 0)]) === null && chapterChain([L('00-gym', 0)]).length === 0);

// two files on one chapter: total order (ties on id), and the chain shows the loser is unreachable
const dup = [L('01-a', 1), L('01-b', 1), L('02-c', 2)];
ok('duplicate chapter: tie breaks on id', entryLevel(dup)?.id === '01-a');
ok('duplicate chapter: the chain misses one (REACHABLE fails on this)', chapterChain(dup).length === 2, ids(chapterChain(dup)));

// the real levels/: every chapter >= 1 level is on the chain a player walks
const real = readdirSync(join(ROOT, 'levels'))
  .filter((f) => /^[0-9].*\.json$/.test(f))
  .map((f) => JSON.parse(readFileSync(join(ROOT, 'levels', f), 'utf8')) as LevelRef)
  .map((l) => L(l.id, l.chapter));
const chain = chapterChain(real);
const missed = real.filter((l) => l.chapter >= 1 && !chain.some((c) => c.id === l.id));
ok('levels/: every chapter >= 1 is reachable by finishing the one before', missed.length === 0, `unreachable: ${ids(missed)}`);

console.log(`levels/ chain: ${ids(chain)}`);
if (fails.length) {
  for (const f of fails) console.log(`FAIL  ${f}`);
  console.log(`PROGRESSION FAIL  ${fails.length}/${checks}`);
  process.exit(1);
}
console.log(`PROGRESSION PASS  ${checks}/${checks}`);
