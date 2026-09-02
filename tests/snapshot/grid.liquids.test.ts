import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/app/Simulation";
import { createRng } from "../../src/core/Rng";
import { Grid } from "../../src/grid/Grid";
import { GridStepper } from "../../src/grid/GridStepper";
import { Material } from "../../src/grid/materials";
import { runTicks } from "./helpers/headlessRunner";
import { serializeGrid } from "./helpers/serialize";

describe("liquids and stone", () => {
  it("water poured into a stone container settles into a flat pool", () => {
    const grid = new Grid(8, 8);
    const rng = createRng(11);
    const stepper = new GridStepper();

    for (let x = 0; x < grid.width; x++) grid.setMaterial(x, grid.height - 1, Material.STONE);
    for (let y = 0; y < grid.height; y++) {
      grid.setMaterial(0, y, Material.STONE);
      grid.setMaterial(grid.width - 1, y, Material.STONE);
    }
    for (let y = 0; y < 5; y++) grid.setMaterial(3, y, Material.WATER);

    for (let i = 0; i < 300; i++) stepper.step(grid, rng);

    // Settled: no water cell has empty space directly beneath it.
    for (let y = 0; y < grid.height - 1; y++) {
      for (let x = 1; x < grid.width - 1; x++) {
        if (grid.get(x, y) === Material.WATER) {
          expect(grid.get(x, y + 1)).not.toBe(Material.EMPTY);
        }
      }
    }

    // Spread, not piled: unlike sand's angle-of-repose pyramid, the water
    // ends up in one contiguous row rather than stacked in its drop column.
    let bottomRowWaterCount = 0;
    for (let x = 1; x < grid.width - 1; x++) {
      if (grid.get(x, grid.height - 2) === Material.WATER) bottomRowWaterCount++;
    }
    expect(bottomRowWaterCount).toBe(5);

    expect(serializeGrid(grid)).toMatchSnapshot();
  });

  it("oil poured into standing water rises to float on top of it", () => {
    const grid = new Grid(12, 12);
    const rng = createRng(5);
    const stepper = new GridStepper();

    for (let x = 0; x < grid.width; x++) grid.setMaterial(x, grid.height - 1, Material.STONE);
    for (let y = 0; y < grid.height; y++) {
      grid.setMaterial(0, y, Material.STONE);
      grid.setMaterial(grid.width - 1, y, Material.STONE);
    }
    for (let y = 4; y < grid.height - 1; y++) {
      for (let x = 1; x < grid.width - 1; x++) grid.setMaterial(x, y, Material.WATER);
    }
    grid.setMaterial(5, 4, Material.OIL); // dropped in among the water, not on top

    for (let i = 0; i < 300; i++) stepper.step(grid, rng);

    let highestOilY = grid.height;
    let lowestWaterY = -1;
    for (let y = 0; y < grid.height; y++) {
      for (let x = 1; x < grid.width - 1; x++) {
        if (grid.get(x, y) === Material.OIL) highestOilY = Math.min(highestOilY, y);
        if (grid.get(x, y) === Material.WATER) lowestWaterY = Math.max(lowestWaterY, y);
      }
    }
    expect(highestOilY).toBeLessThan(lowestWaterY);

    expect(serializeGrid(grid)).toMatchSnapshot();
  });

  it("Simulation steps water and oil alongside sand in the same tick", () => {
    const sim = new Simulation({ width: 64, height: 64, seed: 9, cellSize: 4 });
    const x = Math.floor(sim.grid.width / 2);
    sim.grid.setMaterial(x, 0, Material.WATER);
    for (let floorX = 0; floorX < sim.grid.width; floorX++) {
      sim.grid.setMaterial(floorX, sim.grid.height - 1, Material.STONE);
    }
    runTicks(sim, 120);
    expect(sim.grid.get(x, sim.grid.height - 1)).not.toBe(Material.EMPTY);
  });
});
