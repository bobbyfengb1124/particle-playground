import { Material, MATERIALS, type MaterialIdValue } from "../materials";
import type { RuleFn } from "./types";

/**
 * Shared rule for every liquid: fall straight down, then diagonally down,
 * then — failing both — take one step sideways on the same row (each
 * tie-broken randomly per cell, same pattern as stepSand's diagonal fall, so
 * piles/pools don't lean toward one side). A denser liquid swaps into a
 * less dense one it lands on instead of stopping, which is how oil ends up
 * floating on water regardless of which was placed first; density is
 * undefined for solids, so a liquid never displaces or is displaced by
 * sand/stone. Moving at most one cell per tick — rather than jumping
 * straight to the furthest empty cell — is what makes this converge: once
 * both neighbors are occupied the cell simply stops, instead of an isolated
 * cell on an open floor perpetually re-rolling a long-range jump and never
 * settling.
 */
export function createLiquidRule(material: MaterialIdValue): RuleFn {
  const selfDensity = MATERIALS[material].density ?? 0;

  const canSinkInto = (otherId: number): boolean => {
    const otherDensity = MATERIALS[otherId].density;
    return otherDensity !== undefined && otherDensity < selfDensity;
  };

  return (grid, x, y, ctx) => {
    const belowY = y + 1;
    if (grid.inBounds(x, belowY)) {
      const belowId = grid.get(x, belowY);
      if (belowId === Material.EMPTY) {
        grid.moveMaterial(x, y, x, belowY);
        return;
      }
      if (canSinkInto(belowId)) {
        grid.swapMaterial(x, y, x, belowY);
        return;
      }
    }

    const firstDir = ctx.rng.next() < 0.5 ? -1 : 1;
    for (const dir of [firstDir, -firstDir]) {
      const dx = x + dir;
      if (!grid.inBounds(dx, belowY)) continue;
      const diagId = grid.get(dx, belowY);
      if (diagId === Material.EMPTY) {
        grid.moveMaterial(x, y, dx, belowY);
        return;
      }
      if (canSinkInto(diagId)) {
        grid.swapMaterial(x, y, dx, belowY);
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
