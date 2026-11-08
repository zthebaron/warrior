// Game state machine. The ONE source of truth for "what mode is the game in".
// Every system queries this; no system keeps its own paused/running flag.
//
//   boot -> menu -> loading -> play <-> pause
//                                 play -> death -> play (respawn)
//                                 play -> results -> menu
// Illegal transitions throw — a silent bad transition is how pause bugs are born.

export type GameState = 'boot' | 'menu' | 'loading' | 'play' | 'pause' | 'death' | 'results';

const TRANSITIONS: Readonly<Record<GameState, readonly GameState[]>> = {
  boot: ['menu'],
  menu: ['loading'],
  loading: ['play', 'menu'],
  play: ['pause', 'death', 'results', 'loading'], // loading = level hot-reload
  pause: ['play', 'menu', 'loading'],
  death: ['play', 'loading'],
  results: ['menu', 'loading'],
};

export type StateListener = (to: GameState, from: GameState) => void;

export class StateMachine {
  private current: GameState = 'boot';
  private readonly listeners = new Set<StateListener>();

  get(): GameState {
    return this.current;
  }

  is(...states: GameState[]): boolean {
    return states.includes(this.current);
  }

  /** The only question physics, input and gameplay should ask: may the simulation advance? */
  simulating(): boolean {
    return this.current === 'play';
  }

  can(to: GameState): boolean {
    return TRANSITIONS[this.current].includes(to);
  }

  transition(to: GameState): void {
    if (!this.can(to)) {
      throw new Error(`[state] illegal transition ${this.current} -> ${to}`);
    }
    const from = this.current;
    this.current = to;
    for (const fn of this.listeners) fn(to, from);
  }

  onChange(fn: StateListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
