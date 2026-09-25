import type { Rng } from "../core/Rng";
import type { Grid } from "./Grid";
import type { RuleContext } from "./rules/types";
import { Material } from "./materials";
import { RULES } from "./rules";

/**
 * One CA tick: a "sparse-checked full scan" — bottom-up (so a cell that falls
 * into an already-visited row is never reconsidered this tick), alternating
 * left-right/right-left per tick to remove directional bias. `enableActiveSkip`
 * (on since Step 8) skips cells the active-tracking bookkeeping has marked
 * settled, instead of visiting every non-empty cell every tick.
 */
export class GridStepper {
  enableActiveSkip = true;
  private tickCount = 0;

  /** `wind`/`globalWind` only affect gas; with both omitted (or zero) a tick is identical to one before wind existed. */
  step(grid: Grid, rng: Rng, wind?: Float32Array, globalWind = 0): void {
    grid.beginTick();
    const ctx: RuleContext = { rng, wind, globalWind };
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
        if (rule) rule(grid, x, y, ctx);
      }
    }
    this.tickCount++;
  }
}
