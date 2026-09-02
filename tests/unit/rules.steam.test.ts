import { describe, expect, it } from "vitest";
import { createRng } from "../../src/core/Rng";
import { Grid } from "../../src/grid/Grid";
import { Material } from "../../src/grid/materials";
import { stepSteam } from "../../src/grid/rules/steam";

const rng = createRng(1);
const ctx = { rng };

describe("stepSteam lifetime", () => {
  it("condenses back into water after going long enough without renewed fire contact", () => {
    const grid = new Grid(3, 3);
    // Boxed in so it ages in place instead of drifting off the tracked cell.
    grid.setMaterial(1, 1, Material.STEAM);
    grid.setMaterial(0, 0, Material.STONE);
    grid.setMaterial(1, 0, Material.STONE);
    grid.setMaterial(2, 0, Material.STONE);
    grid.setMaterial(0, 1, Material.STONE);
    grid.setMaterial(2, 1, Material.STONE);
    for (let i = 0; i < 119; i++) stepSteam(grid, 1, 1, ctx);
    expect(grid.get(1, 1)).toBe(Material.STEAM);
    stepSteam(grid, 1, 1, ctx);
    expect(grid.get(1, 1)).toBe(Material.WATER);
  });
});
