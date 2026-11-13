// The shell (D-022): the title screen and the how-to-play page. Both are DOM over the canvas; nothing here is
// drawn in the 3D scene, and nothing here is read by the simulation.
//
// The markup and its CSS are in index.html, so the title painting is on screen before this module has loaded.
// index.html also owns the gate: with a harness, playtest, replay, instrument or level parameter it marks the
// page <html class="bare"> and never puts the shell in the document. shellEnabled() reads that class; a bare
// page builds no Shell, so the harness sees the page exactly as it was before D-022.
//
// The title is the game's `menu` state made visible: it shows whenever the state is `menu` and leaves when a
// level starts. The how-to-play page opens over the title or over the game (which it pauses) and closes back
// to wherever it was opened from.
//
// D-025 adds two things, behind the same gate. The chapter list: every chapter by name, opened from the title or
// from the how-to-play page (so also from a game that page has paused); choosing one starts it as Play starts
// the first, and none is ever locked. And the teach line: one line about a move, low on the screen while
// playing. What it says and when is src/systems/teach.ts and src/ui/howto.ts; this only puts it on the page.
// Its element is made here, not in index.html, as the hint's is.

import type { GameState } from '../engine/state';

// Every number is in MEASUREMENTS.md "D-022 title screen".
export const SHELL = {
  keys: {
    /** also Enter (GAME_RULES.keys.start): the title's Play */
    start: ['Space'],
    help: 'KeyH',
    back: 'Escape',
    /** D-025: the chapter list, from the title or the how-to-play page */
    chapters: 'KeyC',
    /** and inside it: the chapter above, the chapter below (Enter and Space press the one in focus, as on any button) */
    up: 'ArrowUp',
    down: 'ArrowDown',
  },
  /** the title fades out over this long when a level starts: index.html `#title { transition }` is the same number */
  leaveMs: 350,
  labels: { play: 'Play', loading: 'Loading…', soundOn: 'Sound: on', soundOff: 'Sound: off' },
};

/** Is this page the game's front door? Decided once, by index.html, from the URL. */
export function shellEnabled(): boolean {
  return document.documentElement.classList.contains('shell') && document.getElementById('title') !== null;
}

/** What the shell asks of the game. It never reaches past these. */
export interface ShellHost {
  state(): GameState;
  /** start the game from the title (a no-op unless the state is `menu`) */
  start(): void;
  /** pause a running game / resume one this shell paused */
  pause(): void;
  resume(): void;
  /** the how-to-play page's body, built from the game's own tables each time the page opens */
  helpContent(): Node;
  /** one line for the corner of the screen while playing */
  hint(): string;
  /** D-025: the chapters, in order, from the level files (empty until they have been read) */
  chapters(): readonly { id: string; chapter: number; title: string }[];
  /** D-025: start this chapter, as Play starts the first: with sound, and from wherever the list was opened */
  startChapter(id: string): void;
  /** D-025: a teach line's content, its keys read from the game's tables */
  teachContent(line: string): Node;
  /** sound, when the page has it: the shell only shows and flips what the audio module holds */
  sound: { muted(): boolean; setMuted(m: boolean): void; volume(): number; setVolume(v: number): void } | null;
}

function need<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`[shell] #${id} missing from index.html`);
  return e as T;
}

export class Shell {
  private readonly root = document.documentElement;
  private readonly title = need<HTMLDivElement>('title');
  private readonly play = need<HTMLButtonElement>('title-play');
  private readonly help = need<HTMLDivElement>('help');
  private readonly helpBody = need<HTMLDivElement>('help-content');
  private readonly soundButtons = [need<HTMLButtonElement>('title-sound'), need<HTMLButtonElement>('help-sound')];
  private readonly volume = need<HTMLInputElement>('help-volume');
  private readonly hint = document.createElement('div');
  private readonly chapterBox = need<HTMLDivElement>('chapters');
  private readonly chapterList = need<HTMLDivElement>('chapters-list');
  private readonly teach = document.createElement('div');
  /** what the teach line shows now: the key it was last built for, or null when there is none */
  private teachKey: string | null = null;
  private leaveTimer = 0;
  /** the how-to-play page paused a running game, and owes it a resume */
  private owesResume = false;
  private returnFocus: HTMLElement | null = null;
  private chaptersReturnFocus: HTMLElement | null = null;

  constructor(private readonly host: ShellHost) {
    this.hint.id = 'hint';
    this.hint.hidden = true;
    document.body.appendChild(this.hint);
    this.teach.id = 'teach';
    this.teach.hidden = true;
    this.teach.setAttribute('role', 'status'); // read out when it changes, without taking the focus
    document.body.appendChild(this.teach);

    this.play.addEventListener('click', () => this.host.start());
    need<HTMLButtonElement>('title-help').addEventListener('click', () => this.openHelp());
    need<HTMLButtonElement>('title-chapters').addEventListener('click', () => this.openChapters());
    need<HTMLButtonElement>('help-chapters').addEventListener('click', () => this.openChapters());
    need<HTMLButtonElement>('chapters-back').addEventListener('click', () => this.closeChapters());
    this.chapterList.addEventListener('click', (e) => {
      const id = (e.target as Element | null)?.closest<HTMLElement>('[data-level]')?.dataset['level'];
      if (id) this.choose(id);
    });
    need<HTMLButtonElement>('help-back').addEventListener('click', () => this.closeHelp());
    for (const b of this.soundButtons) b.addEventListener('click', () => this.toggleSound());
    this.volume.addEventListener('input', () => {
      this.host.sound?.setVolume(Number(this.volume.value) / Number(this.volume.max));
      this.syncSound();
    });
    this.syncSound();
  }

  get helpOpen(): boolean {
    return !this.help.hidden;
  }

  get chaptersOpen(): boolean {
    return !this.chapterBox.hidden;
  }

  /** Call on every state change, and once when the game first reaches `menu`. */
  onState(to: GameState): void {
    window.clearTimeout(this.leaveTimer);
    if (to === 'menu') {
      // Back from the game (the last chapter's results, or M while paused): give the mouse back, as openHelp
      // does, or the title's buttons cannot be clicked until Esc (B-61). The state is `menu` by now, so the
      // game's own listener for the lock ending has nothing to do.
      if (document.pointerLockElement) document.exitPointerLock();
      this.title.hidden = false;
      this.title.classList.remove('leaving');
      this.setPlay(false);
      if (this.root.dataset['shell'] !== 'ready') this.ready();
    } else if (to === 'loading') {
      this.setPlay(true);
    } else if (!this.title.hidden) {
      this.title.classList.add('leaving');
      this.leaveTimer = window.setTimeout(() => { this.title.hidden = true; }, SHELL.leaveMs);
    }
    this.syncHint(to);
  }

  /** The game is interactive: take over from index.html's inline listeners, and honour a press made before now. */
  private ready(): void {
    const intent = this.root.dataset['intent'];
    this.root.dataset['shell'] = 'ready';
    delete this.root.dataset['intent'];
    // after the state change that brought us here has finished telling its listeners
    if (intent === 'play') queueMicrotask(() => this.host.start());
    else if (intent === 'help') queueMicrotask(() => this.openHelp());
    else if (intent === 'chapters') queueMicrotask(() => this.openChapters());
  }

  private setPlay(loading: boolean): void {
    this.play.textContent = loading ? SHELL.labels.loading : SHELL.labels.play;
    this.play.disabled = loading;
  }

  /**
   * A key went down. True if the shell used it, in which case the game must not act on it as well.
   * `startKey` is the game's own start key (Enter): on the title it and Space both mean Play.
   */
  onKey(e: KeyboardEvent, startKey: string): boolean {
    // A held key's repeats belong to whatever its first press was for. On the title that press was the shell's
    // (Play, or another button's own click), so a repeat must not reach the game's start key behind it: that
    // route starts the level without the Play press, and so without sound (OQ-073).
    if (e.repeat) return this.helpOpen || this.chaptersOpen || this.host.state() === 'menu';
    if (this.chaptersOpen) {
      // the list has the keyboard, over the title or over the how-to-play page: Enter and Space press the
      // chapter in focus, the arrows move between them, and the same key that opened it shuts it
      if (e.code === SHELL.keys.back || e.code === SHELL.keys.chapters) this.closeChapters();
      else if (e.code === SHELL.keys.up || e.code === SHELL.keys.down) {
        e.preventDefault(); // the arrows are the list's here, not the page's scroll
        this.stepChapter(e.code === SHELL.keys.down ? 1 : -1);
      }
      return true;
    }
    if (this.helpOpen) {
      if (e.code === SHELL.keys.back || e.code === SHELL.keys.help) this.closeHelp();
      else if (e.code === SHELL.keys.chapters) this.openChapters();
      return true; // the page has the keyboard: Enter and Space press its focused button, the arrows scroll it
    }
    if (e.code === SHELL.keys.help) {
      this.openHelp(); // which refuses where the page could not pause the game
      return true;
    }
    if (e.code === SHELL.keys.chapters && this.host.state() === 'menu') {
      this.openChapters();
      return true;
    }
    if (this.host.state() === 'menu' && (e.code === startKey || SHELL.keys.start.includes(e.code))) {
      // a focused button already turns Enter and Space into its own click: do not start twice, or start
      // the game when the key was meant for another button
      if (!(document.activeElement instanceof HTMLButtonElement) || document.activeElement === this.play) this.host.start();
      return true;
    }
    return false;
  }

  /**
   * Open the how-to-play page. Refused while the game cannot be paused under it (OQ-073): a level that is
   * loading starts when it is ready, and a fallen warrior respawns, and either would then run behind the page
   * with the page's own keys (the arrows that scroll it) walking the warrior. Every way in comes through here:
   * the key, the pad, the title's button and a press made before the game was ready.
   */
  openHelp(): void {
    const s = this.host.state();
    if (this.helpOpen || s === 'loading' || s === 'death' || s === 'boot') return;
    this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (this.host.state() === 'play') {
      this.host.pause();
      this.owesResume = true;
    }
    // Give the mouse back: while the canvas holds the pointer lock there is no cursor to press Back or move the
    // slider with, and the camera keeps turning behind the page. The game is paused by now, so its own
    // listener for the lock ending (which pauses a running game) has nothing to do.
    if (document.pointerLockElement) document.exitPointerLock();
    this.helpBody.replaceChildren(this.host.helpContent());
    this.help.hidden = false;
    this.help.scrollTop = 0;
    this.syncSound();
    this.syncHint(this.host.state());
    need<HTMLButtonElement>('help-back').focus({ preventScroll: true });
  }

  /**
   * What the page is built from has changed: build its body again if it is open. The chapters are read after
   * the game is ready, and a How to play press made before then opens the page at once, so without this the
   * page showed "The moves" with nothing under it until it was closed and opened again (B-60).
   */
  refreshHelp(): void {
    if (this.helpOpen) this.helpBody.replaceChildren(this.host.helpContent());
    if (this.chaptersOpen) this.fillChapters(true); // the same lesson: a list opened before the names were read
  }

  // ---------- the chapter list (D-025) ----------

  /**
   * Open the chapter list. Only from the title, or over the how-to-play page: so behind it the game is at the
   * title, or paused by that page, or finished, and never running. Every way in comes through here: the two
   * buttons, the key, the pad, and a press made before the game was ready.
   */
  openChapters(): void {
    if (this.chaptersOpen || !(this.helpOpen || this.host.state() === 'menu')) return;
    this.chaptersReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.chapterBox.hidden = false;
    this.chapterBox.scrollTop = 0;
    this.fillChapters(true);
  }

  /** Build the list from the level files' own names, and put the focus on its first chapter. */
  private fillChapters(focus: boolean): void {
    const rows = this.host.chapters().map((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn';
      b.dataset['level'] = c.id;
      const n = document.createElement('span');
      n.className = 'n';
      n.textContent = `Chapter ${c.chapter}`;
      const t = document.createElement('span');
      t.textContent = c.title;
      b.append(n, t);
      return b;
    });
    this.chapterList.replaceChildren(...rows);
    if (focus) (rows[0] ?? need<HTMLButtonElement>('chapters-back')).focus({ preventScroll: true });
  }

  /** Move the focus one chapter down (1) or up (-1), stopping at the ends; Back is below the last. */
  stepChapter(by: number): void {
    if (!this.chaptersOpen) return;
    const stops = [...this.chapterList.querySelectorAll<HTMLButtonElement>('button'), need<HTMLButtonElement>('chapters-back')];
    const at = stops.indexOf(document.activeElement as HTMLButtonElement);
    stops[Math.max(0, Math.min(stops.length - 1, at < 0 ? 0 : at + by))]?.focus({ preventScroll: true });
  }

  /** Press whatever the list has in focus (a pad's A): a chapter, or Back. */
  pressChapter(): void {
    if (!this.chaptersOpen) return;
    const el = document.activeElement;
    if (el instanceof HTMLButtonElement && this.chapterBox.contains(el)) el.click();
  }

  closeChapters(): void {
    if (!this.chaptersOpen) return;
    this.chapterBox.hidden = true;
    if (this.chaptersReturnFocus?.isConnected) this.chaptersReturnFocus.focus({ preventScroll: true });
    this.chaptersReturnFocus = null;
  }

  /**
   * A chapter was chosen. The list goes, and so does the how-to-play page if it was opened from there: the game
   * that page paused is not resumed, it is left for the chapter chosen (the host loads it from `pause`).
   */
  private choose(id: string): void {
    this.chapterBox.hidden = true;
    this.chaptersReturnFocus = null;
    if (this.helpOpen) {
      this.help.hidden = true;
      this.owesResume = false;
      this.returnFocus = null;
    }
    (document.activeElement as HTMLElement | null)?.blur?.();
    this.host.startChapter(id);
    this.syncHint(this.host.state());
  }

  // ---------- the teach line (D-025) ----------

  /**
   * Show this teach line, or none. `key` names what is shown (the line, and whose keys it is written in): the
   * content is built only when the key changes, since this is called every tick. `spot` is the place it belongs
   * to, kept on the element for the checks and never drawn.
   */
  showTeach(key: string | null, line: string | null = null, spot: string | null = null): void {
    if (key === this.teachKey) return;
    this.teachKey = key;
    if (key === null || line === null) {
      this.teach.replaceChildren();
      delete this.teach.dataset['move'];
      delete this.teach.dataset['spot'];
    } else {
      this.teach.replaceChildren(this.host.teachContent(line));
      this.teach.dataset['move'] = line;
      this.teach.dataset['spot'] = spot ?? '';
    }
    this.syncHint(this.host.state());
  }

  closeHelp(): void {
    if (!this.helpOpen) return;
    this.help.hidden = true;
    if (this.owesResume && this.host.state() === 'pause') this.host.resume();
    this.owesResume = false;
    this.syncHint(this.host.state());
    if (this.returnFocus?.isConnected && this.host.state() === 'menu') this.returnFocus.focus({ preventScroll: true });
    else (document.activeElement as HTMLElement | null)?.blur?.();
    this.returnFocus = null;
  }

  toggleSound(): void {
    const s = this.host.sound;
    if (!s) return;
    s.setMuted(!s.muted());
    this.syncSound();
  }

  /** Show what the audio module holds: the two buttons' labels and the slider. Call after anything changes it. */
  syncSound(): void {
    const s = this.host.sound;
    const section = this.volume.closest('.sound');
    for (const b of this.soundButtons) b.hidden = !s;
    if (section instanceof HTMLElement) {
      section.hidden = !s;
      const heading = section.previousElementSibling;
      if (heading instanceof HTMLElement) heading.hidden = !s;
    }
    if (!s) return;
    for (const b of this.soundButtons) {
      b.textContent = s.muted() ? SHELL.labels.soundOff : SHELL.labels.soundOn;
      b.setAttribute('aria-pressed', String(!s.muted()));
    }
    this.volume.value = String(Math.round(s.volume() * Number(this.volume.max)));
    this.syncHint(this.host.state());
  }

  private syncHint(state: GameState): void {
    const playing = state === 'play' || state === 'pause' || state === 'death';
    this.hint.hidden = !playing || this.helpOpen;
    if (!this.hint.hidden) this.hint.textContent = this.host.hint();
    // the teach line is for a game being played: not under PAUSED, not beside the word a fall leaves on screen
    this.teach.hidden = this.teachKey === null || state !== 'play' || this.helpOpen;
  }
}
