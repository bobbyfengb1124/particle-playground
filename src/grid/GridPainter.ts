import type { Grid } from "./Grid";
import type { MaterialIdValue } from "./materials";

/**
 * Stamps a square brush of a given material onto the grid at a canvas pixel
 * position (or along a segment between two, for continuous drag strokes).
 * Split out of Simulation so painting has a single reason to change — the
 * brush geometry — independent of tick/render orchestration or where the
 * selected material/brush size setting itself lives.
 */
export class GridPainter {
  constructor(
    private readonly grid: Grid,
    private readonly cellSize: number,
  ) {}

  paintAt(x: number, y: number, material: MaterialIdValue, brushRadius: number): void {
    const gx = Math.floor(x / this.cellSize);
    const gy = Math.floor(y / this.cellSize);
    for (let dy = -brushRadius; dy <= brushRadius; dy++) {
      for (let dx = -brushRadius; dx <= brushRadius; dx++) {
        const cx = gx + dx;
        const cy = gy + dy;
        if (this.grid.inBounds(cx, cy)) this.grid.setMaterial(cx, cy, material);
      }
    }
  }

  /**
   * Paints along the segment between two canvas pixel positions, at sub-cell
   * steps — otherwise a fast drag would leave gaps between one pointermove
   * event's brush stamp and the next.
   */
  paintStroke(x0: number, y0: number, x1: number, y1: number, material: MaterialIdValue, brushRadius: number): void {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(dist / (this.cellSize / 2)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.paintAt(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, material, brushRadius);
    }
  }
}
