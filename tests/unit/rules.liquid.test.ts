import { describe, expect, it } from "vitest";
import { createRng } from "../../src/core/Rng";
import { Grid } from "../../src/grid/Grid";
import { Material } from "../../src/grid/materials";
import { stepWater } from "../../src/grid/rules/water";

describe("stepWater (shared liquid rule)", () => {
  it("falls straight down into an empty cell below", () => {
    const grid = new Grid(5, 5);
    grid.setMaterial(2, 0, Material.WATER);
    stepWater(grid, 2, 0, { rng: createRng(1) });
    expect(grid.get(2, 0)).toBe(Material.EMPTY);
    expect(grid.get(2, 1)).toBe(Material.WATER);
  });

  it("falls diagonally when directly below is blocked but a diagonal is free", () => {
    const grid = new Grid(5, 5);
    grid.setMaterial(2, 0, Material.WATER);
    grid.setMaterial(2, 1, Material.STONE); // block straight down
    stepWater(grid, 2, 0, { rng: createRng(1) });
    expect(grid.get(2, 0)).toBe(Material.EMPTY);
    const landedLeft = grid.get(1, 1) === Material.WATER;
    const landedRight = grid.get(3, 1) === Material.WATER;
    expect(landedLeft || landedRight).toBe(true);
  });

  it("takes one step sideways into an empty cell when blocked below and both diagonals", () => {
    const grid = new Grid(7, 2);
    grid.setMaterial(3, 0, Material.WATER);
    grid.setMaterial(2, 1, Material.STONE);
    grid.setMaterial(3, 1, Material.STONE);
    grid.setMaterial(4, 1, Material.STONE);
    stepWater(grid, 3, 0, { rng: createRng(1) });
    expect(grid.get(3, 0)).toBe(Material.EMPTY);
    const landedLeft = grid.get(2, 0) === Material.WATER;
    const landedRight = grid.get(4, 0) === Material.WATER;
    expect(landedLeft || landedRight).toBe(true);
  });

  it("does not step sideways into a non-empty cell", () => {
    const grid = new Grid(5, 2);
    grid.setMaterial(2, 0, Material.WATER);
    grid.setMaterial(1, 1, Material.STONE);
    grid.setMaterial(2, 1, Material.STONE);
    grid.setMaterial(3, 1, Material.STONE);
    grid.setMaterial(3, 0, Material.STONE); // wall immediately to the right
    stepWater(grid, 2, 0, { rng: createRng(1) });
    expect(grid.get(2, 0)).toBe(Material.EMPTY);
    expect(grid.get(3, 0)).toBe(Material.STONE); // untouched
    expect(grid.get(1, 0)).toBe(Material.WATER); // only the open side is used
  });

  it("does nothing when it cannot fall, fall diagonally, or spread in either direction", () => {
    const grid = new Grid(3, 2);
    grid.setMaterial(1, 0, Material.WATER);
    grid.setMaterial(0, 0, Material.STONE);
    grid.setMaterial(2, 0, Material.STONE);
    grid.setMaterial(0, 1, Material.STONE);
    grid.setMaterial(1, 1, Material.STONE);
    grid.setMaterial(2, 1, Material.STONE);
    stepWater(grid, 1, 0, { rng: createRng(1) });
    expect(grid.get(1, 0)).toBe(Material.WATER);
  });

  it("does not fall past the floor, nor spread where there is nowhere to spread to", () => {
    const grid = new Grid(1, 1);
    grid.setMaterial(0, 0, Material.WATER);
    stepWater(grid, 0, 0, { rng: createRng(1) });
    expect(grid.get(0, 0)).toBe(Material.WATER);
  });
});
