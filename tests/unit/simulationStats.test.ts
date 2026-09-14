import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/app/Simulation";
import { Material } from "../../src/grid/materials";
import { runTicks } from "../snapshot/helpers/headlessRunner";

describe("Simulation.getStats", () => {
  it("reflects live particle count and active grid cell count after ticking", () => {
    const sim = new Simulation({ width: 100, height: 100, cellSize: 4, seed: 5 });
    expect(sim.getStats()).toEqual({ particleCount: 0, activeCellCount: 0 });

    sim.spawnParticlesAt(50, 50, 3);
    sim.grid.setMaterial(5, 0, Material.SAND);
    runTicks(sim, 1);

    const stats = sim.getStats();
    expect(stats.particleCount).toBe(3);
    expect(stats.activeCellCount).toBe(sim.grid.activeCount);
    expect(stats.activeCellCount).toBeGreaterThan(0);
  });
});
