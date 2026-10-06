import { describe, expect, it } from "vitest";
import { Grid } from "../../src/grid/Grid";
import { Material } from "../../src/grid/materials";
import { PhasedStepper } from "../../src/grid/PhasedStepper";
import { serializeGrid } from "./helpers/serialize";

describe("phased stepper (the GPU's schedule)", () => {
  it("a mixed scene after 200 ticks — pinned, since the GPU backend must reproduce this exactly", () => {
    const grid = new Grid(24, 16);
    for (let x = 0; x < 24; x++) grid.setMaterial(x, 15, Material.STONE);
    for (let x = 2; x < 6; x++) for (let y = 0; y < 5; y++) grid.setMaterial(x, y, Material.SAND);
    for (let x = 9; x < 14; x++) for (let y = 0; y < 3; y++) grid.setMaterial(x, y, Material.WATER);
    for (let x = 9; x < 14; x++) for (let y = 3; y < 5; y++) grid.setMaterial(x, y, Material.OIL);
    for (let x = 17; x < 21; x++) for (let y = 11; y < 15; y++) grid.setMaterial(x, y, Material.WOOD);
    grid.setMaterial(19, 10, Material.FIRE);

    const stepper = new PhasedStepper(1);
    for (let i = 0; i < 200; i++) stepper.step(grid);

    expect(serializeGrid(grid)).toMatchSnapshot();
  });
});
