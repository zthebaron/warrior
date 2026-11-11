// The how-to-play page's body (D-022). Nothing about the controls is typed here: every key shown is read from
// the tables the game itself reads (INPUT_CONFIG.bindings, GAME_RULES.keys, SHELL.keys, the audio keys, the
// gamepad table), and the moves come from the level files' own `moves_allowed`, in the order the chapters add
// them. So a rebinding, a new move or a renamed chapter changes this page without anyone touching it. What IS
// written here is one plain line per move and three short paragraphs on the rules, in MOVE_TEXT and RULES.
//
// A move a level names that has no line here is shown under its own id, so a missing line is seen, not hidden.

export interface HowtoChapter {
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

/** One plain line per move. {jump}, {dash}, {sprint} and {move} become the keys bound to them. */
const MOVE_TEXT: Readonly<Record<string, { name: string; line: string }>> = {
  ground: { name: 'Run', line: 'Move with {move}. Hold {sprint} to sprint.' },
  jump: { name: 'Jump', line: 'Press {jump}. Hold it longer to rise higher.' },
  wall: { name: 'Wall slide and wall jump', line: 'Push into a wall while you fall and you slide down it. Press {jump} to kick away from it.' },
  double: { name: 'Double jump', line: 'Press {jump} again in the air for one more jump.' },
  climb: { name: 'Ledge grab', line: 'Push into a ledge near its top to catch it. Press {jump} to pull yourself up, or push away to drop.' },
  platform: { name: 'Drifting stones', line: 'Some stones move on a steady beat. Step on, ride, step off.' },
  dash: { name: 'Dash', line: 'Press {dash} for a short burst of speed, on the ground or once in the air.' },
  dashjump: { name: 'Dash jump', line: 'Dash, then press {jump} just as the dash ends. It carries you over the widest gaps.' },
};

const RULES = {
  goal: 'Reach the last torii gate of the chapter. There is nothing to collect and no clock to beat: arriving is the whole of it.',
  read: 'The vermilion torii show where to go. A crow lifting off shows when: its flight is timed to a sliding stone.',
  checkpoint: 'Every torii you pass is a checkpoint: from then on, that is where you return.',
  fall: 'Fall off the path, or be caught by a sliding stone, and you stand at the furthest torii you reached {delay} later. Nothing else is taken from you.',
  slash: 'The sword cuts the air and nothing else. There is no one to fight on the mountain yet.',
  touch: 'This game needs a keyboard or a gamepad. It has no touch controls.',
};

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
function filled(text: string, fill: (name: string) => Node | string): DocumentFragment {
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
    if (name === 'move') return moveKeys();
    if (name === 'delay') return `${d.respawnDelaySec} s`;
    return bound(name).length ? keys(bound(name)) : name;
  };

  // --- the rules ---
  page.append(el('h2', 'The goal'));
  page.append(el('p', RULES.goal), el('p', RULES.read));
  page.append(el('h2', 'Torii and falling'));
  const fall = el('p');
  fall.append(filled(RULES.fall, fill));
  page.append(el('p', RULES.checkpoint), fall);

  // --- the moves, chapter by chapter ---
  page.append(el('h2', 'The moves'));
  for (const c of d.chapters) {
    if (!c.moves.length) continue;
    page.append(el('h3', `Chapter ${c.chapter}: ${c.title}`));
    const list = el('dl');
    for (const id of c.moves) {
      const t = MOVE_TEXT[id];
      const dd = el('dd');
      dd.append(t ? filled(t.line, fill) : `(${id})`);
      list.append(el('dt', t?.name ?? id), dd);
    }
    page.append(list);
  }

  // --- the controls ---
  page.append(el('h2', 'Controls'));
  const table = el('table');
  const head = el('tr');
  head.append(el('th', 'Action'), el('th', 'Keyboard'));
  if (d.pad) head.append(el('th', 'Gamepad'));
  table.append(head);
  const row = (label: string, keyboard: Node | string, pad: string | undefined): void => {
    const tr = el('tr');
    const k = el('td');
    k.append(keyboard);
    tr.append(el('td', label), k);
    if (d.pad) tr.append(el('td', pad ?? ''));
    table.append(tr);
  };
  row('Move', moveKeys(), d.pad?.['move']);
  for (const [action, codes] of Object.entries(d.bindings)) {
    if ((MOVE_ACTIONS as readonly string[]).includes(action)) continue;
    row(ACTION_LABEL[action] ?? action, keys(codes, ' or '), d.pad?.[action]);
  }
  row('Look around', 'Mouse (click the game first)', d.pad?.['look']);
  for (const [label, codes] of d.keys) row(label, keys(codes, ' or '), d.pad?.[label]);
  page.append(table);
  if (bound('slash').length) page.append(el('p', RULES.slash));
  const touch = el('p', RULES.touch);
  touch.className = 'touch';
  page.append(touch);
  return page;
}

/**
 * The chapters and the moves each is first to allow, from the level files' own text. A level with chapter 0
 * (the gym) is a test fixture and is not a chapter.
 */
export function chaptersFrom(sources: Readonly<Record<string, string>>): HowtoChapter[] {
  const levels = Object.values(sources)
    .map((text) => JSON.parse(text) as { chapter?: unknown; title?: unknown; moves_allowed?: unknown })
    .filter((l): l is { chapter: number; title: string; moves_allowed: string[] } =>
      typeof l.chapter === 'number' && l.chapter >= 1 && typeof l.title === 'string' && Array.isArray(l.moves_allowed))
    .sort((a, b) => a.chapter - b.chapter);
  const seen = new Set<string>();
  return levels.map((l) => {
    const moves = l.moves_allowed.filter((m) => typeof m === 'string' && !seen.has(m));
    moves.forEach((m) => seen.add(m));
    return { chapter: l.chapter, title: l.title, moves };
  });
}
