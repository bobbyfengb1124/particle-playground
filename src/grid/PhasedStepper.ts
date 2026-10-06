import { cellRng, TICK_STREAM_PASS } from "../core/cellRng";
import type { Grid } from "./Grid";
import { Material } from "./materials";
import { RULES } from "./rules";

export interface PhasedStepOptions {
  /** Per-cell zone wind, as for GridStepper; omitted means no zones. */
  wind?: Float32Array;
  globalWind?: number;
  /** 4 / cellSize — passed to rules as tickScale and cellRatio. The caller runs `scale` steps per sim tick. Default 1. */
  scale?: number;
}

export const PASS_COUNT = 9;

/**
 * This tick's order of the 9 passes: a Fisher-Yates shuffle of 0..8 driven by
 * (seed, tick), so it's deterministic yet never the same fixed order — a fixed
 * order would leave faint 3-row stripes in falling columns. The index is
 * picked with `u32 % (i + 1)` rather than a float multiply so WGSL gets the
 * identical order.
 */
export function passOrder(seed: number, tick: number): number[] {
  const order = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const rng = cellRng(seed, tick, TICK_STREAM_PASS, 0);
  for (let i = PASS_COUNT - 1; i > 0; i--) {
    const j = rng.nextU32() % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/**
 * The GPU's CA schedule, run on the CPU — the reference the WGSL kernels must
 * match byte for byte (GridStepper can't be: its shared RNG stream and
 * sequential scan make every cell depend on all earlier visits). Every rule
 * reads and writes only within one cell of the cell it runs for, so pass k
 * visits only cells with (x mod 3, y mod 3) = (k mod 3, floor(k / 3)): any
 * two of them are at least 3 apart, their 3×3 neighbourhoods never overlap,
 * and they can't affect each other — the visit order inside a pass doesn't
 * matter, which is what lets a GPU run a whole pass in parallel.
 *
 * Unlike GridStepper there's no active-cell skip (the GPU scans everything)
 * and no shared RNG stream: each visit gets its own cellRng(seed, tick, pass,
 * idx). Reuses the same Grid and RULES as GridStepper — only the schedule and
 * the randomness differ, so results differ from GridStepper's, but the
 * material behaviours are the same.
 */
export class PhasedStepper {
  private tickCount = 0;

  constructor(private readonly seed: number) {}

  /** Ticks stepped so far — the `tick` the next step() will use. */
  get tick(): number {
    return this.tickCount;
  }

  step(grid: Grid, opts: PhasedStepOptions = {}): void {
    grid.beginTick();
    const tick = this.tickCount++;
    const scale = opts.scale ?? 1;
    for (const pass of passOrder(this.seed, tick)) {
      const phaseX = pass % 3;
      const phaseY = Math.floor(pass / 3);
      for (let y = phaseY; y < grid.height; y += 3) {
        for (let x = phaseX; x < grid.width; x += 3) {
          const idx = grid.index(x, y);
          if (grid.isProcessed(idx)) continue;
          const id = grid.material[idx];
          if (id === Material.EMPTY) continue;
          const rule = RULES[id];
          if (!rule) continue;
          rule(grid, x, y, {
            rng: cellRng(this.seed, tick, pass, idx),
            wind: opts.wind,
            globalWind: opts.globalWind,
            tickScale: scale,
            cellRatio: scale,
          });
        }
      }
    }
  }
}
