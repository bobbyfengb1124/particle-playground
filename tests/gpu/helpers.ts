import { requestGpu } from "../../src/gpu/GpuContext";
import type { Grid } from "../../src/grid/Grid";
import { MATERIALS } from "../../src/grid/materials";

/** The test device. Fails loudly instead of skipping when there's no adapter — a skipped GPU suite would look green. */
export async function testDevice(): Promise<GPUDevice> {
  const gpu = await requestGpu({ allowFallback: true });
  if (!gpu) throw new Error("No WebGPU adapter — check the launch flags in vitest.gpu.config.ts");
  return gpu.device;
}

/**
 * Runs `fn` and throws if it caused a WebGPU validation error. Without this, a
 * mistake like a misaligned offset or a missing usage flag is only a console
 * warning, and the GPU silently skips the bad command.
 */
export async function gpuChecked<T>(device: GPUDevice, fn: () => T | Promise<T>): Promise<T> {
  device.pushErrorScope("validation");
  const result = await fn();
  const error = await device.popErrorScope();
  if (error) throw new Error(`WebGPU validation error: ${error.message}`);
  return result;
}

/** Varied, deterministic cells: every material id in turn, and timers spread over 0..65535 (both extremes included). */
export function sampleCells(cellCount: number): { material: Uint8Array; timer: Uint16Array } {
  const material = new Uint8Array(cellCount);
  const timer = new Uint16Array(cellCount);
  for (let i = 0; i < cellCount; i++) {
    material[i] = i % MATERIALS.length;
    timer[i] = (i * 7919) % 65536;
  }
  timer[cellCount - 1] = 65535;
  return { material, timer };
}

/** "" if the GPU readback equals the CPU grid; otherwise how many cells differ and the first one, by name. */
export function describeMismatch(cpu: Grid, gpu: { material: Uint8Array; timer: Uint16Array }): string {
  let count = 0;
  let first = -1;
  for (let i = 0; i < cpu.material.length; i++) {
    if (cpu.material[i] !== gpu.material[i] || cpu.timer[i] !== gpu.timer[i]) {
      if (first < 0) first = i;
      count++;
    }
  }
  if (count === 0) return "";
  const name = (id: number): string => MATERIALS[id]?.name ?? `#${id}`;
  const x = first % cpu.width;
  const y = Math.floor(first / cpu.width);
  return `${count} cells differ; first at (${x}, ${y}): CPU ${name(cpu.material[first])} timer ${cpu.timer[first]}, GPU ${name(gpu.material[first])} timer ${gpu.timer[first]}`;
}
