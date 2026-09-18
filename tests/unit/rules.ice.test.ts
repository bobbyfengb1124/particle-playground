import { describe, expect, it } from "vitest";
import { createRng } from "../../src/core/Rng";
import { Grid } from "../../src/grid/Grid";
import { Material, MATERIALS } from "../../src/grid/materials";
import { stepIce } from "../../src/grid/rules/ice";

const rng = createRng(1);
const ctx = { rng };

describe("stepIce", () => {
  it("falls straight down into an empty cell below", () => {
    const grid = new Grid(3, 3);
    grid.setMaterial(1, 1, Material.ICE);
    stepIce(grid, 1, 1, ctx);
    expect(grid.get(1, 1)).toBe(Material.EMPTY);
    expect(grid.get(1, 2)).toBe(Material.ICE);
  });

  it("falls diagonally when blocked straight down but a diagonal is free", () => {
    const grid = new Grid(5, 5);
    grid.setMaterial(2, 0, Material.ICE);
    grid.setMaterial(2, 1, Material.STONE); // block straight down
    stepIce(grid, 2, 0, ctx);
    expect(grid.get(2, 0)).toBe(Material.EMPTY);
    const landedLeft = grid.get(1, 1) === Material.ICE;
    const landedRight = grid.get(3, 1) === Material.ICE;
    expect(landedLeft || landedRight).toBe(true);
  });

  it("rests on top of stone without falling or reacting when nothing else is adjacent", () => {
    const grid = new Grid(3, 3);
    grid.setMaterial(1, 1, Material.ICE);
    grid.setMaterial(0, 2, Material.STONE);
    grid.setMaterial(1, 2, Material.STONE);
    grid.setMaterial(2, 2, Material.STONE);
    stepIce(grid, 1, 1, ctx);
    expect(grid.get(1, 1)).toBe(Material.ICE);
  });

  it("does not sink through a water cell below it — instead freezes it in place once landed", () => {
    const grid = new Grid(3, 3);
    grid.setMaterial(1, 1, Material.ICE);
    grid.setMaterial(1, 2, Material.WATER);
    grid.setMaterial(0, 2, Material.STONE); // block the diagonals so it can't slide around the water
    grid.setMaterial(2, 2, Material.STONE);
    stepIce(grid, 1, 1, ctx);
    expect(grid.get(1, 1)).toBe(Material.ICE); // stayed put, never swapped
    expect(grid.get(1, 2)).toBe(Material.ICE); // the water below froze
  });

  it("rests on top of an oil cell without sinking or freezing it — oil never freezes", () => {
    const grid = new Grid(3, 3);
    grid.setMaterial(1, 1, Material.ICE);
    grid.setMaterial(1, 2, Material.OIL);
    grid.setMaterial(0, 2, Material.STONE);
    grid.setMaterial(2, 2, Material.STONE);
    stepIce(grid, 1, 1, ctx);
    expect(grid.get(1, 1)).toBe(Material.ICE);
    expect(grid.get(1, 2)).toBe(Material.OIL); // unchanged
  });

  it("freezes every adjacent water cell in one tick, not just the first found", () => {
    const grid = new Grid(3, 3);
    grid.setMaterial(1, 1, Material.ICE);
    grid.setMaterial(0, 2, Material.STONE); // land in place
    grid.setMaterial(1, 2, Material.STONE);
    grid.setMaterial(2, 2, Material.STONE);
    grid.setMaterial(0, 1, Material.WATER);
    grid.setMaterial(2, 1, Material.WATER);
    grid.setMaterial(1, 0, Material.WATER);
    stepIce(grid, 1, 1, ctx);
    expect(grid.get(0, 1)).toBe(Material.ICE);
    expect(grid.get(2, 1)).toBe(Material.ICE);
    expect(grid.get(1, 0)).toBe(Material.ICE);
  });

  it("melts to water when adjacent to fire, taking priority over freezing any adjacent water that same tick", () => {
    const grid = new Grid(3, 3);
    grid.setMaterial(1, 1, Material.ICE);
    grid.setMaterial(0, 2, Material.STONE); // land in place
    grid.setMaterial(1, 2, Material.STONE);
    grid.setMaterial(2, 2, Material.STONE);
    grid.setMaterial(0, 1, Material.FIRE);
    grid.setMaterial(2, 1, Material.WATER);
    stepIce(grid, 1, 1, ctx);
    expect(grid.get(1, 1)).toBe(Material.WATER); // melted
    expect(grid.get(2, 1)).toBe(Material.WATER); // untouched — never got the chance to freeze
  });

  it("ICE is not flammable and has no density", () => {
    expect(MATERIALS[Material.ICE].flammable).toBeUndefined();
    expect(MATERIALS[Material.ICE].density).toBeUndefined();
  });
});
