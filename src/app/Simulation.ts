import { AppState } from "./AppState";
import { createRng, deriveSeed, range, type Rng } from "../core/Rng";
import type { Bounds } from "../particles/collisions";
import { renderParticles } from "../particles/ParticleRenderer";
import { ParticleSystem } from "../particles/ParticleSystem";

const DEFAULT_GRAVITY = 1400; // px/s^2 — tuned for a snappy arcade feel at this canvas scale
const DEFAULT_DRAG_COEF = 0.8; // 1/s — applied to every click-spawned particle

export interface SimulationOptions {
  width: number;
  height: number;
  seed?: number;
  particleCapacity?: number;
  gravity?: number;
}

/** Orchestrator: owns the particle engine (and, from Step 3 on, the material grid) behind a wall-clock-agnostic tick(dt)/render(ctx) pair. */
export class Simulation {
  readonly width: number;
  readonly height: number;
  readonly particles: ParticleSystem;

  private readonly particleRng: Rng;
  private readonly appState = new AppState();
  private readonly bounds: Bounds;
  private readonly gravity: number;
  private paused = false;

  constructor(opts: SimulationOptions) {
    this.width = opts.width;
    this.height = opts.height;
    this.bounds = { width: this.width, height: this.height };
    this.gravity = opts.gravity ?? DEFAULT_GRAVITY;
    const seed = opts.seed ?? 1;
    this.particleRng = createRng(deriveSeed(seed, 1));
    this.particles = new ParticleSystem(opts.particleCapacity ?? 4000);
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
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.clearRect(0, 0, this.width, this.height);
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
