import { shadeCell, type LightMap } from "../lighting/LightMap";
import type { Grid } from "./Grid";
import { Material, MATERIALS } from "./materials";

/**
 * Blits the grid via a single ImageData → offscreen-canvas → scaled drawImage,
 * never per-cell fillRect (tens of thousands of draw calls at "a few hundred
 * cells wide" otherwise). The offscreen canvas is created lazily on first
 * render() so constructing a GridRenderer never touches the DOM — that keeps
 * Simulation constructible in Node-environment tests that never call render().
 */
export class GridRenderer {
  private offscreen: HTMLCanvasElement | null = null;
  private offscreenCtx: CanvasRenderingContext2D | null = null;
  private imageData: ImageData | null = null;

  constructor(private readonly grid: Grid) {}

  /** With a `light` map, every pixel goes through shadeCell (tinted material, halo on empty cells); without one, output is the plain material colours. */
  render(ctx: CanvasRenderingContext2D, destWidth: number, destHeight: number, light?: LightMap): void {
    if (!this.offscreenCtx || !this.imageData) {
      this.offscreen = document.createElement("canvas");
      this.offscreen.width = this.grid.width;
      this.offscreen.height = this.grid.height;
      const offCtx = this.offscreen.getContext("2d");
      if (!offCtx) throw new Error("2d context unavailable for grid offscreen canvas");
      this.offscreenCtx = offCtx;
      this.imageData = offCtx.createImageData(this.grid.width, this.grid.height);
    }

    const { material } = this.grid;
    const data = this.imageData.data;
    if (light) {
      const { r, g, b } = light;
      for (let i = 0; i < material.length; i++) {
        shadeCell(data, i * 4, MATERIALS[material[i]].color, r[i], g[i], b[i], material[i] === Material.EMPTY);
      }
    } else {
      for (let i = 0; i < material.length; i++) {
        const info = MATERIALS[material[i]];
        const o = i * 4;
        data[o] = info.color[0];
        data[o + 1] = info.color[1];
        data[o + 2] = info.color[2];
        data[o + 3] = material[i] === Material.EMPTY ? 0 : 255;
      }
    }
    this.offscreenCtx.putImageData(this.imageData, 0, 0);

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.offscreen as HTMLCanvasElement, 0, 0, this.grid.width, this.grid.height, 0, 0, destWidth, destHeight);
  }
}
