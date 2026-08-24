import { describe, expect, it } from "vitest";
import { Grid } from "../../src/grid/Grid";
import { Material } from "../../src/grid/materials";

// Step 8's active-cell skip is inert until then, but the bookkeeping it
// depends on is built now — locking in the bootstrap/decay semantics early
// means Step 8 doesn't have to touch every Step 3-5 rule function.
describe("Grid active-cell tracking (Step 8 hook, inert until then)", () => {
  it("marks a painted cell and its 3x3 neighborhood active for the following tick", () => {
    const grid = new Grid(5, 5);
    grid.setMaterial(2, 2, Material.SAND);
    grid.beginTick();
    expect(grid.isActive(grid.index(2, 2))).toBe(true);
    expect(grid.isActive(grid.index(1, 1))).toBe(true);
    expect(grid.isActive(grid.index(3, 3))).toBe(true);
    expect(grid.isActive(grid.index(4, 4))).toBe(false);
  });

  it("a cell that stops changing falls out of the active set after one more tick", () => {
    const grid = new Grid(5, 5);
    grid.setMaterial(2, 2, Material.SAND);
    grid.beginTick();
    expect(grid.isActive(grid.index(2, 2))).toBe(true);
    grid.beginTick(); // nothing touched it in between
    expect(grid.isActive(grid.index(2, 2))).toBe(false);
  });

  it("moveMaterial marks both the source and destination neighborhoods active", () => {
    const grid = new Grid(5, 5);
    grid.setMaterial(2, 0, Material.SAND);
    grid.beginTick();
    grid.moveMaterial(2, 0, 2, 1);
    grid.beginTick();
    expect(grid.isActive(grid.index(2, 0))).toBe(true);
    expect(grid.isActive(grid.index(2, 1))).toBe(true);
  });
});
