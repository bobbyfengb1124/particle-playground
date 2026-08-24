import { AppState } from "./AppState";
import { createRng, deriveSeed, range, type Rng } from "../core/Rng";
import { Grid } from "../grid/Grid";
import { GridRenderer } from "../grid/GridRenderer";
import { GridStepper } from "../grid/GridStepper";
import type { Bounds } from "../particles/collisions";
import { renderParticles } from "../particles/ParticleRenderer";
import { ParticleSystem } from "../particles/ParticleSystem";

const DEFAULT_GRAVITY = 1400; // px/s^2 — tuned for a snappy arcade feel at this canvas scale
const DEFAULT_DRAG_COEF = 0.8; // 1/s — applied to every click-spawned particle
const DEFAULT_CELL_SIZE = 4; // px per grid cell

export interface SimulationOptions {
  width: number;
  height: number;
  seed?: number;
  particleCapacity?: number;
  gravity?: number;
  cellSize?: number;
}

/** Orchestrator: owns the particle engine (and, from Step 3 on, the material grid) behind a wall-clock-agnostic tick(dt)/render(ctx) pair. */
export class Simulation {
  readonly width: number;
  readonly height: number;
  readonly cellSize: number;
  readonly particles: ParticleSystem;
  readonly grid: Grid;

  private readonly particleRng: Rng;
  private readonly gridRng: Rng;
  private readonly gridStepper = new GridStepper();
  private readonly gridRenderer: GridRenderer;
  private readonly appState = new AppState();
  private readonly bounds: Bounds;
  private readonly gravity: number;
  private paused = false;
  // One-line lever for Step 8 (or earlier) to run the CA slower than particle
  // physics; at 1 the grid steps every tick, same as particles.
  private readonly gridTicksPerSimTick = 1;
  private gridTickCounter = 0;

  constructor(opts: SimulationOptions) {
    this.width = opts.width;
    this.height = opts.height;
    this.bounds = { width: this.width, height: this.height };
    this.gravity = opts.gravity ?? DEFAULT_GRAVITY;
    this.cellSize = opts.cellSize ?? DEFAULT_CELL_SIZE;
    const seed = opts.seed ?? 1;
    this.particleRng = createRng(deriveSeed(seed, 1));
    this.gridRng = createRng(deriveSeed(seed, 2));
    this.particles = new ParticleSystem(opts.particleCapacity ?? 4000);
    const gridWidth = Math.max(1, Math.floor(this.width / this.cellSize));
    const gridHeight = Math.max(1, Math.floor(this.height / this.cellSize));
    this.grid = new Grid(gridWidth, gridHeight);
    this.gridRenderer = new GridRenderer(this.grid);
  }

  spawnParticlesAt(x: number, y: number, count = 1): void {
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

  get wind(): number {
    return this.appState.wind;
  }

  setWind(wind: number): void {
    this.appState.wind = wind;
  }

  tick(dt: number): void {
    if (this.paused) return;
    this.particles.update(dt, {
      gravity: this.gravity,
      wind: this.appState.wind,
      bounds: this.bounds,
    });
    this.gridTickCounter++;
    if (this.gridTickCounter % this.gridTicksPerSimTick === 0) {
      this.gridStepper.step(this.grid, this.gridRng);
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.clearRect(0, 0, this.width, this.height);
    this.gridRenderer.render(ctx, this.width, this.height);
    renderParticles(ctx, this.particles);
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  get isPaused(): boolean {
    return this.paused;
  }
}
