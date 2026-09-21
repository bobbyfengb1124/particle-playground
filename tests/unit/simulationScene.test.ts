import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/app/Simulation";
import { Material } from "../../src/grid/materials";
import { runTicks } from "../snapshot/helpers/headlessRunner";

describe("Simulation.exportScene", () => {
  it("uses the grid's cell dimensions, not the canvas pixel dimensions", () => {
    const sim = new Simulation({ width: 400, height: 200, cellSize: 4 });
    const scene = JSON.parse(sim.exportScene());
    expect(scene.width).toBe(sim.grid.width);
    expect(scene.height).toBe(sim.grid.height);
    expect(scene.width).not.toBe(sim.width);
    expect(scene.height).not.toBe(sim.height);
  });
});

describe("Simulation save/load round trip", () => {
  it("restores a painted-and-ticked scene exactly after clearing", () => {
    const sim = new Simulation({ width: 80, height: 80, cellSize: 4, seed: 5 });
    sim.grid.setMaterial(2, 2, Material.STONE);
    sim.grid.setMaterial(5, 5, Material.WOOD);
    sim.grid.transformMaterial(5, 5, Material.FIRE, 0);
    sim.grid.setMaterial(10, 0, Material.WATER);
    runTicks(sim, 30); // let fire burn down and water settle, so timers aren't just defaults

    const beforeMaterial = Array.from(sim.grid.material);
    const beforeTimer = Array.from(sim.grid.timer);

    const json = sim.exportScene();
    sim.clearGrid();
    expect(Array.from(sim.grid.material).every((id) => id === Material.EMPTY)).toBe(true);

    const error = sim.loadScene(json);
    expect(error).toBeNull();
    expect(Array.from(sim.grid.material)).toEqual(beforeMaterial);
    expect(Array.from(sim.grid.timer)).toEqual(beforeTimer);
  });

  it("leaves the grid untouched when loading malformed JSON", () => {
    const sim = new Simulation({ width: 40, height: 40, cellSize: 4 });
    sim.grid.setMaterial(1, 1, Material.SAND);
    const beforeMaterial = Array.from(sim.grid.material);
    const beforeTimer = Array.from(sim.grid.timer);

    const error = sim.loadScene("not json");

    expect(error).not.toBeNull();
    expect(Array.from(sim.grid.material)).toEqual(beforeMaterial);
    expect(Array.from(sim.grid.timer)).toEqual(beforeTimer);
  });

  it("leaves the grid untouched when loading a scene with mismatched dimensions", () => {
    const sim = new Simulation({ width: 40, height: 40, cellSize: 4 });
    sim.grid.setMaterial(1, 1, Material.SAND);
    const beforeMaterial = Array.from(sim.grid.material);
    const beforeTimer = Array.from(sim.grid.timer);

    const other = new Simulation({ width: 80, height: 80, cellSize: 4 });
    const error = sim.loadScene(other.exportScene());

    expect(error).not.toBeNull();
    expect(Array.from(sim.grid.material)).toEqual(beforeMaterial);
    expect(Array.from(sim.grid.timer)).toEqual(beforeTimer);
  });
});
