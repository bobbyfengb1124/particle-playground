export interface CanvasPoint {
  x: number;
  y: number;
}

/** Every this many px of spread change between two fingers steps the brush size by 1 cell. */
export const PINCH_STEP_PX = 30;

/**
 * Tracks a two-finger pinch's cumulative spread change against a baseline,
 * emitting whole ±1 steps as that threshold is crossed. The baseline shifts
 * by exactly the stepped amount (not reset to the latest distance) so
 * unconsumed sub-threshold movement isn't lost between calls — resizing
 * continuously as fingers move, rather than being computed once from the
 * gesture's start.
 */
export class PinchGestureTracker {
  private baselineDistance: number | null = null;

  start(a: CanvasPoint, b: CanvasPoint): void {
    this.baselineDistance = distance(a, b);
  }

  /** Returns the number of ±1 steps crossed since the last start()/update() call, or 0 if under threshold. */
  update(a: CanvasPoint, b: CanvasPoint): number {
    if (this.baselineDistance === null) return 0;
    const diff = distance(a, b) - this.baselineDistance;
    const steps = Math.trunc(diff / PINCH_STEP_PX);
    if (steps !== 0) this.baselineDistance += steps * PINCH_STEP_PX;
    return steps;
  }

  reset(): void {
    this.baselineDistance = null;
  }
}

function distance(a: CanvasPoint, b: CanvasPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
