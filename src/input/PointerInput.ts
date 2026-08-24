export interface CanvasPoint {
  x: number;
  y: number;
}

export type PointerHandler = (point: CanvasPoint, evt: PointerEvent) => void;

/**
 * Converts DOM pointer events on a canvas into canvas backing-store coordinates.
 * Dividing by the CSS-rendered rect (rather than multiplying by devicePixelRatio
 * directly) keeps this correct regardless of OS display scaling or CSS sizing.
 */
export class PointerInput {
  private readonly downHandlers: PointerHandler[] = [];
  private readonly moveHandlers: PointerHandler[] = [];
  private readonly upHandlers: PointerHandler[] = [];

  constructor(private readonly canvas: HTMLCanvasElement) {
    canvas.addEventListener("pointerdown", this.handleDown);
    canvas.addEventListener("pointermove", this.handleMove);
    canvas.addEventListener("pointerup", this.handleUp);
    canvas.addEventListener("pointercancel", this.handleUp);
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
    for (const fn of this.downHandlers) fn(point, evt);
  };

  private handleMove = (evt: PointerEvent): void => {
    const point = this.toCanvasPoint(evt);
    for (const fn of this.moveHandlers) fn(point, evt);
  };

  private handleUp = (evt: PointerEvent): void => {
    const point = this.toCanvasPoint(evt);
    for (const fn of this.upHandlers) fn(point, evt);
  };
}
