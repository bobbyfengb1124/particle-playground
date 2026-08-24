import type { Rng } from "../../core/Rng";
import type { Grid } from "../Grid";

export interface RuleContext {
  rng: Rng;
}

export type RuleFn = (grid: Grid, x: number, y: number, ctx: RuleContext) => void;
