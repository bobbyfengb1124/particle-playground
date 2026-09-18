import { describe, expect, it } from "vitest";
import { createRng } from "../../src/core/Rng";
import { Grid } from "../../src/grid/Grid";
import { GridStepper } from "../../src/grid/GridStepper";
import { Material } from "../../src/grid/materials";
import { serializeGrid } from "./helpers/serialize";

describe("ice", () => {
  it("freezes a water pool it falls onto, and melts back to water (then steam) when pinned against fire", () => {
    const grid = new Grid(9, 9);
    const rng = createRng(7);
    const stepper = new GridStepper();

    // Stone floor, outer walls, and a middle divider splitting the grid into
    // two independent stone-walled zones so neither scenario interferes with
    // the other.
    for (let x = 0; x < grid.width; x++) grid.setMaterial(x, grid.height - 1, Material.STONE);
    for (let y = 0; y < grid.height; y++) {
      grid.setMaterial(0, y, Material.STONE);
      grid.setMaterial(grid.width - 1, y, Material.STONE);
      grid.setMaterial(4, y, Material.STONE);
    }

    // Zone A (cols 1-3): a 3-wide water pool on the floor. A single ice cell
    // dropped from above col 2 falls, lands centered on top of the pool, and
    // its landing reactive scan reaches all 3 pool cells at once.
    grid.setMaterial(1, 7, Material.WATER);
    grid.setMaterial(2, 7, Material.WATER);
    grid.setMaterial(3, 7, Material.WATER);
    grid.setMaterial(2, 1, Material.ICE);

    // Zone B (col 6 only, cols 5/7 stoned off for its full height so nothing
    // can drift sideways): ice sitting on the floor, directly pinned under a
    // fire cell with no diagonal escape — melts to water, which fire's own
    // unmodified neighbor scan immediately picks up into steam.
    for (let y = 0; y < grid.height - 1; y++) {
      grid.setMaterial(5, y, Material.STONE);
      grid.setMaterial(7, y, Material.STONE);
    }
    grid.setMaterial(6, 7, Material.ICE);
    grid.setMaterial(6, 6, Material.FIRE);

    for (let i = 0; i < 40; i++) stepper.step(grid, rng);

    // Zone A: the whole pool froze, plus the ice cell that landed on it.
    expect(grid.get(1, 7)).toBe(Material.ICE);
    expect(grid.get(2, 7)).toBe(Material.ICE);
    expect(grid.get(3, 7)).toBe(Material.ICE);
    let zoneAWater = 0;
    for (let y = 0; y < grid.height; y++) {
      for (let x = 1; x <= 3; x++) {
        if (grid.get(x, y) === Material.WATER) zoneAWater++;
      }
    }
    expect(zoneAWater).toBe(0);

    // Zone B: the original ice is gone, fire is still burning (well under
    // its 180-tick lifetime), and the melted cell became steam (fire's
    // existing water→steam scan caught it, pinned with nowhere to drift).
    expect(grid.get(6, 6)).toBe(Material.FIRE);
    expect(grid.get(6, 7)).toBe(Material.STEAM);

    // Stone walls are exactly as placed throughout.
    for (let x = 0; x < grid.width; x++) expect(grid.get(x, grid.height - 1)).toBe(Material.STONE);
    for (let y = 0; y < grid.height; y++) {
      expect(grid.get(0, y)).toBe(Material.STONE);
      expect(grid.get(grid.width - 1, y)).toBe(Material.STONE);
      expect(grid.get(4, y)).toBe(Material.STONE);
    }
    for (let y = 0; y < grid.height - 1; y++) {
      expect(grid.get(5, y)).toBe(Material.STONE);
      expect(grid.get(7, y)).toBe(Material.STONE);
    }

    expect(serializeGrid(grid)).toMatchSnapshot();
  });
});
