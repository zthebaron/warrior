// Touch (D-027): a thumb as one more live input source, beside the keyboard and the pad.
//
// What the simulation is given by a thumb is what a pad already gives it and nothing else (PadSource,
// src/engine/input.ts). The stick past its dead zone is a direction at FULL deflection: the move intent has
// length 1, as a held key's has and as the pad's has, so the player is never driven at a part speed the game's
// measured numbers (MOVE budgets, MEASUREMENTS) were not taken with. Sprint has no button: the stick pushed to
// its outer ring is sprint. Jump and Dash are held states, exactly as keys are; the player finds its own edges.
// The sword comes through InputSystem.pressSlash, as the pad's does.
//
// This module is the numbers and the state, with no import and no DOM: what a finger did is told to it by
// src/ui/touch-ui.ts, which owns the elements and the touch events. Playback, the override, traces and the bot
// never come through here. A page with a mouse and no touch never builds either.
//
// Every number is in MEASUREMENTS.md "D-027 touch controls".

export const TOUCH = {
  /** The stick. Lengths are CSS pixels; shares are of `radius`. */
  stick: {
    /** the ring's radius: the knob's centre travels this far and no further */
    radius: 60,
    /** the knob's own radius */
    knob: 26,
    /** a touch that begins within this of the ring's centre takes the stick */
    reach: 104,
    /** the ring's centre, from the left and bottom edges of the safe area */
    inset: { x: 92, y: 88 },
    /** travel below this share of the radius is no input */
    deadzone: 0.3,
    /** at or past this share the stick is in its outer ring: sprint */
    sprintFrom: 0.85,
    /** once sprinting, it holds until the stick comes back inside this share (so a thumb resting on the ring does not flicker) */
    sprintUntil: 0.7,
  },
  /** The buttons: radius, and the centre from the right and bottom edges of the safe area. A thumb's arc about the corner. */
  buttons: {
    jump: { radius: 40, inset: { x: 70, y: 64 } },
    slash: { radius: 31, inset: { x: 166, y: 50 } },
    dash: { radius: 31, inset: { x: 60, y: 160 } },
  },
  /** a touch that begins within this of a button's edge presses it */
  pressPad: 10,
  /** a finger this far past a button's edge has slid off it: the button is let go */
  slideOff: 30,
  /** a touch on a button of the page that travels further than this is a scroll, not a press of it */
  tapSlop: 12,
  /** the pause button: a square of this side, this far from the top and right edges of the safe area */
  pause: { size: 44, inset: 10 },
  /** a drag turns the camera as a mouse moved this many times as far would */
  lookScale: 1.5,
  /** on a device whose main pointer is a finger the canvas is drawn at no more than this many device pixels a CSS pixel */
  maxPixelRatio: 1.5,
  /** what the game's words call each control: the teach lines, the how-to-play page and the controls' own captions */
  labels: {
    move: 'the stick',
    look: 'Drag anywhere else on the screen',
    jump: 'Jump',
    dash: 'Dash',
    slash: 'Sword',
    sprint: 'the stick at its edge (hold)',
    Pause: 'The pause button, top right',
    'Back to the title (while paused)': 'Menu, on the pause card',
    'Start, and the next chapter': 'Play, and Next chapter',
    'How to play': 'How to play, on the pause card',
    'Chapters (from the title, or this page)': 'Chapters',
  } as Readonly<Record<string, string>>,
  /** the words on the cards a finger presses */
  words: {
    paused: 'Paused',
    resume: 'Resume',
    help: 'How to play',
    chapters: 'Chapters',
    menu: 'Menu',
    complete: 'Complete',
    next: 'Next chapter',
    turn: 'Turn your phone sideways to play.',
    pause: 'Pause',
  },
};

export type TouchButton = keyof typeof TOUCH.buttons;

/** What the stick says for a thumb at (dx, dy) CSS pixels from the ring's centre, screen axes (y down). */
export interface StickRead {
  /** move intent in the screen's frame, x right and y forward (up the screen); length 0 or 1 */
  x: number;
  y: number;
  sprint: boolean;
  /** where the knob is drawn, from the centre, in CSS pixels: the thumb's place, held inside the ring */
  knobX: number;
  knobY: number;
}

/**
 * The stick, as a pure function. `wasSprinting` is last read's sprint, for the ring's two edges.
 * Inside the dead zone it says nothing; past it the direction has length 1 whatever the travel.
 */
export function readStick(dx: number, dy: number, wasSprinting = false): StickRead {
  const s = TOUCH.stick;
  const len = Math.hypot(dx, dy);
  const share = len / s.radius;
  const k = len > s.radius ? s.radius / len : 1;
  const knobX = dx * k, knobY = dy * k;
  if (share < s.deadzone || len === 0) return { x: 0, y: 0, sprint: false, knobX, knobY };
  return { x: dx / len, y: -dy / len, sprint: share >= (wasSprinting ? s.sprintUntil : s.sprintFrom), knobX, knobY };
}

/**
 * The held states a thumb has made, in the shape InputSystem reads a pad in (PadSource).
 *
 * A press of Jump or Dash that begins and ends between two ticks is still reported for one tick, as the sword's
 * is (InputSystem.pressSlash): a phone that draws slowly runs several ticks in one frame, and a tap can fall
 * wholly between two frames. Only a press made while the game is being played is kept this way (`live`), so a
 * tap made under a pause or a results card is never a jump when play comes back.
 */
export class TouchSource {
  private stick: StickRead = readStick(0, 0);
  private readonly down = { jump: false, dash: false };
  private readonly tapped = { jump: false, dash: false };

  /** The thumb is on the stick, this far from the ring's centre (CSS pixels, y down). Returns what was read, for drawing the knob. */
  pushStick(dx: number, dy: number): StickRead {
    this.stick = readStick(dx, dy, this.stick.sprint);
    return this.stick;
  }

  releaseStick(): void {
    this.stick = readStick(0, 0);
  }

  /** A button went down. `live`: the game is being played right now, so a press shorter than a tick is kept for one. */
  press(b: 'jump' | 'dash', live: boolean): void {
    this.down[b] = true;
    if (live) this.tapped[b] = true;
  }

  release(b: 'jump' | 'dash'): void {
    this.down[b] = false;
  }

  /** Let go of everything: the page lost the fingers (a cancel, a pause, a card, the tab hidden). */
  clear(): void {
    this.releaseStick();
    this.down.jump = this.down.dash = false;
    this.tapped.jump = this.tapped.dash = false;
  }

  // ---------- PadSource ----------
  move(): { x: number; y: number } {
    return { x: this.stick.x, y: this.stick.y };
  }

  /** Read once a tick by the input system: a kept tap is spent by the read. */
  held(action: 'jump' | 'dash' | 'sprint'): boolean {
    if (action === 'sprint') return this.stick.sprint;
    const v = this.down[action] || this.tapped[action];
    this.tapped[action] = false;
    return v;
  }

  /** Is anything held? For the page (which control to draw pressed), never for the simulation. */
  idle(): boolean {
    return this.stick.x === 0 && this.stick.y === 0 && !this.down.jump && !this.down.dash && !this.tapped.jump && !this.tapped.dash;
  }
}
