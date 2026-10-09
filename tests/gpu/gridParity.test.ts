import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRng } from "../../src/core/Rng";
import { GpuGrid } from "../../src/gpu/GpuGrid";
import { Grid } from "../../src/grid/Grid";
import { Material } from "../../src/grid/materials";
import { PhasedStepper } from "../../src/grid/PhasedStepper";
import { describeMismatch, gpuChecked, testDevice } from "./helpers";

let device: GPUDevice;
beforeAll(async () => {
  device = await testDevice();
});
afterAll(() => device?.destroy());

/** A random mix of the four materials with GPU rules in 17b; ~10% carry a non-zero timer, to check timers travel with moves and swaps. */
function seededScene(width: number, height: number, seed: number): Grid {
  const grid = new Grid(width, height);
  const rng = createRng(seed);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const roll = rng.next();
      const id =
        roll < 0.25 ? Material.SAND :
        roll < 0.35 ? Material.WATER :
        roll < 0.45 ? Material.OIL :
        roll < 0.5 ? Material.STONE :
        Material.EMPTY;
      if (id === Material.EMPTY) continue;
      grid.setMaterial(x, y, id);
      if (rng.next() < 0.1) grid.timer[grid.index(x, y)] = 1 + Math.floor(rng.next() * 65535);
    }
  }
  return grid;
}

const TICKS = 200;
const CHECKPOINTS = new Set([1, 50, 200]);
const SEEDS = [0xc0ffee, 7];

describe.each([
  [96, 64],
  [97, 65],
])("GPU stepping matches PhasedStepper at %i×%i", (width, height) => {
  it.each(SEEDS)("seed %i, one step per submit", async (seed) => {
    const cpu = seededScene(width, height, seed);
    const stepper = new PhasedStepper(seed);
    const gpu = await GpuGrid.create(device, width, height, seed);

    await gpuChecked(device, async () => {
      gpu.upload(cpu.material, cpu.timer);
      for (let tick = 1; tick <= TICKS; tick++) {
        stepper.step(cpu);
        gpu.step(1);
        if (CHECKPOINTS.has(tick)) {
          expect(describeMismatch(cpu, await gpu.readback()), `after tick ${tick}`).toBe("");
        }
      }
    });
    expect(gpu.tick).toBe(stepper.tick);
    gpu.destroy();
  });

  it("four steps per submit (the 1 px app path) ends identical", async () => {
    const seed = SEEDS[0];
    const cpu = seededScene(width, height, seed);
    const stepper = new PhasedStepper(seed);
    const gpu = await GpuGrid.create(device, width, height, seed);

    await gpuChecked(device, async () => {
      gpu.upload(cpu.material, cpu.timer);
      for (let i = 0; i < TICKS / 4; i++) gpu.step(4);
      for (let i = 0; i < TICKS; i++) stepper.step(cpu);
      expect(describeMismatch(cpu, await gpu.readback())).toBe("");
    });
    gpu.destroy();
  });
});
