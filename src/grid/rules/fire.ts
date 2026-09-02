import { Material, MATERIALS } from "../materials";
import type { RuleFn } from "./types";

const FIRE_LIFETIME_TICKS = 180; // ~3s at 60Hz — burns out on its own regardless of remaining fuel

const NEIGHBOR_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];

/**
 * Each tick a fire cell: ages one tick closer to its own fixed lifetime
 * (independent of fuel, so it always eventually burns out even surrounded
 * by wood) and, once that elapses, burns out to empty. While still
 * burning, it reacts to every one of its 8 neighbors unconditionally
 * (order doesn't matter — every match acts, not just the first): ignites
 * any flammable one (wood, oil) into fire, converts adjacent water into
 * steam, and refreshes the "still near fire" clock on adjacent steam so it
 * doesn't condense back into water while still in the flames. It also
 * spawns smoke directly above itself whenever that cell is empty — the
 * empty-cell requirement naturally rate-limits it to one rising smoke cell
 * per column at a time, rather than needing a separate spawn probability.
 */
export const stepFire: RuleFn = (grid, x, y, _ctx) => {
  const age = grid.incrementTimer(x, y);
  if (age >= FIRE_LIFETIME_TICKS) {
    grid.transformMaterial(x, y, Material.EMPTY);
    return;
  }

  for (const [dx, dy] of NEIGHBOR_OFFSETS) {
    const nx = x + dx;
    const ny = y + dy;
    if (!grid.inBounds(nx, ny)) continue;
    const neighborId = grid.get(nx, ny);
    if (neighborId === Material.WATER) {
      grid.transformMaterial(nx, ny, Material.STEAM, 0);
    } else if (neighborId === Material.STEAM) {
      grid.resetTimer(nx, ny);
    } else if (MATERIALS[neighborId].flammable) {
      grid.transformMaterial(nx, ny, Material.FIRE, 0);
    }
  }

  const aboveY = y - 1;
  if (grid.inBounds(x, aboveY) && grid.get(x, aboveY) === Material.EMPTY) {
    grid.transformMaterial(x, aboveY, Material.SMOKE, 0);
  }
};
