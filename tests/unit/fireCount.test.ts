import { describe, expect, it } from "vitest";
import { DEFAULT_GRAVITY } from "../../src/app/Simulation";
import { CpuBackend } from "../../src/backend/cpu/CpuBackend";
import { Grid } from "../../src/grid/Grid";
import { Material } from "../../src/grid/materials";

describe("Grid.countMaterial", () => {
  it("counts the cells holding one material", () => {
    const grid = new Grid(10, 10);
    for (let i = 0; i < 7; i++) grid.setMaterial(i, 3, Material.FIRE);
    for (let i = 0; i < 5; i++) grid.setMaterial(i, 8, Material.STONE);
    expect(grid.countMaterial(Material.FIRE)).toBe(7);
    expect(grid.countMaterial(Material.STONE)).toBe(5);
    expect(grid.countMaterial(Material.WATER)).toBe(0);
  });
});

describe("CpuBackend.fireCellCount (Step 18 Q3)", () => {
  it("counts fire on tick 0 and every 15th tick after, as GpuGrid does", () => {
    const backend = new CpuBackend({ width: 200, height: 200, cellSize: 4, seed: 1, particleCapacity: 100, gravity: DEFAULT_GRAVITY });
    for (let x = 10; x < 30; x++) backend.grid.setMaterial(x, 40, Material.FIRE);

    backend.tick(1 / 60, 0); // tick 0: counted, after the grid step
    const counted = backend.grid.countMaterial(Material.FIRE);
    expect(counted).toBeGreaterThan(0);
    expect(backend.fireCellCount).toBe(counted);

    backend.grid.clear();
    for (let t = 1; t < 15; t++) backend.tick(1 / 60, 0);
    expect(backend.fireCellCount, "ticks 1–14 don't recount").toBe(counted);
    backend.tick(1 / 60, 0); // tick 15: counted
    expect(backend.fireCellCount).toBe(0);
  });
});
