import { describe, expect, it } from "vitest";
import { createRng } from "../../src/core/Rng";
import { Grid } from "../../src/grid/Grid";
import { GridStepper } from "../../src/grid/GridStepper";
import { Material } from "../../src/grid/materials";

// A byte-identical flag-off-vs-flag-on comparison isn't achievable: every
// rule that can't fall/rise straight draws from the shared per-tick RNG
// stream unconditionally, even on a settled cell, so active-skip (which stops
// visiting settled cells) diverges the RNG stream position from a full scan
// almost immediately. Instead this proves the optimization is
// behavior-preserving by comparing *structural* end-state between the two
// runs — conservation, settledness, and full clearing of combustion
// byproducts — which doesn't depend on exact per-cell RNG draws.
const WIDTH = 50;
const HEIGHT = 40;
const FLOOR_Y = HEIGHT - 1;
const TICKS = 600;
const SEED = 100;

// Five chambers, each walled off with stone floor-to-ceiling so one
// material's rule can never reach into a neighboring chamber — lets one grid
// exercise all eight materials (sand, stone, water, oil, wood, fire, smoke,
// steam) in a single run.
const WALL_XS = [0, 11, 18, 29, 40, 49];

function buildScenario(): Grid {
  const grid = new Grid(WIDTH, HEIGHT);

  for (let x = 0; x < WIDTH; x++) grid.setMaterial(x, FLOOR_Y, Material.STONE);
  for (const wx of WALL_XS) {
    for (let y = 0; y < HEIGHT; y++) grid.setMaterial(wx, y, Material.STONE);
  }

  // Zone A (x 1-10): a sand column that falls and settles into a pile.
  for (let y = 0; y <= 5; y++) grid.setMaterial(5, y, Material.SAND);

  // Zone B (x 12-17): a water column that pools flat across the chamber.
  for (let y = 0; y <= 4; y++) grid.setMaterial(14, y, Material.WATER);

  // Zone C (x 19-28): oil dropped into standing water rises to float on top.
  for (let y = 32; y <= 38; y++) {
    for (let x = 19; x <= 28; x++) grid.setMaterial(x, y, Material.WATER);
  }
  grid.setMaterial(23, 32, Material.OIL);

  // Zone D (x 30-39): fire ignites a wood block, which fully burns out, and its smoke fades.
  for (let y = 32; y <= 38; y++) {
    for (let x = 32; x <= 37; x++) grid.setMaterial(x, y, Material.WOOD);
  }
  grid.setMaterial(32, 38, Material.FIRE);

  // Zone E (x 41-48): water touching fire converts to steam, drifts up, and
  // (once the fire itself burns out on its own fixed lifetime) settles back as water.
  grid.setMaterial(44, FLOOR_Y - 1, Material.FIRE);
  grid.setMaterial(44, FLOOR_Y - 2, Material.WATER);

  return grid;
}

interface Metrics {
  sand: number;
  water: number;
  oil: number;
  wood: number;
  fire: number;
  smoke: number;
  steam: number;
  hasFloatingSand: boolean;
  hasFloatingLiquid: boolean;
}

function computeMetrics(grid: Grid): Metrics {
  const counts = new Array<number>(9).fill(0);
  let hasFloatingSand = false;
  let hasFloatingLiquid = false;

  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const id = grid.get(x, y);
      counts[id]++;
      if (y < grid.height - 1) {
        const below = grid.get(x, y + 1);
        if (id === Material.SAND && below === Material.EMPTY) hasFloatingSand = true;
        if ((id === Material.WATER || id === Material.OIL) && below === Material.EMPTY) hasFloatingLiquid = true;
      }
    }
  }

  return {
    sand: counts[Material.SAND],
    water: counts[Material.WATER],
    oil: counts[Material.OIL],
    wood: counts[Material.WOOD],
    fire: counts[Material.FIRE],
    smoke: counts[Material.SMOKE],
    steam: counts[Material.STEAM],
    hasFloatingSand,
    hasFloatingLiquid,
  };
}

function runScenario(enableActiveSkip: boolean): Metrics {
  const grid = buildScenario();
  const stepper = new GridStepper();
  stepper.enableActiveSkip = enableActiveSkip;
  const rng = createRng(SEED);
  for (let i = 0; i < TICKS; i++) stepper.step(grid, rng);
  return computeMetrics(grid);
}

describe("active-cell skip optimization — all eight materials", () => {
  it("reaches the same structural end-state whether the active-cell skip is on or off", () => {
    const flagOff = runScenario(false);
    const flagOn = runScenario(true);

    expect(flagOff).toEqual(flagOn);

    // Sanity-check the shared end-state actually looks right, not just "equally broken."
    expect(flagOn.sand).toBe(6);
    expect(flagOn.water).toBe(75); // 5 (pool) + 69 (chamber, one cell overwritten by oil) + 1 (steam zone)
    expect(flagOn.oil).toBe(1);
    expect(flagOn.wood).toBe(0);
    expect(flagOn.fire).toBe(0);
    expect(flagOn.smoke).toBe(0);
    expect(flagOn.steam).toBe(0);
    expect(flagOn.hasFloatingSand).toBe(false);
    expect(flagOn.hasFloatingLiquid).toBe(false);
  });
});
