import { describe, expect, it } from "vitest";
import { createRng } from "../../src/core/Rng";
import { Grid } from "../../src/grid/Grid";
import { GridStepper } from "../../src/grid/GridStepper";
import { Material } from "../../src/grid/materials";
import { serializeGrid } from "./helpers/serialize";

describe("fire, smoke, and steam", () => {
  it("fire spreads across connected wood, each cell burns out to empty, and the smoke it produces fades rather than accumulating", () => {
    const grid = new Grid(20, 20);
    const rng = createRng(13);
    const stepper = new GridStepper();

    for (let x = 0; x < grid.width; x++) grid.setMaterial(x, grid.height - 1, Material.STONE);

    const left = 5;
    const right = 10;
    const top = 12;
    const bottom = 18;
    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) grid.setMaterial(x, y, Material.WOOD);
    }
    grid.setMaterial(left, bottom, Material.FIRE); // ignite one corner of the block

    // Ignition is deterministic and unconditional on every touching flammable
    // neighbor each tick, so it reaches the whole connected block within its
    // Chebyshev diameter (well under 15 ticks here) — long before any cell
    // could have burned out.
    for (let i = 0; i < 15; i++) stepper.step(grid, rng);
    let remainingWood = 0;
    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        if (grid.get(x, y) === Material.WOOD) remainingWood++;
      }
    }
    expect(remainingWood).toBe(0);

    // Run out every cell's fixed burn lifetime, plus the lifetime of the
    // smoke it spawned along the way.
    for (let i = 0; i < 500; i++) stepper.step(grid, rng);

    let fireOrWoodCount = 0;
    let smokeCount = 0;
    for (let idx = 0; idx < grid.material.length; idx++) {
      const id = grid.material[idx];
      if (id === Material.FIRE || id === Material.WOOD) fireOrWoodCount++;
      if (id === Material.SMOKE) smokeCount++;
    }
    expect(fireOrWoodCount).toBe(0);
    expect(smokeCount).toBe(0);

    expect(serializeGrid(grid)).toMatchSnapshot();
  });

  it("water next to fire converts to steam, drifts upward away from the flame, and eventually condenses back into water", () => {
    const grid = new Grid(10, 40);
    const rng = createRng(21);
    const stepper = new GridStepper();

    for (let x = 0; x < grid.width; x++) grid.setMaterial(x, grid.height - 1, Material.STONE);
    for (let y = 0; y < grid.height; y++) {
      grid.setMaterial(0, y, Material.STONE);
      grid.setMaterial(grid.width - 1, y, Material.STONE);
    }

    const fireX = 5;
    const fireY = grid.height - 2;
    grid.setMaterial(fireX, fireY, Material.FIRE);
    grid.setMaterial(fireX, fireY - 1, Material.WATER); // touching the fire directly above it

    stepper.step(grid, rng);
    expect(grid.get(fireX, fireY - 1)).toBe(Material.STEAM);

    // STEAM_REVERT_TICKS is 120; the open column above lets it drift out of
    // the fire's 8-neighbor radius within a tick or two, so well before 150
    // total ticks it should have condensed back into water far from the fire
    // (and before it could plausibly have fallen all the way back down).
    for (let i = 0; i < 149; i++) stepper.step(grid, rng);

    let waterCount = 0;
    let steamCount = 0;
    let waterY = -1;
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const id = grid.get(x, y);
        if (id === Material.WATER) {
          waterCount++;
          waterY = y;
        }
        if (id === Material.STEAM) steamCount++;
      }
    }
    expect(steamCount).toBe(0);
    expect(waterCount).toBe(1);
    expect(waterY).toBeLessThan(fireY - 10); // condensed well away from the flame, not back on top of it

    expect(serializeGrid(grid)).toMatchSnapshot();
  });
});
