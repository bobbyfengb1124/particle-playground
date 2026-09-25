import { ObjectPool } from "../core/ObjectPool";
import type { Bounds } from "./collisions";
import { applyBoundsCollision } from "./collisions";
import { applyDrag, applyGravity, applyWind, applyZoneWind } from "./forces";
import { Particle } from "./Particle";
import type { WindField } from "../wind/WindField";

export interface ParticleEnvironment {
  gravity: number;
  wind: number;
  /** Per-cell zone wind; omitted means no zones. */
  windField?: WindField;
  bounds: Bounds;
}

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
  gravityScale?: number;
  kind?: number;
  behavior?: number;
  behaviorTimer?: number;
  behaviorFlag?: number;
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
    if (init.gravityScale !== undefined) p.gravityScale = init.gravityScale;
    if (init.kind !== undefined) p.kind = init.kind;
    if (init.behavior !== undefined) p.behavior = init.behavior;
    if (init.behaviorTimer !== undefined) p.behaviorTimer = init.behaviorTimer;
    if (init.behaviorFlag !== undefined) p.behaviorFlag = init.behaviorFlag;
    return p;
  }

  /** Removes a single particle immediately (e.g. a rocket consumed by its own burst, or an ember consumed by the grid it landed on). */
  release(p: Particle): void {
    this.pool.release(p);
  }

  update(dt: number, env: ParticleEnvironment): void {
    this.pool.forEachActive((p) => {
      p.ax = 0;
      p.ay = 0;
      applyGravity(p, env.gravity);
      applyWind(p, env.wind);
      if (env.windField) applyZoneWind(p, env.windField);
      applyDrag(p);

      p.vx += p.ax * dt;
      p.vy += p.ay * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      applyBoundsCollision(p, env.bounds);

      p.age += dt;
    });
    this.pool.releaseIf((p) => p.age >= p.lifespan);
  }

  forEachActive(fn: (p: Particle) => void): void {
    this.pool.forEachActive(fn);
  }
}
