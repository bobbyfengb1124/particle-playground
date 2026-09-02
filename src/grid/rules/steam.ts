import { Material } from "../materials";
import { createGasRule } from "./gas";

const STEAM_REVERT_TICKS = 120; // ~2s at 60Hz without renewed fire contact before condensing back to water

export const stepSteam = createGasRule(STEAM_REVERT_TICKS, Material.WATER);
