import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/app/Simulation";
import { Material } from "../../src/grid/materials";

describe("Simulation.takeSoundEvents (Step 18 Q10)", () => {
  it("reports each launch's power once, then drains", () => {
    const sim = new Simulation({ width: 400, height: 400, cellSize: 4, seed: 1 });
    sim.launchFromDrag(200, 380, 200, 380); // no drag: power 0
    sim.launchFromDrag(200, 380, 200, 180); // 200 px drag: past full power, clamped to 1
    expect(sim.takeSoundEvents().launchPowers).toEqual([0, 1]);
    expect(sim.takeSoundEvents().launchPowers).toEqual([]);
  });

  it("records no whoosh for a launch made while paused (Q6)", () => {
    const sim = new Simulation({ width: 400, height: 400, cellSize: 4, seed: 1 });
    sim.pause();
    sim.launchFromDrag(200, 380, 200, 380);
    expect(sim.takeSoundEvents().launchPowers).toEqual([]);
  });

  it("records no whoosh when the particle pool refuses the rocket (Q13)", () => {
    const sim = new Simulation({ width: 400, height: 400, cellSize: 4, seed: 1, particleCapacity: 1 });
    sim.backend.spawnParticlesAt(100, 100, 1); // fills the only slot
    sim.launchFromDrag(200, 380, 200, 380);
    expect(sim.takeSoundEvents().launchPowers).toEqual([]);
  });

  it("counts a rocket's burst exactly once across calls", () => {
    const sim = new Simulation({ width: 400, height: 400, cellSize: 4, seed: 1 });
    sim.launchFromDrag(200, 380, 200, 280);
    let bursts = 0;
    for (let i = 0; i < 120; i++) {
      sim.tick(1 / 60);
      bursts += sim.takeSoundEvents().bursts;
    }
    expect(bursts).toBe(1);
  });

  it("reports burning area in px², so it doesn't depend on cell size (Q3)", () => {
    const sim = new Simulation({ width: 400, height: 400, cellSize: 4, seed: 1 });
    for (let x = 10; x < 30; x++) sim.grid.setMaterial(x, 50, Material.FIRE);
    sim.tick(1 / 60); // tick 0 counts fire
    expect(sim.takeSoundEvents().fireArea).toBe(sim.grid.countMaterial(Material.FIRE) * 4 * 4);
  });
});
