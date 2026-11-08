// Chapter progression (D-014 fix 3): which level a player meets first, and which one finishing a level
// leads to. A PURE function of the level list, so the game (src/main.ts), REACHABLE
// (tools/harness/reachable.ts) and check:progression (tools/check-progression.ts, under Node) all
// evaluate the SAME rule, and the order lives in the level data (`chapter`), never in a hand-kept list
// an agent would have to remember to extend.
//
//   entry: the lowest chapter >= 1. Chapter 0 is the gym, a test fixture, never what a player meets.
//   next:  the lowest chapter strictly above the current one; none after the last chapter.
//   Ties (two files claiming one chapter) break on id, so the order is total, but the loser is then
//   unreachable: chapterChain() is what REACHABLE checks covers every chapter >= 1 level.

export interface LevelRef {
  id: string;
  chapter: number;
}

const byOrder = (a: LevelRef, b: LevelRef): number => a.chapter - b.chapter || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The level a player meets from the front door: the lowest chapter >= 1 (the gym is chapter 0). */
export function entryLevel(levels: readonly LevelRef[]): LevelRef | null {
  return [...levels].filter((l) => l.chapter >= 1).sort(byOrder)[0] ?? null;
}

/** The level finishing `current` leads to: the lowest chapter strictly above it, or null after the last. */
export function nextLevel(levels: readonly LevelRef[], current: LevelRef): LevelRef | null {
  return [...levels].filter((l) => l.chapter > current.chapter).sort(byOrder)[0] ?? null;
}

/** Every level a player reaches by starting at the entry and finishing each level in turn. */
export function chapterChain(levels: readonly LevelRef[]): LevelRef[] {
  const out: LevelRef[] = [];
  for (let l = entryLevel(levels); l; l = nextLevel(levels, l)) out.push(l);
  return out;
}
