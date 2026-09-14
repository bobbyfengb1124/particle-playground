import { describe, expect, it } from "vitest";
import { createRng } from "../../src/core/Rng";
import { Grid } from "../../src/grid/Grid";
import { GridStepper } from "../../src/grid/GridStepper";
import { Material } from "../../src/grid/materials";

// Hand-marks one cell active and one inactive via direct Grid bookkeeping (no
// organic multi-tick settling, so no RNG involved) to exercise the skip check
// at GridStepper.ts's scan loop directly and deterministically.
describe("GridStepper active-cell skip", () => {
  it("enableActiveSkip=true runs the active cell's rule but leaves the inactive cell untouched", () => {
    const grid = new Grid(5, 5);
    const stepper = new GridStepper();
    const rng = createRng(1);

    // Settle cell B out of the active set before the tick under test: mark it
    // active, then let one more beginTick() drop it with nothing re-touching it.
    grid.setMaterial(1, 0, Material.SAND);
    grid.beginTick();
    grid.beginTick();

    // Cell A: freshly marked, so it will be active for the upcoming step().
    grid.setMaterial(3, 0, Material.SAND);

    stepper.enableActiveSkip = true;
    stepper.step(grid, rng);

    // A was active: its rule ran, so it fell straight down onto empty space below.
    expect(grid.get(3, 0)).toBe(Material.EMPTY);
    expect(grid.get(3, 1)).toBe(Material.SAND);

    // B was inactive and skipped: its rule never ran, so it's exactly where it was.
    expect(grid.get(1, 0)).toBe(Material.SAND);
    expect(grid.get(1, 1)).toBe(Material.EMPTY);
  });

  it("enableActiveSkip=false processes every non-empty cell regardless of active-set membership", () => {
    const grid = new Grid(5, 5);
    const stepper = new GridStepper();
    const rng = createRng(1);

    grid.setMaterial(1, 0, Material.SAND);
    grid.beginTick();
    grid.beginTick(); // inactive, but the flag being off means it's processed anyway

    stepper.enableActiveSkip = false;
    stepper.step(grid, rng);

    expect(grid.get(1, 0)).toBe(Material.EMPTY);
    expect(grid.get(1, 1)).toBe(Material.SAND);
  });
});
