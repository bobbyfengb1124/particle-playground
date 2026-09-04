import type { Rng } from "../core/Rng";
import type { Grid } from "./Grid";
import { Material } from "./materials";
import { RULES } from "./rules";
import type { RuleFn } from "./rules/types";

/**
 * One CA tick: a "sparse-checked full scan" — bottom-up (so a cell that falls
 * into an already-visited row is never reconsidered this tick), alternating
 * left-right/right-left per tick to remove directional bias. `enableActiveSkip`
 * stays off until Step 8; until then this is a full scan every tick.
 *
 * The rule table is a constructor dependency (defaulting to the real
 * `RULES`) rather than a hardcoded import inside `step` — this is the only
 * "policy selects behavior from a lookup" point in the CA, so it's the one
 * place worth being able to swap in a different table (e.g. a reduced set
 * for a focused test) without editing GridStepper itself.
 */
export class GridStepper {
  enableActiveSkip = false;
  private tickCount = 0;

  constructor(private readonly rules: ReadonlyArray<RuleFn | undefined> = RULES) {}

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
        const rule = this.rules[id];
        if (rule) rule(grid, x, y, { rng });
      }
    }
    this.tickCount++;
  }
}
