import type { Poolable } from "../core/ObjectPool";
import { EmberBehavior, ParticleKind } from "../core/types";

/**
 * Plain pooled data record. `kind`/`behavior`/`behaviorTimer`/`behaviorFlag`
 * exist from Step 1 but stay at their neutral defaults until Step 7's
 * fireworks register a behavior handler for them.
 */
export class Particle implements Poolable {
  poolSlot = -1;

  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  ax = 0;
  ay = 0;

  radius = 2;
  colorR = 255;
  colorG = 255;
  colorB = 255;

  age = 0;
  lifespan = 1;

  dragCoef = 0;
  restitution = 0.6;

  kind: number = ParticleKind.GENERIC;
  behavior: number = EmberBehavior.NONE;
  behaviorTimer = 0;
  behaviorFlag = 0;

  reset(): void {
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.ax = 0;
    this.ay = 0;
    this.radius = 2;
    this.colorR = 255;
    this.colorG = 255;
    this.colorB = 255;
    this.age = 0;
    this.lifespan = 1;
    this.dragCoef = 0;
    this.restitution = 0.6;
    this.kind = ParticleKind.GENERIC;
    this.behavior = EmberBehavior.NONE;
    this.behaviorTimer = 0;
    this.behaviorFlag = 0;
  }
}
