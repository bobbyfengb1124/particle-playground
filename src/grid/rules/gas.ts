import { Material, type MaterialIdValue } from "../materials";
import { clampWind, ZONE_WIND_MAX } from "../../wind/WindField";
import type { RuleFn } from "./types";

// At full-strength wind a gas cell is pushed on this fraction of ticks, so
// even a maxed-out zone leaves some ordinary rising in the mix.
const MAX_WIND_PUSH_CHANCE = 0.8;

/**
 * Shared rule for every gas (smoke, steam): each tick, age one tick closer
 * to a fixed lifetime and — once it elapses — convert to `onExpire` (EMPTY
 * for smoke dissipating away; WATER for steam condensing back down).
 * Movement mirrors the liquid rule with gravity flipped (up, then
 * diagonally up, then sideways), but skips liquid's density-swap step:
 * smoke and steam are never adjacent to each other in a way that matters,
 * so there's no need for one to pass through the other.
 *
 * Wind (zone field + global slider, clamped) gets first say: with a chance
 * proportional to its strength, the gas drifts one cell downwind — up-diagonal
 * first, then sideways — before the normal movement is tried. No RNG is drawn
 * when the wind is 0, so windless ticks stay byte-identical to the pre-wind rule.
 */
export function createGasRule(lifetimeTicks: number, onExpire: MaterialIdValue): RuleFn {
  return (grid, x, y, ctx) => {
    const age = grid.incrementTimer(x, y);
    if (age >= lifetimeTicks) {
      grid.transformMaterial(x, y, onExpire);
      return;
    }

    const aboveY = y - 1;
    const w = clampWind((ctx.wind ? ctx.wind[grid.index(x, y)] : 0) + (ctx.globalWind ?? 0));
    if (w !== 0 && ctx.rng.next() < (Math.abs(w) / ZONE_WIND_MAX) * MAX_WIND_PUSH_CHANCE) {
      const dx = x + Math.sign(w);
      if (grid.inBounds(dx, aboveY) && grid.get(dx, aboveY) === Material.EMPTY) {
        grid.moveMaterial(x, y, dx, aboveY);
        return;
      }
      if (grid.inBounds(dx, y) && grid.get(dx, y) === Material.EMPTY) {
        grid.moveMaterial(x, y, dx, y);
        return;
      }
    }

    if (grid.inBounds(x, aboveY) && grid.get(x, aboveY) === Material.EMPTY) {
      grid.moveMaterial(x, y, x, aboveY);
      return;
    }

    const firstDir = ctx.rng.next() < 0.5 ? -1 : 1;
    for (const dir of [firstDir, -firstDir]) {
      const dx = x + dir;
      if (grid.inBounds(dx, aboveY) && grid.get(dx, aboveY) === Material.EMPTY) {
        grid.moveMaterial(x, y, dx, aboveY);
        return;
      }
    }

    const firstX = x + firstDir;
    if (grid.inBounds(firstX, y) && grid.get(firstX, y) === Material.EMPTY) {
      grid.moveMaterial(x, y, firstX, y);
      return;
    }

    const secondX = x - firstDir;
    if (grid.inBounds(secondX, y) && grid.get(secondX, y) === Material.EMPTY) {
      grid.moveMaterial(x, y, secondX, y);
    }
  };
}
