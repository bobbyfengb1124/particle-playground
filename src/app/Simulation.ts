import { AppState, type InteractionMode } from "./AppState";
import { createRng, deriveSeed, range, type Rng } from "../core/Rng";
import { ParticleKind, type FireworkPatternValue } from "../core/types";
import { Grid } from "../grid/Grid";
import { GridRenderer } from "../grid/GridRenderer";
import { GridStepper } from "../grid/GridStepper";
import { Material, MATERIALS, type MaterialIdValue } from "../grid/materials";
import type { Bounds } from "../particles/collisions";
import { launchRocket, updateFireworkBehaviors } from "../particles/fireworks";
import type { Particle } from "../particles/Particle";
import { renderParticles } from "../particles/ParticleRenderer";
import { ParticleSystem } from "../particles/ParticleSystem";

const DEFAULT_GRAVITY = 1400; // px/s^2 — tuned for a snappy arcade feel at this canvas scale
const DEFAULT_DRAG_COEF = 0.8; // 1/s — applied to every click-spawned particle
const DEFAULT_CELL_SIZE = 4; // px per grid cell

// A rocket always launches straight up; only how far the user dragged before
// releasing matters, mapped onto this fraction-of-canvas-height range so it
// scales with any Simulation size rather than a fixed pixel count.
const MIN_LAUNCH_HEIGHT_FRACTION = 0.15;
const MAX_LAUNCH_HEIGHT_FRACTION = 0.9;
const FULL_POWER_DRAG_FRACTION = 0.5; // dragging this fraction of the canvas height reaches max power

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

  get selectedMaterial(): MaterialIdValue {
    return this.appState.selectedMaterial;
  }

  setSelectedMaterial(material: MaterialIdValue): void {
    this.appState.selectedMaterial = material;
  }

  get brushSize(): number {
    return this.appState.brushSize;
  }

  setBrushSize(size: number): void {
    this.appState.brushSize = Math.max(0, Math.floor(size));
  }

  /** Paints (or erases, if the selected material is EMPTY) a square brush centered on a canvas pixel position. */
  paintAt(x: number, y: number): void {
    const gx = Math.floor(x / this.cellSize);
    const gy = Math.floor(y / this.cellSize);
    const material = this.appState.selectedMaterial;
    this.grid.forEachInSquare(gx, gy, this.appState.brushSize, (cx, cy) => this.grid.setMaterial(cx, cy, material));
  }

  /**
   * Paints along the segment between two canvas pixel positions, at sub-cell
   * steps — otherwise a fast drag would leave gaps between one pointermove
   * event's brush stamp and the next.
   */
  paintStroke(x0: number, y0: number, x1: number, y1: number): void {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(dist / (this.cellSize / 2)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.paintAt(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
    }
  }

  clearGrid(): void {
    this.grid.clear();
  }

  get mode(): InteractionMode {
    return this.appState.mode;
  }

  setMode(mode: InteractionMode): void {
    this.appState.mode = mode;
  }

  get fireworkPattern(): FireworkPatternValue {
    return this.appState.fireworkPattern;
  }

  setFireworkPattern(pattern: FireworkPatternValue): void {
    this.appState.fireworkPattern = pattern;
  }

  /**
   * Launches a rocket straight up from (x0, y0); the drag distance to
   * (x1, y1) sets how high it flies before bursting — direction is ignored,
   * only distance matters, clamped at FULL_POWER_DRAG_FRACTION of the canvas
   * height so a click with no drag still fires a low burst.
   */
  launchFromDrag(x0: number, y0: number, x1: number, y1: number): void {
    const dragDistance = Math.hypot(x1 - x0, y1 - y0);
    const power = Math.min(1, dragDistance / (this.height * FULL_POWER_DRAG_FRACTION));
    const targetHeight = this.height * (MIN_LAUNCH_HEIGHT_FRACTION + power * (MAX_LAUNCH_HEIGHT_FRACTION - MIN_LAUNCH_HEIGHT_FRACTION));
    const speed = Math.sqrt(2 * this.gravity * targetHeight);
    launchRocket(this.particles, x0, y0, speed, this.appState.fireworkPattern);
  }

  tick(dt: number): void {
    if (this.paused) return;
    this.particles.update(dt, {
      gravity: this.gravity,
      wind: this.appState.wind,
      bounds: this.bounds,
    });
    updateFireworkBehaviors(this.particles, dt, this.particleRng);
    this.igniteEmbersOnLanding();
    this.gridTickCounter++;
    if (this.gridTickCounter % this.gridTicksPerSimTick === 0) {
      this.gridStepper.step(this.grid, this.gridRng);
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
