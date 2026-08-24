import { createRng, deriveSeed, range, type Rng } from "../core/Rng";
import { renderParticles } from "../particles/ParticleRenderer";
import { ParticleSystem } from "../particles/ParticleSystem";

export interface SimulationOptions {
  width: number;
  height: number;
  seed?: number;
  particleCapacity?: number;
}

/** Orchestrator: owns the particle engine (and, from Step 3 on, the material grid) behind a wall-clock-agnostic tick(dt)/render(ctx) pair. */
export class Simulation {
  readonly width: number;
  readonly height: number;
  readonly particles: ParticleSystem;

  private readonly particleRng: Rng;
  private paused = false;

  constructor(opts: SimulationOptions) {
    this.width = opts.width;
    this.height = opts.height;
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
        lifespan: range(this.particleRng, 0.8, 1.6),
      });
    }
  }

  tick(dt: number): void {
    if (this.paused) return;
    this.particles.update(dt);
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
