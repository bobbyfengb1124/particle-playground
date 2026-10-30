import { REFERENCE_CELL_SIZE } from "../grid/scene";
import { BLUR_PASSES } from "../lighting/LightMap";
import { compileShader } from "./GpuContext";
import type { GpuGrid } from "./GpuGrid";
import type { GpuParticles } from "./GpuParticles";
import type { GpuTimer } from "./GpuTimer";
import lightingWgsl from "./shaders/lighting.wgsl?raw";
import particleTypesWgsl from "./shaders/particleTypes.wgsl?raw";
import { buildPrelude } from "./shaders/prelude";

/** 6 u32s in LightParams (lighting.wgsl), rounded up to a multiple of 16 as uniforms require. */
const PARAMS_BYTES = 32;

/** GPU twin of LightMap: builds the fixed 4 px light map from GpuGrid's cells and GpuParticles' slots, via lighting.wgsl. */
export class GpuLighting {
  private constructor(
    private readonly device: GPUDevice,
    readonly width: number, // light cells across: canvas px / 4
    readonly height: number,
    private readonly gridWidth: number,
    private readonly cellRatio: number, // fine cells per light-cell side
    private readonly particleCount: number,
    private readonly buffers: ReturnType<typeof createBuffers>,
    private readonly pipelines: Record<"fire" | "splat" | "resolve" | "blurH" | "blurV", GPUComputePipeline>,
    private readonly bindGroup: GPUBindGroup,
    private readonly timer: GpuTimer | undefined,
  ) {}

  static async create(
    device: GPUDevice,
    grid: GpuGrid,
    particles: GpuParticles,
    canvasWidth: number,
    canvasHeight: number,
    cellSize: number,
    timer?: GpuTimer, // times the build as "draw"
  ): Promise<GpuLighting> {
    const module = await compileShader(device, "lighting", [buildPrelude(), particleTypesWgsl, lightingWgsl].join("\n"));
    const width = Math.floor(canvasWidth / REFERENCE_CELL_SIZE);
    const height = Math.floor(canvasHeight / REFERENCE_CELL_SIZE);
    const buffers = createBuffers(device, width * height * 3);

    // One explicit layout: every pass shares this bind group, and "auto" would keep only the bindings each entry point uses.
    const entry = (binding: number, type: GPUBufferBindingType): GPUBindGroupLayoutEntry => ({
      binding,
      visibility: GPUShaderStage.COMPUTE,
      buffer: { type },
    });
    const layout = device.createBindGroupLayout({
      label: "lighting",
      entries: [
        entry(0, "uniform"),
        entry(1, "read-only-storage"),
        entry(2, "read-only-storage"),
        entry(3, "storage"),
        entry(4, "storage"),
        entry(5, "storage"),
      ],
    });
    const bindGroup = device.createBindGroup({
      label: "lighting",
      layout,
      entries: [
        { binding: 0, resource: { buffer: buffers.params } },
        { binding: 1, resource: { buffer: grid.cells } },
        { binding: 2, resource: { buffer: particles.stateBuffer } },
        { binding: 3, resource: { buffer: buffers.accum } },
        { binding: 4, resource: { buffer: buffers.light } },
        { binding: 5, resource: { buffer: buffers.scratch } },
      ],
    });
    const pipelineLayout = device.createPipelineLayout({ label: "lighting", bindGroupLayouts: [layout] });
    const pipeline = (entryPoint: string): GPUComputePipeline =>
      device.createComputePipeline({ label: `lighting.${entryPoint}`, layout: pipelineLayout, compute: { module, entryPoint } });

    return new GpuLighting(
      device,
      width,
      height,
      grid.width,
      REFERENCE_CELL_SIZE / cellSize,
      particles.capacity,
      buffers,
      { fire: pipeline("fire"), splat: pipeline("splat"), resolve: pipeline("resolve"), blurH: pipeline("blurH"), blurV: pipeline("blurV") },
      bindGroup,
      timer,
    );
  }

  /**
   * Rebuilds the map for this frame: fire → splat → resolve → (blurH → blurV) × BLUR_PASSES, in one
   * compute pass, where each dispatch sees the previous one's writes. Submitted on its own, before
   * GpuRenderer.draw, so queue order makes the draw see the result.
   */
  build(frame: number): void {
    const { device, width, height } = this;
    device.queue.writeBuffer(
      this.buffers.params,
      0,
      new Uint32Array([width, height, this.gridWidth, this.cellRatio, frame, this.particleCount]),
    );
    const tilesX = Math.ceil(width / 8);
    const tilesY = Math.ceil(height / 8);

    const encoder = device.createCommandEncoder({ label: "lighting" });
    const pass = encoder.beginComputePass({ label: "lighting", timestampWrites: this.timer?.writes("draw") });
    pass.setBindGroup(0, this.bindGroup);
    pass.setPipeline(this.pipelines.fire);
    pass.dispatchWorkgroups(tilesX, tilesY);
    pass.setPipeline(this.pipelines.splat);
    pass.dispatchWorkgroups(Math.ceil(this.particleCount / 64));
    pass.setPipeline(this.pipelines.resolve);
    pass.dispatchWorkgroups(Math.ceil((width * height * 3) / 64));
    for (let i = 0; i < BLUR_PASSES; i++) {
      pass.setPipeline(this.pipelines.blurH);
      pass.dispatchWorkgroups(tilesX, tilesY);
      pass.setPipeline(this.pipelines.blurV);
      pass.dispatchWorkgroups(tilesX, tilesY);
    }
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  /** The finished map, r, g, b per light cell, for GpuRenderer. */
  get lightBuffer(): GPUBuffer {
    return this.buffers.light;
  }

  /** Copies the light map back to the CPU (the GpuGrid.readback recipe). Waits on the GPU: tests only, never per frame. */
  async readback(): Promise<Float32Array> {
    const src = this.buffers.light;
    const staging = this.device.createBuffer({
      label: "lighting.readback",
      size: src.size,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    const encoder = this.device.createCommandEncoder({ label: "lighting.readback" });
    encoder.copyBufferToBuffer(src, 0, staging, 0, src.size);
    this.device.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const data = new Float32Array(staging.getMappedRange().slice(0));
    staging.unmap();
    staging.destroy();
    return data;
  }

  /** Frees the lighting buffers; cells and particle slots belong to GpuGrid and GpuParticles. */
  destroy(): void {
    for (const b of Object.values(this.buffers)) b.destroy();
  }
}

function createBuffers(device: GPUDevice, values: number) {
  const buffer = (label: string, size: number, usage: number): GPUBuffer =>
    device.createBuffer({ label: `lighting.${label}`, size, usage });
  const { STORAGE, COPY_DST, COPY_SRC, UNIFORM } = GPUBufferUsage;
  return {
    params: buffer("params", PARAMS_BYTES, UNIFORM | COPY_DST),
    accum: buffer("accum", values * 4, STORAGE),
    light: buffer("light", values * 4, STORAGE | COPY_SRC), // COPY_SRC: test readback
    scratch: buffer("scratch", values * 4, STORAGE),
  };
}
