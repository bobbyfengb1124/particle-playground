import { describe, expect, it } from "vitest";
import { Grid } from "../../src/grid/Grid";
import { Material } from "../../src/grid/materials";

describe("Grid.transformMaterial", () => {
  it("changes a cell's material and sets the given timer", () => {
    const grid = new Grid(3, 3);
    grid.setMaterial(1, 1, Material.WOOD);
    grid.transformMaterial(1, 1, Material.FIRE, 7);
    expect(grid.get(1, 1)).toBe(Material.FIRE);
    expect(grid.timer[grid.index(1, 1)]).toBe(7);
  });

  it("defaults the timer to 0 when not given", () => {
    const grid = new Grid(3, 3);
    grid.setMaterial(1, 1, Material.FIRE);
    grid.timer[grid.index(1, 1)] = 99;
    grid.transformMaterial(1, 1, Material.EMPTY);
    expect(grid.timer[grid.index(1, 1)]).toBe(0);
  });

  it("marks the cell processed for the current tick and its neighborhood active for the next", () => {
    const grid = new Grid(5, 5);
    grid.setMaterial(2, 2, Material.WOOD);
    grid.beginTick();
    grid.transformMaterial(2, 2, Material.FIRE, 0);
    expect(grid.isProcessed(grid.index(2, 2))).toBe(true);
    grid.beginTick();
    expect(grid.isActive(grid.index(2, 2))).toBe(true);
    expect(grid.isActive(grid.index(1, 1))).toBe(true);
  });
});

describe("Grid.resetTimer", () => {
  it("zeroes a cell's timer without changing its material", () => {
    const grid = new Grid(3, 3);
    grid.setMaterial(1, 1, Material.STEAM);
    grid.timer[grid.index(1, 1)] = 50;
    grid.resetTimer(1, 1);
    expect(grid.get(1, 1)).toBe(Material.STEAM);
    expect(grid.timer[grid.index(1, 1)]).toBe(0);
  });

  it("does not mark the cell processed, unlike transformMaterial", () => {
    const grid = new Grid(3, 3);
    grid.setMaterial(1, 1, Material.STEAM);
    grid.beginTick();
    grid.resetTimer(1, 1);
    expect(grid.isProcessed(grid.index(1, 1))).toBe(false);
  });
});

describe("Grid.incrementTimer", () => {
  it("increments and returns the new value", () => {
    const grid = new Grid(3, 3);
    grid.setMaterial(1, 1, Material.FIRE);
    expect(grid.incrementTimer(1, 1)).toBe(1);
    expect(grid.incrementTimer(1, 1)).toBe(2);
    expect(grid.timer[grid.index(1, 1)]).toBe(2);
  });

  it("keeps the cell active for the next tick even though it doesn't move", () => {
    const grid = new Grid(3, 3);
    grid.setMaterial(1, 1, Material.FIRE);
    grid.beginTick();
    grid.incrementTimer(1, 1);
    grid.beginTick();
    expect(grid.isActive(grid.index(1, 1))).toBe(true);
  });
});
