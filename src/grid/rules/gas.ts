import { Material, type MaterialIdValue } from "../materials";
import type { RuleFn } from "./types";

/**
 * Shared rule for every gas (smoke, steam): each tick, age one tick closer
 * to a fixed lifetime and — once it elapses — convert to `onExpire` (EMPTY
 * for smoke dissipating away; WATER for steam condensing back down).
 * Movement mirrors the liquid rule with gravity flipped (up, then
 * diagonally up, then sideways), but skips liquid's density-swap step:
 * smoke and steam are never adjacent to each other in a way that matters,
 * so there's no need for one to pass through the other.
 */
export function createGasRule(lifetimeTicks: number, onExpire: MaterialIdValue): RuleFn {
  return (grid, x, y, ctx) => {
    const age = grid.incrementTimer(x, y);
    if (age >= lifetimeTicks) {
      grid.transformMaterial(x, y, onExpire);
      return;
    }

    const aboveY = y - 1;
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
