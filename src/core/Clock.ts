export interface ClockOptions {
  simHz: number;
  /** Clamp accumulated real time to this many fixed steps, to avoid a catch-up burst after e.g. a backgrounded tab. */
  maxFrameSkip?: number;
  update: (fixedDt: number) => void;
  render: () => void;
  now?: () => number;
  requestFrame?: (cb: (time: number) => void) => number;
  cancelFrame?: (id: number) => void;
}

export interface Clock {
  start(): void;
  stop(): void;
}

/** Decouples simulation updates (fixed dt) from the render frame rate. */
export function createFixedTimestepLoop(opts: ClockOptions): Clock {
  const fixedDt = 1 / opts.simHz;
  const maxFrameSkip = opts.maxFrameSkip ?? 5;
  const now = opts.now ?? (() => performance.now());
  const requestFrame = opts.requestFrame ?? ((cb) => requestAnimationFrame(cb));
  const cancelFrame = opts.cancelFrame ?? ((id) => cancelAnimationFrame(id));

  let accumulator = 0;
  let lastTime = 0;
  let rafId = 0;
  let running = false;

  function frame(time: number): void {
    if (!running) return;
    rafId = requestFrame(frame);
    let delta = (time - lastTime) / 1000;
    lastTime = time;
    delta = Math.min(delta, maxFrameSkip * fixedDt);
    accumulator += delta;
    while (accumulator >= fixedDt) {
      opts.update(fixedDt);
      accumulator -= fixedDt;
    }
    opts.render();
  }

  return {
    start(): void {
      if (running) return;
      running = true;
      accumulator = 0;
      lastTime = now();
      rafId = requestFrame(frame);
    },
    stop(): void {
      running = false;
      cancelFrame(rafId);
    },
  };
}
