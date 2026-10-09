import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CpuBackend } from "../../src/backend/cpu/CpuBackend";
import { GpuGrid } from "../../src/gpu/GpuGrid";
import { GpuRenderer } from "../../src/gpu/GpuRenderer";
import { gpuChecked, sampleCells, testDevice } from "./helpers";

let device: GPUDevice;
beforeAll(async () => {
  device = await testDevice();
});
afterAll(() => device?.destroy());

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** The canvas's pixels as RGBA bytes, read through a 2D canvas so both renderers are measured the same way. */
function pixelsOf(canvas: HTMLCanvasElement): Uint8ClampedArray {
  const copy = makeCanvas(canvas.width, canvas.height);
  const ctx = copy.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  ctx.drawImage(canvas, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}

/** "" if equal; otherwise how many pixels differ and the first one. */
function describePixelMismatch(cpu: Uint8ClampedArray, gpu: Uint8ClampedArray, width: number): string {
  let count = 0;
  let first = -1;
  for (let i = 0; i < cpu.length; i += 4) {
    if (cpu[i] !== gpu[i] || cpu[i + 1] !== gpu[i + 1] || cpu[i + 2] !== gpu[i + 2] || cpu[i + 3] !== gpu[i + 3]) {
      if (first < 0) first = i;
      count++;
    }
  }
  if (count === 0) return "";
  const p = first / 4;
  const rgba = (d: Uint8ClampedArray): string => `rgba(${d[first]}, ${d[first + 1]}, ${d[first + 2]}, ${d[first + 3]})`;
  return `${count} pixels differ; first at (${p % width}, ${Math.floor(p / width)}): CPU ${rgba(cpu)}, GPU ${rgba(gpu)}`;
}

describe.each([1, 4])("GpuRenderer matches GridRenderer (no lighting) at cellSize %i", (cellSize) => {
  it("draws identical pixels for every material, with timers set", async () => {
    const gridWidth = 60;
    const gridHeight = 40;
    const width = gridWidth * cellSize;
    const height = gridHeight * cellSize;
    const cells = sampleCells(gridWidth * gridHeight);

    const cpuCanvas = makeCanvas(width, height);
    const cpu = new CpuBackend({ width, height, cellSize, seed: 1, particleCapacity: 1, gravity: 0, canvas: cpuCanvas });
    cpu.grid.material.set(cells.material);
    cpu.grid.timer.set(cells.timer);
    cpu.renderScene(false, 0);

    const gpuCanvas = makeCanvas(width, height);
    const grid = await GpuGrid.create(device, gridWidth, gridHeight, 1);
    const renderer = await gpuChecked(device, () => GpuRenderer.create(device, gpuCanvas, grid, cellSize));
    grid.upload(cells.material, cells.timer);
    renderer.draw();
    const gpuPixels = pixelsOf(gpuCanvas);

    expect(describePixelMismatch(pixelsOf(cpuCanvas), gpuPixels, width)).toBe("");
    grid.destroy();
  });
});
