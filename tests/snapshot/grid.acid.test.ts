import { describe, expect, it } from "vitest";
import { createRng } from "../../src/core/Rng";
import { Grid } from "../../src/grid/Grid";
import { GridStepper } from "../../src/grid/GridStepper";
import { Material } from "../../src/grid/materials";
import { serializeGrid } from "./helpers/serialize";

describe("acid", () => {
  it("dissolves through a stack of wood one cell at a time until it runs out, leaving any surplus wood behind, without ever touching the stone walls", () => {
    const grid = new Grid(4, 10);
    const rng = createRng(7);
    const stepper = new GridStepper();

    // A 2-wide column walled in stone on both sides and the floor, so a
    // falling/spreading acid cell always eventually contacts the wood
    // directly below/beside it — nowhere else for it to go.
    for (let x = 0; x < grid.width; x++) grid.setMaterial(x, grid.height - 1, Material.STONE);
    for (let y = 0; y < grid.height; y++) {
      grid.setMaterial(0, y, Material.STONE);
      grid.setMaterial(grid.width - 1, y, Material.STONE);
    }

    // 8 wood cells (2 wide x 4 tall) resting on the floor.
    for (let y = 5; y <= 8; y++) {
      grid.setMaterial(1, y, Material.WOOD);
      grid.setMaterial(2, y, Material.WOOD);
    }
    // 6 acid cells (2 wide x 3 tall) directly above the wood.
    for (let y = 2; y <= 4; y++) {
      grid.setMaterial(1, y, Material.ACID);
      grid.setMaterial(2, y, Material.ACID);
    }

    // Each dissolve consumes one acid cell and one wood cell together, so
    // with fewer acid cells (6) than wood cells (8), acid is the limiting
    // reagent: every acid cell should eventually find and dissolve a wood
    // cell, leaving exactly 8-6=2 wood cells behind. Generously past however
    // many ticks the fall-then-dissolve chain could take in a column this
    // small.
    for (let i = 0; i < 200; i++) stepper.step(grid, rng);

    let acidCount = 0;
    let woodCount = 0;
    for (let idx = 0; idx < grid.material.length; idx++) {
      const id = grid.material[idx];
      if (id === Material.ACID) acidCount++;
      if (id === Material.WOOD) woodCount++;
    }
    expect(acidCount).toBe(0);
    expect(woodCount).toBe(2);

    // Stone is acid-proof: every border cell is exactly as placed.
    for (let x = 0; x < grid.width; x++) expect(grid.get(x, grid.height - 1)).toBe(Material.STONE);
    for (let y = 0; y < grid.height; y++) {
      expect(grid.get(0, y)).toBe(Material.STONE);
      expect(grid.get(grid.width - 1, y)).toBe(Material.STONE);
    }

    expect(serializeGrid(grid)).toMatchSnapshot();
  });
});
