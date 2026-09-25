import type { Rng } from "../../core/Rng";
import type { Grid } from "../Grid";

export interface RuleContext {
  rng: Rng;
  /** Per-cell zone wind (px/s^2), indexed like grid.material; omitted means no zones. Only the gas rule reads it. */
  wind?: Float32Array;
  /** The global wind slider's value, which also pushes gas; omitted means 0. */
  globalWind?: number;
}

export type RuleFn = (grid: Grid, x: number, y: number, ctx: RuleContext) => void;
