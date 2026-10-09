import { Material, MATERIALS } from "../grid/materials";
import { compileShader } from "./GpuContext";
import type { GpuGrid } from "./GpuGrid";
import { buildPrelude } from "./shaders/prelude";
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

/** Draws a GpuGrid's cells onto a canvas with WebGPU — the GPU twin of GridRenderer (no lighting until 17e). */
export class GpuRenderer {
  private constructor(
    private readonly device: GPUDevice,
    private readonly context: GPUCanvasContext,
    private readonly pipeline: GPURenderPipeline,
    private readonly bindGroup: GPUBindGroup,
  ) {}

  static async create(device: GPUDevice, canvas: HTMLCanvasElement, grid: GpuGrid, cellSize: number): Promise<GpuRenderer> {
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
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(params, 0, new Uint32Array([grid.width, grid.height, cellSize, 0]));

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
      ],
    });
    return new GpuRenderer(device, context, pipeline, bindGroup);
  }

  /** Draws the grid's current cells. It's queued after any step/paint already submitted, so it shows their result. */
  draw(): void {
    const encoder = this.device.createCommandEncoder({ label: "render" });
    const pass = encoder.beginRenderPass({
      label: "render",
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
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }
}
