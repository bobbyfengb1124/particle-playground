import { Material } from "../materials";
import type { RuleFn } from "./types";
import { createLiquidRule } from "./liquid";

const NEIGHBOR_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];

const flowLikeLiquid = createLiquidRule(Material.ACID);

/**
 * Each tick, acid first scans all 8 neighbors (order doesn't matter — only
 * the first dissolvable one found acts, since dissolving consumes the acid
 * cell itself) for anything that isn't empty, stone, or acid. If found, both
 * cells become empty — a mutual 1-for-1 consumption — and the tick ends
 * there. Acid has no `density` (materials.ts), so it never sinks through
 * water/oil the way denser liquids do; the only way past them is to
 * dissolve them, which this eager scan already does before movement is ever
 * attempted. Only when nothing adjacent is dissolvable does it fall back to
 * ordinary liquid movement, reusing `createLiquidRule` unmodified.
 */
export const stepAcid: RuleFn = (grid, x, y, ctx) => {
  for (const [dx, dy] of NEIGHBOR_OFFSETS) {
    const nx = x + dx;
    const ny = y + dy;
    if (!grid.inBounds(nx, ny)) continue;
    const neighborId = grid.get(nx, ny);
    if (neighborId === Material.EMPTY || neighborId === Material.STONE || neighborId === Material.ACID) continue;
    grid.transformMaterial(nx, ny, Material.EMPTY);
    grid.transformMaterial(x, y, Material.EMPTY);
    return;
  }
  flowLikeLiquid(grid, x, y, ctx);
};
