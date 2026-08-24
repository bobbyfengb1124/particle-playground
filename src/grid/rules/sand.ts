import { Material } from "../materials";
import type { RuleFn } from "./types";

/**
 * Falls straight down if the cell below is empty; otherwise tries a diagonal
 * (down-left/down-right, tie-broken randomly per cell so piles don't lean).
 */
export const stepSand: RuleFn = (grid, x, y, ctx) => {
  const belowY = y + 1;
  if (grid.inBounds(x, belowY) && grid.get(x, belowY) === Material.EMPTY) {
    grid.moveMaterial(x, y, x, belowY);
    return;
  }

  const firstDir = ctx.rng.next() < 0.5 ? -1 : 1;
  const firstX = x + firstDir;
  if (grid.inBounds(firstX, belowY) && grid.get(firstX, belowY) === Material.EMPTY) {
    grid.moveMaterial(x, y, firstX, belowY);
    return;
  }

  const secondX = x - firstDir;
  if (grid.inBounds(secondX, belowY) && grid.get(secondX, belowY) === Material.EMPTY) {
    grid.moveMaterial(x, y, secondX, belowY);
  }
};
