import { describe, expect, it } from "vitest";
import { Grid } from "../../src/grid/Grid";
import { GridPainter } from "../../src/grid/GridPainter";
import { Material } from "../../src/grid/materials";

describe("GridPainter", () => {
  it("paints the given material at the cell under a canvas pixel position", () => {
    const grid = new Grid(10, 10);
    const painter = new GridPainter(grid, 4);
    painter.paintAt(18, 18, Material.WATER, 0); // -> grid cell (4, 4)
    expect(grid.get(4, 4)).toBe(Material.WATER);
  });

  it("a zero-radius brush paints exactly one cell", () => {
    const grid = new Grid(10, 10);
    const painter = new GridPainter(grid, 4);
    painter.paintAt(18, 18, Material.SAND, 0);
    let count = 0;
    for (const id of grid.material) if (id === Material.SAND) count++;
    expect(count).toBe(1);
  });

  it("a brush of radius 1 paints a 3x3 block centered on the target cell", () => {
    const grid = new Grid(10, 10);
    const painter = new GridPainter(grid, 4);
    painter.paintAt(20, 20, Material.STONE, 1); // -> grid cell (5, 5)
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        expect(grid.get(5 + dx, 5 + dy)).toBe(Material.STONE);
      }
    }
    let count = 0;
    for (const id of grid.material) if (id === Material.STONE) count++;
    expect(count).toBe(9);
  });

  it("clips the brush at the grid edge instead of wrapping or throwing", () => {
    const grid = new Grid(10, 10);
    const painter = new GridPainter(grid, 4);
    expect(() => painter.paintAt(0, 0, Material.SAND, 2)).not.toThrow();
    expect(grid.get(0, 0)).toBe(Material.SAND);
  });

  it("painting EMPTY erases a previously painted cell", () => {
    const grid = new Grid(10, 10);
    const painter = new GridPainter(grid, 4);
    painter.paintAt(18, 18, Material.WOOD, 0);
    expect(grid.get(4, 4)).toBe(Material.WOOD);
    painter.paintAt(18, 18, Material.EMPTY, 0);
    expect(grid.get(4, 4)).toBe(Material.EMPTY);
  });

  it("paintStroke fills every cell along the segment between two points, not just the endpoints", () => {
    const grid = new Grid(50, 10);
    const painter = new GridPainter(grid, 4);
    painter.paintStroke(0, 18, 160, 18, Material.SAND, 0); // horizontal drag across row y=4 (grid coords)
    for (let x = 0; x <= 40; x++) {
      expect(grid.get(x, 4)).toBe(Material.SAND);
    }
  });
});
