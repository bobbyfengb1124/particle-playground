import type { Rng } from "../core/Rng";
import type { Grid } from "./Grid";
import { Material } from "./materials";
import { RULES } from "./rules";

/**
 * One CA tick: a "sparse-checked full scan" — bottom-up (so a cell that falls
 * into an already-visited row is never reconsidered this tick), alternating
 * left-right/right-left per tick to remove directional bias. `enableActiveSkip`
 * stays off until Step 8; until then this is a full scan every tick.
 */
export class GridStepper {
  enableActiveSkip = false;
  private tickCount = 0;

  step(grid: Grid, rng: Rng): void {
    grid.beginTick();
    const leftToRight = this.tickCount % 2 === 0;
    for (let y = grid.height - 1; y >= 0; y--) {
      for (let i = 0; i < grid.width; i++) {
        const x = leftToRight ? i : grid.width - 1 - i;
        const idx = grid.index(x, y);
        if (grid.isProcessed(idx)) continue;
        const id = grid.material[idx];
        if (id === Material.EMPTY) continue;
        if (this.enableActiveSkip && !grid.isActive(idx)) continue;
        const rule = RULES[id];
        if (rule) rule(grid, x, y, { rng });
      }
    }
    this.tickCount++;
  }
}
