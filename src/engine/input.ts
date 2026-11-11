// Input: keyboard -> InputFrame, sampled once per FIXED tick (never per render frame).
// Every sampled frame is recorded; playback(frames) replaces live input tick-for-tick, which
// makes a replay deterministic regardless of render speed.
//
// InputFrame.x / InputFrame.y are WORLD-SPACE XZ move intent (camera yaw already applied at
// sample time). Replays therefore do not depend on where the camera was pointing.

export interface InputFrame {
  x: number;       // world X move intent, [-1, 1]
  y: number;       // world Z move intent, [-1, 1]
  jump: boolean;   // held state (edge detection is the consumer's job)
  dash: boolean;   // held state
  sprint: boolean; // held state (explicit — no auto-sprint, so replays/bots control it exactly)
}

export const NEUTRAL_FRAME: Readonly<InputFrame> = { x: 0, y: 0, jump: false, dash: false, sprint: false };

export const INPUT_CONFIG = {
  bindings: {
    forward: ['KeyW', 'ArrowUp'],
    back: ['KeyS', 'ArrowDown'],
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    jump: ['Space'],
    dash: ['KeyK'],
    sprint: ['ShiftLeft', 'ShiftRight'],
    // D-022: the sword slash. It is in this table so the how-to-play page shows it with the rest, and it is NOT
    // in InputFrame: a slash is drawn, never simulated, so no trace, replay or bot ever carries it.
    // Mouse0 is the left button, read in src/main.ts only while the mouse is the camera's; no key has that code.
    slash: ['KeyJ', 'Mouse0'],
  },
  maxRecordedFrames: 60 * 60 * 30, // 30 minutes at 60Hz; past this, recording stops (warned once)
};

type Action = keyof typeof INPUT_CONFIG.bindings;

/** A gamepad as the input system reads it (src/engine/gamepad.ts): the same three held states and a move intent. */
export interface PadSource {
  /** screen-relative move intent, x right and y forward; length 0 or 1 */
  move(): { x: number; y: number };
  held(action: 'jump' | 'dash' | 'sprint'): boolean;
}

export class InputSystem {
  private readonly down = new Set<string>();
  private recorded: InputFrame[] = [];
  private recordOverflowWarned = false;
  private playbackQueue: InputFrame[] = [];
  private playbackIndex = 0;
  private override: InputFrame | null = null;
  /** Actions the keyboard is not believed about until their key has been seen up (holdOff). */
  private readonly heldOff = new Set<Action>();
  private pad: PadSource | null = null;

  constructor(target: Window) {
    target.addEventListener('keydown', (e) => this.down.add(e.code));
    target.addEventListener('keyup', (e) => this.down.delete(e.code));
    target.addEventListener('blur', () => this.down.clear());
  }

  /** D-022: also read a gamepad, on the live path only (beside the keyboard; never under playback or the override). */
  setPad(pad: PadSource | null): void {
    this.pad = pad;
  }

  /** Raw key query, for UI / dev tools (NOT for gameplay — gameplay reads InputFrames). */
  isKeyDown(code: string): boolean {
    return this.down.has(code);
  }

  private held(action: Action): boolean {
    return INPUT_CONFIG.bindings[action].some((c) => this.down.has(c));
  }

  /**
   * Do not report `action` from the keyboard until its key has been released once. For a key that has just
   * meant something else: Space starts the game from the title screen (D-022) and is also jump, so without
   * this the player would leap on the first tick. Live keyboard only: playback and the override never see it.
   */
  holdOff(action: Action): void {
    if (this.held(action)) this.heldOff.add(action);
  }

  private pressed(action: Action): boolean {
    const down = this.held(action);
    if (!this.heldOff.has(action)) return down;
    if (!down) this.heldOff.delete(action);
    return false;
  }

  /**
   * Produce this tick's InputFrame. Call exactly once per fixed tick, and only while the
   * simulation is advancing. `cameraYaw` (radians) maps screen-relative keys to world XZ.
   * Pass `live=false` to feed a neutral frame (e.g. free camera owns the keyboard).
   */
  sample(cameraYaw: number, live = true): InputFrame {
    let frame: InputFrame;
    const queued = this.playbackQueue[this.playbackIndex];
    if (queued) {
      frame = { ...queued };
      this.playbackIndex++;
      if (this.playbackIndex >= this.playbackQueue.length) this.stopPlayback();
    } else if (this.override) {
      frame = { ...this.override };
    } else if (!live) {
      frame = { ...NEUTRAL_FRAME };
    } else {
      frame = this.sampleKeyboard(cameraYaw);
    }
    if (this.recorded.length < INPUT_CONFIG.maxRecordedFrames) {
      this.recorded.push(frame);
    } else if (!this.recordOverflowWarned) {
      this.recordOverflowWarned = true;
      console.warn(`[input] recording capped at ${INPUT_CONFIG.maxRecordedFrames} frames`);
    }
    return frame;
  }

  private sampleKeyboard(yaw: number): InputFrame {
    const stick = this.pad?.move();
    const rx = (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0) + (stick?.x ?? 0);
    const ry = (this.held('forward') ? 1 : 0) - (this.held('back') ? 1 : 0) + (stick?.y ?? 0);
    const len = Math.hypot(rx, ry);
    const nx = len > 1 ? rx / len : rx;
    const ny = len > 1 ? ry / len : ry;
    // camera-right = (cos yaw, -sin yaw), camera-forward = (-sin yaw, -cos yaw) in world XZ
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    return {
      x: c * nx - s * ny,
      y: -s * nx - c * ny,
      jump: this.pressed('jump') || (this.pad?.held('jump') ?? false),
      dash: this.pressed('dash') || (this.pad?.held('dash') ?? false),
      sprint: this.pressed('sprint') || (this.pad?.held('sprint') ?? false),
    };
  }

  /** Every frame sampled since the last resetRecording(), in tick order. Returns a copy. */
  record(): InputFrame[] {
    return this.recorded.map((f) => ({ ...f }));
  }

  resetRecording(): void {
    this.recorded = [];
    this.recordOverflowWarned = false;
  }

  /** Replace live input with these frames, one per fixed tick, starting next tick. */
  playback(frames: readonly InputFrame[]): void {
    this.playbackQueue = frames.map((f) => ({ ...f }));
    this.playbackIndex = 0;
  }

  /**
   * Hold this frame as the live input until replaced or cleared (null). Same sampling path as
   * the keyboard: recorded, edge-detected by the consumer, overridden by playback. Used by the
   * playtest bot so it drives the game exactly as a player would — no teleporting.
   */
  setOverride(frame: InputFrame | null): void {
    this.override = frame ? { ...frame } : null;
  }

  stopPlayback(): void {
    this.playbackQueue = [];
    this.playbackIndex = 0;
  }

  isPlayingBack(): boolean {
    return this.playbackIndex < this.playbackQueue.length;
  }
}
