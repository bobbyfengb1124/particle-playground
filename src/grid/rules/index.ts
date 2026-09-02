import { Material } from "../materials";
import { stepFire } from "./fire";
import { stepOil } from "./oil";
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
// Material.STONE and Material.WOOD have no entry — GridStepper skips cells
// with no rule, which is exactly "immovable". Wood's flammability is just
// metadata (MaterialInfo.flammable) that fire's own rule checks on its
// neighbors; wood never acts on its own.
