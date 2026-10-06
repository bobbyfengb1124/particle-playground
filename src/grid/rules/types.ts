import type { Rng } from "../../core/Rng";
import type { Grid } from "../Grid";

export interface RuleContext {
  rng: Rng;
  /** Per-cell zone wind (px/s^2), indexed like grid.material; omitted means no zones. Only the gas rule reads it. */
  wind?: Float32Array;
  /** The global wind slider's value, which also pushes gas; omitted means 0. */
  globalWind?: number;
  /**
   * CA ticks per 60 Hz sim tick (4 / cellSize): finer cells move one cell per
   * tick, so they tick more often to keep on-screen speeds, and tick-counted
   * lifetimes (fire, smoke, steam) stretch by the same factor to keep real-time
   * durations. Omitted means 1 — the original 4 px grid.
   */
  tickScale?: number;
  /** Reference cell size over actual cell size (4 / cellSize); scales cell-counted sizes like the plant height cap. Omitted means 1. */
  cellRatio?: number;
}

export type RuleFn = (grid: Grid, x: number, y: number, ctx: RuleContext) => void;
