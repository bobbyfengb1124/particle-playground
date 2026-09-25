import type { Particle } from "./Particle";
import type { WindField } from "../wind/WindField";

/** Accumulates a constant downward acceleration onto the particle, scaled by its own gravityScale (1 for everything but drooping willow embers). */
export function applyGravity(p: Particle, gravity: number): void {
  p.ay += gravity * p.gravityScale;
}

/** Accumulates a constant horizontal acceleration onto the particle. */
export function applyWind(p: Particle, wind: number): void {
  p.ax += wind;
}

/** Accumulates an acceleration opposing velocity, proportional to speed and the particle's own drag coefficient. */
export function applyDrag(p: Particle): void {
  p.ax -= p.vx * p.dragCoef;
  p.ay -= p.vy * p.dragCoef;
}

/** Accumulates whatever horizontal wind the drawn zones produce at the particle's current position (0 outside every zone). */
export function applyZoneWind(p: Particle, field: WindField): void {
  p.ax += field.atPixel(p.x, p.y);
}
