import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/app/Simulation";
import { Material } from "../../src/grid/materials";

// Brush geometry (shape, stroke interpolation, edge clipping) is
// GridPainter's own responsibility and is covered by gridPainter.test.ts.
// These tests only confirm Simulation wires its current
// selectedMaterial/brushSize settings into that delegate.
describe("Simulation painting (delegation to GridPainter)", () => {
  it("paintAt uses the currently selected material and brush size", () => {
    const sim = new Simulation({ width: 40, height: 40, cellSize: 4 });
    sim.setSelectedMaterial(Material.WATER);
    sim.setBrushSize(1);
    sim.paintAt(20, 20); // -> grid cell (5, 5); brush radius 1 also reaches its neighbors
    expect(sim.grid.get(5, 5)).toBe(Material.WATER);
    expect(sim.grid.get(4, 5)).toBe(Material.WATER);
  });

  it("switching to the eraser (EMPTY) changes what paintAt writes", () => {
    const sim = new Simulation({ width: 40, height: 40, cellSize: 4 });
    sim.setSelectedMaterial(Material.WOOD);
    sim.setBrushSize(0);
    sim.paintAt(18, 18);
    expect(sim.grid.get(4, 4)).toBe(Material.WOOD);

    sim.setSelectedMaterial(Material.EMPTY);
    sim.paintAt(18, 18);
    expect(sim.grid.get(4, 4)).toBe(Material.EMPTY);
  });

  it("paintStroke also uses the currently selected material", () => {
    const sim = new Simulation({ width: 200, height: 40, cellSize: 4 });
    sim.setSelectedMaterial(Material.SAND);
    sim.setBrushSize(0);
    sim.paintStroke(0, 18, 160, 18);
    expect(sim.grid.get(20, 4)).toBe(Material.SAND); // a midpoint cell, not just an endpoint
  });
});
