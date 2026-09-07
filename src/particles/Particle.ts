import type { Poolable } from "../core/ObjectPool";
import { EmberBehavior, ParticleKind } from "../core/types";

/**
 * Plain pooled data record. `behavior`/`behaviorTimer`/`behaviorFlag` are
 * general-purpose slots reused differently depending on `kind`/`behavior`:
 * for a ROCKET, `behavior` holds its chosen FireworkPattern until burst; for
 * an EMBER, it holds its EmberBehavior, with `behaviorTimer`/`behaviorFlag`
 * as that behavior's own scratch state (strobe's flicker countdown +
 * visibility, crossette's one-shot split guard). See particles/fireworks.ts.
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
  /** Multiplies global gravity for this particle alone — willow embers use this for their extra droop. */
  gravityScale = 1;

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
    this.gravityScale = 1;
    this.kind = ParticleKind.GENERIC;
    this.behavior = EmberBehavior.NONE;
    this.behaviorTimer = 0;
    this.behaviorFlag = 0;
  }
}
