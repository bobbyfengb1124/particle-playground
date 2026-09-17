import { describe, expect, it } from "vitest";
import { createRng } from "../../src/core/Rng";
import { Grid } from "../../src/grid/Grid";
import { GridStepper } from "../../src/grid/GridStepper";
import { Material } from "../../src/grid/materials";
import { serializeGrid } from "./helpers/serialize";

describe("plant", () => {
  it("lands on a stone floor, waters for one full growth stage, and stops once its only water is consumed", () => {
    const grid = new Grid(4, 8);
    const rng = createRng(7);
    const stepper = new GridStepper();

    // Stone floor with a single water cell embedded at the seed's landing
    // column: the seed sinks through it (same behavior the unit tests cover
    // in isolation) and comes to rest directly on the stone below, leaving
    // water adjacent to it. (0,6)/(3,6) box the water in so it can only ever
    // shuffle between (1,6) and (2,6) as it gets nudged by its own liquid
    // rule — both stay within the seed's 8-neighbor range, so it never loses
    // contact with the water it's watering from, and never reaches the
    // growth path (rows 0-5, which stays genuinely empty throughout).
    grid.setMaterial(0, 7, Material.STONE);
    grid.setMaterial(1, 7, Material.STONE);
    grid.setMaterial(2, 7, Material.WATER);
    grid.setMaterial(3, 7, Material.STONE);
    grid.setMaterial(0, 6, Material.STONE);
    grid.setMaterial(3, 6, Material.STONE);

    grid.setMaterial(2, 1, Material.SEED); // dropped several rows above the floor

    for (let i = 0; i < 150; i++) stepper.step(grid, rng);

    let plantCount = 0;
    let seedCount = 0;
    let waterCount = 0;
    for (let idx = 0; idx < grid.material.length; idx++) {
      const id = grid.material[idx];
      if (id === Material.PLANT) plantCount++;
      if (id === Material.SEED) seedCount++;
      if (id === Material.WATER) waterCount++;
    }
    expect(plantCount).toBe(1);
    expect(seedCount).toBe(1);
    expect(waterCount).toBe(0);

    // Stone border is exactly as placed — never dissolved, moved, or grown into.
    expect(grid.get(0, 7)).toBe(Material.STONE);
    expect(grid.get(1, 7)).toBe(Material.STONE);
    expect(grid.get(3, 7)).toBe(Material.STONE);
    expect(grid.get(0, 6)).toBe(Material.STONE);
    expect(grid.get(3, 6)).toBe(Material.STONE);

    expect(serializeGrid(grid)).toMatchSnapshot();
  });
});
