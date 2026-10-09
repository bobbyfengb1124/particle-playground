import type { FireworkColorValue, FireworkPatternValue } from "../../core/types";
import { onDeviceLost, requestGpu } from "../../gpu/GpuContext";
import { brushStamp, GpuGrid, type Stamp } from "../../gpu/GpuGrid";
import { GpuRenderer } from "../../gpu/GpuRenderer";
import type { MaterialIdValue } from "../../grid/materials";
import { REFERENCE_CELL_SIZE, type SceneData } from "../../grid/scene";
import type { WindZone } from "../../wind/WindField";
import type { BackendStats, SimBackend } from "../SimBackend";

export interface GpuBackendOptions {
  width: number; // canvas pixels
  height: number;
  cellSize: number;
  seed: number;
  canvas: HTMLCanvasElement; // the #scene canvas; required, since the GPU backend always renders
  /** Accept a software adapter (SwiftShader). True for an explicit ?backend=gpu; auto-select (17e) passes false. */
  allowFallback: boolean;
}

/**
 * The WebGPU engine: GpuGrid steps the cells and GpuRenderer draws them. In 17b
 * only sand, stone, water and oil have GPU rules — other materials paint but
 * sit inert (17c), and particles, rockets and lighting are no-ops (17d, 17e).
 */
export class GpuBackend implements SimBackend {
  readonly kind = "gpu";
  readonly cellSize: number;
  readonly gridWidth: number;
  readonly gridHeight: number;
  readonly tickScale: number;

  private constructor(
    private readonly device: GPUDevice,
    private readonly grid: GpuGrid,
    private readonly renderer: GpuRenderer,
    cellSize: number,
  ) {
    this.cellSize = cellSize;
    this.gridWidth = grid.width;
    this.gridHeight = grid.height;
    this.tickScale = REFERENCE_CELL_SIZE / cellSize;
  }

  /** Null when no usable WebGPU adapter exists; the caller then falls back to CpuBackend. */
  static async create(opts: GpuBackendOptions): Promise<GpuBackend | null> {
    const gpu = await requestGpu({ allowFallback: opts.allowFallback });
    if (!gpu) return null;
    const gridWidth = Math.max(1, Math.floor(opts.width / opts.cellSize));
    const gridHeight = Math.max(1, Math.floor(opts.height / opts.cellSize));
    const grid = await GpuGrid.create(gpu.device, gridWidth, gridHeight, opts.seed);
    const renderer = await GpuRenderer.create(gpu.device, opts.canvas, grid, opts.cellSize);
    return new GpuBackend(gpu.device, grid, renderer, opts.cellSize);
  }

  /** Calls `cb` if the GPU goes away mid-session (driver reset, GPU process crash). */
  onDeviceLost(cb: (message: string) => void): void {
    onDeviceLost(this.device, cb);
  }

  private pendingStamps: Stamp[] = [];

  /** Queued, not painted yet: a drag makes dozens of stamps per frame, and flushStamps() sends them all in one paint() at the next tick or render. */
  paintBrush(bx: number, by: number, radius: number, material: MaterialIdValue): void {
    this.pendingStamps.push(brushStamp(bx, by, radius, material, this.cellSize));
  }

  /** Stamps queued before a clear would be wiped by it anyway, so they're dropped rather than painted. */
  clearGrid(): void {
    this.pendingStamps = [];
    this.grid.clear();
  }

  /** dt drives particles, which arrive in 17d; globalWind is unused until gas lands in 17c. */
  tick(_dt: number, _globalWind: number): void {
    this.flushStamps();
    this.grid.step(this.tickScale);
  }

  /** Lighting is ignored until 17e. Flushing here too makes painting show up while paused, when tick() doesn't run. */
  renderScene(_lighting: boolean, _frame: number): void {
    this.flushStamps();
    this.renderer.draw();
  }

  private flushStamps(): void {
    if (this.pendingStamps.length === 0) return;
    this.grid.paint(this.pendingStamps);
    this.pendingStamps = [];
  }

  /** 17d: particles and rockets don't exist on the GPU yet. */
  spawnParticlesAt(_x: number, _y: number, _count: number): void {}

  launchRocket(_x: number, _y: number, _speed: number, _pattern: FireworkPatternValue, _color: FireworkColorValue): void {}

  /** 17c: zones only push gas, and the GPU has no gas rules yet. */
  setWindZones(_zones: readonly WindZone[]): void {}

  /** No particles until 17d, and no active-cell tracking at all: the GPU scans every cell each pass. */
  getStats(): BackendStats {
    return { particleCount: 0, activeCellCount: 0 };
  }

  /** Flushes queued stamps first, so a Save straight after painting includes them. Same shape as serializeScene's output. */
  async exportCells(): Promise<SceneData> {
    this.flushStamps();
    const { material, timer } = await this.grid.readback();
    return {
      width: this.gridWidth,
      height: this.gridHeight,
      cellSize: this.cellSize,
      material: Array.from(material),
      timer: Array.from(timer),
      windZones: [],
    };
  }

  /** `scene` is already validated and resampled to this grid by parseScene. Stamps queued before the load are dropped, as in clearGrid. */
  applyScene(scene: SceneData): void {
    this.pendingStamps = [];
    this.grid.upload(Uint8Array.from(scene.material), Uint16Array.from(scene.timer));
  }
}
