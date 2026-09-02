import { describe, expect, it } from "vitest";
import { createRng } from "../../src/core/Rng";
import { Grid } from "../../src/grid/Grid";
import { GridStepper } from "../../src/grid/GridStepper";
import { Material, MATERIALS } from "../../src/grid/materials";

describe("wood", () => {
  it("has no registered rule, so the stepper never moves it", () => {
    const grid = new Grid(3, 3);
    const rng = createRng(1);
    const stepper = new GridStepper();
    grid.setMaterial(1, 0, Material.WOOD);
    for (let i = 0; i < 20; i++) stepper.step(grid, rng);
    expect(grid.get(1, 0)).toBe(Material.WOOD);
  });

  it("blocks sand from falling through it", () => {
    const grid = new Grid(3, 2);
    const rng = createRng(1);
    const stepper = new GridStepper();
    grid.setMaterial(1, 0, Material.SAND);
    grid.setMaterial(0, 1, Material.WOOD);
    grid.setMaterial(1, 1, Material.WOOD);
    grid.setMaterial(2, 1, Material.WOOD);
    for (let i = 0; i < 20; i++) stepper.step(grid, rng);
    expect(grid.get(1, 0)).toBe(Material.SAND);
  });

  it("is flagged flammable, unlike stone", () => {
    expect(MATERIALS[Material.WOOD].flammable).toBe(true);
    expect(MATERIALS[Material.STONE].flammable).toBeUndefined();
  });
});
