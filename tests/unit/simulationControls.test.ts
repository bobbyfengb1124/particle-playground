import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/app/Simulation";
import { Material } from "../../src/grid/materials";
import { runTicks } from "../snapshot/helpers/headlessRunner";

describe("Simulation controls", () => {
  it("defaults to sand selected and a 1-cell-radius brush", () => {
    const sim = new Simulation({ width: 40, height: 40, cellSize: 4 });
    expect(sim.selectedMaterial).toBe(Material.SAND);
    expect(sim.brushSize).toBe(1);
  });

  it("setBrushSize clamps to a non-negative integer", () => {
    const sim = new Simulation({ width: 40, height: 40, cellSize: 4 });
    sim.setBrushSize(-5);
    expect(sim.brushSize).toBe(0);
    sim.setBrushSize(3.7);
    expect(sim.brushSize).toBe(3);
  });

  it("clearGrid empties every cell, including stone", () => {
    const sim = new Simulation({ width: 20, height: 20, cellSize: 4 });
    sim.grid.setMaterial(1, 1, Material.STONE);
    sim.grid.setMaterial(2, 2, Material.WATER);
    sim.clearGrid();
    for (const id of sim.grid.material) expect(id).toBe(Material.EMPTY);
  });

  it("clearGrid lets the grid start fresh — a cell painted afterward still steps normally", () => {
    const sim = new Simulation({ width: 40, height: 40, cellSize: 4 });
    sim.grid.setMaterial(1, 1, Material.SAND);
    sim.clearGrid();
    sim.grid.setMaterial(5, 0, Material.SAND);
    runTicks(sim, 60);
    expect(sim.grid.get(5, sim.grid.height - 1)).toBe(Material.SAND);
  });

  it("pause() freezes both particle motion and grid stepping until resume()", () => {
    const sim = new Simulation({ width: 100, height: 100, cellSize: 4, seed: 3 });
    sim.spawnParticlesAt(50, 10, 1);
    sim.grid.setMaterial(5, 0, Material.SAND);
    expect(sim.isPaused).toBe(false);

    sim.pause();
    expect(sim.isPaused).toBe(true);
    let firstParticleY = 0;
    sim.particles.forEachActive((p) => (firstParticleY = p.y));
    runTicks(sim, 30);
    let afterPauseY = 0;
    sim.particles.forEachActive((p) => (afterPauseY = p.y));
    expect(afterPauseY).toBe(firstParticleY);
    expect(sim.grid.get(5, 0)).toBe(Material.SAND);
    expect(sim.grid.get(5, 1)).toBe(Material.EMPTY);

    sim.resume();
    expect(sim.isPaused).toBe(false);
    runTicks(sim, 30);
    let afterResumeY = 0;
    sim.particles.forEachActive((p) => (afterResumeY = p.y));
    expect(afterResumeY).not.toBe(firstParticleY);
    expect(sim.grid.get(5, 0)).toBe(Material.EMPTY);
  });
});
