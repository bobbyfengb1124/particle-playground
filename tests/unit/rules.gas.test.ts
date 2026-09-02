import { describe, expect, it } from "vitest";
import { createRng } from "../../src/core/Rng";
import { Grid } from "../../src/grid/Grid";
import { Material } from "../../src/grid/materials";
import { stepSmoke } from "../../src/grid/rules/smoke";

describe("stepSmoke (shared gas rule)", () => {
  it("rises straight up into an empty cell above", () => {
    const grid = new Grid(5, 5);
    grid.setMaterial(2, 2, Material.SMOKE);
    stepSmoke(grid, 2, 2, { rng: createRng(1) });
    expect(grid.get(2, 2)).toBe(Material.EMPTY);
    expect(grid.get(2, 1)).toBe(Material.SMOKE);
  });

  it("rises diagonally when directly above is blocked but a diagonal is free", () => {
    const grid = new Grid(5, 5);
    grid.setMaterial(2, 2, Material.SMOKE);
    grid.setMaterial(2, 1, Material.STONE); // block straight up
    stepSmoke(grid, 2, 2, { rng: createRng(1) });
    expect(grid.get(2, 2)).toBe(Material.EMPTY);
    const landedLeft = grid.get(1, 1) === Material.SMOKE;
    const landedRight = grid.get(3, 1) === Material.SMOKE;
    expect(landedLeft || landedRight).toBe(true);
  });

  it("takes one step sideways when blocked above and both diagonals", () => {
    const grid = new Grid(7, 3);
    grid.setMaterial(3, 1, Material.SMOKE);
    grid.setMaterial(2, 0, Material.STONE);
    grid.setMaterial(3, 0, Material.STONE);
    grid.setMaterial(4, 0, Material.STONE);
    stepSmoke(grid, 3, 1, { rng: createRng(1) });
    expect(grid.get(3, 1)).toBe(Material.EMPTY);
    const landedLeft = grid.get(2, 1) === Material.SMOKE;
    const landedRight = grid.get(4, 1) === Material.SMOKE;
    expect(landedLeft || landedRight).toBe(true);
  });

  it("stays put (but still ages) when fully boxed in", () => {
    const grid = new Grid(3, 3);
    grid.setMaterial(1, 1, Material.SMOKE);
    grid.setMaterial(0, 0, Material.STONE);
    grid.setMaterial(1, 0, Material.STONE);
    grid.setMaterial(2, 0, Material.STONE);
    grid.setMaterial(0, 1, Material.STONE);
    grid.setMaterial(2, 1, Material.STONE);
    stepSmoke(grid, 1, 1, { rng: createRng(1) });
    expect(grid.get(1, 1)).toBe(Material.SMOKE);
    expect(grid.timer[grid.index(1, 1)]).toBe(1);
  });
});
