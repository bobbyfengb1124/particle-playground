import { ObjectPool } from "../core/ObjectPool";
import { Particle } from "./Particle";

export interface ParticleInit {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  radius?: number;
  colorR?: number;
  colorG?: number;
  colorB?: number;
  lifespan?: number;
  dragCoef?: number;
  restitution?: number;
  kind?: number;
  behavior?: number;
}

export class ParticleSystem {
  private readonly pool: ObjectPool<Particle>;

  constructor(capacity: number) {
    this.pool = new ObjectPool<Particle>(capacity, () => new Particle());
  }

  get capacity(): number {
    return this.pool.capacity;
  }

  get activeCount(): number {
    return this.pool.size;
  }

  /** Returns null if the pool is at capacity — spawns are refused, never evicted. */
  spawn(init: ParticleInit): Particle | null {
    const p = this.pool.acquire();
    if (!p) return null;
    p.reset();
    p.x = init.x;
    p.y = init.y;
    p.vx = init.vx ?? 0;
    p.vy = init.vy ?? 0;
    if (init.radius !== undefined) p.radius = init.radius;
    if (init.colorR !== undefined) p.colorR = init.colorR;
    if (init.colorG !== undefined) p.colorG = init.colorG;
    if (init.colorB !== undefined) p.colorB = init.colorB;
    if (init.lifespan !== undefined) p.lifespan = init.lifespan;
    if (init.dragCoef !== undefined) p.dragCoef = init.dragCoef;
    if (init.restitution !== undefined) p.restitution = init.restitution;
    if (init.kind !== undefined) p.kind = init.kind;
    if (init.behavior !== undefined) p.behavior = init.behavior;
    return p;
  }

  update(dt: number): void {
    this.pool.forEachActive((p) => {
      p.vx += p.ax * dt;
      p.vy += p.ay * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.age += dt;
    });
    this.pool.releaseIf((p) => p.age >= p.lifespan);
  }

  forEachActive(fn: (p: Particle) => void): void {
    this.pool.forEachActive(fn);
  }
}
