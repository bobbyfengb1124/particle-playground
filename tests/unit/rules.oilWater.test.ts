import { describe, expect, it } from "vitest";
import { createRng } from "../../src/core/Rng";
import { Grid } from "../../src/grid/Grid";
import { Material } from "../../src/grid/materials";
import { stepOil } from "../../src/grid/rules/oil";
import { stepWater } from "../../src/grid/rules/water";

describe("oil/water density interaction", () => {
  it("water sinks through oil directly below it (swap, not overwrite)", () => {
    const grid = new Grid(3, 3);
    grid.setMaterial(1, 0, Material.WATER);
    grid.setMaterial(1, 1, Material.OIL);
    stepWater(grid, 1, 0, { rng: createRng(1) });
    expect(grid.get(1, 0)).toBe(Material.OIL);
    expect(grid.get(1, 1)).toBe(Material.WATER);
  });

  it("oil does not sink through water directly below it", () => {
    const grid = new Grid(3, 3);
    // Wall off sideways spread and both diagonals so only the vertical
    // (straight-down) density check is exercised.
    grid.setMaterial(0, 0, Material.STONE);
    grid.setMaterial(2, 0, Material.STONE);
    grid.setMaterial(0, 1, Material.STONE);
    grid.setMaterial(2, 1, Material.STONE);
    grid.setMaterial(1, 0, Material.OIL);
    grid.setMaterial(1, 1, Material.WATER);
    stepOil(grid, 1, 0, { rng: createRng(1) });
    expect(grid.get(1, 0)).toBe(Material.OIL);
    expect(grid.get(1, 1)).toBe(Material.WATER);
  });

  it("oil poured into a body of water rises to float on top after enough ticks", () => {
    const grid = new Grid(4, 8);
    const rng = createRng(3);
    for (let y = 2; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) grid.setMaterial(x, y, Material.WATER);
    }
    grid.setMaterial(1, 2, Material.OIL); // dropped in among the water, not on top

    for (let tick = 0; tick < 100; tick++) {
      for (let y = grid.height - 1; y >= 0; y--) {
        for (let x = 0; x < grid.width; x++) {
          const id = grid.get(x, y);
          if (id === Material.WATER) stepWater(grid, x, y, { rng });
          else if (id === Material.OIL) stepOil(grid, x, y, { rng });
        }
      }
    }

    let oilY = -1;
    for (let y = 0; y < grid.height; y++) {
      if (grid.get(1, y) === Material.OIL) oilY = y;
    }
    expect(oilY).toBeGreaterThanOrEqual(0);
    // Every water cell in that column must now be below the oil.
    for (let y = 0; y < grid.height; y++) {
      if (grid.get(1, y) === Material.WATER) expect(y).toBeGreaterThan(oilY);
    }
  });
});
