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

  it("setBrushSize clamps to a non-negative integer no larger than MAX_BRUSH_SIZE", () => {
    const sim = new Simulation({ width: 40, height: 40, cellSize: 4 });
    sim.setBrushSize(-5);
    expect(sim.brushSize).toBe(0);
    sim.setBrushSize(3.7);
    expect(sim.brushSize).toBe(3);
    sim.setBrushSize(100);
    expect(sim.brushSize).toBe(8);
  });

  it("adjustBrushSize steps the brush size up or down and clamps at the same bounds as setBrushSize", () => {
    const sim = new Simulation({ width: 40, height: 40, cellSize: 4 });
    sim.setBrushSize(1);
    sim.adjustBrushSize(1);
    expect(sim.brushSize).toBe(2);
    sim.adjustBrushSize(-5);
    expect(sim.brushSize).toBe(0);
    sim.adjustBrushSize(20);
    expect(sim.brushSize).toBe(8);
  });

  it("adjustBrushSize is a no-op outside paint mode", () => {
    const sim = new Simulation({ width: 40, height: 40, cellSize: 4 });
    sim.setBrushSize(3);
    sim.setMode("launch");
    sim.adjustBrushSize(2);
    expect(sim.brushSize).toBe(3);
  });

  it("adjustBrushSize is a no-op in wind-zone mode too", () => {
    const sim = new Simulation({ width: 40, height: 40, cellSize: 4 });
    sim.setBrushSize(3);
    sim.setMode("wind-zone");
    sim.adjustBrushSize(2);
    expect(sim.brushSize).toBe(3);
  });

  it("addWindZoneFromDrag creates a cell-snapped zone at the current strength", () => {
    const sim = new Simulation({ width: 40, height: 40, cellSize: 4 });
    expect(sim.zoneStrength).toBe(300);
    sim.setZoneStrength(-450);
    expect(sim.addWindZoneFromDrag(20, 20, 4, 8)).toBe(true);
    expect(sim.windZones).toEqual([{ gx: 1, gy: 2, gw: 5, gh: 4, strength: -450 }]);
  });

  it("a later strength change does not alter zones already drawn", () => {
    const sim = new Simulation({ width: 40, height: 40, cellSize: 4 });
    sim.addWindZoneFromDrag(0, 0, 20, 20);
    sim.setZoneStrength(700);
    expect(sim.windZones[0].strength).toBe(300);
  });

  it("addWindZoneFromDrag ignores a plain click, zero strength, and drags past the 32-zone cap", () => {
    const sim = new Simulation({ width: 40, height: 40, cellSize: 4 });
    expect(sim.addWindZoneFromDrag(10, 10, 10, 10)).toBe(false);
    sim.setZoneStrength(0);
    expect(sim.addWindZoneFromDrag(0, 0, 20, 20)).toBe(false);
    expect(sim.windZones.length).toBe(0);

    sim.setZoneStrength(100);
    for (let i = 0; i < 32; i++) expect(sim.addWindZoneFromDrag(0, 0, 20, 20)).toBe(true);
    expect(sim.addWindZoneFromDrag(0, 0, 20, 20)).toBe(false);
    expect(sim.windZones.length).toBe(32);
  });

  it("setZoneStrength clamps to ±800", () => {
    const sim = new Simulation({ width: 40, height: 40, cellSize: 4 });
    sim.setZoneStrength(5000);
    expect(sim.zoneStrength).toBe(800);
    sim.setZoneStrength(-5000);
    expect(sim.zoneStrength).toBe(-800);
  });

  it("clearWindZones removes every zone, and clearGrid leaves zones alone", () => {
    const sim = new Simulation({ width: 40, height: 40, cellSize: 4 });
    sim.addWindZoneFromDrag(0, 0, 20, 20);
    sim.clearGrid();
    expect(sim.windZones.length).toBe(1);
    sim.clearWindZones();
    expect(sim.windZones.length).toBe(0);
  });

  it("clearWindZones stops zones from pushing gas", () => {
    const sim = new Simulation({ width: 40, height: 40, cellSize: 4, seed: 2 });
    sim.setZoneStrength(800);
    sim.addWindZoneFromDrag(0, 0, 39, 39);
    sim.clearWindZones();
    sim.grid.setMaterial(5, 9, Material.SMOKE);
    runTicks(sim, 5);
    // With no wind the smoke rises straight up through open air.
    expect(sim.grid.get(5, 4)).toBe(Material.SMOKE);
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
