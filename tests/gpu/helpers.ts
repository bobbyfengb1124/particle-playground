import { expect } from "vitest";
import { createRng } from "../../src/core/Rng";
import { requestGpu } from "../../src/gpu/GpuContext";
import { GpuGrid } from "../../src/gpu/GpuGrid";
import { Grid } from "../../src/grid/Grid";
import { MATERIALS, type MaterialIdValue } from "../../src/grid/materials";
import { PhasedStepper } from "../../src/grid/PhasedStepper";

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

/** One material in a scatterScene mix: `share` of all cells (0..1); timers up to `maxTimer` (omit for untimed materials). */
export interface ScatterEntry {
  material: MaterialIdValue;
  share: number;
  maxTimer?: number;
}

/**
 * A random but repeatable parity scene: each cell rolls once and takes the first entry whose
 * running total of shares covers the roll, else stays empty. Timed entries get timer 0 on most
 * cells, 1..maxTimer on 30%, and exactly 65535 on 1% (the unwrapped-age edge case).
 */
export function scatterScene(width: number, height: number, seed: number, entries: readonly ScatterEntry[]): Grid {
  const grid = new Grid(width, height);
  const rng = createRng(seed);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const roll = rng.next();
      let total = 0;
      const entry = entries.find((e) => roll < (total += e.share));
      if (!entry) continue;
      grid.setMaterial(x, y, entry.material);
      if (entry.maxTimer === undefined) continue;
      const t = rng.next();
      if (t < 0.01) grid.timer[grid.index(x, y)] = 65535;
      else if (t < 0.31) grid.timer[grid.index(x, y)] = 1 + Math.floor(rng.next() * entry.maxTimer);
    }
  }
  return grid;
}

export interface ParityOptions {
  seed: number;
  scale?: number;
  ticks?: number;
  checkpoints?: readonly number[];
  /** Per-cell zone wind (WindField.values); omitted means no zones. */
  zoneWind?: Float32Array;
  /** The wind slider value; default 0. */
  globalWind?: number;
  /** Steps per gpu.step call: 4 is the 1 px app path. Checkpoints must then be multiples of it. Default 1. */
  stepsPerSubmit?: number;
}

/**
 * Steps `cpu` with PhasedStepper and a GpuGrid copy of it side by side, and asserts every cell
 * matches at each checkpoint (default ticks 1, 50 and 200). The GPU runs `stepsPerSubmit` steps
 * per gpu.step call, so it can only be compared between submits. Steps `cpu` in place.
 */
export async function runParity(device: GPUDevice, cpu: Grid, opts: ParityOptions): Promise<void> {
  const { seed, scale = 1, ticks = 200, checkpoints = [1, 50, 200], zoneWind, globalWind = 0, stepsPerSubmit = 1 } = opts;
  const stepper = new PhasedStepper(seed);
  const gpu = await GpuGrid.create(device, cpu.width, cpu.height, seed, scale);
  try {
    await gpuChecked(device, async () => {
      gpu.upload(cpu.material, cpu.timer);
      if (zoneWind) gpu.setZoneWind(zoneWind);
      for (let tick = stepsPerSubmit; tick <= ticks; tick += stepsPerSubmit) {
        for (let i = 0; i < stepsPerSubmit; i++) stepper.step(cpu, { scale, wind: zoneWind, globalWind });
        gpu.step(stepsPerSubmit, globalWind);
        if (checkpoints.includes(tick)) {
          expect(describeMismatch(cpu, await gpu.readback()), `after tick ${tick}`).toBe("");
        }
      }
    });
  } finally {
    gpu.destroy();
  }
}
