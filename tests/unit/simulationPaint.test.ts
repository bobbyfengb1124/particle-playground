import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/app/Simulation";
import { Material } from "../../src/grid/materials";

describe("Simulation painting", () => {
  it("paints the selected material at the cell under a canvas pixel position", () => {
    const sim = new Simulation({ width: 40, height: 40, cellSize: 4 });
    sim.setSelectedMaterial(Material.WATER);
    sim.setBrushSize(0);
    sim.paintAt(18, 18); // -> grid cell (4, 4)
    expect(sim.grid.get(4, 4)).toBe(Material.WATER);
  });

  it("a zero-radius brush paints exactly one cell", () => {
    const sim = new Simulation({ width: 40, height: 40, cellSize: 4 });
    sim.setSelectedMaterial(Material.SAND);
    sim.setBrushSize(0);
    sim.paintAt(18, 18);
    let count = 0;
    for (const id of sim.grid.material) if (id === Material.SAND) count++;
    expect(count).toBe(1);
  });

  it("a brush of radius 1 paints a 3x3 block centered on the target cell", () => {
    const sim = new Simulation({ width: 40, height: 40, cellSize: 4 });
    sim.setSelectedMaterial(Material.STONE);
    sim.setBrushSize(1);
    sim.paintAt(20, 20); // -> grid cell (5, 5)
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        expect(sim.grid.get(5 + dx, 5 + dy)).toBe(Material.STONE);
      }
    }
    let count = 0;
    for (const id of sim.grid.material) if (id === Material.STONE) count++;
    expect(count).toBe(9);
  });

  it("clips the brush at the grid edge instead of wrapping or throwing", () => {
    const sim = new Simulation({ width: 40, height: 40, cellSize: 4 });
    sim.setSelectedMaterial(Material.SAND);
    sim.setBrushSize(2);
    expect(() => sim.paintAt(0, 0)).not.toThrow();
    expect(sim.grid.get(0, 0)).toBe(Material.SAND);
  });

  it("selecting the eraser (EMPTY) clears previously painted cells", () => {
    const sim = new Simulation({ width: 40, height: 40, cellSize: 4 });
    sim.setSelectedMaterial(Material.WOOD);
    sim.setBrushSize(0);
    sim.paintAt(18, 18);
    expect(sim.grid.get(4, 4)).toBe(Material.WOOD);

    sim.setSelectedMaterial(Material.EMPTY);
    sim.paintAt(18, 18);
    expect(sim.grid.get(4, 4)).toBe(Material.EMPTY);
  });

  it("paintStroke fills every cell along the segment between two points, not just the endpoints", () => {
    const sim = new Simulation({ width: 200, height: 40, cellSize: 4 });
    sim.setSelectedMaterial(Material.SAND);
    sim.setBrushSize(0);
    sim.paintStroke(0, 18, 160, 18); // horizontal drag across row y=4 (grid coords)
    for (let x = 0; x <= 40; x++) {
      expect(sim.grid.get(x, 4)).toBe(Material.SAND);
    }
  });
});
