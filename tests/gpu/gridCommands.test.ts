import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CpuBackend } from "../../src/backend/cpu/CpuBackend";
import { brushStamp, GpuGrid } from "../../src/gpu/GpuGrid";
import { Material, type MaterialIdValue } from "../../src/grid/materials";
import { gpuChecked, sampleCells, testDevice } from "./helpers";

let device: GPUDevice;
beforeAll(async () => {
  device = await testDevice();
});
afterAll(() => device?.destroy());

describe("GpuGrid upload, readback and clear", () => {
  it("starts empty", async () => {
    const grid = await gpuChecked(device, () => GpuGrid.create(device, 97, 65, 1));
    const back = await gpuChecked(device, () => grid.readback());
    expect(back.material.every((m) => m === 0)).toBe(true);
    expect(back.timer.every((t) => t === 0)).toBe(true);
    grid.destroy();
  });

  it("round-trips material and timer exactly through upload → readback", async () => {
    const grid = await GpuGrid.create(device, 97, 65, 1);
    const cells = sampleCells(97 * 65);
    const back = await gpuChecked(device, () => {
      grid.upload(cells.material, cells.timer);
      return grid.readback();
    });
    expect(back.material).toEqual(cells.material);
    expect(back.timer).toEqual(cells.timer);
    grid.destroy();
  });

  it("clear empties every cell", async () => {
    const grid = await GpuGrid.create(device, 97, 65, 1);
    const cells = sampleCells(97 * 65);
    const back = await gpuChecked(device, () => {
      grid.upload(cells.material, cells.timer);
      grid.clear();
      return grid.readback();
    });
    expect(back.material.every((m) => m === 0)).toBe(true);
    expect(back.timer.every((t) => t === 0)).toBe(true);
    grid.destroy();
  });

  it("rejects upload arrays of the wrong length", async () => {
    const grid = await GpuGrid.create(device, 97, 65, 1);
    expect(() => grid.upload(new Uint8Array(10), new Uint16Array(10))).toThrow(RangeError);
    grid.destroy();
  });
});

describe.each([1, 4])("GPU paint matches CpuBackend.paintBrush at cellSize %i", (cellSize) => {
  it("paints identical cells for mixed, overlapping, edge-crossing strokes", async () => {
    const width = 97;
    const height = 65;
    const cpu = new CpuBackend({ width: width * cellSize, height: height * cellSize, cellSize, seed: 1, particleCapacity: 1, gravity: 0 });
    const gpu = await GpuGrid.create(device, width, height, 1);

    // Same non-empty starting cells on both sides, so the test also checks that painting resets timers and leaves unpainted cells alone.
    const start = sampleCells(width * height);
    cpu.grid.material.set(start.material);
    cpu.grid.timer.set(start.timer);
    gpu.upload(start.material, start.timer);

    // Brush-grid coordinates, as Simulation.paintAt produces: 0..ceil(px / 4) - 1.
    const bw = Math.ceil((width * cellSize) / 4);
    const bh = Math.ceil((height * cellSize) / 4);
    const mx = Math.floor(bw / 2);
    const my = Math.floor(bh / 2);
    const strokes: Array<[number, number, number, MaterialIdValue]> = [
      [mx, my, 0, Material.SAND],      // radius 0
      [mx, my, 8, Material.WATER],     // radius 8, covers the first
      [mx + 2, my, 2, Material.SAND],  // later stamp wins over water
      [mx - 3, my, 2, Material.SAND],  // same material again → batched with the previous one
      [0, my, 3, Material.OIL],        // off the left edge
      [bw - 1, my, 3, Material.STONE], // off the right edge
      [mx, 0, 3, Material.SAND],       // off the top
      [mx, bh - 1, 3, Material.WATER], // off the bottom
      [0, 0, 5, Material.OIL],         // off two edges at the corner
      [mx, my, 1, Material.EMPTY],     // eraser
    ];

    for (const [bx, by, radius, material] of strokes) {
      cpu.paintBrush(bx, by, radius, material);
    }
    const back = await gpuChecked(device, () => {
      gpu.paint(strokes.map(([bx, by, radius, material]) => brushStamp(bx, by, radius, material, cellSize)));
      return gpu.readback();
    });

    expect(back.material).toEqual(cpu.grid.material);
    expect(back.timer).toEqual(cpu.grid.timer);
    gpu.destroy();
  });
});
