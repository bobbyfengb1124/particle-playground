import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/app/Simulation";
import { createRng } from "../../src/core/Rng";
import { Grid } from "../../src/grid/Grid";
import { GridStepper } from "../../src/grid/GridStepper";
import { Material } from "../../src/grid/materials";
import { runTicks } from "./helpers/headlessRunner";
import { serializeGrid } from "./helpers/serialize";

describe("falling sand", () => {
  it("a vertical column settles into a roughly triangular pile with a natural angle of repose", () => {
    const grid = new Grid(16, 16);
    const rng = createRng(42);
    const stepper = new GridStepper();
    const column = 8;
    for (let y = 0; y < 6; y++) grid.setMaterial(column, y, Material.SAND);

    for (let i = 0; i < 200; i++) stepper.step(grid, rng);

    // Settled: no sand cell has empty space directly beneath it.
    for (let y = 0; y < grid.height - 1; y++) {
      for (let x = 0; x < grid.width; x++) {
        if (grid.get(x, y) === Material.SAND) {
          expect(grid.get(x, y + 1)).not.toBe(Material.EMPTY);
        }
      }
    }

    expect(serializeGrid(grid)).toMatchSnapshot();
  });

  it("a single grain falls straight to the floor without clipping through or duplicating", () => {
    const grid = new Grid(4, 4);
    const rng = createRng(7);
    const stepper = new GridStepper();
    grid.setMaterial(1, 0, Material.SAND);

    for (let i = 0; i < 50; i++) stepper.step(grid, rng);

    expect(grid.get(1, grid.height - 1)).toBe(Material.SAND);
    let sandCount = 0;
    for (let i = 0; i < grid.material.length; i++) {
      if (grid.material[i] === Material.SAND) sandCount++;
    }
    expect(sandCount).toBe(1);
  });

  it("Simulation wires the grid into its own fixed-timestep tick", () => {
    const sim = new Simulation({ width: 64, height: 64, seed: 9, cellSize: 4 });
    const midX = Math.floor(sim.grid.width / 2);
    sim.grid.setMaterial(midX, 0, Material.SAND);
    runTicks(sim, 60);
    expect(sim.grid.get(midX, sim.grid.height - 1)).toBe(Material.SAND);
  });
});
