import { Material, MATERIALS } from "../grid/materials";
import { compileShader } from "./GpuContext";
import type { GpuGrid } from "./GpuGrid";
import type { GpuLighting } from "./GpuLighting";
import type { GpuParticles } from "./GpuParticles";
import type { GpuTimer } from "./GpuTimer";
import { buildPrelude } from "./shaders/prelude";
import particleDrawWgsl from "./shaders/particleDraw.wgsl?raw";
import particleTypesWgsl from "./shaders/particleTypes.wgsl?raw";
import renderWgsl from "./shaders/render.wgsl?raw";

/** MATERIALS[].color as RGBA in 0..1, one vec4 per material id. EMPTY stays (0, 0, 0, 0) so #scene's black background shows through, as with GridRenderer. */
export function paletteData(): Float32Array<ArrayBuffer> {
  const data = new Float32Array(MATERIALS.length * 4);
  MATERIALS.forEach((info, id) => {
    if (id === Material.EMPTY) return;
    data.set([info.color[0] / 255, info.color[1] / 255, info.color[2] / 255, 1], id * 4);
  });
  return data;
}

/** Particles over the cells: one 6-corner square per slot. Colours arrive premultiplied, so blending is "one, one − src alpha". */
async function createParticleDraw(device: GPUDevice, format: GPUTextureFormat, canvas: HTMLCanvasElement, particles: GpuParticles) {
  const module = await compileShader(device, "particleDraw", [buildPrelude(), particleTypesWgsl, particleDrawWgsl].join("\n"));
  const over: GPUBlendComponent = { srcFactor: "one", dstFactor: "one-minus-src-alpha" };
  const pipeline = device.createRenderPipeline({
    label: "particleDraw",
    layout: "auto",
    vertex: { module, entryPoint: "vs" },
    fragment: { module, entryPoint: "fs", targets: [{ format, blend: { color: over, alpha: over } }] },
    primitive: { topology: "triangle-list" },
  });
  const params = device.createBuffer({
    label: "particleDraw.params",
    size: 8,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(params, 0, new Float32Array([canvas.width, canvas.height]));
  const bindGroup = device.createBindGroup({
    label: "particleDraw",
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: particles.stateBuffer } },
      { binding: 1, resource: { buffer: params } },
    ],
  });
  return { pipeline, bindGroup, capacity: particles.capacity };
}

/** Draws a GpuGrid's cells onto a canvas with WebGPU — the GPU twin of GridRenderer, lit from a GpuLighting map. */
export class GpuRenderer {
  private constructor(
    private readonly device: GPUDevice,
    private readonly context: GPUCanvasContext,
    private readonly pipeline: GPURenderPipeline,
    private readonly bindGroup: GPUBindGroup,
    private readonly params: GPUBuffer,
    private readonly particleDraw: Awaited<ReturnType<typeof createParticleDraw>> | undefined,
    private readonly hasLighting: boolean,
    private readonly timer: GpuTimer | undefined,
  ) {}

  /** `particles` and `lighting` are optional so the cell-only render test can skip them; GpuBackend always passes both. */
  static async create(
    device: GPUDevice,
    canvas: HTMLCanvasElement,
    grid: GpuGrid,
    cellSize: number,
    particles?: GpuParticles,
    lighting?: GpuLighting,
    timer?: GpuTimer, // times the render pass as "draw"
  ): Promise<GpuRenderer> {
    const context = canvas.getContext("webgpu");
    if (!context) throw new Error("WebGPU canvas context unavailable");
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: "premultiplied" });

    const module = await compileShader(device, "render", [buildPrelude(), renderWgsl].join("\n"));
    const pipeline = device.createRenderPipeline({
      label: "render",
      layout: "auto",
      vertex: { module, entryPoint: "vs" },
      fragment: { module, entryPoint: "fs", targets: [{ format }] },
      primitive: { topology: "triangle-list" },
    });

    const params = device.createBuffer({
      label: "render.params",
      size: 32, // 6 u32s in RenderParams, rounded up to a multiple of 16
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(
      params,
      0,
      new Uint32Array([grid.width, grid.height, cellSize, 0, lighting?.width ?? 1, lighting?.height ?? 1]),
    );
    // Without a GpuLighting, `lit` stays 0 and this one black light cell is never read, but binding 3 still needs a buffer.
    const lightBuffer =
      lighting?.lightBuffer ?? device.createBuffer({ label: "render.noLight", size: 12, usage: GPUBufferUsage.STORAGE });

    const palette = paletteData();
    const paletteBuffer = device.createBuffer({
      label: "render.palette",
      size: palette.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(paletteBuffer, 0, palette);

    const bindGroup = device.createBindGroup({
      label: "render",
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: grid.cells } },
        { binding: 1, resource: { buffer: params } },
        { binding: 2, resource: { buffer: paletteBuffer } },
        { binding: 3, resource: { buffer: lightBuffer } },
      ],
    });
    const particleDraw = particles && (await createParticleDraw(device, format, canvas, particles));
    return new GpuRenderer(device, context, pipeline, bindGroup, params, particleDraw, lighting !== undefined, timer);
  }

  /**
   * Draws the grid's current cells, lit when `lit` and a GpuLighting was given. It's queued after any
   * step/paint/light build already submitted, so it shows their result.
   */
  draw(lit = false): void {
    this.device.queue.writeBuffer(this.params, 12, new Uint32Array([lit && this.hasLighting ? 1 : 0]));
    const encoder = this.device.createCommandEncoder({ label: "render" });
    const pass = encoder.beginRenderPass({
      label: "render",
      timestampWrites: this.timer?.writes("draw"),
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          clearValue: [0, 0, 0, 0],
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(3);
    if (this.particleDraw) {
      pass.setPipeline(this.particleDraw.pipeline);
      pass.setBindGroup(0, this.particleDraw.bindGroup);
      pass.draw(6, this.particleDraw.capacity); // 6 corners × one square per slot
    }
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }
}
