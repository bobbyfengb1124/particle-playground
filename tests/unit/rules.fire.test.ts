import { describe, expect, it } from "vitest";
import { createRng } from "../../src/core/Rng";
import { Grid } from "../../src/grid/Grid";
import { GridStepper } from "../../src/grid/GridStepper";
import { Material } from "../../src/grid/materials";
import { stepFire } from "../../src/grid/rules/fire";

const rng = createRng(1);
const ctx = { rng };

describe("stepFire", () => {
  it("ignites an adjacent flammable neighbor (wood)", () => {
    const grid = new Grid(3, 3);
    grid.setMaterial(1, 1, Material.FIRE);
    grid.setMaterial(0, 0, Material.WOOD); // diagonal neighbor
    stepFire(grid, 1, 1, ctx);
    expect(grid.get(0, 0)).toBe(Material.FIRE);
  });

  it("ignites an adjacent flammable neighbor (oil)", () => {
    const grid = new Grid(3, 3);
    grid.setMaterial(1, 1, Material.FIRE);
    grid.setMaterial(2, 1, Material.OIL);
    stepFire(grid, 1, 1, ctx);
    expect(grid.get(2, 1)).toBe(Material.FIRE);
  });

  it("does not ignite non-flammable neighbors", () => {
    const grid = new Grid(3, 3);
    grid.setMaterial(1, 1, Material.FIRE);
    grid.setMaterial(0, 1, Material.STONE);
    grid.setMaterial(2, 1, Material.SAND);
    stepFire(grid, 1, 1, ctx);
    expect(grid.get(0, 1)).toBe(Material.STONE);
    expect(grid.get(2, 1)).toBe(Material.SAND);
  });

  it("does not reach past its 8 immediate neighbors", () => {
    const grid = new Grid(5, 5);
    grid.setMaterial(2, 2, Material.FIRE);
    grid.setMaterial(0, 2, Material.WOOD); // two cells away
    stepFire(grid, 2, 2, ctx);
    expect(grid.get(0, 2)).toBe(Material.WOOD);
  });

  it("converts an adjacent water cell to steam", () => {
    const grid = new Grid(3, 3);
    grid.setMaterial(1, 1, Material.FIRE);
    grid.setMaterial(1, 0, Material.WATER);
    stepFire(grid, 1, 1, ctx);
    expect(grid.get(1, 0)).toBe(Material.STEAM);
    expect(grid.timer[grid.index(1, 0)]).toBe(0);
  });

  it("refreshes an adjacent steam cell's clock back to 0", () => {
    const grid = new Grid(3, 3);
    grid.setMaterial(1, 1, Material.FIRE);
    grid.setMaterial(1, 0, Material.STEAM);
    grid.timer[grid.index(1, 0)] = 50; // partway toward reverting to water
    stepFire(grid, 1, 1, ctx);
    expect(grid.get(1, 0)).toBe(Material.STEAM);
    expect(grid.timer[grid.index(1, 0)]).toBe(0);
  });

  it("spawns smoke directly above itself when that cell is empty", () => {
    const grid = new Grid(3, 3);
    grid.setMaterial(1, 1, Material.FIRE);
    stepFire(grid, 1, 1, ctx);
    expect(grid.get(1, 0)).toBe(Material.SMOKE);
  });

  it("does not spawn smoke above when that cell is already occupied", () => {
    const grid = new Grid(3, 3);
    grid.setMaterial(1, 1, Material.FIRE);
    grid.setMaterial(1, 0, Material.STONE);
    stepFire(grid, 1, 1, ctx);
    expect(grid.get(1, 0)).toBe(Material.STONE);
  });

  it("refreshing adjacent steam does not block it from taking its own turn the same tick (regression: it must still be able to drift away)", () => {
    // GridStepper scans bottom-up, so fire (below) is always scanned before
    // a cell directly above it in the same tick — steam.resetTimer must not
    // mark the cell processed, or it could never escape.
    const grid = new Grid(5, 5);
    const rng = createRng(1);
    const stepper = new GridStepper();
    grid.setMaterial(2, 2, Material.FIRE);
    grid.setMaterial(2, 1, Material.STEAM); // directly above the fire, open space above that
    stepper.step(grid, rng);
    expect(grid.get(2, 1)).toBe(Material.EMPTY);
    expect(grid.get(2, 0)).toBe(Material.STEAM);
  });

  it("burns out to empty after its fixed lifetime, regardless of remaining fuel", () => {
    const grid = new Grid(3, 3);
    grid.setMaterial(1, 1, Material.FIRE);
    grid.setMaterial(0, 0, Material.WOOD);
    grid.setMaterial(0, 1, Material.WOOD);
    for (let i = 0; i < 179; i++) stepFire(grid, 1, 1, ctx);
    expect(grid.get(1, 1)).toBe(Material.FIRE);
    stepFire(grid, 1, 1, ctx);
    expect(grid.get(1, 1)).toBe(Material.EMPTY);
  });
});
