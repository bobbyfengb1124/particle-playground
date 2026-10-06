import { describe, expect, it } from "vitest";
import { cellRng } from "../../src/core/cellRng";
import { createRng } from "../../src/core/Rng";
import { Grid } from "../../src/grid/Grid";
import { Material } from "../../src/grid/materials";
import { PASS_COUNT, passOrder, PhasedStepper } from "../../src/grid/PhasedStepper";
import { RULES } from "../../src/grid/rules";
import { MAX_STAGE, stepSeed, WATERED_TICKS_PER_STAGE } from "../../src/grid/rules/plant";

function count(grid: Grid, id: number): number {
  let n = 0;
  for (let i = 0; i < grid.material.length; i++) if (grid.material[i] === id) n++;
  return n;
}

/** A mixed scene touching every rule, so the order-independence check exercises all of them. */
function mixedScene(): Grid {
  const grid = new Grid(30, 20);
  for (let x = 0; x < 30; x++) grid.setMaterial(x, 19, Material.STONE);
  for (let x = 2; x < 8; x++) for (let y = 2; y < 6; y++) grid.setMaterial(x, y, Material.SAND);
  for (let x = 10; x < 16; x++) for (let y = 4; y < 8; y++) grid.setMaterial(x, y, Material.WATER);
  for (let x = 10; x < 16; x++) for (let y = 1; y < 3; y++) grid.setMaterial(x, y, Material.OIL);
  for (let x = 18; x < 22; x++) for (let y = 14; y < 19; y++) grid.setMaterial(x, y, Material.WOOD);
  grid.setMaterial(20, 13, Material.FIRE);
  for (let x = 24; x < 27; x++) grid.setMaterial(x, 3, Material.ACID);
  grid.setMaterial(5, 10, Material.SEED);
  grid.setMaterial(13, 10, Material.ICE);
  grid.setMaterial(27, 15, Material.SMOKE);
  grid.setMaterial(28, 12, Material.STEAM);
  return grid;
}

/** One phased tick, re-implemented with every pass's cells visited in reverse — must match PhasedStepper exactly. */
function reversedTick(grid: Grid, seed: number, tick: number): void {
  grid.beginTick();
  for (const pass of passOrder(seed, tick)) {
    const cells: Array<[number, number]> = [];
    for (let y = Math.floor(pass / 3); y < grid.height; y += 3) {
      for (let x = pass % 3; x < grid.width; x += 3) cells.push([x, y]);
    }
    for (const [x, y] of cells.reverse()) {
      const idx = grid.index(x, y);
      if (grid.isProcessed(idx)) continue;
      const rule = RULES[grid.material[idx]];
      if (grid.material[idx] === Material.EMPTY || !rule) continue;
      rule(grid, x, y, { rng: cellRng(seed, tick, pass, idx), tickScale: 1, cellRatio: 1 });
    }
  }
}

describe("passOrder", () => {
  it("is a permutation of all 9 passes, the same for the same (seed, tick)", () => {
    for (let tick = 0; tick < 50; tick++) {
      const order = passOrder(3, tick);
      expect([...order].sort((a, b) => a - b)).toEqual([...Array(PASS_COUNT).keys()]);
      expect(passOrder(3, tick)).toEqual(order);
    }
  });

  it("varies from tick to tick", () => {
    const distinct = new Set(Array.from({ length: 20 }, (_, tick) => passOrder(3, tick).join(",")));
    expect(distinct.size).toBeGreaterThan(15);
  });
});

describe("PhasedStepper", () => {
  it("gives the same result whatever order a pass's cells are visited in (the property the GPU relies on)", () => {
    const seed = 11;
    const forward = mixedScene();
    const reversed = mixedScene();
    const stepper = new PhasedStepper(seed);
    for (let tick = 0; tick < 120; tick++) {
      stepper.step(forward);
      reversedTick(reversed, seed, tick);
      expect(Array.from(reversed.material)).toEqual(Array.from(forward.material));
      expect(Array.from(reversed.timer)).toEqual(Array.from(forward.timer));
    }
  });

  it("conserves material when nothing can react", () => {
    const grid = new Grid(24, 24);
    for (let x = 0; x < 24; x++) grid.setMaterial(x, 23, Material.STONE);
    for (let x = 3; x < 9; x++) for (let y = 0; y < 8; y++) grid.setMaterial(x, y, Material.SAND);
    for (let x = 12; x < 20; x++) for (let y = 0; y < 4; y++) grid.setMaterial(x, y, Material.WATER);
    for (let x = 12; x < 20; x++) for (let y = 4; y < 6; y++) grid.setMaterial(x, y, Material.OIL);
    const before = [Material.SAND, Material.STONE, Material.WATER, Material.OIL].map((id) => count(grid, id));

    const stepper = new PhasedStepper(5);
    for (let i = 0; i < 300; i++) stepper.step(grid);

    expect([Material.SAND, Material.STONE, Material.WATER, Material.OIL].map((id) => count(grid, id))).toEqual(before);
  });

  it("settles a sand column into a pile that then stops changing", () => {
    const grid = new Grid(16, 16);
    for (let y = 0; y < 8; y++) grid.setMaterial(8, y, Material.SAND);
    const stepper = new PhasedStepper(42);
    for (let i = 0; i < 200; i++) stepper.step(grid);

    for (let y = 0; y < grid.height - 1; y++) {
      for (let x = 0; x < grid.width; x++) {
        if (grid.get(x, y) === Material.SAND) expect(grid.get(x, y + 1)).not.toBe(Material.EMPTY);
      }
    }
    const rowWidth = (y: number): number => Array.from({ length: 16 }, (_, x) => grid.get(x, y)).filter((id) => id === Material.SAND).length;
    expect(rowWidth(15)).toBeGreaterThan(1);

    const settled = Array.from(grid.material);
    for (let i = 0; i < 20; i++) stepper.step(grid);
    expect(Array.from(grid.material)).toEqual(settled);
  });

  it("floats oil above water in every column, regardless of pour order", () => {
    const grid = new Grid(10, 12);
    for (let x = 0; x < 10; x++) for (let y = 6; y < 8; y++) grid.setMaterial(x, y, Material.OIL);
    for (let x = 0; x < 10; x++) for (let y = 0; y < 3; y++) grid.setMaterial(x, y, Material.WATER);
    const stepper = new PhasedStepper(8);
    for (let i = 0; i < 600; i++) stepper.step(grid);

    // Only per-column order is guaranteed: once packed full, neither schedule
    // can level a one-cell bump in the boundary (liquids only move sideways
    // into empty cells) — see the V-wedge note in the Step 17 plan.
    for (let x = 0; x < grid.width; x++) {
      let seenWater = false;
      for (let y = 0; y < grid.height; y++) {
        const id = grid.get(x, y);
        if (id === Material.WATER) seenWater = true;
        if (id === Material.OIL) expect(seenWater).toBe(false); // no oil below water
      }
    }
  });

  it.each([
    [1, 180],
    [4, 720],
  ])("at scale %i, a lone fire burns for exactly %i ticks", (scale, lifetime) => {
    const grid = new Grid(3, 3);
    grid.setMaterial(1, 2, Material.FIRE);
    const stepper = new PhasedStepper(1);
    for (let i = 0; i < lifetime - 1; i++) stepper.step(grid, { scale });
    expect(grid.get(1, 2)).toBe(Material.FIRE);
    stepper.step(grid, { scale });
    expect(grid.get(1, 2)).toBe(Material.EMPTY);
  });
});

describe("plant height cap scaling", () => {
  /** A landed, fully-watered seed one stage below `stage + 1`, with free space above. Returns what it grows into. */
  function growOnce(stage: number, cellRatio: number): number {
    const grid = new Grid(3, 3);
    for (let x = 0; x < 3; x++) grid.setMaterial(x, 2, Material.STONE);
    grid.setMaterial(0, 1, Material.WATER);
    grid.transformMaterial(1, 1, Material.SEED, (stage << 8) | WATERED_TICKS_PER_STAGE);
    stepSeed(grid, 1, 1, { rng: createRng(1), cellRatio });
    expect(grid.get(1, 1)).toBe(Material.PLANT);
    return grid.get(1, 0);
  }

  it("caps at MAX_STAGE on the reference grid", () => {
    expect(growOnce(MAX_STAGE - 1, 1)).toBe(Material.PLANT);
  });

  it("keeps growing past MAX_STAGE at cellRatio 4, capping at MAX_STAGE × 4", () => {
    expect(growOnce(MAX_STAGE - 1, 4)).toBe(Material.SEED);
    expect(growOnce(MAX_STAGE * 4 - 2, 4)).toBe(Material.SEED);
    expect(growOnce(MAX_STAGE * 4 - 1, 4)).toBe(Material.PLANT);
  });
});
