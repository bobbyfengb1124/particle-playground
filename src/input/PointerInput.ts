import { PinchGestureTracker } from "./PinchGesture";

export interface CanvasPoint {
  x: number;
  y: number;
}

export type PointerHandler = (point: CanvasPoint, evt: PointerEvent) => void;
export type WheelHandler = (evt: WheelEvent) => void;
export type PinchStartHandler = () => void;
export type PinchChangeHandler = (steps: number) => void;
export type PinchEndHandler = (remainingPoint: CanvasPoint | null) => void;

/**
 * Converts DOM pointer events on a canvas into canvas backing-store coordinates.
 * Dividing by the CSS-rendered rect (rather than multiplying by devicePixelRatio
 * directly) keeps this correct regardless of OS display scaling or CSS sizing.
 *
 * Also owns multi-pointer tracking for pinch-to-resize: while fewer than two
 * pointers are down, events flow through as ordinary down/move/up (a single
 * finger or mouse drag). The moment a second concurrent pointer appears, it's
 * treated as the start of a pinch instead of a second paint stroke — normal
 * move/up delivery is suspended for the duration and pinch callbacks fire
 * instead, resuming once back below two pointers.
 */
export class PointerInput {
  private readonly downHandlers: PointerHandler[] = [];
  private readonly moveHandlers: PointerHandler[] = [];
  private readonly upHandlers: PointerHandler[] = [];
  private readonly wheelHandlers: WheelHandler[] = [];
  private readonly leaveHandlers: PinchStartHandler[] = [];
  private readonly pinchStartHandlers: PinchStartHandler[] = [];
  private readonly pinchChangeHandlers: PinchChangeHandler[] = [];
  private readonly pinchEndHandlers: PinchEndHandler[] = [];

  private readonly activePointers = new Map<number, CanvasPoint>();
  private readonly pinchTracker = new PinchGestureTracker();

  constructor(private readonly canvas: HTMLCanvasElement) {
    canvas.addEventListener("pointerdown", this.handleDown);
    canvas.addEventListener("pointermove", this.handleMove);
    canvas.addEventListener("pointerup", this.handleUp);
    canvas.addEventListener("pointercancel", this.handleUp);
    canvas.addEventListener("pointerleave", this.handleLeave);
    canvas.addEventListener("wheel", this.handleWheel, { passive: false });
  }

  onDown(fn: PointerHandler): void {
    this.downHandlers.push(fn);
  }

  onMove(fn: PointerHandler): void {
    this.moveHandlers.push(fn);
  }

  onUp(fn: PointerHandler): void {
    this.upHandlers.push(fn);
  }

  onWheel(fn: WheelHandler): void {
    this.wheelHandlers.push(fn);
  }

  onLeave(fn: PinchStartHandler): void {
    this.leaveHandlers.push(fn);
  }

  /** Fires once a second concurrent pointer joins — the paint/launch stroke driven by the first pointer should pause here. */
  onPinchStart(fn: PinchStartHandler): void {
    this.pinchStartHandlers.push(fn);
  }

  /** Fires with a whole number of ±1 brush-size steps each time the two pointers' spread crosses the pinch threshold. */
  onPinchChange(fn: PinchChangeHandler): void {
    this.pinchChangeHandlers.push(fn);
  }

  /** Fires once back below two pointers, with the still-down pointer's position (if any) so a paused stroke can resume from there. */
  onPinchEnd(fn: PinchEndHandler): void {
    this.pinchEndHandlers.push(fn);
  }

  toCanvasPoint(evt: PointerEvent): CanvasPoint {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (evt.clientX - rect.left) * scaleX,
      y: (evt.clientY - rect.top) * scaleY,
    };
  }

  private handleDown = (evt: PointerEvent): void => {
    const point = this.toCanvasPoint(evt);
    this.activePointers.set(evt.pointerId, point);
    if (this.activePointers.size === 2) {
      const [a, b] = [...this.activePointers.values()];
      this.pinchTracker.start(a, b);
      for (const fn of this.pinchStartHandlers) fn();
      return;
    }
    if (this.activePointers.size === 1) {
      for (const fn of this.downHandlers) fn(point, evt);
    }
  };

  private handleMove = (evt: PointerEvent): void => {
    const point = this.toCanvasPoint(evt);
    if (!this.activePointers.has(evt.pointerId)) {
      // Hover movement (no button down) — still reported, e.g. for a brush-outline preview.
      for (const fn of this.moveHandlers) fn(point, evt);
      return;
    }
    this.activePointers.set(evt.pointerId, point);
    if (this.activePointers.size >= 2) {
      const [a, b] = [...this.activePointers.values()];
      const steps = this.pinchTracker.update(a, b);
      if (steps !== 0) for (const fn of this.pinchChangeHandlers) fn(steps);
      return;
    }
    for (const fn of this.moveHandlers) fn(point, evt);
  };

  private handleUp = (evt: PointerEvent): void => {
    const point = this.toCanvasPoint(evt);
    const wasPinching = this.activePointers.size >= 2;
    this.activePointers.delete(evt.pointerId);
    if (wasPinching && this.activePointers.size < 2) {
      this.pinchTracker.reset();
      const remaining = this.activePointers.size === 1 ? [...this.activePointers.values()][0] : null;
      for (const fn of this.pinchEndHandlers) fn(remaining);
      return;
    }
    if (this.activePointers.size === 0) {
      for (const fn of this.upHandlers) fn(point, evt);
    }
  };

  private handleLeave = (): void => {
    for (const fn of this.leaveHandlers) fn();
  };

  private handleWheel = (evt: WheelEvent): void => {
    for (const fn of this.wheelHandlers) fn(evt);
  };
}
