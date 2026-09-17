import { describe, expect, it } from "vitest";
import { createRng } from "../../src/core/Rng";
import { Grid } from "../../src/grid/Grid";
import { GridStepper } from "../../src/grid/GridStepper";
import { Material, MATERIALS } from "../../src/grid/materials";
import { stepSeed } from "../../src/grid/rules/plant";

const rng = createRng(1);
const ctx = { rng };

describe("stepSeed", () => {
  it("falls straight down into an empty cell below", () => {
    const grid = new Grid(3, 3);
    grid.setMaterial(1, 1, Material.SEED);
    stepSeed(grid, 1, 1, ctx);
    expect(grid.get(1, 1)).toBe(Material.EMPTY);
    expect(grid.get(1, 2)).toBe(Material.SEED);
  });

  it("sinks through a water cell below it via swap rather than landing on top", () => {
    const grid = new Grid(3, 3);
    grid.setMaterial(1, 1, Material.SEED);
    grid.setMaterial(1, 2, Material.WATER);
    stepSeed(grid, 1, 1, ctx);
    expect(grid.get(1, 1)).toBe(Material.WATER);
    expect(grid.get(1, 2)).toBe(Material.SEED);
  });

  it("sinks through an oil cell below it via swap rather than landing on top", () => {
    const grid = new Grid(3, 3);
    grid.setMaterial(1, 1, Material.SEED);
    grid.setMaterial(1, 2, Material.OIL);
    stepSeed(grid, 1, 1, ctx);
    expect(grid.get(1, 1)).toBe(Material.OIL);
    expect(grid.get(1, 2)).toBe(Material.SEED);
  });

  it("lands on stone without sinking further when everything below is blocked", () => {
    const grid = new Grid(3, 3);
    grid.setMaterial(1, 1, Material.SEED);
    grid.setMaterial(0, 2, Material.STONE);
    grid.setMaterial(1, 2, Material.STONE);
    grid.setMaterial(2, 2, Material.STONE);
    stepSeed(grid, 1, 1, ctx);
    expect(grid.get(1, 1)).toBe(Material.SEED);
    expect(grid.get(1, 2)).toBe(Material.STONE);
  });

  it("falls diagonally when blocked straight down but a diagonal is free", () => {
    const grid = new Grid(5, 5);
    grid.setMaterial(2, 0, Material.SEED);
    grid.setMaterial(2, 1, Material.STONE); // block straight down
    stepSeed(grid, 2, 0, ctx);
    expect(grid.get(2, 0)).toBe(Material.EMPTY);
    const landedLeft = grid.get(1, 1) === Material.SEED;
    const landedRight = grid.get(3, 1) === Material.SEED;
    expect(landedLeft || landedRight).toBe(true);
  });

  it("accumulates ticks only while landed and adjacent to water", () => {
    const grid = new Grid(3, 3);
    grid.setMaterial(1, 1, Material.SEED);
    grid.setMaterial(0, 2, Material.STONE);
    grid.setMaterial(1, 2, Material.STONE);
    grid.setMaterial(2, 2, Material.STONE);
    grid.setMaterial(2, 1, Material.WATER);
    stepSeed(grid, 1, 1, ctx);
    expect(grid.get(1, 1)).toBe(Material.SEED);
    expect(grid.timer[grid.index(1, 1)] & 0xff).toBe(1);
  });

  it("neither advances nor resets the ticks counter when no water is adjacent", () => {
    const grid = new Grid(3, 3);
    grid.setMaterial(1, 1, Material.SEED);
    grid.timer[grid.index(1, 1)] = 50; // partway toward the next stage
    grid.setMaterial(0, 2, Material.STONE);
    grid.setMaterial(1, 2, Material.STONE);
    grid.setMaterial(2, 2, Material.STONE);
    stepSeed(grid, 1, 1, ctx);
    expect(grid.get(1, 1)).toBe(Material.SEED);
    expect(grid.timer[grid.index(1, 1)]).toBe(50);
  });

  it("grows one stage straight up after reaching the watered-tick threshold, consuming the water", () => {
    const grid = new Grid(3, 3);
    grid.setMaterial(1, 1, Material.SEED);
    grid.timer[grid.index(1, 1)] = 90; // ticks=90, stage=0
    grid.setMaterial(0, 2, Material.STONE);
    grid.setMaterial(1, 2, Material.STONE);
    grid.setMaterial(2, 2, Material.STONE);
    grid.setMaterial(2, 1, Material.WATER);
    stepSeed(grid, 1, 1, ctx);
    expect(grid.get(1, 1)).toBe(Material.PLANT);
    expect(grid.get(2, 1)).toBe(Material.EMPTY); // water consumed
    expect(grid.get(1, 0)).toBe(Material.SEED); // grew straight up
    const grownTimer = grid.timer[grid.index(1, 0)];
    expect(grownTimer >> 8).toBe(1); // stage advanced to 1
    expect(grownTimer & 0xff).toBe(0); // fresh ticks counter
  });

  it("grows diagonally when the cell directly above is occupied", () => {
    const grid = new Grid(5, 3);
    grid.setMaterial(2, 1, Material.SEED);
    grid.timer[grid.index(2, 1)] = 90;
    grid.setMaterial(1, 2, Material.STONE);
    grid.setMaterial(2, 2, Material.STONE);
    grid.setMaterial(3, 2, Material.STONE);
    grid.setMaterial(3, 1, Material.WATER);
    grid.setMaterial(2, 0, Material.STONE); // block the straight-up grow target
    stepSeed(grid, 2, 1, ctx);
    expect(grid.get(2, 1)).toBe(Material.PLANT);
    expect(grid.get(3, 1)).toBe(Material.EMPTY); // water consumed
    const grewLeft = grid.get(1, 0) === Material.SEED;
    const grewRight = grid.get(3, 0) === Material.SEED;
    expect(grewLeft || grewRight).toBe(true);
  });

  it("waits (no state change) when straight-up and both diagonals are all occupied", () => {
    const grid = new Grid(3, 3);
    grid.setMaterial(1, 1, Material.SEED);
    grid.timer[grid.index(1, 1)] = 90;
    grid.setMaterial(0, 2, Material.STONE);
    grid.setMaterial(1, 2, Material.STONE);
    grid.setMaterial(2, 2, Material.STONE);
    grid.setMaterial(2, 1, Material.WATER);
    grid.setMaterial(0, 0, Material.STONE);
    grid.setMaterial(1, 0, Material.STONE);
    grid.setMaterial(2, 0, Material.STONE);
    stepSeed(grid, 1, 1, ctx);
    expect(grid.get(1, 1)).toBe(Material.SEED);
    expect(grid.get(2, 1)).toBe(Material.WATER); // not consumed
    expect(grid.timer[grid.index(1, 1)]).toBe(90); // unchanged
  });

  it("produces PLANT instead of another SEED once the height cap (stage 5→6) is reached", () => {
    const grid = new Grid(3, 3);
    grid.setMaterial(1, 1, Material.SEED);
    grid.timer[grid.index(1, 1)] = (5 << 8) | 90; // stage 5, ready to grow
    grid.setMaterial(0, 2, Material.STONE);
    grid.setMaterial(1, 2, Material.STONE);
    grid.setMaterial(2, 2, Material.STONE);
    grid.setMaterial(2, 1, Material.WATER);
    stepSeed(grid, 1, 1, ctx);
    expect(grid.get(1, 1)).toBe(Material.PLANT);
    expect(grid.get(1, 0)).toBe(Material.PLANT);
  });

  it("SEED and PLANT are both flagged flammable", () => {
    expect(MATERIALS[Material.SEED].flammable).toBe(true);
    expect(MATERIALS[Material.PLANT].flammable).toBe(true);
  });

  it("PLANT has no registered rule, so the stepper never moves it", () => {
    const grid = new Grid(3, 3);
    const stepperRng = createRng(1);
    const stepper = new GridStepper();
    grid.setMaterial(1, 0, Material.PLANT);
    for (let i = 0; i < 20; i++) stepper.step(grid, stepperRng);
    expect(grid.get(1, 0)).toBe(Material.PLANT);
  });
});
