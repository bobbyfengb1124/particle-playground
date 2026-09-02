import { describe, expect, it } from "vitest";
import { Grid } from "../../src/grid/Grid";
import { Material } from "../../src/grid/materials";

describe("Grid.swapMaterial", () => {
  it("exchanges material and timer between two cells", () => {
    const grid = new Grid(3, 3);
    grid.setMaterial(0, 0, Material.WATER);
    grid.setMaterial(0, 1, Material.OIL);
    grid.swapMaterial(0, 0, 0, 1);
    expect(grid.get(0, 0)).toBe(Material.OIL);
    expect(grid.get(0, 1)).toBe(Material.WATER);
  });

  it("marks both cells' neighborhoods active and both cells processed for the current tick", () => {
    const grid = new Grid(5, 5);
    grid.setMaterial(2, 2, Material.WATER);
    grid.setMaterial(2, 3, Material.OIL);
    grid.beginTick();
    grid.swapMaterial(2, 2, 2, 3);
    expect(grid.isProcessed(grid.index(2, 2))).toBe(true);
    expect(grid.isProcessed(grid.index(2, 3))).toBe(true);
    grid.beginTick();
    expect(grid.isActive(grid.index(2, 2))).toBe(true);
    expect(grid.isActive(grid.index(2, 3))).toBe(true);
  });
});
