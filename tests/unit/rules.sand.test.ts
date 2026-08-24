import { describe, expect, it } from "vitest";
import { createRng } from "../../src/core/Rng";
import { Grid } from "../../src/grid/Grid";
import { Material } from "../../src/grid/materials";
import { stepSand } from "../../src/grid/rules/sand";

describe("stepSand", () => {
  it("falls straight down into an empty cell below", () => {
    const grid = new Grid(5, 5);
    grid.setMaterial(2, 0, Material.SAND);
    stepSand(grid, 2, 0, { rng: createRng(1) });
    expect(grid.get(2, 0)).toBe(Material.EMPTY);
    expect(grid.get(2, 1)).toBe(Material.SAND);
  });

  it("falls diagonally when directly below is blocked but a diagonal is free", () => {
    const grid = new Grid(5, 5);
    grid.setMaterial(2, 0, Material.SAND);
    grid.setMaterial(2, 1, Material.SAND); // block straight down
    stepSand(grid, 2, 0, { rng: createRng(1) });
    expect(grid.get(2, 0)).toBe(Material.EMPTY);
    const landedLeft = grid.get(1, 1) === Material.SAND;
    const landedRight = grid.get(3, 1) === Material.SAND;
    expect(landedLeft || landedRight).toBe(true);
  });

  it("does nothing when straight down and both diagonals are occupied", () => {
    const grid = new Grid(5, 5);
    grid.setMaterial(2, 0, Material.SAND);
    grid.setMaterial(1, 1, Material.SAND);
    grid.setMaterial(2, 1, Material.SAND);
    grid.setMaterial(3, 1, Material.SAND);
    stepSand(grid, 2, 0, { rng: createRng(1) });
    expect(grid.get(2, 0)).toBe(Material.SAND);
  });

  it("does not fall past the floor", () => {
    const grid = new Grid(3, 1);
    grid.setMaterial(1, 0, Material.SAND);
    stepSand(grid, 1, 0, { rng: createRng(1) });
    expect(grid.get(1, 0)).toBe(Material.SAND);
  });

  it("does not fall sideways off the grid edge", () => {
    const grid = new Grid(1, 2);
    grid.setMaterial(0, 0, Material.SAND);
    grid.setMaterial(0, 1, Material.SAND); // block straight down; no columns exist either side
    stepSand(grid, 0, 0, { rng: createRng(1) });
    expect(grid.get(0, 0)).toBe(Material.SAND);
  });
});
