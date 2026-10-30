import { describe, expect, it } from "vitest";
import { CpuBackend } from "../../src/backend/cpu/CpuBackend";
import { GpuBackend } from "../../src/backend/gpu/GpuBackend";
import type { SimBackend } from "../../src/backend/SimBackend";
import { Material } from "../../src/grid/materials";
import { sampleCells } from "./helpers";

const WIDTH = 240;
const HEIGHT = 160;

function makeCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  return canvas;
}

/** Fails loudly, like testDevice, if there's no adapter. */
async function gpuBackend(cellSize: number): Promise<GpuBackend> {
  const backend = await GpuBackend.create({ width: WIDTH, height: HEIGHT, cellSize, seed: 1, canvas: makeCanvas(), allowFallback: true, gravity: 0 });
  if (!backend) throw new Error("No WebGPU adapter — check the launch flags in vitest.gpu.config.ts");
  return backend;
}

function cpuBackend(cellSize: number): CpuBackend {
  return new CpuBackend({ width: WIDTH, height: HEIGHT, cellSize, seed: 1, particleCapacity: 1, gravity: 0 });
}

describe.each([1, 4])("GpuBackend at cellSize %i", (cellSize) => {
  it("paints and clears like CpuBackend, and exports the same scene", async () => {
    const cpu = cpuBackend(cellSize);
    const gpu = await gpuBackend(cellSize);
    const script = (b: SimBackend): void => {
      b.paintBrush(10, 10, 4, Material.SAND);
      b.paintBrush(12, 10, 2, Material.WATER);
      b.clearGrid(); // wipes both strokes above
      b.paintBrush(20, 15, 3, Material.OIL);
      b.paintBrush(21, 15, 1, Material.STONE);
      b.paintBrush(0, 0, 2, Material.SAND);
    };
    script(cpu);
    script(gpu);
    // No tick or render in between: exportCells must flush the queued stamps itself.
    expect(await gpu.exportCells()).toEqual(await cpu.exportCells());
  });

  it("loads a scene exactly, dropping strokes queued before the load", async () => {
    const gpu = await gpuBackend(cellSize);
    const cells = sampleCells(gpu.gridWidth * gpu.gridHeight);
    const scene = { width: gpu.gridWidth, height: gpu.gridHeight, cellSize, material: Array.from(cells.material), timer: Array.from(cells.timer), windZones: [] };
    gpu.paintBrush(5, 5, 3, Material.STONE);
    gpu.applyScene(scene);
    expect(await gpu.exportCells()).toEqual(scene);
  });
});

it("tick steps the grid: a lone sand cell at 4 px falls one cell", async () => {
  const gpu = await gpuBackend(4);
  gpu.paintBrush(10, 5, 0, Material.SAND);
  gpu.tick(1 / 60, 0);
  const { material, width } = await gpu.exportCells();
  expect(material[5 * width + 10]).toBe(Material.EMPTY);
  expect(material[6 * width + 10]).toBe(Material.SAND);
});

it("getStats reports non-empty cells and the GPU ms split", async () => {
  const gpu = await gpuBackend(4);
  gpu.paintBrush(10, 5, 1, Material.STONE); // a 3×3 square: 9 cells that never move
  gpu.tick(1 / 60, 0); // the first step() call counts
  gpu.renderScene(true, 0);
  await gpu.exportCells(); // waits on the GPU, so the count and timer reads (queued earlier) have landed
  const stats = gpu.getStats();
  expect(stats.particleCount).toBe(0);
  expect(stats.activeCellCount).toBe(9);
  // The test device (SwiftShader) supports timestamp-query; on one that doesn't, this is null ("GPU: n/a").
  expect(stats.gpuMs).not.toBeNull();
  expect(stats.gpuMs?.sim).toBeGreaterThanOrEqual(0);
  expect(stats.gpuMs?.draw).toBeGreaterThan(0);
});

/** Paints one smoke cell at (30, 30) on the 4 px grid, ticks 10 times, and returns the column it ended up in. */
async function smokeColumnAfter(setup: (b: GpuBackend) => void, globalWind: number): Promise<number> {
  const gpu = await gpuBackend(4);
  setup(gpu);
  gpu.paintBrush(30, 30, 0, Material.SMOKE);
  for (let i = 0; i < 10; i++) gpu.tick(1 / 60, globalWind);
  const { material, width } = await gpu.exportCells();
  const idx = material.indexOf(Material.SMOKE);
  expect(idx, "the smoke cell is still there").toBeGreaterThanOrEqual(0);
  return idx % width;
}

describe("GpuBackend wind", () => {
  it("smoke rises straight up with no wind", async () => {
    expect(await smokeColumnAfter(() => {}, 0)).toBe(30);
  });

  it("a wind zone pushes smoke downwind", async () => {
    expect(await smokeColumnAfter((b) => b.setWindZones([{ gx: 0, gy: 0, gw: 60, gh: 40, strength: 800 }]), 0)).toBeGreaterThan(30);
  });

  it("the wind slider pushes smoke downwind", async () => {
    expect(await smokeColumnAfter(() => {}, -400)).toBeLessThan(30);
  });
});
