import { describe, expect, it } from "vitest";
import { createRng } from "../../src/core/Rng";
import { Grid } from "../../src/grid/Grid";
import { Material } from "../../src/grid/materials";
import { stepAcid } from "../../src/grid/rules/acid";

const rng = createRng(1);
const ctx = { rng };

describe("stepAcid", () => {
  it("dissolves each non-immune material it touches, consuming itself in the process", () => {
    const dissolvable = [
      Material.SAND,
      Material.WATER,
      Material.OIL,
      Material.WOOD,
      Material.FIRE,
      Material.SMOKE,
      Material.STEAM,
    ];
    for (const material of dissolvable) {
      const grid = new Grid(3, 3);
      grid.setMaterial(1, 1, Material.ACID);
      grid.setMaterial(2, 1, material);
      stepAcid(grid, 1, 1, ctx);
      expect(grid.get(2, 1)).toBe(Material.EMPTY);
      expect(grid.get(1, 1)).toBe(Material.EMPTY);
    }
  });

  it("does not dissolve stone", () => {
    const grid = new Grid(3, 3);
    grid.setMaterial(1, 1, Material.ACID);
    grid.setMaterial(2, 1, Material.STONE);
    stepAcid(grid, 1, 1, ctx);
    expect(grid.get(2, 1)).toBe(Material.STONE);
  });

  it("does not dissolve or consume an adjacent acid cell", () => {
    const grid = new Grid(3, 3);
    // Box both acid cells in stone so there's nothing else to dissolve and no
    // empty space to fall into — isolates the self-immunity check.
    for (let y = 0; y < 3; y++) {
      grid.setMaterial(0, y, Material.STONE);
      grid.setMaterial(2, y, Material.STONE);
    }
    grid.setMaterial(1, 2, Material.STONE);
    grid.setMaterial(1, 0, Material.ACID);
    grid.setMaterial(1, 1, Material.ACID);
    stepAcid(grid, 1, 1, ctx);
    stepAcid(grid, 1, 0, ctx);
    expect(grid.get(1, 1)).toBe(Material.ACID);
    expect(grid.get(1, 0)).toBe(Material.ACID);
  });

  it("falls like a liquid into empty space when nothing adjacent is dissolvable", () => {
    const grid = new Grid(3, 3);
    grid.setMaterial(1, 1, Material.ACID);
    stepAcid(grid, 1, 1, ctx);
    expect(grid.get(1, 1)).toBe(Material.EMPTY);
    expect(grid.get(1, 2)).toBe(Material.ACID);
  });

  it("dissolves in place instead of falling when both are possible in the same tick", () => {
    const grid = new Grid(3, 3);
    grid.setMaterial(1, 1, Material.ACID);
    grid.setMaterial(2, 1, Material.SAND); // dissolvable neighbor
    // (1, 2) below is empty — acid could fall there instead, but dissolving
    // must take priority.
    stepAcid(grid, 1, 1, ctx);
    expect(grid.get(1, 1)).toBe(Material.EMPTY);
    expect(grid.get(2, 1)).toBe(Material.EMPTY);
    expect(grid.get(1, 2)).toBe(Material.EMPTY); // never fell here
  });

  it("reaches a diagonal neighbor, not just the 4 cardinal directions", () => {
    const grid = new Grid(3, 3);
    grid.setMaterial(1, 1, Material.ACID);
    grid.setMaterial(0, 0, Material.SAND); // diagonal neighbor
    stepAcid(grid, 1, 1, ctx);
    expect(grid.get(0, 0)).toBe(Material.EMPTY);
    expect(grid.get(1, 1)).toBe(Material.EMPTY);
  });
});
