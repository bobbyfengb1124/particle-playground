import { describe, expect, it } from "vitest";
import { createRng } from "../../src/core/Rng";
import { Grid } from "../../src/grid/Grid";
import { GridStepper } from "../../src/grid/GridStepper";
import { Material } from "../../src/grid/materials";

describe("stone", () => {
  it("has no registered rule, so the stepper never moves it", () => {
    const grid = new Grid(3, 3);
    const rng = createRng(1);
    const stepper = new GridStepper();
    grid.setMaterial(1, 0, Material.STONE);
    for (let i = 0; i < 20; i++) stepper.step(grid, rng);
    expect(grid.get(1, 0)).toBe(Material.STONE);
  });

  it("blocks sand from falling through it", () => {
    const grid = new Grid(3, 2);
    const rng = createRng(1);
    const stepper = new GridStepper();
    grid.setMaterial(1, 0, Material.SAND);
    grid.setMaterial(0, 1, Material.STONE);
    grid.setMaterial(1, 1, Material.STONE);
    grid.setMaterial(2, 1, Material.STONE);
    for (let i = 0; i < 20; i++) stepper.step(grid, rng);
    expect(grid.get(1, 0)).toBe(Material.SAND);
  });
});
