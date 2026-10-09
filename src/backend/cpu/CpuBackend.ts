import { createRng, deriveSeed, range, type Rng } from "../../core/Rng";
import { ParticleKind, type FireworkColorValue, type FireworkPatternValue } from "../../core/types";
import { Grid } from "../../grid/Grid";
import { GridRenderer } from "../../grid/GridRenderer";
import { GridStepper } from "../../grid/GridStepper";
import { Material, MATERIALS, type MaterialIdValue } from "../../grid/materials";
import { applyScene, REFERENCE_CELL_SIZE, serializeScene, type SceneData } from "../../grid/scene";
import { LightMap } from "../../lighting/LightMap";
import type { Bounds } from "../../particles/collisions";
import { launchRocket, updateFireworkBehaviors } from "../../particles/fireworks";
import type { Particle } from "../../particles/Particle";
import { renderParticles } from "../../particles/ParticleRenderer";
import { ParticleSystem } from "../../particles/ParticleSystem";
import { WindField, type WindZone } from "../../wind/WindField";
import type { BackendStats, SimBackend } from "../SimBackend";

const DEFAULT_DRAG_COEF = 0.8; // 1/s — applied to every click-spawned particle

export interface CpuBackendOptions {
  width: number; // canvas pixels
  height: number;
  cellSize: number;
  seed: number;
  particleCapacity: number;
  gravity: number;
  canvas?: HTMLCanvasElement; // the #scene canvas; optional so headless tests can skip rendering
}

/** The reference engine: the sequential GridStepper, the pooled ParticleSystem, and Canvas 2D rendering. */
export class CpuBackend implements SimBackend {
  readonly kind = "cpu";
  readonly cellSize: number;
  readonly gridWidth: number;
  readonly gridHeight: number;
  readonly tickScale: number;
  readonly grid: Grid; // public so tests can still poke cells
  readonly particles: ParticleSystem; // ditto

  private readonly width: number;
  private readonly height: number;
  private readonly gravity: number;
  private readonly bounds: Bounds;
  private readonly particleRng: Rng;
  private readonly gridRng: Rng;
  private readonly gridStepper = new GridStepper();
  private readonly gridRenderer: GridRenderer;
  private readonly windField: WindField;
  private readonly lightMap: LightMap;
  private readonly canvas: HTMLCanvasElement | undefined;
  private ctx: CanvasRenderingContext2D | null = null;

  constructor(opts: CpuBackendOptions) {
    this.width = opts.width;
    this.height = opts.height;
    this.bounds = { width: this.width, height: this.height };
    this.gravity = opts.gravity;
    this.cellSize = opts.cellSize;
    this.tickScale = REFERENCE_CELL_SIZE / this.cellSize;
    this.particleRng = createRng(deriveSeed(opts.seed, 1));
    this.gridRng = createRng(deriveSeed(opts.seed, 2));
    this.particles = new ParticleSystem(opts.particleCapacity);
    this.gridWidth = Math.max(1, Math.floor(this.width / this.cellSize));
    this.gridHeight = Math.max(1, Math.floor(this.height / this.cellSize));
    this.grid = new Grid(this.gridWidth, this.gridHeight);
    this.gridRenderer = new GridRenderer(this.grid);
    this.windField = new WindField(this.gridWidth, this.gridHeight, this.cellSize);
    this.lightMap = new LightMap(this.gridWidth, this.gridHeight);
    this.canvas = opts.canvas;
  }

  tick(dt: number, globalWind: number): void {
    this.particles.update(dt, {
      gravity: this.gravity,
      wind: globalWind,
      windField: this.windField,
      bounds: this.bounds,
    });
    updateFireworkBehaviors(this.particles, dt, this.particleRng);
    this.igniteEmbersOnLanding();
    for (let i = 0; i < this.tickScale; i++) {
      this.gridStepper.step(this.grid, this.gridRng, this.windField.values, globalWind, this.tickScale);
    }
  }

  /** A falling ember that reaches a non-empty grid cell is consumed — igniting the cell if it's flammable, just settling into it otherwise. */
  private igniteEmbersOnLanding(): void {
    const landed: Particle[] = [];
    this.particles.forEachActive((p) => {
      if (p.kind !== ParticleKind.EMBER) return;
      const gx = Math.floor(p.x / this.cellSize);
      const gy = Math.floor(p.y / this.cellSize);
      if (!this.grid.inBounds(gx, gy)) return;
      const cellId = this.grid.get(gx, gy);
      if (cellId === Material.EMPTY) return;
      if (MATERIALS[cellId].flammable) this.grid.transformMaterial(gx, gy, Material.FIRE, 0);
      landed.push(p);
    });
    for (const p of landed) this.particles.release(p);
  }

  paintBrush(bx: number, by: number, radius: number, material: MaterialIdValue): void {
    const r = REFERENCE_CELL_SIZE / this.cellSize;
    for (let gy = (by - radius) * r; gy < (by + radius + 1) * r; gy++) {
      for (let gx = (bx - radius) * r; gx < (bx + radius + 1) * r; gx++) {
        if (this.grid.inBounds(gx, gy)) this.grid.setMaterial(gx, gy, material);
      }
    }
  }

  clearGrid(): void {
    this.grid.clear();
  }

  spawnParticlesAt(x: number, y: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const angle = range(this.particleRng, 0, Math.PI * 2);
      const speed = range(this.particleRng, 10, 60);
      this.particles.spawn({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: range(this.particleRng, 1.5, 3.5),
        lifespan: range(this.particleRng, 1, 2),
        dragCoef: DEFAULT_DRAG_COEF,
      });
    }
  }

  launchRocket(x: number, y: number, speed: number, pattern: FireworkPatternValue, color: FireworkColorValue): void {
    launchRocket(this.particles, x, y, speed, pattern, color);
  }

  setWindZones(zones: readonly WindZone[]): void {
    this.windField.rebuild(zones);
  }

  renderScene(lighting: boolean, frame: number): void {
    const ctx = this.sceneContext();
    ctx.clearRect(0, 0, this.width, this.height);
    if (lighting) {
      this.lightMap.build(this.grid, this.particles, this.cellSize, frame);
      this.gridRenderer.render(ctx, this.width, this.height, this.lightMap);
    } else {
      this.gridRenderer.render(ctx, this.width, this.height);
    }
    renderParticles(ctx, this.particles);
  }

  /** Created on first render rather than in the constructor, so Node tests that never render need no canvas. */
  private sceneContext(): CanvasRenderingContext2D {
    if (this.ctx) return this.ctx;
    if (!this.canvas) throw new Error("CpuBackend was built without a canvas, so it can't render");
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    this.ctx = ctx;
    return ctx;
  }

  getStats(): BackendStats {
    return { particleCount: this.particles.activeCount, activeCellCount: this.grid.activeCount };
  }

  exportCells(): Promise<SceneData> {
    return Promise.resolve(serializeScene(this.grid, [], this.cellSize));
  }

  applyScene(scene: SceneData): void {
    applyScene(this.grid, scene);
  }
}
