import { Material } from "../materials";
import { stepOil } from "./oil";
import { stepSand } from "./sand";
import type { RuleFn } from "./types";
import { stepWater } from "./water";

export const RULES: Array<RuleFn | undefined> = [];
RULES[Material.SAND] = stepSand;
RULES[Material.WATER] = stepWater;
RULES[Material.OIL] = stepOil;
// Material.STONE has no entry — GridStepper skips cells with no rule, which
// is exactly "immovable": stone never moves and (having no density) is never
// swapped through by a liquid either.
