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
  const backend = await GpuBackend.create({ width: WIDTH, height: HEIGHT, cellSize, seed: 1, canvas: makeCanvas(), allowFallback: true });
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
  expect(gpu.getStats()).toEqual({ particleCount: 0, activeCellCount: 0 });
});
