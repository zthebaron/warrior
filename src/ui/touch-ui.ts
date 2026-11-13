// The touch controls on the page (D-027): the stick, the three buttons, the pause button, the two cards a finger
// presses (paused, complete) and the notice shown to a phone held upright. DOM over the canvas, as the shell is;
// nothing here is drawn in the 3D scene, and nothing here is read by the simulation, which sees a thumb only as
// the held states in src/engine/touch.ts (TouchSource), through InputSystem, exactly as it sees a pad.
//
// Built by src/main.ts only where the device's main pointer is a finger, or on the first touch, or where a test
// asks (?touch=on); never in the harness's test mode, and never on a bare page that did not ask. A page with a
// mouse and no touch has none of these elements in its document. The look is index.html's (ink on paper, part
// see-through); every size and place is set here from TOUCH, so the picture and the hit test share one table.
//
// How touches are read:
//   - Every touch is followed by its own identifier, at the document, from start to end. What a touch IS is
//     decided once, where it begins: the stick (anywhere near the ring), a button, or a drag that turns the camera.
//   - A touch that begins while the game is not being played is nothing, for as long as it lasts: the tap on
//     Resume, on Next chapter or on a chapter's name is never a jump or a camera drag when play comes back.
//   - A second finger on a control that is already held is swallowed: it is not a second press and not a drag.
//   - A finger that slides off a button lets it go. The stick is never slid off: past the ring it is at the ring.
//   - touchcancel, a touch that vanishes without an end, the game leaving `play`, the tab hidden and the window
//     losing focus all let go of everything.
//   - On the play surface the touch events are prevented, so the page does not scroll, bounce, zoom or select,
//     and no click follows a tap: the canvas's click is what asks for the pointer lock, and a finger has none.
//   - A button of the page (the pause button, the cards', the title's, the how-to-play page's, a chapter's row) is
//     pressed by a touch that lifts on it without having travelled, and this module presses it. The browser makes
//     no click of a tap while another finger is on the glass, and a thumb resting on the stick is the usual case:
//     left to the browser, Pause and Resume would not answer it. The browser's own click is then prevented, so a
//     button is never pressed twice. A touch that travels is a scroll, and presses nothing.

import type { GameState } from '../engine/state';
import { TOUCH, TouchSource, type TouchButton } from '../engine/touch';

/** What the touch controls ask of the game. They never reach past these. */
export interface TouchHost {
  state(): GameState;
  /** the Sword button went down */
  slash(): void;
  /** a drag: turn the camera as a mouse moved this many pixels would */
  look(dxPixels: number, dyPixels: number): void;
  pause(): void;
  resume(): void;
  /** back to the title, from the pause card */
  menu(): void;
  /** the results card's one button: the next chapter, or the title after the last */
  next(): void;
  hasNext(): boolean;
  /** the how-to-play page and the chapter list; null on a page with no shell */
  help: (() => void) | null;
  chapters: (() => void) | null;
  /** is the how-to-play page or the chapter list open over the game? */
  covered(): boolean;
  /** a finger touched the screen: the game's words name the touch controls from here on */
  touched(): void;
}

type Role =
  | { kind: 'stick' }
  | { kind: 'button'; button: TouchButton }
  | { kind: 'look'; x: number; y: number }
  /** a touch that began on a button of the page: a press of it if it lifts there without having travelled */
  | { kind: 'tap'; el: HTMLButtonElement; x: number; y: number }
  /** a touch that is nothing: it began outside play, or on a control already held, or it has slid off a button */
  | { kind: 'none' };

/** Where a touch is left to the browser (the slider, a scroll of the how-to-play page or the chapter list). Buttons are not: see the header. */
const THE_BROWSERS = 'a, input, label, #title, #help, #chapters';

function div(className: string, parent: HTMLElement): HTMLDivElement {
  const e = document.createElement('div');
  e.className = className;
  parent.appendChild(e);
  return e;
}

function button(text: string, className: string, parent: HTMLElement, press: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.textContent = text;
  b.addEventListener('click', press);
  parent.appendChild(b);
  return b;
}

/** `n` CSS pixels in from an edge of the safe area (a notch, a home bar). */
const inset = (n: number, edge: 'left' | 'right' | 'top' | 'bottom'): string => `calc(${n}px + env(safe-area-inset-${edge}, 0px))`;

export class TouchUi {
  /** what the input system reads: hand it to InputSystem.setTouch */
  readonly source = new TouchSource();
  private readonly layer = document.createElement('div');
  private readonly stick: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private readonly buttons: Record<TouchButton, HTMLDivElement>;
  private readonly pauseButton: HTMLButtonElement;
  private readonly card = document.createElement('div');
  private readonly cardTitle: HTMLHeadingElement;
  private readonly cardRow: HTMLDivElement;
  private readonly turn = document.createElement('div');
  private readonly roles = new Map<number, Role>();
  private readonly upright = window.matchMedia('(orientation: portrait)');
  /** the notice paused a running game, and owes it a resume when the phone is turned back */
  private owesResume = false;
  /** what the card was last built for, so it is rebuilt only when that changes */
  private cardFor = '';

  constructor(private readonly host: TouchHost) {
    const S = TOUCH.stick, L = TOUCH.labels, W = TOUCH.words;
    this.layer.id = 'touch';
    this.layer.hidden = true;
    this.layer.setAttribute('aria-hidden', 'true'); // drawn controls for a thumb; the pause button below is a real one

    this.stick = div('stick', this.layer);
    Object.assign(this.stick.style, { width: `${2 * S.radius}px`, height: `${2 * S.radius}px`, left: inset(S.inset.x - S.radius, 'left'), bottom: inset(S.inset.y - S.radius, 'bottom') });
    this.knob = div('knob', this.stick);
    Object.assign(this.knob.style, { width: `${2 * S.knob}px`, height: `${2 * S.knob}px`, margin: `${-S.knob}px 0 0 ${-S.knob}px` });

    const make = (b: TouchButton): HTMLDivElement => {
      const B = TOUCH.buttons[b];
      const e = div(`tb ${b}`, this.layer);
      e.textContent = L[b] ?? b;
      Object.assign(e.style, { width: `${2 * B.radius}px`, height: `${2 * B.radius}px`, right: inset(B.inset.x - B.radius, 'right'), bottom: inset(B.inset.y - B.radius, 'bottom') });
      return e;
    };
    this.buttons = { jump: make('jump'), slash: make('slash'), dash: make('dash') };

    // the pause button stands beside the layer, not in it: it is a real button, pressed as any button is
    const pause = document.createElement('button');
    pause.type = 'button';
    pause.id = 'touch-pause';
    pause.hidden = true;
    pause.setAttribute('aria-label', W.pause);
    Object.assign(pause.style, { width: `${TOUCH.pause.size}px`, height: `${TOUCH.pause.size}px`, top: inset(TOUCH.pause.inset, 'top'), right: inset(TOUCH.pause.inset, 'right') });
    pause.addEventListener('click', () => { if (this.host.state() === 'play') this.host.pause(); });
    this.pauseButton = pause;

    this.card.id = 'touch-card';
    this.card.hidden = true;
    this.card.setAttribute('role', 'dialog');
    this.card.setAttribute('aria-labelledby', 'touch-card-h');
    const sheet = div('card', this.card);
    this.cardTitle = document.createElement('h1');
    this.cardTitle.id = 'touch-card-h';
    sheet.appendChild(this.cardTitle);
    this.cardRow = div('row', sheet);

    this.turn.id = 'touch-turn';
    this.turn.hidden = true;
    this.turn.setAttribute('role', 'status');
    this.turn.textContent = W.turn;

    document.body.append(this.layer, pause, this.card, this.turn);

    // The touches, at the document, not passive: the play surface's are prevented (see the header).
    const opts = { passive: false, capture: true } as const;
    document.addEventListener('touchstart', this.onStart, opts);
    document.addEventListener('touchmove', this.onMove, opts);
    document.addEventListener('touchend', this.onEnd, opts);
    document.addEventListener('touchcancel', this.onEnd, opts);
    // Everything else that takes the fingers away from the game.
    window.addEventListener('blur', () => this.letGo());
    window.addEventListener('pagehide', () => this.letGo());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.letGo(); });
    // A long press must not open a menu over the game, nor two fingers or two taps zoom it (Safari's own gesture
    // events; the rest is touch-action in index.html). The shell's pages keep the browser's own behaviour.
    const mine = (e: Event): boolean => !(e.target instanceof Element && e.target.closest('#help, #chapters'));
    document.addEventListener('contextmenu', (e) => { if (mine(e)) e.preventDefault(); });
    for (const type of ['gesturestart', 'gesturechange', 'dblclick']) document.addEventListener(type, (e) => { if (mine(e)) e.preventDefault(); }, { passive: false });
    this.upright.addEventListener('change', () => this.sync());
    window.addEventListener('resize', () => this.sync());
    this.sync();
  }

  /** May a touch that begins now be a control? Only while the game is being played, or in the moment between a fall and standing again. */
  private live(): boolean {
    const s = this.host.state();
    return s === 'play' || s === 'death';
  }

  /** Call on every state change, and when the how-to-play page or the chapter list opens or shuts. */
  sync(): void {
    const s = this.host.state();
    const live = s === 'play' || s === 'death';
    const up = this.upright.matches;
    if (!live) this.letGo();
    this.layer.hidden = !live;
    this.pauseButton.hidden = s !== 'play';
    // Landscape is how it is played. Upright, a game that is running, paused or loading waits under the notice;
    // the title, the how-to-play page and the chapter list have their own upright layouts and stand over it.
    this.turn.hidden = !(up && (live || s === 'pause' || s === 'loading'));
    const card = this.turn.hidden && (s === 'pause' || s === 'results') ? s : '';
    this.card.hidden = !card;
    if (card) this.fillCard(card);
    if (up && s === 'play') {
      // after the state change that brought us here has finished telling its listeners
      queueMicrotask(() => {
        if (!this.upright.matches || this.host.state() !== 'play') return;
        this.owesResume = true;
        this.host.pause();
      });
    } else if (!up && this.owesResume) {
      this.owesResume = false;
      if (s === 'pause' && !this.host.covered()) queueMicrotask(() => { if (this.host.state() === 'pause' && !this.upright.matches) this.host.resume(); });
    }
  }

  /** The card for `pause` or `results`: its word and its buttons. Built when what it is for changes. */
  private fillCard(s: 'pause' | 'results'): void {
    const W = TOUCH.words;
    const key = s === 'pause' ? 'pause' : this.host.hasNext() ? 'results:next' : 'results:menu';
    if (key === this.cardFor) return;
    this.cardFor = key;
    this.cardRow.replaceChildren();
    if (s === 'pause') {
      this.cardTitle.textContent = W.paused;
      button(W.resume, 'btn primary', this.cardRow, () => { this.owesResume = false; this.host.resume(); });
      if (this.host.help) button(W.help, 'btn', this.cardRow, () => this.host.help?.());
      if (this.host.chapters) button(W.chapters, 'btn', this.cardRow, () => this.host.chapters?.());
      button(W.menu, 'btn', this.cardRow, () => { this.owesResume = false; this.host.menu(); });
    } else {
      this.cardTitle.textContent = W.complete;
      button(this.host.hasNext() ? W.next : W.menu, 'btn primary', this.cardRow, () => this.host.next());
    }
  }

  /** The cards and the notice: what the chapter list must stand over (it makes them inert while it is open). */
  get overlays(): HTMLElement[] {
    return [this.card, this.turn];
  }

  // ---------- touches ----------

  private centre(e: HTMLElement): { x: number; y: number } {
    const r = e.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  private holds(kind: 'stick' | TouchButton): boolean {
    for (const r of this.roles.values()) {
      if (kind === 'stick' ? r.kind === 'stick' : r.kind === 'button' && r.button === kind) return true;
    }
    return false;
  }

  /** What a touch that begins here is: decided once. */
  private roleAt(x: number, y: number): Role {
    const c = this.centre(this.stick);
    if (Math.hypot(x - c.x, y - c.y) <= TOUCH.stick.reach) return this.holds('stick') ? { kind: 'none' } : { kind: 'stick' };
    let best: TouchButton | null = null, bestGap = TOUCH.pressPad;
    for (const b of Object.keys(this.buttons) as TouchButton[]) {
      const p = this.centre(this.buttons[b]);
      const gap = Math.hypot(x - p.x, y - p.y) - TOUCH.buttons[b].radius;
      if (gap <= bestGap) { best = b; bestGap = gap; }
    }
    if (best) return this.holds(best) ? { kind: 'none' } : { kind: 'button', button: best };
    return { kind: 'look', x, y };
  }

  private readonly onStart = (e: TouchEvent): void => {
    this.host.touched();
    this.reconcile(e);
    const live = this.live();
    let mine = false;
    for (const t of Array.from(e.changedTouches)) {
      const at = t.target instanceof Element ? t.target : null;
      const press = at?.closest('button');
      if (press) {
        this.roles.set(t.identifier, { kind: 'tap', el: press, x: t.clientX, y: t.clientY });
        continue;
      }
      if (at?.closest(THE_BROWSERS)) continue;
      mine = true;
      const role: Role = live ? this.roleAt(t.clientX, t.clientY) : { kind: 'none' };
      this.roles.set(t.identifier, role);
      if (role.kind === 'stick') this.push(t);
      else if (role.kind === 'button') {
        this.buttons[role.button].classList.add('on');
        if (role.button === 'slash') this.host.slash();
        else this.source.press(role.button, this.host.state() === 'play');
      }
    }
    if (mine && e.cancelable) e.preventDefault();
  };

  private readonly onMove = (e: TouchEvent): void => {
    this.reconcile(e);
    let mine = false;
    for (const t of Array.from(e.changedTouches)) {
      const role = this.roles.get(t.identifier);
      if (!role) continue;
      if (role.kind === 'tap') {
        // a touch that began on a button and travels is a scroll: the browser's from here on, and no press
        if (Math.hypot(t.clientX - role.x, t.clientY - role.y) > TOUCH.tapSlop) this.roles.delete(t.identifier);
        continue;
      }
      mine = true;
      if (role.kind === 'stick') this.push(t);
      else if (role.kind === 'button') {
        const p = this.centre(this.buttons[role.button]);
        if (Math.hypot(t.clientX - p.x, t.clientY - p.y) > TOUCH.buttons[role.button].radius + TOUCH.slideOff) {
          this.drop(role); // the finger has slid off: the button is let go, and this touch is nothing from here on
          this.roles.set(t.identifier, { kind: 'none' });
        }
      } else if (role.kind === 'look') {
        if (this.live()) this.host.look((t.clientX - role.x) * TOUCH.lookScale, (t.clientY - role.y) * TOUCH.lookScale);
        role.x = t.clientX;
        role.y = t.clientY;
      }
    }
    if (mine && e.cancelable) e.preventDefault();
  };

  /** touchend and touchcancel: the same to the game, but only an end presses a button. */
  private readonly onEnd = (e: TouchEvent): void => {
    let mine = false;
    const pressed: HTMLButtonElement[] = [];
    for (const t of Array.from(e.changedTouches)) {
      const role = this.roles.get(t.identifier);
      if (!role) continue;
      this.roles.delete(t.identifier);
      if (role.kind === 'tap') {
        const r = role.el.getBoundingClientRect();
        const on = t.clientX >= r.left && t.clientX <= r.right && t.clientY >= r.top && t.clientY <= r.bottom;
        if (e.type === 'touchend' && on && role.el.isConnected && role.el.getClientRects().length > 0) { pressed.push(role.el); mine = true; }
        continue;
      }
      mine = true;
      this.drop(role);
    }
    this.reconcile(e);
    if (mine && e.cancelable) e.preventDefault(); // no click follows a tap: not on the play surface, and not on a button pressed below
    for (const b of pressed) b.click(); // a disabled button ignores it, as it would a click; an inert one is never under a finger
  };

  /** A touch this module follows that the browser no longer lists has ended without telling us: let it go. */
  private reconcile(e: TouchEvent): void {
    if (this.roles.size === 0) return;
    const there = new Set(Array.from(e.touches, (t) => t.identifier));
    for (const [id, role] of this.roles) {
      if (there.has(id)) continue;
      this.drop(role);
      this.roles.delete(id);
    }
  }

  private push(t: Touch): void {
    const c = this.centre(this.stick);
    const read = this.source.pushStick(t.clientX - c.x, t.clientY - c.y);
    this.knob.style.transform = `translate(${read.knobX}px, ${read.knobY}px)`;
    this.stick.classList.add('on');
    this.stick.classList.toggle('sprint', read.sprint);
  }

  /** Undo what a role holds. */
  private drop(role: Role): void {
    if (role.kind === 'stick') {
      this.source.releaseStick();
      this.knob.style.transform = '';
      this.stick.classList.remove('on', 'sprint');
    } else if (role.kind === 'button') {
      this.buttons[role.button].classList.remove('on');
      if (role.button !== 'slash') this.source.release(role.button);
    }
    // a 'tap' holds nothing: it presses its button only when it ends on it
  }

  /** Let go of everything. Fingers still on the screen are nothing until they are lifted and put down again. */
  letGo(): void {
    for (const [id, role] of this.roles) {
      if (role.kind === 'tap') continue; // it holds nothing, and a button under a finger may still be pressed (Resume, under a card that just came)
      this.drop(role);
      this.roles.set(id, { kind: 'none' });
    }
    this.source.clear();
  }
}
