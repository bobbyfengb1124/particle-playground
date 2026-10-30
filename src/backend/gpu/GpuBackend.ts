import { deriveSeed } from "../../core/Rng";
import { type FireworkColorValue, type FireworkPatternValue, ParticleKind } from "../../core/types";
import { onDeviceLost, requestGpu } from "../../gpu/GpuContext";
import { brushStamp, GpuGrid, type Stamp } from "../../gpu/GpuGrid";
import { GpuLighting } from "../../gpu/GpuLighting";
import { GpuParticles, packFlags } from "../../gpu/GpuParticles";
import { GpuRenderer } from "../../gpu/GpuRenderer";
import { GpuTimer } from "../../gpu/GpuTimer";
import type { MaterialIdValue } from "../../grid/materials";
import { REFERENCE_CELL_SIZE, type SceneData } from "../../grid/scene";
import { WindField, type WindZone } from "../../wind/WindField";
import type { BackendStats, SimBackend } from "../SimBackend";

/** Particle slots on the GPU (Q13): 2^18, enough for dense firework bursts. */
const GPU_PARTICLE_CAPACITY = 262_144;

export interface GpuBackendOptions {
  width: number; // canvas pixels
  height: number;
  cellSize: number;
  seed: number;
  canvas: HTMLCanvasElement; // the #scene canvas; required, since the GPU backend always renders
  /** Accept a software adapter (SwiftShader). True for an explicit ?backend=gpu; auto-select (17e) passes false. */
  allowFallback: boolean;
  gravity: number; // px/s², passed to GpuParticles
}

/**
 * The WebGPU engine: GpuGrid steps the cells, GpuParticles steps particles and fireworks,
 * GpuLighting builds the light map and GpuRenderer draws cells and particles. Every grid
 * material has a GPU rule, and gas follows wind zones and the wind slider.
 */
export class GpuBackend implements SimBackend {
  readonly kind = "gpu";
  readonly cellSize: number;
  readonly gridWidth: number;
  readonly gridHeight: number;
  readonly tickScale: number;
  private readonly windField: WindField;

  private constructor(
    private readonly device: GPUDevice,
    private readonly grid: GpuGrid,
    private readonly particles: GpuParticles,
    private readonly lighting: GpuLighting,
    private readonly renderer: GpuRenderer,
    private readonly timer: GpuTimer | null, // null without timestamp-query
    cellSize: number,
  ) {
    this.cellSize = cellSize;
    this.gridWidth = grid.width;
    this.gridHeight = grid.height;
    this.tickScale = REFERENCE_CELL_SIZE / cellSize;
    this.windField = new WindField(grid.width, grid.height, cellSize);
  }

  /** Null when no usable WebGPU adapter exists; the caller then falls back to CpuBackend. */
  static async create(opts: GpuBackendOptions): Promise<GpuBackend | null> {
    const gpu = await requestGpu({ allowFallback: opts.allowFallback });
    if (!gpu) return null;
    const gridWidth = Math.max(1, Math.floor(opts.width / opts.cellSize));
    const gridHeight = Math.max(1, Math.floor(opts.height / opts.cellSize));
    const timer = GpuTimer.create(gpu.device);
    const timed = timer ?? undefined;
    const grid = await GpuGrid.create(gpu.device, gridWidth, gridHeight, opts.seed, REFERENCE_CELL_SIZE / opts.cellSize, timed);
    const particles = await GpuParticles.create(gpu.device, grid, {
      capacity: GPU_PARTICLE_CAPACITY,
      seed: deriveSeed(opts.seed, 1),
      cellSize: opts.cellSize,
      width: opts.width,
      height: opts.height,
      gravity: opts.gravity,
      timer: timed,
    });
    const lighting = await GpuLighting.create(gpu.device, grid, particles, opts.width, opts.height, opts.cellSize, timed);
    const renderer = await GpuRenderer.create(gpu.device, opts.canvas, grid, opts.cellSize, particles, lighting, timed);
    return new GpuBackend(gpu.device, grid, particles, lighting, renderer, timer, opts.cellSize);
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

  /** CPU order: stamps, then particles (reading last tick's grid), then the grid. globalWind is the wind slider. */
  tick(dt: number, globalWind: number): void {
    this.flushStamps();
    this.particles.tick(dt, globalWind);
    this.grid.step(this.tickScale, globalWind);
  }

  /** Lighting off skips the light passes entirely. Flushing here too makes painting show up while paused, when tick() doesn't run. */
  renderScene(lighting: boolean, frame: number): void {
    this.flushStamps();
    if (lighting) this.lighting.build(frame);
    this.renderer.draw(lighting);
    this.timer?.endFrame(); // a frame is everything since the last render: its ticks, paints, light build and draw
  }

  private flushStamps(): void {
    if (this.pendingStamps.length === 0) return;
    this.grid.paint(this.pendingStamps);
    this.pendingStamps = [];
  }

  /** One GENERIC request (flags 0, no inherited velocity); the shader's spawnGeneric rolls each particle like CpuBackend does. */
  spawnParticlesAt(x: number, y: number, count: number): void {
    this.particles.request({ x, y, vx: 0, vy: 0, flags: 0, count });
  }

  /** One ROCKET request, straight up like CPU launchRocket. Density travels as log2 in the flags (Q11), so 16× is stored as 4. */
  launchRocket(x: number, y: number, speed: number, pattern: FireworkPatternValue, color: FireworkColorValue, density: number): void {
    const flags = packFlags(ParticleKind.ROCKET, pattern, color, Math.log2(density));
    this.particles.request({ x, y, vx: 0, vy: -speed, flags, count: 1 });
  }

  /** Rebuilds the per-cell zone wind and uploads it; only called when zones change (draw, Clear Zones, Load). */
  setWindZones(zones: readonly WindZone[]): void {
    this.windField.rebuild(zones);
    this.grid.setZoneWind(this.windField.values);
  }

  /**
   * Both counts are up to 15 ticks stale (periodic readbacks). activeCellCount is non-empty cells: the GPU
   * scans every cell, so it has no active set. Each call starts a new GPU ms averaging window.
   */
  getStats(): BackendStats {
    return {
      particleCount: this.particles.aliveCount,
      activeCellCount: this.grid.nonEmptyCount,
      gpuMs: this.timer ? this.timer.takeMs() : null,
    };
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
