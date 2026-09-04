import { describe, expect, it } from "vitest";
import { createRng } from "../../src/core/Rng";
import { Grid } from "../../src/grid/Grid";
import { GridStepper } from "../../src/grid/GridStepper";
import { Material } from "../../src/grid/materials";
import type { RuleFn } from "../../src/grid/rules/types";

describe("GridStepper rule injection", () => {
  it("defaults to the real material rules when none are supplied", () => {
    const grid = new Grid(3, 3);
    grid.setMaterial(1, 0, Material.SAND);
    new GridStepper().step(grid, createRng(1));
    expect(grid.get(1, 1)).toBe(Material.SAND); // real stepSand fell one row
  });

  it("uses an injected rule table instead of the real one", () => {
    const customRules: Array<RuleFn | undefined> = [];
    customRules[Material.SAND] = (g, x, y) => g.transformMaterial(x, y, Material.STONE);

    const grid = new Grid(3, 3);
    grid.setMaterial(1, 0, Material.SAND);
    new GridStepper(customRules).step(grid, createRng(1));

    expect(grid.get(1, 0)).toBe(Material.STONE); // custom rule ran, not stepSand
  });
});
