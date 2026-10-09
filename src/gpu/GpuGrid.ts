import { PASS_COUNT, passOrder } from "../grid/PhasedStepper";
import { REFERENCE_CELL_SIZE } from "../grid/scene";
import { compileShader } from "./GpuContext";
import { buildPrelude, MATERIAL_MASK, TIMER_SHIFT } from "./shaders/prelude";
import commonWgsl from "./shaders/common.wgsl?raw";
import sandWgsl from "./shaders/rules/sand.wgsl?raw";
import liquidWgsl from "./shaders/rules/liquid.wgsl?raw";
import gridWgsl from "./shaders/grid.wgsl?raw";

/** The full grid shader: generated constants, shared helpers, rules, then the entry points. */
export function gridShaderSource(): string {
  return [buildPrelude(), commonWgsl, sandWgsl, liquidWgsl, gridWgsl].join("\n");
}

/** One brush square in fine cells; mirrors `struct Stamp` in grid.wgsl (4 × 4 bytes). */
export interface Stamp {
  x0: number;
  y0: number;
  side: number;
  material: number;
}

/**
 * The square of fine cells CpuBackend.paintBrush fills: (bx, by, radius) are on the
 * fixed 4 px brush grid, and each brush cell covers REFERENCE_CELL_SIZE / cellSize
 * fine cells per side.
 */
export function brushStamp(bx: number, by: number, radius: number, material: number, cellSize: number): Stamp {
  const r = REFERENCE_CELL_SIZE / cellSize;
  return { x0: (bx - radius) * r, y0: (by - radius) * r, side: (2 * radius + 1) * r, material };
}

/** step(count) runs at most this many steps per submit: tickScale = 4 / cellSize, so 4 at 1 px. */
const MAX_STEPS_PER_CALL = 4;
/** Each pass's Params gets its own 256-byte slot: dynamic uniform offsets must be multiples of 256 by default. */
const SLOT_BYTES = 256;
const SLOT_COUNT = MAX_STEPS_PER_CALL * PASS_COUNT;
/** Stamps per paint dispatch; paint() splits longer runs. */
const MAX_STAMPS = 1024;
const STAMP_BYTES = 16;

function createBuffers(device: GPUDevice, width: number, height: number) {
  const cells = device.createBuffer({
    label: "grid.cells",
    size: width * height * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });
  const params = device.createBuffer({
    label: "grid.params",
    size: SLOT_COUNT * SLOT_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const stamps = device.createBuffer({
    label: "grid.stamps",
    size: MAX_STAMPS * STAMP_BYTES,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  return { cells, params, stamps };
}

interface GridBuffers {
  cells: GPUBuffer;
  params: GPUBuffer;
  stamps: GPUBuffer;
}

interface GridPipelines {
  clearProcessed: GPUComputePipeline;
  stepPass: GPUComputePipeline;
  paint: GPUComputePipeline;
}

/** The GPU twin of Grid + PhasedStepper: a packed cell buffer stepped by the WGSL in shaders/. */
export class GpuGrid {
  private tickCount = 0;

  private constructor(
    private readonly device: GPUDevice,
    readonly width: number,
    readonly height: number,
    private readonly seed: number,
    private readonly buffers: GridBuffers,
    private readonly pipelines: GridPipelines,
    private readonly bindGroup: GPUBindGroup,
  ) {}

  /** One packed u32 per cell (layout in prelude.ts); GpuRenderer reads it directly. */
  get cells(): GPUBuffer {
    return this.buffers.cells;
  }

  /** Steps run so far — the `tick` the next step will use, as PhasedStepper.tick. */
  get tick(): number {
    return this.tickCount;
  }

  /**
   * Runs `count` steps in one submit — the GPU twin of calling PhasedStepper.step
   * `count` times. Each step clears the processed flags, then runs the 9 passes in
   * passOrder(seed, tick). WebGPU makes each dispatch see the previous one's writes,
   * so the passes run strictly one after another, as on the CPU.
   */
  step(count = 1): void {
    if (count < 1 || count > MAX_STEPS_PER_CALL) {
      throw new RangeError(`step count ${count} is outside 1..${MAX_STEPS_PER_CALL}`);
    }

    const slotU32s = SLOT_BYTES / 4;
    const params = new Uint32Array(count * PASS_COUNT * slotU32s);
    for (let s = 0; s < count; s++) {
      const tick = this.tickCount + s;
      passOrder(this.seed, tick).forEach((pass, k) => {
        const slot = s * PASS_COUNT + k;
        params.set([this.width, this.height, this.seed, tick, pass, pass % 3, Math.floor(pass / 3)], slot * slotU32s);
      });
    }
    this.device.queue.writeBuffer(this.buffers.params, 0, params);

    const cellGroupsX = Math.ceil(this.width / 8);
    const cellGroupsY = Math.ceil(this.height / 8);
    const passGroupsX = Math.ceil(Math.ceil(this.width / 3) / 8);
    const passGroupsY = Math.ceil(Math.ceil(this.height / 3) / 8);

    const encoder = this.device.createCommandEncoder({ label: "grid.step" });
    const compute = encoder.beginComputePass({ label: "grid.step" });
    for (let s = 0; s < count; s++) {
      compute.setPipeline(this.pipelines.clearProcessed);
      compute.setBindGroup(0, this.bindGroup, [s * PASS_COUNT * SLOT_BYTES]);
      compute.dispatchWorkgroups(cellGroupsX, cellGroupsY);

      compute.setPipeline(this.pipelines.stepPass);
      for (let k = 0; k < PASS_COUNT; k++) {
        compute.setBindGroup(0, this.bindGroup, [(s * PASS_COUNT + k) * SLOT_BYTES]);
        compute.dispatchWorkgroups(passGroupsX, passGroupsY);
      }
    }
    compute.end();
    this.device.queue.submit([encoder.finish()]);
    this.tickCount += count;
  }

  /**
   * Paints brush squares — the GPU twin of CpuBackend.paintBrush. Consecutive
   * stamps of the same material share one dispatch; a change of material (or a
   * run longer than MAX_STAMPS) starts a new submit, so where squares of
   * different materials overlap the later one wins, as on the CPU.
   */
  paint(stamps: readonly Stamp[]): void {
    let start = 0;
    while (start < stamps.length) {
      let end = start + 1;
      while (end < stamps.length && end - start < MAX_STAMPS && stamps[end].material === stamps[start].material) {
        end++;
      }
      this.paintRun(stamps.slice(start, end));
      start = end;
    }
  }

  private paintRun(run: readonly Stamp[]): void {
    const data = new Int32Array(run.length * 4);
    let maxSide = 0;
    run.forEach((s, i) => {
      data.set([s.x0, s.y0, s.side, s.material], i * 4);
      maxSide = Math.max(maxSide, s.side);
    });
    this.device.queue.writeBuffer(this.buffers.params, 0, new Uint32Array([this.width, this.height]));
    this.device.queue.writeBuffer(this.buffers.stamps, 0, data);

    const groups = Math.ceil(maxSide / 8);
    const encoder = this.device.createCommandEncoder({ label: "grid.paint" });
    const compute = encoder.beginComputePass({ label: "grid.paint" });
    compute.setPipeline(this.pipelines.paint);
    compute.setBindGroup(0, this.bindGroup, [0]);
    compute.dispatchWorkgroups(groups, groups, run.length);
    compute.end();
    this.device.queue.submit([encoder.finish()]);
  }

  /** Empties every cell (material, timer and flags all 0) — the twin of Grid.clear. */
  clear(): void {
    const encoder = this.device.createCommandEncoder({ label: "grid.clear" });
    encoder.clearBuffer(this.buffers.cells);
    this.device.queue.submit([encoder.finish()]);
  }

  /** Replaces every cell with `material`/`timer` (one entry per cell, row-major as in Grid) — used by Load and the tests. */
  upload(material: Uint8Array, timer: Uint16Array): void {
    const cellCount = this.width * this.height;
    if (material.length !== cellCount || timer.length !== cellCount) {
      throw new RangeError(`upload needs ${cellCount} cells, got material ${material.length} / timer ${timer.length}`);
    }
    const packed = new Uint32Array(cellCount);
    for (let i = 0; i < cellCount; i++) {
      packed[i] = material[i] | (timer[i] << TIMER_SHIFT);
    }
    this.device.queue.writeBuffer(this.buffers.cells, 0, packed);
  }

  /** Copies the cells back to the CPU, unpacked into Grid's layout. Waits on the GPU — for Save and tests, never per frame. */
  async readback(): Promise<{ material: Uint8Array; timer: Uint16Array }> {
    const size = this.width * this.height * 4;
    const staging = this.device.createBuffer({
      label: "grid.readback",
      size,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    const encoder = this.device.createCommandEncoder({ label: "grid.readback" });
    encoder.copyBufferToBuffer(this.buffers.cells, 0, staging, 0, size);
    this.device.queue.submit([encoder.finish()]);

    await staging.mapAsync(GPUMapMode.READ);
    const packed = new Uint32Array(staging.getMappedRange().slice(0));
    staging.unmap();
    staging.destroy();

    const material = new Uint8Array(packed.length);
    const timer = new Uint16Array(packed.length);
    for (let i = 0; i < packed.length; i++) {
      material[i] = packed[i] & MATERIAL_MASK;
      timer[i] = packed[i] >>> TIMER_SHIFT;
    }
    return { material, timer };
  }

  /** Frees the grid's GPU buffers; the grid can't be used afterwards. The device belongs to the caller. */
  destroy(): void {
    this.buffers.cells.destroy();
    this.buffers.params.destroy();
    this.buffers.stamps.destroy();
  }

  static async create(device: GPUDevice, width: number, height: number, seed: number): Promise<GpuGrid> {
    const module = await compileShader(device, "grid", gridShaderSource());
    const buffers = createBuffers(device, width, height);

    const layout = device.createBindGroupLayout({
      label: "grid",
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform", hasDynamicOffset: true } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
      ],
    });
    const bindGroup = device.createBindGroup({
      label: "grid",
      layout,
      entries: [
        { binding: 0, resource: { buffer: buffers.cells } },
        { binding: 1, resource: { buffer: buffers.params, size: SLOT_BYTES } },
        { binding: 2, resource: { buffer: buffers.stamps } },
      ],
    });

    const pipelineLayout = device.createPipelineLayout({ label: "grid", bindGroupLayouts: [layout] });
    const pipeline = (entryPoint: string): GPUComputePipeline =>
      device.createComputePipeline({ label: `grid.${entryPoint}`, layout: pipelineLayout, compute: { module, entryPoint } });

    return new GpuGrid(device, width, height, seed >>> 0, buffers, {
      clearProcessed: pipeline("clearProcessed"),
      stepPass: pipeline("stepPass"),
      paint: pipeline("paint"),
    }, bindGroup);
  }
}
