import { describe, expect, it } from "vitest";
import { createRng } from "../../src/core/Rng";
import { Grid } from "../../src/grid/Grid";
import { Material } from "../../src/grid/materials";
import { stepSmoke } from "../../src/grid/rules/smoke";

describe("stepSmoke (shared gas rule)", () => {
  it("rises straight up into an empty cell above", () => {
    const grid = new Grid(5, 5);
    grid.setMaterial(2, 2, Material.SMOKE);
    stepSmoke(grid, 2, 2, { rng: createRng(1) });
    expect(grid.get(2, 2)).toBe(Material.EMPTY);
    expect(grid.get(2, 1)).toBe(Material.SMOKE);
  });

  it("rises diagonally when directly above is blocked but a diagonal is free", () => {
    const grid = new Grid(5, 5);
    grid.setMaterial(2, 2, Material.SMOKE);
    grid.setMaterial(2, 1, Material.STONE); // block straight up
    stepSmoke(grid, 2, 2, { rng: createRng(1) });
    expect(grid.get(2, 2)).toBe(Material.EMPTY);
    const landedLeft = grid.get(1, 1) === Material.SMOKE;
    const landedRight = grid.get(3, 1) === Material.SMOKE;
    expect(landedLeft || landedRight).toBe(true);
  });

  it("takes one step sideways when blocked above and both diagonals", () => {
    const grid = new Grid(7, 3);
    grid.setMaterial(3, 1, Material.SMOKE);
    grid.setMaterial(2, 0, Material.STONE);
    grid.setMaterial(3, 0, Material.STONE);
    grid.setMaterial(4, 0, Material.STONE);
    stepSmoke(grid, 3, 1, { rng: createRng(1) });
    expect(grid.get(3, 1)).toBe(Material.EMPTY);
    const landedLeft = grid.get(2, 1) === Material.SMOKE;
    const landedRight = grid.get(4, 1) === Material.SMOKE;
    expect(landedLeft || landedRight).toBe(true);
  });

  it("stays put (but still ages) when fully boxed in", () => {
    const grid = new Grid(3, 3);
    grid.setMaterial(1, 1, Material.SMOKE);
    grid.setMaterial(0, 0, Material.STONE);
    grid.setMaterial(1, 0, Material.STONE);
    grid.setMaterial(2, 0, Material.STONE);
    grid.setMaterial(0, 1, Material.STONE);
    grid.setMaterial(2, 1, Material.STONE);
    stepSmoke(grid, 1, 1, { rng: createRng(1) });
    expect(grid.get(1, 1)).toBe(Material.SMOKE);
    expect(grid.timer[grid.index(1, 1)]).toBe(1);
  });
});

describe("stepSmoke with wind", () => {
  /** Steps one smoke cell at (2, 2) of a 5x5 grid once per seed, and tallies which column it ended up in. */
  function tallyLandingColumns(wind: (grid: Grid) => Float32Array | undefined, globalWind: number): Map<number, number> {
    const counts = new Map<number, number>();
    for (let seed = 1; seed <= 40; seed++) {
      const grid = new Grid(5, 5);
      grid.setMaterial(2, 2, Material.SMOKE);
      stepSmoke(grid, 2, 2, { rng: createRng(seed), wind: wind(grid), globalWind });
      for (let x = 0; x < 5; x++) {
        for (let y = 0; y < 5; y++) {
          if (grid.get(x, y) === Material.SMOKE) counts.set(x, (counts.get(x) ?? 0) + 1);
        }
      }
    }
    return counts;
  }

  it("drifts in the direction of a strong zone, never against it", () => {
    const leftZone = (grid: Grid): Float32Array => new Float32Array(grid.width * grid.height).fill(-800);
    const counts = tallyLandingColumns(leftZone, 0);
    expect(counts.get(1) ?? 0).toBeGreaterThan(20); // ~80% push chance at full strength
    expect(counts.get(3) ?? 0).toBe(0);
  });

  it("drifts with global wind alone, with no zone field at all", () => {
    const counts = tallyLandingColumns(() => undefined, 800);
    expect(counts.get(3) ?? 0).toBeGreaterThan(20);
    expect(counts.get(1) ?? 0).toBe(0);
  });

  it("with a zero field and zero global wind, draws the same RNG values and makes the same move as with no wind at all", () => {
    const setup = (): Grid => {
      const grid = new Grid(5, 5);
      grid.setMaterial(2, 2, Material.SMOKE);
      grid.setMaterial(2, 1, Material.STONE); // forces the rule down its RNG-drawing diagonal branch
      return grid;
    };
    const plainGrid = setup();
    const plainRng = createRng(7);
    stepSmoke(plainGrid, 2, 2, { rng: plainRng });

    const windGrid = setup();
    const windRng = createRng(7);
    stepSmoke(windGrid, 2, 2, { rng: windRng, wind: new Float32Array(25), globalWind: 0 });

    expect(Array.from(windGrid.material)).toEqual(Array.from(plainGrid.material));
    expect(windRng.next()).toBe(plainRng.next());
  });
});
