import { Material } from "../materials";
import { stepAcid } from "./acid";
import { stepFire } from "./fire";
import { stepOil } from "./oil";
import { stepSeed } from "./plant";
import { stepSand } from "./sand";
import { stepSmoke } from "./smoke";
import { stepSteam } from "./steam";
import type { RuleFn } from "./types";
import { stepWater } from "./water";

export const RULES: Array<RuleFn | undefined> = [];
RULES[Material.SAND] = stepSand;
RULES[Material.WATER] = stepWater;
RULES[Material.OIL] = stepOil;
RULES[Material.FIRE] = stepFire;
RULES[Material.SMOKE] = stepSmoke;
RULES[Material.STEAM] = stepSteam;
RULES[Material.ACID] = stepAcid;
RULES[Material.SEED] = stepSeed;
// Material.STONE, Material.WOOD, and Material.PLANT have no entry —
// GridStepper skips cells with no rule, which is exactly "immovable". Wood's
// and plant's flammability is just metadata (MaterialInfo.flammable) that
// fire's own rule checks on its neighbors; neither ever acts on its own.
