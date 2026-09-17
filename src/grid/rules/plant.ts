import { Material } from "../materials";
import type { RuleFn } from "./types";

const NEIGHBOR_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];

const WATERED_TICKS_PER_STAGE = 90;
const MAX_STAGE = 6;

function isLiquid(id: number): boolean {
  return id === Material.WATER || id === Material.OIL;
}

/**
 * A seed falls like sand, but sinks through water/oil via swapMaterial
 * instead of stopping on them (so it settles on genuinely solid ground
 * rather than floating on a pond). Once blocked in all three downward
 * directions by non-liquid material, it's "landed" and switches to growth:
 * every tick with an adjacent water cell advances a watered-ticks counter
 * (grid.incrementTimer) until it reaches WATERED_TICKS_PER_STAGE, then
 * consumes that water and grows one stage — straight up if free, else a
 * tie-broken diagonal — leaving PLANT behind and a new SEED (or PLANT, once
 * MAX_STAGE is reached) at the grown cell. No adjacent water at all is a
 * no-op (paused, not decremented — markActiveAround already wakes the cell
 * again once water is later placed nearby).
 *
 * Growth can zigzag diagonally, so height can't be read by scanning
 * straight down from the tip. The two counters are packed into the single
 * per-cell timer field instead: low byte = ticks toward the next stage,
 * high byte = stages already climbed. A plain incrementTimer() is safe for
 * the ticks half since it never reaches 256 before triggering growth.
 */
export const stepSeed: RuleFn = (grid, x, y, ctx) => {
  const belowY = y + 1;
  if (grid.inBounds(x, belowY)) {
    const belowId = grid.get(x, belowY);
    if (belowId === Material.EMPTY) {
      grid.moveMaterial(x, y, x, belowY);
      return;
    }
    if (isLiquid(belowId)) {
      grid.swapMaterial(x, y, x, belowY);
      return;
    }
  }

  const firstFallDir = ctx.rng.next() < 0.5 ? -1 : 1;
  for (const dir of [firstFallDir, -firstFallDir]) {
    const dx = x + dir;
    if (!grid.inBounds(dx, belowY)) continue;
    const diagId = grid.get(dx, belowY);
    if (diagId === Material.EMPTY) {
      grid.moveMaterial(x, y, dx, belowY);
      return;
    }
    if (isLiquid(diagId)) {
      grid.swapMaterial(x, y, dx, belowY);
      return;
    }
  }

  // Landed: blocked straight down and both diagonals by non-liquid material.
  let waterX = -1;
  let waterY = -1;
  for (const [dx, dy] of NEIGHBOR_OFFSETS) {
    const nx = x + dx;
    const ny = y + dy;
    if (grid.inBounds(nx, ny) && grid.get(nx, ny) === Material.WATER) {
      waterX = nx;
      waterY = ny;
      break;
    }
  }
  if (waterX === -1) return;

  const idx = grid.index(x, y);
  const ticks = grid.timer[idx] & 0xff;
  const stage = grid.timer[idx] >> 8;
  if (ticks < WATERED_TICKS_PER_STAGE) {
    grid.incrementTimer(x, y);
    return;
  }

  const aboveY = y - 1;
  const firstGrowDir = ctx.rng.next() < 0.5 ? -1 : 1;
  const targets: ReadonlyArray<readonly [number, number]> = [
    [x, aboveY],
    [x + firstGrowDir, aboveY],
    [x - firstGrowDir, aboveY],
  ];
  for (const [tx, ty] of targets) {
    if (!grid.inBounds(tx, ty) || grid.get(tx, ty) !== Material.EMPTY) continue;
    grid.transformMaterial(waterX, waterY, Material.EMPTY);
    grid.transformMaterial(x, y, Material.PLANT);
    const nextStage = stage + 1;
    if (nextStage >= MAX_STAGE) {
      grid.transformMaterial(tx, ty, Material.PLANT);
    } else {
      grid.transformMaterial(tx, ty, Material.SEED, nextStage << 8);
    }
    return;
  }
  // All three grow targets occupied — wait, re-checked next tick.
};
