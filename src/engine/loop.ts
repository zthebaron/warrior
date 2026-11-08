// Fixed-timestep loop. Simulation ticks at LOOP_CONFIG.fixedHz via an accumulator;
// rendering runs every animation frame and receives an interpolation alpha in [0,1).

export const LOOP_CONFIG = {
  fixedHz: 60,            // simulation rate (physics + gameplay ticks per second)
  maxFrameDeltaSec: 0.25, // a single frame longer than this is clamped (tab switch, debugger)
  maxStepsPerFrame: 5,    // spiral-of-death guard: never run more ticks than this per frame
};

export interface LoopHooks {
  onFixedUpdate(dt: number): void;
  onRender(alpha: number, frameDt: number): void;
  /** Queried every frame. The loop owns no pause flag of its own. */
  shouldSimulate(): boolean;
}

const MS_PER_SEC = 1000;

export class GameLoop {
  readonly dt = 1 / LOOP_CONFIG.fixedHz;
  /** Total fixed ticks executed since start. Useful for proving pause actually stops time. */
  tickCount = 0;
  /** Total render frames since start. */
  frameCount = 0;
  private accumulator = 0;
  private lastTime = 0;
  private rafId = 0;
  private running = false;

  constructor(private readonly hooks: LoopHooks) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  /** Dev tool: run exactly one fixed tick right now, regardless of state (frame stepping). */
  stepOnce(): void {
    this.tick();
  }

  private tick(): void {
    this.hooks.onFixedUpdate(this.dt);
    this.tickCount++;
  }

  private readonly frame = (now: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.frame);
    const frameDt = Math.min((now - this.lastTime) / MS_PER_SEC, LOOP_CONFIG.maxFrameDeltaSec);
    this.lastTime = now;

    if (this.hooks.shouldSimulate()) {
      this.accumulator += frameDt;
      let steps = 0;
      while (this.accumulator >= this.dt && steps < LOOP_CONFIG.maxStepsPerFrame && this.hooks.shouldSimulate()) {
        this.tick();
        this.accumulator -= this.dt;
        steps++;
      }
      // Hit the cap: drop the backlog instead of trying to catch up forever.
      if (this.accumulator >= this.dt || !this.hooks.shouldSimulate()) this.accumulator = 0;
    } else {
      this.accumulator = 0; // never bank time while not simulating
    }

    this.frameCount++;
    this.hooks.onRender(this.accumulator / this.dt, frameDt);
  };
}
