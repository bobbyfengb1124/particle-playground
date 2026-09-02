import { Material } from "../materials";
import { createGasRule } from "./gas";

const SMOKE_LIFETIME_TICKS = 240; // ~4s at 60Hz — long enough to visibly rise and spread before fading

export const stepSmoke = createGasRule(SMOKE_LIFETIME_TICKS, Material.EMPTY);
