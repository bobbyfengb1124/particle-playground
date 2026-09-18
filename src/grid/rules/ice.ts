import { Material } from "../materials";
import type { RuleFn } from "./types";

const NEIGHBOR_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];

/**
 * Falls exactly like sand — straight down, else a tie-broken diagonal, into
 * empty cells only, so ice never sinks through water/oil the way a seed
 * does. Once blocked in all three directions ("landed" this tick), it
 * reacts to its 8 neighbors: any adjacent fire melts it back to water
 * immediately (fire wins outright — no freezing happens that tick), else
 * every adjacent water cell (not just the first) freezes into ice. A
 * directly-below water cell is one of these 8 neighbors too, so ice resting
 * on a pond freezes it downward a layer at a time. Oil never freezes, and
 * fire.ts is never touched — a melted cell is ordinary water that fire's
 * own existing water→steam scan picks up on its own.
 */
export const stepIce: RuleFn = (grid, x, y, ctx) => {
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
    return;
  }

  // Landed: blocked straight down and both diagonals.
  for (const [dx, dy] of NEIGHBOR_OFFSETS) {
    const nx = x + dx;
    const ny = y + dy;
    if (grid.inBounds(nx, ny) && grid.get(nx, ny) === Material.FIRE) {
      grid.transformMaterial(x, y, Material.WATER);
      return;
    }
  }

  for (const [dx, dy] of NEIGHBOR_OFFSETS) {
    const nx = x + dx;
    const ny = y + dy;
    if (grid.inBounds(nx, ny) && grid.get(nx, ny) === Material.WATER) {
      grid.transformMaterial(nx, ny, Material.ICE);
    }
  }
};
