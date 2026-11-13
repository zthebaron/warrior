// The how-to-play page's body (D-022). Nothing about the controls is typed here: every key shown is read from
// the tables the game itself reads (INPUT_CONFIG.bindings, GAME_RULES.keys, SHELL.keys, the audio keys, the
// gamepad table), and the moves come from the level files' own `moves_allowed`, in the order the chapters add
// them. So a rebinding, a new move or a renamed chapter changes this page without anyone touching it. What IS
// written here is one plain line per move and a few short paragraphs on the rules, in MOVE_TEXT and RULES.
//
// A move a level names that has no line here is shown under its own id, so a missing line is seen, not hidden.
//
// D-025: the same lines are what the game puts on screen where a chapter's path first needs a move (teachLine,
// src/systems/teach.ts). One table, so the page and the prompt cannot say different things. Each line says what
// the rig really needs, as measured on it (MEASUREMENTS.md "D-025 the moves as the rig makes them").

export interface HowtoChapter {
  /** the level file's id: what the chapter list starts (D-025) */
  id: string;
  chapter: number;
  title: string;
  /** the moves this chapter is the first to allow, in the order its level file lists them */
  moves: string[];
}

export interface HowtoData {
  chapters: HowtoChapter[];
  /** action -> key codes, straight from INPUT_CONFIG.bindings */
  bindings: Readonly<Record<string, readonly string[]>>;
  /** the keys that are not moves: [label, key codes] in the order to show them */
  keys: readonly (readonly [string, readonly string[]])[];
  /** action or label -> what the gamepad uses for it; null when the page has no gamepad support */
  pad: Readonly<Record<string, string>> | null;
  /** D-027: action or label -> what the touch controls call it (TOUCH.labels), while a finger is what plays; else null */
  touch: Readonly<Record<string, string>> | null;
  /** seconds between a fall and standing at the torii again */
  respawnDelaySec: number;
}

const MOVE_ACTIONS = ['forward', 'left', 'back', 'right'] as const;

/** What an action in the binding table is called on the page. An action with no entry is shown by its own name. */
const ACTION_LABEL: Readonly<Record<string, string>> = {
  jump: 'Jump',
  dash: 'Dash',
  sprint: 'Sprint (hold)',
  slash: 'Sword slash',
};

/**
 * One plain line per move. {jump}, {dash}, {sprint}, {slash} and {move} become the keys bound to them.
 * `line` is what the game shows on screen and what this page says; `more` is said on this page only.
 * `hang` and `fight` are not moves a level lists: the first is the second half of the ledge grab, shown while
 * hanging, and the second is the fight's one line.
 */
const MOVE_TEXT: Readonly<Record<string, { name: string; line: string; more?: string }>> = {
  ground: { name: 'Run', line: 'Move with {move}. Hold {sprint} to sprint.' },
  jump: { name: 'Jump', line: 'Press {jump} to jump. Hold it down to rise higher: a tap is a low hop.' },
  wall: { name: 'Wall slide and wall jump', line: 'Jump at a wall and press {jump} again as you touch it: you kick up and away from it.', more: 'Push into a wall while you fall and you slide down it.' },
  double: { name: 'Double jump', line: 'Press {jump} again in the air, clear of any wall, for one more jump.' },
  climb: { name: 'Ledge grab', line: 'Jump at the wall and hold {jump} for full height. Keep pushing into the wall to catch the edge, then press {jump} again to pull up.', more: 'To drop instead, push away from the wall.' },
  hang: { name: 'Hanging', line: 'Press {jump} again to pull up, or push away from the wall to drop.' },
  platform: { name: 'Drifting stones', line: 'Some stones move on a steady beat. Step on, ride, step off.' },
  dash: { name: 'Dash', line: 'Press {dash} for a short burst of speed, on the ground or once in the air.' },
  dashjump: { name: 'Dash jump', line: 'Dash, then press {jump} as the dash ends: the jump starts from where the dash carried you, so together they cross a wide gap.' },
  fight: { name: 'Swordsmen', line: 'Press {slash} to cut. Two cuts fell a swordsman. His cut sends you back.' },
  // POLISH-1 (B-99): at the courtyard's shut gate while a swordsman stands (D-026). Not a move: the page says it in RULES.goal.
  gate: { name: 'The shut gate', line: 'This gate opens when every swordsman is down. Press {slash} to cut.' },
};

const RULES = {
  goal: 'Reach the last torii gate of the chapter. There is nothing to collect and no clock to beat: arriving is the whole of it. In the courtyard the far gate stays shut until every swordsman is down.',
  read: 'The vermilion torii show where to go. A crow lifting off shows when: its flight is timed to a sliding stone.',
  checkpoint: 'Every torii you pass is a checkpoint: from then on, that is where you return.',
  fall: 'Fall off the path, or be caught by a sliding stone, and you stand at the furthest torii you reached {delay} later. Nothing else is taken from you.',
  // D-023: the fight. Its first line is MOVE_TEXT.fight, the one the game shows at a chapter's first swordsman
  // (D-025), so the sword's key is still read from the binding table.
  fight: 'Swordsmen guard the path.',
  windup: 'Before a swordsman cuts he draws his blade back. Read it: cut him first, or step out of his reach.',
  cut: 'If his blade reaches you, you stand at the furthest torii you reached {delay} later, and every swordsman is on his feet again.',
  // D-027: said under the touch controls' table only
  also: 'A keyboard or a gamepad works too.',
};

/** "Right trigger (hold)" and "the stick at its edge (hold)" are the tables'; a line of text already says hold. */
const unheld = (label: string): string => label.replace(/ \(hold\)$/, '');
const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

const KEY_NAME: Readonly<Record<string, string>> = {
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Space: 'Space', Enter: 'Enter', Escape: 'Esc', Backquote: '~', Minus: '−', Equal: '=',
  ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Ctrl', ControlRight: 'Ctrl', AltLeft: 'Alt', AltRight: 'Alt',
  Mouse0: 'Left click',
};

/** A KeyboardEvent.code as a person reads the key: KeyW -> W, Digit1 -> 1, ArrowUp -> an arrow. */
export function keyName(code: string): string {
  return KEY_NAME[code] ?? code.replace(/^Key/, '').replace(/^Digit/, '');
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  return e;
}

/** The keys for these codes as <kbd>s, each name once (Shift, not Shift Shift). */
function keys(codes: readonly string[], joiner = ' '): DocumentFragment {
  const out = document.createDocumentFragment();
  [...new Set(codes.map(keyName))].forEach((name, i) => {
    if (i) out.append(joiner);
    out.append(el('kbd', name));
  });
  return out;
}

/** `text` with each {name} replaced by fill(name). */
export function filled(text: string, fill: (name: string) => Node | string): DocumentFragment {
  const out = document.createDocumentFragment();
  text.split(/(\{[a-z]+\})/).forEach((part) => out.append(/^\{[a-z]+\}$/.test(part) ? fill(part.slice(1, -1)) : part));
  return out;
}

export function buildHowto(d: HowtoData): DocumentFragment {
  const page = document.createDocumentFragment();
  const bound = (action: string): readonly string[] => d.bindings[action] ?? [];
  // W A S D, then the arrows: the first key of each direction, then the second
  const moveSets = [0, 1].map((i) => MOVE_ACTIONS.map((a) => bound(a)[i]).filter((c): c is string => !!c)).filter((s) => s.length);
  const moveKeys = (): DocumentFragment => {
    const out = document.createDocumentFragment();
    moveSets.forEach((set, i) => {
      if (i) out.append(' or ');
      out.append(keys(set));
    });
    return out;
  };
  const fill = (name: string): Node | string => {
    if (name === 'delay') return `${d.respawnDelaySec} s`;
    if (d.touch) return unheld(d.touch[name] ?? name); // D-027: a finger plays: the page names the stick and the buttons
    if (name === 'move') return moveKeys();
    return bound(name).length ? keys(bound(name), ' or ') : name; // the sword has two (J or Left click); every other action has one name
  };

  // --- the rules ---
  page.append(el('h2', 'The goal'));
  page.append(el('p', RULES.goal), el('p', RULES.read));
  page.append(el('h2', 'Torii and falling'));
  const fall = el('p');
  fall.append(filled(RULES.fall, fill));
  page.append(el('p', RULES.checkpoint), fall);
  // D-023: fighting, shown while the sword is bound to anything
  if (bound('slash').length) {
    page.append(el('h2', 'Swordsmen'));
    for (const line of [`${RULES.fight} ${MOVE_TEXT['fight']!.line}`, RULES.windup, RULES.cut]) {
      const p = el('p');
      p.append(filled(line, fill));
      page.append(p);
    }
  }

  // --- the moves, chapter by chapter ---
  page.append(el('h2', 'The moves'));
  for (const c of d.chapters) {
    if (!c.moves.length) continue;
    page.append(el('h3', `Chapter ${c.chapter}: ${c.title}`));
    const list = el('dl');
    for (const id of c.moves) {
      const t = MOVE_TEXT[id];
      const dd = el('dd');
      dd.append(t ? filled(t.more ? `${t.line} ${t.more}` : t.line, fill) : `(${id})`);
      list.append(el('dt', t?.name ?? id), dd);
    }
    page.append(list);
  }

  // --- the controls ---
  page.append(el('h2', 'Controls'));
  const table = el('table');
  const head = el('tr');
  // D-027: with a finger playing, the table is the touch controls', from TOUCH.labels: the same rows in the same
  // order, less the ones a finger has no control for (the sound keys: the slider is on this page).
  head.append(el('th', 'Action'), el('th', d.touch ? 'Touch' : 'Keyboard'));
  if (d.pad && !d.touch) head.append(el('th', 'Gamepad'));
  table.append(head);
  const row = (label: string, keyboard: Node | string, name: string): void => {
    const touch = d.touch?.[name];
    if (d.touch && touch === undefined) return;
    const tr = el('tr');
    const k = el('td');
    k.append(touch !== undefined ? capital(touch) : keyboard);
    tr.append(el('td', label), k);
    if (d.pad && !d.touch) tr.append(el('td', d.pad[name] ?? ''));
    table.append(tr);
  };
  row('Move', moveKeys(), 'move');
  for (const [action, codes] of Object.entries(d.bindings)) {
    if ((MOVE_ACTIONS as readonly string[]).includes(action)) continue;
    row(ACTION_LABEL[action] ?? action, keys(codes, ' or '), action);
  }
  row('Look around', 'Mouse (click the game first)', 'look');
  for (const [label, codes] of d.keys) row(label, keys(codes, ' or '), label);
  page.append(table);
  if (d.touch) page.append(el('p', RULES.also));
  return page;
}

/** What a line's {names} are filled from: the game's binding table, and the pad's labels when a pad is in his hands. */
export interface LineKeys {
  bindings: Readonly<Record<string, readonly string[]>>;
  /** GAMEPAD.labels while the last thing pressed was on a pad, TOUCH.labels while it was a finger on the screen (D-027), else null */
  pad: Readonly<Record<string, string>> | null;
}

/** Does this move, the hang or the fight have a line? check:teach holds every line the rule can show to it. */
export function hasLine(id: string): boolean {
  return MOVE_TEXT[id] !== undefined;
}

/** A line's text with its {names} left in: for a check that reads the words, never for the screen. */
export function lineText(id: string): string {
  return MOVE_TEXT[id]?.line ?? `(${id})`;
}

/**
 * D-025: a move's line as the game shows it on screen, the keys read from the same tables as this page's. With
 * a pad in his hands the names are the pad's. A line with no entry is shown as its id, so it is seen, not hidden.
 */
export function teachLine(id: string, k: LineKeys): DocumentFragment {
  const bound = (action: string): readonly string[] => k.bindings[action] ?? [];
  return filled(lineText(id), (name) => {
    if (k.pad) return unheld(k.pad[name] ?? name);
    // W A S D: the first key of each direction. The arrows are on the how-to-play page.
    if (name === 'move') return keys(MOVE_ACTIONS.map((a) => bound(a)[0]).filter((c): c is string => !!c));
    return bound(name).length ? keys(bound(name), ' or ') : name;
  });
}

/**
 * The chapters and the moves each is first to allow, from the level files' own text. A level with chapter 0
 * (the gym) is a test fixture and is not a chapter.
 */
export function chaptersFrom(sources: Readonly<Record<string, string>>): HowtoChapter[] {
  const levels = Object.values(sources)
    .map((text) => JSON.parse(text) as { id?: unknown; chapter?: unknown; title?: unknown; moves_allowed?: unknown })
    .filter((l): l is { id: string; chapter: number; title: string; moves_allowed: string[] } =>
      typeof l.id === 'string' && typeof l.chapter === 'number' && l.chapter >= 1 && typeof l.title === 'string' && Array.isArray(l.moves_allowed))
    .sort((a, b) => a.chapter - b.chapter);
  const seen = new Set<string>();
  return levels.map((l) => {
    const moves = l.moves_allowed.filter((m) => typeof m === 'string' && !seen.has(m));
    moves.forEach((m) => seen.add(m));
    return { id: l.id, chapter: l.chapter, title: l.title, moves };
  });
}
