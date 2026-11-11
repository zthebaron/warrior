// Gamepad (D-022). The game had none; the title screen and the sword slash each ask for a gamepad button, and a
// pad that could start the game and swing the sword but not walk would be no use, so this maps the whole game
// onto the standard layout. OQ-072 records that as the builder's call.
//
// What the simulation is given by a pad is what the keyboard already gives it and nothing else. A stick past its
// dead zone is a direction at FULL deflection: the move intent has length 1, as a held key's has, so the player
// is never driven at a part speed the game's measured numbers (MOVE budgets, MEASUREMENTS) were not taken with.
// Buttons are held states, exactly as keys are; the player still finds its own edges.
//
// The pad is read once a render frame (poll). A page in the harness's test mode never builds one: src/main.ts
// makes a Gamepad only when it is not in that mode, and the harness drives input by override and playback,
// which do not come through here.
//
// Every number is in MEASUREMENTS.md "D-022 gamepad".

export const GAMEPAD = {
  /** stick travel below this is no input (a resting stick is rarely at 0) */
  deadzone: 0.35,
  /** the right stick at full tilt turns the camera as a mouse moved this many pixels a second would */
  lookPixelsPerSec: 900,
  /** axes and buttons of the W3C "standard" mapping */
  axes: { moveX: 0, moveY: 1, lookX: 2, lookY: 3 },
  buttons: {
    jump: [0],          // A / cross
    dash: [1],          // B / circle
    slash: [2],         // X / square
    sprint: [7],        // right trigger
    start: [0, 9],      // A, or Start: the title's Play, and the next chapter
    pause: [9],         // Start
    help: [8],          // Back / Select / View
    back: [1, 8],       // B or Back closes the how-to-play page
    up: [12], down: [13], left: [14], right: [15],
  },
  /** what the how-to-play page calls each of them */
  labels: {
    move: 'Left stick or D-pad',
    look: 'Right stick',
    jump: 'A',
    dash: 'B',
    slash: 'X',
    sprint: 'Right trigger (hold)',
    Pause: 'Start',
    'Start, and the next chapter': 'A or Start',
    'How to play': 'Back',
  } as Readonly<Record<string, string>>,
};

export type PadButton = keyof typeof GAMEPAD.buttons;

export class Gamepad {
  private now = new Set<PadButton>();
  private before = new Set<PadButton>();
  private readonly heldOff = new Set<PadButton>();
  private readonly stick = { x: 0, y: 0 };
  private readonly lookStick = { x: 0, y: 0 };

  /** Read the first connected standard-layout pad. Call once a render frame. */
  poll(): void {
    this.before = this.now;
    this.now = new Set();
    this.stick.x = this.stick.y = this.lookStick.x = this.lookStick.y = 0;
    let pad: globalThis.Gamepad | null = null;
    try {
      pad = [...(navigator.getGamepads?.() ?? [])].find((p) => p?.connected && p.mapping === 'standard') ?? null;
    } catch {
      pad = null; // a page that may not read gamepads has none
    }
    if (!pad) return;
    for (const [name, indices] of Object.entries(GAMEPAD.buttons) as [PadButton, number[]][]) {
      if (indices.some((i) => pad.buttons[i]?.pressed)) this.now.add(name);
    }
    for (const name of this.heldOff) if (!this.now.has(name)) this.heldOff.delete(name);
    const dz = GAMEPAD.deadzone, a = GAMEPAD.axes;
    let x = pad.axes[a.moveX] ?? 0, y = pad.axes[a.moveY] ?? 0;
    if (Math.hypot(x, y) < dz) {
      x = (this.now.has('right') ? 1 : 0) - (this.now.has('left') ? 1 : 0);
      y = (this.now.has('down') ? 1 : 0) - (this.now.has('up') ? 1 : 0);
    }
    const len = Math.hypot(x, y);
    if (len > 0) {
      this.stick.x = x / len; // full deflection, whatever the tilt: see the header
      this.stick.y = y / len;
    }
    const lx = pad.axes[a.lookX] ?? 0, ly = pad.axes[a.lookY] ?? 0;
    if (Math.abs(lx) >= dz) this.lookStick.x = lx;
    if (Math.abs(ly) >= dz) this.lookStick.y = ly;
  }

  /** Is the button down? A button under holdOff reads as up until it has been let go. */
  held(name: PadButton): boolean {
    return this.now.has(name) && !this.heldOff.has(name);
  }

  /** Did the button go down this frame? */
  pressed(name: PadButton): boolean {
    return this.now.has(name) && !this.before.has(name);
  }

  /** Ignore the button until it is released: A starts the game from the title and is also jump. */
  holdOff(name: PadButton): void {
    if (this.now.has(name)) this.heldOff.add(name);
  }

  /** Move intent in the screen's frame: x right, y forward. Length 0 or 1. */
  move(): { x: number; y: number } {
    return { x: this.stick.x, y: -this.stick.y };
  }

  /** Camera look, as mouse pixels for this frame. */
  look(frameDt: number): { x: number; y: number } {
    const k = GAMEPAD.lookPixelsPerSec * frameDt;
    return { x: this.lookStick.x * k, y: this.lookStick.y * k };
  }
}
