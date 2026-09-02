import { describe, expect, it } from "vitest";
import { createRng } from "../../src/core/Rng";
import { Grid } from "../../src/grid/Grid";
import { Material } from "../../src/grid/materials";
import { stepSmoke } from "../../src/grid/rules/smoke";

const rng = createRng(1);
const ctx = { rng };

describe("stepSmoke lifetime", () => {
  it("dissipates to empty after its fixed lifetime rather than accumulating forever", () => {
    const grid = new Grid(3, 3);
    // Boxed in so it ages in place instead of drifting off the tracked cell.
    grid.setMaterial(1, 1, Material.SMOKE);
    grid.setMaterial(0, 0, Material.STONE);
    grid.setMaterial(1, 0, Material.STONE);
    grid.setMaterial(2, 0, Material.STONE);
    grid.setMaterial(0, 1, Material.STONE);
    grid.setMaterial(2, 1, Material.STONE);
    for (let i = 0; i < 239; i++) stepSmoke(grid, 1, 1, ctx);
    expect(grid.get(1, 1)).toBe(Material.SMOKE);
    stepSmoke(grid, 1, 1, ctx);
    expect(grid.get(1, 1)).toBe(Material.EMPTY);
  });
});
