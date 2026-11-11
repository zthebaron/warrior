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

import type { GameState } from '../engine/state';

// Every number is in MEASUREMENTS.md "D-022 title screen".
export const SHELL = {
  keys: {
    /** also Enter (GAME_RULES.keys.start): the title's Play */
    start: ['Space'],
    help: 'KeyH',
    back: 'Escape',
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
  private leaveTimer = 0;
  /** the how-to-play page paused a running game, and owes it a resume */
  private owesResume = false;
  private returnFocus: HTMLElement | null = null;

  constructor(private readonly host: ShellHost) {
    this.hint.id = 'hint';
    this.hint.hidden = true;
    document.body.appendChild(this.hint);

    this.play.addEventListener('click', () => this.host.start());
    need<HTMLButtonElement>('title-help').addEventListener('click', () => this.openHelp());
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

  /** Call on every state change, and once when the game first reaches `menu`. */
  onState(to: GameState): void {
    window.clearTimeout(this.leaveTimer);
    if (to === 'menu') {
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
    if (e.repeat) return this.helpOpen;
    if (this.helpOpen) {
      if (e.code === SHELL.keys.back || e.code === SHELL.keys.help) this.closeHelp();
      return true; // the page has the keyboard: Enter and Space press its focused button, the arrows scroll it
    }
    if (e.code === SHELL.keys.help && this.host.state() !== 'loading' && this.host.state() !== 'boot') {
      this.openHelp();
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

  openHelp(): void {
    if (this.helpOpen) return;
    this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (this.host.state() === 'play') {
      this.host.pause();
      this.owesResume = true;
    }
    this.helpBody.replaceChildren(this.host.helpContent());
    this.help.hidden = false;
    this.help.scrollTop = 0;
    this.syncSound();
    this.syncHint(this.host.state());
    need<HTMLButtonElement>('help-back').focus({ preventScroll: true });
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
  }

  private syncHint(state: GameState): void {
    const playing = state === 'play' || state === 'pause' || state === 'death';
    this.hint.hidden = !playing || this.helpOpen;
    if (!this.hint.hidden) this.hint.textContent = this.host.hint();
  }
}
