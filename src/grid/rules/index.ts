import { Material } from "../materials";
import { stepSand } from "./sand";
import type { RuleFn } from "./types";

export const RULES: Array<RuleFn | undefined> = [];
RULES[Material.SAND] = stepSand;
